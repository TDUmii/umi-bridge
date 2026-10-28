/**
 * Resolves a shell or other program name ("pwsh", "bash.exe", "where") or path
 * ("/bin/zsh") to an executable file. Bare names are searched in PATH's
 * folders only, never the working folder. Returns null when it can't be found.
 */
export declare function resolveShellPath(shell: string): string | null;
export declare function isShellAvailable(shell: string): boolean;
/**
 * The full path to start a program by: the one found on PATH. Windows looks
 * for a bare name ("powershell.exe", "cmd", "tasklist") in the working folder
 * before PATH, so a file of that name there would run instead; every program
 * Desktop Commander starts by name goes through here. On Windows a bare name
 * not found on PATH is an error rather than a name Windows would look up in
 * the working folder. A path (absolute, or with a folder in it) is kept as
 * given, and so is a bare name elsewhere, where the working folder isn't searched.
 */
export declare function resolveProgramPath(program: string): string;
/**
 * The shell used when the user hasn't configured one.
 * Windows: Windows PowerShell, falling back to %ComSpec%.
 * macOS/Linux: $SHELL, falling back to the OS default shell.
 */
export declare function getDefaultShell(): string;
/**
 * Shells installed on this machine, default shell first. Only shells that
 * resolve to an executable are returned.
 */
export declare function detectAvailableShells(): string[];
/**
 * Configuration for spawning a shell with appropriate flags
 */
export interface ShellSpawnConfig {
    executable: string;
    args: string[];
    useShellOption: string | boolean;
    windowsVerbatim?: boolean;
}
/**
 * Get the appropriate spawn configuration for a given shell
 * This handles login shell flags for different shell types
 */
export declare function getShellSpawnArgs(shellPath: string, command: string): ShellSpawnConfig;
