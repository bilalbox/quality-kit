# quality-kit

Copy-in templates and a skill for shared quality gates by language pack: JS/TS (Biome, `tsc -b`, rev-dep, complexity ratchet, husky/CI), optional Python (`uvx`), with Rust/Dart packs reserved.

## Use

```bash
pnpm install
pnpm run audit -- --target ~/mycode/<repo>
pnpm apply -- --target ~/mycode/<repo>
pnpm apply -- --target ~/mycode/<repo> --packs js-ts,python
```

Packs are detected from the target, or set with `--packs`. `--python` adds the python pack.

Agent skill: [SKILL.md](SKILL.md) (symlinked as `quality-gates`, user-invoked). Shared reference: [REFERENCE.md](REFERENCE.md). Pack modules: `languages/*/MODULE.md`.

## Layout

- `languages/<pack>/templates/` — files `apply` copies into a target repo
- `languages/<pack>/MODULE.md` — pack tools, pins, post-apply steps
- `scripts/audit.ts` / `scripts/apply.ts` — conformance report and idempotent copy-in
