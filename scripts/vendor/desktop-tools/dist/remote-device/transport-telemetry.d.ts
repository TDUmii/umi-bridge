type TransportObservation = ({
    stage: 'received';
    payload: any;
    deviceId: string | null;
    userId: string | undefined;
} | {
    stage: string;
    callId: string;
    deviceId: string | null | undefined;
    toolName?: string;
    operation?: string;
    operationId?: string;
}) & {
    transport?: 'broadcast' | 'mqtt';
};
/** Record a device transport checkpoint without affecting command handling. */
export declare function observeTransport(input: TransportObservation): {
    observation_id: `${string}-${string}-${string}-${string}-${string}`;
    source_process_id: `${string}-${string}-${string}-${string}-${string}`;
    schema_version: number;
    timestamp_utc: string;
    operation_id?: string | undefined;
    operation?: string | undefined;
    tool_name?: string | undefined;
    notification_id?: string | undefined;
    attempt_number?: number | undefined;
    transport?: "broadcast" | "mqtt" | undefined;
    call_id: string;
    device_id: string;
    stage: string;
} | null;
export {};
