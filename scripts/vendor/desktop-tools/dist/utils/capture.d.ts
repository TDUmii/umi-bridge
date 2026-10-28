import type { TransportParams } from '@desktop-commander/telemetry-contract/transport';
export declare function runInUiOriginCallContext<T>(fn: () => T): T;
export declare function isInsideUiOriginCall(): boolean;
/** Runs a tool call with its own set of known paths. */
export declare function runWithToolCallPaths<T>(fn: () => T): T;
/** Adds paths (strings, or arrays of them) to the current tool call's known paths. */
export declare function addToolCallPaths(...paths: unknown[]): void;
/**
 * Hard kill-switch for telemetry via environment variable.
 *
 * Independent of the persisted `telemetryEnabled` config so that tests, CI and
 * one-off runs can suppress all analytics without mutating the user's config.
 * Set DESKTOP_COMMANDER_DISABLE_TELEMETRY to 1/true/yes/on to disable.
 */
export declare function isTelemetryDisabledByEnv(): boolean;
/**
 * Sanitizes error objects to remove potentially sensitive information like file paths
 * @param error Error object or string to sanitize
 * @returns An object with sanitized message and optional error code
 */
export declare function sanitizeError(error: any, knownPaths?: readonly string[]): {
    message: string;
    code?: string;
};
/**
 * Send an event to telemetry
 * @param event Event name
 * @param properties Optional event properties
 */
export declare const captureBase: (captureURL: string, event: string, properties?: any) => Promise<void>;
/**
 * Build the standard event properties used by the telemetry proxy.
 * Extracted from captureBase so both paths get identical data.
 */
/** Builds the telemetry payload properties for an event, with paths and errors sanitized. */
export declare const buildEventProperties: (properties?: any) => Promise<any>;
export declare const capture: (event: string, properties?: any) => Promise<void>;
/**
 * Send only contract-validated transport fields through the existing proxy sender,
 * redacted like every other event (known paths, path properties, error text).
 */
export declare const captureTransport: (event: string, properties: TransportParams) => Promise<void>;
export declare const capture_call_tool: (event: string, properties?: any) => Promise<void>;
export declare const capture_ui_event: (event: string, properties?: any) => Promise<void>;
/**
 * Wrapper for capture() that automatically adds remote flag for remote-device telemetry
 * Also adds additional privacy filtering to remove sensitive identity information
 * @param event Event name
 * @param properties Optional event properties
 */
export declare const captureRemote: (event: string, properties?: any) => Promise<void>;
