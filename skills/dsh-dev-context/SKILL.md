---
name: dsh-dev-context
description: How to obtain and use the local DeepSeek Harness (DSH) development context before building DSH plugins, presets, or UI. Use whenever a task mentions DSH, DeepSeek Harness, cordis plugins, or extending this harness.
---

# DSH development context

DSH (DeepSeek Harness) is a Cordis-based agent harness. A profile is an ordered stack of bundle patch layers plus the user's own patch layer; a bundle is an npm package whose `package.json` declares `dsh.bundle.patch`; the patch inserts plugin rows `{ id, name, config }`; host plugins export `apply(ctx, config)`; UI plugins register components into slots; every registration is an effect owned by a context.

Do not develop for DSH from memory. The installed version is the only authority, and this machine has a generated index that points at it.

## 1. Read the index first

Open:

- Windows: `%USERPROFILE%\.dsh\dev-context\INDEX.md`
- macOS/Linux: `~/.dsh/dev-context/INDEX.md`

It is small (about 100 lines). It contains the version key, five mental models, and a "task → authoritative file" table whose paths are absolute and point into the readable DSH installation.

## 2. If it is missing or stale

Regenerate it:

```
node <dsh-dev-context>/scripts/check.mjs --update
```

Typical locations of `<dsh-dev-context>`:

- profile install: `%USERPROFILE%\.dsh\profiles\<profile>\node_modules\dsh-dev-context`
- checkout: wherever the repository is cloned

`node <dsh-dev-context>/scripts/check.mjs --status` exits `0` when fresh, `1` when the DSH version changed or a referenced file disappeared.

## 3. Then read only what the task needs

The index names the exact current files: plugin authoring skill, host/UI/MCP references, templates, composition references, and package READMEs. Read those files — they are the installed version's own documentation. Keep the index as a map, not as content.

## 4. Authority rules

- The readable install (the npm `dsh` package, e.g. `%APPDATA%\npm\node_modules\@deepseek-ai\dsh`) is the source of truth for package docs and `lib/types/*.d.ts`.
- The GUI runs from `app.asar`, which ordinary file tools cannot read. Never cite a path inside it; use the readable install of the same version family.
- `dsh --profile web --dump-config` and `--dump-config-schema` show a composed profile. `desktop` is owned by the Electron app, and the CLI refuses to dump it.
- Inside a live DSH session, `cordis_inspect_query` (`Service`, `Event`, `Config`, `Tool`, `Slots`, `Theme`) is exact ground truth.

## 5. When the index is not enough

Ask a fresh DSH agent instead of guessing:

```
dsh --profile headless "<question>"
```

It runs with the shipped DSH skills and costs one model call.

## Non-DSH harnesses

This file is the whole interface: read the index, run the check script if needed. No MCP server, no daemon, no credentials.
