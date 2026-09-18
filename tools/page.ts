/**
 * The page a person gets when they open the registry URL in a browser.
 *
 * Fremkit never reads it; it exists so the Pages site is not a bare `index.json`. Everything on
 * it comes out of the index, which comes out of a manifest an outside author wrote, so every
 * value is escaped — the page is published under the owner's github.io origin, shared with
 * nothing, but a widget's description is still text from a pull request.
 */

import type { IndexWidget, RegistryIndex } from './schema.js'

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

export function renderPage(index: RegistryIndex): string {
  const cards = index.widgets.map(card).join('\n')
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
</style>
</head>
<body>
  <main>
    <h1>Fremkit widgets</h1>
    <p class="meta">The widget registry for <a href="https://github.com/fdussert/fremkit">Fremkit</a>. Browse and install these from the Fremkit admin; the machine-readable list is <a href="index.json">index.json</a>.</p>
${index.widgets.length ? cards : empty}
    <footer>Generated ${esc(index.generatedAt)} · schema ${esc(index.schema)} · ${index.widgets.length} widget(s)</footer>
  </main>
</body>
</html>
`
}
