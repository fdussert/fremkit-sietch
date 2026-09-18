/**
 * Refuses to let the vendored schema drift from Fremkit's.
 *
 * `tools/vendor/` holds byte-for-byte copies of three files from the main repository (see its
 * README). A copy is the simplest thing that makes this repository build on its own, and the
 * worst thing to leave unattended: a schema that lags behind publishes widgets the Fremkit
 * installer then refuses, and a schema that runs ahead promises authors a field no released
 * Fremkit reads. Either way the person who finds out is a user with a failed install.
 *
 * So both workflows run this. It fetches the upstream files and compares them; a difference
 * fails the run and names the file to copy over.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
/**
 * The Fremkit commit the vendored files were copied from.
 *
 * A commit, not `main`. Comparing against a moving branch means this check starts failing the
 * moment somebody touches the schema upstream — on a pull request that has nothing to do with
 * it, for a reason its author cannot fix here. Pinned, the check answers one question with one
 * answer: are these copies the ones that were taken. Bumping it is part of the commit that
 * copies new files over, and that commit is where the decision belongs.
 */
const VENDOR_REF = '02b2038775fd2f509300681892a3a87b72ba223d'

/**
 * Where the upstream files are read from. The default is the raw view of the pinned commit,
 * which is what CI uses. A local path works too, so the owner can check a Fremkit change against
 * this repository *before* pushing it — which is the only moment the answer can still be acted
 * on cheaply, and the only way to run this at all before the commit exists on GitHub.
 */
const UPSTREAM = process.env.FREMKIT_RAW_BASE || `https://raw.githubusercontent.com/fdussert/fremkit/${VENDOR_REF}`

/** local path under tools/vendor → path under the main repository. */
const COPIES: Record<string, string> = {
  'widgets/manifest.ts': 'server/src/widgets/manifest.ts',
  'net/private.ts': 'server/src/net/private.ts',
  'backup/zip.ts': 'server/src/backup/zip.ts',
}

/**
 * The shims are not copies, so they are checked by what they must agree on rather than by
 * their text: one regular expression, spelled the same way on both sides.
 */
const CONSTANTS: { local: string; upstream: string; name: string }[] = [
  { local: 'config/schema.ts', upstream: 'server/src/config/schema.ts', name: 'WIDGET_ID_RE' },
]

async function upstream(path: string): Promise<string> {
  const base = UPSTREAM.replace(/\/+$/, '')
  if (!/^https?:\/\//.test(base)) return readFile(join(base, path), 'utf8')
  const url = `${base}/${path}`
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`could not read ${url}: HTTP ${res.status}`)
  return res.text()
}

function declaration(source: string, name: string): string | null {
  const m = new RegExp(`^export const ${name} = (.+)$`, 'm').exec(source)
  return m ? m[1].trim() : null
}

async function main(): Promise<void> {
  const problems: string[] = []

  for (const [local, path] of Object.entries(COPIES)) {
    const mine = await readFile(join(root, 'tools', 'vendor', local), 'utf8')
    const theirs = await upstream(path)
    if (mine === theirs) { console.log(`ok   tools/vendor/${local}`); continue }
    problems.push(`tools/vendor/${local} differs from ${path} upstream — copy it over in its own commit`)
  }

  for (const { local, upstream: path, name } of CONSTANTS) {
    const mine = declaration(await readFile(join(root, 'tools', 'vendor', local), 'utf8'), name)
    const theirs = declaration(await upstream(path), name)
    if (mine !== null && mine === theirs) { console.log(`ok   ${name}`); continue }
    problems.push(`${name} is ${mine ?? 'missing'} here and ${theirs ?? 'missing'} in ${path}`)
  }

  if (problems.length) {
    for (const p of problems) console.error(`FAIL ${p}`)
    process.exit(1)
  }
  console.log(`vendored schema is in step with fremkit ${VENDOR_REF.slice(0, 12)}`)
}

main().catch((err: Error) => {
  console.error(err.message)
  process.exit(1)
})
