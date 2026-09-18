# Publishing a widget

1. Write it against the main repository's guide,
   [docs/writing-widgets.md](https://github.com/fdussert/fremkit/blob/main/docs/writing-widgets.md),
   and run it from a local `widgets/` folder until it behaves.
2. Give the manifest a `version` (semver) and an `sdk` (the bridge version it needs), and declare
   every channel, command and network host it uses — nothing else is granted.
3. Copy the folder to `widgets/<id>/` here, `<id>` being the manifest's `id`, and open a pull
   request. The CI validates the manifest, refuses private or local network hosts, checks the
   size, and builds the index on merge.
4. Keep the pull request to one widget, in English, with no personal data (hosts, tokens, names,
   screenshots of your own dashboard) — placeholders and the `192.0.2.x` documentation range only.

A new version is the same pull request with `version` bumped. A version that asks for a
permission the previous one did not is shown to every user as a new consent.

Reviews look at what the widget asks for and what it does with remote data (escape it with
`Fremkit.esc`), not at taste. Security concerns: see [SECURITY.md](SECURITY.md).
