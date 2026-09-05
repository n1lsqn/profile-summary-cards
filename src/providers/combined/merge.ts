import {ProviderResult, LanguageStat, ActivityPoint, DailyContribution} from '../../domain/types';
import {languageColor} from '../../const/language-colors';

export interface DedupeConfig {
    mode?: 'none' | 'repository-url';
    prefer?: 'github' | 'gitlab';
    map?: Record<string, string>;
}

export interface MergeOptions {
    dedupe?: DedupeConfig;
    avatarSource?: 'github' | 'gitlab' | 'none';
    displayName?: string;
}

/**
 * Pure function to merge GitHub and GitLab ProviderResults into a combined ProviderResult.
 *
 * @param {ProviderResult} github - The GitHub provider result.
 * @param {ProviderResult} gitlab - The GitLab provider result.
 * @param {MergeOptions} [options] - Optional deduplication and presentation controls.
 * @return {ProviderResult} The merged ProviderResult.
 */
export function mergeProviderResults(
    github: ProviderResult,
    gitlab: ProviderResult,
    options: MergeOptions = {}
): ProviderResult {
    const dedupeMode = options.dedupe?.mode ?? 'none';
    const dedupePrefer = options.dedupe?.prefer ?? 'github';
    const dedupeMap = options.dedupe?.map ?? {};

    // 1. Merge Profile
    const avatarSource = options.avatarSource ?? (dedupePrefer === 'gitlab' ? 'gitlab' : 'github');
    let avatarUrl: string | null = null;
    if (avatarSource === 'github') {
        avatarUrl = github.profile.avatarUrl;
    } else if (avatarSource === 'gitlab') {
        avatarUrl = gitlab.profile.avatarUrl;
    }

    const displayName =
        options.displayName ||
        (dedupePrefer === 'gitlab'
            ? gitlab.profile.displayName || github.profile.displayName
            : github.profile.displayName || gitlab.profile.displayName) ||
        github.profile.username;

    const totalPublicRepos = (github.profile.publicRepositoryCount ?? 0) + (gitlab.profile.publicRepositoryCount ?? 0);
    const totalRepos = (github.profile.totalRepositoryCount ?? 0) + (gitlab.profile.totalRepositoryCount ?? 0);

    // 2. Merge Stats
    const commits = (github.stats.commits ?? 0) + (gitlab.stats.commits ?? 0);
    const contributions = (github.stats.contributions ?? 0) + (gitlab.stats.contributions ?? 0);
    const mergeRequestsOrPullRequests =
        (github.stats.mergeRequestsOrPullRequests ?? 0) + (gitlab.stats.mergeRequestsOrPullRequests ?? 0);
    const issues = (github.stats.issues ?? 0) + (gitlab.stats.issues ?? 0);
    const stars = (github.stats.stars ?? 0) + (gitlab.stats.stars ?? 0);
    let contributedTo = (github.stats.contributedTo ?? 0) + (gitlab.stats.contributedTo ?? 0);

    // Apply deduplication to contributedTo if dedupeMode is repository-url
    if (dedupeMode === 'repository-url' && Object.keys(dedupeMap).length > 0) {
        // Each mapped pair represents a mirror/duplicate repo
        const dupesCount = Object.keys(dedupeMap).length;
        contributedTo = Math.max(1, contributedTo - dupesCount);
    }

    // 3. Merge Repositories per Language
    const repoLangMap = new Map<string, {name: string; count: number; color: string}>();

    for (const item of github.languagesByRepository) {
        const key = item.name.toLowerCase();
        repoLangMap.set(key, {
            name: item.name,
            count: item.repositoryCount,
            color: item.color
        });
    }

    for (const item of gitlab.languagesByRepository) {
        const key = item.name.toLowerCase();
        const existing = repoLangMap.get(key);
        if (existing) {
            existing.count += item.repositoryCount;
        } else {
            repoLangMap.set(key, {
                name: item.name,
                count: item.repositoryCount,
                color: item.color || languageColor(item.name) || '#586e75'
            });
        }
    }

    let totalMergedRepos = 0;
    const mergedRepoLangs = Array.from(repoLangMap.values());
    for (const item of mergedRepoLangs) {
        totalMergedRepos += item.count;
    }
    mergedRepoLangs.sort((a, b) => b.count - a.count);

    const languagesByRepository: LanguageStat[] = mergedRepoLangs.map(item => ({
        name: item.name,
        color: item.color,
        repositoryCount: item.count,
        committedChanges: null,
        percentage: totalMergedRepos > 0 ? (item.count / totalMergedRepos) * 100 : 0
    }));

    // 4. Merge Languages by Commit
    const commitLangMap = new Map<string, {name: string; count: number; color: string}>();

    for (const item of github.languagesByCommit) {
        const key = item.name.toLowerCase();
        commitLangMap.set(key, {
            name: item.name,
            count: item.committedChanges ?? 0,
            color: item.color
        });
    }

    for (const item of gitlab.languagesByCommit) {
        const key = item.name.toLowerCase();
        const existing = commitLangMap.get(key);
        const count = item.committedChanges ?? 0;
        if (existing) {
            existing.count += count;
        } else {
            commitLangMap.set(key, {
                name: item.name,
                count,
                color: item.color || languageColor(item.name) || '#586e75'
            });
        }
    }

    let totalMergedCommits = 0;
    const mergedCommitLangs = Array.from(commitLangMap.values());
    for (const item of mergedCommitLangs) {
        totalMergedCommits += item.count;
    }
    mergedCommitLangs.sort((a, b) => b.count - a.count);

    const languagesByCommit: LanguageStat[] = mergedCommitLangs.map(item => ({
        name: item.name,
        color: item.color,
        repositoryCount: 0,
        committedChanges: item.count,
        percentage: totalMergedCommits > 0 ? (item.count / totalMergedCommits) * 100 : 0,
        isEstimated: true
    }));

    // 5. Merge Activity Points
    const activity: ActivityPoint[] = [...github.activity, ...gitlab.activity];
    activity.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

    // 6. Merge Daily Contributions
    const dailyMap = new Map<string, number>();
    for (const d of github.dailyContributions) {
        dailyMap.set(d.date, (dailyMap.get(d.date) || 0) + d.count);
    }
    for (const d of gitlab.dailyContributions) {
        dailyMap.set(d.date, (dailyMap.get(d.date) || 0) + d.count);
    }

    const dailyContributions: DailyContribution[] = Array.from(dailyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, count]) => ({
            date,
            count,
            source: 'github'
        }));

    // 7. Combine Warnings
    const warnings: string[] = [
        ...github.warnings,
        ...gitlab.warnings,
        'Combined stats include GitHub measured activity and GitLab activity'
    ];
    // Deduplicate warnings
    const uniqueWarnings = Array.from(new Set(warnings));

    return {
        profile: {
            provider: 'combined',
            username:
                github.profile.username === gitlab.profile.username
                    ? github.profile.username
                    : `${github.profile.username} & ${gitlab.profile.username}`,
            displayName,
            avatarUrl,
            profileUrl: null,
            createdAt:
                github.profile.createdAt && gitlab.profile.createdAt
                    ? new Date(github.profile.createdAt) < new Date(gitlab.profile.createdAt)
                        ? github.profile.createdAt
                        : gitlab.profile.createdAt
                    : github.profile.createdAt || gitlab.profile.createdAt,
            location: github.profile.location || gitlab.profile.location || null,
            websiteUrl: github.profile.websiteUrl || gitlab.profile.websiteUrl || null,
            publicRepositoryCount: totalPublicRepos,
            totalRepositoryCount: totalRepos,
            githubUsername: github.profile.username,
            gitlabUsername: gitlab.profile.username
        },
        stats: {
            commits,
            contributions,
            mergeRequestsOrPullRequests,
            issues,
            stars,
            contributedTo,
            isApiLimited: gitlab.stats.isApiLimited ?? true
        },
        languagesByRepository,
        languagesByCommit,
        activity,
        dailyContributions,
        warnings: uniqueWarnings,
        fetchedAt: new Date().toISOString(),
        hasEstimatedCommitLanguages: true
    };
}
