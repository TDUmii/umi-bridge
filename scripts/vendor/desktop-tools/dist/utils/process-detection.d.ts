/**
 * REPL and Process State Detection Utilities
 * Detects from its output whether a running process is waiting for input.
 * Whether it has finished is known from its exit, never from its output
 * (see TerminalManager.getProcessState).
 */
export interface ProcessState {
    isWaitingForInput: boolean;
    isFinished: boolean;
    isRunning: boolean;
    detectedPrompt?: string;
    lastOutput: string;
}
/**
 * How much of the end of the output state detection examines. A prompt is
 * the last thing a process writes before it waits for input, so the end of
 * the output decides the state; examining only this much keeps detection's
 * cost the same however much output there is.
 */
export declare const STATE_DETECTION_TAIL_CHARS = 4096;
/**
 * Analyze a running process's output to determine whether it is waiting for
 * input. Output text never makes a process finished: a line such as
 * "Error: retrying" doesn't end it.
 *
 * `output` is what the process wrote most recently. For a process writing to
 * both stdout and stderr it can be the recent output of each stream that may
 * have written last (see TerminalManager.getProcessState): their relative
 * order is unknown, so the process is waiting for input if any of them ends
 * in a prompt. Only the last STATE_DETECTION_TAIL_CHARS of each are examined.
 */
export declare function analyzeProcessState(output: string | readonly string[], pid?: number): ProcessState;
/**
 * Clean output by removing prompts and input echoes. `readAtPrompt`: whether
 * the process was waiting at a prompt when the input was sent; one that
 * wasn't (a shell reading commands without a prompt) prints none for it.
 */
export declare function cleanProcessOutput(output: string, inputSent?: string, readAtPrompt?: boolean): string;
/**
 * Format process state for user display
 */
export declare function formatProcessStateMessage(state: ProcessState, pid: number): string;
