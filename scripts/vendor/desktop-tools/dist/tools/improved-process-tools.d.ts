import { ServerResult } from '../types.js';
/**
 * Start a new process (renamed from execute_command)
 * Includes early detection of process waiting for input
 * maxWaitMs: ceiling for this call's wait. The tools always use MAX_PROCESS_WAIT_MS;
 * only in-process callers (tests) pass a smaller one. Not part of the tool schema.
 */
export declare function startProcess(args: unknown, maxWaitMs?: number): Promise<ServerResult>;
/**
 * Read output from a running process with file-like pagination
 * Supports offset/length parameters for controlled reading
 * maxWaitMs: ceiling for this call's wait. The tools always use MAX_PROCESS_WAIT_MS;
 * only in-process callers (tests) pass a smaller one. Not part of the tool schema.
 */
export declare function readProcessOutput(args: unknown, maxWaitMs?: number): Promise<ServerResult>;
/**
 * Interact with a running process (renamed from send_input)
 * Automatically detects when process is ready and returns output
 * maxWaitMs: ceiling for this call's wait. The tools always use MAX_PROCESS_WAIT_MS;
 * only in-process callers (tests) pass a smaller one. Not part of the tool schema.
 */
export declare function interactWithProcess(args: unknown, maxWaitMs?: number): Promise<ServerResult>;
/**
 * Force terminate a process
 */
export declare function forceTerminate(args: unknown): Promise<ServerResult>;
/**
 * List active sessions
 */
export declare function listSessions(): Promise<ServerResult>;
