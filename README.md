# quality-kit

Copy-in templates and a skill for a shared JS/TS (+ optional Python) quality gate: Biome, `tsc -b`, rev-dep, a cognitive-complexity ratchet, husky/CI, and `uvx` Python tools.

## Use

```bash
pnpm install
pnpm audit -- --target ~/mycode/<repo>
pnpm apply -- --target ~/mycode/<repo>
```

Agent skill: [SKILL.md](SKILL.md) (symlinked as `quality-gates`). Tooling detail: [REFERENCE.md](REFERENCE.md). Adoption: per-repo GitHub spec issues linked from the skill.

## Layout

- `templates/` — files `apply` copies into a target repo
- `scripts/audit.ts` / `scripts/apply.ts` — conformance report and idempotent copy-in
