/**
 * Turning `widgets/` into what Pages serves: one zip per widget, and an index naming them.
 *
 * Two properties matter more than anything else here.
 *
 * *Reproducible*: the same folder must produce the same bytes, because the index publishes a
 * sha256 and Fremkit refuses a download that does not match it. So entries are sorted, the
 * modification time is a fixed one rather than "now", and nothing is compressed — the zip writer
 * is Fremkit's own, which stores. A rebuild of an unchanged widget therefore changes neither its
 * hash nor its URL, and a user who already has it is not offered an update for nothing.
 *
 * *Monotonic*: a version that is published stays published at those bytes. The build reads the
 * index currently on Pages and refuses a widget whose version is not greater than the one it
 * finds, so a pull request cannot replace `1.0.0` with different contents under the same name.
 */

import { createHash } from 'node:crypto'
import { writeZip, type ZipEntry } from './vendor/backup/zip.js'
import type { Kind, Package, ThemePackage, WidgetPackage } from './validate.js'
import { ValidationError, limitsOf } from './validate.js'
import { swatch } from './theme.js'
import { compareSemver } from './semver.js'
import { INDEX_SCHEMA_VERSION, RegistryIndexSchema, type Download, type IndexTheme, type IndexWidget, type RegistryIndex } from './schema.js'

/**
 * The timestamp every entry of every package is stored with.
 *
 * A zip carries an MS-DOS date per entry. "Now" would change the bytes, and therefore the hash,
 * on every rebuild of an unchanged widget. 1980-01-01 is the epoch of that date format, which is
 * as close as the format gets to saying "no time here".
 *
 * **Local, not `Date.UTC`.** The writer reads the date with `getFullYear()`, `getMonth()` and
 * `getDate()` — local getters — so a UTC midnight is 1979-12-31 in Paris and the archive hashes
 * differently there than in CI. Verified: the same folder produced three different sha256 values
 * under `TZ=UTC`, `TZ=Europe/Paris` and `TZ=America/New_York`, and `build` then refused the
 * republish as "already published with different contents". The local constructor makes the DOS
 * fields read 1980-01-01 00:00 in every zone, which is what reproducible has to mean here.
 */
export const FIXED_MTIME = new Date(1980, 0, 1, 0, 0, 0)

/** How many older releases stay downloadable beside the current one. */
export const KEEP_PREVIOUS = 2

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/** The connection types a widget's settings ask the admin for, in first-seen order. */
export function connectionTypesOf(pkg: WidgetPackage): string[] {
  const out: string[] = []
  for (const field of Object.values(pkg.manifest.settingsSchema)) {
    if (field.type !== 'connection' && field.type !== 'connections') continue
    if (field.connectionType && !out.includes(field.connectionType)) out.push(field.connectionType)
  }
  return out
}

export function packageZip(pkg: { files: { name: string; data: Buffer }[] }): Buffer {
  const entries: ZipEntry[] = pkg.files.map((f) => ({ name: f.name, data: f.data }))
  return writeZip(entries, FIXED_MTIME)
}

/** Where a package is published, which is its kind's root and then `<id>-<version>.zip`. */
export function zipName(kind: Kind, id: string, version: string): string {
  return `${kind === 'theme' ? 'themes' : 'widgets'}/${id}-${version}.zip`
}

/** Both roots, or just the widgets — an array is the widgets, for the callers that only have them. */
export type BuildInput = WidgetPackage[] | { widgets: WidgetPackage[]; themes: ThemePackage[] }

export interface BuildOptions {
  /** The name this index goes out under; it ends up in every consent record Fremkit keeps. */
  registry: string
  /** Where the published files will be reachable, e.g. `https://user.github.io/repo`. */
  baseUrl: string
  /** The index currently on Pages, when there is one. */
  previous?: RegistryIndex | null
  /** `generatedAt`, and the `publishedAt` of anything released by this run. */
  now?: Date
  /**
   * Fetches an already-published zip so it can be re-emitted beside the new one. Pages replaces
   * the whole site on every deploy, so a release that is not written again stops existing.
   */
  fetchPublished?: (url: string) => Promise<Buffer>
}

export interface BuildResult {
  index: RegistryIndex
  /** Published path → bytes. `index.json` and the zips; the CLI writes them out. */
  files: Map<string, Buffer>
  /** One line per package, for the workflow log. */
  log: string[]
}

/** Everything one release of one package needs, whatever its kind. */
interface Release {
  path: string
  zip: Buffer
  sha256: string
  size: number
  url: string
  publishedAt: string
  previous: Download[]
}

/** What the index already says about a package, in the shape both kinds have in common. */
interface Published {
  version: string
  url: string
  sha256: string
  size: number
  publishedAt: string
  previous: Download[]
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/**
 * Packs one package and works out where it sits in the series already published.
 *
 * Everything in here is the same for both kinds: hash the bytes, refuse a version that went
 * backwards or a republish of the same version with different contents, keep the day the release
 * first went out, and carry the last releases forward so a rollback stays downloadable. What
 * differs between a widget and a theme is only what goes *into* the index entry.
 */
async function release(
  pkg: Package,
  before: Published | undefined,
  opts: BuildOptions,
  now: Date,
  files: Map<string, Buffer>,
  log: string[],
): Promise<Release> {
  const limits = limitsOf(pkg.kind)
  const zip = packageZip(pkg)
  // The unpacked ceiling is checked while reading the folder; this is the one the user's
  // connection pays, and the only place the packed size is known.
  if (zip.byteLength > limits.maxCompressedBytes) {
    throw new ValidationError(pkg.id, `the package is ${zip.byteLength} bytes, over the ${limits.maxCompressedBytes} allowed`)
  }
  const hash = sha256(zip)
  const version = pkg.version
  const path = zipName(pkg.kind, pkg.id, version)

  if (before) {
    const order = compareSemver(version, before.version)
    if (order < 0) throw new ValidationError(pkg.id, `version ${version} is older than the published ${before.version}`)
    if (order === 0 && hash !== before.sha256) {
      throw new ValidationError(pkg.id, `version ${version} is already published with different contents — bump the version`)
    }
  }

  // A republish of the same version keeps the day it first went out: `publishedAt` is when the
  // release happened, not when the workflow last ran.
  const publishedAt = before && compareSemver(version, before.version) === 0 ? before.publishedAt : now.toISOString()

  /** The releases to keep downloadable beside this one: the previous current, then its own. */
  const carried: Download[] = []
  if (before && compareSemver(version, before.version) > 0) {
    carried.push({ version: before.version, url: before.url, sha256: before.sha256, size: before.size })
  }
  for (const old of before?.previous ?? []) {
    if (carried.length >= KEEP_PREVIOUS) break
    if (old.version === version || carried.some((c) => c.version === old.version)) continue
    carried.push(old)
  }
  const kept = carried.slice(0, KEEP_PREVIOUS)

  files.set(path, zip)
  for (const old of kept) {
    if (!opts.fetchPublished) continue
    try {
      const bytes = await opts.fetchPublished(old.url)
      // Never re-publish under a hash the index does not claim: a rollback that installed
      // something other than what it promised would be worse than no rollback at all.
      if (sha256(bytes) !== old.sha256) { log.push(`${pkg.id}: dropping ${old.version}, its bytes no longer match the index`); continue }
      files.set(zipName(pkg.kind, pkg.id, old.version), bytes)
    } catch {
      log.push(`${pkg.id}: could not carry ${old.version} forward, it will stop being downloadable`)
    }
  }

  log.push(`${pkg.kind} ${pkg.id} ${version} — ${zip.byteLength} bytes, ${pkg.files.length} files, sha256 ${hash.slice(0, 12)}…`)
  return {
    path,
    zip,
    sha256: hash,
    size: zip.byteLength,
    url: joinUrl(opts.baseUrl, path),
    publishedAt,
    previous: kept.filter((old) => files.has(zipName(pkg.kind, pkg.id, old.version))),
  }
}

export async function build(packages: BuildInput, opts: BuildOptions): Promise<BuildResult> {
  const now = opts.now ?? new Date()
  const input = Array.isArray(packages) ? { widgets: packages, themes: [] as ThemePackage[] } : packages
  const publishedWidgets = new Map((opts.previous?.widgets ?? []).map((w) => [w.id, w]))
  const publishedThemes = new Map((opts.previous?.themes ?? []).map((t) => [t.id, t]))
  const files = new Map<string, Buffer>()
  const log: string[] = []
  const widgets: IndexWidget[] = []
  const themes: IndexTheme[] = []

  for (const pkg of input.widgets) {
    const out = await release(pkg, publishedWidgets.get(pkg.id), opts, now, files, log)
    widgets.push({
      id: pkg.id,
      version: pkg.version,
      sdk: pkg.manifest.sdk,
      name: pkg.manifest.name,
      description: pkg.manifest.description,
      icon: pkg.manifest.icon,
      // Already `other` when the manifest named none: the vendored schema defaults it.
      category: pkg.manifest.category,
      ...(pkg.manifest.author ? { author: pkg.manifest.author } : {}),
      ...(pkg.manifest.license ? { license: pkg.manifest.license } : {}),
      ...(pkg.manifest.homepage ? { homepage: pkg.manifest.homepage } : {}),
      permissions: {
        subscriptions: pkg.manifest.subscriptions,
        commands: pkg.manifest.commands,
        network: pkg.manifest.permissions.network,
      },
      connections: connectionTypesOf(pkg),
      size: out.size,
      sha256: out.sha256,
      url: out.url,
      publishedAt: out.publishedAt,
      previous: out.previous,
    })
  }

  for (const pkg of input.themes) {
    const out = await release(pkg, publishedThemes.get(pkg.id), opts, now, files, log)
    themes.push({
      id: pkg.id,
      version: pkg.version,
      name: pkg.theme.name,
      description: pkg.theme.description,
      ...(pkg.theme.author ? { author: pkg.theme.author } : {}),
      ...(pkg.theme.license ? { license: pkg.theme.license } : {}),
      ...(pkg.theme.homepage ? { homepage: pkg.theme.homepage } : {}),
      // The four the admin paints as a swatch strip, so a card needs no preview image.
      tokens: swatch(pkg.theme),
      size: out.size,
      sha256: out.sha256,
      url: out.url,
      publishedAt: out.publishedAt,
      previous: out.previous,
    })
  }

  // Every URL this index names must be on the origin it was built against. Fremkit refuses one
  // that is not, so publishing one would be publishing something nobody can install.
  for (const url of [...widgets, ...themes].flatMap((e) => [e.url, ...e.previous.map((p) => p.url)])) {
    if (!url.startsWith(joinUrl(opts.baseUrl, ''))) throw new Error(`the generated index names a URL off its own origin: ${url}`)
  }

  const index: RegistryIndex = {
    registry: opts.registry,
    generatedAt: now.toISOString(),
    schema: INDEX_SCHEMA_VERSION,
    widgets,
    themes,
  }
  // The registry validates its own output: a shape Fremkit would refuse must never be deployed,
  // because by then the only thing the user sees is "the registry is unreachable".
  const checked = RegistryIndexSchema.safeParse(index)
  if (!checked.success) {
    throw new Error('the generated index does not validate: ' + checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  }
  files.set('index.json', Buffer.from(JSON.stringify(checked.data, null, 2) + '\n', 'utf8'))
  return { index: checked.data, files, log }
}
