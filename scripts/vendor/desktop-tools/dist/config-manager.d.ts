export interface ServerConfig {
    blockedCommands?: string[];
    defaultShell?: string;
    allowedDirectories?: string[];
    telemetryEnabled?: boolean;
    fileWriteLineLimit?: number;
    fileReadLineLimit?: number;
    clientId?: string;
    currentClient?: ClientInfo;
    [key: string]: any;
}
export interface ClientInfo {
    name: string;
    version: string;
}
export declare function normalizeTelemetryEnabledValue(value: unknown): unknown;
export declare function isTelemetryDisabledValue(value: unknown): boolean;
/**
 * Parses config.json's text. Editors saving "UTF-8 with BOM" (Notepad,
 * PowerShell 5's Set-Content -Encoding UTF8) put U+FEFF first, which
 * JSON.parse rejects although the config is complete.
 */
export declare function parseConfig(text: string): ServerConfig;
/**
 * Singleton config manager for the server
 */
declare class ConfigManager {
    private configPath;
    private config;
    private initialized;
    private _isFirstRun;
    private writeChain;
    private saveScheduled;
    private pendingMutations;
    private watcher;
    private reloadTimer;
    private failedSaves;
    private saveRetry;
    private heldRecoveryEvents;
    constructor();
    /**
     * Initialize configuration - load from disk or create default.
     * Creation and legacy migration use the same cross-process mutation path as
     * normal writes so two processes starting together cannot clobber each other.
     */
    init(): Promise<void>;
    /**
     * Reads config.json at start. A missing one is created (a first run), a corrupt
     * one is recovered, and one written before the welcome page existed is marked
     * as an existing install. If it can't be read, recovered or saved, the session
     * starts without saving it.
     */
    private loadStartupConfig;
    /**
     * Starts the session on `config` and leaves config.json as it is. `warning`
     * tells the user why; saves are tried again every HELD_SAVE_RETRY_MS.
     */
    private startWithoutSaving;
    /**
     * Alias for init() to maintain backward compatibility
     */
    loadConfig(): Promise<void>;
    /**
     * Create default configuration
     */
    private getDefaultConfig;
    private readConfigFromDisk;
    /**
     * Recovers a corrupt config.json; the caller holds the config lock. It is backed
     * up once, then rewritten as buildRecoveredConfig(). Returns the config now on disk.
     */
    private recoverCorruptConfig;
    /** Sends a recovery event. Telemetry reads the config, so events from before init() is done wait for it. */
    private reportRecovery;
    private emitCorruptConfigTelemetry;
    private writeConfigAtomically;
    /** config.json's text, or null when there is none */
    private readConfigText;
    private acquireConfigLock;
    /** Runs `fn` holding the config lock; `lockLost()` tells whether the lock was lost meanwhile. */
    private withConfigLock;
    /**
     * Read config.json, apply `mutate`, write it back, all under the cross-process
     * lock. If the lock was lost, or config.json changed, before the write
     * committed, nothing was written: it runs again under a new lock, so the
     * change lands on what the other process saved.
     */
    private performConfigMutation;
    private mutateLockedConfig;
    private queueMutation;
    /** Non-blocking, coalesced persistence for high-frequency state updates. */
    scheduleSave(): void;
    /** Saves the queued changes in `ms`; until then scheduleSave() waits for it */
    private retrySaves;
    private startConfigWatcher;
    private reloadConfigFromDisk;
    /**
     * Get the entire config
     */
    getConfig(): Promise<ServerConfig>;
    /**
     * Get a specific configuration value
     */
    getValue(key: string): Promise<any>;
    /**
     * Set a specific configuration value and wait until it is saved: the data is
     * flushed to disk before the rename; the folder flush after it is best effort.
     * With holdIfNotSaved, a value whose save fails is still in effect, and is
     * queued to be saved with later writes (the call still rejects).
     */
    setValue(key: string, value: any, options?: {
        holdIfNotSaved?: boolean;
    }): Promise<void>;
    /**
     * Update one value under the cross-process lock and return it once saved: the
     * data is flushed to disk before the rename; the folder flush after it is best effort.
     */
    updateValue(key: string, updater: (current: any) => any): Promise<any>;
    /**
     * Set a value without waiting on disk. The queued operation is applied to the
     * latest on-disk config while holding the cross-process lock.
     */
    setValueNonBlocking(key: string, value: any): Promise<void>;
    /**
     * Atomically update one value without blocking the caller on persistence.
     * The updater is replayed against the latest disk value under the lock, which
     * makes counter-style updates safe across multiple Desktop Commander processes.
     */
    updateValueNonBlocking(key: string, updater: (current: any) => any): Promise<any>;
    /** Update multiple configuration values at once. */
    updateConfig(updates: Partial<ServerConfig>): Promise<ServerConfig>;
    /** Reset configuration to defaults. This intentionally replaces all keys. */
    resetConfig(): Promise<ServerConfig>;
    /**
     * Check if this is the first run (config file was just created)
     */
    isFirstRun(): boolean;
    /**
     * Get or create a persistent client ID for analytics and A/B tests
     */
    getOrCreateClientId(): Promise<string>;
}
export declare const configManager: ConfigManager;
export {};
