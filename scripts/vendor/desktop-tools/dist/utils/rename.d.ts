export declare function renameWithRetry(from: string, to: string): Promise<void>;
/**
 * Moves `from` to `to`, a file or a folder with everything in it, as mv does.
 * A rename can't reach another volume (EXDEV): the entry is then copied, next
 * to `to` under a temporary name, renamed onto `to` once the whole copy is
 * there, and only then is the source removed. A copy that fails removes what
 * it wrote, leaves the source as it was and throws its error.
 */
export declare function movePath(from: string, to: string): Promise<void>;
