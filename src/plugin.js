/**
 * Helper module for outputting colored info, warn, error, debug and trace/
 * verbose log messages. Works with Fastify or standalone
 *
 * @module log
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

Copyright (c) 2025 Michael Welter <me@mikinho.com>

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
import path from "node:path";
import util from "node:util";

const levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    verbose: 4,
};

const syslogPrefix = {
    0: "<3>",
    1: "<4>",
    2: "<6>",
    3: "<7>",
    4: "",
};

let appLogLevel = process.env.NODE_ENV !== "production" ? levels.debug : levels.info;
let useSyslogPrefix = !process.stdout.isTTY;
const useColors = process.stdout.hasColors && process.stdout.hasColors();

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
     * @param {number} [throttle=30000] - Window duration in milliseconds.
     */
    constructor(max = 2, throttle = 30 * 1000) {
        this.max = max;
        this.throttle = throttle;
        this.map = new Map();
        this.callsSinceEvict = 0;
    }

    /**
     * Returns true when the given key has exceeded the max call threshold
     * within the throttle window and should be suppressed.
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

const throttle = new ErrorThrottle();

/**
 * @param {*} x - Value to check.
 * @returns {boolean} True when x is an Error instance.
 */
const isError = (x) => x instanceof Error;

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
const pad = (n) => (n < 10 ? "0" + n : n);

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
 * @returns {string} Colorized string, or the original if colors are unavailable.
 */
const applyColor = (color, s) => {
    if (!useColors || !color || !s) {
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

class Log {
    /**
     * @param {object} mod - Module metadata (import.meta or { filename }).
     * @param {object} [options] - Logger options.
     * @param {string} [options.level] - Named log level (error|warn|info|debug|verbose).
     * @param {boolean} [options.pid] - Include process PID in output.
     */
    constructor(mod, options = {}) {
        const defaultOptions = {
            level: appLogLevel,
            pid: false,
        };

        const finalOptions = { ...defaultOptions, ...options };

        this.tag = mod?.filename ? path.basename(mod.filename, ".js") : "unknown";
        this.pid = finalOptions.pid;

        this.level = levels[finalOptions.level] ?? defaultOptions.level;
        this.bindings = null;
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
        if (level > this.level) {
            return;
        }

        const stdio = level === levels.error ? "error" : level === levels.warn ? "warn" : "log";

        const message = [];

        if (useSyslogPrefix) {
            message.push(syslogPrefix[level]);
        }
        if (process.stdout.isTTY) {
            message.push(`[${getTimestamp()}]`);
        }
        if (prefix) {
            message.push(applyColor(color, bracket(prefix)));
        }
        if (this.pid) {
            message.push(applyColor(colors.cyan, bracket(process.pid, "{", "}")));
        }
        if (this.tag) {
            message.push(bracket(this.tag));
        }
        if (this.bindings) {
            const parts = [];
            for (const [k, v] of Object.entries(this.bindings)) {
                parts.push(`${k}=${v}`);
            }
            if (parts.length) {
                message.push(bracket(parts.join(" ")));
            }
        }
        message.push(util.format(...args));

        console[stdio](message.join(" "));
    }

    /**
     * Creates a throttled log function that suppresses duplicate messages
     * after the configured max calls within the throttle window.
     * @param {string} prefix - Label prefix (FATAL, ERROR, WARN).
     * @param {number} level - Numeric log level threshold.
     * @param {Array<number>} color - ANSI color pair.
     * @returns {function(...*): void} Throttled logging function.
     */
    throttled(prefix, level, color) {
        return (...args) => {
            if (
                !args.length ||
                (args.length === 1 && (args[0] === null || args[0] === undefined))
            ) {
                return;
            }
            const key = extractKey(args);
            if (key && throttle.shouldThrottle(key)) {
                return;
            }
            this.log(prefix, level, args, color);
        };
    }

    /** Throttled FATAL output on stderr in magenta. @param {...*} args */
    fatal = this.throttled("FATAL", levels.error, colors.magenta);

    /** Throttled ERROR output on stderr in red. @param {...*} args */
    error = this.throttled("ERROR", levels.error, colors.red);

    /** Throttled WARN output on stderr in yellow. @param {...*} args */
    warn = this.throttled("WARN", levels.warn, colors.yellow);

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

    /**
     * Creates a derived logger that prepends the given bindings to every log
     * line. Implements the Fastify/Pino child-logger contract — repeated
     * calls compose bindings, inheriting tag, pid, level, and parent bindings.
     * @param {object} [bindings] - Key/value pairs rendered as `[k=v ...]` on
     *   every log line. Omitted or empty produces an unbound child.
     * @returns {Log} A new logger instance.
     */
    child(bindings) {
        const child = Object.create(Log.prototype);
        child.tag = this.tag;
        child.pid = this.pid;
        child.level = this.level;
        child.bindings =
            bindings && typeof bindings === "object"
                ? { ...(this.bindings ?? {}), ...bindings }
                : (this.bindings ?? null);
        child.fatal = child.throttled("FATAL", levels.error, colors.magenta);
        child.error = child.throttled("ERROR", levels.error, colors.red);
        child.warn = child.throttled("WARN", levels.warn, colors.yellow);
        return child;
    }
}

/**
 * Factory that creates a new Log instance.
 * @param {object} mod - Module metadata (import.meta or { filename }).
 * @param {object} [options] - Logger options forwarded to the Log constructor.
 * @returns {Log}
 */
function createLogger(mod, options) {
    return new Log(mod, options);
}

/**
 * Sets the global application log level.
 * @param {string} level - Named level (error|warn|info|debug|verbose).
 * @returns {typeof createLogger} The factory, for chaining.
 */
createLogger.loglevel = (level) => {
    appLogLevel = levels[level] ?? appLogLevel;
    return createLogger;
};

/**
 * Disables syslog severity prefixes in non-TTY output.
 * @returns {typeof createLogger} The factory, for chaining.
 */
createLogger.disableSyslogPrefix = () => {
    useSyslogPrefix = false;
    return createLogger;
};

/**
 * Numeric log level constants keyed by level name.
 * @type {{error: number, warn: number, info: number, debug: number, verbose: number}}
 */
createLogger.levels = levels;

/**
 * Default log level resolved at module load (info in production, debug otherwise).
 * @type {number}
 */
createLogger.defaultLevel = appLogLevel;

/**
 * ErrorThrottle class for custom throttle instances.
 * @type {typeof ErrorThrottle}
 */
createLogger.ErrorThrottle = ErrorThrottle;

export default createLogger;
