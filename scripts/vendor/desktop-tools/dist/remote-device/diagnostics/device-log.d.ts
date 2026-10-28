/**
 * The remote device log: ~/.desktop-commander-device/remote-<day>.log, the
 * device's history that `remote --report` packs for support.
 *
 * `remote` passes the device's console output through startDeviceLog(). Every
 * line is written, masked by redact() and timestamped in UTC; only the private
 * kinds below are dropped. Each UTC weekday has its own files: remote-mon.log
 * rotates at 1 MB into remote-mon.1.log and remote-mon.2.log. The first write
 * on a weekday whose file is over a day old (last week's) removes that day's
 * files first, so the log keeps at most 7 days × 3 files, 21 MB.
 */
export declare const DEVICE_LOG_MAX_BYTES: number;
/** How many files the log keeps per day: remote-<day>.log and its rotated older copies. */
export declare const DEVICE_LOG_FILES = 3;
/** remote-mon.log, then remote-mon.1.log, remote-mon.2.log (older); `day` is the UTC weekday, 0 = Sunday. */
export declare const deviceLogName: (day: number, i: number) => string;
/** Every name the log can use: 7 days × DEVICE_LOG_FILES. */
export declare const deviceLogNames: () => string[];
export declare function getDeviceLogDir(): string;
/**
 * One line as the log keeps it: masked, or null for a private one. The report
 * runs every stored line through this again.
 */
export declare function cleanLine(line: string): string | null;
export interface DeviceLogOptions {
    /** The folder for the log files; ~/.desktop-commander-device by default. */
    dir?: string;
    /** The clock (ms), for the timestamps and the day; Date.now by default. Tests set it. */
    now?: () => number;
    /** The size at which a file rotates; DEVICE_LOG_MAX_BYTES by default. Tests set it. */
    maxBytes?: number;
}
export declare class DeviceLog {
    private readonly dir;
    private readonly now;
    private readonly maxBytes;
    /** The UTC weekday being written; -1 before the first write. */
    private day;
    private size;
    private failures;
    /** The next printed line is the sign-in link or code. */
    private skipNextLine;
    constructor(options?: DeviceLogOptions);
    private file;
    /** One console call's arguments: each of its lines, cleaned. */
    record(args: unknown[]): void;
    /** Appends one line as is: callers pass text that is already masked. */
    write(text: string): void;
    /**
     * The first write of a UTC weekday: if that weekday's file is over a day
     * old, it is last week's, and its files go before today's lines start.
     */
    private startDay;
    /** Drops the day's oldest file and moves each other one a step older: remote-mon.log becomes remote-mon.1.log. */
    private rotate;
}
/**
 * Passes console output through the device log for this `remote` run. Each
 * method still does what it did (so a console.debug that `remote` silenced
 * stays silent), then the log records the call. Returns a function that puts
 * the console back.
 */
export declare function startDeviceLog(options?: DeviceLogOptions): () => void;
