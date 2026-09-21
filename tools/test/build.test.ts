import { describe, expect, it } from 'vitest'
import { build, connectionTypesOf, packageZip, sha256, zipName } from '../build.js'
import { readZip } from '../vendor/backup/zip.js'
import { ManifestSchema } from '../vendor/widgets/manifest.js'
import { RegistryIndexSchema, type RegistryIndex } from '../schema.js'
import { renderPage } from '../page.js'
import type { WidgetPackage } from '../validate.js'

const BASE = 'https://example.github.io/fremkit-sietch'
const NOW = new Date('2026-09-18T12:00:00.000Z')

/**
 * A package. Its changelog documents its own version by default, because a version with no
 * entry is refused — that rule has its own tests further down.
 */
function pkg(
  over: Record<string, unknown> = {},
  files?: { name: string; data: Buffer }[],
  changelog?: { version: string; text: string }[],
): WidgetPackage {
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
    changelog: changelog ?? [{ version: manifest.version, text: 'What this version changed.' }],
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
      {
        version: '1.0.0', url: `${BASE}/widgets/demo-1.0.0.zip`,
        sha256: previous.widgets[0].sha256, size: previous.widgets[0].size,
        // The entry 1.0.0 went out with, kept so the history does not go blank on an update.
        changes: 'What this version changed.',
      },
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

describe('the category an entry carries', () => {
  it('copies what the manifest names', async () => {
    const result = await build([pkg({ category: 'home' })], opts)
    expect(result.index.widgets[0].category).toBe('home')
  })

  it('publishes `other` for a manifest that names none', async () => {
    // The vendored schema defaults it, so this is really asserting that the default survives the
    // trip into the index rather than being dropped as an absent key.
    const result = await build([pkg()], opts)
    expect(result.index.widgets[0].category).toBe('other')
    expect(RegistryIndexSchema.parse(JSON.parse(result.files.get('index.json')!.toString())).widgets[0].category).toBe('other')
  })

  it('reads an index published before categories existed', () => {
    // An older `index.json` has no `category` at all; it must parse, not be refused whole.
    const older = {
      registry: 'fremkit-sietch', generatedAt: '2026-09-18T12:00:00.000Z', schema: 1,
      widgets: [{
        id: 'demo', version: '1.0.0', sdk: 1, name: 'Demo', description: 'D', icon: 'layout-grid',
        permissions: { subscriptions: [], commands: [], network: [] }, connections: [],
        size: 10, sha256: 'a'.repeat(64), url: `${BASE}/widgets/demo-1.0.0.zip`,
        publishedAt: '2026-09-18T12:00:00.000Z', previous: [],
      }],
    }
    expect(RegistryIndexSchema.parse(older).widgets[0].category).toBe('other')
  })
})

describe('renderPage', () => {
  it('shelves the widgets by category, in the library\'s order, skipping the empty ones', async () => {
    const result = await build([
      pkg({ id: 'nas', category: 'home' }),
      pkg({ id: 'runs', category: 'dev' }),
      pkg({ id: 'plain' }),
    ], opts)
    const html = renderPage(result.index)
    const headings = [...html.matchAll(/<h1 class="section">([^<]+)<\/h1>/g)].map((m) => m[1])
    // `WIDGET_CATEGORIES` order, not the order the folders were read in, and no empty shelf.
    expect(headings).toEqual(['Development', 'Home', 'Other', 'Themes'])
    expect(html.indexOf('runs')).toBeLessThan(html.indexOf('nas'))
  })


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

describe('the changelog a release must carry', () => {
  it('refuses a new version with no entry, naming the version', async () => {
    // A release nobody described is a release the person updating cannot judge.
    await expect(build([pkg({}, undefined, [])], opts))
      .rejects.toThrow(/CHANGELOG\.md has no entry for 1\.0\.0/)
  })

  it('refuses an entry written for another version', async () => {
    await expect(build([pkg({}, undefined, [{ version: '0.9.0', text: 'old news' }])], opts))
      .rejects.toThrow(/no entry for 1\.0\.0/)
  })

  it('refuses a heading with nothing under it', async () => {
    await expect(build([pkg({}, undefined, [{ version: '1.0.0', text: '' }])], opts))
      .rejects.toThrow(/no entry for 1\.0\.0/)
  })

  it('writes the entry into the index', async () => {
    const result = await build([pkg({}, undefined, [{ version: '1.0.0', text: 'Initial release.' }])], opts)
    expect(result.index.widgets[0].changes).toBe('Initial release.')
  })

  it('asks nothing of a version that is already published', async () => {
    // Its bytes are frozen and the entry it went out with is already in the index; a republish
    // of the same version is not a release.
    const first = await build([pkg()], opts)
    const again = await build([pkg({}, undefined, [])], { ...opts, previous: first.index })
    expect(again.index.widgets[0].changes).toBe('What this version changed.')
  })

  it('lets a package document a past release without being repacked', async () => {
    // The bytes of 1.0.0 are frozen on Pages; the folder is the only place an author can write
    // down what it changed, and `build` matches it by version.
    const first = await build([pkg({}, undefined, [{ version: '1.0.0', text: 'First.' }])], opts)
    const second = await build(
      [pkg({ version: '1.1.0' }, undefined, [
        { version: '1.1.0', text: 'Second.' },
        { version: '1.0.0', text: 'First, written down later.' },
      ])],
      { ...opts, previous: first.index, fetchPublished: async () => first.files.get('widgets/demo-1.0.0.zip')! },
    )
    expect(second.index.widgets[0].changes).toBe('Second.')
    expect(second.index.widgets[0].previous[0].changes).toBe('First, written down later.')
  })

  it('carries an older entry forward from the published index', async () => {
    // The package for 1.0.0 is not in the checkout any more, so the index is where its entry
    // lives. Losing it on every update would make the history blank after one release.
    const first = await build([pkg({}, undefined, [{ version: '1.0.0', text: 'First.' }])], opts)
    const second = await build(
      [pkg({ version: '1.1.0' }, undefined, [{ version: '1.1.0', text: 'Second.' }])],
      { ...opts, previous: first.index, fetchPublished: async () => first.files.get('widgets/demo-1.0.0.zip')! },
    )
    expect(second.index.widgets[0].previous[0]).toMatchObject({ version: '1.0.0', changes: 'First.' })
  })

  it('reads an index published before changelogs existed', async () => {
    // Optional in the schema for exactly this: the first build after the feature lands has a
    // `previous` with no `changes` anywhere in it.
    const first = await build([pkg()], opts)
    const older = {
      ...first.index,
      widgets: first.index.widgets.map((w) => { const { changes, ...rest } = w; return rest }),
    }
    const second = await build(
      [pkg({ version: '1.1.0' }, undefined, [{ version: '1.1.0', text: 'Second.' }])],
      { ...opts, previous: RegistryIndexSchema.parse(older), fetchPublished: async () => first.files.get('widgets/demo-1.0.0.zip')! },
    )
    expect(second.index.widgets[0].changes).toBe('Second.')
    expect(second.index.widgets[0].previous[0].changes).toBeUndefined()
  })
})

describe('the page', () => {
  it('shows what the latest version changed, under the card', async () => {
    const result = await build([pkg({}, undefined, [{ version: '1.0.0', text: 'Added a thing.' }])], opts)
    expect(renderPage(result.index)).toContain('Added a thing.')
  })

  it('escapes it like everything else an author wrote', async () => {
    // It is plain text by the time it gets here, but this page is published under the owner's
    // origin and the entry came from a pull request.
    const result = await build([pkg({}, undefined, [{ version: '1.0.0', text: '<img src=x onerror=alert(1)>' }])], opts)
    const html = renderPage(result.index)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('leaves the card alone when a published version documented nothing', async () => {
    const first = await build([pkg()], opts)
    const older = {
      ...first.index,
      widgets: first.index.widgets.map((w) => { const { changes, ...rest } = w; return rest }),
    }
    expect(renderPage(RegistryIndexSchema.parse(older))).not.toContain('class="changes"')
  })
})

describe('a changelog is not part of the package', () => {
  it('leaves the bytes of a version alone when its entry is written', async () => {
    // The rule everything here rests on is "the same version is the same bytes". Were the file
    // inside the archive, documenting a release already published would break it — and the
    // whole point is that an author can write down the history of a package long after it went
    // out, without repacking any of it.
    const bare = await build([pkg({}, [
      { name: 'index.html', data: Buffer.from('<html></html>') },
      { name: 'manifest.json', data: Buffer.from('{}') },
    ])], opts)
    const withLog = await build([pkg({}, [
      { name: 'CHANGELOG.md', data: Buffer.from('## 1.0.0\n\n- Written down later.\n') },
      { name: 'index.html', data: Buffer.from('<html></html>') },
      { name: 'manifest.json', data: Buffer.from('{}') },
    ])], opts)

    expect(withLog.index.widgets[0].sha256).toBe(bare.index.widgets[0].sha256)
    expect(withLog.index.widgets[0].size).toBe(bare.index.widgets[0].size)
  })

  it('is absent from the archive that is published', async () => {
    const result = await build([pkg({}, [
      { name: 'CHANGELOG.md', data: Buffer.from('## 1.0.0\n\n- A thing.\n') },
      { name: 'index.html', data: Buffer.from('<html></html>') },
      { name: 'manifest.json', data: Buffer.from('{}') },
    ])], opts)
    const names = readZip(result.files.get('widgets/demo-1.0.0.zip')!).map((e) => e.name)
    expect(names).toEqual(['index.html', 'manifest.json'])
  })
})
