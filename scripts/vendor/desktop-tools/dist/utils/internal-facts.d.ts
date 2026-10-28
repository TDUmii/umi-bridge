import type { ServerResult } from '../types.js';
/** The result as the client receives it: without structuredContent kept internal */
export declare function withoutInternalFacts(toolName: string, result: ServerResult): ServerResult;
