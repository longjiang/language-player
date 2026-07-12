# SPEC-002: Repository Migration Strategy

## Metadata
- **Spec ID**: SPEC-002
- **Feature**: Gradual migration of legacy repos into monorepo
- **Status**: accepted
- **Created**: 2026-07-12
- **ROADMAP Phases**: 7, 8, 9 (see ROADMAP.md for canonical phase numbering)

## Overview
We have three legacy repositories that must be consolidated into the monorepo without losing Git history. The migration is spread across the final three ROADMAP phases — each repo is merged only when its monorepo replacement is stable.

## Mapping to ROADMAP Phases

| Migration Step | Legacy Repo | Target Path | ROADMAP Phase | Trigger |
|---------------|-------------|-------------|---------------|---------|
| Step A | `zerotohero-python` | `apps/api/` | **Phase 7** — Backend Consolidation | Web app is feature-rich and we need atomic API+client changes |
| Step B | `language-player-3` | `apps/mobile/` | **Phase 8** — Mobile Integration | Web app is near feature parity; ready to work on mobile again |
| Step C | `zerotohero-nuxt` | `apps/classic/` | **Phase 9** — Sunset Classic | Web app fully replaces Classic; archival only |

## Current State (ROADMAP Phase 1)

```
language-player/                    ← monorepo git repo (new)
├── apps/web/                       ← NEW — Next.js app (tracked)
├── packages/                       ← NEW — shared packages (tracked)
├── zerotohero-nuxt/                ← LEGACY — Vue 2/Nuxt 2 (.gitignored)
├── language-player-3/              ← LEGACY — Expo 51 (.gitignored)
├── zerotohero-python/              ← LEGACY — Flask (.gitignored)
```

The three legacy directories each contain their own `.git/` folder — they are **independent Git repositories**. They are listed in `.gitignore` so the monorepo does not track them yet. Agents read them for implementation reference but NEVER edit them.

## Why Not Just `git add` Them?

If we `git add zerotohero-nuxt/` while it contains its own `.git/`, Git does NOT track the files. Instead, it creates a **gitlink** — a submodule reference pointing to the commit SHA of that repo. This is not what we want because:

1. **No history in the monorepo** — the monorepo only stores a SHA pointer, not the actual code or history
2. **Fragile** — if the old repo is deleted or moved, the monorepo can't build
3. **Not searchable** — `git log` in the monorepo won't show changes to migrated files
4. **No atomic commits** — can't change `apps/api/` + `apps/web/` in one commit

## Step A: Merge Python Backend (ROADMAP Phase 7)

**Trigger**: `apps/web` has Auth, Explore, Video Player, Dictionary, Content Features, and User Features built. We need atomic API changes alongside client changes.

```bash
# From the monorepo root:
git remote add python-backend ../zerotohero-python
git fetch python-backend
git merge --allow-unrelated-histories -s ours python-backend/main
git read-tree --prefix=apps/api/ -u python-backend/main
git commit -m "chore: merge zerotohero-python history into apps/api/"
git remote remove python-backend
```

**Post-merge actions**:
1. Remove `zerotohero-python/` from `.gitignore`
2. Add `apps/api/` to Turborepo pipeline (`turbo.json`)
3. Update `apps/web/.env.local` to point to `apps/api/` if running locally
4. Archive old `zerotohero-python` GitHub repo (read-only)
5. Verify `git log --follow apps/api/app.py` shows original history

## Step B: Merge React Native App (ROADMAP Phase 8)

**Trigger**: `apps/web` is near feature parity with Classic. We're ready to invest in mobile again.

```bash
git remote add mobile ../language-player-3
git fetch mobile
git merge --allow-unrelated-histories -s ours mobile/main
git read-tree --prefix=apps/mobile/ -u mobile/main
git commit -m "chore: merge language-player-3 history into apps/mobile/"
git remote remove mobile
```

**Post-merge actions**:
1. Remove `language-player-3/` from `.gitignore`
2. Wire `apps/mobile` to import from `@langplayer/*` packages
3. Replace direct Axios calls with `@langplayer/api-client`
4. Archive old `language-player-3` GitHub repo (read-only)
5. Verify `git log --follow apps/mobile/app.json` shows original history

## Step C: Merge Classic — Archival (ROADMAP Phase 9)

**Trigger**: `apps/web` fully replaces Classic. Classic is shut down.

```bash
git remote add classic ../zerotohero-nuxt
git fetch classic
git merge --allow-unrelated-histories -s ours classic/main
git read-tree --prefix=apps/classic/ -u classic/main
git commit -m "chore: merge zerotohero-nuxt history into apps/classic/ (archival)"
git remote remove classic
```

This is purely archival — the code lives in the monorepo for historical reference. The old deployment is shut down and URLs are redirected to the new Next.js app.

**Post-merge actions**:
1. Remove `zerotohero-nuxt/` from `.gitignore`
2. Archive old `zerotohero-nuxt` GitHub repo (read-only)
3. Set up redirects from `languageplayer.io/en/zh/...` → new URL structure
4. Verify `git log --follow apps/classic/nuxt.config.js` shows original history

## Risk Mitigation

- **Each step is reversible** — the old repo still exists until archived
- **`read-tree --prefix=`** preserves every commit, author, date, and message
- **`-s ours`** merge strategy prevents conflicts (we're adding history, not merging content)
- **Spread across final 3 ROADMAP phases** — never two "live" copies of the same code

## Open Questions
- Should `apps/api/` (Python) be deployed as part of the monorepo CI or remain an independently deployed service?
- For Step C (Nuxt archival): should we merge at all, or just leave it as a read-only archive on GitHub?
