/**
 * Reading a package's `CHANGELOG.md`, and what the index carries out of it.
 *
 * The text extracted here is shown next to an Update button in somebody's admin, and it was
 * written by whoever opened the pull request. Everything is stripped to plain text at this end,
 * so the one place that has to be careful about markdown is this file rather than every place
 * downstream that renders a string.
 */
import { describe, expect, it } from 'vitest'
import { MAX_CHANGES, changelogFor, parseChangelog, toPlainText } from '../changelog.js'

describe('toPlainText', () => {
  it('keeps the words and drops the markup', () => {
    expect(toPlainText('- **Added** a `--flag`')).toBe('Added a --flag')
    expect(toPlainText('### Fixed\n\n- A thing')).toBe('Fixed\nA thing')
    expect(toPlainText('1. First\n2. Second')).toBe('First\nSecond')
    expect(toPlainText('> A quoted line')).toBe('A quoted line')
  })

  it('keeps a link’s text and loses its URL', () => {
    // The admin shows this beside an Update button. A clickable link there would be a link the
    // package's author chose, in a dialog about whether to trust the package.
    expect(toPlainText('- See [the docs](https://example.com/docs)')).toBe('See the docs')
    expect(toPlainText('- ![shot](https://example.com/a.png) after')).toBe('after')
  })

  it('leaves an underscore inside a word alone', () => {
    expect(toPlainText('- renamed `snake_case` to camelCase')).toBe('renamed snake_case to camelCase')
    expect(toPlainText('- a_b_c stays')).toBe('a_b_c stays')
  })

  it('removes a raw HTML tag rather than passing it on', () => {
    expect(toPlainText('- <img src=x onerror=alert(1)> gone')).toBe('gone')
    expect(toPlainText('- <b>bold</b>')).toBe('bold')
  })

  it('unwraps a fenced block and keeps what was in it', () => {
    expect(toPlainText('```js\nconst a = 1\n```')).toBe('const a = 1')
  })

  it('drops blank lines rather than carrying the file’s spacing into a card', () => {
    expect(toPlainText('- one\n\n\n- two')).toBe('one\ntwo')
  })
})

describe('parseChangelog', () => {
  const FILE = `# Changelog

Anything before the first version heading belongs to nobody.

## 1.1.0 — 2026-09-21

### Added
- A second thing

## 1.0.0 (2026-09-18)

- Initial release
`

  it('reads every version, newest first, as the file orders them', () => {
    expect(parseChangelog(FILE)).toEqual([
      { version: '1.1.0', text: 'Added\nA second thing' },
      { version: '1.0.0', text: 'Initial release' },
    ])
  })

  it('takes a heading with a date, without one, or with a v', () => {
    expect(parseChangelog('## 1.0.0\n- a').map((e) => e.version)).toEqual(['1.0.0'])
    expect(parseChangelog('## v2.0.0 — 2026-01-01\n- a').map((e) => e.version)).toEqual(['2.0.0'])
    expect(parseChangelog('## 1.0.0-beta.1\n- a').map((e) => e.version)).toEqual(['1.0.0-beta.1'])
  })

  it('ignores a heading that is not a version', () => {
    // `## Unreleased` is the Keep a Changelog convention, and it is not a release.
    expect(parseChangelog('## Unreleased\n- soon\n\n## 1.0.0\n- now').map((e) => e.version)).toEqual(['1.0.0'])
  })

  it('gives an empty text to a heading nothing follows', () => {
    // Not silently absent: `changelogFor` tells "documents nothing" from "does not mention it",
    // and the build refuses the first for a version it is about to publish.
    expect(parseChangelog('## 1.0.0\n\n## 0.9.0\n- old')).toEqual([
      { version: '1.0.0', text: '' },
      { version: '0.9.0', text: 'old' },
    ])
  })
})

describe('the cap', () => {
  it('cuts a long entry at a word and marks it', () => {
    const long = `## 1.0.0\n\n- ${'word '.repeat(300)}`
    const text = changelogFor(long, '1.0.0')!
    expect(text.length).toBeLessThanOrEqual(MAX_CHANGES + 1)
    expect(text.endsWith('…')).toBe(true)
    expect(text).not.toMatch(/\bwor…$/)
  })

  it('truncates rather than refusing', () => {
    // An author who wrote too much has still written something useful, and a build that failed
    // over the length of a sentence is a build nobody thanks. The package keeps the whole file.
    expect(changelogFor(`## 1.0.0\n\n- ${'x'.repeat(2000)}`, '1.0.0')).toBeTruthy()
  })

  it('leaves an entry that fits exactly as it is', () => {
    const text = changelogFor('## 1.0.0\n\n- Short and done.', '1.0.0')
    expect(text).toBe('Short and done.')
  })
})

describe('changelogFor', () => {
  const FILE = '## 1.1.0\n- newer\n\n## 1.0.0\n- older'

  it('finds the version asked for, and nothing else', () => {
    expect(changelogFor(FILE, '1.1.0')).toBe('newer')
    expect(changelogFor(FILE, '1.0.0')).toBe('older')
  })

  it('answers undefined for a version the file does not mention', () => {
    expect(changelogFor(FILE, '2.0.0')).toBeUndefined()
    expect(changelogFor('', '1.0.0')).toBeUndefined()
  })
})
