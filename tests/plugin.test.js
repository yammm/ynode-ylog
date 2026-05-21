import assert from "node:assert";
import { describe, test } from "node:test";

import ylog from "../src/plugin.js";

describe("basic logging", () => {
    test("exposes info, error, warn, debug, verbose, trace, and fatal methods", () => {
        const log = ylog({ filename: "test.js" });
        assert.strictEqual(typeof log.info, "function");
        assert.strictEqual(typeof log.error, "function");
        assert.strictEqual(typeof log.warn, "function");
        assert.strictEqual(typeof log.debug, "function");
        assert.strictEqual(typeof log.verbose, "function");
        assert.strictEqual(typeof log.trace, "function");
        assert.strictEqual(typeof log.fatal, "function");
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
});

describe("factory static methods", () => {
    test("levels exposes the level hierarchy", () => {
        assert.strictEqual(ylog.levels.error, 0);
        assert.strictEqual(ylog.levels.warn, 1);
        assert.strictEqual(ylog.levels.info, 2);
        assert.strictEqual(ylog.levels.debug, 3);
        assert.strictEqual(ylog.levels.verbose, 4);
    });

    test("loglevel returns the factory for chaining", () => {
        const result = ylog.loglevel("info");
        assert.strictEqual(result, ylog);
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
