One folder per theme: `themes/<id>/theme.json`, and at most a `README.md` beside it.

A theme is colour tokens and nothing else — no code, no permissions, nothing for a user to
consent to. Copy `themes/fremkit/theme.json` from the main repository, change the id and the
values, and run `pnpm validate`. See ../CONTRIBUTING.md.

`fremkit` and `edge` ship with Fremkit and cannot be published here.
