import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const widget = new URL('../../widgets/shellsmith-command/index.html', import.meta.url)
const html = readFileSync(widget, 'utf8')
const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''
const manifest = JSON.parse(readFileSync(new URL('../../widgets/shellsmith-command/manifest.json', import.meta.url), 'utf8')) as {
  commands: string[]
  settingsSchema: Record<string, unknown>
}
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function load(settings: Record<string, unknown> = {}) {
  const elements = new Map<string, any>()
  const handlers: Record<string, () => void> = {}
  const commands: unknown[][] = []
  let suggestion: unknown = { ok: true, command: 'find . -type f' }
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: false,
      disabled: false,
      value: '',
      textContent: '',
      innerHTML: '',
      addEventListener: (name: string, callback: () => void) => { if (name === 'click') handlers[id] = callback },
    })
    return elements.get(id)
  }
  const Fremkit = {
    locale: 'en',
    settings: { connection: 'main', ...settings },
    t: (value: any) => typeof value === 'string' ? value : value.en,
    whenReady: (callback: () => void) => callback(),
    sendCommand: async (...args: unknown[]) => {
      commands.push(args)
      return args[1] === 'suggestCommand' ? suggestion : { ok: true }
    },
    onLocale: () => {},
    onSettings: () => {},
  }
  runInNewContext(script, { document: { getElementById: element, documentElement: { lang: '' } }, Fremkit, Promise, String, Array })
  return { elements, handlers, commands, setSuggestion: (next: unknown) => { suggestion = next } }
}

describe('ShellSmith command suggestion controls', () => {
  it('sends a request only after the user asks and renders model text as plain text', async () => {
    const app = load()
    const untrustedOutput = '<script>alert(1)</script>'
    app.setSuggestion({ ok: true, command: untrustedOutput })
    expect(app.commands).toEqual([])
    app.elements.get('request').value = 'List the files here'
    app.handlers.suggest()
    await settle()

    expect(app.commands).toEqual([['openai-shellsmith:main', 'suggestCommand', { request: 'List the files here' }]])
    expect(app.elements.get('result').textContent).toBe(untrustedOutput)
    expect(app.elements.get('result').innerHTML).toBe('')
    expect(app.elements.get('copy').hidden).toBe(false)
  })

  it('copies the suggestion only after an explicit click and exposes no execution command', async () => {
    const app = load()
    app.elements.get('request').value = 'List files'
    app.handlers.suggest()
    await settle()
    app.handlers.copy()
    await settle()

    expect(app.commands).toEqual([
      ['openai-shellsmith:main', 'suggestCommand', { request: 'List files' }],
      ['openai-shellsmith:main', 'copyCommand', { command: 'find . -type f' }],
    ])
    expect(manifest.commands).toEqual(['openai-shellsmith:*'])
    expect(html).not.toContain('runCommand')
  })

  it('requires a connection and rejects an empty request without contacting the provider', async () => {
    const noConnection = load({ connection: '' })
    noConnection.handlers.suggest()
    await settle()
    expect(noConnection.commands).toEqual([])
    expect(noConnection.elements.get('status').textContent).toContain('connection')

    const connected = load()
    connected.elements.get('request').value = '  '
    connected.handlers.suggest()
    await settle()
    expect(connected.commands).toEqual([])
  })
})
