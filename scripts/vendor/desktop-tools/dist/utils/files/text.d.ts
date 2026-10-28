/**
 * Text file handler
 * Handles reading, writing, and editing text files
 *
 * Binary detection is handled at the factory level (factory.ts) using isBinaryFile.
 * This handler only receives files that have been confirmed as text.
 *
 * TECHNICAL DEBT:
 * This handler is missing editRange() - text search/replace logic currently lives in
 * src/tools/edit.ts (performSearchReplace function) instead of here.
 *
 * For architectural consistency with ExcelFileHandler.editRange(), the fuzzy
 * search/replace logic should be moved here. See comment in src/tools/edit.ts.
 */
import { FileHandler, ReadOptions, FileResult, FileInfo } from './base.js';
/**
 * Text file handler implementation
 * Binary detection is done at the factory level - this handler assumes file is text
 */
export declare class TextFileHandler implements FileHandler {
    canHandle(_path: string): boolean;
    private detectTextEncoding;
    read(filePath: string, options?: ReadOptions): Promise<FileResult>;
    write(path: string, content: string, mode?: 'rewrite' | 'append'): Promise<void>;
    getInfo(path: string): Promise<FileInfo>;
    /**
     * Count lines in text content the way read_file reads them (lineBreakBetween).
     * A line break at the very end ends the last line; it doesn't start another.
     * Made static and public for use by other modules (e.g., writeFile telemetry in filesystem.ts)
     */
    static countLines(content: string): number;
    /**
     * Get file line count (for files under size limit)
     */
    private getFileLineCount;
    /**
     * Generate enhanced status message
     */
    private generateEnhancedStatusMessage;
    /**
     * Split text into lines while preserving line endings
     * Made static and public for use by other modules (e.g., readFileInternal in filesystem.ts)
     */
    static splitLinesPreservingEndings(content: string): string[];
    /**
     * Read file with smart positioning for optimal performance
     */
    private readFileWithSmartPositioning;
    /**
     * Read last N lines efficiently: find where they start by reading the file
     * backwards, then read them from there as readline does for smaller files
     */
    private readLastNLinesReverse;
    /**
     * Byte position where the last `n` lines start, found by reading 8 KB chunks
     * backwards and finding line breaks by lineBreakBetween. A line break at the
     * very end ends the last line instead of starting another.
     */
    private findLastLinesStart;
    /**
     * Read from end using readline with circular buffer
     */
    private readFromEndWithReadline;
    /**
     * Read from start/middle using readline. With `start`, reading begins at
     * that byte, where line `startLine` begins.
     */
    private readFromStartWithReadline;
    /**
     * Read from a deep offset in a very large file: find the byte where line
     * `offset` starts, then read from there with readline
     */
    private readFromDeepOffset;
    /**
     * Byte position where line `line` (0-based) starts, or the file size when
     * the file has fewer lines. Counts line breaks by lineBreakBetween in raw
     * bytes, which is much faster than reading lines.
     */
    private findLineStart;
}
