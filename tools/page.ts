/**
 * The page a person gets when they open the registry URL in a browser.
 *
 * Fremkit never reads it; it exists so the Pages site is not a bare `index.json`. Everything on
 * it comes out of the index, which comes out of a manifest an outside author wrote, so every
 * value is escaped — the page is published under the owner's github.io origin, shared with
 * nothing, but a widget's description is still text from a pull request.
 */

import type { IndexTheme, IndexWidget, RegistryIndex } from './schema.js'
import { COLOR_RE } from './theme.js'

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** A `{ fr, en }` pair or a plain string, in English, because this page is. */
function text(value: IndexWidget['name']): string {
  if (typeof value === 'string') return value
  return value.en ?? Object.values(value)[0] ?? ''
}

function permissions(w: IndexWidget): string {
  const bits: string[] = []
  if (w.permissions.subscriptions.length) bits.push(`reads ${w.permissions.subscriptions.join(', ')}`)
  if (w.permissions.commands.length) bits.push(`commands ${w.permissions.commands.join(', ')}`)
  if (w.permissions.network.length) bits.push(`network ${w.permissions.network.join(', ')}`)
  if (w.connections.length) bits.push(`needs a ${w.connections.join(' and a ')} connection`)
  return bits.length ? bits.join(' · ') : 'no permissions'
}

function card(w: IndexWidget): string {
  const meta = [w.author, w.license].filter(Boolean).map((v) => esc(v)).join(' · ')
  const home = w.homepage ? ` · <a href="${esc(w.homepage)}" rel="noopener noreferrer">homepage</a>` : ''
  return `    <article>
      <h2>${esc(text(w.name))} <span class="v">${esc(w.version)}</span></h2>
      <p>${esc(text(w.description))}</p>
      <p class="perm">${esc(permissions(w))}</p>
      <p class="meta">${meta}${home} · sdk ${esc(w.sdk)} · <a href="${esc(w.url)}">${esc(w.id)}-${esc(w.version)}.zip</a> (${esc(w.size)} bytes)</p>
    </article>`
}

/**
 * A theme's four tokens as a strip of swatches.
 *
 * The one place this page puts an author's value into a `style` attribute, so it is escaped like
 * everything else *and* held to the shape a colour has: anything else is dropped rather than
 * rendered, because a value that reached `style` unchecked could close the attribute.
 *
 * The shape is `COLOR_RE`, the one the validator refuses a package with — two copies of it would
 * mean a value the validator let through and this dropped, or worse the other way round.
 */
function swatches(theme: IndexTheme): string {
  const order: (keyof IndexTheme['tokens'])[] = ['bg', 'surface', 'accent', 'text']
  return order.map((key) => {
    const value = theme.tokens[key]
    if (!COLOR_RE.test(value)) return ''
    return `<i class="sw" style="background:${esc(value)}" title="${esc(key)}"></i>`
  }).join('')
}

function themeCard(t: IndexTheme): string {
  const meta = [t.author, t.license].filter(Boolean).map((v) => esc(v)).join(' · ')
  const home = t.homepage ? ` · <a href="${esc(t.homepage)}" rel="noopener noreferrer">homepage</a>` : ''
  return `    <article>
      <h2>${esc(text(t.name))} <span class="v">${esc(t.version)}</span></h2>
      <p class="strip">${swatches(t)}</p>
      <p>${esc(text(t.description))}</p>
      <p class="meta">${meta}${home} · <a href="${esc(t.url)}">${esc(t.id)}-${esc(t.version)}.zip</a> (${esc(t.size)} bytes)</p>
    </article>`
}

export function renderPage(index: RegistryIndex): string {
  const cards = index.widgets.map(card).join('\n')
  const themes = index.themes.map(themeCard).join('\n')
  const empty = '    <p class="meta">No widget published yet.</p>'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fremkit widgets</title>
<style>
:root { color-scheme: dark; --bg: #0b0d10; --fg: #e7e9ee; --dim: #8b94a3; --accent: #d9b36a; --line: #1f2329; }
body { margin: 0; padding: 2rem 1rem 4rem; background: var(--bg); color: var(--fg);
  font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 52rem; margin: 0 auto; }
h1 { font-size: 1.6rem; margin: 0 0 .25rem; }
a { color: var(--accent); }
article { border-top: 1px solid var(--line); padding: 1.25rem 0; }
h2 { font-size: 1.1rem; margin: 0 0 .35rem; }
.v { color: var(--dim); font-weight: 400; font-size: .9rem; }
p { margin: .25rem 0; }
.perm { color: var(--fg); font-size: .9rem; }
.meta { color: var(--dim); font-size: .85rem; }
footer { margin-top: 2rem; color: var(--dim); font-size: .85rem; }
h1.section { font-size: 1.1rem; margin: 2rem 0 0; color: var(--dim); text-transform: uppercase; letter-spacing: .08em; }
.strip { display: flex; gap: 4px; margin: .35rem 0 .5rem; }
.sw { width: 26px; height: 18px; border-radius: 4px; border: 1px solid var(--line); }
</style>
</head>
<body>
  <main>
    <h1>Fremkit widgets</h1>
    <p class="meta">The widget registry for <a href="https://github.com/fdussert/fremkit">Fremkit</a>. Browse and install these from the Fremkit admin; the machine-readable list is <a href="index.json">index.json</a>.</p>
    <h1 class="section">Widgets</h1>
${index.widgets.length ? cards : empty}
    <h1 class="section">Themes</h1>
${index.themes.length ? themes : '    <p class="meta">No theme published yet.</p>'}
    <footer>Generated ${esc(index.generatedAt)} · schema ${esc(index.schema)} · ${index.widgets.length} widget(s) · ${index.themes.length} theme(s)</footer>
  </main>
</body>
</html>
`
}
