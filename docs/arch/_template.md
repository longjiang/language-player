# Architecture Document Template

## Metadata
- **Arch ID**: ARCH-NNN
- **Feature**: [Name of the feature or system being documented]
- **Type**: analysis | proposed | as-built | reference | schema
- **Status**: draft | accepted | superseded
- **Created**: YYYY-MM-DD
- **Last Updated**: YYYY-MM-DD
- **ROADMAP Phase**: [from ROADMAP.md — e.g., "Phase 3: Explore + Video Player"]
- **Scope**: [Which apps this applies to — e.g., "Classic (legacy), GO (reference), Next.js Web (active)"]
- **Supersedes**: [Link to any prior doc this replaces]
- **See also**:
  - [Link to related arch docs]
  - [Link to ADRs]
  - [Link to specs]
  - [Link to relevant source files]

---

## Overview

[One to three paragraphs describing what this feature/system is, why it exists, and what problem it solves. Include the key architectural insight — the one thing a reader must understand.]

---

## Context

[For **analysis** or **as-built** docs: Describe the current state of the codebase, what was examined, and why this documentation is needed.]

[For **proposed** docs: Describe the problem that prompted this architecture, constraints, and options considered.]

---

## Tech Stack

[For app-level overviews (001, 002, 003): List the frameworks, libraries, state management, database, auth mechanism, and deployment.]

| Layer | Technology |
|---|---|
| **Framework** | [e.g., Nuxt 2 (Vue 2), Next.js 14, Expo SDK 51] |
| **UI** | [e.g., BootstrapVue, React Native, Tailwind CSS] |
| **State** | [e.g., Vuex, React Context, Redux] |
| **Backend** | [e.g., Directus 8 + Python Flask API] |
| **Auth** | [e.g., Directus JWT] |
| **Database** | [e.g., MySQL, SQLite, PostgreSQL] |
| **i18n** | [e.g., nuxt-i18n, next-intl, react-intl] |

---

## Route Map / Structure

[For app-wide docs: List the route structure or file organization.]

```
# Directory tree or route map
path/
├── route-a.vue           ← Description
└── route-b/
    └── [param].vue        ← Description
```

[For feature-specific docs: Describe the component tree or data flow.]

---

## Architecture / Data Flow

[The core of the document. Describe how data moves through the system.]

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Source     │ ──► │   Processor  │ ──► │   Consumer   │
└─────────────┘     └─────────────┘     └─────────────┘
     │                    │                    │
     ▼                    ▼                    ▼
  [Detail]            [Detail]             [Detail]
```

### Flow Steps

1. **[Step name]** — Description of what happens. Reference source files.
2. **[Step name]** — Description.
3. **[Step name]** — Description.

### Key Design Decisions

| Decision | Rationale |
|---|---|
| [e.g., Static generateMetadata] | [Why this was chosen over alternatives] |
| [e.g., Server-side dictionary lookup] | [Trade-offs and benefits] |

---

## Key Components / Screens

[For UI-focused docs: List the main components, their responsibilities, and file locations.]

### [Component/Screen Name]

| Property | Value |
|---|---|
| **File** | `path/to/file.tsx` |
| **Purpose** | What this component does |
| **Props/Inputs** | What it receives |
| **States** | Loading, empty, error, edge cases |

### [Another Component/Screen Name]

| Property | Value |
|---|---|
| **File** | `path/to/file.tsx` |
| **Purpose** | What this component does |
| **Props/Inputs** | What it receives |
| **States** | Loading, empty, error, edge cases |

---

## API Endpoints

[For backend docs: Table of endpoints.]

| Endpoint | Method | Purpose | Input | Output |
|---|---|---|---|---|
| `/path/to/endpoint` | GET/POST | What it does | Params | Response shape |

---

## Database Schema

[For data-focused docs: Table schemas, record counts, indexing strategy.]

### Table: `table_name`

| Column | Type | Description |
|---|---|---|
| `id` | string | Primary key |
| `name` | string | Description |

---

## States & Edge Cases

[For UI features: Document all states the UI can be in.]

| State | Condition | Rendering |
|---|---|---|
| **Loading** | Data not yet available | Skeleton/spinner |
| **Empty** | No data to display | Empty state with CTA |
| **Error** | API failure | Error message + retry |
| **Edge case** | [Describe] | [What happens] |

---

## Key Files

[Reference all relevant source files for this feature/system.]

| File | Role |
|---|---|
| `apps/web/src/path/to/file.tsx` | [Description of what this file does] |
| `packages/shared/src/types.ts` | [Description] |
| `zerotohero-python-server/routes/...` | [Description] |

---

## Legacy References

[For **analysis** docs: Map the Classic or GO implementation for cross-reference.]

### Classic (Nuxt) — `zerotohero-nuxt/`

| File | Purpose |
|---|---|
| `path/to/file.vue` | Equivalent component or route |

### GO (React Native) — `language-player-3/`

| File | Purpose |
|---|---|
| `path/to/file.tsx` | Equivalent component or route |

---

## Consequences

[Document the trade-offs and implications of this architecture.]

### Pros
- [Benefit]
- [Benefit]

### Cons / Risks
- [Drawback or risk]
- [Drawback or risk]

### Migration Notes
[If this supersedes an older approach, what needs to change and in what order.]

---

## Open Questions

- [Anything unresolved, uncertain, or needing future investigation]
- [Assumptions that may need validation]

---

## Related Documents

- [Link to relevant ADR](path/to/adr.md)
- [Link to relevant spec](path/to/spec.md)
- [Link to related arch doc](path/to/arch.md)
