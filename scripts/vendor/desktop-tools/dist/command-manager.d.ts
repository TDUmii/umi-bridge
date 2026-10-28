declare class CommandManager {
    getBaseCommand(command: string): string;
    /**
     * The command name of each command in a command line (chained, piped, in $(), ...).
     * asTyped: each first word as typed instead of its base name, for telemetry,
     * which then replaces a path whole (a base name alone can't be told from one).
     */
    extractCommands(commandString: string, asTyped?: boolean): string[];
    extractBaseCommand(commandStr: string, asTyped?: boolean): string | null;
    validateCommand(command: string): Promise<boolean>;
}
export declare const commandManager: CommandManager;
export {};
