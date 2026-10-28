/**
 * File handling system
 * Exports all file handlers, interfaces, and utilities
 */
export * from './base.js';
export { getFileHandler, isExcelFile, isImageFile, preloadFileSupport, stillLoadingError } from './factory.js';
export type { FileAction } from './factory.js';
export { TextFileHandler } from './text.js';
export { ImageFileHandler, isImageAnswer } from './image.js';
export { BinaryFileHandler } from './binary.js';
export { ExcelFileHandler, exceljsPackage } from './excel.js';
export { pizzipPackage } from './docx.js';
