/**
 * What a widget folder must be to get into the index.
 *
 * These rules exist twice on purpose: here, so an author learns at pull-request time, and in
 * Fremkit's installer, so a user is protected whatever a registry — this one, a fork, a
 * compromised Pages deployment — chose to publish. The installer is the one that matters; this
 * is the one that is kind. Neither is allowed to trust the other.
 *
 * Everything below is a property of the *package*, not of the widget's behaviour: nothing here
 * runs a widget, and nothing here can tell whether the code inside does what it says. That is
 * what the human review in CONTRIBUTING is for.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { ManifestSchema, type WidgetManifest } from './vendor/widgets/manifest.js'
import { isPrivateLiteral } from './vendor/net/private.js'

/** A package is small: these are ceilings, not budgets, and nothing here is near them. */
export const LIMITS = {
  maxFiles: 200,
  /** The zip, as downloaded. */
  maxCompressedBytes: 5 * 1024 * 1024,
  /** Everything the zip unpacks to, which is what a disk actually pays. */
  maxUncompressedBytes: 20 * 1024 * 1024,
  maxFileBytes: 5 * 1024 * 1024,
} as const

/** One file of a package: the path it is stored under, and its bytes. */
export interface PackageFile { name: string; data: Buffer }

export interface WidgetPackage {
  id: string
  manifest: WidgetManifest
  /** Sorted by name, so the zip built from them is byte-identical from one run to the next. */
  files: PackageFile[]
}

export class ValidationError extends Error {
  constructor(readonly id: string, message: string) {
    super(`${id}: ${message}`)
    this.name = 'ValidationError'
  }
}

/**
 * Names a package may not carry, whatever the filesystem it was built on allows.
 *
 * A dotfile is the author's tooling, never the widget's: `.git`, `.DS_Store`, an `.env` that
 * should never have existed. An absolute or climbing path is an attempt to write outside the
 * widget's folder when it is unpacked. A backslash is the same attempt spelled for Windows,
 * where it is a separator and here it would not be. A nested archive is a payload nothing in
 * the chain looks inside.
 */
const FORBIDDEN_SUFFIX = ['.zip', '.gz', '.tgz', '.tar', '.7z', '.rar', '.xz', '.bz2']

export function checkEntryName(id: string, name: string): void {
  if (name === '') throw new ValidationError(id, 'an entry has no name')
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw new ValidationError(id, `absolute path: ${name}`)
  if (name.includes('\\')) throw new ValidationError(id, `backslash in a path: ${name}`)
  if (name.includes('\0')) throw new ValidationError(id, 'a path holds a null byte')
  const parts = name.split('/')
  if (parts.some((p) => p === '..' || p === '.')) throw new ValidationError(id, `path escapes the folder: ${name}`)
  if (parts.some((p) => p.startsWith('.'))) throw new ValidationError(id, `dotfile: ${name}`)
  const lower = name.toLowerCase()
  if (FORBIDDEN_SUFFIX.some((s) => lower.endsWith(s))) throw new ValidationError(id, `nested archive: ${name}`)
}

/**
 * Names that only ever mean "this machine or this LAN".
 *
 * Fremkit judges a *name* by resolving it, at request time, in `resolvesToPrivate` — which is
 * the only correct place, since a name can be pointed anywhere after publication. The registry
 * cannot resolve anything meaningfully (it runs on a GitHub runner, on the wrong network, and
 * the answer would be stale by the time anyone installed the widget), but these few names have
 * no other reading, and a widget declaring one is broken for every user. Refusing it here tells
 * the author instead of shipping something that will only ever fail.
 */
const LOCAL_SUFFIX = ['.localhost', '.local', '.internal', '.home.arpa', '.lan']

export function isLocalName(host: string): boolean {
  const lower = host.toLowerCase().replace(/\.$/, '')
  return lower === 'localhost' || LOCAL_SUFFIX.some((s) => lower.endsWith(s))
}

/**
 * `<script src=` pointing anywhere but at the package itself.
 *
 * The widget CSP is `script-src 'self'`, so the browser would refuse to load it and the widget
 * would simply be broken. Refusing it here is not defence — it is telling the author now rather
 * than letting a user install something that silently does nothing.
 */
const SCRIPT_SRC_RE = /<script\b[^>]*\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi

export function offPackageScripts(html: string): string[] {
  const found: string[] = []
  for (const m of html.matchAll(SCRIPT_SRC_RE)) {
    const src = (m[2] ?? m[3] ?? m[4] ?? '').trim()
    if (src === '') continue
    // `/fremkit.js` is the bridge, injected by the server into every widget; an author who
    // writes the tag themselves gets the same one, and it is not off-package.
    if (src === '/fremkit.js') continue
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//') || src.startsWith('/')) found.push(src)
  }
  return found
}

/** Reads one `widgets/<id>/` folder and holds it to every rule above. */
export async function readPackage(root: string, id: string): Promise<WidgetPackage> {
  const folder = join(root, id)
  const files: PackageFile[] = []
  let total = 0

  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      const name = relative(folder, full).split(sep).join('/')
      checkEntryName(id, name)
      // Not `entry.isFile()`: a symlink to a regular file answers false to isDirectory() and
      // would be read through, publishing whatever it points at on the build machine.
      if (entry.isSymbolicLink()) throw new ValidationError(id, `symlink: ${name}`)
      if (entry.isDirectory()) { await walk(full); continue }
      if (!entry.isFile()) throw new ValidationError(id, `not a regular file: ${name}`)
      const size = (await stat(full)).size
      if (size > LIMITS.maxFileBytes) throw new ValidationError(id, `file over ${LIMITS.maxFileBytes} bytes: ${name}`)
      total += size
      files.push({ name, data: await readFile(full) })
    }
  }
  await walk(folder)

  if (files.length > LIMITS.maxFiles) throw new ValidationError(id, `over ${LIMITS.maxFiles} files`)
  if (total > LIMITS.maxUncompressedBytes) throw new ValidationError(id, `over ${LIMITS.maxUncompressedBytes} bytes unpacked`)
  if (!files.some((f) => f.name === 'manifest.json')) throw new ValidationError(id, 'manifest.json is missing')
  if (!files.some((f) => f.name === 'index.html')) throw new ValidationError(id, 'index.html is missing')

  let json: unknown
  try { json = JSON.parse(files.find((f) => f.name === 'manifest.json')!.data.toString('utf8')) }
  catch { throw new ValidationError(id, 'manifest.json is not valid JSON') }

  const parsed = ManifestSchema.safeParse(json)
  if (!parsed.success) {
    throw new ValidationError(id, 'invalid manifest: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  }
  const manifest = parsed.data
  if (manifest.id !== id) throw new ValidationError(id, `manifest id "${manifest.id}" does not match the folder`)

  // The schema already refuses the literals; saying it again keeps the rule true if the vendored
  // copy ever lags behind, and this is the one rule a widget cannot be published without.
  for (const host of manifest.permissions.network) {
    if (isPrivateLiteral(host) || isLocalName(host)) throw new ValidationError(id, `private or local network host: ${host}`)
  }

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.html')) continue
    const off = offPackageScripts(file.data.toString('utf8'))
    if (off.length) throw new ValidationError(id, `${file.name} loads a script from outside the package: ${off.join(', ')}`)
  }

  files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return { id, manifest, files }
}

/** Every widget folder in `root`, validated, in id order. */
export async function readAllPackages(root: string): Promise<WidgetPackage[]> {
  let ids: string[] = []
  try { ids = await readdir(root) } catch { return [] }
  const packages: WidgetPackage[] = []
  for (const id of ids.sort()) {
    // The folder holds a README of its own explaining what goes in it.
    if (!(await stat(join(root, id))).isDirectory()) continue
    packages.push(await readPackage(root, id))
  }
  return packages
}
