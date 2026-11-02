# Quality kit

Copy-in quality gates organized by language pack. Apply moves a target repo toward a Desired state; audit reports how a target differs from it.

## Language

**Pack**:
A language-specific set of quality-gate templates and rules that can be selected for a Target (js-ts, python, rust, dart, kotlin-android).
_Avoid_: language module, plugin, recipe

**Host Pack**:
A Pack that owns a standalone quality-gate story for a Target (CI, hooks, gate entrypoint, root templates). Today: js-ts, dart, kotlin-android.
_Avoid_: primary pack, base pack

**Fragment Pack**:
A Pack that only contributes pieces into a Host Pack’s Desired state (extra templates, gate fragments). Today: python onto js-ts.
_Avoid_: addon, plugin, extension pack

**Shared layer**:
Templates every Host Pack composes into its Contribution (today: Betterleaks secret scanning), placed once however many Hosts are selected. Not a Pack: it is never selected or detected on its own. Lives in `languages/shared/`.
_Avoid_: common pack, base layer, shared pack

**Desired state**:
The complete inventory of files, placements, and package.json expectations that selected Packs imply for a Target.
_Avoid_: plan, projection, conformance checklist, expected layout

**Contribution**:
What one selected Pack adds toward Desired state (root placements, optional package-scoped placements, optional package.json pieces).
_Avoid_: delta, patch, fragment (reserved for Fragment Pack)

**Placement**:
One template file mapped to a path in the Target, contributed by a Pack. Every Placement has a Placement kind.
_Avoid_: copy path, template entry

**Placement kind**:
How audit judges a Placement. One of three:
- **owned**: kit-owned; the Target copy must match the template, so drift is meaningful.
- **seed**: copied once, then the Target owns it; audit checks presence (and that JSON seeds parse), never content.
- **merge-into**: the kit's content must appear in a destination file (`AGENTS.quality.md` → `AGENTS.md`); audit checks the destination for the kit's markers. The destination may be the placed path itself when a Target usually brings its own file (`pyproject.toml`, `Makefile`).
_Avoid_: file type, mode, policy

**Target**:
The repository path that apply mutates or audit inspects.
_Avoid_: project, repo (when meaning the path under `--target`)
