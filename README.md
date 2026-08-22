# @ynode/ylog

Copyright (c) 2026 Michael Welter <me@mikinho.com>

[![npm version](https://img.shields.io/npm/v/@ynode/ylog.svg)](https://www.npmjs.com/package/@ynode/ylog) [![license](https://img.shields.io/npm/l/@ynode/ylog.svg)](https://github.com/yammm/ynode-ylog/blob/main/LICENSE)

Helper module for outputting colored info, warn, error, debug and trace/verbose log messages. Works with [Fastify](https://www.fastify.io/) or standalone Node.js application.

## Installation

```bash
npm install @ynode/ylog
```

## Basic Usage

```javascript
import ylog from "@ynode/ylog";
const log = ylog(import.meta);

log.info(`[${process.pid}] Hello`);
log.warn(`[${process.pid}] Hello`);
log.error(`[${process.pid}] Hello`);
```

The optional `level` sets a logger-specific threshold, and `pid` includes the process ID in every line:

```javascript
const log = ylog(import.meta, { level: "info", pid: true });
```

```javascript
const fastify = Fastify({ loggerInstance: log });
fastify.log.info(`Worker ${process.pid} shutting down due to inactivity.`);
```

## Log Levels

The supported levels, from most restrictive to most verbose, are `silent`, `error`, `warn`, `info`, `debug`, and `verbose`. The standard Pino/Fastify names `fatal` and `trace` are numeric aliases: `fatal` shares the `error` rank and `trace` shares the `verbose` rank. `log.level` reports the exact name that was requested, so a logger created with `level: "fatal"` reports `"fatal"` while filtering messages at the `error` rank.

```javascript
const log = ylog(import.meta);

// Updates existing and future loggers that do not have an explicit level.
ylog.loglevel("warn");

// An explicit logger level remains independent of the global level.
const debugLog = ylog(import.meta, { level: "debug" });
```

`ylog.defaultLevel` exposes the current numeric global threshold, while `ylog.levels` contains the numeric value for each named level.

| Method                  | Threshold | Destination | Duplicate throttle |
| ----------------------- | --------- | ----------- | ------------------ |
| `fatal()`               | `error`   | stderr      | No                 |
| `error()`               | `error`   | stderr      | Yes                |
| `warn()`                | `warn`    | stderr      | Yes                |
| `info()`                | `info`    | stdout      | No                 |
| `debug()`               | `debug`   | stdout      | No                 |
| `verbose()` / `trace()` | `verbose` | stdout      | No                 |

The `silent()` no-op method is provided for Fastify/Pino logger compatibility.

## Child Loggers

`child(bindings, options)` composes contextual bindings and honors Fastify/Pino child options such as a route-specific `level`.

```javascript
const requestLog = log.child({ reqId: "abc123" }, { level: "error" });
requestLog.error("Request failed");
```

## Structured Output and Request Context

Set `format: "json"` (or its shorthand alias `json: true`) to emit one JSON object per log call. Static logger bindings and active async context bindings are added as top-level fields, with core fields such as `time`, `level`, `tag`, `msg`, and enabled `pid` output protected from being overwritten.

JSON loggers also support Pino-style object-first calls. Enumerable properties from the first object become searchable top-level fields instead of being folded into `msg`; call fields override context/logger bindings with the same name, while protected core fields always win. Text output retains its existing `util.format` rendering.

```javascript
const log = ylog(import.meta, {
    format: "json",
    bindings: { service: "api" },
});

await ylog.withContext({ reqId: "abc123" }, async () => {
    log.info({ route: "/orders", elapsedMs: 17 }, "Request completed");
});
```

Use `ylog.getContext()` to read the current context bindings inside the active async execution path.

### Secret Redaction

Use `redact` to replace sensitive fields before they are emitted. Paths are dot-delimited and a `*` segment matches every object field or array item. The policy covers logger bindings, async context, and structured object arguments, is inherited by child loggers, and never mutates the source objects.

```javascript
const log = ylog(import.meta, {
    format: "json",
    redact: {
        paths: ["authorization", "user.password", "cards.*.cvv"],
        censor: "[Secret]",
    },
});

log.info({ user: { id: 42, password: "private" }, cards: [{ cvv: "123" }] }, "User authenticated");
```

For the default `"[Redacted]"` censor, use the array shorthand: `redact: ["authorization", "user.password"]`. Redaction also covers bindings and object arguments rendered in text mode; unstructured string arguments remain unchanged because they have no field path.

## Duplicate Throttling

Duplicate `error` and `warn` messages default to two emissions per 30-second window. Configure the budget and duration with `throttle`; pass `false` to disable throttling entirely.

```javascript
const log = ylog(import.meta, {
    throttle: { max: 5, windowMs: 10_000, summary: true },
});
```

Recovery summaries are opt-in (`summary` defaults to `false`) so the default output remains unchanged. With summaries enabled, a matching call after the window receives its exact `suppressed` count immediately before the resumed message. Bounded periodic cleanup aggregates other expired keys into at most one summary per severity, reporting `recoveredKeys` and the total `suppressed` count rather than emitting one record per key. JSON summaries include `event: "ylog.throttle.recovered"`, `throttleLevel`, and `throttleWindowMs`; potentially sensitive throttle keys are never emitted.

Budgets are isolated by root logger and severity; derived child loggers share their parent's configured budget. Messages filtered by the active log level do not consume a budget, and `fatal` messages are never throttled. `max` and `windowMs` must be positive safe integers.

The throttle key is derived from an `Error` argument's `code` or `message`, or from a sole primitive argument. Multi-argument format-string calls without an `Error` (for example `log.error("failed %s", id)`) have no stable key and are exempt from throttling, as are sole object arguments — object identity is never used as a key.

## Output Formatting

TTY output includes a local timestamp and uses colors when the destination stream supports them. Non-TTY output uses syslog severity prefixes suitable for journald. Stdout and stderr capabilities are detected independently, so redirecting one stream does not affect the other's formatting.

Call `ylog.disableSyslogPrefix()` before logging when a non-TTY destination should receive plain output instead. The setting is process-wide and affects existing and future loggers.

In text mode, control characters in messages and binding values are escaped by default (`\n`, `\r`, `\t`, and `\xNN` for the rest), so untrusted data cannot forge log lines or inject terminal escape sequences. Pass `sanitize: false` to disable the escaping for a logger. JSON output is always safe because `JSON.stringify` escapes control characters itself.

## License

[MIT](./LICENSE)
