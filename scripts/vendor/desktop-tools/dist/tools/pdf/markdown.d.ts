import { type IncomingMessage, type ServerResponse } from 'http';
import type { Browser, PuppeteerNode } from 'puppeteer';
import type { Config as MdToPdfConfig } from 'md-to-pdf/dist/lib/config.js';
import type { PageRange } from './lib/pdf2md.js';
import { PdfParseResult } from './lib/pdf2md.js';
import { LazyPackage } from '../../utils/lazy-package.js';
export declare const mdToPdfPackage: LazyPackage<{
    convertMdToPdf: (input: {
        path: string;
    } | {
        content: string;
    }, config: MdToPdfConfig, { args, browser, }?: {
        args?: import("arg").Result<{
            "--help": BooleanConstructor;
            "--version": BooleanConstructor;
            "--basedir": StringConstructor;
            "--watch": BooleanConstructor;
            "--watch-options": StringConstructor;
            "--stylesheet": [StringConstructor];
            "--css": StringConstructor;
            "--document-title": StringConstructor;
            "--body-class": [StringConstructor];
            "--page-media-type": StringConstructor;
            "--highlight-style": StringConstructor;
            "--marked-options": StringConstructor;
            "--html-pdf-options": StringConstructor;
            "--pdf-options": StringConstructor;
            "--launch-options": StringConstructor;
            "--gray-matter-options": StringConstructor;
            "--port": NumberConstructor;
            "--md-file-encoding": StringConstructor;
            "--stylesheet-encoding": StringConstructor;
            "--as-html": BooleanConstructor;
            "--config-file": StringConstructor;
            "--devtools": BooleanConstructor;
            "-h": string;
            "-v": string;
            "-w": string;
        }> | undefined;
        browser?: Browser | undefined;
    }) => Promise<import("md-to-pdf/dist/lib/generate-output.js").Output>;
    defaultConfig: MdToPdfConfig;
    puppeteer: PuppeteerNode;
    serveHandler: (request: IncomingMessage, response: ServerResponse, config: {
        public: string;
        directoryListing: boolean;
        cleanUrls: boolean;
    }) => Promise<void>;
    grayMatter: (input: string, options: unknown) => {
        content: string;
        data: unknown;
    };
}>;
/** An option Desktop Commander ignored from write_pdf's options or the markdown's front matter */
export interface IgnoredRenderOption {
    /** Dotted option name, e.g. "pdf_options.path" */
    option: string;
    /** Why Desktop Commander ignores it */
    reason: string;
}
interface ResolvedRender {
    /** The markdown body, with the front matter removed */
    body: string;
    /** write_pdf's options merged with the front matter (front matter wins), minus the ignored options */
    options: Record<string, unknown>;
    /** The options that were present and ignored */
    ignoredOptions: IgnoredRenderOption[];
}
/**
 * The single place write_pdf's `options` and the markdown's front matter are
 * merged. Front matter wins (as in md-to-pdf), pdf_options is merged key by
 * key, and the options Desktop Commander ignores are removed from the merged
 * result AFTER the merge, so neither source can re-add them. Returns the
 * markdown body without its front matter, so the caller can render it without
 * md-to-pdf merging the front matter a second time.
 */
export declare function resolveRender(markdown: string, options?: unknown): ResolvedRender;
interface CachedPuppeteerChrome {
    executablePath: string;
}
/**
 * Find Chrome in puppeteer's cache directory
 * Returns the executable path if found, undefined otherwise
 */
export declare function findPuppeteerChrome(cacheDir?: string): CachedPuppeteerChrome | undefined;
/**
 * Remove stale Puppeteer Chrome builds while preserving the active build.
 */
export declare function pruneOldPuppeteerChromeBuilds(activeExecutablePath: string, cacheDir?: string): Promise<void>;
/**
 * Find system-installed Chrome/Chromium browser
 * Returns the executable path if found, undefined otherwise
 */
export declare function findSystemChrome(): string | undefined;
/**
 * Preemptively ensure Chrome is available for PDF generation.
 * Call this at server startup to trigger download in background if needed.
 * Returns immediately, download happens in background.
 */
export declare function ensureChromeAvailable(): void;
/**
 * Convert PDF to Markdown using @opendocsg/pdf2md
 */
export declare function parsePdfToMarkdown(source: string, pageNumbers?: number[] | PageRange): Promise<PdfParseResult>;
/**
 * Render markdown to PDF with md-to-pdf's converter in a Chrome of our own.
 *
 * md-to-pdf's mdToPdf() starts its web server and Chrome and stops them only
 * after a successful render. So each render starts its own Chrome profile,
 * web server (startRenderServer) and Chrome here, hands the converter the
 * browser, and releases all of them on every path: when this returns or
 * throws, the server is closed and Chrome, with the page it rendered, has
 * exited.
 *
 * Options are md-to-pdf's, from `options` and the markdown's front matter
 * (resolveRender merges them and drops the few Desktop Commander ignores).
 * The PDF is only returned: Desktop Commander writes it, so the config forces
 * dest to '' (md-to-pdf would otherwise write it to dest, or to stdout - the
 * MCP connection - when dest is undefined).
 */
export declare function parseMarkdownToPdf(markdown: string, options?: any): Promise<Buffer>;
export {};
