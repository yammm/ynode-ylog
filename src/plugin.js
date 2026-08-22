/**
 * Helper module for outputting colored info, warn, error, debug and trace/
 * verbose log messages. Works with Fastify or standalone
 *
 * @module @ynode/ylog
 *
 * @example
 *
 * import ylog from "@ynode/ylog";
 * const log = ylog(import.meta);
 *
 * log.info(`[${process.pid}] Hello`);
 *
 * const fastify = Fastify({ loggerInstance: log });
 */

/*
The MIT License (MIT)

Copyright (c) 2026 Michael Welter <me@mikinho.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// Node.js native dependencies
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import util from "node:util";

const levels = Object.freeze({
    silent: -1,
    fatal: 0,
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4,
    verbose: 4,
});

const syslogPrefix = {
    0: "<3>",
    1: "<4>",
    2: "<6>",
    3: "<7>",
    4: "<7>",
};

// Resolved lazily on first use so environment configuration loaded after
// import (for example via dotenv) is still respected.
let appLogLevelName = null;
let appLogLevel = null;
let useSyslogPrefix = true;

/**
 * Resolves the global default level from the environment on first use.
 * @returns {void}
 */
const ensureGlobalLevel = () => {
    if (appLogLevel !== null) {
        return;
    }
    appLogLevelName = process.env.NODE_ENV !== "production" ? "debug" : "info";
    appLogLevel = levels[appLogLevelName];
};
const contextStore = new AsyncLocalStorage();

// copying here to restrict colors and optimize speed
const colors = {
    black: util.inspect.colors.black,
    red: util.inspect.colors.redBright,
    green: util.inspect.colors.green,
    yellow: util.inspect.colors.yellow,
    blue: util.inspect.colors.blueBright,
    magenta: util.inspect.colors.magenta,
    cyan: util.inspect.colors.cyan,
    white: util.inspect.colors.white,
    gray: util.inspect.colors.gray,
};

class ErrorThrottle {
    /**
     * Number of shouldThrottle calls between stale-entry eviction sweeps.
     * @type {number}
     */
    static EVICT_INTERVAL = 100;

    /**
     * @param {number} [max=2] - Maximum calls allowed before suppression.
     * @param {number} [windowMs=30000] - Window duration in milliseconds.
     */
    constructor(max = 2, windowMs = 30 * 1000) {
        this.max = max;
        this.throttle = windowMs;
        this.map = new Map();
        this.callsSinceEvict = 0;
    }

    /**
     * Returns true when the given key has exceeded the max call threshold
     * within the throttle window and should be suppressed. Suppressed calls do
     * not extend the window; it expires relative to the last allowed call.
     * @param {string} key - Deduplication key (typically error code or message).
     * @returns {boolean}
     */
    shouldThrottle(key) {
        const now = Date.now();

        // Periodic eviction of stale entries to prevent unbounded Map growth.
        if (++this.callsSinceEvict >= ErrorThrottle.EVICT_INTERVAL) {
            this.callsSinceEvict = 0;
            for (const [k, rec] of this.map) {
                if (now - rec.last > this.throttle) {
                    this.map.delete(k);
                }
            }
        }

        const rec = this.map.get(key);
        if (!rec || now - rec.last > this.throttle) {
            this.map.set(key, { count: 1, last: now });
            return false;
        }
        ++rec.count;
        if (rec.count <= this.max) {
            rec.last = now;
            return false;
        }
        return true;
    }
}

/**
 * @param {*} x - Value to check.
 * @returns {boolean} True when x is an Error instance.
 */
const isError = (x) => x instanceof Error;

/**
 * Returns true when a log call carries no meaningful payload — either no
 * arguments at all or a sole null/undefined argument.
 * @param {Array<*>} args - Arguments passed to a log method.
 * @returns {boolean}
 */
const isEmptyLogCall = (args) =>
    !args.length || (args.length === 1 && (args[0] === null || args[0] === undefined));

/**
 * Returns true when a value is an object suitable for log bindings.
 * @param {*} value - Candidate binding object.
 * @returns {boolean}
 */
const isBindingObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Shallow-copies log bindings so callers cannot mutate logger/context state
 * after binding creation.
 * @param {object} bindings - Candidate binding object.
 * @returns {object|null}
 */
const normalizeBindings = (bindings) => {
    if (!isBindingObject(bindings)) {
        return null;
    }
    return { ...bindings };
};

/**
 * Returns the active AsyncLocalStorage logging context.
 * @returns {object|null}
 */
const currentContextBindings = () => normalizeBindings(contextStore.getStore());

/**
 * Merges optional binding objects, preserving later values for duplicate keys.
 * @param {...object|null} bindingSets - Binding objects to merge.
 * @returns {object|null}
 */
const mergeBindings = (...bindingSets) => {
    const merged = {};
    for (const bindings of bindingSets) {
        if (isBindingObject(bindings)) {
            Object.assign(merged, bindings);
        }
    }
    return Object.keys(merged).length ? merged : null;
};

/**
 * Runs callback with merged AsyncLocalStorage bindings for request correlation.
 * @param {object} bindings - Context bindings to expose to log calls.
 * @param {function} callback - Work to run inside the logging context.
 * @returns {*} The callback result.
 */
const runWithContext = (bindings, callback) => {
    if (typeof callback !== "function") {
        throw new TypeError("ylog.withContext requires a callback function");
    }
    const merged = mergeBindings(currentContextBindings(), normalizeBindings(bindings)) ?? {};
    return contextStore.run(merged, callback);
};

/**
 * Converts an Error into a JSON-safe shape.
 * @param {Error} error - Error instance.
 * @returns {object}
 */
const serializeError = (error) => {
    const serialized = {
        name: error.name,
        message: error.message,
    };
    if (error.stack) {
        serialized.stack = error.stack;
    }
    if (Object.hasOwn(error, "code")) {
        serialized.code = error.code;
    }
    return serialized;
};

/**
 * Creates a JSON.stringify replacer that handles Errors, BigInts, and circular
 * object graphs without throwing.
 * @returns {function}
 */
const createJsonReplacer = () => {
    const seen = new WeakSet();
    return (_key, value) => {
        if (isError(value)) {
            return serializeError(value);
        }
        if (typeof value === "bigint") {
            return value.toString();
        }
        if (value && typeof value === "object") {
            if (seen.has(value)) {
                return "[Circular]";
            }
            seen.add(value);
        }
        return value;
    };
};

/**
 * Builds a structured JSON log line.
 * @param {object} options - Log record inputs.
 * @returns {string}
 */
const buildJsonLine = ({ tag, pid, prefix, args, bindings }) => {
    const error = args.find(isError);

    // Error stacks live solely in the structured `err` field regardless of
    // argument order. `msg` uses each Error's message so mixed context/error
    // calls remain readable without duplicating a stack.
    const msgArgs = args.map((arg) => (isError(arg) ? arg.message : arg));

    const record = {
        ...(bindings ?? {}),
        time: new Date().toISOString(),
        level: prefix ? prefix.toLowerCase() : "info",
        tag,
        msg: util.format(...msgArgs),
    };
    if (pid) {
        record.pid = process.pid;
    }
    if (error) {
        record.err = error;
    }

    return JSON.stringify(record, createJsonReplacer());
};

/**
 * Extracts a deduplication key from an argument list. Prefers Error.code or
 * Error.message when an Error is present; otherwise returns the sole argument
 * coerced to a string when it is a primitive. Object payloads return null so
 * the throttle Map never pins the object graph and structurally-identical
 * objects do not throttle independently by identity.
 * @param {Array<*>} args - Arguments passed to a throttled log method.
 * @returns {string|null} Throttle key, or null when no key can be derived.
 */
const extractKey = (args) => {
    for (const arg of args) {
        if (isError(arg)) {
            return arg.code || arg.message || String(arg);
        }
    }
    if (args.length === 1) {
        const sole = args[0];
        const t = typeof sole;
        if (t === "string") {
            return sole;
        }
        if (t === "number" || t === "boolean" || t === "bigint") {
            return String(sole);
        }
        return null;
    }
    return null;
};

/**
 * Zero-pads a number to two digits.
 * @param {number} n - Number between 0-59.
 * @returns {string} Two-character string.
 */
const pad = (n) => String(n).padStart(2, "0");

/**
 * Returns a formatted timestamp string (YYYY-MM-DD HH:mm:ss) for log output.
 * @returns {string}
 */
const getTimestamp = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/**
 * Wraps a string in ANSI color codes when the terminal supports color.
 * @param {Array<number>} color - ANSI open/close pair from util.inspect.colors.
 * @param {string} s - String to colorize.
 * @param {boolean} enabled - Whether the destination stream supports color.
 * @returns {string} Colorized string, or the original if colors are unavailable.
 */
const applyColor = (color, s, enabled) => {
    if (!enabled || !color || !s) {
        return s;
    }
    return `\x1B[${color[0]}m${s}\x1B[${color[1]}m`;
};

/**
 * Wraps a value in bracket characters. Returns empty string for falsy input.
 * @param {string} s - Value to wrap.
 * @param {string} [start="["] - Opening bracket character.
 * @param {string} [end="]"] - Closing bracket character.
 * @returns {string}
 */
const bracket = (s, start = "[", end = "]") => {
    return s ? `${start}${s}${end}` : "";
};

/**
 * C0 control characters plus DEL. A CR/LF in untrusted data would forge whole
 * log lines (including fake syslog severity prefixes) and an ESC would inject
 * terminal escape sequences, so all of them are escaped before writing.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point here
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Escapes a single control character as a readable backslash sequence.
 * @param {string} char - Matched control character.
 * @returns {string} Escaped representation.
 */
const escapeControlChar = (char) => {
    if (char === "\n") {
        return "\\n";
    }
    if (char === "\r") {
        return "\\r";
    }
    if (char === "\t") {
        return "\\t";
    }
    return `\\x${char.codePointAt(0).toString(16).padStart(2, "0")}`;
};

/**
 * Neutralizes control characters in text-mode output so untrusted values
 * cannot forge log lines or inject terminal escapes.
 * @param {*} value - Value to render into a text log line.
 * @returns {string} String with control characters escaped.
 */
const sanitizeControlChars = (value) => String(value).replace(CONTROL_CHARS, escapeControlChar);

class Log {
    /**
     * @param {object} mod - Module metadata (import.meta or { filename/url }).
     * @param {object} [options] - Logger options.
     * @param {string} [options.level] - Named log level (silent|fatal|error|warn|info|debug|trace|verbose).
     * @param {boolean} [options.pid] - Include process PID in output.
     * @param {"text"|"json"} [options.format="text"] - Output format. `json: true`
     *   is accepted as an alias for `format: "json"`.
     * @param {boolean} [options.json] - Alias for `format: "json"`.
     * @param {object} [options.bindings] - Static bindings for every log line.
     * @param {boolean} [options.sanitize=true] - Escape control characters in
     *   text-mode messages and binding values to prevent log-line forgery.
     * @param {string} [options.tag] - Explicit tag overriding the module-derived name.
     */
    constructor(mod, options = {}) {
        const normalizedOptions = options && typeof options === "object" ? options : {};
        const moduleFilename =
            mod?.filename ??
            (typeof mod?.url === "string" && mod.url.startsWith("file:")
                ? fileURLToPath(mod.url)
                : null);

        this.tag =
            typeof normalizedOptions.tag === "string" && normalizedOptions.tag
                ? normalizedOptions.tag
                : moduleFilename
                  ? path.basename(moduleFilename, ".js")
                  : "unknown";
        this.pid = normalizedOptions.pid ?? false;
        this.format =
            normalizedOptions.format === "json" || normalizedOptions.json === true
                ? "json"
                : "text";
        if (
            normalizedOptions.level !== undefined &&
            !Object.hasOwn(levels, normalizedOptions.level)
        ) {
            throw new TypeError(
                `@ynode/ylog unknown log level: ${String(normalizedOptions.level)}`,
            );
        }
        this._levelOverrideName = Object.hasOwn(levels, normalizedOptions.level)
            ? normalizedOptions.level
            : null;
        this._levelOverride =
            this._levelOverrideName === null ? null : levels[this._levelOverrideName];
        this.sanitize = normalizedOptions.sanitize !== false;
        this.throttle = new ErrorThrottle();
        this.bindings = normalizeBindings(normalizedOptions.bindings);
    }

    /** Numeric threshold used internally for level comparisons. @returns {number} */
    get levelValue() {
        if (this._levelOverride !== null) {
            return this._levelOverride;
        }
        ensureGlobalLevel();
        return appLogLevel;
    }

    /**
     * Fastify/Pino-compatible named log level. Reports the exact name that was
     * requested, so aliases such as `fatal` and `trace` round-trip even though
     * they share a numeric rank with `error` and `verbose`.
     * @returns {string}
     */
    get level() {
        if (this._levelOverrideName !== null) {
            return this._levelOverrideName;
        }
        ensureGlobalLevel();
        return appLogLevelName;
    }

    /**
     * Sets an explicit named level for this logger. Assigning null or
     * undefined clears the override so the logger follows the global level.
     * @param {string|null|undefined} level - Named log level, or null/undefined to clear.
     * @throws {TypeError} When the level name is not recognized.
     */
    set level(level) {
        if (level === null || level === undefined) {
            this._levelOverrideName = null;
            this._levelOverride = null;
            return;
        }
        if (!Object.hasOwn(levels, level)) {
            throw new TypeError(`@ynode/ylog unknown log level: ${String(level)}`);
        }
        this._levelOverrideName = level;
        this._levelOverride = levels[level];
    }

    /**
     * Core output method. Routes to the appropriate console stream and applies
     * timestamp, syslog prefix, color, PID, and module tag formatting.
     *
     * @param {string} prefix - Label prefix (INFO, ERROR, etc.).
     * @param {number} level - Numeric log level threshold.
     * @param {Array<*>} args - Arguments forwarded to util.format.
     * @param {Array<number>} [color] - ANSI open/close pair from util.inspect.colors.
     */
    log(prefix, level, args, color) {
        if (level > this.levelValue) {
            return;
        }

        const stdio = level === levels.error ? "error" : level === levels.warn ? "warn" : "log";
        const stream = stdio === "log" ? process.stdout : process.stderr;
        const isTTY = stream.isTTY === true;
        const useColors = stream.hasColors?.() ?? false;

        const activeBindings = mergeBindings(currentContextBindings(), this.bindings);

        if (this.format === "json") {
            console[stdio](
                buildJsonLine({
                    tag: this.tag,
                    pid: this.pid,
                    prefix,
                    args,
                    bindings: activeBindings,
                }),
            );
            return;
        }

        const message = [];

        if (useSyslogPrefix && !isTTY) {
            message.push(syslogPrefix[level]);
        }
        if (isTTY) {
            message.push(`[${getTimestamp()}]`);
        }
        if (prefix) {
            message.push(applyColor(color, bracket(prefix), useColors));
        }
        if (this.pid) {
            message.push(applyColor(colors.cyan, bracket(process.pid, "{", "}"), useColors));
        }
        if (this.tag) {
            message.push(bracket(this.tag));
        }
        if (activeBindings) {
            const parts = [];
            for (const [k, v] of Object.entries(activeBindings)) {
                parts.push(
                    this.sanitize
                        ? `${sanitizeControlChars(k)}=${sanitizeControlChars(v)}`
                        : `${k}=${v}`,
                );
            }
            if (parts.length) {
                message.push(bracket(parts.join(" ")));
            }
        }
        const formatted = util.format(...args);
        message.push(this.sanitize ? sanitizeControlChars(formatted) : formatted);

        console[stdio](message.join(" "));
    }

    /**
     * Emits a throttled message after checking its log level. Throttle keys are
     * isolated by root logger and severity so one logger or level cannot consume
     * another logger's error budget. Child loggers share their parent's budget.
     * @param {string} prefix - Label prefix (ERROR or WARN).
     * @param {number} level - Numeric log level threshold.
     * @param {Array<number>} color - ANSI color pair.
     * @param {Array<*>} args - Log arguments.
     */
    emitThrottled(prefix, level, color, args) {
        if (level > this.levelValue) {
            return;
        }
        if (isEmptyLogCall(args)) {
            return;
        }

        const key = extractKey(args);
        const scopedKey = key ? `${prefix}\0${key}` : null;
        if (scopedKey && this.throttle.shouldThrottle(scopedKey)) {
            return;
        }
        this.log(prefix, level, args, color);
    }

    /** FATAL output on stderr in magenta. Fatal messages are never throttled. @param {...*} args */
    fatal(...args) {
        if (isEmptyLogCall(args)) {
            return;
        }
        this.log("FATAL", levels.error, args, colors.magenta);
    }

    /** Throttled ERROR output on stderr in red. @param {...*} args */
    error(...args) {
        this.emitThrottled("ERROR", levels.error, colors.red, args);
    }

    /** Throttled WARN output on stderr in yellow. @param {...*} args */
    warn(...args) {
        this.emitThrottled("WARN", levels.warn, colors.yellow, args);
    }

    /** INFO output on stdout in blue. @param {...*} args */
    info(...args) {
        this.log("INFO", levels.info, args, colors.blue);
    }

    /** DEBUG output on stdout (no color). Only emits at debug level or above. @param {...*} args */
    debug(...args) {
        this.log("DEBUG", levels.debug, args);
    }

    /** VERBOSE output on stdout (no color). Only emits at verbose level. @param {...*} args */
    verbose(...args) {
        this.log("VERBOSE", levels.verbose, args);
    }

    /** Alias for verbose. @param {...*} args */
    trace(...args) {
        this.log("TRACE", levels.verbose, args);
    }

    /** Fastify/Pino-compatible no-op log method. */
    silent() {}

    /**
     * Creates a derived logger that prepends the given bindings to every log
     * line. Implements the Fastify/Pino child-logger contract — repeated
     * calls compose bindings, inheriting tag, pid, level, and parent bindings.
     * @param {object} [bindings] - Key/value pairs rendered as `[k=v ...]` on
     *   every log line. Omitted or empty produces an unbound child.
     * @param {object} [options] - Fastify/Pino child logger options.
     * @param {string} [options.level] - Optional child-specific log level.
     * @returns {Log} A new logger instance.
     */
    child(bindings, options = {}) {
        const childOptions = options && typeof options === "object" ? options : {};
        const childBindings = normalizeBindings(bindings);

        // Route through the constructor so new constructor fields are never
        // silently dropped from derived loggers.
        const child = new Log(null, {
            tag: this.tag,
            pid: this.pid,
            format:
                childOptions.format === "json" || childOptions.format === "text"
                    ? childOptions.format
                    : this.format,
            level:
                childOptions.level === undefined
                    ? (this._levelOverrideName ?? undefined)
                    : childOptions.level,
            sanitize: this.sanitize,
            bindings: childBindings
                ? { ...(this.bindings ?? {}), ...childBindings }
                : (this.bindings ?? undefined),
        });

        // Children share their parent's throttle budget by contract.
        child.throttle = this.throttle;
        return child;
    }
}

/**
 * Factory that creates a new Log instance.
 * @param {object} mod - Module metadata (import.meta or { filename/url }).
 * @param {object} [options] - Logger options forwarded to the Log constructor.
 * @returns {Log}
 */
function createLogger(mod, options) {
    return new Log(mod, options);
}

/**
 * Sets the global application log level.
 * Existing loggers without an explicit level observe the change immediately.
 * @param {string} level - Named level (silent|fatal|error|warn|info|debug|trace|verbose).
 * @returns {function} The factory, for chaining.
 * @throws {TypeError} When the level name is not recognized.
 */
createLogger.loglevel = (level) => {
    if (!Object.hasOwn(levels, level)) {
        throw new TypeError(`@ynode/ylog unknown log level: ${String(level)}`);
    }
    appLogLevelName = level;
    appLogLevel = levels[level];
    return createLogger;
};

/**
 * Disables syslog severity prefixes in non-TTY output.
 * @returns {function} The factory, for chaining.
 */
createLogger.disableSyslogPrefix = () => {
    useSyslogPrefix = false;
    return createLogger;
};

/**
 * Runs callback with request/context bindings included in every log line emitted
 * by the current async execution path.
 * @param {object} bindings - Context bindings.
 * @param {function} callback - Work to run inside the context.
 * @returns {*} The callback result.
 */
createLogger.withContext = (bindings, callback) => runWithContext(bindings, callback);

/**
 * Returns a shallow copy of the active async logging context.
 * @returns {object}
 */
createLogger.getContext = () => currentContextBindings() ?? {};

/**
 * Numeric log level constants keyed by level name.
 * @type {{silent: number, fatal: number, error: number, warn: number, info: number, debug: number, trace: number, verbose: number}}
 */
createLogger.levels = levels;

/**
 * Current default log level for loggers without an explicit override.
 * @type {number}
 */
Object.defineProperty(createLogger, "defaultLevel", {
    enumerable: true,
    get: () => {
        ensureGlobalLevel();
        return appLogLevel;
    },
});

/**
 * ErrorThrottle class for custom throttle instances.
 * @type {function}
 */
createLogger.ErrorThrottle = ErrorThrottle;

export default createLogger;
