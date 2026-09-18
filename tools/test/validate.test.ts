import { describe, expect, it, beforeEach } from 'vitest'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LIMITS, checkEntryName, isLocalName, offPackageScripts, readAllPackages, readPackage } from '../validate.js'

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'registry-')) })

const manifest = (over: Record<string, unknown> = {}) => ({
  id: 'demo', name: { fr: 'Démo', en: 'Demo' }, version: '1.0.0', sdk: 1,
  minSize: [8, 4], defaultSize: [8, 4], ...over,
})

async function widget(id: string, files: Record<string, string | Buffer> = {}, m: unknown = manifest({ id })) {
  await mkdir(join(root, id), { recursive: true })
  if (m !== undefined) await writeFile(join(root, id, 'manifest.json'), typeof m === 'string' ? m : JSON.stringify(m))
  await writeFile(join(root, id, 'index.html'), '<!doctype html><html><body>hi</body></html>')
  for (const [name, data] of Object.entries(files)) {
    await mkdir(join(root, id, name, '..'), { recursive: true })
    await writeFile(join(root, id, name), data)
  }
}

describe('checkEntryName', () => {
  it('refuses everything that is not a plain relative path inside the folder', () => {
    for (const name of ['/etc/passwd', 'C:/x', '..', '../x', 'a/../b', './a', '.env', 'a/.git/config',
      'a\\b', 'payload.zip', 'a/inner.TGZ', '']) {
      expect(() => checkEntryName('demo', name), name).toThrow()
    }
  })
  it('accepts an ordinary asset path', () => {
    for (const name of ['index.html', 'assets/logo.svg', 'a/b/c.js', 'style.css']) {
      expect(() => checkEntryName('demo', name), name).not.toThrow()
    }
  })
})

describe('isLocalName', () => {
  it('knows the names that can only ever mean this machine or this LAN', () => {
    for (const host of ['localhost', 'LOCALHOST', 'nas.local', 'printer.home.arpa', 'db.internal', 'box.lan', 'localhost.']) {
      expect(isLocalName(host), host).toBe(true)
    }
    for (const host of ['api.example.com', 'localhost.example.com', 'notlocal.com']) {
      expect(isLocalName(host), host).toBe(false)
    }
  })
})

describe('offPackageScripts', () => {
  it('finds a script loaded from another origin, however it is quoted', () => {
    expect(offPackageScripts('<script src="https://cdn.example.com/x.js"></script>')).toEqual(['https://cdn.example.com/x.js'])
    expect(offPackageScripts("<script src='//cdn.example.com/x.js'></script>")).toEqual(['//cdn.example.com/x.js'])
    expect(offPackageScripts('<script defer src=https://example.com/a.js></script>')).toEqual(['https://example.com/a.js'])
    expect(offPackageScripts('<script src="/somewhere/else.js"></script>')).toEqual(['/somewhere/else.js'])
  })
  it('leaves the package\'s own files and the bridge alone', () => {
    expect(offPackageScripts('<script src="app.js"></script>')).toEqual([])
    expect(offPackageScripts('<script src="./lib/a.js"></script>')).toEqual([])
    expect(offPackageScripts('<script src="/fremkit.js"></script>')).toEqual([])
    expect(offPackageScripts('<script>var a = 1</script>')).toEqual([])
  })
})

describe('readPackage', () => {
  it('reads a well-formed widget and sorts its files', async () => {
    await widget('demo', { 'z.css': 'a{}', 'assets/a.svg': '<svg/>' })
    const pkg = await readPackage(root, 'demo')
    expect(pkg.id).toBe('demo')
    expect(pkg.manifest.version).toBe('1.0.0')
    expect(pkg.files.map((f) => f.name)).toEqual(['assets/a.svg', 'index.html', 'manifest.json', 'z.css'])
  })

  it('refuses a manifest that does not validate, and says why', async () => {
    await widget('demo', {}, manifest({ id: 'demo', version: 'latest' }))
    await expect(readPackage(root, 'demo')).rejects.toThrow(/semver/)
  })

  it('refuses an id that is not the folder name', async () => {
    await widget('demo', {}, manifest({ id: 'other' }))
    await expect(readPackage(root, 'demo')).rejects.toThrow(/does not match the folder/)
  })

  it('refuses a private network host, the one rule a widget cannot be published without', async () => {
    for (const host of ['127.0.0.1', 'localhost', '192.168.1.10', '169.254.169.254', '[::1]']) {
      await widget('demo', {}, manifest({ id: 'demo', permissions: { network: [host] } }))
      await expect(readPackage(root, 'demo'), host).rejects.toThrow()
    }
  })

  it('refuses a dotfile, whatever an author left in the folder', async () => {
    await widget('demo', { '.env': 'TOKEN=secret' })
    await expect(readPackage(root, 'demo')).rejects.toThrow(/dotfile/)
  })

  it('refuses a symlink rather than reading through it', async () => {
    // A symlink to a regular file is not a directory, so a naive walk would publish whatever it
    // points at on the build machine.
    await widget('demo')
    await symlink('/etc/hosts', join(root, 'demo', 'hosts.txt'))
    await expect(readPackage(root, 'demo')).rejects.toThrow(/symlink/)
  })

  it('refuses a nested archive', async () => {
    await widget('demo', { 'payload.zip': 'PK' })
    await expect(readPackage(root, 'demo')).rejects.toThrow(/nested archive/)
  })

  it('refuses a file over the per-file ceiling', async () => {
    await widget('demo', { 'big.bin': Buffer.alloc(LIMITS.maxFileBytes + 1) })
    await expect(readPackage(root, 'demo')).rejects.toThrow(/file over/)
  })

  it('refuses a script loaded from off the package', async () => {
    await mkdir(join(root, 'demo'), { recursive: true })
    await writeFile(join(root, 'demo', 'manifest.json'), JSON.stringify(manifest({ id: 'demo' })))
    await writeFile(join(root, 'demo', 'index.html'), '<script src="https://cdn.example.com/x.js"></script>')
    await expect(readPackage(root, 'demo')).rejects.toThrow(/outside the package/)
  })

  it('refuses a folder with no manifest or no index.html', async () => {
    await mkdir(join(root, 'nothing'), { recursive: true })
    await writeFile(join(root, 'nothing', 'readme.txt'), 'x')
    await expect(readPackage(root, 'nothing')).rejects.toThrow(/manifest.json is missing/)
    await mkdir(join(root, 'no-page'), { recursive: true })
    await writeFile(join(root, 'no-page', 'manifest.json'), JSON.stringify(manifest({ id: 'no-page' })))
    await expect(readPackage(root, 'no-page')).rejects.toThrow(/index.html is missing/)
  })
})

describe('readAllPackages', () => {
  it('reads every folder in id order and skips a stray file', async () => {
    await widget('beta')
    await widget('alpha')
    await writeFile(join(root, 'README.md'), 'what goes in here')
    expect((await readAllPackages(root)).map((p) => p.id)).toEqual(['alpha', 'beta'])
  })
  it('answers nothing for a folder that does not exist', async () => {
    expect(await readAllPackages(join(root, 'nope'))).toEqual([])
  })
})
