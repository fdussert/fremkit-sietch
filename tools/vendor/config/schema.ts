/**
 * The one thing `widgets/manifest.ts` needs from Fremkit's config schema. See ../README.md:
 * the shape is checked against upstream by `check-vendor.ts`, the rest of that file is a
 * dashboard's worth of types this repository has no use for.
 */
export const WIDGET_ID_RE = /^[a-z0-9_-]+$/
