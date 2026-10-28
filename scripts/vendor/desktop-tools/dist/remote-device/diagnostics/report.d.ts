type NodeKind = 'nvm' | 'fnm' | 'Volta' | 'asdf' | 'mise' | 'Homebrew' | "Claude Desktop's bundled Node" | 'global install' | 'unknown';
interface HostTiming {
    host: string;
    dnsMs?: number;
    /** TLS handshake for https, TCP connect for http. */
    connect?: {
        kind: 'TLS' | 'TCP';
        ms: number;
    };
    error?: string;
}
export interface DiagnosticsReport {
    format: 1;
    createdAt: string;
    versions: {
        desktopCommander: string;
        node: string;
        /** null: npm not found */
        npm: string | null;
        os: {
            name: string;
            release: string;
            arch: string;
        };
        /** process.execPath, home folder as ~ */
        nodePath: string;
        nodeKind: NodeKind;
        /** process.argv[1], home folder as ~ */
        entryPath: string;
        runKind: 'MCPB' | 'npx' | 'dev checkout' | 'global npm' | 'unknown';
    };
    clock: {
        serverAheadSeconds: number | null;
        error?: string;
    };
    network: {
        server: HostTiming & {
            mcpInfo: {
                ms: number[];
                statuses: number[];
                error?: string;
            };
        };
        supabase: (HostTiming & {
            rest: {
                status?: number;
                ms?: number;
                error?: string;
            };
            realtime: {
                openedMs?: number;
                heartbeat: boolean;
                heartbeatMs?: number;
                error?: string;
            };
        }) | {
            error: string;
        };
        proxy: {
            httpsProxy: boolean;
            httpProxy: boolean;
        };
    };
    device: {
        deviceJson: boolean;
        parses: boolean;
        /** In full: support finds the device by it. null if missing or not id-shaped. */
        id: string | null;
        session: boolean;
        accessToken: boolean;
        refreshToken: boolean;
        /** When device.json was last saved (its modification time), ISO in UTC. */
        savedAt: string | null;
    };
    settings: {
        telemetryEnabled: boolean | null;
        clientId: string | null;
    };
    deviceLog: {
        files: number;
        lines: number;
        first: string | null;
        last: string | null;
        lastText: string | null;
    };
    /** Copies of the MCP server running now, and the earliest start (ISO). null: the process list failed. */
    desktopCommanderMcp: {
        running: number | null;
        since: string | null;
        error?: string;
    };
}
interface LogPart {
    name: string;
    text: string;
}
/**
 * Which installer the Node executable comes from, read from its path. A path
 * none of these match is "unknown": the report shows the path itself anyway.
 */
export declare function nodeKind(execPath: string): NodeKind;
export declare function collectReport(): Promise<{
    report: DiagnosticsReport;
    logParts: LogPart[];
    diagnosticsUrl: string | null;
}>;
export declare function formatReport(report: DiagnosticsReport): string;
/** Collects the report and writes the zip to the home folder; returns its bytes for the upload too. */
export declare function writeReport(): Promise<{
    file: string;
    bytes: number;
    zip: Buffer;
    report: DiagnosticsReport;
    diagnosticsUrl: string | null;
}>;
/** `remote --report`: the terminal side. */
export declare function runReport(): Promise<void>;
export {};
