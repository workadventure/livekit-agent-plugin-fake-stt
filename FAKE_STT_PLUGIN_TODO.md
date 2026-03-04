# Fake STT LiveKit Plugin - Standalone Project TODO

## Context

We need a deterministic STT plugin for LiveKit Agents to run automated tests without external STT providers.

Target outcome:

- standalone open-source project
- published to GitHub
- published to npm
- full CI/CD for test, quality checks, release, and package publication

This TODO is written to be reusable in a completely new project.

## Fixed Project Decisions

- npm package: `@workadventure/livekit-agents-plugin-fake-stt`
- GitHub repository: `workadventure/livekit-agents-plugin-fake-stt`
- license: MIT
- runtime/CI Node version: 24
- module format: ESM-only
- TypeScript/build config: modern defaults
- release policy: stable releases from `main` only
- release tool: `release-please` (manual release flow via release PR)
- npm publish auth: GitHub trusted publishing (OIDC) only
- npm provenance: not required
- examples: required from first release
- test bar: unit + integration
- dependency updates: Dependabot

## Objectives

- Implement a fake STT provider compatible with `@livekit/agents`.
- Emit deterministic partial/final transcripts suitable for E2E assertions.
- Keep zero runtime dependency on external STT APIs.
- Provide production-ready repo hygiene: docs, tests, CI, releases, npm publishing.

## Non-goals

- Replacing real STT providers in production voice workloads.
- Building a full speech recognition engine.
- Supporting every possible scripting format in v1.

## Proposed Design

### Project scope

New standalone package:

- `@workadventure/livekit-agents-plugin-fake-stt`

### Runtime behavior

Plugin emits deterministic `SpeechEventType` events:

- `START_OF_SPEECH`
- `INTERIM_TRANSCRIPT`
- `FINAL_TRANSCRIPT`
- `END_OF_SPEECH`
- optional `RECOGNITION_USAGE`

No network calls. No API keys.

### Deterministic script model

Default script example:

- Segment A: partial, partial, final
- Segment B: partial, final

Script should support:

- text sequence
- per-step delays
- optional stable seed/offset controls for repeatability

## Backlog

- [x] `P00` Repository bootstrap
  - Create new GitHub repository.
  - Set project metadata:
    - MIT license
    - README skeleton
    - CODEOWNERS
    - CONTRIBUTING
    - SECURITY policy
  - Acceptance:
    - repository is initialized with baseline OSS files.

- [x] `P01` Package scaffold
  - Create npm package skeleton for `@workadventure/livekit-agents-plugin-fake-stt`:
    - `package.json`
    - `tsconfig.json`
    - build config (`tsup` or `tsc`)
    - `src/index.ts`
  - Configure exports for ESM-only package.
  - Set `engines.node` for Node 24.
  - Acceptance:
    - package builds and local import works.

- [x] `P02` Implement STT class
  - Implement `STT` extending `stt.STT`.
  - Capabilities:
    - `streaming: true`
    - `interimResults: true`
  - Expose config options:
    - deterministic script
    - timing controls
    - seed/offset behavior
  - Acceptance:
    - class instantiates and returns a stream object.

- [x] `P03` Implement SpeechStream engine
  - Implement `SpeechStream` extending `stt.SpeechStream`.
  - Deterministic event emission sequence:
    - start, interim updates, final updates, end
  - Handle `flush`, `endInput`, and abort safely.
  - Acceptance:
    - for same config/input, emitted events are strictly deterministic.

- [x] `P04` Unit tests
  - Add test suite for:
    - event order
    - finality transitions
    - abort/close behavior
    - deterministic repeatability
  - Add coverage reporting.
  - Acceptance:
    - tests are stable in CI and cover core behavior.

- [ ] `P05` Integration smoke test with LiveKit Agents
  - Add minimal integration example/test showing plugin usage inside an AgentSession.
  - Validate produced transcriptions are consumable by standard handlers.
  - Acceptance:
    - integration smoke test passes locally and in CI.

- [x] `P06` API docs and examples
  - Write complete README:
    - install
    - usage
    - config options
    - deterministic testing recipes
  - Add runnable examples under `examples/`.
  - Acceptance:
    - user can install and use plugin from README alone.

- [x] `P07` Linting, formatting, static checks
  - Add:
    - ESLint
    - Prettier
    - TypeScript `--noEmit` check
  - Add npm scripts and pre-commit hooks (optional).
  - Acceptance:
    - code quality checks enforced consistently.

- [x] `P08` CI pipeline (GitHub Actions)
  - Create workflows for:
    - install + lint + typecheck + test on PR
    - Node 24
    - build artifact verification
  - Add dependency cache and concurrency controls.
  - Acceptance:
    - PRs are gated by automated quality pipeline.

- [ ] `P09` Release automation
  - Use `release-please` as the release strategy.
  - Configure release-please on `main` only.
  - Generate changelog and release PR automatically.
  - Keep release operation manual by reviewing/merging the release PR.
  - Acceptance:
    - merging release PR creates tagged stable release reproducibly.

- [ ] `P10` npm publication pipeline
  - Configure npm trusted publishing from GitHub Actions using OIDC only.
  - Add workflow for publish on release/tag created from `main`.
  - Acceptance:
    - package publishes automatically to npm from CI.

- [ ] `P11` GitHub release workflow
  - Generate GitHub Release notes from changelog/release artifacts.
  - Attach build metadata if useful.
  - Acceptance:
    - every published version has a corresponding GitHub release entry.

- [ ] `P12` Supply chain and maintenance hardening
  - Add:
    - Dependabot
    - `npm audit` or equivalent CI check
    - lockfile policy
  - Document support policy and version compatibility.
  - Acceptance:
    - maintainability and security baseline are in place.

- [ ] `P13` v1.0.0 release checklist
  - Validate:
    - docs complete
    - examples verified
    - CI green
    - release automation tested
    - npm package installable and functional
  - Acceptance:
    - `v1.0.0` published on GitHub and npm with working CI/CD.

## Suggested Execution Order

1. `P00` to `P03` (core implementation)
2. `P04` to `P06` (quality and usability)
3. `P07` to `P08` (engineering guardrails and CI)
4. `P09` to `P11` (release and publication automation)
5. `P12` to `P13` (hardening and final release)

## Definition of Done

- Standalone fake STT plugin project exists and is documented.
- Plugin is published on npm.
- Source and releases are published on GitHub.
- CI/CD covers lint, typecheck, tests, build, versioning, and publish.
- CI/CD runs on Node 24 and includes unit + integration tests.
- The package is usable as a deterministic STT provider in LiveKit Agents.
