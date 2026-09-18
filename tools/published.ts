/**
 * Reading the index that is already on Pages.
 *
 * Its own module so the tests can reach it. Everything the build refuses to do twice depends on
 * this answer: "a version only ever goes up", "the same version is the same bytes", and carrying
 * the last releases forward so a rollback stays downloadable.
 *
 * Which is why only one failure is survivable. A **404** is the first deploy — there is no index
 * yet, and there is nothing to check against. Anything else — a 500, a timeout, a DNS failure,
 * an index that does not validate — means the answer is *unknown*, and a build that treated
 * unknown as "nothing published" would happily let a version go backwards and would unpublish
 * every carried-forward release on the way. It throws, and the run fails loudly.
 */

import { RegistryIndexSchema, type RegistryIndex } from './schema.js'

/** The default origin: GitHub Pages for this repository. */
export const DEFAULT_BASE_URL = 'https://fdussert.github.io/fremkit-sietch'

/**
 * Whether a run built against this base may survive an index it could not read.
 *
 * It changes exactly one thing, and only ever in one direction: on the published origin
 * "unknown" has to fail the run, because every check the build refuses to do twice rests on that
 * answer. A development origin — a local `dist/` served over HTTP — has to be *built* before it
 * can be served, so its first pass has nothing to read and nothing published to protect.
 *
 * The argument is the raw `FREMKIT_REGISTRY_BASE`, not the resolved base: naming the real origin
 * explicitly is still the real origin, and must not buy the tolerance.
 */
export function toleratesMissingIndex(configuredBase: string | undefined): boolean {
  return Boolean(configuredBase) && configuredBase !== DEFAULT_BASE_URL
}

const INDEX_TIMEOUT_MS = 20_000

export class PublishedIndexError extends Error {
  constructor(message: string) {
    super(`could not read the published index: ${message}`)
    this.name = 'PublishedIndexError'
  }
}

/** `<base>/index.json`, with however many trailing slashes the base happened to carry. */
export function indexUrl(base: string): string {
  return `${base.replace(/\/+$/, '')}/index.json`
}

export type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<Response>

/**
 * The published index, or `null` when there is demonstrably none.
 *
 * Throws `PublishedIndexError` on anything that is not a clean 404 or a valid index.
 */
export async function readPublishedIndex(base: string, doFetch: Fetcher = fetch): Promise<RegistryIndex | null> {
  const url = indexUrl(base)
  let res: Response
  try {
    res = await doFetch(url, { signal: AbortSignal.timeout(INDEX_TIMEOUT_MS) })
  } catch (err) {
    throw new PublishedIndexError((err as Error).message || 'the request failed')
  }
  // The only innocent failure: nothing has been deployed yet.
  if (res.status === 404) return null
  if (!res.ok) throw new PublishedIndexError(`HTTP ${res.status}`)
  let json: unknown
  try { json = await res.json() }
  catch { throw new PublishedIndexError('it is not JSON') }
  const parsed = RegistryIndexSchema.safeParse(json)
  if (!parsed.success) throw new PublishedIndexError('it does not validate against the current schema')
  return parsed.data
}
