# Shared layer

Not a Pack: templates every Host Pack (js-ts, python, dart, kotlin-android) composes into its Contribution. Templates: `languages/shared/templates/`. Adapter: `scripts/packs/shared.ts`.

Shared Placements carry `shared: true`, resolve their template here (`templatePath` in `scripts/kit-fs.ts`), and are placed once however many Hosts are selected: every Host contributes the same template, so the overlap guard treats it as an identical overlap, not a collision. apply and audit label them `[shared]`.

| Path | Kind |
| --- | --- |
| `.betterleaks.toml` | owned |
| `.betterleaksignore` | seed |
| `.github/actions/setup-betterleaks/action.yml` | owned |
| `.github/actions/check-baseline-growth/action.yml` | owned |
| `.github/actions/setup-osv-scanner/action.yml` | owned |
| `osv-scanner.toml` | seed |
| `tools/quality/install-betterleaks.sh` | owned |
| `tools/quality/install-osv-scanner.sh` | owned |
| `tools/quality/run-secret-scan.sh` | owned |
| `tools/quality/check-baseline-growth.sh` | owned |
| `tools/quality/run-vuln-scan.sh` | owned |

Each Host adds its own **Pack allowlist**, `.betterleaks.d/<pack>.toml` (owned), from its own templates.

## Secrets (Betterleaks)

Betterleaks **v1** (pin 1.x until v2 is stable), offline detection only (no `--validation`).

### Wrapper

`tools/quality/run-secret-scan.sh [--staged] [--verbose] [-- extra betterleaks args]`. Plain bash, no Node and no Host `lib.sh`, so every Host runs the same script. Prefers `betterleaks-v1` on PATH, then `betterleaks`, and refuses any other major version.

| Mode | Command |
| --- | --- |
| `--staged` (pre-commit) | `betterleaks git --staged` |
| default (local gate) | `betterleaks dir .` (working tree + untracked) |
| `CI=true` | `betterleaks git --log-opts=origin/$GITHUB_BASE_REF..HEAD` (fallback: full `git` when the base ref is unset or missing) |

Hosts call it from: js-ts `pnpm lint:secrets` (`.husky/pre-commit` passes `--staged`, `gate:fast` runs it); python / dart / kotlin-android `lefthook.yml` (`--staged`), `gate.sh`, `make secrets`.

**CI range decision:** the wrapper reads GitHub Actions' `GITHUB_BASE_REF` (the PR base branch name) and scans `origin/$GITHUB_BASE_REF..HEAD`. Every Host `ci.yml` sets `actions/checkout` `fetch-depth: 0` so that remote-tracking base ref exists. No hard-coded `main`. `workflow_dispatch` (no base ref) falls back to a full `git` scan. Allowlist path patterns apply in **both** `dir` and `git`/`--staged` modes on Betterleaks 1.9.0 (verified), so files that must fail when committed (`.env`, keystores, signing props, test sources) must not be allowlisted at all.

### Config and allowlists

Betterleaks takes one config file. `[extend]` cannot combine `useDefault = true` with `path`, and `[allowlist]` cannot be mixed with `[[allowlists]]` (both verified on 1.9.0). So the wrapper builds the config at scan time: `.betterleaks.toml`, then every `.betterleaks.d/*.toml` in name order, concatenated into a temp file passed with `-c`.

- `.betterleaks.toml` (shared): `useDefault = true` plus fixtures and apply's `.quality-kit.lock.json` (path-keyed sha256 hashes trip `generic-api-key` on the `run-secret-scan.sh` entry). No `tests?/` glob (it hid Android `src/test/` and every test dir), no `.env` / signing-file skips, and no project-specific `[[rules]]` (Pack rules like js-ts `retell-key-prefix` live in `.betterleaks.d/`).
- `.betterleaks.d/<pack>.toml` (one per selected Host): that Pack's extra entries. Additive only: an allowlist entry can only skip more paths, never re-enable one the shared config skips. Packs do not allowlist test sources, `.env`, `*.jks` / `*.keystore`, or `key.properties` — committing those with a leak must fail.
- Every `.betterleaks.d/*.toml` holds only `[[allowlists]]` / `[[rules]]` tables. A top-level key would attach to the previous file's last table, and `[extend]` / `[allowlist]` clash with the shared config. A test enforces this for the kit's own files.
- Target-specific entries go in a new file such as `.betterleaks.d/local.toml`; audit does not track it, and the kit files stay matching.
- `.betterleaksignore` (seed) holds fingerprints of acknowledged legacy leaks or fixtures, passed with `-i`.

### Install

- **CI**: each Host's workflow job (single-Host template or a job inside the composed multi-Host workflow) checks out with `fetch-depth: 0`, then runs `./.github/actions/setup-betterleaks`. It runs `install-betterleaks.sh` and adds `~/.local/bin` to `PATH`. The Host `setup-*` actions no longer install Betterleaks.
- **Linux (local)**: `./tools/quality/install-betterleaks.sh [DEST]` (default `~/.local/bin`).
- **macOS**: `brew install --cask betterleaks/tap/betterleaks@1` (gives `betterleaks-v1`).

`install-betterleaks.sh` downloads the Linux x64/arm64 release archive and refuses it (exit 1, nothing installed) unless its SHA-256 matches the hash pinned in the script. Decision: pin the hashes in the script instead of fetching the release's `checksums.txt` at install time, so a replaced release asset (and its checksum file) is still caught. Bump: change `betterleaks` in `pins.json` (version + both `linux_*` hashes from that release's `checksums.txt`) and the matching literals in `install-betterleaks.sh` / this table.

## Baseline growth

`tools/quality/check-baseline-growth.sh` (+ composite action) compares committed baselines on HEAD to the PR base ref and fails when rows are added. Every Host `ci.yml` invokes `./.github/actions/check-baseline-growth` after checkout on `pull_request`, unless the PR has label `allow-baseline-growth`. Inventory and row rules: REFERENCE.md "Baseline growth". `osv-scanner.toml` ignore `id`s are included so the vuln ignore file ratchets with the same guard.

## Dependency vulns (osv-scanner)

osv-scanner **v2.7.0**, covers pnpm / npm, Pub, Gradle, and uv lockfiles (and other ecosystems the binary supports). Wired into every Host's **full** gate only (not `gate:fast` / pre-commit).

### Wrapper

`tools/quality/run-vuln-scan.sh [-- extra osv-scanner args]`. Plain bash, no Node and no Host `lib.sh`. Runs `osv-scanner scan source -r . --allow-no-lockfiles` so a Target with no lockfiles yet is green; a known-vulnerable pin fails the gate (osv-scanner exit 1).

Hosts call it from: js-ts `pnpm lint:vulns` (on `pnpm gate`); python / dart / kotlin-android `gate.sh full` (and `make vulns`).

### Decisions

- **Offline**: online by default (needs the OSV DB). Do not pass `--offline` / `--offline-vulnerabilities`. A network failure fails the gate; cache an offline DB only if a Target deliberately opts in via extra args.
- **Severity**: no kit-side threshold. Whatever osv-scanner reports as a finding fails the gate (its own filtering of unimportant / uncalled findings stands; pass `--all-vulns` only via extra args if a Target wants stricter).
- **Ignores**: seed `osv-scanner.toml` (`[[IgnoredVulns]]`). Upstream allows a missing `reason`; the wrapper **requires** both `id` and a non-empty `reason` before scanning. Audit treats the file as seed (presence / parse, not content). Added ignore ids also fail the baseline-growth CI check (see above).

### Install

- **CI**: each Host `ci.yml` runs `./.github/actions/setup-osv-scanner` next to `setup-betterleaks`. It runs `install-osv-scanner.sh` and adds `~/.local/bin` to `PATH`.
- **Linux (local)**: `./tools/quality/install-osv-scanner.sh [DEST]` (default `~/.local/bin`).

`install-osv-scanner.sh` downloads the Linux amd64/arm64 release binary and refuses it (exit 1, nothing installed) unless its SHA-256 matches the hash pinned in the script (same decision as Betterleaks: pin hashes in the script, do not trust a fetched `osv-scanner_SHA256SUMS` alone). Bump: change `osvScanner` in `pins.json` (version + both `linux_*` hashes from that release's `osv-scanner_SHA256SUMS`) and the matching literals in `install-osv-scanner.sh` / this table.

## Pins

Source: kit-root `pins.json` (see REFERENCE.md "Pins"). Literals below must match.

| Tool | Pin |
| --- | --- |
| Betterleaks | 1.9.0 (1.x line); SHA-256 per Linux arch in `install-betterleaks.sh` |
| osv-scanner | 2.7.0 (SHA-256 per Linux arch in `install-osv-scanner.sh`) |
