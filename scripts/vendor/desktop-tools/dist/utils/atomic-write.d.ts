export interface AtomicWriteOptions {
    encoding?: BufferEncoding;
    mode?: number;
    /**
     * A last check once the new content is on disk, before it replaces the file:
     * if it throws, nothing is replaced and the write rejects with its error
     */
    beforeCommit?: () => void | Promise<void>;
}
/**
 * Atomically replaces `filePath` with `data`. Resolves once the new content is
 * committed; rejects (leaving the previous file intact) if it can't be.
 */
export declare function writeFileAtomic(filePath: string, data: string | Uint8Array, options?: AtomicWriteOptions): Promise<void>;
