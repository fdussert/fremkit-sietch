/**
 * What a theme folder must be to get into the index.
 *
 * A theme is the safest package the registry can carry: a JSON file of colour tokens, no code,
 * no permissions, nothing to consent to. So the rules are almost all about shape — the folder
 * holds `theme.json` and at most a `README.md`, it is tiny, its id is its folder's name, and its
 * version only ever goes up.
 *
 * **The tokens are Fremkit's rule, not this repository's.** `TokensSchema` is vendored — one
 * regular expression per token, and a `strictObject`, so an unknown token is a mistake told to
 * the author rather than a value silently dropped on the way through. It is the same schema the
 * installer applies to the downloaded package, which is what makes a pull request that passes
 * here an install that works there.
 *
 * The four the index needs are pulled out on top of that, because a theme that paints no accent
 * has no swatch to show; every other token stays whatever Fremkit accepts.
 */

import { z } from 'zod'
import { ThemeSchema, TokensSchema } from './vendor/themes/theme.js'

/** A theme package is a JSON file. These ceilings exist to be obviously never reached. */
export const THEME_LIMITS = {
  // `theme.json`, and at most a `README.md` and a `CHANGELOG.md` beside it.
  maxFiles: 3,
  /** The zip, as downloaded. */
  maxCompressedBytes: 64 * 1024,
  maxUncompressedBytes: 64 * 1024,
  maxFileBytes: 64 * 1024,
} as const

/** The only two names a theme folder may hold. */
export const THEME_ENTRY = 'theme.json'
export const THEME_README = 'README.md'

/**
 * Theme ids that ship with Fremkit and can never be installed over.
 *
 * `fremkit` mirrors `tokens.css` and is what the dashboard falls back to; `edge` is the other
 * one kept in the checkout so a fresh install has a choice with no network. The installer
 * refuses them too — this is the copy that tells an author before they open a pull request.
 */
export const BUILTIN_THEME_IDS = new Set(['fremkit', 'edge'])

/**
 * The shape the published page holds a swatch value to before writing it into a `style`
 * attribute. `TokensSchema` has already refused anything that is not a colour; this is the check
 * that does not depend on that having run, on the one value that reaches an HTML attribute.
 */
export const COLOR_RE = /^[#a-zA-Z0-9(),.%\s/-]+$/

/** The four tokens a card paints as a swatch strip, so a theme needs no preview image. */
export const SWATCH_TOKENS = ['accent', 'bg', 'surface', 'text'] as const
export type SwatchTokens = Record<(typeof SWATCH_TOKENS)[number], string>

const LocalizedPairSchema = z.object({ fr: z.string().min(1), en: z.string().min(1) })

/**
 * The part of a `theme.json` this repository reads.
 *
 * `tokens` is passthrough on purpose: a theme carries far more than four, the dashboard paints
 * all of them, and a registry that listed only the ones it understood would silently drop the
 * rest on the way through. Only the four the card needs are named.
 */
export const ThemeFileSchema = ThemeSchema.extend({
  /**
   * Both texts are required pairs here, where Fremkit takes a bare string and no description at
   * all: an index read in two languages cannot carry a name written in one.
   */
  name: LocalizedPairSchema,
  description: LocalizedPairSchema,
  /**
   * The four the card paints, made *required* on top of `TokensSchema`, which has them optional
   * like every other token — a theme that names none has nothing to show in a swatch strip, and
   * a card with four blanks is worse than no card.
   *
   * `.required()` rather than `.extend()`: extending replaces a field, which would have handed
   * these four a plain string schema and quietly dropped the colour expression `TokensSchema`
   * holds them to. That is the one thing this file must not do — they are the values the
   * published page writes into a `style` attribute.
   */
  tokens: TokensSchema.required(Object.fromEntries(
    SWATCH_TOKENS.map((name) => [name, true]),
  ) as { [K in (typeof SWATCH_TOKENS)[number]]: true }),
})
export type ThemeFile = z.infer<typeof ThemeFileSchema>

/** The four values, alone, for the index entry. */
export function swatch(theme: ThemeFile): SwatchTokens {
  return {
    accent: theme.tokens.accent,
    bg: theme.tokens.bg,
    surface: theme.tokens.surface,
    text: theme.tokens.text,
  }
}
