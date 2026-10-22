# Active projects by district proof (#33)

## Dependency audit

Audited `main` at `7a22c72`, against issues #28–#33 on October 22, 2026. No open PR was found for these dependencies. All five remain open; none is implemented end to end.

| Issue | Existing code | This bounded proof adds | Still deferred |
| --- | --- | --- | --- |
| [#28](https://github.com/danmaps/webmap_ai/issues/28) scope/completeness | Queries return capped arrays; MapLibre reads rendered/loaded features | Explicit scope/completeness on summaries; stable-ID deduplication before counting | Migrating all query envelopes, MapLibre deduplication, query UI |
| [#29](https://github.com/danmaps/webmap_ai/issues/29) semantics | Description exists on layer summary but is dropped by TS context | Optional authored count rules in layer schema; TS description/rule propagation | Python context parity, units, related layers, general configuration precedence |
| [#30](https://github.com/danmaps/webmap_ai/issues/30) tool feedback | Direct demo has a bounded loop; backend executes only once | Separate read-only, provider-neutral proof runner with IDs, retry deduplication, limits, projected feedback, terminal errors | Backend continuation protocol and demo integration |
| [#31](https://github.com/danmaps/webmap_ai/issues/31) aggregation | No summary tool; memory query is capped at 50 | Optional adapter capability, validated registry/router tool, complete local count by entity or feature | Sum/budget rules, production connectors, richer filters |
| [#32](https://github.com/danmaps/webmap_ai/issues/32) receipts | Query SQL shown without actual operation provenance | Local summary receipts plus attempted execution evidence on unsupported/failed calls; answer links | Universal receipts, MapLibre UI, remote request redaction |

[#24](https://github.com/danmaps/webmap_ai/issues/24) and [#26](https://github.com/danmaps/webmap_ai/issues/26) are also open. There is no implemented application configuration model to reuse yet. The optional schema declaration is a small authored capability seam, not a second application configuration system. No prerequisite issue should be closed by this proof.

## Run locally

```sh
npm ci
npm run check
npm run proof:projects
# Clean Markdown with inspectable evidence, after building:
node examples/active-projects/run.mjs > /tmp/active-projects-proof.md
```

The same tests run under existing CI without credentials. CI also runs the built example and uploads its Markdown evidence as `active-projects-proof`.

Prompt: **How many active projects are there by district?**

| Path | West viewport | East viewport |
| --- | --- | --- |
| Complete dataset | North 12, South 9, West 6; total 27 | Same totals |
| Loaded tiles (synthetic local snapshots) | Incomplete; district totals withheld | Incomplete; district totals withheld |

The fixture's expected totals are independently written literals, not calculated using the aggregation implementation. It contains 30 projects with three stable segment IDs per project: 27 active and three inactive. Four repeated feature representations bring input size to 94, deduplicated to 90. There are 81 matching active segments. Feature-count mode returns North 36, South 27, West 18. A normal legacy memory query still returns only 50 records; the summary reads the full local source separately.

The complete path ignores viewport and display filter state. The loaded-tile stand-in returns North segments in the west view (43 inputs, 39 unique), and South segments in the east view (30 inputs, 30 unique). It never implies dataset coverage, including when empty. This is a synthetic adapter-local simulation, not a live MapLibre tile integration.

## Rules and outcome contract

- District is a declared attribute. No spatial joins or inferred assignments.
- `Active` and `ACTIVE` map to `active` only through the authored status mapping. There is no automatic case folding.
- Feature identity is `FeatureSample.id`; entity identity is `project_id`. Repeated stable feature IDs are deduplicated before counting. Conflicting copies of an ID are ambiguous.
- All unique segments must agree on their entity's district and normalized status, checked **before** filtering. Missing/null entity, district, or status is ambiguous. Unmapped string statuses retain exact equality semantics.
- The sole supported filter is equality on the authored status field; the sole grouping field is the declared district field. Query limits, extra arguments, arbitrary SQL, and guessed count modes are rejected.
- `ok: true/status: complete/groups: []` is a valid empty answer. `unavailable` means no supported source/capability; `ambiguous` means conflicting or missing grouping data; `incomplete` means only loaded tiles. Execution exceptions yield `ok: false` with attempted execution evidence. None of these is coerced into zero.
- The runner advertises only schema and summary tools. The model receives projected schema metadata and summary results, not raw rows or geometry. Five rounds, eight calls per round, and a 32,000-character serialized state/turn bound apply. Repeated IDs reuse results; changed arguments under the same ID terminate. Provider errors propagate.
- A pre-tool model message is discarded. Final text requires summary execution and always includes evidence anchors. Non-complete or failed outcomes replace model prose with a deterministic limitation/error. Complete-answer prose remains model-generated and is not itself an arithmetic correctness guarantee.
- Receipts identify the local source, validated arguments, viewport, timestamp, actual operation, counts, and method. No SQL is executed. The fixture has no credentials, production attributes, or geometry. This is not a universal remote-adapter redaction guarantee.

## Observed checks and manual live-model status

Offline checks run on October 22, 2026: complete totals remained 12/9/6 across viewport movement; loaded coverage changed from 43 to 30 inputs and both answers refused totals. Tests exercise empty, unavailable, ambiguous, execution-error, malformed-call, duplicate-ID, payload-limit, provider-error, and round-limit behavior. The scripted mock explicitly reads returned schema and summary feedback. This verifies orchestration and arithmetic, not language-model quality.

**Live-model check: not run.** No live-provider credential was available. Do not treat the issue's live-model acceptance criterion as completed. An optional manual adapter uses the demo's existing OpenRouter provider:

```sh
# Set OPENROUTER_API_KEY securely in your shell; optionally set OPENROUTER_MODEL.
npm run build
node examples/active-projects/run.mjs --live > /tmp/active-projects-live.md
```

Review all four transcripts: schema inspection, entity counting with the mapped status, summary feedback before final text, stable complete totals, refusal of loaded-tile totals, and evidence links. Record model, date, observed tool calls, and any failures here after running. A premature answer or exhausted loop is a failed check, not a fallback claim of success. Exact prose and live-provider responses are deliberately excluded from CI.

This proof leaves the existing demo/backend chat paths and legacy query contracts in place. It does not implement SiteSignal, new hosting, external GIS services, a new framework, or production data support.
