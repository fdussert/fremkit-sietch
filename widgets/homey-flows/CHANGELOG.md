# Changelog

What changed for the person using this widget, version by version. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the newest version is first, and the
entry of the version being published is what the Fremkit admin shows before an update.

## 2.0.0 — 2026-09-19

### Changed
- **Declares its own connection.** The widget now reads the Homey itself: the address and the
  API key are a connection you create in the admin, Fremkit holds the key and makes only the
  four requests this widget declares. Nothing else on the Homey is reachable.
- Because that is a new permission, the update asks again.

### Removed
- No longer reads the `homey:*` channels. The built-in Homey connection type and its provider
  are unchanged and still serve `homey-devices`.

## 1.1.1 — 2026-09-18

### Changed
- Reads the theme's colours, fonts and text scale.

## 1.1.0 — 2026-09-18

### Added
- First release on the registry. The flows of a Homey hub as buttons, each starting one.
