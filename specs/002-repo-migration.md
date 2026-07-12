# SPEC-002: Repository Migration Strategy

## Metadata
- **Spec ID**: SPEC-002
- **Feature**: Gradual migration of legacy repos into monorepo
- **Status**: accepted
- **Created**: 2026-07-12
- **Phase**: Cross-cutting (spans all phases)

## Overview
We have three legacy repositories that must be consolidated into the monorepo without losing Git history. The migration is phased to minimize risk: each repo is merged only when the monorepo replacement is stable.

## Current State

```
language-player/                    ← monorepo git repo (new)
├── apps/web/                       ← NEW — Next.js app (tracked)
├── packages/                       ← NEW — shared packages (tracked)
├── zerotohero-nuxt/                ← LEGACY — Vue 2/Nuxt 2 (.gitignored)
├── language-player-3/              ← LEGACY — Expo 51 (.gitignored)
├── zerotohero-python/              ← LEGACY — Flask (.gitignored)
```

The three legacy directories each contain their own `.git/` folder — they are **independent Git repositories**. They are listed in `.gitignore` so the monorepo does not track them yet.

## Why Not Just `git add` Them?

If we `git add zerotohero-nuxt/` while it contains its own `.git/`, Git does NOT track the files. Instead, it creates a **gitlink** — a submodule reference pointing to the commit SHA of that repo. This is not what we want because:

1. **No history in the monorepo** — the monorepo only stores a SHA pointer, not the actual code or history
2. **Fragile** — if the old repo is deleted or moved, the monorepo can't build
3. **Not searchable** — `git log` in the monorepo won't show changes to migrated files
4. **No atomic commits** — can't change `apps/api/` + `apps/web/` in one commit

## Migration Phases

### Phase 1: Reference Only (CURRENT)
- Legacy repos live alongside the monorepo as sibling directories
- **`.gitignored`** from the monorepo
- Agents read them for implementation reference but NEVER edit them
- No Git relationship between monorepo and legacy repos

### Phase 2: Merge Python Backend
**Trigger**: `apps/web` is stable and uses the Flask API heavily.

```bash
# From the monorepo root:
git remote add python-backend ../zerotohero-python
git fetch python-backend
git merge --allow-unrelated-histories -s ours python-backend/main
git read-tree --prefix=apps/api/ -u python-backend/main
git commit -m "chore: merge zerotohero-python history into apps/api/"
git remote remove python-backend
```

### Phase 3: Merge React Native App
**Trigger**: `apps/web` reaches feature parity with Classic AND we're ready to work on mobile again.

```bash
git remote add mobile ../language-player-3
git fetch mobile
git merge --allow-unrelated-histories -s ours mobile/main
git read-tree --prefix=apps/mobile/ -u mobile/main
git commit -m "chore: merge language-player-3 history into apps/mobile/"
git remote remove mobile
```

Then wire `apps/mobile` to import from `@langplayer/*` packages.

### Phase 4: Merge Classic (Nuxt)
**Trigger**: `apps/web` fully replaces Classic. Classic is shut down.

```bash
git remote add classic ../zerotohero-nuxt
git fetch classic
git merge --allow-unrelated-histories -s ours classic/main
git read-tree --prefix=apps/classic/ -u classic/main
git commit -m "chore: merge zerotohero-nuxt history into apps/classic/ (archival)"
git remote remove classic
```

This is purely archival — the code lives in the monorepo for historical reference.

## Post-Migration Actions Per Phase

After each merge:
1. Remove the legacy directory from `.gitignore`
2. Archive the old GitHub repo (make read-only, add note pointing to monorepo)
3. Update CI/CD to build from the new path
4. Verify `git log --follow` works on migrated files

## Risk Mitigation

- **Each phase is reversible** — the old repo still exists until archived
- **`read-tree --prefix=`** preserves every commit, author, date, and message
- **`-s ours`** merge strategy prevents conflicts (we're adding history, not merging content)
- **Phased timeline** means we never have two "live" copies of the same code

## Open Questions
- Should the Python backend stay as `apps/api/` or become a separate service deployed independently?
- For zerotohero-nuxt: should we merge it at all, or just leave it as a read-only archive on GitHub?
