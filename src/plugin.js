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
import util from "node:util";
import path from "node:path";

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
    constructor(max = 2, throttle = 30 * 1000) {
        this.max = max;
        this.throttle = throttle;
        this.map = new Map();
    }

    shouldThrottle(key) {
        const now = Date.now();
        const rec = this.map.get(key);
        if (!rec || now - rec.last > this.throttle) {
            this.map.set(key, { count: 1, last: now });
            return false;
        }
        if (++rec.count < this.max) {
            rec.last = now;
            return false;
        }
        return true;
    }
}

const throttle = new ErrorThrottle();

const isError = (x) => x instanceof Error;

const extractKey = (args) => {
    for (const arg of args) {
        if (isError(arg)) {
            return arg.code || arg.message || String(arg);
        }
    }
    if (1 === args.length) {
        return args[0];
    }
    return null;
};

const pad = (n) => (n < 10 ? "0" + n : n);

const getTimestamp = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const applyColor = (color, s) => {
    if (!useColors || !color || !s) {
        return s;
    }
    return `\x1B[${color[0]}m${s}\x1B[${color[1]}m`;
};

const bracket = (s, start = "[", end = "]") => {
    return s ? `${start}${s}${end}` : "";
};

class Log {
    /**
     * @class Log
     * @constructor
     *
     * @param {Object} module The module that is calling us
     * @param {String} [level] Our logging level, defaults to our app logging level
     */
    constructor(mod, options = {}) {
        const defaultOptions = {
            level: appLogLevel,
            pid: false,
        };

        const finalOptions = { ...defaultOptions, ...options };

        this.tag = mod?.filename ? path.basename(mod.filename, ".js") : "unknown";
        this.pid = finalOptions.pid;

        this.level = levels[finalOptions.appLogLevel] ?? defaultOptions.level;
    }

    /**
     * Output with timestamp on stdout in yellow.
     *
     * @method log
     * @param {Number} level log level: error, warn, info, debug, verbose
     * @param {Array} args arguments for util.format
     * @param {Color} [color] the color you want output
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
        message.push(util.format(...args));

        console[stdio](message.join(" "));
    }

    throttled(prefix, level, color) {
        return (...args) => {
            if (!args.length || (args.length === 1 && args[0] == null)) {
                return;
            }
            const key = extractKey(args);
            if (key && throttle.shouldThrottle(key)) {
                return;
            }
            this.log(prefix, level, args, color);
        };
    }

    /**
     * Output with timestamp on stderr in red.
     *
     * @method fatal
     * @param {String} format util.format placeholder string
     * @param {String...} [...] optional arguments for util.format
     */
    fatal = this.throttled("FATAL", levels.error, colors.magenta);

    /**
     * Output with timestamp on stderr in red.
     *
     * @method error
     * @param {String} format util.format placeholder string
     * @param {String...} [...] optional arguments for util.format
     */
    error = this.throttled("ERROR", levels.error, colors.red);

    /**
     * Output with timestamp on stdout in yellow.
     *
     * @method warn
     * @param {String} format util.format placeholder string
     * @param {String...} [...] optional arguments for util.format
     */
    warn = this.throttled("WARN", levels.warn, colors.yellow);

    /**
     * Same as Log.info but only prints when in debug mode
     *
     * @method debug
     * @param {String} format util.format placeholder string
     * @param {String...} [...] optional arguments for util.format
     */
    info(...args) {
        this.log("INFO", levels.info, args, colors.blue);
    }

    /**
     * Same as Log.info but only prints when in debug mode
     *
     * @method debug
     * @param {String} format util.format placeholder string
     * @param {String...} [...] optional arguments for util.format
     */
    debug(...args) {
        this.log("DEBUG", levels.debug, args);
    }

    /**
     * Same as Log.info but only prints when in debug mode
     *
     * @method verbose
     * @param {String} format util.format placeholder string
     * @param {String...} [...] optional arguments for util.format
     */
    verbose(...args) {
        this.log("VERBOSE", levels.verbose, args);
    }

    /**
     * Same as Log.info but only prints when in debug mode
     *
     * @method trace
     * @param {String} format util.format placeholder string
     * @param {String...} [...] optional arguments for util.format
     */
    trace(...args) {
        this.log("TRACE", levels.verbose, args);
    }

    /**
     * Nothing yet...
     *
     * TODO: Detect submodule usage and tag accordingly
     *
     * @method child
     * @param {String} format util.format placeholder string
     * @param {String...} [...] optional arguments for util.format
     */
    child(...args) {
        return this;
    }
}

function createLogger(mod, level) {
    return new Log(mod, level);
}

createLogger.loglevel = (level) => {
    appLogLevel = levels[level] ?? appLogLevel;
    return createLogger;
};

createLogger.disableSyslogPrefix = () => {
    useSyslogPrefix = false;
    return createLogger;
};

createLogger.levels = levels;
createLogger.defaultLevel = appLogLevel;

createLogger.ErrorThrottle = ErrorThrottle;

// Export for ES Modules
export default createLogger;

// Fallback for CommonJS
if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = createLogger;
}
