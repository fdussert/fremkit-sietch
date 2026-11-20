import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const html = readFileSync(new URL('../../widgets/docker-containers/index.html', import.meta.url), 'utf8')
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''

interface Container {
  id: string
  name: string
  image: string
  state: string
  status: string
  stats: { cpu: string; memory: string; netIO: string; blockIO: string } | null
}
interface Snapshot {
  data: { containers: Container[]; actions?: string[] } | null
  stale: boolean
  error: string | null
}
interface Node {
  textContent: string
  innerHTML: string
  hidden: boolean
  attributes: Record<string, string>
  setAttribute(name: string, value: string): void
  addEventListener(type: string, callback: (event?: unknown) => void): void
}
interface Sent {
  channel: string
  name: string
  payload: unknown
  resolve(result: unknown): void
  reject(error: Error): void
}

function container(state: string, name = state, stats: Container['stats'] = null): Container {
  return { id: state, name, image: 'example:latest', state, status: 'From Docker', stats }
}
function snapshot(containers: Container[] = [], error: string | null = null): Snapshot {
  return { data: { containers }, stale: false, error }
}
/** What a Fremkit with the start, stop and restart commands publishes. */
function acting(containers: Container[], actions = ['start', 'stop', 'restart']): Snapshot {
  return { data: { containers, actions }, stale: false, error: null }
}
/** Lets a command's answer reach the widget. */
const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
function load(initial?: Snapshot, locale = 'en') {
  const nodes = new Map<string, Node>()
  const handlers = new Map<string, (event?: unknown) => void>()
  const timers: { id: number; ms: number; callback: () => void }[] = []
  const sent: Sent[] = []
  let nextTimer = 0
  let publish: ((data: Snapshot) => void) | undefined
  let changeLocale: (() => void) | undefined
  const get = (id: string): Node => {
    let node = nodes.get(id)
    if (!node) {
      node = {
        textContent: '', innerHTML: '', hidden: false, attributes: {},
        setAttribute(name, value) { this.attributes[name] = value },
        addEventListener(type, callback) { handlers.set(id + ':' + type, callback) },
      }
      nodes.set(id, node)
    }
    return node
  }
  const api = {
    locale,
    esc(value: unknown) {
      return String(value ?? '').replace(/[&<>"']/g, (character) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
    },
    t(value: { en: string; fr: string }, params: Record<string, string | number> = {}) {
      return (value[api.locale as 'en' | 'fr'] ?? value.en)
        .replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ''))
    },
    whenReady(callback: () => void) { callback() },
    onLocale(callback: () => void) { changeLocale = callback },
    subscribe(channel: string, callback: (data: Snapshot) => void) {
      expect(channel).toBe('docker-local')
      publish = callback
      if (initial) callback(initial)
      return () => {}
    },
    sendCommand(channel: string, name: string, payload: unknown) {
      return new Promise((resolve, reject) => { sent.push({ channel, name, payload, resolve, reject }) })
    },
  }
  runInNewContext(script, {
    Fremkit: api,
    document: { getElementById: get, documentElement: { lang: 'en' } },
    setTimeout: (callback: () => void, ms = 0) => { timers.push({ id: ++nextTimer, ms, callback }); return nextTimer },
    clearTimeout: (id: number) => { const at = timers.findIndex((timer) => timer.id === id); if (at !== -1) timers.splice(at, 1) },
  })
  return {
    get,
    sent,
    /**
     * A tap on a container's card, or on one of its buttons. Refused when the list does not show
     * that card as one to tap, or that button: a test cannot press what a finger could not.
     */
    tap(id: string, action?: string) {
      const list = get('list').innerHTML
      if (!list.includes(`data-id="${id}"`)) throw new Error(`no card to tap for ${id}`)
      if (action && !list.includes(`data-act="${action}"`)) throw new Error(`no ${action} button`)
      handlers.get('list:click')?.({ target: { closest: (selector: string) => selector.startsWith('button')
        ? (action ? { getAttribute: () => action } : null)
        : { getAttribute: () => id } } })
    },
    /** Runs the pending timers set for `ms`, as that much time passing would. */
    after(ms: number) {
      for (const timer of timers.filter((candidate) => candidate.ms === ms)) {
        timers.splice(timers.indexOf(timer), 1)
        timer.callback()
      }
    },
    update(data: Snapshot) { publish?.(data) },
    filter(id: 'active' | 'stopped' | 'all') { handlers.get('filter-' + id + ':click')?.() },
    language(value: 'en' | 'fr') { api.locale = value; changeLocale?.() },
    runTimeout() { timers.shift()?.callback() },
    text() { return [...nodes.values()].filter((node) => !node.hidden).map((node) => node.textContent + node.innerHTML).join(' ') },
  }
}

describe('Docker containers widget', () => {
  it('filters running, stopped and all containers without sending commands', () => {
    const rows = [container('running'), container('exited'), container('paused')]
    const widget = load(snapshot(rows), 'fr')
    expect(widget.get('list').innerHTML).toContain('running')
    expect(widget.get('list').innerHTML).not.toContain('exited')
    widget.filter('stopped')
    expect(widget.get('list').innerHTML).toContain('exited')
    expect(widget.get('list').innerHTML).not.toContain('paused')
    expect(widget.get('filter-stopped').attributes['aria-pressed']).toBe('true')
    widget.filter('all')
    expect(widget.get('list').innerHTML).toContain('paused')
    widget.update({ ...snapshot(rows), stale: true })
    expect(widget.get('filter-all').attributes['aria-pressed']).toBe('true')
    expect(widget.text()).toContain('Données anciennes')
  })

  it('shows a compatibility message when an older host never publishes the channel', () => {
    const widget = load(undefined, 'fr')
    expect(widget.get('status').textContent).toBe('Chargement…')
    expect(widget.get('filter-active').textContent).toBe('Actifs')
    widget.runTimeout()
    expect(widget.get('status').textContent).toBe('Version plus récente de Fremkit nécessaire')
    widget.update(snapshot([container('running')]))
    expect(widget.get('status').textContent).toBe('')
  })

  it.each([
    ['unavailable', 'Docker n’est pas installé'],
    ['offline', 'Docker ne fonctionne pas'],
    ['invalid', 'Données Docker illisibles'],
  ])('distinguishes %s without data', (error, message) => {
    const widget = load({ data: null, stale: false, error }, 'fr')
    expect(widget.get('status').textContent).toBe(message)
    expect(widget.get('list').innerHTML).toBe('')
  })

  it('hides irrelevant filters for a remote Docker context', () => {
    const widget = load({ data: null, stale: false, error: 'remote-context' }, 'fr')
    expect(widget.get('status').textContent).toContain('Contexte Docker distant')
    expect(widget.get('filters').hidden).toBe(true)
  })

  it('translates container states, including paused, created and restarting', () => {
    const widget = load(snapshot(['running', 'exited', 'dead', 'created', 'paused', 'restarting']
      .map((state) => container(state))), 'fr')
    widget.filter('all')
    const cards = widget.get('list').innerHTML
    expect(cards).toContain('En pause')
    expect(cards).toContain('Créé')
    expect(cards).toContain('Redémarrage')
    expect(cards).not.toContain('>paused ·')
    widget.filter('stopped')
    expect(widget.get('filter-stopped').textContent).toBe('Arrêtés (3)')
    widget.language('en')
    expect(widget.get('filter-stopped').textContent).toBe('Stopped (3)')
  })

  it('does not repeat a state when Docker status contains only that state', () => {
    const created = container('created')
    created.status = 'Created'
    const widget = load(snapshot([created]), 'fr')
    widget.filter('all')
    expect(widget.get('list').innerHTML).toContain('>Créé</div>')
    expect(widget.get('list').innerHTML).not.toContain('Créé · Created')
  })

  it('keeps measured values and question marks beside labelled icons', () => {
    const stats = { cpu: '2%', memory: '1MiB / 2GiB', netIO: '0B', blockIO: '0B' }
    const widget = load(snapshot([container('running', 'measured', stats), container('exited', 'unknown')]), 'fr')
    expect(widget.get('list').innerHTML).toContain('aria-label="CPU : 2%"')
    expect(widget.get('list').innerHTML).toContain('aria-label="Mémoire : 1MiB / 2GiB"')
    widget.filter('all')
    expect(widget.get('list').innerHTML).toContain('aria-label="CPU : ?"')
  })

  it('escapes names, images, status and metrics from Docker', () => {
    const unsafe = container('running', '<img src=x>', { cpu: '<b>', memory: '2', netIO: '0', blockIO: '0' })
    unsafe.image = '"><img src=x>'
    unsafe.status = '<script>'
    const widget = load(snapshot([unsafe]))
    const card = widget.get('list').innerHTML
    expect(card).toContain('&lt;img src=x&gt;')
    expect(card).toContain('&lt;script&gt;')
    expect(card).toContain('&lt;b&gt;')
    expect(card).not.toContain('<script>')
  })

  it('uses the frame title and a compact default size', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../widgets/docker-containers/manifest.json', import.meta.url), 'utf8'))
    expect(html).not.toMatch(/<h2|service-icon/)
    expect(html).toContain('html.accent-fill .filters button[aria-pressed="true"]')
    expect(manifest.defaultSize).toEqual([32, 8])
    expect(manifest.subscriptions).toEqual(['docker-local'])
    expect(manifest.commands).toEqual(['docker-local'])
  })
})

describe('Docker containers widget actions', () => {
  it('stays read-only on a host that publishes no actions', () => {
    const widget = load(snapshot([container('running'), container('exited')]))
    widget.filter('all')
    expect(widget.get('list').innerHTML).not.toContain('data-id')
    expect(widget.get('list').innerHTML).not.toContain('role="button"')
    expect(() => widget.tap('running')).toThrow('no card to tap')
    expect(widget.sent).toEqual([])
  })

  it('unfolds a card with the actions its state allows', () => {
    const widget = load(acting([container('running'), container('paused'), container('exited'), container('removing')]))
    widget.filter('all')
    expect(widget.get('list').innerHTML).toContain('aria-expanded="false"')
    expect(widget.get('list').innerHTML).not.toContain('data-act')
    widget.tap('running')
    const open = widget.get('list').innerHTML
    expect(open).toContain('data-act="stop"')
    expect(open).toContain('data-act="restart"')
    expect(open).not.toContain('data-act="start"')
    widget.tap('paused')
    expect(widget.get('list').innerHTML).toContain('data-act="stop"')
    widget.tap('exited')
    const stopped = widget.get('list').innerHTML
    expect(stopped).toContain('data-act="start"')
    expect(stopped).not.toContain('data-act="stop"')
    // One card at a time, and none for a container in a state nothing applies to.
    expect(stopped.match(/class="card actionable open"/g)).toHaveLength(1)
    expect(() => widget.tap('removing')).toThrow('no card to tap')
    widget.tap('exited')
    expect(widget.get('list').innerHTML).not.toContain('data-act')
  })

  it('offers only the actions the host takes', () => {
    const widget = load(acting([container('running'), container('exited')], ['start']))
    widget.filter('all')
    expect(() => widget.tap('running')).toThrow('no card to tap')
    widget.tap('exited')
    expect(widget.get('list').innerHTML).toContain('data-act="start"')
  })

  it('starts at once', () => {
    const widget = load(acting([container('exited')]))
    widget.filter('stopped')
    widget.tap('exited')
    widget.tap('exited', 'start')
    expect(widget.sent.map(({ channel, name, payload }) => ({ channel, name, payload })))
      .toEqual([{ channel: 'docker-local', name: 'start', payload: { id: 'exited' } }])
    expect(widget.get('list').innerHTML).toContain('Starting…')
  })

  it.each(['stop', 'restart'])('asks before a %s, and sends it on the second tap', (action) => {
    const widget = load(acting([container('running')]))
    widget.tap('running')
    widget.tap('running', action)
    expect(widget.sent).toEqual([])
    expect(widget.get('list').innerHTML).toContain(`data-act="${action}" class="confirm">Confirm?`)
    widget.tap('running', action)
    expect(widget.sent.map(({ name, payload }) => ({ name, payload }))).toEqual([{ name: action, payload: { id: 'running' } }])
  })

  it('does not take a tap on Restart for the answer to Stop, and lets the question lapse', () => {
    const widget = load(acting([container('running')]))
    widget.tap('running')
    widget.tap('running', 'stop')
    widget.tap('running', 'restart')
    expect(widget.sent).toEqual([])
    expect(widget.get('list').innerHTML).toContain('data-act="restart" class="confirm"')
    expect(widget.get('list').innerHTML).toContain('data-act="stop">Stop')
    widget.after(4000)
    expect(widget.get('list').innerHTML).not.toContain('class="confirm"')
    widget.tap('running', 'restart')
    expect(widget.sent).toEqual([])
  })

  it('shows the action under way, takes no other meanwhile, and folds the card once it is done', async () => {
    const widget = load(acting([container('running')]), 'fr')
    widget.tap('running')
    widget.tap('running', 'stop')
    widget.tap('running', 'stop')
    expect(widget.get('list').innerHTML).toContain('Arrêt…')
    expect(widget.get('list').innerHTML).not.toContain('data-act')
    widget.tap('running')
    widget.after(10000)
    expect(widget.get('list').innerHTML).toContain('Arrêt…')
    widget.sent[0].resolve({ ok: true })
    await settled()
    expect(widget.get('list').innerHTML).toContain('aria-expanded="false"')
    expect(widget.get('list').innerHTML).not.toContain('Arrêt…')
    expect(widget.sent).toHaveLength(1)
  })

  it.each([
    [{ ok: false, error: 'busy' }, 'Une action est déjà en cours'],
    [{ ok: false, error: 'unknown-container' }, 'Conteneur introuvable'],
    [{ ok: false, error: 'remote-context' }, 'Contexte Docker distant'],
    [{ ok: false, error: 'failed' }, 'L’action a échoué'],
    [{ ok: false, error: '<b>new</b>' }, 'L’action a échoué'],
    [null, 'L’action a échoué'],
  ])('says why %j was refused, then offers the buttons again', async (answer, message) => {
    const widget = load(acting([container('exited')]), 'fr')
    widget.filter('stopped')
    widget.tap('exited')
    widget.tap('exited', 'start')
    widget.sent[0].resolve(answer)
    await settled()
    expect(widget.get('list').innerHTML).toContain(message)
    expect(widget.get('list').innerHTML).not.toContain('<b>new</b>')
    widget.after(4000)
    expect(widget.get('list').innerHTML).toContain('data-act="start"')
  })

  it('treats a command the host refused outright as a failure, not as a broken tile', async () => {
    const widget = load(acting([container('exited')]))
    widget.filter('stopped')
    widget.tap('exited')
    widget.tap('exited', 'start')
    widget.sent[0].reject(new Error('commande inconnue: docker-local.start'))
    await settled()
    expect(widget.get('list').innerHTML).toContain('The action failed')
    expect(widget.get('list').innerHTML).not.toContain('commande inconnue')
  })

  it('folds an open card back after ten seconds, and when its container leaves the list', () => {
    const widget = load(acting([container('running')]))
    widget.tap('running')
    widget.after(10000)
    expect(widget.get('list').innerHTML).not.toContain('data-act')
    widget.tap('running')
    widget.update(acting([container('exited')]))
    widget.update(acting([container('running')]))
    expect(widget.get('list').innerHTML).not.toContain('data-act')
  })

  it('escapes a container id where it is written into the page', () => {
    const odd = container('running')
    odd.id = '"><img src=x>'
    const widget = load(acting([odd]))
    expect(widget.get('list').innerHTML).toContain('data-id="&quot;&gt;&lt;img src=x&gt;"')
    expect(widget.get('list').innerHTML).not.toContain('<img')
  })
})
