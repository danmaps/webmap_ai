# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- GitHub Actions CI workflow running `npm ci`, `npm run typecheck`, `npm run build`, and `npm test` on every push and pull request.
- GitHub Actions release workflow that publishes to npm on `v*` version tags via OIDC trusted publishing (no stored token), gated by `npm publish --dry-run`.
- Vitest runtime test suite covering `MapAssistantRouter` and the memory/MapLibre adapters.
- `LICENSE` file (ISC) and completed `package.json` metadata (`author`, `publishConfig`).

## [0.1.0] - Unreleased

Initial scaffold:

- Provider-neutral `MapAssistantRouter` and adapter contract.
- `MemoryMapAssistantAdapter` and `MapLibreMapAssistantAdapter`.
- FastAPI backend with LLM tool-calling support.
- MapLibre demo app with an AI assistant panel.

[Unreleased]: https://github.com/danmaps/webmap_ai/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/danmaps/webmap_ai/releases/tag/v0.1.0
