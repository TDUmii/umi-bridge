import type { ServerConfig } from './config-manager.js';
/** Where a corrupt config.json was found: at start, by a write, or by the file watcher */
export type RecoveryPhase = 'startup' | 'mutation' | 'watcher';
/** The config_parse_error_recovered event */
export interface RecoveryEvent {
    phase: RecoveryPhase;
    config_bytes: number | null;
    backup_created: boolean;
    recovered_by_other_process: boolean;
}
/**
 * The settings still readable in a corrupt config.json: the longest beginning
 * of it that is a JSON object once closed, so every complete top-level setting
 * before the first error. {} when there is none.
 */
export declare function salvageSettings(text: string): ServerConfig;
/**
 * What a corrupt config.json is recovered as: the defaults, then the settings
 * last read (while running), then the settings salvaged from it. The welcome
 * page stays off, as for any existing install.
 */
export declare function buildRecoveredConfig(defaults: ServerConfig, lastRead: ServerConfig | null, text: string): ServerConfig;
/**
 * Backs up a corrupt config.json as config.json.corrupt.<ms>.<pid>, unless the
 * newest backup already holds `bytes` (a recovery tried again after its write
 * failed). Returns the backup's name, or null when there is no config.json.
 */
export declare function backupCorruptConfig(configPath: string, bytes: Buffer): Promise<string | null>;
