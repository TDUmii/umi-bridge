type Rollouts = Record<string, boolean>;
/**
 * Which rollouts are on for this device's user. A rollout turns something on
 * for a share of users, and the Remote MCP server decides who is in. The
 * device asks at start, takes the map each call row carries, and asks again
 * every 30 minutes:
 *
 * - a start answer that fails (a refused token, a server error, a broken
 *   answer, no answer within 3 s) leaves every rollout off
 * - a call row without rollouts (an older server) keeps what the device has
 * - a 30-minute answer that fails keeps what the device has
 * - a 30-minute answer that arrives after a call row it was waiting behind is
 *   dropped: the call row's rollouts are newer
 *
 * With no session token the device sends no request: that counts as a
 * failed answer.
 *
 * Each change logs a debug line, "Rollouts: …".
 */
declare class RolloutManager {
    private rollouts;
    private serverUrl;
    private getToken;
    private refreshInterval;
    /** How many call rows brought rollouts; a 30-minute answer compares it to tell whether one came meanwhile */
    private callRowUpdates;
    /**
     * GET {serverUrl}/device/rollouts with the session's access token, which
     * getToken() is asked for on every request (null: no session, no request).
     * A failed answer leaves every rollout off.
     */
    load(serverUrl: string, getToken: () => Promise<string | null>): Promise<void>;
    /** A call row's rollouts (metadata.rollouts); a row without them keeps what the device has */
    update(rollouts: unknown): void;
    /** Asks again every 30 minutes, after load(); a failed answer keeps what the device has */
    startRefresh(): void;
    stopRefresh(): void;
    /** Whether a rollout is on; `defaultValue` for one the server did not name */
    get(name: string, defaultValue?: boolean): boolean;
    getAll(): Rollouts;
    private refresh;
    /** The server's answer, or undefined when it failed or took longer than 3 s */
    private request;
    private fetchRollouts;
    private replace;
}
export declare const rolloutManager: RolloutManager;
export {};
