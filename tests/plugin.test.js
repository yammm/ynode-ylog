import assert from "node:assert";
import { test } from "node:test";
import ylog from "../src/plugin.js";

test("ylog basic logging functions exist and execute", (t) => {
    const log = ylog({ filename: "test.js" });
    assert.strictEqual(typeof log.info, "function");
    assert.strictEqual(typeof log.error, "function");
    assert.strictEqual(typeof log.warn, "function");

    let called = false;
    const originalLog = console.log;
    t.after(() => { console.log = originalLog; });
    console.log = () => { called = true; };

    log.info("test info");
    assert.ok(called, "console.log should have been called");
});

test("ylog throttling mechanism works for identical errors", (t) => {
    const log = ylog({ filename: "test.js" });
    let errorCalls = 0;

    const originalError = console.error;
    t.after(() => { console.error = originalError; });

    console.error = () => { errorCalls++; };

    const sharedError = new Error("throttle this error");

    // Default max throttle calls is 2 before suppressing
    log.error(sharedError);
    log.error(sharedError);
    log.error(sharedError); // This should be throttled
    log.error(sharedError); // This should be throttled

    assert.strictEqual(errorCalls, 1, "Only one call should pass through the error throttle before being blocked");
});
