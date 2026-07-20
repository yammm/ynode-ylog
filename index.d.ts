export type LogLevel =
    "silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "verbose";

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
}

export interface ChildLoggerOptions {
    /** Optional log-level override for the derived logger. */
    level?: LogLevel;

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
    level: LogLevel;
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
    child(bindings?: Record<string, unknown>, options?: ChildLoggerOptions): Logger;
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
