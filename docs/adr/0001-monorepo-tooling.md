# ADR-0001: Monorepo Tooling — Turborepo + npm Workspaces

**Date**: 2026-07-12
**Status**: accepted

## Context
We are consolidating three separate repos (Nuxt web app, React Native mobile app, Python backend) into a single monorepo. We need a build system and package manager that supports:
- Multiple apps (Next.js, Expo, Flask)
- Shared TypeScript packages
- Incremental builds (only rebuild what changed)
- Parallel task execution

## Options Considered

### Option A: Turborepo + npm workspaces
- **Pros**: Simple setup, no new tool to install, npm workspaces built into Node, Turborepo is fast and well-documented, great caching
- **Cons**: No `workspace:*` protocol support (npm limitation), slower installs than pnpm

### Option B: Nx
- **Pros**: Powerful code generation, dependency graph visualization, advanced caching
- **Cons**: Heavier, steeper learning curve, overkill for 3 apps + 3 packages

### Option C: pnpm workspaces + Turborepo
- **Pros**: Fast installs, `workspace:*` protocol, disk-efficient
- **Cons**: Requires installing pnpm, another tool to manage

## Decision
**Option A: Turborepo + npm workspaces**

Rationale: npm workspaces are sufficient for this scale. The team already has npm. No `workspace:*` needed — `*` version works fine for internal packages. If install speed becomes an issue, we can migrate to pnpm later (the Turborepo config stays the same).

## Consequences
- Use `"*"` for internal package versions (not `"workspace:*"`)
- Must run `npm install` from root (not individual packages)
- All packages share a single `node_modules` at root via hoisting
