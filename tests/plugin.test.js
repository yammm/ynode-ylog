import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

import ylog from "../src/plugin.js";

const initialDefaultLevelName = Object.entries(ylog.levels).find(
    ([, value]) => value === ylog.defaultLevel,
)[0];
const restoreDefaultLevel = () => ylog.loglevel(initialDefaultLevelName);
const uniqueKey = (label) => `${label}-${process.hrtime.bigint()}`;

describe("basic logging", () => {
    test("exposes every Fastify-compatible log method", () => {
        const log = ylog({ filename: "test.js" });
        assert.strictEqual(typeof log.info, "function");
        assert.strictEqual(typeof log.error, "function");
        assert.strictEqual(typeof log.warn, "function");
        assert.strictEqual(typeof log.debug, "function");
        assert.strictEqual(typeof log.verbose, "function");
        assert.strictEqual(typeof log.trace, "function");
        assert.strictEqual(typeof log.fatal, "function");
        assert.strictEqual(typeof log.silent, "function");
    });

    test("info writes to console.log", (t) => {
        const log = ylog({ filename: "test.js" });
        let called = false;
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = () => {
            called = true;
        };

        log.info("test info");
        assert.ok(called, "console.log should have been called");
    });

    test("error writes to console.error", (t) => {
        const log = ylog({ filename: "test.js" });
        let called = false;
        const originalError = console.error;
        t.after(() => {
            console.error = originalError;
        });
        console.error = () => {
            called = true;
        };

        log.error(new Error("test error"));
        assert.ok(called, "console.error should have been called");
    });

    test("child returns a new derived logger instance", () => {
        const log = ylog({ filename: "test.js" });
        const child = log.child();
        assert.notStrictEqual(child, log, "child should be a new instance");
        assert.strictEqual(typeof child.info, "function");
        assert.strictEqual(typeof child.child, "function");
    });

    test("child(bindings) renders bindings on every log line", (t) => {
        const log = ylog({ filename: "test.js" });
        let captured = "";
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = (line) => {
            captured = line;
        };

        const child = log.child({ reqId: "abc", userId: 42 });
        child.info("hello");

        assert.ok(captured.includes("reqId=abc"), `expected reqId=abc in output, got: ${captured}`);
        assert.ok(captured.includes("userId=42"), `expected userId=42 in output, got: ${captured}`);
        assert.ok(captured.includes("hello"), `expected message body in output, got: ${captured}`);
    });

    test("child(bindings) composes when called repeatedly", (t) => {
        const log = ylog({ filename: "test.js" });
        let captured = "";
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = (line) => {
            captured = line;
        };

        const grandchild = log.child({ reqId: "abc" }).child({ stage: "auth" });
        grandchild.info("hello");

        assert.ok(captured.includes("reqId=abc"), `expected reqId=abc, got: ${captured}`);
        assert.ok(captured.includes("stage=auth"), `expected stage=auth, got: ${captured}`);
    });

    test("child does not affect parent bindings", (t) => {
        const log = ylog({ filename: "test.js" });
        const parentLines = [];
        const childLines = [];
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });

        const child = log.child({ reqId: "abc" });

        console.log = (line) => parentLines.push(line);
        log.info("parent line");

        console.log = (line) => childLines.push(line);
        child.info("child line");

        assert.ok(!parentLines[0].includes("reqId="), `parent should not include reqId binding`);
        assert.ok(childLines[0].includes("reqId=abc"), `child should include reqId binding`);
    });

    test("child honors Fastify/Pino level options", (t) => {
        const log = ylog({ filename: "test.js" }, { level: "debug" });
        const output = [];
        const errors = [];
        const originalLog = console.log;
        const originalError = console.error;
        t.after(() => {
            console.log = originalLog;
            console.error = originalError;
        });
        console.log = (line) => output.push(line);
        console.error = (line) => errors.push(line);

        const child = log.child({ reqId: "abc" }, { level: "error" });
        child.info("hidden");
        child.error(uniqueKey("visible-child-error"));

        assert.strictEqual(child.level, "error");
        assert.strictEqual(output.length, 0);
        assert.strictEqual(errors.length, 1);
    });

    test("child accepts Fastify/Pino fatal and trace level aliases", (t) => {
        const log = ylog({ filename: "test.js" }, { level: "error" });
        const output = [];
        const warnings = [];
        const errors = [];
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;
        t.after(() => {
            console.log = originalLog;
            console.warn = originalWarn;
            console.error = originalError;
        });
        console.log = (line) => output.push(line);
        console.warn = (line) => warnings.push(line);
        console.error = (line) => errors.push(line);

        const traceChild = log.child({}, { level: "trace" });
        traceChild.trace("visible trace");

        const fatalChild = log.child({}, { level: "fatal" });
        fatalChild.warn("hidden warning");
        fatalChild.fatal("visible fatal");

        assert.strictEqual(traceChild.level, "trace");
        assert.strictEqual(fatalChild.level, "fatal");
        assert.strictEqual(output.length, 1);
        assert.strictEqual(warnings.length, 0);
        assert.strictEqual(errors.length, 1);
    });

    test("uses import.meta.url when import.meta.filename is unavailable", (t) => {
        const log = ylog({ url: "file:///tmp/from-url.js" });
        let captured = "";
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = (line) => {
            captured = line;
        };

        log.info("hello");

        assert.ok(captured.includes("[from-url]"), `expected URL-derived tag, got: ${captured}`);
    });

    test("stderr formatting uses stderr terminal capabilities", (t) => {
        const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
        const stderrDescriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
        const originalError = console.error;
        t.after(() => {
            console.error = originalError;
            if (stdoutDescriptor) {
                Object.defineProperty(process.stdout, "isTTY", stdoutDescriptor);
            } else {
                delete process.stdout.isTTY;
            }
            if (stderrDescriptor) {
                Object.defineProperty(process.stderr, "isTTY", stderrDescriptor);
            } else {
                delete process.stderr.isTTY;
            }
        });
        Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
        Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: true });

        let captured = "";
        console.error = (line) => {
            captured = line;
        };

        ylog({ filename: "stderr.js" }, { level: "error" }).error(uniqueKey("stderr-terminal"));

        assert.match(captured, /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[ERROR\]/);
        assert.ok(!captured.startsWith("<3>"));
    });
});

describe("control character sanitization", () => {
    test("escapes a newline-forging attempt in message arguments", (t) => {
        const log = ylog({ filename: "sanitize.js" });
        let captured = "";
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = (line) => {
            captured = line;
        };

        log.info("user input\n<3> forged: something failed");

        assert.ok(!captured.includes("\n"), `output must stay a single line, got: ${captured}`);
        assert.ok(
            captured.includes("user input\\n<3> forged"),
            `expected escaped newline, got: ${captured}`,
        );
    });

    test("escapes control characters in binding keys and values", (t) => {
        const log = ylog({ filename: "sanitize.js" });
        let captured = "";
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = (line) => {
            captured = line;
        };

        log.child({ reqId: "abc\r\ndef", note: "esc\u001b[31mred" }).info("hello");

        assert.ok(!captured.includes("\n"));
        assert.ok(!captured.includes("\r"));
        assert.ok(!captured.includes("\u001b"));
        assert.ok(
            captured.includes("reqId=abc\\r\\ndef"),
            `expected escaped CRLF, got: ${captured}`,
        );
        assert.ok(
            captured.includes("note=esc\\x1b[31mred"),
            `expected escaped ESC, got: ${captured}`,
        );
    });

    test("sanitize false disables control character escaping", (t) => {
        const log = ylog({ filename: "sanitize.js" }, { sanitize: false });
        let captured = "";
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = (line) => {
            captured = line;
        };

        log.info("multi\nline");

        assert.ok(captured.includes("multi\nline"));
    });
});

describe("structured logging and context", () => {
    test("format json emits a parseable structured record", (t) => {
        const lines = [];
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = (line) => lines.push(line);

        const log = ylog(
            { filename: "json-output.js" },
            { format: "json", pid: true, bindings: { service: "api" } },
        );
        log.info("hello %s", "world");

        assert.strictEqual(lines.length, 1);
        const record = JSON.parse(lines[0]);
        assert.strictEqual(record.level, "info");
        assert.strictEqual(record.tag, "json-output");
        assert.strictEqual(record.service, "api");
        assert.strictEqual(record.msg, "hello world");
        assert.strictEqual(typeof record.pid, "number");
        assert.match(record.time, /^\d{4}-\d{2}-\d{2}T/);
    });

    test("format json promotes object-first payloads to searchable fields", (t) => {
        const lines = [];
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = (line) => lines.push(JSON.parse(line));

        const log = ylog(
            { filename: "json-fields.js" },
            { format: "json", bindings: { service: "api", shared: "binding" } },
        );
        log.info(
            {
                orderId: "ord-123",
                elapsedMs: 17,
                shared: "call",
                time: "fake-time",
                level: "fake-level",
                tag: "fake-tag",
                msg: "fake-message",
            },
            "processed %d item",
            1,
        );

        assert.strictEqual(lines.length, 1);
        assert.strictEqual(lines[0].service, "api");
        assert.strictEqual(lines[0].orderId, "ord-123");
        assert.strictEqual(lines[0].elapsedMs, 17);
        assert.strictEqual(lines[0].shared, "call");
        assert.strictEqual(lines[0].level, "info");
        assert.strictEqual(lines[0].tag, "json-fields");
        assert.strictEqual(lines[0].msg, "processed 1 item");
        assert.match(lines[0].time, /^\d{4}-\d{2}-\d{2}T/);
    });

    test("format json supports object-only records and nested errors", (t) => {
        const lines = [];
        const originalError = console.error;
        t.after(() => {
            console.error = originalError;
        });
        console.error = (line) => lines.push(JSON.parse(line));

        const error = new Error(uniqueKey("nested-error"));
        const payload = { event: "failed", err: error };
        payload.self = payload;
        const log = ylog({ filename: "json-object-only.js" }, { format: "json" });
        log.error(payload);

        assert.strictEqual(lines[0].event, "failed");
        assert.strictEqual(lines[0].msg, "");
        assert.strictEqual(lines[0].err.message, error.message);
        assert.strictEqual(lines[0].self.self, "[Circular]");
    });

    test("format json serializes errors and BigInt bindings safely", (t) => {
        const lines = [];
        const originalError = console.error;
        t.after(() => {
            console.error = originalError;
        });
        console.error = (line) => lines.push(line);

        const log = ylog(
            { filename: "json-error.js" },
            { level: "error", format: "json", bindings: { attempt: 3n } },
        );
        const error = new Error(uniqueKey("json-error"));
        error.code = "E_JSON_TEST";
        log.error(error);

        const record = JSON.parse(lines[0]);
        assert.strictEqual(record.level, "error");
        assert.strictEqual(record.attempt, "3");
        assert.strictEqual(record.err.name, "Error");
        assert.strictEqual(record.err.code, "E_JSON_TEST");
        assert.match(record.err.message, /json-error/);
    });

    test("format json protects core fields from user bindings", async (t) => {
        const lines = [];
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = (line) => lines.push(line);

        const log = ylog(
            { filename: "core-fields.js" },
            {
                format: "json",
                pid: true,
                bindings: { time: "fake-time", level: "fake-level", tag: "fake-tag" },
            },
        );

        await ylog.withContext({ msg: "fake-msg", pid: "fake-pid" }, async () => {
            log.info("real message");
        });

        const record = JSON.parse(lines[0]);
        assert.match(record.time, /^\d{4}-\d{2}-\d{2}T/, "time must not be overwritten");
        assert.strictEqual(record.level, "info");
        assert.strictEqual(record.tag, "core-fields");
        assert.strictEqual(record.msg, "real message");
        assert.strictEqual(record.pid, process.pid);
    });

    test("format json keeps the error stack solely in err for every argument position", (t) => {
        const lines = [];
        const originalError = console.error;
        t.after(() => {
            console.error = originalError;
        });
        console.error = (line) => lines.push(line);

        const log = ylog({ filename: "json-stack.js" }, { level: "error", format: "json" });
        for (const [position, args, expected] of [
            [
                "first",
                (error) => [error, "request failed"],
                (message) => `${message} request failed`,
            ],
            [
                "middle",
                (error) => ["request", error, "failed"],
                (message) => `request ${message} failed`,
            ],
            [
                "last",
                (error) => ["request failed:", error],
                (message) => `request failed: ${message}`,
            ],
        ]) {
            const error = new Error(uniqueKey(`single-stack-${position}`));
            log.error(...args(error));

            const line = lines.at(-1);
            const record = JSON.parse(line);
            const stackFrame = error.stack.split("\n")[1].trim();
            const occurrences = line.split(stackFrame).length - 1;

            assert.strictEqual(record.msg, expected(error.message));
            assert.strictEqual(record.err.stack, error.stack);
            assert.strictEqual(occurrences, 1, "stack must appear exactly once per record");
        }
    });

    test("withContext adds async request bindings without leaking", async (t) => {
        const lines = [];
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = (line) => lines.push(JSON.parse(line));

        const log = ylog({ filename: "context.js" }, { format: "json" });

        await ylog.withContext({ reqId: "abc123" }, async () => {
            await new Promise((resolve) => setImmediate(resolve));
            log.info("inside request");
        });
        log.info("outside request");

        assert.strictEqual(lines[0].reqId, "abc123");
        assert.strictEqual(lines[0].msg, "inside request");
        assert.strictEqual(lines[1].reqId, undefined);
        assert.strictEqual(lines[1].msg, "outside request");
    });

    test("child loggers compose with async context bindings", async (t) => {
        let captured;
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = (line) => {
            captured = JSON.parse(line);
        };

        const log = ylog({ filename: "context-child.js" }, { format: "json" }).child({
            route: "/health",
        });

        await ylog.withContext({ reqId: "abc123" }, async () => {
            log.info("healthy");
        });

        assert.strictEqual(captured.reqId, "abc123");
        assert.strictEqual(captured.route, "/health");
        assert.strictEqual(captured.msg, "healthy");
    });
});

describe("secret redaction", () => {
    test("redacts bindings, context, child bindings, and structured JSON fields", (t) => {
        const lines = [];
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = (line) => lines.push(JSON.parse(line));

        const payloadError = new Error("safe failure");
        const payload = {
            user: { id: 42, password: "call-secret" },
            cards: [
                { cvv: "123", last4: "4242" },
                { cvv: "456", last4: "1111" },
            ],
            err: payloadError,
        };
        const bindings = { authorization: "Bearer binding-secret", service: "api" };
        const childBindings = { apiKey: "child-secret" };
        const log = ylog(
            { filename: "redact-json.js" },
            {
                format: "json",
                bindings,
                redact: {
                    paths: [
                        "authorization",
                        "apiKey",
                        "session.token",
                        "user.password",
                        "cards.*.cvv",
                        "err.stack",
                    ],
                    censor: "[Secret]",
                },
            },
        ).child(childBindings);

        ylog.withContext({ session: { token: "context-secret", region: "us" } }, () => {
            log.info(payload, "authenticated");
        });

        assert.strictEqual(lines.length, 1);
        assert.strictEqual(lines[0].authorization, "[Secret]");
        assert.strictEqual(lines[0].apiKey, "[Secret]");
        assert.strictEqual(lines[0].session.token, "[Secret]");
        assert.strictEqual(lines[0].session.region, "us");
        assert.strictEqual(lines[0].user.password, "[Secret]");
        assert.deepStrictEqual(
            lines[0].cards.map(({ cvv, last4 }) => ({ cvv, last4 })),
            [
                { cvv: "[Secret]", last4: "4242" },
                { cvv: "[Secret]", last4: "1111" },
            ],
        );
        assert.strictEqual(lines[0].err.stack, "[Secret]");
        assert.strictEqual(lines[0].msg, "authenticated");

        assert.strictEqual(bindings.authorization, "Bearer binding-secret");
        assert.strictEqual(childBindings.apiKey, "child-secret");
        assert.strictEqual(payload.user.password, "call-secret");
        assert.strictEqual(payload.cards[0].cvv, "123");
        assert.strictEqual(payload.err, payloadError);
    });

    test("array shorthand redacts text bindings and structured object arguments", (t) => {
        let captured = "";
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = (line) => {
            captured = line;
        };

        const payload = { profile: { name: "Ada", token: "payload-secret" } };
        const log = ylog(
            { filename: "redact-text.js" },
            {
                bindings: { password: "binding-secret" },
                redact: ["password", "profile.token"],
            },
        );
        log.info(payload, "authenticated");

        assert.ok(!captured.includes("binding-secret"));
        assert.ok(!captured.includes("payload-secret"));
        assert.ok(captured.includes("password=[Redacted]"));
        assert.ok(captured.includes("token: '[Redacted]'"));
        assert.strictEqual(payload.profile.token, "payload-secret");
    });

    test("rejects malformed redaction policies deterministically", () => {
        const invalidPolicies = [
            [null, /redact must be an array of paths or an options object/],
            ["password", /redact must be an array of paths or an options object/],
            [{}, /redact\.paths must be an array of strings/],
            [{ paths: "password" }, /redact\.paths must be an array of strings/],
            [{ paths: [1] }, /redact paths must be strings/],
            [{ paths: [""] }, /redact paths must be non-empty dot paths/],
            [{ paths: ["user..password"] }, /redact paths must be non-empty dot paths/],
            [{ paths: [" user.password"] }, /redact paths must be non-empty dot paths/],
            [{ paths: ["password"], censor: 1 }, /redact\.censor must be a string/],
            [{ paths: ["password"], extra: true }, /redact has unknown option: extra/],
        ];

        for (const [redact, expected] of invalidPolicies) {
            assert.throws(() => ylog({ filename: "invalid-redact.js" }, { redact }), expected);
        }
    });
});

describe("log level option", () => {
    test("level option is respected — error-only logger suppresses info", (t) => {
        const log = ylog({ filename: "test.js" }, { level: "error" });
        let called = false;
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = () => {
            called = true;
        };

        log.info("this should be suppressed");
        assert.ok(!called, "info should be suppressed at error level");
    });

    test("level option is respected — debug logger emits debug messages", (t) => {
        const log = ylog({ filename: "test.js" }, { level: "debug" });
        let called = false;
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = () => {
            called = true;
        };

        log.debug("this should print");
        assert.ok(called, "debug should emit at debug level");
    });

    test("level names round-trip while aliases keep their numeric rank", (t) => {
        const fatalLog = ylog({ filename: "round-trip.js" }, { level: "fatal" });
        const traceLog = ylog({ filename: "round-trip.js" }, { level: "trace" });
        const warnings = [];
        const errors = [];
        const originalWarn = console.warn;
        const originalError = console.error;
        t.after(() => {
            console.warn = originalWarn;
            console.error = originalError;
        });
        console.warn = (line) => warnings.push(line);
        console.error = (line) => errors.push(line);

        assert.strictEqual(fatalLog.level, "fatal");
        assert.strictEqual(traceLog.level, "trace");

        // fatal still maps to the error rank numerically.
        fatalLog.warn("hidden");
        fatalLog.error(uniqueKey("fatal-rank"));

        assert.strictEqual(warnings.length, 0);
        assert.strictEqual(errors.length, 1);
    });

    test("global level names round-trip through loglevel", (t) => {
        const log = ylog({ filename: "global-name.js" });
        t.after(restoreDefaultLevel);

        ylog.loglevel("trace");

        assert.strictEqual(ylog.defaultLevel, ylog.levels.verbose);
        assert.strictEqual(log.level, "trace");
    });

    test("invalid constructor and child level names throw", () => {
        assert.throws(
            () => ylog({ filename: "invalid-constructor.js" }, { level: "nonexistent" }),
            TypeError,
        );

        const log = ylog({ filename: "invalid-child.js" }, { level: "debug" });
        assert.throws(() => log.child({}, { level: "wran" }), TypeError);
    });

    test("assigning an invalid level name throws and keeps the current level", () => {
        const log = ylog({ filename: "invalid-set.js" }, { level: "debug" });

        assert.throws(() => {
            log.level = "wran";
        }, TypeError);
        assert.strictEqual(log.level, "debug");
    });

    test("assigning null clears the override so the logger follows the global level", (t) => {
        const log = ylog({ filename: "clear-override.js" }, { level: "debug" });
        t.after(restoreDefaultLevel);

        ylog.loglevel("error");
        assert.strictEqual(log.level, "debug");

        log.level = null;
        assert.strictEqual(log.level, "error");

        ylog.loglevel("info");
        assert.strictEqual(log.level, "info");
    });

    test("global level changes update existing implicit loggers and defaultLevel", (t) => {
        const log = ylog({ filename: "live-global.js" });
        const lines = [];
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
            restoreDefaultLevel();
        });
        console.log = (line) => lines.push(line);

        ylog.loglevel("error");
        assert.strictEqual(ylog.defaultLevel, ylog.levels.error);
        assert.strictEqual(log.level, "error");
        log.info("hidden");

        ylog.loglevel("debug");
        assert.strictEqual(ylog.defaultLevel, ylog.levels.debug);
        assert.strictEqual(log.level, "debug");
        log.debug("visible");

        assert.strictEqual(lines.length, 1);
        assert.ok(lines[0].includes("visible"));
    });

    test("explicit logger levels remain independent of the global level", (t) => {
        const log = ylog({ filename: "explicit.js" }, { level: "debug" });
        let called = false;
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
            restoreDefaultLevel();
        });
        console.log = () => {
            called = true;
        };

        ylog.loglevel("error");
        log.debug("still visible");

        assert.strictEqual(log.level, "debug");
        assert.ok(called);
    });
});

describe("throttle mechanism", () => {
    test("allows max calls through before suppressing duplicates", (t) => {
        const log = ylog({ filename: "test.js" });
        let errorCalls = 0;
        const originalError = console.error;
        t.after(() => {
            console.error = originalError;
        });
        console.error = () => {
            ++errorCalls;
        };

        const sharedError = new Error("throttle-test-" + Date.now());

        // Default max is 2 — first 2 calls pass, 3rd and 4th are throttled
        log.error(sharedError);
        log.error(sharedError);
        log.error(sharedError);
        log.error(sharedError);

        assert.strictEqual(errorCalls, 2, "exactly 2 calls should pass through before throttling");
    });

    test("supports configured budgets and fully disabling throttling", (t) => {
        const lines = [];
        const originalError = console.error;
        t.after(() => {
            console.error = originalError;
        });
        console.error = (line) => lines.push(line);

        const limited = ylog(
            { filename: "configured-throttle.js" },
            { throttle: { max: 1, windowMs: 10_000 } },
        );
        const limitedChild = limited.child({ scope: "child" });
        const disabled = ylog({ filename: "disabled-throttle.js" }, { throttle: false });
        const limitedMessage = uniqueKey("configured-budget");
        const disabledMessage = uniqueKey("disabled-budget");

        limited.error(limitedMessage);
        limitedChild.error(limitedMessage);
        limitedChild.error(limitedMessage);
        disabled.error(disabledMessage);
        disabled.error(disabledMessage);
        disabled.error(disabledMessage);

        assert.strictEqual(lines.length, 4);
        assert.ok(lines[0].includes(limitedMessage));
        assert.ok(lines.slice(1).every((line) => line.includes(disabledMessage)));
    });

    test("preserves default output by keeping recovery summaries opt-in", (t) => {
        let now = 1_000;
        const lines = [];
        const originalNow = Date.now;
        const originalError = console.error;
        t.after(() => {
            Date.now = originalNow;
            console.error = originalError;
        });
        Date.now = () => now;
        console.error = (line) => lines.push(line);

        const log = ylog({ filename: "default-throttle-recovery.js" });
        const message = uniqueKey("default-recovery");

        log.error(message);
        log.error(message);
        log.error(message);
        now = 31_001;
        log.error(message);

        assert.strictEqual(lines.length, 3);
        assert.ok(lines.every((line) => line.includes(message)));
        assert.ok(lines.every((line) => !line.includes("Recovered after suppressing")));
    });

    test("emits an exact structured recovery summary before logging resumes", (t) => {
        let now = 1_000;
        const lines = [];
        const originalNow = Date.now;
        const originalError = console.error;
        t.after(() => {
            Date.now = originalNow;
            console.error = originalError;
        });
        Date.now = () => now;
        console.error = (line) => lines.push(JSON.parse(line));

        const log = ylog(
            { filename: "throttle-recovery.js" },
            {
                format: "json",
                throttle: { max: 1, windowMs: 100, summary: true },
            },
        );
        const message = uniqueKey("recovered-error");

        log.error(message);
        now = 1_050;
        log.error(message);
        log.error(message);
        log.error(message);
        now = 1_101;
        log.error(message);

        assert.strictEqual(lines.length, 3);
        assert.strictEqual(lines[0].msg, message);
        assert.deepStrictEqual(
            {
                event: lines[1].event,
                level: lines[1].level,
                msg: lines[1].msg,
                recoveredKeys: lines[1].recoveredKeys,
                suppressed: lines[1].suppressed,
                throttleLevel: lines[1].throttleLevel,
                throttleWindowMs: lines[1].throttleWindowMs,
            },
            {
                event: "ylog.throttle.recovered",
                level: "error",
                msg: "Recovered after suppressing 3 duplicate error messages",
                recoveredKeys: 1,
                suppressed: 3,
                throttleLevel: "error",
                throttleWindowMs: 100,
            },
        );
        assert.strictEqual(lines[2].msg, message);
    });

    test("periodic cleanup aggregates many expired keys by severity", (t) => {
        let now = 1_000;
        const errorLines = [];
        const warnLines = [];
        const originalNow = Date.now;
        const originalInterval = ylog.ErrorThrottle.EVICT_INTERVAL;
        const originalError = console.error;
        const originalWarn = console.warn;
        t.after(() => {
            Date.now = originalNow;
            ylog.ErrorThrottle.EVICT_INTERVAL = originalInterval;
            console.error = originalError;
            console.warn = originalWarn;
        });
        Date.now = () => now;
        const keysPerLevel = 12;
        ylog.ErrorThrottle.EVICT_INTERVAL = keysPerLevel * 4 + 1;
        console.error = (line) => errorLines.push(JSON.parse(line));
        console.warn = (line) => warnLines.push(JSON.parse(line));

        const log = ylog(
            { filename: "throttle-cleanup.js" },
            {
                format: "json",
                level: "warn",
                throttle: { max: 1, windowMs: 100, summary: true },
            },
        );
        const sensitiveKeys = [];

        for (let index = 0; index < keysPerLevel; ++index) {
            const errorKey = uniqueKey(`secret-error-key-${index}`);
            const warnKey = uniqueKey(`secret-warn-key-${index}`);
            sensitiveKeys.push(errorKey, warnKey);
            log.error(errorKey);
            log.error(errorKey);
            log.warn(warnKey);
            log.warn(warnKey);
        }
        now = 1_101;
        log.error(uniqueKey("other-error"));

        const errorSummaries = errorLines.filter(
            ({ event }) => event === "ylog.throttle.recovered",
        );
        const warnSummaries = warnLines.filter(({ event }) => event === "ylog.throttle.recovered");
        assert.strictEqual(errorSummaries.length, 1);
        assert.strictEqual(warnSummaries.length, 1);
        assert.deepStrictEqual(
            {
                recoveredKeys: errorSummaries[0].recoveredKeys,
                suppressed: errorSummaries[0].suppressed,
                throttleLevel: errorSummaries[0].throttleLevel,
            },
            { recoveredKeys: keysPerLevel, suppressed: keysPerLevel, throttleLevel: "error" },
        );
        assert.deepStrictEqual(
            {
                recoveredKeys: warnSummaries[0].recoveredKeys,
                suppressed: warnSummaries[0].suppressed,
                throttleLevel: warnSummaries[0].throttleLevel,
            },
            { recoveredKeys: keysPerLevel, suppressed: keysPerLevel, throttleLevel: "warn" },
        );
        const summaries = JSON.stringify([...errorSummaries, ...warnSummaries]);
        assert.ok(sensitiveKeys.every((key) => !summaries.includes(key)));
    });

    test("can resume without a recovery summary", (t) => {
        let now = 1_000;
        const lines = [];
        const originalNow = Date.now;
        const originalError = console.error;
        t.after(() => {
            Date.now = originalNow;
            console.error = originalError;
        });
        Date.now = () => now;
        console.error = (line) => lines.push(line);

        const log = ylog(
            { filename: "quiet-throttle-recovery.js" },
            { throttle: { max: 1, windowMs: 100, summary: false } },
        );
        const message = uniqueKey("quiet-recovery");

        log.error(message);
        log.error(message);
        now = 1_101;
        log.error(message);

        assert.strictEqual(lines.length, 2);
        assert.ok(lines.every((line) => line.includes(message)));
    });

    test("rejects malformed throttle policies and direct throttle inputs", () => {
        const invalidPolicies = [
            [null, /throttle must be false or an options object/],
            [true, /throttle must be false or an options object/],
            [[], /throttle must be false or an options object/],
            [new Date(), /throttle must be false or an options object/],
            [{ extra: true }, /throttle has unknown option: extra/],
            [{ max: 0 }, /throttle\.max must be a positive safe integer/],
            [{ max: null }, /throttle\.max must be a positive safe integer/],
            [{ max: 1.5 }, /throttle\.max must be a positive safe integer/],
            [{ max: Number.MAX_SAFE_INTEGER + 1 }, /throttle\.max must be a positive safe integer/],
            [{ windowMs: 0 }, /throttle\.windowMs must be a positive safe integer/],
            [{ windowMs: null }, /throttle\.windowMs must be a positive safe integer/],
            [{ summary: "yes" }, /throttle\.summary must be a boolean/],
        ];

        for (const [throttle, expected] of invalidPolicies) {
            assert.throws(() => ylog({ filename: "invalid-throttle.js" }, { throttle }), expected);
        }
        assert.throws(() => new ylog.ErrorThrottle(0, 100), /throttle\.max/);
        assert.throws(() => new ylog.ErrorThrottle(1, 0), /throttle\.windowMs/);
        const throttle = new ylog.ErrorThrottle();
        assert.throws(() => throttle.check(""), /throttle key must be a non-empty string/);
        assert.throws(() => throttle.check("key", null), /throttle scope must be a string/);
        assert.throws(
            () => throttle.shouldThrottle(null),
            /throttle key must be a non-empty string/,
        );
    });

    test("does not throttle distinct errors", (t) => {
        const log = ylog({ filename: "test.js" });
        let errorCalls = 0;
        const originalError = console.error;
        t.after(() => {
            console.error = originalError;
        });
        console.error = () => {
            ++errorCalls;
        };

        const ts = Date.now();
        log.error(new Error(`distinct-a-${ts}`));
        log.error(new Error(`distinct-b-${ts}`));
        log.error(new Error(`distinct-c-${ts}`));

        assert.strictEqual(errorCalls, 3, "each distinct error should pass through");
    });

    test("throttles repeated string single-arg calls", (t) => {
        const log = ylog({ filename: "test.js" });
        let errorCalls = 0;
        const originalError = console.error;
        t.after(() => {
            console.error = originalError;
        });
        console.error = () => {
            ++errorCalls;
        };

        const tag = "string-throttle-" + Date.now();
        log.error(tag);
        log.error(tag);
        log.error(tag);
        log.error(tag);

        assert.strictEqual(errorCalls, 2, "string single-arg keys should throttle like Error keys");
    });

    test("does not throttle on object identity", (t) => {
        const log = ylog({ filename: "test.js" });
        let errorCalls = 0;
        const originalError = console.error;
        t.after(() => {
            console.error = originalError;
        });
        console.error = () => {
            ++errorCalls;
        };

        const payload = { reason: "object-throttle-" + Date.now() };
        log.error(payload);
        log.error(payload);
        log.error(payload);

        assert.strictEqual(
            errorCalls,
            3,
            "object-identity throttling should not occur (would leak object graph)",
        );
    });

    test("suppresses null and undefined single arguments", () => {
        const log = ylog({ filename: "test.js" });
        let called = false;
        const originalError = console.error;
        console.error = () => {
            called = true;
        };
        try {
            log.error(null);
            assert.ok(!called, "null single arg should be suppressed");
            log.error(undefined);
            assert.ok(!called, "undefined single arg should be suppressed");
        } finally {
            console.error = originalError;
        }
    });

    test("below-threshold messages do not consume throttle budget", (t) => {
        const log = ylog({ filename: "level-throttle.js" });
        let errorCalls = 0;
        const originalError = console.error;
        t.after(() => {
            console.error = originalError;
            restoreDefaultLevel();
        });
        console.error = () => {
            ++errorCalls;
        };
        const message = uniqueKey("level-gated-error");

        ylog.loglevel("silent");
        log.error(message);
        log.error(message);
        log.error(message);
        ylog.loglevel("error");
        log.error(message);

        assert.strictEqual(errorCalls, 1);
    });

    test("independent root loggers have independent throttle budgets", (t) => {
        const first = ylog({ filename: "same-module.js" });
        const second = ylog({ filename: "same-module.js" });
        let errorCalls = 0;
        const originalError = console.error;
        t.after(() => {
            console.error = originalError;
        });
        console.error = () => {
            ++errorCalls;
        };
        const message = uniqueKey("independent-roots");

        first.error(message);
        first.error(message);
        first.error(message);
        second.error(message);

        assert.strictEqual(errorCalls, 3);
    });

    test("child loggers share their root logger throttle budget", (t) => {
        const log = ylog({ filename: "shared-root.js" });
        const child = log.child({ reqId: "abc" });
        let errorCalls = 0;
        const originalError = console.error;
        t.after(() => {
            console.error = originalError;
        });
        console.error = () => {
            ++errorCalls;
        };
        const message = uniqueKey("shared-child-budget");

        log.error(message);
        child.error(message);
        child.error(message);

        assert.strictEqual(errorCalls, 2);
    });

    test("warn and error use separate throttle budgets", (t) => {
        const log = ylog({ filename: "severity-budget.js" });
        let warnCalls = 0;
        let errorCalls = 0;
        const originalWarn = console.warn;
        const originalError = console.error;
        t.after(() => {
            console.warn = originalWarn;
            console.error = originalError;
        });
        console.warn = () => {
            ++warnCalls;
        };
        console.error = () => {
            ++errorCalls;
        };
        const message = uniqueKey("severity-budget");

        log.warn(message);
        log.warn(message);
        log.warn(message);
        log.error(message);

        assert.strictEqual(warnCalls, 2);
        assert.strictEqual(errorCalls, 1);
    });

    test("fatal messages are never throttled", (t) => {
        const log = ylog({ filename: "fatal.js" });
        let errorCalls = 0;
        const originalError = console.error;
        t.after(() => {
            console.error = originalError;
        });
        console.error = () => {
            ++errorCalls;
        };
        const message = uniqueKey("fatal-always-visible");

        log.fatal(message);
        log.fatal(message);
        log.fatal(message);

        assert.strictEqual(errorCalls, 3);
    });

    test("throttle window expires from the last allowed call", (t) => {
        let now = 1_000;
        const originalNow = Date.now;
        t.after(() => {
            Date.now = originalNow;
        });
        Date.now = () => now;
        const throttle = new ylog.ErrorThrottle(1, 100);

        assert.strictEqual(throttle.shouldThrottle("window"), false);
        now = 1_050;
        assert.strictEqual(throttle.shouldThrottle("window"), true);
        now = 1_101;
        assert.strictEqual(throttle.shouldThrottle("window"), false);
    });

    test("periodic sweep evicts stale throttle entries", (t) => {
        let now = 1_000;
        const originalNow = Date.now;
        t.after(() => {
            Date.now = originalNow;
        });
        Date.now = () => now;
        const throttle = new ylog.ErrorThrottle(1, 100);

        throttle.shouldThrottle("stale");
        now = 1_101;
        for (let index = 1; index < ylog.ErrorThrottle.EVICT_INTERVAL; ++index) {
            throttle.shouldThrottle(`fresh-${index}`);
        }

        assert.strictEqual(throttle.map.has("stale"), false);
    });
});

describe("factory static methods", () => {
    test("levels exposes the level hierarchy", () => {
        assert.ok(Object.isFrozen(ylog.levels));
        assert.strictEqual(ylog.levels.silent, -1);
        assert.strictEqual(ylog.levels.fatal, 0);
        assert.strictEqual(ylog.levels.error, 0);
        assert.strictEqual(ylog.levels.warn, 1);
        assert.strictEqual(ylog.levels.info, 2);
        assert.strictEqual(ylog.levels.debug, 3);
        assert.strictEqual(ylog.levels.trace, 4);
        assert.strictEqual(ylog.levels.verbose, 4);
    });

    test("verbose non-TTY output uses the debug syslog priority", (t) => {
        if (process.stdout.isTTY) {
            t.skip("requires non-TTY stdout");
            return;
        }

        const log = ylog({ filename: "syslog.js" }, { level: "verbose" });
        let captured = "";
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = (line) => {
            captured = line;
        };

        log.verbose("details");

        assert.match(captured, /^<7> \[VERBOSE\]/);
    });

    test("loglevel returns the factory for chaining", (t) => {
        t.after(restoreDefaultLevel);
        const result = ylog.loglevel("info");
        assert.strictEqual(result, ylog);
    });

    test("invalid global levels throw and leave the current default unchanged", (t) => {
        t.after(restoreDefaultLevel);
        ylog.loglevel("warn");
        assert.throws(() => ylog.loglevel("__proto__"), TypeError);
        assert.throws(() => ylog.loglevel("wran"), /unknown log level: wran/);
        assert.strictEqual(ylog.defaultLevel, ylog.levels.warn);
    });

    test("default level resolves from the environment lazily, not at import", () => {
        const pluginPath = fileURLToPath(new URL("../src/plugin.js", import.meta.url));
        const script = [
            `const { default: ylog } = await import(${JSON.stringify(pluginPath)});`,
            'process.env.NODE_ENV = "production";',
            "process.stdout.write(String(ylog.defaultLevel));",
        ].join("\n");

        const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
            encoding: "utf8",
            env: { ...process.env, NODE_ENV: "development" },
        });

        assert.strictEqual(result.status, 0, result.stderr);
        assert.strictEqual(
            Number(result.stdout.trim()),
            ylog.levels.info,
            "NODE_ENV set after import must still govern the default level",
        );
    });

    test("disableSyslogPrefix returns the factory for chaining", () => {
        const result = ylog.disableSyslogPrefix();
        assert.strictEqual(result, ylog);
    });

    test("ErrorThrottle is exposed on the factory", () => {
        assert.strictEqual(typeof ylog.ErrorThrottle, "function");
        const instance = new ylog.ErrorThrottle(5, 1000);
        assert.strictEqual(typeof instance.shouldThrottle, "function");
    });
});
