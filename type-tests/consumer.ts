import ylog, { type Logger, type LogLevel, type YlogOptions } from "@ynode/ylog";

const options: YlogOptions = {
    level: "info",
    format: "json",
    bindings: { service: "type-consumer" },
    redact: { paths: ["authorization", "user.password", "cards.*.cvv"], censor: "***" },
};
const log: Logger = ylog(import.meta, options);

const currentLevel: LogLevel = log.level;
log.level = "debug";
log.level = null;
log.level = undefined;
log.error(new Error("boom"), "request failed");
log.info({ orderId: "ord-123", elapsedMs: 17 }, "processed %d item", 1);

const child: Logger = log.child({ requestId: "abc" }, { level: "warn" });
const contextResult: Promise<number> = ylog.withContext({ requestId: "abc" }, async () => 42);

// @ts-expect-error Invalid log levels are rejected by both runtime and declarations.
log.level = "wran";
// @ts-expect-error Constructor options accept only known level names.
ylog(import.meta, { level: "nope" });

void currentLevel;
void child;
void contextResult;
