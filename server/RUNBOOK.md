# Grammatical Production Runbook

**Owner:** Grammatical service operator  
**Applies to:** Authentication-protected transformation streaming, provider calls, quota admission, durable operational telemetry, and user-visible service degradation.

## Purpose and operating model

Grammatical treats a transformation as an evidence-preserving workflow. A user’s source remains recoverable when admission, provider, deadline, or semantic validation fails. The service records operational metadata for reliability analysis but does **not** store source text, output text, prompts, protected terms, user identifiers, or provider payloads in the telemetry tables.

> **Current launch policy:** This release is suitable for a guarded pilot. It must not be represented as an enterprise SLA or an unrestricted public service until load tests, alert delivery, durable queue recovery, and data-governance P1 work are complete.

## Production control policy

| Control | Enforced value | Behavior | Operator action |
|---|---:|---|---|
| Authentication | Required | Transformation and fleet telemetry routes require a valid Manus OAuth session. | Investigate only repeated account/session errors; never ask users to share cookies or tokens. |
| Per-user short-window quota | 20 transformations/minute | Admission is rejected before provider work; the route sets `Retry-After`. | Check traffic patterns and whether the threshold remains appropriate for the tier. |
| Per-user daily quota | 200 transformations/day | Admission is rejected before provider work; the source stays in the terminal prompt. | Review product quota policy before granting any exception. |
| Fleet concurrency | 6 active transformation leases | A database-backed lease limits simultaneous provider work across autoscaled instances. Leases expire after 120 seconds as a recovery backstop. | Investigate sustained capacity rejections and stale lease patterns. |
| Provider deadline | 45 seconds per upstream attempt | The provider transport receives an abort signal; the user receives a typed `DEADLINE_EXCEEDED` result with source preserved. | Check provider status, retry rate, and latency before increasing deadline. |
| Retry budget | 3 attempts maximum | Retries use bounded equal-jitter backoff, 500 ms base and 6 s cap. | Do not increase retries during provider instability; it increases load and cost. |
| Provider circuit | 5 consecutive failures, 60-second cooldown | New provider attempts fail fast while the circuit is open. | Review provider errors and allow a controlled recovery probe after cooldown. |
| Daily provider reservation | 480,000 reserved completion tokens | Each provider attempt reserves 2,400 maximum completion tokens before calling upstream. | Treat budget exhaustion as a release/operations event; do not bypass it without explicit approval. |
| Fleet telemetry | Trailing 24-hour database aggregate | Records outcome, timing, mode, intensity, queue wait, and sanitized failure class only. | Use the authenticated benchmark dashboard and database metrics for incident evidence. |

## Service-level objectives and error budget

These are guarded-pilot objectives, not claims of historical performance. Validate and adjust them only after representative load tests and provider-baseline collection.

| Service-level indicator | Guarded-pilot objective | Measurement | Error-budget response |
|---|---:|---|---|
| Eligible transformation availability | ≥ 99.5% per 28 days | Accepted completion / eligible admitted requests; user cancellations and semantic rejections are reported separately. | At 50% budget consumed, pause non-critical releases and investigate. At 100%, freeze feature rollout until a corrective action is verified. |
| Provider attempt deadline compliance | ≥ 99% below 45 seconds | `DEADLINE_EXCEEDED` count and durable latency samples. | Reduce admission/concurrency and investigate upstream health. |
| Fleet queue wait | P95 ≤ 5 seconds | Admission-to-provider-start duration from durable samples. | Investigate concurrency limit, database lock contention, and traffic surge. |
| Provider safety guard | 0 calls after budget or open-circuit rejection | `BUDGET_EXHAUSTED` and `PROVIDER_CIRCUIT_OPEN` failure classes. | Treat any unexpected upstream call as a P0 defect. |
| Semantic integrity | 0 accepted candidates that violate deterministic preservation tests | Regression/evaluation corpus plus rejected-guard trend. | Freeze affected prompt/model rollout and preserve source-first behavior. |

Google’s SRE guidance defines the error budget as the complement of the reliability target and uses it to decide when releases should be slowed or halted.[1]

## Alert and paging policy

The authenticated benchmark dashboard is the immediate operational view. Until a managed alert-delivery integration is configured, it is a **manual paging runbook**, not automated pager delivery. The operator must review the dashboard during active pilot windows and immediately open an incident when any of the following occur.

| Severity | Trigger | Response target | Required first actions |
|---|---|---:|---|
| SEV-1 | Confirmed sensitive-data exposure, authentication bypass, or provider budget enforcement bypass. | Acknowledge immediately; mitigate within 15 minutes. | Disable transformations if needed, preserve metadata-only evidence, rotate affected credentials through approved secret management, and begin an incident record. |
| SEV-2 | Circuit remains repeatedly open for 15 minutes, provider failures exceed 10% of admitted requests for 15 minutes, or daily spend budget is exhausted unexpectedly. | Acknowledge within 30 minutes. | Pause non-critical releases, examine sanitized failure classes, provider status, capacity leases, and recent deployment changes. |
| SEV-3 | P95 queue wait objective missed for 30 minutes, durable telemetry is unavailable, or quota/capacity denials rise unexpectedly. | Acknowledge within one business day. | Verify database connectivity and indexes, review sustained traffic, and create a remediation task. |

> **Postmortem trigger:** A SEV-1 or SEV-2, an exhausted 28-day error budget, a rollback, or any confirmed semantic-integrity regression requires a blameless postmortem within five business days.

## Incident procedures

### Provider instability, timeouts, or open circuit

Confirm the failure class in the benchmark dashboard and server logs. Do not collect or copy customer source text into incident notes. Verify whether failures are deadline-driven, upstream HTTP failures, or provider-circuit rejections. Leave the circuit closed only after the cooldown and a controlled low-volume recovery; do not raise retry count or bypass the circuit during an incident. If the provider remains unstable, keep the service in source-preserving degraded mode and communicate that transformations are temporarily unavailable.

### Capacity or quota denials

Inspect concurrent leases and the 24-hour aggregate. Capacity denials may indicate a traffic burst, stuck process, or a concurrency policy that needs recalibration. Expired leases are removed during admission; do not delete active leases manually unless their expiration and request lifecycle have been verified. Quota denials are intentional product controls; do not raise a user’s limit ad hoc without an approved policy change.

### Spend budget exhaustion

Treat budget exhaustion as a safety success, not a reason to disable controls. Verify the durable reservation count, change activity, retry distribution, structured-document fan-out, and provider status. Suspend high-intensity or large-document traffic only through an approved release if required. Any permanent budget change requires product and finance approval, then a code and runbook update.

### Telemetry outage

If fleet telemetry cannot be read, do not infer health from an empty dashboard. Verify database connectivity and migration state, then inspect sanitized server logs. The in-process snapshot may assist short-term diagnosis but is not fleet evidence and is lost on restart. Restore durable writes before declaring the incident resolved.

### Security or privacy event

Stop exposure first. Restrict transform access if necessary, preserve only metadata needed for investigation, and do not export raw prompts or outputs to logs, tickets, or chat. Follow the project’s approved incident and disclosure process. Validate that telemetry, retry logs, and error serialization did not contain user content.

## Data-handling boundary

| Data class | Storage boundary | Operational rule |
|---|---|---|
| User source and edited output | User-controlled transformation history only when the authenticated history flow is used. | Do not copy into metrics, provider-health records, logs, alerts, or postmortems. |
| Prompts and protected terms | Request-scoped provider invocation only. | Do not persist outside user-selected history/output artifacts. |
| Operational telemetry | `transform_metric_events` retains time, duration, queue wait, mode, intensity, outcome, provider-failure flag, and sanitized failure code. | No text, prompt, user ID, or document ID is permitted. |
| Admission controls | Quota windows and leases use opaque account identifier, time window, count, request ID, and expiry. | Use only for access, capacity, and cost enforcement. |
| Provider circuit/spend | Aggregate state and reservation counts. | Never record provider payloads or content. |

## Release and recovery checklist

Before releasing a transformation-path change, run the full Vitest suite, TypeScript check, production build, and an authenticated browser transformation. Confirm schema migrations are reviewed and applied before code relies on them. After release, check the protected benchmark dashboard for telemetry writes and ensure no unexpected provider-circuit, capacity, quota, or deadline events occur.

For a rollback, use the latest known-good application checkpoint. Database tables are additive in this release, so application rollback does not require a destructive schema rollback. After recovery, verify authentication, a small transformation, circuit state, and durable telemetry before reopening traffic.

## References

[1]: https://sre.google/workbook/error-budget-policy/ "Google SRE Workbook — Example Error Budget Policy"
