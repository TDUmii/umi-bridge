/**
 * Low-volume Realtime lifecycle counters. No per-retry HTTP requests.
 * Counts are local observations, NOT exact Phoenix phx_join wire frames.
 */
import { createHash, randomUUID } from 'node:crypto';
import { VERSION } from '../version.js';
const COUNTERS = [
    'explicit_subscribe_calls', 'join_successes', 'join_errors',
    'join_timeouts', 'join_closures', 'watchdog_recreates',
    'socket_disconnects', 'presence_attempts', 'presence_successes',
    'presence_failures', 'readiness_write_failures',
];
const DEGRADED = [
    'join_errors', 'join_timeouts', 'join_closures', 'watchdog_recreates',
    'socket_disconnects', 'presence_failures', 'readiness_write_failures',
];
export class RealtimeHealthTelemetry {
    constructor(emit, sample = (key) => parseInt(createHash('sha256').update(key).digest('hex').slice(0, 8), 16) / 0x100000000, random = Math.random) {
        this.emit = emit;
        this.sample = sample;
        this.random = random;
        this.processSessionId = randomUUID();
        this.deviceDiagId = '';
        this.generation = 0;
        this.counts = this.emptyCounts();
        this.windowStart = Date.now();
        this.windowStartMonotonic = performance.now();
        this.socketState = null;
        this.timer = null;
    }
    emptyCounts() {
        return Object.fromEntries(COUNTERS.map((key) => [key, 0]));
    }
    /** Stable for one registered device, unlinkable to its raw UUID without knowing the UUID. */
    setDevice(deviceId) {
        if (!deviceId)
            return;
        const id = createHash('sha256').update('dc-realtime-diagnostics-v1:').update(deviceId).digest('hex').slice(0, 32);
        if (this.deviceDiagId === id)
            return;
        this.deviceDiagId = id;
        this.windowStart = Date.now();
        this.windowStartMonotonic = performance.now();
        this.counts = this.emptyCounts();
    }
    newChannel() {
        this.generation++;
        this.record('explicit_subscribe_calls');
    }
    record(key) {
        this.counts[key]++;
    }
    observeSocketState(state) {
        if (this.socketState === 'open' && state !== 'open')
            this.record('socket_disconnects');
        this.socketState = state;
    }
    start() {
        if (this.timer)
            return;
        this.schedule();
    }
    schedule() {
        // Each device chooses a different reporting boundary; never a fleet-wide minute mark.
        this.timer = setTimeout(() => {
            this.timer = null;
            this.flush();
            this.schedule();
        }, 60000 + Math.floor(this.random() * 30000));
        this.timer.unref?.();
    }
    flush(now = Date.now(), monotonicNow = performance.now()) {
        // Wall time may jump when observeServerDate() corrects clock skew.
        // Use only monotonic time for durations; wall time still locates the window.
        const elapsed = Math.max(1, Math.round((monotonicNow - this.windowStartMonotonic) / 1000));
        const counts = this.counts;
        const start = this.windowStart;
        this.counts = this.emptyCounts();
        this.windowStart = now;
        this.windowStartMonotonic = monotonicNow;
        if (!this.deviceDiagId)
            return null;
        const degraded = DEGRADED.some((key) => counts[key] > 0);
        const sampleRate = degraded ? 0.05 : 0.01;
        if (this.sample(this.deviceDiagId) >= sampleRate)
            return null;
        const window = {
            ...counts,
            event_version: 1,
            device_diag_id: this.deviceDiagId,
            process_session_id: this.processSessionId,
            channel_generation: this.generation,
            window_start: new Date(start).toISOString(),
            window_seconds: elapsed,
            app_version: VERSION,
            platform: process.platform,
        };
        try {
            this.emit(window);
        }
        catch { /* diagnostics must not affect transport */ }
        return window;
    }
    stop() {
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = null;
        this.flush();
    }
}
