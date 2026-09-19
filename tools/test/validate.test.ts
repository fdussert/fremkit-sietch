import { describe, expect, it, beforeEach } from 'vitest'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LIMITS, checkEntryName, isBilingual, isLocalName, localizedTexts, offPackageScripts, readAllPackages, readPackage, assertNoSharedIds } from '../validate.js'
import { ManifestSchema } from '../vendor/widgets/manifest.js'

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'registry-')) })

const manifest = (over: Record<string, unknown> = {}) => ({
  id: 'demo', name: { fr: 'Démo', en: 'Demo' }, description: { fr: 'Une démo', en: 'A demo' },
  version: '1.0.0', sdk: 1, minSize: [8, 4], defaultSize: [8, 4], ...over,
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

describe('isBilingual', () => {
  it('takes a pair with something in both halves', () => {
    expect(isBilingual({ fr: 'Démo', en: 'Demo' })).toBe(true)
  })
  it('refuses a bare string, a half pair and an empty one', () => {
    for (const value of ['Demo', { fr: 'Démo' }, { en: 'Demo' }, { fr: '', en: 'Demo' }, { fr: 'Démo', en: '  ' }, {}, null, undefined]) {
      expect(isBilingual(value), JSON.stringify(value) ?? 'undefined').toBe(false)
    }
  })
})

describe('localizedTexts', () => {
  it('finds every text a manifest shows, down to an enum option inside a list item', () => {
    const parsed = ManifestSchema.parse(manifest({
      settingsSchema: {
        mode: {
          type: 'enum', label: { fr: 'Mode', en: 'Mode' },
          options: [{ value: 'a', label: { fr: 'A', en: 'A' } }, 'b'],
        },
        rows: {
          type: 'list', label: { fr: 'Lignes', en: 'Rows' },
          itemSchema: {
            kind: { type: 'enum', label: { fr: 'Type', en: 'Kind' }, options: [{ value: 'x', label: { fr: 'X', en: 'X' } }] },
          },
        },
      },
    }))
    expect(localizedTexts(parsed).map((t) => t.path)).toEqual([
      'name',
      'description',
      'settingsSchema.mode.label',
      'settingsSchema.mode.options[0].label',
      'settingsSchema.rows.label',
      'settingsSchema.rows.itemSchema.kind.label',
      'settingsSchema.rows.itemSchema.kind.options[0].label',
    ])
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

  it('says a missing description is missing, not mistyped', async () => {
    // The schema defaults `description` to `''`, so an absent one is an empty string by the time
    // it gets here — and "must be a pair" would send an author looking for a type error in
    // something they never wrote.
    const { description: _, ...withoutDescription } = manifest({ id: 'demo' })
    await widget('demo', {}, withoutDescription)
    await expect(readPackage(root, 'demo')).rejects.toThrow(/description is required/)
    await widget('demo', {}, manifest({ id: 'demo', description: '' }))
    await expect(readPackage(root, 'demo')).rejects.toThrow(/description is required/)
  })

  it('requires a { fr, en } pair for every text it shows', async () => {
    // Fremkit accepts a bare string, because manifests were written before the pair existed. A
    // registry has no such history: a widget here is read by French and English dashboards both.
    for (const over of [
      { name: 'Demo' },
      { name: { fr: 'Démo' } },
      { description: { en: 'A demo' } },
      { settingsSchema: { title: { type: 'string', label: 'Title' } } },
      { settingsSchema: { mode: { type: 'enum', label: { fr: 'M', en: 'M' }, options: [{ value: 'a', label: 'A' }] } } },
      {
        settingsSchema: {
          rows: {
            type: 'list', label: { fr: 'L', en: 'R' },
            itemSchema: { kind: { type: 'string', label: { fr: 'T' } } },
          },
        },
      },
    ]) {
      await widget('demo', {}, manifest({ id: 'demo', ...over }))
      await expect(readPackage(root, 'demo'), JSON.stringify(over)).rejects.toThrow(/must be a \{ "fr"/)
    }
  })

  it('accepts a manifest whose texts are all pairs', async () => {
    await widget('demo', {}, manifest({
      id: 'demo',
      settingsSchema: {
        mode: { type: 'enum', label: { fr: 'Mode', en: 'Mode' }, options: [{ value: 'a', label: { fr: 'A', en: 'A' } }] },
      },
    }))
    await expect(readPackage(root, 'demo')).resolves.toBeTruthy()
  })

  it('refuses the channel reserved for the host', async () => {
    // `config` carries the whole dashboard. The schema refuses it; a registry that published a
    // widget asking for it would be publishing something no Fremkit can read.
    // Matched on the reason, not just on "something threw": every other rule in this file also
    // throws, so a bare `rejects.toThrow()` would keep passing if the channel guard disappeared.
    for (const subscriptions of [['config'], ['config:*'], ['config:anything']]) {
      await widget('demo', {}, manifest({ id: 'demo', subscriptions }))
      await expect(readPackage(root, 'demo'), subscriptions[0]).rejects.toThrow(/reserved/)
    }
    await widget('demo', {}, manifest({ id: 'demo', commands: ['config'] }))
    await expect(readPackage(root, 'demo')).rejects.toThrow(/reserved/)
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

describe('assertNoSharedIds', () => {
  it('refuses an id both a widget and a theme claim', () => {
    // Fremkit records what is installed under one key across both kinds, so the two could never
    // both be installed. Saying so here tells the author before the pull request is opened.
    expect(() => assertNoSharedIds([{ id: 'nuit' }], [{ id: 'nuit' }])).toThrow(/cannot share an id/)
    expect(() => assertNoSharedIds([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }])).toThrow(/b/)
  })

  it('says nothing when the two lists are disjoint, or either is empty', () => {
    expect(() => assertNoSharedIds([{ id: 'clock' }], [{ id: 'nuit' }])).not.toThrow()
    expect(() => assertNoSharedIds([], [{ id: 'nuit' }])).not.toThrow()
    expect(() => assertNoSharedIds([{ id: 'clock' }], [])).not.toThrow()
  })
})
