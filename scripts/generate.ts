import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import {loadConfig} from '../src/config/env';
import {AppError} from '../src/config/errors';
import {maskSecrets} from '../src/privacy/sanitize';
import {GitHubProvider} from '../src/providers/github/adapter';
import {GitLabProvider} from '../src/providers/gitlab/adapter';
import {CombinedProvider} from '../src/providers/combined/adapter';
import {ProviderResult} from '../src/domain/types';
import {writeAllUnifiedCards} from '../src/cards/unified-cards';
import {resolveThemeNames} from '../src/utils/card-generation';
import {setOutputPath, generatePreviewMarkdown} from '../src/utils/file-writer';

async function main() {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log(`
Unified Profile Summary Cards Generator

Usage:
  npm run generate -- [options]

Options:
  --provider <github|gitlab|combined>   Provider to use (default: github)
  --github-username <username>          GitHub username
  --gitlab-username <username>          GitLab username
  --gitlab-base-url <url>               GitLab instance URL (default: https://gitlab.com)
  --include-private                     Include private GitLab projects and stats
  --theme <theme_name>                  Pin specific theme (or generate all themes)
  --animation <animation_name>          Animation style (e.g. waving)
  --output-dir <path>                   Output directory (default: profile-summary-card-output)
  --time-range-days <days>              Days of history to analyze (default: 365)
  --utc-offset <hours>                  UTC offset in hours (default: 0)
  --dry-run                             Validate config and exit without making network requests
  --help, -h                            Show this help message

Environment Variables:
  GITHUB_TOKEN                          GitHub Personal Access Token (PAT)
  GITLAB_TOKEN                          GitLab Personal Access Token (PAT)
  GITHUB_USERNAME                       GitHub username
  GITLAB_USERNAME                       GitLab username
  GITLAB_BASE_URL                       GitLab base URL
`);
        process.exit(0);
    }

    let config;
    try {
        config = loadConfig();
    } catch (err: any) {
        if (err instanceof AppError) {
            console.error(`[CONFIG_INVALID] ${err.message}`);
            process.exit(err.exitCode);
        }
        console.error(`[CONFIG_INVALID] ${err.message}`);
        process.exit(2);
    }

    const secretsToMask = [config.githubToken, config.gitlabToken].filter(Boolean) as string[];

    console.info(`[INFO] Starting Unified Profile Summary Cards generation`);
    console.info(`[INFO] Provider: ${config.provider}`);
    console.info(`[INFO] Time Range: ${config.timeRangeDays} days`);
    console.info(`[INFO] UTC Offset: ${config.utcOffset}`);
    console.info(`[INFO] Theme: ${config.theme || 'all'}`);
    console.info(`[INFO] Animation: ${config.animation || 'none'}`);
    console.info(`[INFO] Output Dir: ${config.outputDir}`);

    if (config.dryRun) {
        console.info(`[INFO] Dry-run enabled. Configuration validated successfully. Exiting without fetching.`);
        process.exit(0);
    }

    // Configure file writer output directory
    setOutputPath(config.outputDir);

    let result: ProviderResult;
    try {
        if (config.provider === 'github') {
            const provider = new GitHubProvider();
            result = await provider.fetch({
                username: config.githubUsername!,
                token: config.githubToken,
                excludeLanguages: config.excludeLanguages,
                excludeProjects: config.excludeProjects,
                timeRangeDays: config.timeRangeDays
            });
        } else if (config.provider === 'gitlab') {
            const provider = new GitLabProvider();
            result = await provider.fetch({
                username: config.gitlabUsername!,
                token: config.gitlabToken,
                baseUrl: config.gitlabBaseUrl,
                includePrivate: config.gitlabIncludePrivate,
                excludeLanguages: config.excludeLanguages,
                excludeProjects: config.excludeProjects,
                timeRangeDays: config.timeRangeDays
            });
        } else {
            const provider = new CombinedProvider();
            result = await provider.fetch({
                username: config.githubUsername!,
                githubUsername: config.githubUsername,
                githubToken: config.githubToken,
                gitlabUsername: config.gitlabUsername,
                gitlabToken: config.gitlabToken,
                gitlabBaseUrl: config.gitlabBaseUrl,
                includePrivate: config.gitlabIncludePrivate,
                excludeLanguages: config.excludeLanguages,
                excludeProjects: config.excludeProjects,
                timeRangeDays: config.timeRangeDays,
                dedupe: {
                    mode: config.dedupeMode,
                    prefer: config.dedupePrefer,
                    map: config.dedupeMap
                },
                avatarSource: config.avatarSource,
                displayName: config.displayName
            });
        }
    } catch (err: any) {
        const safeMessage = maskSecrets(err.message || 'Unknown error', secretsToMask);
        if (err instanceof AppError) {
            console.error(`[${err.code}] ${safeMessage}`);
            process.exit(err.exitCode);
        }
        console.error(`[FETCH_FAILED] ${safeMessage}`);
        process.exit(1);
    }

    try {
        console.info(`[INFO] Rendering cards...`);
        writeAllUnifiedCards(result, config.utcOffset, {
            theme: config.theme,
            animation: config.animation,
            duration: config.duration,
            displayName: config.displayName
        });

        // Write metadata.json (No secret tokens, no emails, no private project names)
        const metadataPath = path.join(config.outputDir, 'metadata.json');
        const metadata = {
            provider: config.provider,
            generatedAt: new Date().toISOString(),
            timeRangeDays: config.timeRangeDays,
            themes: resolveThemeNames(config.theme),
            warnings: result.warnings
        };
        fs.mkdirSync(config.outputDir, {recursive: true});
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
        console.info(`[INFO] Wrote metadata to ${metadataPath}`);

        // Generate Theme Preview README.md
        generatePreviewMarkdown(false);
        console.info(`[INFO] Successfully generated cards and preview markdown in ${config.outputDir}`);
    } catch (err: any) {
        const safeMessage = maskSecrets(err.message || 'Render failed', secretsToMask);
        console.error(`[RENDER_FAILED] ${safeMessage}`);
        process.exit(9);
    }
}

main().catch(err => {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
});
