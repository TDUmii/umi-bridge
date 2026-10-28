import { ChildProcess } from 'child_process';
export interface SearchResult {
    context?: boolean;
    file: string;
    line?: number;
    match?: string;
    type: 'file' | 'content';
}
/**
 * How a search ended, once it is complete (#768): it searched everything
 * (completed); its time limit, stop_search or maxResults stopped it; some files
 * couldn't be searched (partial: see Unsearched); or it failed (see
 * SearchFailure). The answers are built from it (handlers/search-answers.ts).
 */
export type SearchOutcome = 'completed' | 'timed_out' | 'stopped' | 'max_results' | 'partial' | 'failed';
/** What a search couldn't search (outcome 'partial') */
export type UnsearchedKind = 'permissions' | 'ripgrep_error' | 'ripgrep_ended' | 'excel_search' | 'docx_search' | 'excel_file' | 'docx_file' | 'excel_folder' | 'docx_folder';
/** One kind of what a search couldn't search: how often, and the first met */
export interface Unsearched {
    kind: UnsearchedKind;
    count: number;
    example: string;
}
/** Why a search failed: ripgrep's error output, or how ripgrep ended when it said nothing */
export type SearchFailure = {
    error: string;
} | {
    ripgrepEnded: string;
};
/** A session as answers report it (see handlers/search-answers.ts) */
export interface SearchState {
    sessionId: string;
    isComplete: boolean;
    outcome?: SearchOutcome;
    failure?: SearchFailure;
    unsearched: Unsearched[];
    timeLimitMs?: number;
    maxResults?: number;
    totalMatches: number;
    totalResults: number;
    runtime: number;
    skippedLines: Array<{
        file: string;
        count: number;
    }>;
}
export interface SearchSession {
    id: string;
    process: ChildProcess;
    results: SearchResult[];
    isComplete: boolean;
    error?: string;
    startTime: number;
    lastReadTime: number;
    options: SearchSessionOptions;
    buffer: string;
    skippingLine?: boolean;
    skippedLines: Map<string, number>;
    totalMatches: number;
    totalContextLines: number;
    trailingContext?: {
        file: string;
        lastLine: number;
    };
    pendingSources: Set<SearchSource>;
    timeoutTimer?: NodeJS.Timeout;
    filePatternIncludes?: {
        root: string;
        matchers: Array<(relativePath: string) => boolean>;
    };
    exitCode?: number | null;
    printedOutput?: boolean;
    stoppedRipgrep?: boolean;
    timeLimitMs?: number;
    stopReason?: 'timed_out' | 'stopped' | 'max_results';
    unsearched: Map<UnsearchedKind, Unsearched>;
    ripgrepTrouble?: string;
    failure?: SearchFailure;
    outcome?: SearchOutcome;
    endTime?: number;
    completed: Promise<void>;
    markCompleted: () => void;
}
export interface SearchSessionOptions {
    rootPath: string;
    pattern: string;
    searchType: 'files' | 'content';
    filePattern?: string;
    ignoreCase?: boolean;
    maxResults?: number;
    includeHidden?: boolean;
    contextLines?: number;
    timeout?: number;
    earlyTermination?: boolean;
    literalSearch?: boolean;
}
/** What a session waits for: ripgrep, and the Excel and DOCX searches alongside it */
type SearchSource = 'ripgrep' | 'excel' | 'docx';
/** Answers show this many characters of a result's text, then '...' if there is more */
export declare const SHOWN_TEXT_CHARS = 100;
/**
 * The longest line of ripgrep output the server assembles, in characters: a
 * match or context line in its JSON. Half of V8's longest string (2^29 - 24
 * characters in Node 24), past which the append throws and the server exits:
 * only a longer line is skipped, and answers name its file. Any shorter line is
 * processed whole.
 */
export declare const MAX_OUTPUT_LINE_CHARS: number;
/**
 * Search Session Manager - handles ripgrep processes like terminal sessions
 * Supports both file search and content search with progressive results
 */ export declare class SearchManager {
    private sessions;
    private sessionCounter;
    private cleanupTimer;
    /**
     * Start a new search session (like start_process)
     * Returns immediately with initial state and results
     */
    startSearch(options: SearchSessionOptions): Promise<SearchState & {
        results: SearchResult[];
    }>;
    /**
     * Read search results with offset-based pagination (like read_file)
     * Supports both range reading and tail behavior
     */
    readSearchResults(sessionId: string, offset?: number, length?: number): SearchState & {
        results: SearchResult[];
        returnedCount: number;
        hasMoreResults: boolean;
    };
    /** What answers say about a session (see handlers/search-answers.ts) */
    private stateOf;
    private skippedLinesOf;
    /**
     * Keeps ripgrep's error output for the answer (shown when a search fails
     * without results), each piece once and up to MAX_KEPT_ERROR_CHARS: a search
     * over folders it can't read can print an error per entry, and the session
     * keeps this until it is cleaned up. What comes first is kept.
     */
    private keepErrorOutput;
    /**
     * Resolves with all of a session's results once it is complete: every source
     * has finished, or the search was stopped.
     */
    waitForCompletion(sessionId: string): Promise<SearchResult[]>;
    /**
     * Terminate a search session (like force_terminate)
     */
    terminateSearch(sessionId: string): boolean;
    /**
     * Stop every running search and drop all sessions and the cleanup timer.
     * For owners that tear the search manager down (shutdown, tests); a later
     * startSearch() starts afresh.
     */
    dispose(): void;
    /**
     * Start the periodic cleanup of old sessions. It is housekeeping only, so it
     * is unref'd: it must never keep the process alive on its own.
     */
    private startCleanupIfNeeded;
    /**
     * Get list of active search sessions (like list_sessions)
     */
    listSearchSessions(): Array<{
        id: string;
        searchType: string;
        pattern: string;
        isComplete: boolean;
        isError: boolean;
        runtime: number;
        totalResults: number;
    }>;
    /**
     * Run an Excel or DOCX search as one of the session's sources: its matches are
     * collected as it finds them, until it has searched every file or the session
     * stops it (stop_search, timeout, maxResults).
     */
    private startOfficeSource;
    /**
     * Search Excel files for content matches
     * Called during content search to include Excel files alongside text files
     * Searches ALL sheets in each Excel file (row-wise for cross-column matching)
     *
     * TODO: Refactor - Extract Excel search logic to separate module (src/utils/search/excel-search.ts)
     * and inject into SearchManager, similar to how file handlers are structured in src/utils/files/
     * This would allow adding other file type searches (PDF, etc.) without bloating search-manager.ts
     */
    private searchExcelFiles;
    /**
     * Whether the Excel/DOCX search walks into a folder: never node_modules, and a
     * hidden one (a name starting with '.') only with includeHidden, as ripgrep
     * enters hidden folders only with --hidden.
     */
    private officeWalkEnters;
    /**
     * Find all Excel files in a directory recursively. Stops walking once the
     * search is stopped; a folder it can't list is reported to the sink.
     */
    private findExcelFiles;
    /**
     * The Excel/DOCX files a filePattern selects, as ripgrep's globs select text
     * files (ripgrepGlobMatcher), ignoring case: one of its alternatives matches
     * the file (any file, when all of them are "!" alternatives), and none of its
     * "!" alternatives leaves it out (see officeFileExcluded). A search path that
     * is itself a file is searched whatever the pattern says, as ripgrep searches
     * a file it is given.
     */
    private filterOfficeFiles;
    /**
     * Whether a "!" alternative of a filePattern (given without its "!") leaves an
     * Excel/DOCX file out - as it leaves text files out of ripgrep's search: when
     * it matches the file, or a directory between the search path and the file;
     * ending in '/', only directories.
     */
    private officeFileExcluded;
    /**
     * Whether a content search runs the Excel or DOCX search, the one for files
     * with these extensions. Only when contextually relevant: the rootPath is
     * such a file, or a filePattern alternative targets them ("*.xlsx",
     * "budget.xlsx") - which one that leaves files out ("!*.xlsx") does not.
     * Each alternative is checked on its own, so "report.xlsx|memo.docx" runs both.
     */
    private targetsOfficeFiles;
    /**
     * Search DOCX files for content matches
     * Extracts <w:t> text from document.xml and searches it
     */
    private searchDocxFiles;
    /**
     * Find all DOCX files in a directory recursively. Stops walking once the
     * search is stopped; a folder it can't list is reported to the sink.
     */
    private findDocxFiles;
    /**
     * Extract context around a match for display (show surrounding text)
     */
    private getMatchContext;
    /**
     * Clean up completed sessions older than specified time
     * Called automatically by cleanup interval
     */
    cleanupSessions(maxAge?: number): void;
    /**
     * Get total number of active sessions (excluding completed ones)
     */
    getActiveSessionCount(): number;
    /**
     * A file search for one exact filename ("package.json"): a lookup of a known
     * file, unlike a content search for that same text
     */
    private isExactFilenameSearch;
    /**
     * Detect if pattern looks like an exact filename
     * (has file extension and no glob wildcards; a literal pattern has none)
     */
    private isExactFilename;
    /**
     * Detect if pattern contains glob wildcards
     */
    private isGlobPattern;
    /**
     * A file search's filePattern alternatives other than "!", which a file it
     * finds must match one of (see filePatternSelects); undefined when there are none
     */
    private filePatternIncludes;
    /**
     * Whether a file a file search found is one its filePattern selects: ripgrep
     * checked the "!" alternatives (see buildRipgrepArgs), one of the others must
     * match it. ripgrep can't check those itself: with the pattern's glob in the
     * same list, any glob that matches lets a file in.
     */
    private filePatternSelects;
    private buildRipgrepArgs;
    /**
     * Resolves once ripgrep has started; else logs why it could not start (not
     * found, not executable...) and rejects with the error start_search always
     * reported. 'spawn' or 'error' comes on the next tick, before any I/O, so
     * the caller still sets up its handlers in time.
     */
    private whenStarted;
    private setupProcessHandlers;
    /**
     * ripgrep searched, and ended with exit code 2: some paths couldn't be
     * searched, each named on stderr ("rg: <path>: <why> (os error N)"). Those it
     * may not read are about permissions; any other error is trouble, which fails
     * a search that found nothing (see outcomeOf).
     */
    private noteRipgrepErrors;
    /** Something the search couldn't search: counted by kind, the first one kept as the example */
    private noteUnsearched;
    /**
     * The session's one outcome, once every source is done. A failure first:
     * ripgrep couldn't search at all, or had trouble and nothing was found. Then
     * what stopped the search, if anything did; then what couldn't be searched.
     */
    private outcomeOf;
    /**
     * A source has ended, or was stopped. This is the one place a session
     * completes: when its last source is done, whatever the order they end in.
     */
    private finishSource;
    /**
     * Stop every source still running (stop_search, timeout, dispose); the
     * session completes once ripgrep has exited.
     */
    private stopSources;
    /**
     * The Excel/DOCX searches are done as of now. They can't be interrupted
     * mid-file: each stops at its next check, and anything it still finds is dropped.
     */
    private stopOfficeSources;
    private stopRipgrep;
    /**
     * Split ripgrep's output into lines as it arrives. Only the new text is split,
     * its first piece joined to the line pending from earlier chunks, so a line
     * costs time linear in its length (splitting the whole pending line again for
     * every chunk made a long line quadratic). With isFinal, the pending line is
     * complete as it is.
     */
    private processOutput;
    /**
     * Add text to the line being received, unless that makes it longer than
     * MAX_OUTPUT_LINE_CHARS: then the line is skipped, noted by its file, and
     * the rest of it dropped as it arrives.
     */
    private appendToLine;
    /** The line being received, now complete; undefined if it was skipped */
    private takeLine;
    /**
     * The file a line of ripgrep's --json output is about, read from the line's
     * start: {"type":"match","data":{"path":{"text":"..."},... (a path that is
     * not valid UTF-8 comes as "bytes" and is not read)
     */
    private fileOfOutputLine;
    private processLines;
    /**
     * Collect one line of ripgrep output. Once maxResults matches are in, only the
     * last match's trailing context is still collected - a matching line inside it
     * is kept as context, like grep -m - and ripgrep is stopped when it ends.
     */
    private collectRipgrepLine;
    /**
     * The one place a session counts a match - from ripgrep, Excel or DOCX alike -
     * so maxResults caps the TOTAL number of matches a search returns.
     */
    private collectMatch;
    /** Whether options.maxResults matches are in: later ones are dropped */
    private atMaxResults;
    /**
     * Once maxResults matches are in, stop the sources that cannot contribute
     * anything more: the Excel/DOCX searches at once, ripgrep when the last
     * match's trailing context is complete.
     */
    private stopAtMaxResults;
    private parseLine;
}
export declare const searchManager: SearchManager;
export {};
