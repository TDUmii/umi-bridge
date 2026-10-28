import { LazyPackage } from '../../../utils/lazy-package.js';
import { ImageInfo } from '../extract-images.js';
export declare const pdf2mdPackage: LazyPackage<{
    parse: any;
    makeTransformations: any;
    transform: any;
}>;
/**
 * PDF metadata structure
 */
export interface PdfMetadata {
    fileSize?: number;
    totalPages: number;
    title?: string;
    author?: string;
    creator?: string;
    producer?: string;
    version?: string;
    creationDate?: string;
    modificationDate?: string;
    isEncrypted?: boolean;
}
export interface PdfPageItem {
    text: string;
    images: ImageInfo[];
    pageNumber: number;
}
export interface PdfParseResult {
    pages: PdfPageItem[];
    metadata: PdfMetadata;
}
export type PageRange = {
    offset: number;
    length: number;
};
/**
 * Reads a PDF and converts it to Markdown, returning structured data.
 * @param pdfBuffer The PDF buffer to convert.
 * @param pageNumbers The page numbers to extract. If an empty array, all pages are extracted;
 * a range that selects no pages (offset past the last page, length 0) extracts none.
 * @returns A Promise that resolves to a PdfParseResult object containing the parsed data.
 */
export declare function pdf2md(pdfBuffer: Uint8Array, pageNumbers?: number[] | PageRange): Promise<PdfParseResult>;
