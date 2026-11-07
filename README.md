# ChoreoBit

> **Early-stage, under active development.** This repository currently contains only
> infrastructure (workspace, TypeScript, lint/format, test and build tooling). No
> animation functionality is implemented yet.

ChoreoBit is a **code-first animation framework for computer science education**.
Students and instructors write animations in code rather than dragging shapes on a
timeline. ChoreoBit draws on ideas from **Manim** (declarative scene graphs),
**Remotion** (code-driven, deterministic rendering) and **Algorithm Visualizer**
(visualising data structures and algorithms).

## Vision

Make it trivial to author, run and share animated explanations of algorithms,
data structures and mathematical concepts. An author writes a short, readable
program; ChoreoBit turns it into a deterministic, reproducible animation that can
be rendered to video, streamed, or stepped through interactively.

## Key architectural goals

- **Code-first authoring** — animations are ordinary, inspectable source code.
- **Determinism** — the same input always produces the same output (frames).
- **Composition** — primitives and scenes compose cleanly.
- **Educational clarity** — the source a student reads should mirror the concept.
- **Multiple backends** — one authoring layer, pluggable rendering outputs.
- **Open source and extensible** — a public, stable API.

## Planned capabilities (not yet implemented)

- A scene/timeline model and a small set of visual primitives.
- An animation runtime that advances a scene over time.
- Rendering backends (e.g. video, interactive/web).
- An editor or run host for authors.
- Example animations and a documentation site.

> None of the above exists yet. This task establishes only the repository
> foundation. See [Development status](#development-status).

## Repository layout

```
choreobit/
├── packages/      # library packages (e.g. @choreobit/core)
├── apps/          # applications (future: editor / demo host)
├── examples/      # runnable examples (future)
├── docs/          # documentation
├── scripts/       # maintenance scripts
├── .github/       # CI workflows
├── test/          # infrastructure smoke tests
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

## Development setup

Prerequisites:

- **Node.js** `>=22.0.0` (a current LTS line; `>=22` is used so the current and
  maintenance LTS both work).
- **pnpm** `12.18.0` (pinned via the `packageManager` field).

Install dependencies from the repository root:

```bash
pnpm install
```

## Available commands

Run these from the repository root:

| Command             | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `pnpm install`      | Install all workspace dependencies.                    |
| `pnpm lint`         | Lint the repository with ESLint.                       |
| `pnpm format`       | Format all files with Prettier.                        |
| `pnpm format:check` | Check formatting without writing (used by CI).         |
| `pnpm typecheck`    | Type-check the root config and each package.           |
| `pnpm test`         | Run the Vitest suite (includes the infra smoke test).  |
| `pnpm build`        | Build all packages (ESM + declarations + source maps). |
| `pnpm clean`        | Remove build outputs and caches.                       |

## Development status

- [x] pnpm workspace initialized
- [x] Shared TypeScript configuration (base / lib / app)
- [x] ESLint + Prettier configured
- [x] Vitest configured with an infrastructure smoke test
- [x] Library build pipeline (tsup) verified on a fixture package
- [x] GitHub Actions CI configured
- [ ] Scene/timeline model
- [ ] Visual primitives
- [ ] Animation runtime
- [ ] Rendering backend
- [ ] Editor / demo host

This project is in its initial infrastructure phase. Do not assume that any
animation, rendering or runtime capability exists.

## License

MIT (to be finalized).
