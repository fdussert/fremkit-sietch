# Vendored from Fremkit

`widgets/manifest.ts`, `net/private.ts` and `backup/zip.ts` are **byte-for-byte copies** of the
files of the same name under `server/src/` in
[fdussert/fremkit](https://github.com/fdussert/fremkit). They are copied rather than submoduled
so a clone of this repository builds with nothing but `pnpm install`, and `check-vendor.ts`
(run by both workflows) fetches the upstream files and refuses a difference — a schema that
drifted would have the registry publish widgets the Fremkit installer then refuses.

Do not edit them here. Change them upstream, then copy them over in their own commit.

`config/schema.ts` and `i18n.ts` are not copies: they are the smallest stand-ins for what
`manifest.ts` imports from them — one regular expression, and the English half of the messages
the schema quotes. `check-vendor.ts` checks the regular expression against upstream too.
