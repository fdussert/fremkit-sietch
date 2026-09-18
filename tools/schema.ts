/**
 * The index as published, and as Fremkit reads it.
 *
 * This file is the contract between two repositories, so it is a zod schema on both sides rather
 * than a shape everyone agrees to remember: the registry validates what it is about to publish,
 * Fremkit validates what it just downloaded, and neither trusts the other's description of it.
 *
 * `schema` is the version of *this* file. It is checked before anything else is read, so a
 * Fremkit too old to understand a future index says so instead of guessing; `registry` names the
 * index, so a second registry — should there ever be one — is distinguishable in the admin and
 * in a consent record without any URL being shown to the user.
 */

import { z } from 'zod'
import { SEMVER_RE } from './vendor/widgets/manifest.js'

export const INDEX_SCHEMA_VERSION = 1

/** The bilingual texts the admin renders; the same shape as a manifest's. */
const LocalizedTextSchema = z.union([z.string(), z.record(z.string(), z.string())])

/** Sixty-four lower-case hex characters, so a typo is a parse error rather than a failed install. */
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)

/**
 * A package URL, by shape only.
 *
 * Not "https": the rule that matters is "on this registry's own origin", and only the build
 * knows what that origin is — it asserts it on every URL it writes (`build.ts`), and Fremkit
 * asserts it again on every URL it reads. A scheme check here would additionally be wrong for
 * the development origin `FREMKIT_REGISTRY_BASE` names, which is how the chain is exercised
 * before anything is published.
 */
const PackageUrl = z.url()

const DownloadSchema = z.object({
  version: z.string().regex(SEMVER_RE),
  url: PackageUrl,
  sha256: Sha256Schema,
  size: z.number().int().min(1),
})
export type Download = z.infer<typeof DownloadSchema>

export const IndexWidgetSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  version: z.string().regex(SEMVER_RE),
  sdk: z.number().int().min(1),
  name: LocalizedTextSchema,
  description: LocalizedTextSchema,
  icon: z.string().min(1),
  author: z.string().optional(),
  license: z.string().optional(),
  homepage: z.url({ protocol: /^https$/ }).optional(),
  /**
   * What the widget asks for, copied from the manifest so the admin can show it *before*
   * downloading anything. The installer re-reads the manifest from the package it fetched and
   * consents against that one: this copy is a shop window, never an authority.
   */
  permissions: z.object({
    subscriptions: z.array(z.string()).default([]),
    commands: z.array(z.string()).default([]),
    network: z.array(z.string()).default([]),
  }),
  /** The connection types the widget's settings ask for — "needs a Synology connection". */
  connections: z.array(z.string()).default([]),
  size: z.number().int().min(1),
  sha256: Sha256Schema,
  url: PackageUrl,
  publishedAt: z.iso.datetime(),
  /** Older releases kept downloadable, newest first, for a rollback. */
  previous: z.array(DownloadSchema).default([]),
})
export type IndexWidget = z.infer<typeof IndexWidgetSchema>

/**
 * A theme, as the index lists it.
 *
 * No `sdk`, no `permissions`, no `connections`: a theme is a JSON file of colour tokens, it runs
 * nothing and reaches nothing, and there is nothing for a user to consent to. What it does carry
 * that a widget does not is `tokens` — four of them, the ones a card paints as a swatch strip,
 * so a theme needs no preview image and the card needs no second request.
 */
export const IndexThemeSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  version: z.string().regex(SEMVER_RE),
  name: LocalizedTextSchema,
  description: LocalizedTextSchema,
  author: z.string().max(200).optional(),
  license: z.string().max(64).optional(),
  /** A link the admin renders, so https and nothing else — unlike a package URL. */
  homepage: z.url({ protocol: /^https$/ }).optional(),
  tokens: z.object({
    accent: z.string().min(1).max(64),
    bg: z.string().min(1).max(64),
    surface: z.string().min(1).max(64),
    text: z.string().min(1).max(64),
  }),
  size: z.number().int().min(1),
  sha256: Sha256Schema,
  url: PackageUrl,
  publishedAt: z.iso.datetime(),
  previous: z.array(DownloadSchema).default([]),
})
export type IndexTheme = z.infer<typeof IndexThemeSchema>

export const RegistryIndexSchema = z.object({
  registry: z.string().min(1).max(64),
  generatedAt: z.iso.datetime(),
  schema: z.literal(INDEX_SCHEMA_VERSION),
  widgets: z.array(IndexWidgetSchema),
  /**
   * Absent in the first indexes this repository published, which is why it defaults rather than
   * being required. `schema` stays 1: nothing was installed from those, so there is no
   * compatibility to keep — and a Fremkit that does not read themes ignores the key anyway.
   */
  themes: z.array(IndexThemeSchema).default([]),
})
export type RegistryIndex = z.infer<typeof RegistryIndexSchema>
