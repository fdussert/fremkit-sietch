/**
 * What a theme folder must be to get into the index.
 *
 * A theme is the safest package the registry can carry: a JSON file of colour tokens, no code,
 * no permissions, nothing to consent to. So the rules are almost all about shape — the folder
 * holds `theme.json` and at most a `README.md`, it is tiny, its id is its folder's name, and its
 * version only ever goes up.
 *
 * **The tokens are not validated here yet.** Fremkit's `ThemeSchema`/`TokensSchema` — one
 * regular expression per token — is the authority, and it lands with the theme pull request; it
 * will be vendored into `tools/vendor/themes/theme.ts` and this file will parse against it, the
 * way `validate.ts` parses a manifest against the vendored `ManifestSchema`. Until then the four
 * tokens the index needs are read by shape, and `check-vendor` warns rather than fails about the
 * file that does not exist upstream. Everything a theme *cannot* do is already enforced; what is
 * missing is the check that its colours are colours.
 */

import { z } from 'zod'
import { SEMVER_RE } from './vendor/widgets/manifest.js'

/** A theme package is a JSON file. These ceilings exist to be obviously never reached. */
export const THEME_LIMITS = {
  maxFiles: 2,
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
 * A colour as a token holds it.
 *
 * Deliberately loose: the authority is Fremkit's `TokensSchema`, which has one expression per
 * token and is not this repository's to guess at. This only refuses what could not be a CSS
 * colour at all — the four values reach the index and end up in a swatch on a card, so
 * something that is not a colour must not travel that far.
 */
const ColorSchema = z.string().min(1).max(64).regex(/^[#a-zA-Z0-9(),.%\s/-]+$/)

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
export const ThemeFileSchema = z.looseObject({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  version: z.string().regex(SEMVER_RE),
  name: LocalizedPairSchema,
  description: LocalizedPairSchema,
  author: z.string().min(1).max(200).optional(),
  license: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/).optional(),
  homepage: z.url({ protocol: /^https$/ }).optional(),
  tokens: z.looseObject({
    accent: ColorSchema,
    bg: ColorSchema,
    surface: ColorSchema,
    text: ColorSchema,
  }),
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
