import fs from 'fs/promises';
import { randomBytes } from 'crypto';
import { channel } from 'diagnostics_channel';
import { existsSync, readdirSync } from 'fs';
import { createServer } from 'http';
import { createRequire } from 'module';
import { tmpdir, userInfo } from 'os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { pdf2md } from './lib/pdf2md.js';
import { CONFIG_FILE } from '../../config.js';
import { LazyPackage } from '../../utils/lazy-package.js';
const isUrl = (source) => source.startsWith('http://') || source.startsWith('https://');
// Cached Chrome path to avoid repeated lookups
let cachedChromePath = null; // null = not checked yet
let chromeCheckPromise = null;
/** Name prefix of the temporary Chrome profile folder each PDF render gets */
const CHROME_PROFILE_PREFIX = 'desktop-commander-chrome-profile-';
/** Longest the removal of a render's Chrome profile waits for Chrome to let go of it */
const CHROME_PROFILE_REMOVAL_BUDGET_MS = 60000;
const CHROME_PROFILE_REMOVAL_RETRY_MS = 250;
/** Node announces every child process it creates on this channel */
const childProcessChannel = channel('child_process');
/** Longest a render waits for its Chrome to exit once it has been told to stop */
const CHROME_EXIT_WAIT_MS = 10000;
/** Cookie a render's Chrome sends to its web server; nothing else gets in */
const RENDER_COOKIE_NAME = 'desktop-commander-pdf-render';
const require = createRequire(import.meta.url);
// md-to-pdf, with its own Puppeteer, file server and front matter parser, loaded the
// way md-to-pdf loads them (they are its dependencies, not Desktop Commander's)
export const mdToPdfPackage = new LazyPackage('md-to-pdf', 'PDF writing support', () => {
    const requireFromMdToPdf = createRequire(require.resolve('md-to-pdf'));
    const { convertMdToPdf } = require('md-to-pdf/dist/lib/md-to-pdf.js');
    const { defaultConfig } = require('md-to-pdf/dist/lib/config.js');
    const puppeteer = requireFromMdToPdf('puppeteer');
    const serveHandler = requireFromMdToPdf('serve-handler');
    const grayMatter = requireFromMdToPdf('gray-matter');
    return { convertMdToPdf, defaultConfig, puppeteer, serveHandler, grayMatter };
});
const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
/**
 * The md-to-pdf options Desktop Commander ignores, and why. Every other option
 * from write_pdf's `options` and from the markdown's front matter applies as
 * md-to-pdf normally applies it. These few are ignored because they would let
 * the markdown or the caller write the PDF somewhere other than the requested
 * path (dest, pdf_options.path), run a different program as the renderer
 * (launch_options.executablePath), pass their own flags to it
 * (launch_options.args), change the browser process in other ways (every
 * launch option but ALLOWED_LAUNCH_OPTIONS), or hold the browser open forever
 * (devtools). Desktop Commander writes the PDF itself, to the validated path,
 * and runs the renderer on a browser and profile it controls.
 */
const IGNORED_RENDER_OPTIONS = {
    'dest': 'Desktop Commander writes the PDF only to the path you requested',
    'devtools': 'Desktop Commander does not open the renderer with devtools (it would never finish)',
    'pdf_options.path': 'Desktop Commander writes the PDF only to the path you requested',
    'launch_options.executablePath': 'Desktop Commander chooses the browser used to render',
    'launch_options.args': 'Desktop Commander controls the arguments the browser is launched with',
};
/**
 * The launch_options (Puppeteer's LaunchOptions) that apply: they only change
 * how the page renders or how long Desktop Commander waits. Every other launch
 * option is ignored. Those set what runs and how: the browser's environment
 * (env, which could preload a library into it or undo the Windows profile
 * fix), where its output goes (dumpio pipes it to stdout, the MCP
 * connection), how Desktop Commander connects to it (pipe, debuggingPort,
 * protocol), its arguments and extensions (ignoreDefaultArgs,
 * enableExtensions), where it saves downloads (downloadBehavior), which browser
 * runs (browser, channel), or how this process handles signals (handleSIGINT,
 * ...). An allowlist, so an option a later Puppeteer adds is ignored too.
 */
const ALLOWED_LAUNCH_OPTIONS = new Set([
    'headless', 'timeout', 'protocolTimeout', 'slowMo', 'defaultViewport',
    'acceptInsecureCerts', 'networkEnabled', 'waitForInitialPage',
]);
const LAUNCH_OPTION_REASON = `Desktop Commander controls how the browser is launched; of launch_options, only ${[...ALLOWED_LAUNCH_OPTIONS].join(', ')} apply`;
/**
 * The caller's gray_matter_options over md-to-pdf's defaults, with the
 * JavaScript engine off whatever the caller says: a caller's settings (even
 * `{}` or null) replaced the defaults and switched it back on, so a `---js`
 * header, or any header with `language: 'javascript'`, ran in the server.
 * gray-matter finds an engine by name, then by alias (js -> javascript), so
 * both names are switched off.
 */
function safeGrayMatterOptions(callerOptions) {
    const { defaultConfig } = mdToPdfPackage.load();
    // md-to-pdf's switch-off of gray-matter's JavaScript engine, which evaluates the header's code
    const disabledJsEngine = defaultConfig.gray_matter_options.engines.javascript;
    const caller = isPlainObject(callerOptions) ? callerOptions : {};
    const callerEngines = isPlainObject(caller.engines) ? caller.engines : {};
    return {
        ...defaultConfig.gray_matter_options,
        ...caller,
        engines: { ...callerEngines, js: disabledJsEngine, javascript: disabledJsEngine },
    };
}
/**
 * The single place write_pdf's `options` and the markdown's front matter are
 * merged. Front matter wins (as in md-to-pdf), pdf_options is merged key by
 * key, and the options Desktop Commander ignores are removed from the merged
 * result AFTER the merge, so neither source can re-add them. Returns the
 * markdown body without its front matter, so the caller can render it without
 * md-to-pdf merging the front matter a second time.
 */
export function resolveRender(markdown, options = {}) {
    const { grayMatter } = mdToPdfPackage.load();
    const fromOptions = isPlainObject(options) ? options : {};
    // Parse the front matter the way md-to-pdf would, with the caller's
    // gray_matter_options, but never with gray-matter's JavaScript engine
    const grayMatterOptions = safeGrayMatterOptions(fromOptions.gray_matter_options);
    const { content, data } = grayMatter(markdown, grayMatterOptions);
    const frontMatter = isPlainObject(data) ? data : {};
    // md-to-pdf's merge: front matter over options, with pdf_options merged key by key
    const merged = { ...fromOptions, ...frontMatter };
    // md-to-pdf's own parse (it finds no front matter in the body) gets the same settings
    if ('gray_matter_options' in merged) {
        merged.gray_matter_options = grayMatterOptions;
    }
    const optionsPdf = isPlainObject(fromOptions.pdf_options) ? fromOptions.pdf_options : {};
    const frontMatterPdf = isPlainObject(frontMatter.pdf_options) ? frontMatter.pdf_options : {};
    if ('pdf_options' in fromOptions || 'pdf_options' in frontMatter) {
        merged.pdf_options = { ...optionsPdf, ...frontMatterPdf };
    }
    if (isPlainObject(merged.launch_options)) {
        merged.launch_options = { ...merged.launch_options };
    }
    const ignoredOptions = [];
    const ignore = (option) => ignoredOptions.push({ option, reason: IGNORED_RENDER_OPTIONS[option] ?? LAUNCH_OPTION_REASON });
    if ('dest' in merged) {
        ignore('dest');
        delete merged.dest;
    }
    if ('devtools' in merged) {
        ignore('devtools');
        delete merged.devtools;
    }
    if (isPlainObject(merged.pdf_options) && 'path' in merged.pdf_options) {
        ignore('pdf_options.path');
        delete merged.pdf_options.path;
    }
    if (isPlainObject(merged.launch_options)) {
        const launchOptions = merged.launch_options;
        for (const key of Object.keys(launchOptions)) {
            if (ALLOWED_LAUNCH_OPTIONS.has(key))
                continue;
            ignore(`launch_options.${key}`);
            delete launchOptions[key];
        }
    }
    return { body: content, options: merged, ignoredOptions };
}
/**
 * Get Desktop Commander's private Puppeteer cache directory.
 */
function getPuppeteerCacheDir() {
    return join(dirname(CONFIG_FILE), 'puppeteer-cache');
}
/**
 * Get the cache path where Puppeteer stores Chrome for Testing builds.
 */
function getPuppeteerChromeDir(cacheDir = getPuppeteerCacheDir()) {
    return join(cacheDir, 'chrome');
}
/**
 * Find the platform-specific executable within a cached Chrome build directory.
 */
function getChromeExecutablePath(chromeDir, version) {
    const chromePath = process.platform === 'win32'
        ? join(chromeDir, version, 'chrome-win64', 'chrome.exe')
        : process.platform === 'darwin'
            ? join(chromeDir, version, 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
            : join(chromeDir, version, 'chrome-linux64', 'chrome');
    if (existsSync(chromePath)) {
        return chromePath;
    }
    // Also check for arm64 mac
    if (process.platform === 'darwin') {
        const armPath = join(chromeDir, version, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
        if (existsSync(armPath)) {
            return armPath;
        }
    }
    return undefined;
}
/**
 * Resolve the cached Chrome build directory that owns an executable path.
 */
function getCachedChromeBuildDir(chromeDir, executablePath) {
    const relativePath = relative(chromeDir, executablePath);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
        return undefined;
    }
    const [buildDir] = relativePath.split(sep);
    return buildDir ? join(chromeDir, buildDir) : undefined;
}
/**
 * Find Chrome in puppeteer's cache directory
 * Returns the executable path if found, undefined otherwise
 */
export function findPuppeteerChrome(cacheDir = getPuppeteerCacheDir()) {
    const chromeDir = getPuppeteerChromeDir(cacheDir);
    if (!existsSync(chromeDir)) {
        return undefined;
    }
    try {
        // Look for chrome directories (e.g., win64-143.0.7499.169)
        const versions = readdirSync(chromeDir, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        for (const version of versions) {
            const executablePath = getChromeExecutablePath(chromeDir, version);
            if (executablePath) {
                return { executablePath };
            }
        }
    }
    catch {
        // Ignore errors reading cache directory
    }
    return undefined;
}
/**
 * Remove stale Puppeteer Chrome builds while preserving the active build.
 */
export async function pruneOldPuppeteerChromeBuilds(activeExecutablePath, cacheDir = getPuppeteerCacheDir()) {
    const chromeDir = getPuppeteerChromeDir(cacheDir);
    const activeBuildDir = getCachedChromeBuildDir(chromeDir, activeExecutablePath);
    if (!activeBuildDir) {
        return;
    }
    let entries;
    try {
        entries = await fs.readdir(chromeDir, { withFileTypes: true });
    }
    catch {
        return;
    }
    await Promise.all(entries
        .filter(entry => entry.isDirectory())
        .map(async (entry) => {
        const buildDir = join(chromeDir, entry.name);
        if (resolve(buildDir) === resolve(activeBuildDir)) {
            return;
        }
        try {
            await fs.rm(buildDir, { recursive: true, force: true });
        }
        catch (error) {
            console.error(`Failed to remove old Chrome cache build at ${buildDir}:`, error);
        }
    }));
}
/**
 * Where Chrome and Chromium install on Windows. Windows is not always on C:,
 * so the Program Files and local app data folders come from Windows' own
 * settings. ProgramW6432 is the 64-bit Program Files seen from a 32-bit Node.
 */
function windowsChromePaths() {
    const env = process.env;
    const programFiles = [...new Set([env.ProgramFiles, env.ProgramW6432, env['ProgramFiles(x86)']])]
        .filter((dir) => Boolean(dir));
    return [
        ...programFiles.map(dir => join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe')),
        ...(env.LOCALAPPDATA ? [join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')] : []),
        ...programFiles.map(dir => join(dir, 'Chromium', 'Application', 'chrome.exe')),
    ];
}
/**
 * Find system-installed Chrome/Chromium browser
 * Returns the executable path if found, undefined otherwise
 */
export function findSystemChrome() {
    const paths = process.platform === 'win32'
        ? windowsChromePaths()
        : process.platform === 'darwin'
            ? [
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Chromium.app/Contents/MacOS/Chromium',
                '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
            ]
            : [
                // Linux paths
                '/usr/bin/google-chrome',
                '/usr/bin/google-chrome-stable',
                '/usr/bin/chromium',
                '/usr/bin/chromium-browser',
                '/snap/bin/chromium',
            ];
    return paths.find(p => existsSync(p));
}
/**
 * Environment for the Chrome process that renders PDFs.
 *
 * Google Chrome (136+) refuses remote debugging, which Puppeteer needs to
 * drive it, whenever it cannot resolve its default profile directory, even
 * though Puppeteer runs it on a separate temporary profile. On Windows Chrome
 * resolves that directory under %USERPROFILE%\AppData\Local and fails if the
 * folder is missing, so when Desktop Commander runs with USERPROFILE pointing
 * at any other folder (e.g. a relocated home), Chrome starts without a
 * DevTools endpoint and Puppeteer times out with a misleading "The browser is
 * already running" error. Chrome gets the account's real profile folder,
 * which Windows reports from the logon token regardless of environment
 * overrides; the rest of the environment is passed through unchanged.
 */
function getChromeEnvironment() {
    if (process.platform !== 'win32') {
        return undefined;
    }
    let profileDir;
    try {
        profileDir = userInfo().homedir;
    }
    catch (error) {
        console.error("Could not read the account's profile folder for Chrome:", error);
        return undefined;
    }
    // Windows env names are case-insensitive: drop every spelling before setting ours
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toUpperCase() !== 'USERPROFILE'));
    return { ...env, USERPROFILE: profileDir };
}
/**
 * Temporary Chrome profile folder for one PDF render.
 *
 * Chrome gets a profile folder we create and remove instead of Puppeteer's
 * own: Puppeteer deletes a profile it created itself, and after a failed
 * launch it does so before stopping Chrome, in a promise nobody awaits. On
 * Windows the delete fails with EBUSY and the unhandled rejection takes the
 * whole server down. Puppeteer leaves a userDataDir it was given alone.
 *
 * The folder can only be removed once that Chrome has exited: Windows refuses
 * to delete files a running process holds open, and a Chrome that is still
 * starting up recreates a folder deleted under it. Puppeteer does not hand out the Chrome
 * process when the launch fails (it stops it itself about 5 seconds later),
 * so the process is picked up from Node's child_process diagnostics channel
 * by its --user-data-dir argument, and release() stops it right away.
 *
 * Chrome gets the folder as an argument rather than as Puppeteer's userDataDir
 * option: Puppeteer turns that option into one of its default arguments, and a
 * caller's ignoreDefaultArgs: true drops those, after which Puppeteer creates
 * a profile of its own again.
 */
async function createChromeProfile() {
    const dir = await fs.mkdtemp(join(tmpdir(), CHROME_PROFILE_PREFIX));
    const userDataDirArg = `--user-data-dir=${resolve(dir)}`;
    let chrome;
    const onChildProcess = (message) => {
        const child = message.process;
        // The channel announces a child before spawning it; its arguments are set in the same tick
        queueMicrotask(() => {
            if (child.spawnargs?.includes(userDataDirArg)) {
                chrome = child;
            }
        });
    };
    childProcessChannel.subscribe(onChildProcess);
    return {
        arg: userDataDirArg,
        release: async () => {
            childProcessChannel.unsubscribe(onChildProcess);
            await stopChrome(chrome);
            void removeChromeProfile(dir, chrome);
        },
    };
}
/**
 * Stops a render's Chrome if it still runs and waits for it to exit, for at
 * most CHROME_EXIT_WAIT_MS. Once a render is over only a failed launch (or a
 * browser that could not be closed) leaves Chrome running.
 */
async function stopChrome(chrome) {
    if (!chrome || chrome.pid === undefined || chrome.exitCode !== null || chrome.signalCode !== null) {
        return;
    }
    const exited = new Promise((resolve) => {
        setTimeout(resolve, CHROME_EXIT_WAIT_MS).unref();
        chrome.once('exit', () => resolve());
    });
    chrome.kill();
    await exited;
}
/**
 * Removes a render's Chrome profile once its Chrome (if one was started) has
 * exited. Never throws, and its timers do not keep the process alive: a
 * profile that cannot be removed within the budget is left in the temp folder.
 */
async function removeChromeProfile(profileDir, chrome) {
    const deadline = Date.now() + CHROME_PROFILE_REMOVAL_BUDGET_MS;
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
        await new Promise((resolve) => {
            setTimeout(resolve, CHROME_PROFILE_REMOVAL_BUDGET_MS).unref();
            chrome.once('exit', () => resolve());
            // A process error means it's gone too: stop waiting
            chrome.once('error', () => resolve());
        });
    }
    for (;;) {
        try {
            await fs.rm(profileDir, { recursive: true, force: true });
            return;
        }
        catch (error) {
            // Chrome's helper processes can hold files a moment longer than the browser process
            if (Date.now() >= deadline) {
                console.error(`Could not remove Chrome profile ${profileDir}:`, error);
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, CHROME_PROFILE_REMOVAL_RETRY_MS).unref());
        }
    }
}
/** A stylesheet md-to-pdf loads as a URL; anything else it reads from disk (md-to-pdf's isHttpUrl) */
const isHttpUrl = (input) => {
    try {
        return new URL(input).protocol.startsWith('http');
    }
    catch {
        // Not a URL: a path
        return false;
    }
};
/**
 * The files md-to-pdf reads from disk into the page it renders, from write_pdf's
 * options or the front matter: stylesheet paths, script paths, and the
 * highlight style (a file name in highlight.js's styles folder). Each must be
 * inside the allowed folders, checked as every file tool checks a path, and is
 * replaced in `render` by the path the check resolved (links followed): md-to-pdf
 * then reads the file that was checked, even if a link on the way is changed
 * after the check. md-to-pdf's own stylesheet and highlight styles are not the
 * caller's files and stay allowed.
 *
 * Returns the paths as the caller gave them, by the checked path read instead,
 * for the errors (nameGivenPaths).
 */
async function validateRenderFiles(render, validatePath) {
    const givenPaths = new Map();
    const check = async (file) => {
        const checked = await validatePath(file);
        if (checked !== file && !givenPaths.has(checked))
            givenPaths.set(checked, file);
        return checked;
    };
    // md-to-pdf takes one value or a list
    const eachOf = async (value, checkItem) => Array.isArray(value) ? Promise.all(value.map(checkItem)) : checkItem(value);
    if ('stylesheet' in render) {
        render.stylesheet = await eachOf(render.stylesheet, async (stylesheet) => typeof stylesheet === 'string' && stylesheet !== '' && !isHttpUrl(stylesheet) ? check(stylesheet) : stylesheet);
    }
    if ('script' in render) {
        render.script = await eachOf(render.script, async (script) => isPlainObject(script) && typeof script.path === 'string' ? { ...script, path: await check(script.path) } : script);
    }
    if (typeof render.highlight_style === 'string') {
        // Where md-to-pdf looks for it
        const stylesFolder = resolve(dirname(createRequire(createRequire(import.meta.url).resolve('md-to-pdf')).resolve('highlight.js')), '..', 'styles');
        const style = resolve(stylesFolder, `${render.highlight_style}.css`);
        const inStylesFolder = relative(stylesFolder, style);
        if (inStylesFolder === '..' || inStylesFolder.startsWith(`..${sep}`) || isAbsolute(inStylesFolder)) {
            const checked = await check(style);
            // md-to-pdf reads <styles folder>/<highlight_style>.css: name the checked file that way
            if (!checked.endsWith('.css')) {
                throw new Error(`highlight_style ${render.highlight_style} (${style}) is a link to a file that is not a .css file`);
            }
            render.highlight_style = relative(stylesFolder, checked.slice(0, -'.css'.length));
        }
    }
    return givenPaths;
}
/**
 * The render reads the checked paths (links resolved: on macOS a temporary file
 * given as /var/... is read as /private/var/...). An error from it names each
 * file as the caller gave it instead, as it did before the render read the
 * checked paths.
 */
function nameGivenPaths(error, givenPaths) {
    if (!(error instanceof Error) || givenPaths.size === 0)
        return;
    // Longest first, so a checked path that starts a longer one isn't replaced inside it
    const pairs = [...givenPaths].sort(([a], [b]) => b.length - a.length);
    const asGiven = (text) => pairs.reduce((named, [checked, given]) => named.split(checked).join(given), text);
    error.message = asGiven(error.message);
    if (error.stack)
        error.stack = asGiven(error.stack);
    const withPath = error;
    if (typeof withPath.path === 'string')
        withPath.path = asGiven(withPath.path);
}
/**
 * Serve a file of the render's base folder only if it is inside the allowed
 * folders, checked as every file tool checks it (links resolved): markdown must
 * not embed a file from outside them, whether the base folder is the working
 * folder or reaches outside through a linked folder. The file served is the one
 * the check resolved, not the URL's path looked up again, so a link on the way
 * that is changed after the check doesn't lead elsewhere.
 */
async function serveAllowedFile(request, response, basedir) {
    // Imported when used: tools/filesystem.js loads this module
    const { validatePath } = await import('../filesystem.js');
    let file;
    try {
        // The file the URL names in the base folder
        const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
        file = await validatePath(join(basedir, pathname));
    }
    catch {
        // Outside the allowed folders (or not a file path): refused, not served
        response.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden');
        return;
    }
    // serve-handler serves exactly that file (no .html redirects, which would name it from another folder).
    // It reads only the request's url and headers; the request itself keeps its URL.
    const forFile = { url: `/${encodeURIComponent(basename(file))}`, headers: request.headers };
    await mdToPdfPackage.load().serveHandler(forFile, response, { public: dirname(file), directoryListing: false, cleanUrls: false });
}
/**
 * Local web server for one PDF render.
 *
 * md-to-pdf loads the page it renders from http://localhost:<port>/, served
 * from the markdown's base folder (Desktop Commander's working folder unless
 * the caller passes basedir), so relative and absolute image paths in the
 * markdown load. md-to-pdf's own server listens on every network interface,
 * answers anyone, and is closed only after a successful render: after a
 * failed one it kept serving the working folder until Desktop Commander
 * restarted. This one listens on 127.0.0.1 only, answers only requests that
 * carry a random cookie set in the render's own Chrome, and serves files, not
 * folder listings, only from inside the allowed folders (serveAllowedFile).
 */
async function startRenderServer(basedir) {
    const cookie = { name: RENDER_COOKIE_NAME, value: randomBytes(32).toString('hex') };
    const expected = `${cookie.name}=${cookie.value}`;
    const server = createServer((request, response) => {
        if (!request.headers.cookie?.split(/;\s*/).includes(expected)) {
            response.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden');
            return;
        }
        serveAllowedFile(request, response, basedir).catch((error) => {
            console.error('The PDF render server could not serve a file:', error);
            if (!response.headersSent)
                response.writeHead(500);
            response.end();
        });
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return {
        port: server.address().port,
        cookie,
        close: () => new Promise((resolve) => {
            server.close(() => resolve());
            // Chrome's keep-alive connections would hold close() open
            server.closeAllConnections();
        }),
    };
}
/**
 * Download and install Chrome using @puppeteer/browsers
 * Returns the executable path after installation
 */
async function installChrome() {
    // Dynamic import to avoid loading if not needed
    const { install, Browser, detectBrowserPlatform, resolveBuildId } = await import('@puppeteer/browsers');
    const cacheDir = getPuppeteerCacheDir();
    const platform = detectBrowserPlatform();
    const buildId = await resolveBuildId(Browser.CHROME, platform, 'stable');
    console.error('Downloading Chrome for PDF generation (this may take a few minutes)...');
    await fs.mkdir(cacheDir, { recursive: true });
    const installedBrowser = await install({
        browser: Browser.CHROME,
        buildId,
        cacheDir,
        downloadProgressCallback: (downloadedBytes, totalBytes) => {
            const percent = Math.round((downloadedBytes / totalBytes) * 100);
            process.stderr.write(`\rDownloading Chrome: ${percent}%`);
        },
    });
    console.error('\nChrome download complete.');
    return {
        executablePath: installedBrowser.executablePath,
    };
}
/**
 * Find or install Chrome for PDF generation
 * Priority: 1. Puppeteer cache, 2. System Chrome, 3. Install Chrome
 * Results are cached to avoid repeated lookups
 */
async function getChromePath() {
    // Return cached result if available
    if (cachedChromePath !== null) {
        return cachedChromePath;
    }
    // If a check is already in progress, wait for it
    if (chromeCheckPromise) {
        return chromeCheckPromise;
    }
    // Start the check
    chromeCheckPromise = (async () => {
        // 1. Check puppeteer cache first (exact compatible version)
        const cachedChrome = findPuppeteerChrome();
        if (cachedChrome) {
            await pruneOldPuppeteerChromeBuilds(cachedChrome.executablePath);
            cachedChromePath = cachedChrome.executablePath;
            return cachedChrome.executablePath;
        }
        // 2. Check system Chrome
        const systemChrome = findSystemChrome();
        if (systemChrome) {
            cachedChromePath = systemChrome;
            return systemChrome;
        }
        if (process.env.DESKTOP_COMMANDER_LOCAL_ONLY === '1') {
            throw new Error('Local-only mode: PDF generation requires Chrome or Chromium already installed. ' +
                'Install a browser locally, then restart Desktop Commander. Automatic downloads are disabled.');
        }
        // 3. Install Chrome as last resort
        try {
            const installedChrome = await installChrome();
            await pruneOldPuppeteerChromeBuilds(installedChrome.executablePath);
            cachedChromePath = installedChrome.executablePath;
            return installedChrome.executablePath;
        }
        catch (error) {
            console.error('Failed to install Chrome:', error);
            cachedChromePath = undefined;
            return undefined;
        }
    })();
    try {
        return await chromeCheckPromise;
    }
    finally {
        chromeCheckPromise = null;
    }
}
/**
 * Preemptively ensure Chrome is available for PDF generation.
 * Call this at server startup to trigger download in background if needed.
 * Returns immediately, download happens in background.
 */
export function ensureChromeAvailable() {
    if (process.env.DESKTOP_COMMANDER_LOCAL_ONLY === '1')
        return;
    // Don't await - let it run in background
    getChromePath().catch((error) => {
        console.error('Background Chrome check failed:', error);
    });
}
async function loadPdfToBuffer(source) {
    if (isUrl(source)) {
        const response = await fetch(source);
        return await response.arrayBuffer();
    }
    else {
        return await fs.readFile(source);
    }
}
/**
 * Convert PDF to Markdown using @opendocsg/pdf2md
 */
export async function parsePdfToMarkdown(source, pageNumbers = []) {
    try {
        const data = await loadPdfToBuffer(source);
        // @ts-ignore: Type definition mismatch for ESM usage
        return await pdf2md(new Uint8Array(data), pageNumbers);
    }
    catch (error) {
        console.error("Error converting PDF to Markdown (v3):", error);
        throw error;
    }
}
/**
 * Render markdown to PDF with md-to-pdf's converter in a Chrome of our own.
 *
 * md-to-pdf's mdToPdf() starts its web server and Chrome and stops them only
 * after a successful render. So each render starts its own Chrome profile,
 * web server (startRenderServer) and Chrome here, hands the converter the
 * browser, and releases all of them on every path: when this returns or
 * throws, the server is closed and Chrome, with the page it rendered, has
 * exited.
 *
 * Options are md-to-pdf's, from `options` and the markdown's front matter
 * (resolveRender merges them and drops the few Desktop Commander ignores).
 * The PDF is only returned: Desktop Commander writes it, so the config forces
 * dest to '' (md-to-pdf would otherwise write it to dest, or to stdout - the
 * MCP connection - when dest is undefined).
 */
export async function parseMarkdownToPdf(markdown, options = {}) {
    let profile;
    let server;
    let browser;
    // The render files as the caller gave them, by the checked paths the render reads
    let givenPaths = new Map();
    try {
        const { convertMdToPdf, defaultConfig, puppeteer } = mdToPdfPackage.load();
        // The folder the markdown's files are served from must be inside the allowed folders
        const { validatePath } = await import('../filesystem.js');
        const basedir = options.basedir ? await validatePath(options.basedir) : process.cwd();
        // Merge options and front matter, and drop the ignored ones, in one place
        const { body, options: render } = resolveRender(markdown, options);
        givenPaths = await validateRenderFiles(render, validatePath);
        const launchOptions = isPlainObject(render.launch_options) ? render.launch_options : {};
        // Find Chrome: puppeteer cache -> system Chrome -> install
        const chromePath = await getChromePath();
        const chromeEnv = getChromeEnvironment();
        profile = await createChromeProfile();
        server = await startRenderServer(basedir);
        browser = await puppeteer.launch({
            // Only the launch options resolveRender allows (ALLOWED_LAUNCH_OPTIONS);
            // Desktop Commander's own settings below come after them
            ...launchOptions,
            ...(chromeEnv ? { env: chromeEnv } : {}),
            // Desktop Commander chooses the browser (launch_options.executablePath is dropped by resolveRender)
            ...(chromePath ? { executablePath: chromePath } : {}),
            // Chrome runs on the render's own profile whatever the caller asked for
            // (launch_options.args is dropped by resolveRender; userDataDir is overridden here)
            userDataDir: undefined,
            args: [profile.arg],
        });
        await browser.setCookie({ ...server.cookie, domain: 'localhost', path: '/', httpOnly: true });
        // The config mdToPdf() would build, on our server's port
        const config = {
            ...defaultConfig,
            ...render,
            pdf_options: { ...defaultConfig.pdf_options, ...(isPlainObject(render.pdf_options) ? render.pdf_options : {}) },
            basedir,
            dest: '',
            port: server.port,
        };
        // After a blank line, so the converter finds no front matter of its own to merge
        const pdf = await convertMdToPdf({ content: `\n${body}` }, config, { browser });
        return pdf.content;
    }
    catch (error) {
        nameGivenPaths(error, givenPaths);
        // Provide helpful error message if Chrome is not found
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Could not find Chrome')) {
            throw new Error('PDF generation requires Chrome or Chromium browser. ' +
                'Please install Google Chrome from https://www.google.com/chrome/ ' +
                'or Chromium, then try again.');
        }
        console.error('Error creating PDF:', error);
        throw error;
    }
    finally {
        await server?.close();
        await browser?.close().catch((error) => console.error('Error closing the PDF browser:', error));
        // Also stops a Chrome whose launch failed, which Puppeteer would leave running for 5 more seconds
        await profile?.release();
    }
}
