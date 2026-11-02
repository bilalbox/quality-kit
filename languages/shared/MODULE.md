# Shared layer

Not a Pack: templates every Host Pack (js-ts, dart, kotlin-android) composes into its Contribution. Templates: `languages/shared/templates/`. Adapter: `scripts/packs/shared.ts`.

Shared Placements carry `shared: true`, resolve their template here (`templatePath` in `scripts/kit-fs.ts`), and are placed once however many Hosts are selected: every Host contributes the same template, so the overlap guard treats it as an identical overlap, not a collision. apply and audit label them `[shared]`.

| Path | Kind |
| --- | --- |
| `.betterleaks.toml` | owned |
| `.betterleaksignore` | seed |
| `.github/actions/setup-betterleaks/action.yml` | owned |
| `tools/quality/install-betterleaks.sh` | owned |
| `tools/quality/run-secret-scan.sh` | owned |

Each Host adds its own **Pack allowlist**, `.betterleaks.d/<pack>.toml` (owned), from its own templates.

## Secrets (Betterleaks)

Betterleaks **v1** (pin 1.x until v2 is stable), offline detection only (no `--validation`).

### Wrapper

`tools/quality/run-secret-scan.sh [--staged] [--verbose] [-- extra betterleaks args]`. Plain bash, no Node and no Host `lib.sh`, so every Host runs the same script. Prefers `betterleaks-v1` on PATH, then `betterleaks`, and refuses any other major version.

| Mode | Command |
| --- | --- |
| `--staged` (pre-commit) | `betterleaks git --staged` |
| default (local gate) | `betterleaks dir .` (working tree + untracked) |
| `CI=true` | `betterleaks git --log-opts=origin/main..HEAD` (fallback: full `git`) |

Hosts call it from: js-ts `pnpm lint:secrets` (`.husky/pre-commit` passes `--staged`, `gate:fast` runs it); dart and kotlin-android `lefthook.yml` (`--staged`), `gate.sh`, `make secrets`.

### Config and allowlists

Betterleaks takes one config file. `[extend]` cannot combine `useDefault = true` with `path`, and `[allowlist]` cannot be mixed with `[[allowlists]]` (both verified on 1.9.0). So the wrapper builds the config at scan time: `.betterleaks.toml`, then every `.betterleaks.d/*.toml` in name order, concatenated into a temp file passed with `-c`.

- `.betterleaks.toml` (shared): `useDefault = true` plus the allowlist every Host had (`tests/`, `fixtures/`, `.env`, `.env.*`) and apply's `.quality-kit.lock.json` (path-keyed sha256 hashes trip `generic-api-key` on the `run-secret-scan.sh` entry).
- `.betterleaks.d/<pack>.toml` (one per selected Host): that Pack's extra entries. Additive only: an allowlist entry can only skip more paths, never re-enable one the shared config skips.
- Every `.betterleaks.d/*.toml` holds only `[[allowlists]]` / `[[rules]]` tables. A top-level key would attach to the previous file's last table, and `[extend]` / `[allowlist]` clash with the shared config. A test enforces this for the kit's own files.
- Target-specific entries go in a new file such as `.betterleaks.d/local.toml`; audit does not track it, and the kit files stay matching.
- `.betterleaksignore` (seed) holds fingerprints of acknowledged legacy leaks or fixtures, passed with `-i`.

### Install

- **CI**: each Host's workflow job (single-Host template or a job inside the composed multi-Host workflow) runs `./.github/actions/setup-betterleaks` right after checkout. It runs `install-betterleaks.sh` and adds `~/.local/bin` to `PATH`. The Host `setup-*` actions no longer install Betterleaks.
- **Linux (local)**: `./tools/quality/install-betterleaks.sh [DEST]` (default `~/.local/bin`).
- **macOS**: `brew install --cask betterleaks/tap/betterleaks@1` (gives `betterleaks-v1`).

`install-betterleaks.sh` downloads the Linux x64/arm64 release archive and refuses it (exit 1, nothing installed) unless its SHA-256 matches the hash pinned in the script. Decision: pin the hashes in the script instead of fetching the release's `checksums.txt` at install time, so a replaced release asset (and its checksum file) is still caught. Bump: change `VERSION` and copy both `linux_*` hashes from that release's `checksums.txt`.

## Pins

| Tool | Pin |
| --- | --- |
| Betterleaks | 1.9.0 (1.x line); SHA-256 per Linux arch in `install-betterleaks.sh` |
