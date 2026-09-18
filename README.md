<p align="center"><img src="https://raw.githubusercontent.com/fdussert/fremkit/main/brand/social/fremkit-social-1280x640.png" alt="Fremkit — widget dashboard for the Corsair Xeneon Edge" width="800"></p>

# Fremkit widgets

The widget registry for [Fremkit](https://github.com/fdussert/fremkit), the widget dashboard
for the Corsair Xeneon Edge on macOS. One folder per widget under `widgets/`; a workflow packs
each folder into a zip, computes its hash and publishes an `index.json` on GitHub Pages that the
Fremkit admin browses, installs from and checks for updates against.

- Registry: <https://fdussert.github.io/fremkit-widgets/index.json>
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
```

The `index.json` is generated: never edit it by hand, never commit it.

## Licence

MIT, for the registry and for every widget in it. By opening a pull request you publish your
widget under that licence.

Fremkit is not affiliated with or endorsed by Corsair or any of the services a widget talks to;
trademarks belong to their owners.
