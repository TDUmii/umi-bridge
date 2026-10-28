/**
 * Excel file handler using ExcelJS
 * Handles reading, writing, and editing Excel files (.xlsx, .xls, .xlsm)
 */
import type ExcelJS from 'exceljs';
import { LazyPackage } from '../lazy-package.js';
import { FileHandler, ReadOptions, FileResult, EditResult, FileInfo } from './base.js';
export declare const exceljsPackage: LazyPackage<typeof ExcelJS>;
/**
 * Excel file handler implementation using ExcelJS
 * Supports: .xlsx, .xls, .xlsm files
 */
export declare class ExcelFileHandler implements FileHandler {
    canHandle(path: string): boolean;
    read(path: string, options?: ReadOptions): Promise<FileResult>;
    write(path: string, content: any, mode?: 'rewrite' | 'append'): Promise<void>;
    editRange(path: string, range: string, content: any, options?: Record<string, any>): Promise<EditResult>;
    getInfo(path: string): Promise<FileInfo>;
    private checkFileSize;
    private extractMetadata;
    /**
     * The last row and the last column holding a value (0 for an empty sheet):
     * where the sheet's data ends, for reads, sheet info and appends alike.
     * Not actualRowCount/actualColumnCount: those COUNT the used rows and
     * columns, so data in columns A and AH only would end at column B.
     */
    private dataExtent;
    private worksheetToArray;
    private writeDataToSheet;
    private writeRowsStartingAt;
    private parseRange;
    private parseCellRange;
    private columnToNumber;
}
