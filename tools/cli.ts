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
import { RegistryIndexSchema, type RegistryIndex } from './schema.js'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const WIDGETS_DIR = join(root, 'widgets')
const DIST_DIR = join(root, 'dist')

/** Who this index says it is, and where its files will live. Both are this repository's identity. */
const REGISTRY_NAME = 'fremkit-widgets'
const BASE_URL = process.env.REGISTRY_BASE_URL || 'https://fdussert.github.io/fremkit-widgets'

/** The index already on Pages, or null on the very first run — and on any failure to read it. */
async function previousIndex(): Promise<RegistryIndex | null> {
  const url = `${BASE_URL.replace(/\/+$/, '')}/index.json`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    // A 404 is the first deploy, not a problem.
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const parsed = RegistryIndexSchema.safeParse(await res.json())
    if (!parsed.success) throw new Error('it does not validate against the current schema')
    return parsed.data
  } catch (err) {
    // Deliberately not fatal, and deliberately loud. Without the previous index the build cannot
    // enforce "a version only goes up" or carry older releases forward, and a run that quietly
    // did neither would unpublish every rollback without anyone noticing.
    console.warn(`warning: could not read the published index (${(err as Error).message}).`)
    console.warn('warning: this run cannot check versions against it or keep older releases downloadable.')
    return null
  }
}

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

  const previous = await previousIndex()
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
