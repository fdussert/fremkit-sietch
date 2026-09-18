<p align="center"><img src="https://raw.githubusercontent.com/fdussert/fremkit/main/brand/social/fremkit-social-1280x640.png" alt="Fremkit — widget dashboard for the Corsair Xeneon Edge" width="800"></p>

# Fremkit sietch

The widget registry for [Fremkit](https://github.com/fdussert/fremkit), the widget dashboard
for the Corsair Xeneon Edge on macOS. A *sietch* is where the Fremen keep the tribe's reserves,
and where a newcomer is admitted once the tribe has seen what they bring — which is what this
repository does with widgets. One folder per widget under `widgets/`; a workflow packs
each folder into a zip, computes its hash and publishes an `index.json` on GitHub Pages that the
Fremkit admin browses, installs from and checks for updates against.

- Registry: <https://fdussert.github.io/fremkit-sietch/index.json>
- Writing a widget: [docs/writing-widgets.md](https://github.com/fdussert/fremkit/blob/main/docs/writing-widgets.md) in the main repository
- Publishing one here: [CONTRIBUTING.md](CONTRIBUTING.md)

A widget is plain HTML in a sandboxed iframe: it reaches the host only through the `Fremkit`
bridge, and only for the channels, commands and network hosts its manifest declares. The Fremkit
admin shows those permissions and asks for consent before installing, and again when a new
version asks for more.

## Layout

```
widgets/<id>/manifest.json   what the widget is, its version, the SDK it needs, its permissions
widgets/<id>/index.html      the widget
widgets/<id>/...             any asset it ships (images, fonts, scripts of its own)
tools/                       the validator, the packer and the index builder (TypeScript, vitest)
tools/vendor/                byte-for-byte copies of Fremkit's manifest, zip and address rules
.github/workflows/           validate.yml on a pull request, publish.yml on main
```

The `index.json` and `dist/` are generated: never edit them by hand, never commit them.

## Building it locally

```bash
pnpm install
pnpm test          # the validator, the packer and the index builder
pnpm validate      # every rule, nothing written — what a pull request runs
pnpm build         # the same, plus dist/index.json, dist/widgets/*.zip and dist/index.html
pnpm check-vendor  # the vendored schema is still Fremkit's
```

`pnpm validate` and `pnpm build` read the index currently on Pages, so a version that does not go
up is refused before merge, and older releases stay downloadable for a rollback.

## What gets checked

A package is the widget's folder, zipped: `manifest.json` at the root, `index.html`, its assets.
The CI refuses a folder that

- holds a dotfile, a symlink, a nested archive, an absolute or climbing path, or anything that is
  not a regular file;
- is over 200 files, 5 MB zipped, 20 MB unpacked, or holds a file over 5 MB;
- has a `manifest.json` the Fremkit schema does not accept, or an `id` that is not the folder name;
- declares a private, loopback, link-local or `.local`-style host in `permissions.network`;
- loads a `<script src=>` from outside the package — the widget CSP would block it anyway;
- reuses a published version, or goes backwards from it.

The zip is deterministic — sorted entries, a fixed timestamp, stored rather than compressed — so
rebuilding an unchanged widget produces the same bytes, the same `sha256`, and no pointless
update for anyone who already has it.

## Licence

MIT, for the registry and for every widget in it. By opening a pull request you publish your
widget under that licence.

Fremkit is not affiliated with or endorsed by Corsair or any of the services a widget talks to;
trademarks belong to their owners.
