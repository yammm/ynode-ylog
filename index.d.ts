export type LogLevel =
    "silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "verbose";

export type LogFormat = "text" | "json";
export type LogBindings = Record<string, unknown>;

export interface YlogOptions {
    /**
     * Named log level threshold.
     * @default Based on NODE_ENV: 'debug' in development, 'info' in production.
     */
    level?: LogLevel;

    /**
     * Include process PID in log output.
     * @default false
     */
    pid?: boolean;

    /**
     * Output format. "text" preserves the classic colored/syslog line format;
     * "json" emits one JSON object per log call.
     * @default "text"
     */
    format?: LogFormat;

    /**
     * Alias for format: "json".
     * @default false
     */
    json?: boolean;

    /**
     * Static fields included with every log line.
     */
    bindings?: LogBindings;

    /**
     * Escape control characters in text-mode messages and binding values to
     * prevent log-line forgery and terminal escape injection.
     * @default true
     */
    sanitize?: boolean;

    /**
     * Explicit tag overriding the module-derived name.
     */
    tag?: string;
}

export interface ChildLoggerOptions {
    /** Optional log-level override for the derived logger. */
    level?: LogLevel;

    /** Optional output-format override for the derived logger. */
    format?: LogFormat;

    /** Accepted for compatibility with Fastify/Pino child logger calls. */
    serializers?: Record<string, unknown>;
}

export interface ModuleMetadata {
    /** Absolute module filename when supplied by newer Node.js releases. */
    filename?: string;

    /** Module URL used as a fallback on Node.js releases without import.meta.filename. */
    url?: string;
}

export interface Logger {
    /** Current named level. Loggers without an override follow the global level. */
    get level(): LogLevel;
    /** Sets an override, or clears it with null/undefined to follow the global level. */
    set level(value: LogLevel | null | undefined);
    fatal(...args: unknown[]): void;
    error(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    info(...args: unknown[]): void;
    debug(...args: unknown[]): void;
    verbose(...args: unknown[]): void;
    trace(...args: unknown[]): void;
    silent(...args: unknown[]): void;
    /**
     * Creates a derived logger that prepends the given bindings to every log line.
     * Compatible with the Fastify/Pino child-logger contract.
     */
    child(bindings?: LogBindings, options?: ChildLoggerOptions): Logger;
}

export interface LogLevels {
    readonly silent: -1;
    readonly fatal: 0;
    readonly error: 0;
    readonly warn: 1;
    readonly info: 2;
    readonly debug: 3;
    readonly trace: 4;
    readonly verbose: 4;
}

export interface CreateLogger {
    (mod: ModuleMetadata, options?: YlogOptions): Logger;

    /** Sets the live global level used by loggers without an explicit override. */
    loglevel(level: LogLevel): CreateLogger;

    /** Disables syslog severity prefixes in non-TTY output. */
    disableSyslogPrefix(): CreateLogger;

    /** Runs callback with async request/context bindings included in emitted logs. */
    withContext<T>(bindings: LogBindings, callback: () => T): T;

    /** Returns the active async request/context bindings. */
    getContext(): LogBindings;

    /** Numeric log level constants. */
    levels: LogLevels;

    /** The current numeric default log level. */
    readonly defaultLevel: number;

    /** ErrorThrottle class for custom throttle instances. */
    ErrorThrottle: new (
        max?: number,
        windowMs?: number,
    ) => {
        shouldThrottle(key: string): boolean;
    };
}

declare const createLogger: CreateLogger;
export default createLogger;
