import type { PDFDocument as PDFDocumentType } from 'pdf-lib';
import { LazyPackage } from '../../utils/lazy-package.js';
import type { PdfInsertOperationSchema, PdfDeleteOperationSchema, PdfOperationSchema } from '../schemas.js';
import { z } from 'zod';
type PdfInsertOperation = z.infer<typeof PdfInsertOperationSchema>;
type PdfDeleteOperation = z.infer<typeof PdfDeleteOperationSchema>;
type PdfOperations = z.infer<typeof PdfOperationSchema>;
export type { PdfOperations, PdfInsertOperation, PdfDeleteOperation };
export declare const pdfLibPackage: LazyPackage<{
    PDFDocument: typeof PDFDocumentType;
}>;
/**
 * The render options for an inserted page's markdown: the call's options, with
 * the page size and margins of the original first page (pageLayout), then the
 * call's pdf_options, then the insert's own pdfOptions, each over the one before.
 */
export declare function insertRenderOptions(op: PdfInsertOperation, options?: Record<string, any>, pageLayout?: Record<string, unknown>): Record<string, any>;
/**
 * Edit an existing PDF by deleting or inserting pages
 * @param pdfPath Path to the PDF file to edit
 * @param operations List of operations to perform
 * @returns The modified PDF as a Uint8Array
 */
export declare function editPdf(pdfPath: string, operations: PdfOperations[], options?: Record<string, any>): Promise<Uint8Array>;
