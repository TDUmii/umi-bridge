import type { SearchResult, SearchState, Unsearched } from '../search-manager.js';
import type { ServerResult } from '../types.js';
/**
 * The words of the search answers (start_search, get_more_search_results), in
 * one place (#768). Each answer ends saying how the search ended: its outcome
 * (SearchOutcome in search-manager.ts).
 */
export declare const SEARCH_WORDS: {
    /** "Total results: …", the same in both answers */
    total: (matches: number, rows: number) => string;
    matchRow: (file: string, line: number | undefined, text: string) => string;
    contextRow: (file: string, line: number | undefined, text: string) => string;
    fileRow: (file: string) => string;
    /** A page with no results */
    noMatches: string;
    noneAtOffset: (offset: number, rows: number) => string;
    noneYet: (offset: number, rows: number) => string;
    /** After a page's results: whether there are more */
    moreResults: (nextOffset: number) => string;
    moreMayCome: string;
    inProgress: string;
    /** How the search ended, by outcome */
    completed: string;
    timedOut: (ms: number | undefined) => string;
    stopped: string;
    maxResults: (n: number | undefined) => string;
    /** Partial, when the only files it couldn't search were ones it may not read: as it always said */
    permissionsOnly: string;
    partial: (reasons: string[]) => string;
    unsearched: {
        permissions: () => string;
        ripgrep_error: (u: Unsearched) => string;
        ripgrep_ended: (u: Unsearched) => string;
        excel_search: (u: Unsearched) => string;
        docx_search: (u: Unsearched) => string;
        excel_file: (u: Unsearched) => string;
        docx_file: (u: Unsearched) => string;
        excel_folder: (u: Unsearched) => string;
        docx_folder: (u: Unsearched) => string;
    };
    /** A failed search's whole answer */
    failedWithError: (sessionId: string, error: string) => string;
    failedRipgrepEnded: (sessionId: string, how: string) => string;
};
/** start_search's answer: the search as it is once it started, with its first results */
export declare function startSearchAnswer(search: SearchState & {
    results: SearchResult[];
}, args: {
    searchType: 'files' | 'content';
    pattern: string;
    path: string;
}): ServerResult;
/** get_more_search_results' answer: one page of a search's results (a negative offset: its last results) */
export declare function searchResultsAnswer(page: SearchState & {
    results: SearchResult[];
    returnedCount: number;
    hasMoreResults: boolean;
}, offset: number): ServerResult;
