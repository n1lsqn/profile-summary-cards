import {Provider, ProviderFetchOptions} from '../types';
import {ProviderResult, LanguageStat, ActivityPoint, DailyContribution} from '../../domain/types';
import {GitHubClient} from './client';

export class GitHubProvider implements Provider {
    readonly name = 'github' as const;
    private client: GitHubClient;

    constructor(client: GitHubClient = new GitHubClient()) {
        this.client = client;
    }

    async fetch(options: ProviderFetchOptions): Promise<ProviderResult> {
        if (!options.token) {
            throw new Error('GITHUB_TOKEN is required for GitHub provider');
        }

        const raw = await this.client.fetchUserData(
            options.username,
            options.token,
            options.excludeLanguages ?? [],
            options.excludeProjects ?? []
        );

        // Map languages by repo
        let totalRepoLangs = 0;
        const repoLangEntries: {name: string; count: number; color: string}[] = [];
        for (const [name, val] of raw.repoLanguages.getLanguageMap()) {
            repoLangEntries.push({name, count: val.count, color: val.color});
            totalRepoLangs += val.count;
        }
        repoLangEntries.sort((a, b) => b.count - a.count);
        const languagesByRepository: LanguageStat[] = repoLangEntries.map(entry => ({
            name: entry.name,
            color: entry.color,
            repositoryCount: entry.count,
            committedChanges: null,
            percentage: totalRepoLangs > 0 ? (entry.count / totalRepoLangs) * 100 : 0
        }));

        // Map languages by commit
        let totalCommitLangs = 0;
        const commitLangEntries: {name: string; count: number; color: string}[] = [];
        for (const [name, val] of raw.commitLanguages.getLanguageMap()) {
            commitLangEntries.push({name, count: val.count, color: val.color});
            totalCommitLangs += val.count;
        }
        commitLangEntries.sort((a, b) => b.count - a.count);
        const languagesByCommit: LanguageStat[] = commitLangEntries.map(entry => ({
            name: entry.name,
            color: entry.color,
            repositoryCount: 0,
            committedChanges: entry.count,
            percentage: totalCommitLangs > 0 ? (entry.count / totalCommitLangs) * 100 : 0,
            isEstimated: false
        }));

        // Map activity points
        const activity: ActivityPoint[] = raw.productiveTime.productiveDate.map((date: Date) => {
            const d = date instanceof Date ? date : new Date(date);
            return {
                occurredAt: d.toISOString(),
                hourUtc: d.getUTCHours(),
                count: 1,
                source: 'github'
            };
        });

        // Map daily contributions
        const dailyContributions: DailyContribution[] = raw.profileDetails.contributions.map(item => {
            const dateStr =
                item.date instanceof Date ? item.date.toISOString().slice(0, 10) : String(item.date).slice(0, 10);
            return {
                date: dateStr,
                count: item.contributionCount,
                source: 'github'
            };
        });

        return {
            profile: {
                provider: 'github',
                username: options.username,
                displayName: raw.profileDetails.name || null,
                avatarUrl: null,
                profileUrl: `https://github.com/${options.username}`,
                createdAt: raw.profileDetails.createdAt || null,
                location: raw.profileDetails.location || null,
                websiteUrl: raw.profileDetails.websiteUrl || null,
                publicRepositoryCount: raw.profileDetails.totalPublicRepos,
                totalRepositoryCount: raw.profileDetails.totalPublicRepos
            },
            stats: {
                commits: raw.totalCommitContributions,
                contributions: raw.totalContributions,
                mergeRequestsOrPullRequests: raw.profileDetails.totalPullRequestContributions,
                issues: raw.profileDetails.totalIssueContributions,
                stars: raw.profileDetails.totalStars,
                contributedTo: raw.profileDetails.totalRepositoryContributions,
                isApiLimited: false
            },
            languagesByRepository,
            languagesByCommit,
            activity,
            dailyContributions,
            warnings: [],
            fetchedAt: new Date().toISOString(),
            hasEstimatedCommitLanguages: false
        };
    }
}
