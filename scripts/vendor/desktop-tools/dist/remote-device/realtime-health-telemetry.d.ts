export type RealtimeCounter = 'explicit_subscribe_calls' | 'join_successes' | 'join_errors' | 'join_timeouts' | 'join_closures' | 'watchdog_recreates' | 'socket_disconnects' | 'presence_attempts' | 'presence_successes' | 'presence_failures' | 'readiness_write_failures';
export type RealtimeWindow = Record<RealtimeCounter, number> & {
    event_version: number;
    device_diag_id: string;
    process_session_id: string;
    channel_generation: number;
    window_start: string;
    window_seconds: number;
    app_version: string;
    platform: string;
};
export declare class RealtimeHealthTelemetry {
    private readonly emit;
    private readonly sample;
    private readonly random;
    readonly processSessionId: `${string}-${string}-${string}-${string}-${string}`;
    private deviceDiagId;
    private generation;
    private counts;
    private windowStart;
    private windowStartMonotonic;
    private socketState;
    private timer;
    constructor(emit: (window: RealtimeWindow) => void, sample?: (key: string) => number, random?: () => number);
    private emptyCounts;
    /** Stable for one registered device, unlinkable to its raw UUID without knowing the UUID. */
    setDevice(deviceId: string): void;
    newChannel(): void;
    record(key: RealtimeCounter): void;
    observeSocketState(state: string): void;
    start(): void;
    private schedule;
    flush(now?: number, monotonicNow?: number): RealtimeWindow | null;
    stop(): void;
}
