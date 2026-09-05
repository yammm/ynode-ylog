# Observability Standards

## Scope

Apply this profile with `CODING_STANDARDS.md` to applications, services, workers, libraries, scheduled jobs, and infrastructure-facing tooling whose behavior must be understood in development or production through logs, metrics, traces, events, health signals, and alerts.

Observability exists to answer operational questions and support reliable decisions. It is not a requirement to emit every possible signal. Findings need a concrete diagnostic blind spot, misleading signal, privacy or security risk, unbounded cost, incompatible telemetry contract, or demonstrated reliability impact.

The repository's service objectives, telemetry schema and versions, supported backends, resource model, data classification, retention, sampling, cost budgets, incident process, and exact validation commands are authoritative. Keep security audit records and business analytics distinct where their ownership, integrity, retention, or access requirements differ.

## Operational questions and telemetry contracts

- Start from important user outcomes, failure modes, dependencies, and operator decisions. Emit a signal because it helps answer a named question, not because a library makes instrumentation easy.
- Define stable service, instance, process, job, deployment, version, environment, and region identity consistently across signals.
- Carry tenant or request identity only in signals and fields whose cardinality, privacy, retention, and access contracts permit it. Do not model a tenant as the Resource when one process handles many tenants or force per-tenant values into metric labels merely for cross-signal symmetry.
- Treat event names, log fields, metric names and units, resource attributes, span names, status interpretation, and correlation identifiers as versioned data contracts consumed by alerts, dashboards, automation, and investigations.
- Identify the owner, runbook, expected volume, retention, access policy, and consumer for consequential telemetry. Remove or revise signals whose meaning no longer matches the behavior they claim to represent.
- Instrument success, failure, latency, saturation, cancellation, retries, and rejected work at the boundary that owns the outcome. Do not infer a user result solely from a low-level dependency call.
- Distinguish absence of work from absence of telemetry. Heartbeats, scrape health, export health, or synthetic checks must make silent instrumentation failure detectable where it would mislead operators.

## Structured logs and events

- Emit structured fields for values that consumers filter, aggregate, redact, or correlate. Keep human-readable messages concise and do not require parsing prose to recover stable event meaning.
- Give each event an intentional severity based on operator action and impact. Do not label expected validation failures as system errors or hide data loss and corrupted state at an informational level.
- Use unambiguous timestamps with documented clock and precision semantics. Preserve event time and observation time separately where delayed delivery or buffering makes the distinction material.
- Include safe correlation context such as trace, request, operation, or job identifiers. Do not use a credential, email address, full URL, or other sensitive value as the correlation key.
- Log an error at the boundary that can add useful context or decide its final outcome. Avoid duplicating the same exception at every layer and inflating one failure into many misleading events.
- Preserve structured error category, operation, dependency, outcome, retry state, and safe identifiers without dumping whole requests, records, stack frames, environment variables, or query payloads by default.
- Parse and redact endpoints and connection strings before logging them. Prefer a bounded dependency name or approved target label; never emit embedded credentials, bearer query fields, sensitive database names, or an unreviewed complete URL merely to identify a dependency.
- Define multiline, exception, binary, and untrusted-text behavior for the collector. Prevent log forging and framing ambiguity rather than relying on downstream display escaping.
- Keep startup, configuration, migration, shutdown, and data-loss decisions observable. Routine per-record success logs can be omitted when metrics or traces answer the operational question more safely and cheaply.

## Metrics and dimensionality

- Choose a counter, up-down counter, gauge, histogram, or other instrument whose aggregation semantics match the measurement. Do not encode an event count as a sampled gauge or a current state as an ever-growing counter.
- Name units and boundaries explicitly. Keep numerator and denominator available for ratios so consumers can distinguish a real improvement from missing traffic.
- Use stable, bounded dimensions. User IDs, request IDs, raw URLs, exception messages, timestamps, filenames, and arbitrary input normally create unbounded cardinality and operational risk.
- Normalize route, operation, error category, region, and other dimensions at a trusted application boundary. Do not let attacker-controlled labels create time series or telemetry-storage exhaustion.
- Design histogram boundaries or exponential-histogram configuration around the decisions and latency ranges that matter. Changing boundaries or temporality can make historical comparisons and alert thresholds incompatible.
- Record attempted, accepted, completed, failed, cancelled, retried, dropped, and queued work distinctly when operators need to reconcile flow.
- Make exporter, scrape, aggregation, reset, process-restart, and temporality behavior part of the metric contract. A counter decrease or missing series must not be silently interpreted as a product improvement.
- Review dashboards and recording rules with the instrumentation. A correct metric that is queried with the wrong aggregation, unit, or label set still produces a misleading operational surface.

## Traces and context propagation

- Propagate trace context using the declared standard and trust policy. Parse and validate inbound context, create a new trace when it is invalid, and do not use trace or baggage fields as authentication or authorization evidence.
- Model causal work with parent-child relationships or links that fit the real execution. Queues, fan-out, batching, retries, and asynchronous callbacks do not always have a simple synchronous parent.
- Give spans stable, low-cardinality names based on operations or normalized routes. Put bounded details in attributes rather than embedding identifiers in the span name.
- Record useful boundaries: incoming requests, outgoing dependencies, queue publish and consume, durable jobs, and consequential internal operations. Avoid a span for every trivial function call.
- Define error and status semantics consistently. A handled domain rejection, retry attempt, cancelled operation, dependency failure, and final user failure are not interchangeable.
- Keep span attributes and events within size and count budgets. Do not attach whole payloads, SQL text with values, stack dumps, tokens, or unbounded lists.
- Preserve context through supported concurrency primitives without leaking it into unrelated work. Clear or replace context when pooled workers, reused objects, or background tasks cross request boundaries.
- Treat sampling as an explicit fidelity and cost policy. Head and tail sampling can bias error, latency, and traffic analysis; document what unsampled traffic makes impossible to conclude.

## Correlation and semantic conventions

- Use compatible Resource identities and attribute vocabulary across logs, metrics, and traces while keeping stable Resource attributes separate from operation-scoped attributes. Correlation does not require every signal to carry identical dimensions.
- Record trace and span identifiers in logs only when valid context is present. Do not generate unrelated IDs merely to populate a field.
- Adopt versioned semantic conventions deliberately and record their schema or migration boundary. A moving instrumentation library must not silently rename fields consumed by alerts or dashboards.
- Avoid duplicate automatic and manual instrumentation of the same operation. Verify which library owns propagation, duration, status, and dependency attributes.
- Keep baggage small, necessary, and safe to forward. Baggage can cross process and trust boundaries, increase request size, expose data, and amplify cardinality even when it is not recorded automatically.
- Link deployment, feature-flag, schema-migration, and incident markers to telemetry when they materially help explain changes in behavior.

## Asynchronous work, retries, and dependencies

- Preserve operation or trace context across queue and job boundaries using a versioned envelope. Do not serialize library-internal context objects as an undocumented wire format.
- Measure queue delay separately from execution time and end-to-end completion. A fast worker can coexist with an unacceptable backlog.
- Distinguish each retry attempt from the final logical outcome. Count retries, backoff, exhausted work, duplicate delivery, dead letters, and recovery without reporting every attempt as a separate user failure.
- Carry safe dependency identity, operation, timeout, cancellation, and result category. Avoid high-cardinality hostnames or URLs when a bounded service name answers the operational question.
- Make partial success and abandoned work visible. Batch size, accepted count, completed count, failed count, and reconciliation state may all matter.
- Bound instrumentation performed on an already overloaded path. Telemetry must not turn a dependency slowdown into process-wide memory exhaustion or a retry storm.

## Health, service objectives, and alerting

- Define service-level indicators from observable user outcomes and the exact population being measured. A process being alive is not proof that the required operation can succeed.
- Keep readiness, liveness, startup, and dependency health semantics distinct. Health checks must be bounded, safe, and appropriate to the orchestrator or caller consuming them.
- Set objectives and error budgets only where the product has an agreed reliability target. Document windows, exclusions, low-traffic behavior, and data-quality limitations.
- Alert on conditions that require a timely human or automated action. Give each alert an owner, severity, routing rule, runbook, and evidence that the signal arrives before unacceptable harm.
- Prefer symptom and budget-consumption alerts over isolated resource noise, while retaining capacity warnings that have a credible remediation window.
- Group and deduplicate related failures. One incident should not page every service layer independently without giving responders a useful causal path.
- Exercise alert, notification, escalation, silence, and recovery behavior. A syntactically valid rule that has never reached its receiver is unverified.
- Use synthetic or end-to-end probes where internal telemetry cannot establish the externally visible contract. Keep probe identity and traffic from contaminating business metrics.

## Reliability, backpressure, and shutdown

- Instrumentation must have bounded CPU, memory, queue, network, and disk use. Define batching, backpressure, drop, retry, and spool behavior when the collector or backend is slow or unavailable.
- Ordinary telemetry failure should not normally fail the business operation. Treat mandatory security or compliance audit delivery as a separate explicit durability contract rather than silently blocking all logging.
- Expose dropped, rejected, retried, and failed telemetry through a path that does not recursively depend on the failing exporter.
- Flush and shut down providers with a bounded deadline where losing buffered telemetry matters. Do not hang process termination indefinitely for an unavailable backend.
- Handle process forks, workers, serverless freezing, hot reload, and test isolation according to the instrumentation library's lifecycle. Avoid duplicated exporters and inherited invalid state.
- Keep instrumentation safe during partial startup and degraded configuration. Diagnostic code must not dereference missing request context or turn an error path into a crash.

## Security, privacy, and governance

- Classify telemetry fields and destinations. Apply minimization, redaction, access control, tenant isolation, encryption, retention, and deletion to logs, metrics, traces, profiles, dumps, and support bundles.
- Never emit credentials, session tokens, authorization headers, private keys, raw cookies, password material, or reusable reset and invitation links. Redact at the source when downstream copies cannot be reliably recalled.
- Decide whether user content, queries, URLs, database statements, IP addresses, device data, and stable identifiers are necessary and permitted before recording them.
- Treat telemetry ingestion and query systems as security boundaries. Verify peer identity, protect exporter credentials, constrain network exposure, and prevent one tenant from querying another tenant's signals.
- Keep dynamic debug logging and remote configuration authenticated, authorized, time-bounded, attributable, and rate-limited. Do not enable sensitive capture fleet-wide through an unaudited flag.
- Account for retention and replication in collectors, local buffers, indexes, archives, dashboards, alerts, tickets, and exports. Deleting the primary log record may not remove every disclosure path.
- Escape telemetry safely at every display and export boundary. Structured logging prevents some parsing ambiguity but does not make untrusted content safe HTML, terminal output, SQL, or spreadsheet data.

## Cost, performance, and change management

- Set budgets for event volume, metric series, span rate, attribute size, retention, export bandwidth, and instrumentation overhead where they can affect reliability or spend.
- Measure instrumentation overhead under representative load. Avoid synchronous network export, repeated serialization, stack capture, or high-resolution timing on a hot path without evidence that the value justifies the cost.
- Roll out high-volume or schema-changing instrumentation gradually. Observe collector health, backend rejection, query cost, and alert behavior before full deployment.
- Version or coordinate breaking changes to names, units, labels, temporality, route normalization, sampling, and resource identity with every downstream consumer.
- Remove stale dashboards, alerts, recording rules, and instrumentation only after proving no operational, compliance, or automation consumer relies on them.
- Keep vendor-specific features behind a deliberate adapter or project contract when portability is claimed. Do not pretend telemetry is vendor-neutral if queries or semantics require one backend.

## Tests and validation

Use the repository's configured telemetry libraries and validation commands. Applicable evidence includes:

- schema tests for stable event names, fields, metric units and dimensions, span names and attributes, and resource identity;
- successful, rejected, timeout, cancellation, retry, partial, and dependency- failure paths, including work that crosses queues or workers;
- trace-context propagation, invalid inbound context, baggage limits, log-trace correlation, sampling, and duplicate-instrumentation checks;
- cardinality and volume tests using adversarial identifiers, paths, errors, tenants, and payloads;
- automated scans and representative tests proving credentials, personal data, and sensitive payloads are not emitted;
- collector slow, unavailable, rejecting, and recovering states, including bounded queues, drops, retries, local buffering, and shutdown deadlines;
- alert-rule and dashboard query tests using known input series, plus an end-to-end notification and runbook exercise;
- representative load measurements for CPU, allocation, latency, bandwidth, storage, and backend cost;
- deployment, rollback, mixed-version, and telemetry-schema migration behavior.

Report exact library, semantic-convention, collector, backend, and schema versions; sampling and retention settings; commands; environments; and outcomes. A visible dashboard does not prove complete observability, and an unqueried signal does not justify its cost or disclosure risk.

## Primary references

- [OpenTelemetry Specification](https://opentelemetry.io/docs/specs/otel/)
- [OpenTelemetry Resource data model](https://opentelemetry.io/docs/specs/otel/resource/data-model/)
- [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/)
- [OpenTelemetry attribute requirement levels](https://opentelemetry.io/docs/specs/semconv/general/attribute-requirement-level/)
- [OpenTelemetry logging specification](https://opentelemetry.io/docs/specs/otel/logs/)
- [OpenTelemetry metrics data model](https://opentelemetry.io/docs/specs/otel/metrics/data-model/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [W3C Baggage](https://www.w3.org/TR/baggage/)
- [OpenMetrics 1.0.0 specification](https://github.com/prometheus/OpenMetrics/blob/v1.0.0/specification/OpenMetrics.md)
