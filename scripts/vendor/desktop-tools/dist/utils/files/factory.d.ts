/**
 * Factory pattern for creating appropriate file handlers
 * Routes file operations to the correct handler based on file type
 *
 * Each handler implements canHandle() which can be sync (extension-based)
 * or async (content-based like BinaryFileHandler using isBinaryFile)
 */
import { FileHandler } from './base.js';
/**
 * Get the appropriate file handler for a given file path
 *
 * Each handler's canHandle() determines if it can process the file.
 * Extension-based handlers (Excel, Image) return sync boolean.
 * BinaryFileHandler uses async isBinaryFile for content-based detection.
 *
 * Priority order:
 * 1. DOCX files (extension based)
 * 2. PDF files (extension based)
 * 3. Excel files (xlsx, xls, xlsm) - extension based
 * 4. Image files (png, jpg, gif, webp) - extension based
 * 5. Binary files - content-based detection via isBinaryFile
 * 6. Text files (default)
 *
 * @param filePath File path to get handler for
 * @param options svgAsImage: an SVG goes to the image handler, for the file preview widget
 * @returns FileHandler instance that can handle this file
 */
export declare function getFileHandler(filePath: string, options?: {
    svgAsImage?: boolean;
}): Promise<FileHandler>;
/**
 * Check if a file path is an Excel file
 * Delegates to ExcelFileHandler.canHandle to avoid duplicating extension logic
 * @param path File path
 * @returns true if file is Excel format
 */
export declare function isExcelFile(path: string): boolean;
/**
 * Check if a file path is an image file
 * Delegates to ImageFileHandler.canHandle to avoid duplicating extension logic
 * @param path File path
 * @returns true if file is an image format
 */
export declare function isImageFile(path: string): boolean;
export type FileAction = 'read' | 'write' | 'edit';
/**
 * Right after initialize (#777): the packages Excel, DOCX and PDF files need,
 * loaded in the background one at a time, smaller first, so each pause of the
 * main thread is one package.
 */
export declare function preloadFileSupport(): void;
/**
 * The answer for a tool call that would `action` `filePath` while a package it
 * needs is still loading, naming the file; undefined once loaded. A package
 * not preloading yet (before initialize, or after a failure) starts here,
 * after the call has answered. `isPdf` for a PDF whatever its name (write_pdf),
 * `isUrl` for a URL read.
 */
export declare function stillLoadingError(filePath: string, action: FileAction, { isPdf, isUrl }?: {
    isPdf?: boolean;
    isUrl?: boolean;
}): string | undefined;
