import { type ChildProcess } from 'child_process';
/**
 * Ends the process `pid` alone, forcefully: SIGTERM, then SIGKILL if it still
 * runs after the grace period (on Windows either signal ends it outright).
 * Resolves once it is gone; throws what process.kill threw (ESRCH, EPERM), or
 * that it still runs.
 */
export declare function terminatePid(pid: number): Promise<void>;
/**
 * Ends `child` and every process it started. Resolves once they are gone:
 * true, or false if some could not be ended (why is logged, and the root is
 * then killed on its own if it still runs). Never rejects.
 */
export declare function terminateProcessTree(child: ChildProcess): Promise<boolean>;
