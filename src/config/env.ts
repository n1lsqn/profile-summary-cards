import {AppError} from './errors';
import {parseExcludeLanguages} from '../utils/translator';
import {ThemeMap} from '../const/theme';
import {parseAnimation, AnimationName} from '../utils/animation';

export type ProviderType = 'github' | 'gitlab' | 'combined';

export interface AppConfig {
    provider: ProviderType;
    githubUsername?: string;
    githubToken?: string;
    gitlabUsername?: string;
    gitlabBaseUrl?: string;
    gitlabToken?: string;
    gitlabIncludePrivate: boolean;
    utcOffset: number;
    theme?: string;
    animation?: AnimationName;
    duration?: string;
    displayName?: string;
    excludeLanguages: string[];
    excludeProjects: string[];
    outputDir: string;
    timeRangeDays: number;
    failOnPartialError: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    dedupeMode: 'none' | 'repository-url';
    dedupePrefer: 'github' | 'gitlab';
    dedupeMap: Record<string, string>;
    avatarSource: 'github' | 'gitlab' | 'none';
    allowInsecureHttp: boolean;
    dryRun: boolean;
}

/**
 * Parses a boolean string from env or CLI.
 *
 * @param {string | undefined} val - Raw string value.
 * @param {boolean} [defaultVal=false] - Fallback boolean value.
 * @return {boolean} Parsed boolean.
 */
function parseBool(val: string | undefined, defaultVal = false): boolean {
    if (!val) return defaultVal;
    const lower = val.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes';
}

/**
 * Parses CLI arguments into key-value options.
 * Secrets are explicitly NOT accepted via CLI arguments.
 *
 * @param {string[]} args - Process arguments array.
 * @return {Record<string, string>} Parsed arguments.
 */
export function parseCliArgs(args: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                result[key] = args[i + 1];
                i++;
            } else {
                result[key] = 'true';
            }
        }
    }
    return result;
}

/**
 * Loads and validates application configuration from environment variables and CLI flags.
 *
 * @param {string[]} [cliArgs=[]] - Optional CLI args (defaults to process.argv.slice(2)).
 * @return {AppConfig} Validated application configuration.
 */
export function loadConfig(cliArgs: string[] = process.argv.slice(2)): AppConfig {
    const cli = parseCliArgs(cliArgs);

    // Provider
    const rawProvider = (cli['provider'] || process.env.PROVIDER || 'github').toLowerCase().trim();
    if (rawProvider !== 'github' && rawProvider !== 'gitlab' && rawProvider !== 'combined') {
        throw new AppError(
            'CONFIG_INVALID',
            `Invalid PROVIDER "${rawProvider}". Supported values: github, gitlab, combined`
        );
    }
    const provider = rawProvider as ProviderType;

    // GitHub config (tokens NEVER read from CLI)
    const githubUsername =
        cli['github-username'] ||
        process.env.GITHUB_USERNAME ||
        (provider === 'github' ? process.env.USERNAME : undefined);
    const githubToken = process.env.GITHUB_TOKEN;

    // GitLab config (tokens NEVER read from CLI)
    const gitlabUsername = cli['gitlab-username'] || process.env.GITLAB_USERNAME;
    let gitlabBaseUrl = cli['gitlab-base-url'] || process.env.GITLAB_BASE_URL;
    if (gitlabBaseUrl) {
        gitlabBaseUrl = gitlabBaseUrl.trim().replace(/\/+$/, '');
    }
    const gitlabToken = process.env.GITLAB_TOKEN;
    const gitlabIncludePrivate = parseBool(cli['include-private'] || process.env.GITLAB_INCLUDE_PRIVATE);

    // Validate required credentials by provider
    if (provider === 'github' || provider === 'combined') {
        if (!githubUsername) {
            throw new AppError('CONFIG_INVALID', 'GITHUB_USERNAME is required when using github or combined provider');
        }
        if (!githubToken) {
            throw new AppError('CONFIG_INVALID', 'GITHUB_TOKEN is required when using github or combined provider');
        }
    }
    if (provider === 'gitlab' || provider === 'combined') {
        if (!gitlabUsername) {
            throw new AppError('CONFIG_INVALID', 'GITLAB_USERNAME is required when using gitlab or combined provider');
        }
        if (!gitlabToken) {
            throw new AppError('CONFIG_INVALID', 'GITLAB_TOKEN is required when using gitlab or combined provider');
        }
        if (!gitlabBaseUrl) {
            throw new AppError('CONFIG_INVALID', 'GITLAB_BASE_URL is required when using gitlab or combined provider');
        }
    }

    // UTC Offset
    const rawUtcOffset = cli['utc-offset'] ?? process.env.UTC_OFFSET ?? '0';
    const utcOffset = parseFloat(rawUtcOffset);
    if (isNaN(utcOffset) || utcOffset < -12 || utcOffset > 14) {
        throw new AppError('CONFIG_INVALID', `Invalid UTC_OFFSET "${rawUtcOffset}". Must be between -12 and 14.`);
    }

    // Theme
    const theme = (cli['theme'] || process.env.THEME || '').trim();
    if (theme && !ThemeMap.has(theme)) {
        throw new AppError('CONFIG_INVALID', `THEME "${theme}" does not exist. Check supported themes list.`);
    }

    // Animation & duration
    const animationRaw = (cli['animation'] || process.env.ANIMATION || '').trim();
    const animation = parseAnimation(animationRaw);
    const duration = (cli['duration'] || process.env.DURATION || '').trim() || undefined;

    // Display Name
    const displayName = (cli['display-name'] || process.env.DISPLAY_NAME || process.env.NAME || '').trim() || undefined;

    // Exclusions
    const excludeLanguagesRaw = cli['exclude-languages'] || process.env.EXCLUDE_LANGUAGES || process.env.EXCLUDE || '';
    const excludeLanguages = parseExcludeLanguages(excludeLanguagesRaw);

    const excludeProjectsRaw =
        cli['exclude-projects'] || process.env.EXCLUDE_PROJECTS || process.env.EXCLUDE_REPOS || '';
    const excludeProjects = excludeProjectsRaw
        .split(',')
        .map(p => p.trim().toLowerCase())
        .filter(p => p.length > 0);

    // Output Directory
    const outputDir = (cli['output-dir'] || process.env.OUTPUT_DIR || 'profile-summary-card-output').trim();

    // Time Range Days
    const timeRangeRaw = cli['time-range-days'] || process.env.TIME_RANGE_DAYS || '365';
    const timeRangeDays = parseInt(timeRangeRaw, 10);
    if (isNaN(timeRangeDays) || timeRangeDays < 1 || timeRangeDays > 366) {
        throw new AppError('CONFIG_INVALID', `Invalid TIME_RANGE_DAYS "${timeRangeRaw}". Must be between 1 and 366.`);
    }

    // Error handling & logging
    const failOnPartialError = parseBool(cli['fail-on-partial-error'] || process.env.FAIL_ON_PARTIAL_ERROR, false);
    const rawLogLevel = (process.env.LOG_LEVEL || 'info').toLowerCase().trim();
    const logLevel = (['error', 'warn', 'info', 'debug'].includes(rawLogLevel) ? rawLogLevel : 'info') as
        | 'error'
        | 'warn'
        | 'info'
        | 'debug';

    // Deduplication
    const rawDedupeMode = (process.env.DEDUPE_MODE || 'none').toLowerCase().trim();
    const dedupeMode = rawDedupeMode === 'repository-url' ? 'repository-url' : 'none';
    const rawDedupePrefer = (process.env.DEDUPE_PREFER || 'github').toLowerCase().trim();
    const dedupePrefer = rawDedupePrefer === 'gitlab' ? 'gitlab' : 'github';

    let dedupeMap: Record<string, string> = {};
    if (process.env.REPOSITORY_DEDUPE_MAP) {
        try {
            dedupeMap = JSON.parse(process.env.REPOSITORY_DEDUPE_MAP);
        } catch (err: any) {
            throw new AppError('CONFIG_INVALID', `Invalid JSON in REPOSITORY_DEDUPE_MAP: ${err.message}`);
        }
    }

    // Avatar source
    const rawAvatar = (process.env.PROFILE_AVATAR_SOURCE || 'github').toLowerCase().trim();
    const avatarSource = (['github', 'gitlab', 'none'].includes(rawAvatar) ? rawAvatar : 'github') as
        | 'github'
        | 'gitlab'
        | 'none';

    const allowInsecureHttp = parseBool(process.env.ALLOW_INSECURE_HTTP, false);
    const dryRun = parseBool(cli['dry-run'], false);

    return {
        provider,
        githubUsername,
        githubToken,
        gitlabUsername,
        gitlabBaseUrl,
        gitlabToken,
        gitlabIncludePrivate,
        utcOffset,
        theme: theme || undefined,
        animation,
        duration,
        displayName,
        excludeLanguages,
        excludeProjects,
        outputDir,
        timeRangeDays,
        failOnPartialError,
        logLevel,
        dedupeMode,
        dedupePrefer,
        dedupeMap,
        avatarSource,
        allowInsecureHttp,
        dryRun
    };
}
