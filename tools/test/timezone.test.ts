/**
 * The packer must produce the same bytes in every timezone.
 *
 * The index publishes a sha256 and Fremkit refuses a download that does not match it, so the
 * hash is part of the contract — and `build` refuses a republish whose bytes changed under a
 * version already published. The owner's local build (Paris) and CI (UTC) have to agree, or a
 * rebuild of an unchanged widget is a failed release.
 *
 * `TZ` is read by the process at start, so this runs real child processes rather than trying to
 * change it in place.
 */
import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = fileURLToPath(new URL('../..', import.meta.url))

const PACKER = fileURLToPath(new URL('./fixtures/pack-hash.ts', import.meta.url))
const TSX = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url))

/** Packs the fixture folder under one `TZ` and returns the sha256 it printed. */
async function hashUnder(tz: string): Promise<string> {
  const { stdout } = await execFileAsync(TSX, [PACKER], { cwd: root, env: { ...process.env, TZ: tz } })
  return stdout.trim()
}

describe('the packed bytes', () => {
  it('hash the same under UTC, Paris and New York', async () => {
    const [utc, paris, newYork] = await Promise.all([
      hashUnder('UTC'),
      hashUnder('Europe/Paris'),
      hashUnder('America/New_York'),
    ])
    expect(utc).toMatch(/^[0-9a-f]{64}$/)
    expect(paris).toBe(utc)
    expect(newYork).toBe(utc)
  }, 60_000)
})
