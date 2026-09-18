/**
 * `pnpm validate` and `pnpm build`, which is everything the two workflows run.
 *
 * `validate` is what a pull request gets: every rule, nothing written, nothing deployed. `build`
 * is the same plus the output — the same code path, so a pull request that passes cannot fail on
 * merge for a reason the author could have been told about.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from './build.js'
import { renderPage } from './page.js'
import { readAllPackages } from './validate.js'
import { DEFAULT_BASE_URL, readPublishedIndex } from './published.js'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const WIDGETS_DIR = join(root, 'widgets')
const DIST_DIR = join(root, 'dist')

/** Who this index says it is, and where its files will live. Both are this repository's identity. */
const REGISTRY_NAME = 'fremkit-sietch'
/**
 * The origin the published URLs are written against.
 *
 * `FREMKIT_REGISTRY_BASE` overrides it so the whole chain can be exercised before anything is
 * published: build against `http://127.0.0.1:8080`, serve `dist/`, and point a development
 * Fremkit at it with `FREMKIT_DEV=1 FREMKIT_REGISTRY_URL=…`. The index carries absolute URLs, so
 * without this the zips would be advertised on the Pages origin a local `dist/` is not on.
 */
const BASE_URL = process.env.FREMKIT_REGISTRY_BASE || DEFAULT_BASE_URL

async function fetchPublished(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'validate'
  if (command !== 'build' && command !== 'validate') {
    console.error(`usage: cli.ts [validate|build]`)
    process.exit(2)
  }

  const packages = await readAllPackages(WIDGETS_DIR)
  console.log(`${packages.length} widget folder(s) validated`)

  // Only a 404 is survivable; see published.ts. Everything the build refuses to do twice rests
  // on this answer, so "unknown" must fail the run rather than pass as "nothing published yet".
  const previous = await readPublishedIndex(BASE_URL)
  if (previous === null) console.log('no index published yet: nothing to check this build against')
  const result = await build(packages, {
    registry: REGISTRY_NAME,
    baseUrl: BASE_URL,
    previous,
    ...(command === 'build' ? { fetchPublished } : {}),
  })
  for (const line of result.log) console.log(line)

  if (command === 'validate') {
    console.log('validate: nothing written')
    return
  }

  await rm(DIST_DIR, { recursive: true, force: true })
  for (const [path, data] of result.files) {
    const full = join(DIST_DIR, path)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, data)
  }
  await writeFile(join(DIST_DIR, 'index.html'), renderPage(result.index), 'utf8')
  // Pages serves what it is given; Jekyll would otherwise drop anything starting with an
  // underscore and rewrite the rest.
  await writeFile(join(DIST_DIR, '.nojekyll'), '')
  console.log(`build: ${result.files.size + 2} file(s) in dist/`)
}

main().catch((err: Error) => {
  console.error(err.message)
  process.exit(1)
})
