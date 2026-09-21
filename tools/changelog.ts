/**
 * `CHANGELOG.md` in a package, and the one line the index carries out of it.
 *
 * The registry has always known which versions exist — the bytes, the hashes, the releases
 * carried forward in `previous[]` — and never why any of them happened. The person in front of
 * *Update all* has one question, and permissions are not an answer to it.
 *
 * So a package ships a changelog in [Keep a Changelog](https://keepachangelog.com) shape and the
 * build lifts each version's entry into the index. What is lifted is **plain text**: the admin
 * renders it as text, never as HTML, and a changelog is written by whoever opened the pull
 * request. Stripping the markdown here means the one place that has to be careful is this file,
 * rather than every place downstream that shows a string.
 */

/** The longest entry the index carries. Past this it is release notes, not a "what changed". */
export const MAX_CHANGES = 500

export const CHANGELOG_ENTRY = 'CHANGELOG.md'

/**
 * A version heading: `## 1.2.0`, optionally followed by a date.
 *
 * Deliberately loose about what comes after the version — `— 2026-09-21`, `(2026-09-21)`, or
 * nothing at all. The version is the part anything reads; the rest is for a human.
 */
const HEADING = /^##\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\b(.*)$/

/**
 * Markdown reduced to the text a person would read aloud.
 *
 * Not a renderer and not a sanitiser: every construct is *removed*, so what comes out carries no
 * syntax at all. A link keeps its text and loses its URL — the admin shows this next to an
 * Update button, and a clickable link there would be a link written by the package's author.
 */
export function toPlainText(markdown: string): string {
  return markdown
    // Fenced and inline code: the fence markers go, the code stays as words.
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    // An image is dropped whole; a link keeps its text.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Emphasis markers, but not a `*` or `_` inside a word (`snake_case`, `a*b`).
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|[.,;:!?)]|$)/g, '$1$2')
    // Whatever is left of the markup: bullet dashes, heading hashes, block quotes, raw tags.
    .replace(/<[^>]*>/g, '')
    .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n')
}

/**
 * A bullet wrapped over several source lines is one line here.
 *
 * Authors hard-wrap at eighty columns; the admin shows the text with `white-space: pre-wrap`
 * and a two-line clamp, so a wrap that survived would fill the clamp with half a sentence and
 * read as two bullets. A new line starts only where the author started one: a bullet marker, a
 * numbered item, a heading — anything else continues the line before it.
 */
export function joinWrapped(markdown: string): string {
  const out: string[] = []
  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    if (line === '') { out.push(''); continue }
    const startsBlock = /^(?:[-*+]|\d+\.)\s+/.test(line) || /^#{1,6}\s+/.test(line) || /^>/.test(line) || /^```/.test(line)
    const previous = out[out.length - 1]
    if (!startsBlock && previous !== undefined && previous !== '' && !/^```/.test(previous)) {
      out[out.length - 1] = `${previous} ${line}`
    } else {
      out.push(line)
    }
  }
  return out.join('\n')
}

/** One version's entry, as the file holds it. */
export interface ChangelogEntry { version: string; text: string }

/**
 * Every version the file documents, in the order it documents them.
 *
 * A heading nothing follows is an entry with no text, which is a mistake worth reporting rather
 * than silently treating as absent — `changelogFor` tells the two apart.
 */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const out: ChangelogEntry[] = []
  let current: { version: string; lines: string[] } | null = null
  const flush = (): void => {
    if (current) out.push({ version: current.version, text: capped(toPlainText(joinWrapped(current.lines.join('\n')))) })
  }
  for (const line of markdown.split('\n')) {
    const heading = HEADING.exec(line.trim())
    if (heading) {
      flush()
      current = { version: heading[1], lines: [] }
      continue
    }
    // A `# Changelog` title, or anything before the first version heading, belongs to nobody.
    if (current) current.lines.push(line)
  }
  flush()
  return out
}

/**
 * Cuts an entry to `MAX_CHANGES`, at a word rather than mid-word.
 *
 * Truncated rather than refused: an author who wrote too much has still written something
 * useful, and a build that failed over the length of a sentence would be a build nobody thanks.
 * The package's own file keeps the whole of it.
 */
function capped(text: string): string {
  if (text.length <= MAX_CHANGES) return text
  // One short of the cap: the ellipsis is a character too, and the index schema holds the
  // field to the cap exactly.
  const cut = text.slice(0, MAX_CHANGES - 1)
  const boundary = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'))
  return `${(boundary > MAX_CHANGES * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}…`
}

/**
 * The entry for one version, or undefined.
 *
 * `undefined` means "this file says nothing about that version" — which for a version that is
 * about to be published is a refusal, and for one already published is simply history the
 * author never wrote down.
 */
export function changelogFor(markdown: string, version: string): string | undefined {
  const found = parseChangelog(markdown).find((e) => e.version === version)
  if (!found) return undefined
  return found.text
}
