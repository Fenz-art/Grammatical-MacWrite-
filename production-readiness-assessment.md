# Grammatical Production and Scaling Readiness Assessment

**Assessment date:** 17 August 2026  
**Scope:** Current Grammatical MacWrite application, including semantic transformations, structured Markdown protection, review finalization, glossary workflow, history, streaming, exports, and instance-local monitoring.

## Executive conclusion

Grammatical is **ready for a controlled, low-volume pilot after basic access and abuse controls are added**, but it is **not yet ready to scale as a general public or enterprise production service**. The product layer is unusually mature for this stage: typed streaming contracts, deterministic semantic validation, Unicode-aware processing, structure-preserving Markdown handling, user-controlled review decisions, review provenance, and a broad automated test suite are all established.

The limiting factor is not the editing experience. It is the absence of the distributed operational controls that turn a correct single-instance workflow into a dependable multi-user service. The transformation endpoint is public, request work executes directly against the provider, queueing is browser-local, retry policy is short and fixed, and metrics are intentionally in-memory and scoped to one process. Those choices are appropriate for development and demos, but they create availability, abuse, cost, and observability risks under sustained traffic.

> **Readiness decision:** Approve a guarded pilot once P0 controls are complete. Do not approve an open public launch, paid tier, or enterprise commitments until the P0 and core P1 items below are complete and supported by load-test evidence.

## Evidence reviewed

| Area | Verified evidence | Interpretation |
|---|---|---|
| Product correctness | 16 Vitest files and **79 passing tests**; TypeScript and production build pass. | Strong deterministic regression baseline, but not a substitute for concurrency or endurance testing. |
| Semantic safety | Deterministic post-provider validation checks structured content, entities, terminology, numerical/URL/code evidence, Unicode, whitespace, and risk explanations. | A meaningful content-integrity control; it reduces semantic regressions but is not a complete security boundary. |
| Structured documents | Typed Markdown nodes preserve fences, commands, identifiers, links, table framing, and card structure while transforming eligible prose or opted-in comment bodies. | Suitable for technical drafting workflows and GitHub-style PR descriptions. |
| Human review | Side-by-side source/proposal decisions, explicit finalization, reopen behavior, and final report provenance. | Excellent trust and reviewability feature for pilot users. |
| Provider resilience | Provider selection, bounded block size, short retries, cancellation signaling, and retryable failure classification exist. | Useful fault handling; insufficient distributed backpressure, timeout, and provider-failover controls for scaled traffic. |
| Observability | Dashboard tracks latency, outcomes, provider failures, and queue throughput. | Current registry is capped in process memory and explicitly reports `current-instance`; it cannot support fleet-wide SLOs or incident response. |

## What is production-quality today

Grammatical has an unusually strong **application correctness and trust layer**. The app uses typed request, result, semantic-check, and streaming-event boundaries rather than passing unstructured model output through the product. It analyzes and validates provider candidates before accepting them, retains source text after semantic rejection, and distinguishes accepted, rejected, cancelled, and retryable provider states.

The document workflow is also well engineered. Large pastes are boundary-aware and ordered; Markdown and technical blocks are parsed rather than treated as ordinary prose; review decisions are explicit; and the change report identifies the final document, source, proposal, accepted/rejected transformations, review finalization time, profile, and semantic-risk evidence. This substantially improves reviewability compared with a conventional “rewrite and replace” editor.

The system also has good evidence-preservation habits. It protects Unicode, emojis, meaningful whitespace, names, URLs, code-like tokens, and selected glossary terms. The latest browser verification exercised auto-detected terminology, granular accept/reject decisions, finalization gating, structured Markdown reconstruction, code-comment mode, glossary export, and report export.

## Scaling and production gaps

| Dimension | Current state | Risk at scale | Release impact | Required remedy |
|---|---|---|---|---|
| Access control and quotas | The transformation subscription is a public procedure; no server-side per-user or per-IP quota is evident. | Anonymous or scripted traffic can consume provider capacity and spend. | **P0 blocker** | Require authenticated transformation access for production, enforce distributed per-user/IP rate and concurrency limits, and expose a clear quota response. |
| Resource and cost protection | Request schema bounds a block, but no global rate, provider budget, concurrency semaphore, or cost circuit breaker is present. | Burst traffic, large multi-block documents, and retries can amplify provider spend and degrade all users. | **P0 blocker** | Enforce request, document, concurrent-job, token, and provider-spend limits; create cost alerts and circuit-breaker behavior. |
| Queue durability | Large-paste sequencing is managed in browser state. | Refreshes, disconnects, or browser closure abandon remaining client queue work; retries are not durable. | **P1** | Move jobs to a durable server-side queue with persisted state, idempotency keys, resumable progress, and explicit cancellation. |
| Provider resilience | Fixed short retry delays; no explicit provider timeout, adaptive backoff, circuit breaker, or multi-provider routing. | Cascading failures during upstream degradation and high tail latency. | **P0/P1** | Add deadlines, exponential backoff with jitter, provider health state, bounded retry budget, and controlled fallback after semantic-compatibility evaluation. |
| Observability | Metrics are in-memory, retained only for recent samples, and scoped to one instance. | No reliable aggregate error rate, P95/P99 latency, cost, queue age, or incident evidence after a restart or across replicas. | **P0 blocker** | Emit durable structured telemetry and traces; create dashboards, alerts, and retention policies for aggregated non-content metadata. |
| SLO and incident operations | No declared SLOs, error budget, paging policy, runbook, or postmortem trigger. | Launch decisions are subjective and reliability regressions are discovered late. | **P0 blocker** | Define SLIs/SLOs and error-budget policy; require postmortems and release freezes for material budget consumption. |
| Security for LLM inputs | Strong output validation and structured preservation exist, but no comprehensive prompt-injection test suite, abuse policy, or sensitive-data policy is visible. | User-controlled text can attempt instruction override or include confidential data; third-party provider exposure requires explicit governance. | **P0/P1** | Add adversarial prompt/security evaluations, provider data-handling review, content-retention policy, redaction guidance, and least-privilege operational controls. |
| Data governance | History is account scoped and deletable, but no documented retention period, export/deletion SLA, audit boundary, or prompt/model version provenance is visible. | Enterprise compliance and incident reconstruction are limited. | **P1** | Define retention, deletion, export, consent, data classification, audit metadata, and review-decision provenance policies. |
| Performance | The client bundle is approximately 1.21 MB minified (about 338 KB gzip) and the review diff uses an LCS calculation with a fallback threshold. | First-load latency and browser CPU can degrade on lower-end devices or long documents. | **P1** | Code-split infrequent panels/export libraries, virtualize long review lists, profile document diff CPU/memory, and establish client performance budgets. |
| Deployment and recovery | Managed deploy/checkpoint flow is available, but no documented multi-environment promotion, database migration policy, rollback drill, disaster-recovery target, or load test evidence exists. | Release and recovery risk grows with user and data volume. | **P1** | Establish dev/staging/production promotion, schema migration discipline, rollback tests, backup/recovery objectives, and regular traffic simulations. |

## Security and reliability context

The risk profile is consistent with recognized API and GenAI guidance. OWASP identifies unrestricted resource consumption as a failure to appropriately limit items such as execution time, memory, process/file limits, upload sizes, operation counts, and third-party spending; it recommends explicit parameter limits, client rate limits, and spending controls.[1] Grammatical already bounds several request fields and blocks, but it still needs the distributed rate, concurrency, timeout, and spend controls required to apply that guidance at production scale.

For LLM systems, OWASP’s GenAI guidance explicitly treats prompt injection, sensitive-information disclosure, improper output handling, and unbounded consumption as core lifecycle risks.[2] Grammatical addresses part of improper output handling with deterministic acceptance guards and does not grant the model external agency. However, its output guard should be complemented by production security controls around who may invoke the model, how data is retained, and how adversarial inputs are measured and contained.

Reliability should be made measurable rather than aspirational. Google’s SRE guidance describes an error budget as the complement of an SLO and uses it to balance release velocity against user-facing reliability; its example halts non-critical changes when the budget is exhausted.[3] Grammatical currently reports useful local metrics, but it needs shared telemetry and explicit targets before this policy can be meaningfully applied.

## Recommended service objectives for a guarded pilot

These are proposed starting objectives, not measured claims. Establish them only after baseline load and provider measurements.

| Signal | Proposed pilot objective | Measurement rule | Action if missed |
|---|---|---|---|
| Accepted transformation availability | ≥ 99.5% over 28 days, excluding user cancellations | Completed accepted result / eligible requests | Freeze feature launches if error budget is exhausted. |
| Provider response latency | Define P50/P95/P99 separately by document-size band | From server-side start to validated completion | Reduce concurrency or route traffic when P95 breaches the agreed threshold. |
| Semantic rejection rate | Monitor by mode, profile, and structured-document type | Rejected candidate / non-empty provider candidate | Investigate guard false positives and provider/prompt drift. |
| Queue wait time | Define maximum P95 queue delay for each tier | Durable job enqueue to provider start | Autoscale workers or throttle new jobs. |
| Cost per accepted output | Establish a ceiling by mode and document-size band | Provider usage and accepted result count | Trip spending circuit breaker or lower allowed intensity/document size. |
| Review completion | Track finalized review / completed output | User action telemetry without raw text | Use to refine UX; never treat it as a quality proxy alone. |

## Launch plan

### P0 — required before any open or paid launch

First, require authenticated transformation access and enforce distributed rate limits, concurrent-job ceilings, document/token budgets, request timeouts, and provider-spend alerts. Second, move operational telemetry out of process memory and create aggregate dashboards for availability, accepted latency, provider failure classes, semantic rejection rate, queue age, and spend. Third, define SLOs, an error-budget policy, incident runbooks, and a release/rollback process. Finally, conduct adversarial input testing and document data retention and provider-handling policy.

### P1 — required before high-volume or enterprise commitments

Introduce a durable job state machine and queue so multi-block work survives browser disconnects. Add idempotency, resumable progress, controlled cancellation, dead-letter handling, and model/prompt/guard version metadata for reproducibility. Code-split non-critical panels and export paths, virtualize very long review outputs, and run load, soak, chaos, and browser-performance tests against realistic documents and traffic patterns.

### P2 — maturity improvements

Consider region-aware deployment, provider diversity with independently evaluated semantic behavior, tenant-level audit controls, policy-managed glossary libraries, approval workflows, and enterprise retention controls. These are valuable for scale and regulated customers, but should not substitute for the core P0 controls.

## Final assessment

Grammatical is **product-ready but operations-incomplete**. It is a credible candidate for a small, permissioned beta because its user-facing workflow is transparent, reviewable, and protected by deterministic safeguards. It is not yet suitable for broad public scale because an unauthenticated streaming transformation path, browser-local queue, non-durable metrics, and absence of SLO/rate/cost/incident controls leave the service vulnerable to abuse, unpredictable cost, and difficult recovery.

With the P0 controls implemented and load-tested, Grammatical can move to a guarded production pilot. With durable work orchestration, fleet-wide observability, performance budgets, and documented data governance, it can become a sound basis for broader production growth.

## References

[1]: https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/ "OWASP API4:2023 — Unrestricted Resource Consumption"
[2]: https://genai.owasp.org/llm-top-10/ "OWASP Top 10 for LLM and GenAI Applications"
[3]: https://sre.google/workbook/error-budget-policy/ "Google SRE Workbook — Example Error Budget Policy"
