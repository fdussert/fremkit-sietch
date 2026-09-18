import { describe, expect, it } from 'vitest'
import { build, connectionTypesOf, packageZip, sha256, zipName } from '../build.js'
import { readZip } from '../vendor/backup/zip.js'
import { ManifestSchema } from '../vendor/widgets/manifest.js'
import { RegistryIndexSchema, type RegistryIndex } from '../schema.js'
import { renderPage } from '../page.js'
import type { WidgetPackage } from '../validate.js'

const BASE = 'https://example.github.io/fremkit-sietch'
const NOW = new Date('2026-09-18T12:00:00.000Z')

function pkg(over: Record<string, unknown> = {}, files?: { name: string; data: Buffer }[]): WidgetPackage {
  const manifest = ManifestSchema.parse({
    id: 'demo', name: { fr: 'Démo', en: 'Demo' }, description: { fr: 'D', en: 'D' },
    version: '1.0.0', sdk: 1, minSize: [8, 4], defaultSize: [8, 4], ...over,
  })
  return {
    kind: 'widget' as const,
    id: manifest.id,
    version: manifest.version,
    manifest,
    files: files ?? [
      { name: 'index.html', data: Buffer.from('<html></html>') },
      { name: 'manifest.json', data: Buffer.from('{}') },
    ],
  }
}

const opts = { registry: 'fremkit-sietch', baseUrl: BASE, now: NOW }

describe('packageZip', () => {
  /** The DOS date and time words the writer put in the first local header. */
  function dosStamp(zip: Buffer): { date: number; time: number } {
    return { time: zip.readUInt16LE(10), date: zip.readUInt16LE(12) }
  }

  it('stamps 1980-01-01 00:00 whatever the machine\'s timezone is', () => {
    // The writer builds the DOS date from *local* getters. A `Date.UTC(1980,0,1)` is 1979-12-31
    // in Paris, so the same folder hashed differently there than in CI — and `build` then
    // refused the republish as "already published with different contents".
    // 1980-01-01 is ((1980-1980) << 9) | (1 << 5) | 1 = 33, at time 0.
    expect(dosStamp(packageZip(pkg()))).toEqual({ date: 33, time: 0 })
  })

  it('produces the same bytes for the same folder, every time', () => {
    // The index publishes a sha256 and Fremkit refuses a download that does not match it. A
    // timestamp of "now" in the archive would change the hash on every rebuild, and every user
    // would be offered an update to a widget that had not changed.
    const a = packageZip(pkg())
    const b = packageZip(pkg())
    expect(a.equals(b)).toBe(true)
  })
  it('round-trips through the reader Fremkit unpacks it with', () => {
    const entries = readZip(packageZip(pkg()))
    expect(entries.map((e) => e.name)).toEqual(['index.html', 'manifest.json'])
    expect(entries[0].data.toString()).toBe('<html></html>')
  })
})

describe('connectionTypesOf', () => {
  it('lists the connection types the settings ask for, once each, in order', () => {
    const p = pkg({
      settingsSchema: {
        nas: { type: 'connection', label: 'NAS', connectionType: 'synology' },
        more: { type: 'connections', label: 'More', connectionType: 'synology' },
        gh: { type: 'connection', label: 'GitHub', connectionType: 'github' },
        plain: { type: 'string', label: 'Title' },
      },
    })
    expect(connectionTypesOf(p)).toEqual(['synology', 'github'])
  })
  it('is empty when a widget needs no connection', () => {
    expect(connectionTypesOf(pkg())).toEqual([])
  })
})

describe('build', () => {
  it('writes an index Fremkit validates, and one zip per widget', async () => {
    const result = await build([pkg()], opts)
    expect(RegistryIndexSchema.safeParse(result.index).success).toBe(true)
    expect(result.index.registry).toBe('fremkit-sietch')
    expect(result.index.schema).toBe(1)
    expect(result.index.generatedAt).toBe(NOW.toISOString())
    const w = result.index.widgets[0]
    expect(w.url).toBe(`${BASE}/widgets/demo-1.0.0.zip`)
    expect(w.publishedAt).toBe(NOW.toISOString())
    expect(w.previous).toEqual([])
    expect([...result.files.keys()].sort()).toEqual(['index.json', 'widgets/demo-1.0.0.zip'])
    expect(w.sha256).toBe(sha256(result.files.get('widgets/demo-1.0.0.zip')!))
    expect(w.size).toBe(result.files.get('widgets/demo-1.0.0.zip')!.byteLength)
  })

  it('copies the permissions out of the manifest so the admin can show them before downloading', async () => {
    const result = await build([pkg({
      subscriptions: ['synology:*'], commands: ['synology'],
      permissions: { network: ['api.example.com'] },
      settingsSchema: { nas: { type: 'connection', label: 'NAS', connectionType: 'synology' } },
    })], opts)
    expect(result.index.widgets[0].permissions).toEqual({
      subscriptions: ['synology:*'], commands: ['synology'], network: ['api.example.com'],
    })
    expect(result.index.widgets[0].connections).toEqual(['synology'])
  })

  it('carries the author, licence and homepage through, and omits them when absent', async () => {
    const withMeta = await build([pkg({ author: 'A. Author', license: 'MIT', homepage: 'https://example.com/w' })], opts)
    expect(withMeta.index.widgets[0]).toMatchObject({ author: 'A. Author', license: 'MIT', homepage: 'https://example.com/w' })
    const without = await build([pkg()], opts)
    expect(without.index.widgets[0]).not.toHaveProperty('author')
    expect(without.index.widgets[0]).not.toHaveProperty('homepage')
  })

  async function publishedOnce(): Promise<RegistryIndex> {
    return (await build([pkg()], opts)).index
  }

  it('refuses a version older than the published one', async () => {
    const previous = await publishedOnce()
    await expect(build([pkg({ version: '0.9.0' })], { ...opts, previous }))
      .rejects.toThrow(/older than the published 1.0.0/)
  })

  it('refuses the same version republished with different contents', async () => {
    const previous = await publishedOnce()
    const changed = pkg({}, [{ name: 'index.html', data: Buffer.from('<html>different</html>') }])
    await expect(build([changed], { ...opts, previous }))
      .rejects.toThrow(/already published with different contents/)
  })

  it('lets an unchanged widget be rebuilt, keeping the day it first went out', async () => {
    const previous = await publishedOnce()
    const later = new Date('2026-12-01T00:00:00.000Z')
    const again = await build([pkg()], { ...opts, previous, now: later })
    expect(again.index.widgets[0].publishedAt).toBe(NOW.toISOString())
    expect(again.index.widgets[0].sha256).toBe(previous.widgets[0].sha256)
    expect(again.index.generatedAt).toBe(later.toISOString())
  })

  it('keeps the previous release downloadable by writing its bytes out again', async () => {
    // Pages replaces the whole site on every deploy, so a release that is not written again
    // stops existing — and a rollback would 404.
    const previous = await publishedOnce()
    const oldBytes = packageZip(pkg())
    const fetched: string[] = []
    const next = await build([pkg({ version: '1.1.0' })], {
      ...opts,
      previous,
      fetchPublished: async (url) => { fetched.push(url); return oldBytes },
    })
    expect(fetched).toEqual([`${BASE}/widgets/demo-1.0.0.zip`])
    expect([...next.files.keys()].sort()).toEqual(['index.json', 'widgets/demo-1.0.0.zip', 'widgets/demo-1.1.0.zip'])
    expect(next.index.widgets[0].previous).toEqual([
      { version: '1.0.0', url: `${BASE}/widgets/demo-1.0.0.zip`, sha256: previous.widgets[0].sha256, size: previous.widgets[0].size },
    ])
  })

  it('drops an older release rather than republish bytes the index does not claim', async () => {
    const previous = await publishedOnce()
    const next = await build([pkg({ version: '1.1.0' })], {
      ...opts, previous, fetchPublished: async () => Buffer.from('not the widget'),
    })
    expect(next.index.widgets[0].previous).toEqual([])
    expect(next.files.has('widgets/demo-1.0.0.zip')).toBe(false)
    expect(next.log.join('\n')).toMatch(/no longer match the index/)
  })

  it('drops an older release the fetch could not reach, and says so', async () => {
    const previous = await publishedOnce()
    const next = await build([pkg({ version: '1.1.0' })], {
      ...opts, previous, fetchPublished: async () => { throw new Error('HTTP 404') },
    })
    expect(next.index.widgets[0].previous).toEqual([])
    expect(next.log.join('\n')).toMatch(/could not carry 1.0.0 forward/)
  })

  it('never keeps more than the last two older releases', async () => {
    let previous: RegistryIndex | null = null
    const bytes = new Map<string, Buffer>()
    for (const version of ['1.0.0', '1.1.0', '1.2.0', '1.3.0']) {
      const p = pkg({ version })
      bytes.set(zipName('widget', 'demo', version), packageZip(p))
      const out: { index: RegistryIndex } = await build([p], {
        ...opts, previous, fetchPublished: async (url) => bytes.get(`widgets/${url.split('/').pop()}`)!,
      })
      previous = out.index
    }
    expect(previous!.widgets[0].version).toBe('1.3.0')
    expect(previous!.widgets[0].previous.map((d) => d.version)).toEqual(['1.2.0', '1.1.0'])
  })

  it('refuses a package over the download ceiling', async () => {
    const big = pkg({}, [
      { name: 'index.html', data: Buffer.from('<html></html>') },
      { name: 'big.bin', data: Buffer.alloc(6 * 1024 * 1024) },
    ])
    await expect(build([big], opts)).rejects.toThrow(/over the/)
  })

  it('builds an empty index when nothing is published yet', async () => {
    const result = await build([], opts)
    expect(result.index.widgets).toEqual([])
    expect([...result.files.keys()]).toEqual(['index.json'])
  })
})

describe('renderPage', () => {
  it('escapes everything it takes from a manifest', async () => {
    const result = await build([pkg({ name: { en: '<img src=x onerror=alert(1)>' }, author: '"><script>' })], opts)
    const html = renderPage(result.index)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('"><script>')
  })
  it('says so when the registry is empty', async () => {
    expect(renderPage((await build([], opts)).index)).toContain('No widget published yet')
  })
})
