import {Provider, ProviderFetchOptions} from '../types';
import {ProviderResult} from '../../domain/types';
import {GitHubProvider} from '../github/adapter';
import {GitLabProvider} from '../gitlab/adapter';
import {mergeProviderResults, DedupeConfig} from './merge';

export interface CombinedFetchOptions extends ProviderFetchOptions {
    githubUsername?: string;
    githubToken?: string;
    gitlabUsername?: string;
    gitlabToken?: string;
    gitlabBaseUrl?: string;
    dedupe?: DedupeConfig;
    avatarSource?: 'github' | 'gitlab' | 'none';
    displayName?: string;
}

/**
 * Adapter implementing the Provider interface for combined GitHub + GitLab metrics.
 */
export class CombinedProvider implements Provider {
    readonly name = 'combined' as const;
    private githubProvider: GitHubProvider;
    private gitlabProvider: GitLabProvider;

    /**
     * Creates an instance of CombinedProvider.
     *
     * @param {GitHubProvider} [githubProvider] - Optional GitHub provider instance.
     * @param {GitLabProvider} [gitlabProvider] - Optional GitLab provider instance.
     */
    constructor(githubProvider?: GitHubProvider, gitlabProvider?: GitLabProvider) {
        this.githubProvider = githubProvider ?? new GitHubProvider();
        this.gitlabProvider = gitlabProvider ?? new GitLabProvider();
    }

    /**
     * Fetches statistics from both GitHub and GitLab, then merges them.
     *
     * @param {CombinedFetchOptions} options - The fetch parameters.
     * @return {Promise<ProviderResult>} Normalized and merged results.
     */
    async fetch(options: CombinedFetchOptions): Promise<ProviderResult> {
        const ghUser = options.githubUsername || options.username;
        const glUser = options.gitlabUsername || options.username;

        if (!ghUser) {
            throw new Error('GITHUB_USERNAME is required for combined provider');
        }
        if (!options.githubToken && !options.token) {
            throw new Error('GITHUB_TOKEN is required for combined provider');
        }
        if (!glUser) {
            throw new Error('GITLAB_USERNAME is required for combined provider');
        }
        if (!options.gitlabToken) {
            throw new Error('GITLAB_TOKEN is required for combined provider');
        }
        if (!options.gitlabBaseUrl && !options.baseUrl) {
            throw new Error('GITLAB_BASE_URL is required for combined provider');
        }

        const [ghResult, glResult] = await Promise.all([
            this.githubProvider.fetch({
                username: ghUser,
                token: options.githubToken || options.token,
                excludeLanguages: options.excludeLanguages,
                excludeProjects: options.excludeProjects,
                timeRangeDays: options.timeRangeDays
            }),
            this.gitlabProvider.fetch({
                username: glUser,
                token: options.gitlabToken,
                baseUrl: options.gitlabBaseUrl || options.baseUrl,
                includePrivate: options.includePrivate,
                excludeLanguages: options.excludeLanguages,
                excludeProjects: options.excludeProjects,
                timeRangeDays: options.timeRangeDays
            })
        ]);

        return mergeProviderResults(ghResult, glResult, {
            dedupe: options.dedupe,
            avatarSource: options.avatarSource,
            displayName: options.displayName
        });
    }
}
