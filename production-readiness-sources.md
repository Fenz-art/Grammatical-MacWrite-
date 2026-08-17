# Production Readiness Sources

## External operational guidance

| Source | Assessment use |
|---|---|
| [OWASP API4:2023 — Unrestricted Resource Consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/) | Supports requirements for input ceilings, per-client rate limits, provider-spend controls, timeouts, and alerts on the LLM transformation path. |
| [OWASP Top 10 for LLM and GenAI Applications](https://genai.owasp.org/llm-top-10/) | Frames LLM-specific risks including prompt injection, sensitive-information disclosure, improper output handling, and unbounded consumption. |
| [Google SRE Workbook — Example Error Budget Policy](https://sre.google/workbook/error-budget-policy/) | Supports defining measurable service-level objectives, error budgets, release gates, and incident-postmortem rules before scaled rollout. |

## Code evidence to assess

The application currently has deterministic semantic validation, structured-content preservation, provider-safe block sizing, sequential client-side paste queueing, browser SSE consumption, retry/cancellation behavior, typed tRPC inputs, persisted transformation history, instance-local rolling metrics, and a 77-test regression suite. The assessment will distinguish these established strengths from deployment-level needs such as durable queues, distributed rate limits, durable telemetry, tracing, quotas, and incident operations.
