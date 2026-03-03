# Contributing

## Prerequisites

- Node.js 24+
- npm 10+

## Setup

```bash
npm install
```

## Local checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Pull Requests

- Keep changes focused and include tests.
- Update README/examples when behavior or public options change.
- Use conventional commits when possible (`feat:`, `fix:`, `chore:`).

## Release flow

- Releases are managed by `release-please` from `main`.
- Merge the generated release PR to cut a new version.
