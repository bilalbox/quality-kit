# Quality kit

Copy-in quality gates organized by language pack. Apply moves a target repo toward a Desired state; audit reports how a target differs from it.

## Language

**Pack**:
A language-specific set of quality-gate templates and rules that can be selected for a Target (js-ts, python, rust, dart).
_Avoid_: language module, plugin, recipe

**Host Pack**:
A Pack that owns a standalone quality-gate story for a Target (CI, hooks, gate entrypoint, root templates). Today: js-ts, dart.
_Avoid_: primary pack, base pack

**Fragment Pack**:
A Pack that only contributes pieces into a Host Pack’s Desired state (extra templates, gate fragments). Today: python onto js-ts.
_Avoid_: addon, plugin, extension pack

**Desired state**:
The complete inventory of files, placements, and package.json expectations that selected Packs imply for a Target.
_Avoid_: plan, projection, conformance checklist, expected layout

**Contribution**:
What one selected Pack adds toward Desired state (root placements, optional package-scoped placements, optional package.json pieces).
_Avoid_: delta, patch, fragment (reserved for Fragment Pack)

**Target**:
The repository path that apply mutates or audit inspects.
_Avoid_: project, repo (when meaning the path under `--target`)
