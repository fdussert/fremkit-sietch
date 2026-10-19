import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const html = readFileSync(new URL('../../widgets/vercel-deployments/index.html', import.meta.url), 'utf8')
const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''

function load(settings: Record<string, unknown> = {}, locale = 'en') {
  const elements = new Map<string, any>()
  const callbacks = new Map<string, (snapshot: any) => void>()
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', className: '', hidden: false })
    return elements.get(id)
  }
  const document = { getElementById: element, documentElement: { lang: '' } }
  const timers = new Map<number, () => void>()
  let nextTimer = 0
  const Fremkit = {
    locale,
    settings: { connection: 'main', ...settings },
    t: (value: any, params: Record<string, unknown> = {}) => {
      const selected = typeof value === 'string' ? value : value[locale] || value.en
      return selected.replace(/\{(\w+)\}/g, (_match: string, key: string) => String(params[key] ?? ''))
    },
    esc: (value: unknown) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    whenReady: (callback: () => void) => callback(),
    subscribe: (channel: string, callback: (snapshot: any) => void) => { callbacks.set(channel, callback); return () => callbacks.delete(channel) },
    onLocale: () => {},
    onSettings: () => {},
  }
  runInNewContext(script, {
    document, Fremkit, Date, Number, Math, Array, String,
    setTimeout: (callback: () => void) => { const id = ++nextTimer; timers.set(id, callback); return id },
    clearTimeout: (id: number) => { timers.delete(id) },
  })
  return { elements, callbacks, timers }
}

describe('Vercel Deployments widget', () => {
  it('filters deployments by project and state without changing the provider snapshot', () => {
    const widget = load({ project: 'docs', status: 'ready' })
    const snapshot = {
      deployments: [
        { id: '1', name: 'docs-site', state: 'READY', target: 'production', createdAt: Date.now() },
        { id: '2', name: 'docs-preview', state: 'BUILDING', target: 'preview', createdAt: Date.now() },
        { id: '3', name: 'api', state: 'READY', target: 'production', createdAt: Date.now() },
      ],
    }
    widget.callbacks.get('vercel:main')!(snapshot)

    expect(widget.elements.get('list').innerHTML).toContain('docs-site')
    expect(widget.elements.get('list').innerHTML).not.toContain('docs-preview')
    expect(widget.elements.get('list').innerHTML).not.toContain('>api<')
    expect(snapshot.deployments).toHaveLength(3)
  })

  it('shows credential and connectivity failures without exposing response data', () => {
    const widget = load()
    widget.callbacks.get('vercel:main')!({ deployments: [], error: 'unauthorized', detail: 'private token' })
    expect(widget.elements.get('message').textContent).toBe('Token refused.')
    expect(widget.elements.get('message').textContent).not.toContain('private token')
  })

  it('keeps the last deployment visible alongside a later connectivity error', () => {
    const widget = load()
    widget.callbacks.get('vercel:main')!({
      deployments: [{ id: '1', name: 'last-good-site', state: 'READY', target: 'production', createdAt: Date.now() }],
      error: 'offline',
    })

    expect(widget.elements.get('message').textContent).toBe('Vercel is unreachable.')
    expect(widget.elements.get('list').innerHTML).toContain('last-good-site')
  })

  it('replaces indefinite loading when a selected channel never sends a snapshot', () => {
    const widget = load()
    expect(widget.elements.get('message').textContent).toBe('Loading…')
    for (const callback of widget.timers.values()) callback()
    expect(widget.elements.get('message').textContent).toBe('No deployment data received.')
    expect(widget.elements.get('message').className).toContain('bad')
  })

  it('shows the connection prompt immediately when no channel is selected', () => {
    const widget = load({ connection: '' })
    expect(widget.elements.get('message').textContent).toBe('Choose a Vercel connection.')
    expect(widget.timers.size).toBe(0)
  })
})
