<!-- One widget per pull request. The CI checks everything that can be checked mechanically;
     this list is the rest, and it is what the review reads. -->

**Widget**: `<id>` — version `<x.y.z>`

- [ ] New widget / [ ] new version of one already published (version bumped, never reused)
- [ ] `id` matches the folder name, and is not the id of a Fremkit built-in
- [ ] Every channel, command and network host the widget uses is declared, and nothing else is
- [ ] `sdk` is the bridge generation it needs, and it runs on a Fremkit that has it
- [ ] Every string coming from a remote service goes through `Fremkit.esc`
- [ ] Labels and descriptions are `{ "fr": …, "en": … }`
- [ ] No personal data anywhere: no real host, IP, token, account, organisation or e-mail —
      `192.0.2.x` / `example.com` / placeholder names only
- [ ] No third-party script, font or stylesheet loaded from another origin
- [ ] Licence: the widget is yours to publish, under this repository's MIT

**What it does, in two lines:**

**What it asks for, and why it needs it:**
