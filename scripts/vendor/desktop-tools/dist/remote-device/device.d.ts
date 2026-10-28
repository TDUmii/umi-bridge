#!/usr/bin/env node
import { type AuthSession } from './remote-channel.js';
export interface MCPDeviceOptions {
    persistSession?: boolean;
}
export declare function getRemoteDeviceConfigPath(): string;
/** `remote --logout`: removes device.json, under the lock a running device's save takes. */
export declare function removeRemoteDeviceConfig(configPath?: string): Promise<void>;
export declare class MCPDevice {
    private baseServerUrl;
    private remoteChannel;
    private deviceId?;
    private isShuttingDown;
    private configPath;
    private persistSession;
    private desktop;
    /**
     * Serialises config writes. Rotations are 45 minutes apart in normal
     * running, but a save that stalls must not land after a newer one and
     * persist a token that is already spent. Shutdown awaits this to drain
     * whatever is still in flight.
     */
    private configWriteChain;
    /**
     * device.json's text when this run last loaded or saved it. From then on, a
     * file that is gone or holds other text was removed (`remote --logout`) or
     * replaced (a login after it) by someone else.
     */
    private configTextOnDisk?;
    /** device.json was removed or replaced after this run loaded or saved it: nothing is saved again this run. */
    private loggedOutLocally;
    /** Call ids already handled by THIS process (insertion-ordered, bounded). */
    private seenCallIds;
    constructor(options?: MCPDeviceOptions);
    private setupShutdownHandlers;
    start(): Promise<void>;
    private findPersistedDeviceWithRetry;
    loadPersistedConfig(): Promise<any>;
    /** device.json's text, or undefined when there is none. Errors other than "not found" go to the caller, which logs them. */
    private readConfigText;
    clearPersistedConfig(): Promise<void>;
    /**
     * Queue a config write. Returns the queued write, so a caller that must not
     * outlive it - shutdown() - can await it.
     */
    savePersistedConfig(rotated?: AuthSession): Promise<void>;
    private writePersistedConfig;
    fetchSupabaseConfig(): Promise<{
        supabaseUrl: any;
        anonKey: any;
    }>;
    /**
     * The local Desktop Commander child died. A healthy remote channel says
     * nothing about the local half being alive, so without this the device kept
     * reporting itself online and every routed tool call came back "Not
     * connected" until someone restarted the process by hand.
     */
    private handleLocalMcpLoss;
    /** Record a handled call id, evicting the oldest once the cap is reached. */
    private rememberCallId;
    handleNewToolCall(payload: any): Promise<void>;
    /** Reports a tool call that failed, or whose result couldn't be saved, and writes its "failed" row. */
    private reportToolCallFailure;
    shutdown(): Promise<void>;
}
