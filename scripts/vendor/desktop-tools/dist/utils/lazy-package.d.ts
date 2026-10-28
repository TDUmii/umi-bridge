/**
 * A package only some files need, declared next to the code that uses it,
 * whose load() loads it on first use (#715). Loading them before initialize
 * took 25-90 s on one reporter's machine and timed the client out, and loading
 * one inside the tool call that first needs it can take longer than a client
 * waits. So the server preloads them right after initialize, one at a time
 * (preloadFileSupport() in utils/files/factory.ts), and until one is loaded the
 * calls that need it answer at once that it is still loading. preload() loads
 * it on a later turn of the event loop, so a call that starts it answers
 * first. `error` says why the last preload failed. Callers that load with
 * import() can mark failures as requiring a restart, because Node caches a
 * failed dynamic import.
 */
export declare class LazyPackage<T> {
    readonly name: string;
    readonly support: string;
    readonly load: () => T;
    readonly restartAfterFailure: boolean;
    loaded: boolean;
    error?: string;
    needsRestart: boolean;
    private running?;
    constructor(name: string, support: string, load: () => T, restartAfterFailure?: boolean);
    preload(): Promise<void>;
}
