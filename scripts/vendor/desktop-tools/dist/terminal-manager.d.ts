import { TerminalSession, CommandExecutionResult, ActiveSession } from './types.js';
import { type ProcessState } from './utils/process-detection.js';
/** A child process's output pipes. */
type OutputStream = 'stdout' | 'stderr';
/** The end of one output pipe, kept for process-state detection (see getProcessState). */
interface StreamTail {
    text: string;
    chars: number;
    turn: number;
}
type StreamTails = Record<OutputStream, StreamTail>;
/** An active session plus the per-stream tails that state detection reads. */
interface ManagedSession extends TerminalSession {
    streams: StreamTails;
    termination?: Promise<boolean>;
}
/** Outcome of forceTerminate */
export type TerminateOutcome = 'terminated' | 'failed' | 'not_found';
interface CompletedSession {
    session: ManagedSession;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    endTime: Date;
}
/**
 * A position in a session's output, absolute since process start (evicted
 * output included), so it stays valid while the buffer cap evicts lines.
 */
export interface OutputSnapshot {
    totalChars: number;
    lineCount: number;
    streamChars: Record<OutputStream, number>;
}
/**
 * Ceiling for a single blocking process wait (start_process's initial wait,
 * interact_with_process, read_process_output). The wait is otherwise bounded
 * only by the caller's timeout_ms, and MCP clients abandon a tool call after
 * ~4 minutes (Claude Desktop: "No result received ... after 4 minutes"), so a
 * large timeout_ms on a long, prompt-less command used to outlive the client.
 * The ceiling is MAX_PROCESS_WAIT_MS; callers other than the tools (tests) may
 * pass a smaller one.
 */
export interface ProcessWaitLimit {
    waitMs: number;
    capMs: number;
    capped: boolean;
}
/**
 * The one place that turns a caller's timeout_ms into the time a process wait
 * may actually block. When `capped`, the call returns at the ceiling with the
 * process still running and the caller continues with read_process_output.
 */
export declare function getProcessWaitLimit(timeoutMs: number, capMs?: number): ProcessWaitLimit;
/** executeCommand result: CommandExecutionResult plus the process state and whether the wait ceiling ended the wait. */
export interface ProcessStartResult extends CommandExecutionResult {
    processState: ProcessState;
    waitCappedAtMs?: number;
}
/**
 * Output buffering caps. Without a cap, a process emitting enough output makes
 * string concatenation throw "RangeError: Invalid string length" at V8's max
 * string size (~536M chars) inside a stdout 'data' handler — an uncaught
 * exception that kills the whole server (index.ts exits on uncaughtException).
 * The cap also bounds the cost of the reads that are O(total output), such as
 * since-start snapshot reads.
 */
export declare const MAX_BUFFERED_OUTPUT_CHARS: number;
export interface PaginatedOutputResult {
    lines: string[];
    totalLines: number;
    readFrom: number;
    readCount: number;
    remaining: number;
    isComplete: boolean;
    exitCode?: number | null;
    signal?: NodeJS.Signals | null;
    runtimeMs?: number;
    evictedLines?: number;
}
export declare class TerminalManager {
    private sessions;
    private completedSessions;
    private deliveryTurn;
    private deliveryTurnOpen;
    /**
     * Send input to a running process
     * @param pid Process ID
     * @param input Text to send to the process
     * @returns Whether input was successfully sent
     */
    sendInputToProcess(pid: number, input: string): boolean;
    executeCommand(command: string, timeoutMs?: number, shell?: string, collectTiming?: boolean, maxWaitMs?: number): Promise<ProcessStartResult>;
    /**
     * Add a chunk of one stream's output to the session: to the merged line
     * buffer, and to that stream's tail for state detection.
     */
    private recordOutput;
    /**
     * Number of the event-loop turn now delivering output; every chunk
     * dispatched before the next check phase (setImmediate) shares it.
     *
     * stdout and stderr are separate pipes. Each turn delivers what the OS had
     * ready when the loop polled, so a chunk delivered in a later turn was
     * written after the chunks of earlier turns. Within one turn the pipes come
     * in either order: when python -i's final stdout newline and its stderr
     * ">>> " prompt are both waiting, the prompt is often delivered first.
     */
    private currentDeliveryTurn;
    /**
     * Append text to a session's line buffer
     * Handles partial lines and newline splitting
     */
    private appendToLineBuffer;
    /**
     * Read process output with pagination (like file reading)
     * @param pid Process ID
     * @param offset Line offset: 0=from lastReadIndex, positive=absolute, negative=tail
     * @param length Max lines to return
     * @param updateReadIndex Whether to update lastReadIndex (default: true for offset=0)
     */
    readOutputPaginated(pid: number, offset?: number, length?: number): PaginatedOutputResult | null;
    /**
     * Whether a default read (offset 0) has anything to return: complete lines
     * past the read position, or an unfinished last line with text a read
     * hasn't returned (see readFromLineBuffer). Line counts alone can't tell
     * the second: text appended to that line adds no line.
     */
    hasUnreadOutput(pid: number): boolean;
    /**
     * Whether the unfinished last line has text that a default read hasn't
     * returned. Empty, it has nothing to return. Its text is compared with what
     * a read last returned only while it is the line that read stopped at: a
     * later line is new even when its text is the same (a REPL's next ">>> ").
     */
    private static openLineHasNewText;
    /**
     * Internal helper to read from a session's line buffer with offset/length
     */
    private readFromLineBuffer;
    /**
     * Get total line count for a process
     */
    getOutputLineCount(pid: number): number | null;
    /**
     * Legacy method for backward compatibility
     * Returns all new output since last read
     * @param maxLines Maximum lines to return (default: 1000 for context protection)
     * @deprecated Use readOutputPaginated instead
     */
    getNewOutput(pid: number, maxLines?: number): string | null;
    /**
     * Capture a snapshot of current output state for interaction tracking.
     * Used by interactWithProcess to know what output existed before sending input.
     */
    captureOutputSnapshot(pid: number): OutputSnapshot | null;
    /**
     * Get output that appeared since a snapshot was taken.
     * This handles the case where output is appended to the last line (REPL prompts).
     * Also checks completed sessions in case process finished between snapshot and poll.
     */
    getOutputSinceSnapshot(pid: number, snapshot: OutputSnapshot): string | null;
    /**
     * Output that appeared since `snapshot`, plus the snapshot at the current end
     * of output. A poller passes `next` back in to read only the output that
     * arrived since its previous poll. Costs O(output since snapshot), never
     * O(whole buffer), so polling stays cheap however much history the session
     * has retained. Also checks completed sessions in case the process finished
     * between snapshot and poll.
     */
    readOutputSince(pid: number, snapshot: OutputSnapshot): {
        output: string;
        next: OutputSnapshot;
    } | null;
    /**
     * Snapshot at the current end of a buffer, in O(1): bufferedChars is the
     * joined length of the retained lines, so nothing is joined here.
     */
    private static endOfOutput;
    /**
     * The process's state: finished once it has exited, whatever its output
     * says; otherwise waiting for input or running, judged from the end of the
     * output it wrote since `since` (default: since it started). Reads only the
     * per-stream tails, so it costs the same however much output the process
     * has produced. The one place start_process, interact_with_process,
     * read_process_output and list_sessions get the state from.
     */
    getProcessState(pid: number, since?: OutputSnapshot): ProcessState | null;
    /**
     * The output since `since` of each stream that may have written last: the
     * streams delivered in the latest turn that delivered anything since then.
     * Their relative order within that turn is unknown (see
     * currentDeliveryTurn), so each is judged on its own; streams last
     * delivered in an earlier turn wrote before them and can't end the output.
     */
    private static lastWrittenOutput;
    /**
     * New output since a snapshot, in absolute (since process start) offsets:
     * the last (end - snapshot) chars of the joined buffer. Walks back from the
     * newest line only until the snapshot position is covered and joins just
     * those lines. If eviction dropped part of the unseen output, returns what
     * the buffer still holds — the oldest unseen chars are lost to the cap.
     */
    private static outputSinceSnapshot;
    /**
   * Get a session by PID
   * @param pid Process ID
   * @returns The session or undefined if not found
   */
    getSession(pid: number): TerminalSession | undefined;
    /**
     * End a session: its shell and every process the command started (see
     * terminateProcessTree). Killing only the shell left the program running.
     * Resolves once they are gone: 'terminated', or 'failed' if some could not
     * be ended; 'not_found' when no session runs as `pid`. Never rejects.
     */
    forceTerminate(pid: number): Promise<TerminateOutcome>;
    listActiveSessions(): ActiveSession[];
    listCompletedSessions(): CompletedSession[];
}
export declare const terminalManager: TerminalManager;
export {};
