# Semantic Versioning Skill

When completing a task that changes user-facing behavior, assess the semver impact and remind the user to update versioning artifacts before merging.

## Versioning Rules (SemVer 2.0.0)

| Bump | When | Examples in this app |
|------|------|----------------------|
| **Patch** (`x.y.Z`) | Bug fixes, typo corrections, styling tweaks, internal refactors with no behavior change | Fix calculation rounding, fix dark-mode contrast, update dependency patch versions |
| **Minor** (`x.Y.0`) | New features, new tabs, new API support, non-breaking additions | Add a new tab, support a new billing API field, add export functionality |
| **Major** (`X.0.0`) | Breaking changes to user workflow, env var renames, removed features, Docker volume/port changes | Rename `VITE_DEV_ENTERPRISE_URL`, drop a tab, change default port |

## What to Update

When a PR warrants a version bump, ensure these are updated:

1. **`CHANGELOG.md`** — Add entry under `## [Unreleased]` with the appropriate category (Added, Changed, Fixed, Removed)
2. **`package.json` version** — Bump according to the rules above (only at release time, not every PR)
3. **Docker image tag** — New tags are cut automatically by CI on GitHub Release publish

## When to Trigger

After completing any code change, check:

- Does this PR change what the user sees or does? → Needs a CHANGELOG entry
- Does this PR change Docker behavior (ports, env vars, volumes)? → Likely a major bump
- Is this purely internal (refactor, dev tooling, CI config)? → No version bump needed, but still add to CHANGELOG under `### Internal`

## Reminder Template

If a CHANGELOG entry is needed, suggest:

```markdown
## [Unreleased]

### Added/Changed/Fixed/Removed
- <one-line description of the change>
```

## Docker Tag Strategy

- `latest` — always points to the most recent release
- `X.Y.Z` — immutable tag for each release
- `X.Y` — floating tag for latest patch within a minor
- Images are published to `ghcr.io/octodemo/copilot-budget-command-calculator`
