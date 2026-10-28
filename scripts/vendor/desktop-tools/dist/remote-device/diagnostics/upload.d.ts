/** The signed-in user's id from ~/.desktop-commander-device/device.json, or null. */
export declare function savedUserId(home: string): string | null;
export interface UploadOptions {
    /** From /api/mcp-info; null when the server names none, and then nothing is uploaded. */
    diagnosticsUrl: string | null;
    userId: string | null;
    deviceId: string | null;
    timeoutMs?: number;
}
/** POSTs the zip and resolves the report id; rejects with a short reason. */
export declare function uploadReport(zip: Buffer, options: UploadOptions): Promise<string>;
