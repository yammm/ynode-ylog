# @ynode/ylog

Copyright (c) 2025 Michael Welter <me@mikinho.com>

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

The supported levels, from most restrictive to most verbose, are `silent`, `error`, `warn`, `info`, `debug`, and `verbose`. The standard Pino/Fastify names `fatal` and `trace` are accepted as aliases for `error` and `verbose`, respectively.

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

## Duplicate Throttling

Duplicate `error` and `warn` messages are limited to two emissions per 30-second window. Budgets are isolated by root logger and severity; derived child loggers share their parent's budget. Messages filtered by the active log level do not consume a budget, and `fatal` messages are never throttled.

## Output Formatting

TTY output includes a local timestamp and uses colors when the destination stream supports them. Non-TTY output uses syslog severity prefixes suitable for journald. Stdout and stderr capabilities are detected independently, so redirecting one stream does not affect the other's formatting.

Call `ylog.disableSyslogPrefix()` before logging when a non-TTY destination should receive plain output instead. The setting is process-wide and affects existing and future loggers.

## License

[MIT](./LICENSE)
