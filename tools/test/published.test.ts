import { describe, expect, it } from 'vitest'
import { DEFAULT_BASE_URL, PublishedIndexError, indexUrl, readPublishedIndex, toleratesMissingIndex } from '../published.js'

const BASE = 'https://example.github.io/fremkit-sietch'
const HASH = 'a'.repeat(64)

function index(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    registry: 'fremkit-sietch', generatedAt: '2026-09-18T12:00:00.000Z', schema: 1,
    widgets: [{
      id: 'demo', version: '1.0.0', sdk: 1, name: 'Demo', description: 'D', icon: 'layout-grid',
      permissions: { subscriptions: [], commands: [], network: [] }, connections: [],
      size: 100, sha256: HASH, url: `${BASE}/widgets/demo-1.0.0.zip`,
      publishedAt: '2026-09-18T12:00:00.000Z', previous: [],
    }],
    ...over,
  }
}

/** A fetch that answers one body once, and records the URL it was asked for. */
function serve(body: string, status = 200): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = []
  const f = async (url: string): Promise<Response> => {
    urls.push(url)
    return new Response(body, { status })
  }
  return { fetch: f as unknown as typeof fetch, urls }
}

describe('indexUrl', () => {
  it('joins the base whatever it ends with', () => {
    expect(indexUrl(BASE)).toBe(`${BASE}/index.json`)
    expect(indexUrl(`${BASE}/`)).toBe(`${BASE}/index.json`)
    expect(indexUrl(`${BASE}///`)).toBe(`${BASE}/index.json`)
    expect(indexUrl('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080/index.json')
  })
})

describe('readPublishedIndex', () => {
  it('reads and validates the published index', async () => {
    const { fetch: doFetch, urls } = serve(JSON.stringify(index()))
    const read = await readPublishedIndex(BASE, doFetch)
    expect(read?.widgets[0].id).toBe('demo')
    expect(urls).toEqual([`${BASE}/index.json`])
  })

  it('answers null on a 404, which is the first deploy', async () => {
    const { fetch: doFetch } = serve('', 404)
    expect(await readPublishedIndex(BASE, doFetch)).toBeNull()
  })

  it('throws on any other status', async () => {
    // Treating a 500 as "nothing published" would let a version go backwards and would
    // unpublish every carried-forward release on the way.
    for (const status of [500, 502, 403, 301]) {
      const { fetch: doFetch } = serve('', status)
      await expect(readPublishedIndex(BASE, doFetch), String(status)).rejects.toThrow(PublishedIndexError)
    }
  })

  it('throws when the request itself fails', async () => {
    const doFetch = (async () => { throw new Error('ENOTFOUND example.github.io') }) as unknown as typeof fetch
    await expect(readPublishedIndex(BASE, doFetch)).rejects.toThrow(/ENOTFOUND/)
  })

  it('throws on a body that is not JSON', async () => {
    const { fetch: doFetch } = serve('<html>404 not really</html>')
    await expect(readPublishedIndex(BASE, doFetch)).rejects.toThrow(/not JSON/)
  })

  it('throws on JSON that is not an index this build understands', async () => {
    for (const body of [
      JSON.stringify(index({ schema: 2 })),
      JSON.stringify(index({ widgets: [{ id: 'demo' }] })),
      JSON.stringify({}),
    ]) {
      const { fetch: doFetch } = serve(body)
      await expect(readPublishedIndex(BASE, doFetch)).rejects.toThrow(/does not validate/)
    }
  })

  it('names the index in every failure, so a CI log says what could not be read', async () => {
    const { fetch: doFetch } = serve('', 500)
    await expect(readPublishedIndex(BASE, doFetch)).rejects.toThrow(/could not read the published index/)
  })
})

describe('toleratesMissingIndex', () => {
  it('never tolerates it on the published origin', () => {
    expect(toleratesMissingIndex(undefined)).toBe(false)
    expect(toleratesMissingIndex('')).toBe(false)
    // Naming the real origin explicitly is still the real origin: the tolerance is about there
    // being nothing published to protect, not about how the base was arrived at.
    expect(toleratesMissingIndex(DEFAULT_BASE_URL)).toBe(false)
  })

  it('tolerates it anywhere else, which is what makes the local chain buildable', () => {
    // `dist/` has to be built before it can be served, so the first pass has nothing to read.
    expect(toleratesMissingIndex('http://127.0.0.1:8080')).toBe(true)
    expect(toleratesMissingIndex('https://example.com/registry')).toBe(true)
  })
})
