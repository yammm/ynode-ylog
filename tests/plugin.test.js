import assert from "node:assert";
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

        assert.strictEqual(traceChild.level, "verbose");
        assert.strictEqual(fatalChild.level, "error");
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

    test("invalid level falls back to default", (t) => {
        const log = ylog({ filename: "test.js" }, { level: "nonexistent" });
        let called = false;
        const originalLog = console.log;
        t.after(() => {
            console.log = originalLog;
        });
        console.log = () => {
            called = true;
        };

        log.info("should still work with fallback level");
        assert.ok(called, "info should emit at default fallback level");
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

    test("invalid global levels leave the current default unchanged", (t) => {
        t.after(restoreDefaultLevel);
        ylog.loglevel("warn");
        ylog.loglevel("__proto__");
        assert.strictEqual(ylog.defaultLevel, ylog.levels.warn);
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
