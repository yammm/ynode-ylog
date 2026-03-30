export interface YlogOptions {
    /**
     * Named log level threshold.
     * @default Based on NODE_ENV: 'debug' in development, 'info' in production.
     */
    level?: "error" | "warn" | "info" | "debug" | "verbose";

    /**
     * Include process PID in log output.
     * @default false
     */
    pid?: boolean;
}

export interface Logger {
    fatal(...args: unknown[]): void;
    error(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    info(...args: unknown[]): void;
    debug(...args: unknown[]): void;
    verbose(...args: unknown[]): void;
    trace(...args: unknown[]): void;
    child(): Logger;
}

export interface LogLevels {
    readonly error: 0;
    readonly warn: 1;
    readonly info: 2;
    readonly debug: 3;
    readonly verbose: 4;
}

export interface CreateLogger {
    (mod: ImportMeta | { filename: string }, options?: YlogOptions): Logger;

    /** Sets the global application log level. */
    loglevel(level: string): CreateLogger;

    /** Disables syslog severity prefixes in non-TTY output. */
    disableSyslogPrefix(): CreateLogger;

    /** Numeric log level constants. */
    levels: LogLevels;

    /** The current default log level. */
    defaultLevel: number;

    /** ErrorThrottle class for custom throttle instances. */
    ErrorThrottle: new (
        max?: number,
        throttle?: number,
    ) => {
        shouldThrottle(key: string): boolean;
    };
}

declare const createLogger: CreateLogger;
export default createLogger;
