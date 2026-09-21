# Changelog

What changed for the person using this widget, version by version. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the newest version is first, and the
entry of the version being published is what the Fremkit admin shows before an update.

## 2.0.0 — 2026-09-21

### Changed
- **The widget brings its own connection.** It no longer needs the Homey connection type built
  into Fremkit: it declares the address, the key and the three requests it makes, and the core
  holds the key and makes the calls. The widget never sees it.
- **One key for both Homey widgets.** The declaration is the same shape as the one the flows
  widget makes, so Fremkit offers to reuse the connection you already have. A Homey invalidates
  the previous key when a new one is issued, which is exactly what two connections used to cost
  you. An existing Homey connection is migrated by Fremkit, key intact — nothing to redo.

### Removed
- The device picker. The list of devices came from the connection type built into Fremkit, and a
  declared connection has none, so the devices are named by id now — or tick "every device" and
  filter by zone. A selection made with the old picker keeps working until you edit the list.

## 1.1.2 — 2026-09-21

### Changed
- Says "API key refused" when the Homey answers 401, instead of "Homey offline": the Homey is
  there, what it wants is a new key.

## 1.1.1 — 2026-09-18

### Changed
- Reads the theme's colours, fonts and text scale.

## 1.1.0 — 2026-09-18

### Added
- First release on the registry. The devices of a Homey hub on a grid of tiles: state, and a
  touch to switch, dim or set one.
