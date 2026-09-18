# Vendored from Fremkit

`widgets/manifest.ts`, `net/private.ts` and `backup/zip.ts` are **byte-for-byte copies** of the
files of the same name under `server/src/` in
[fdussert/fremkit](https://github.com/fdussert/fremkit). They are copied rather than submoduled
so a clone of this repository builds with nothing but `pnpm install`, and `check-vendor.ts`
(run by both workflows) fetches the upstream files and refuses a difference — a schema that
drifted would have the registry publish widgets the Fremkit installer then refuses.

It compares against a **pinned commit**, `VENDOR_REF` in `check-vendor.ts`, not against `main`.
Against a branch the check would start failing the moment somebody touched the schema upstream,
on a pull request that has nothing to do with it and whose author cannot fix it here.

Do not edit them here. Change them upstream, then copy them over and bump `VENDOR_REF` in the
same commit — that commit is where the decision to adopt a new schema belongs. Before the
Fremkit commit exists on GitHub, `FREMKIT_RAW_BASE=/path/to/fremkit pnpm check-vendor` reads it
off a local checkout instead.

`config/schema.ts` and `i18n.ts` are not copies: they are the smallest stand-ins for what
`manifest.ts` imports from them — one regular expression, and the English half of the messages
the schema quotes. `check-vendor.ts` checks the regular expression against upstream too.
