/**
 * Image file handler
 * Handles reading image files and converting to base64
 */
import { FileHandler, ReadOptions, FileResult, FileInfo } from './base.js';
/**
 * Whether content of this MIME type is answered as an image: every image type
 * but SVG, which is text (XML), read and written as text. Only the file preview
 * widget draws an SVG as an image (svgAsImage). Files and URLs both decide here.
 */
export declare function isImageAnswer(mimeType: string, svgAsImage?: boolean): boolean;
/**
 * Image file handler implementation
 * Supports: PNG, JPEG, GIF, WebP, BMP; an SVG only for the file preview widget
 * (isImageAnswer), everyone else reads and writes it as text.
 */
export declare class ImageFileHandler implements FileHandler {
    private static readonly IMAGE_MIME_TYPES;
    canHandle(path: string, options?: {
        svgAsImage?: boolean;
    }): boolean;
    read(path: string, options?: ReadOptions): Promise<FileResult>;
    write(path: string, content: Buffer | string, mode?: 'rewrite' | 'append'): Promise<void>;
    getInfo(path: string): Promise<FileInfo>;
    /**
     * Get MIME type for image based on file extension
     */
    private getMimeType;
}
