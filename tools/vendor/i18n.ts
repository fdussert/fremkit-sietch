/**
 * The stand-in for Fremkit's translator. See ../vendor/README.md.
 *
 * Fremkit answers in the user's language; this repository is English throughout and its only
 * reader is a pull request author looking at a CI log, so `tr` ignores the locale and returns
 * the English string. Only the keys `widgets/manifest.ts` quotes are here — a key it grows
 * without one being added lands in the log as the key itself, which is ugly but never silent.
 */
const MESSAGES: Record<string, string> = {
  'manifest.suggestWhenWithoutSuggest': 'suggestWhen only applies to a field that declares suggest',
  'manifest.connectionNeedsType': 'a connection setting must declare connectionType',
  'manifest.pickNeedsConnection': 'a pick setting must declare connection',
  'manifest.pickNeedsSource': 'a pick setting must declare source',
  'manifest.listNeedsItemSchema': 'a list setting must declare itemSchema',
  'manifest.defaultSizeTooSmall': 'defaultSize must be greater than or equal to minSize',
  'manifest.badVersion': 'invalid version: a semver number is expected (1.2.3)',
  'manifest.badHomepage': 'homepage must be an https URL',
  'manifest.badLicense': 'license must be an SPDX identifier (MIT, Apache-2.0…)',
  'manifest.reservedChannel': 'channel reserved for the host',
  'manifest.privateNetworkHost': 'a private or local host is not allowed in permissions.network',
  'manifest.previewNotACommand': 'a preview\'s channel must be listed in commands',
  'manifest.badPreview': 'preview must be a .webp or .png file in the widget folder (a relative path, no ..)',
  'manifest.badConnectionPath': 'invalid path: "/segment", with * (one segment) or ** (the rest), no query and no ..',
  'manifest.connectionNeedsHost': 'a connection must declare exactly one "host" field, typed by the user',
  'manifest.connectionHostNotSecret': 'the "host" field is not a secret: it is shown wherever the connection is',
  'manifest.connectionSecretCount': 'this connection kind takes exactly one secret field (none for "host")',
  'manifest.connectionHeaderName': 'headerName belongs to api-key-header only, and is required there',
  'manifest.connectionQueryName': 'queryName belongs to api-key-query only, and is required there',
  'manifest.connectionNameTaken': 'this name belongs to a built-in connection type; pick another',
  'manifest.connectionHintTooLong': 'hint is over 2000 characters',
}

export function tr(_locale: unknown, key: string): string {
  return MESSAGES[key] ?? key
}
