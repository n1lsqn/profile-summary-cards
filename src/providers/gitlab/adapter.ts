import {Provider, ProviderFetchOptions} from '../types';
import {ProviderResult, LanguageStat, ActivityPoint, DailyContribution} from '../../domain/types';
import {GitLabClient} from './client';
import {languageColor} from '../../const/language-colors';

/**
 * Adapter implementing the Provider interface for GitLab.com and self-hosted GitLab instances.
 */
export class GitLabProvider implements Provider {
    readonly name = 'gitlab' as const;
    private client: GitLabClient | null;

    /**
     * Creates an instance of GitLabProvider.
     *
     * @param {GitLabClient} [client] - Optional preconfigured GitLabClient.
     */
    constructor(client?: GitLabClient) {
        this.client = client ?? null;
    }

    /**
     * Fetches user profile, repository, activity, and language statistics from GitLab.
     *
     * @param {ProviderFetchOptions} options - The fetch parameters.
     * @return {Promise<ProviderResult>} Normalized provider result.
     */
    async fetch(options: ProviderFetchOptions): Promise<ProviderResult> {
        if (!options.token) {
            throw new Error('GITLAB_TOKEN is required for GitLab provider');
        }
        if (!options.baseUrl) {
            throw new Error('GITLAB_BASE_URL is required for GitLab provider');
        }

        const client =
            this.client ??
            new GitLabClient({
                baseUrl: options.baseUrl,
                token: options.token
            });

        const timeRangeDays = options.timeRangeDays ?? 365;
        const sinceDate = new Date();
        sinceDate.setUTCDate(sinceDate.getUTCDate() - timeRangeDays);
        const sinceIso = sinceDate.toISOString();

        // 1. Identify user
        const user = await client.getUser(options.username);

        // 2. Fetch projects
        const projects = await client.getProjects(
            user.id,
            options.includePrivate ?? false,
            options.excludeProjects ?? []
        );

        // 3. Fetch events (commits & activity)
        const events = await client.getEvents(user.id, sinceIso);

        // 4. Fetch MRs and Issues
        const [mergeRequests, issues] = await Promise.all([
            client.getMergeRequests(user.id, sinceIso),
            client.getIssues(user.id, sinceIso)
        ]);

        // Process Push events
        const projectPushCommits = new Map<number, number>();
        let totalCommits = 0;
        const activity: ActivityPoint[] = [];
        const dailyCounts = new Map<string, number>();
        const contributedProjects = new Set<number>();

        for (const ev of events) {
            if (ev.project_id) {
                contributedProjects.add(ev.project_id);
            }
            const dateStr = ev.created_at.slice(0, 10);

            // Determine if push event
            const isPush =
                Boolean(ev.push_data) ||
                (ev.action_name && (ev.action_name.includes('pushed') || ev.action_name === 'pushed to'));

            if (isPush) {
                const commitCount =
                    ev.push_data?.commit_count && ev.push_data.commit_count > 0 ? ev.push_data.commit_count : 1;
                totalCommits += commitCount;

                if (ev.project_id) {
                    projectPushCommits.set(ev.project_id, (projectPushCommits.get(ev.project_id) || 0) + commitCount);
                }

                // Push activity point
                const d = new Date(ev.created_at);
                activity.push({
                    occurredAt: ev.created_at,
                    hourUtc: d.getUTCHours(),
                    count: commitCount,
                    source: 'gitlab'
                });

                dailyCounts.set(dateStr, (dailyCounts.get(dateStr) || 0) + commitCount);
            }
        }

        // Add MRs and Issues to contributions & contributed projects
        for (const mr of mergeRequests) {
            contributedProjects.add(mr.project_id);
            const dateStr = mr.created_at.slice(0, 10);
            dailyCounts.set(dateStr, (dailyCounts.get(dateStr) || 0) + 1);
        }
        for (const issue of issues) {
            contributedProjects.add(issue.project_id);
            const dateStr = issue.created_at.slice(0, 10);
            dailyCounts.set(dateStr, (dailyCounts.get(dateStr) || 0) + 1);
        }

        const totalContributions = totalCommits + mergeRequests.length + issues.length;

        // Daily contributions sorted by date
        const dailyContributions: DailyContribution[] = Array.from(dailyCounts.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, count]) => ({
                date,
                count,
                source: 'gitlab'
            }));

        // Calculate stars for user-owned public projects
        let totalStars = 0;
        for (const p of projects) {
            if (p.visibility === 'public') {
                const isOwned = p.owner?.id === user.id || p.namespace?.path === user.username;
                if (isOwned) {
                    totalStars += p.star_count || 0;
                }
            }
        }

        // Language aggregation
        const excludeLanguagesSet = new Set((options.excludeLanguages || []).map(l => l.toLowerCase().trim()));

        const repoLanguageCounts = new Map<string, number>();
        const commitLanguageWeights = new Map<string, number>();

        for (const project of projects) {
            const rawLangs = await client.getLanguages(project.id);
            const filteredLangs: Record<string, number> = {};

            for (const [name, pct] of Object.entries(rawLangs)) {
                if (!excludeLanguagesSet.has(name.toLowerCase())) {
                    filteredLangs[name] = pct;
                }
            }

            const langKeys = Object.keys(filteredLangs);
            if (langKeys.length === 0) continue;

            // Primary language for project (highest percentage, alphabetical tie-break)
            langKeys.sort((a, b) => {
                const diff = filteredLangs[b] - filteredLangs[a];
                if (Math.abs(diff) > 0.001) return diff;
                return a.localeCompare(b);
            });
            const primary = langKeys[0];
            repoLanguageCounts.set(primary, (repoLanguageCounts.get(primary) || 0) + 1);

            // Commit language estimation: distribute project's push commits by language ratio
            const pushCommits = projectPushCommits.get(project.id) || 0;
            if (pushCommits > 0) {
                const totalPct = Object.values(filteredLangs).reduce((acc, v) => acc + v, 0);
                if (totalPct > 0) {
                    for (const [name, pct] of Object.entries(filteredLangs)) {
                        const allocated = pushCommits * (pct / totalPct);
                        commitLanguageWeights.set(name, (commitLanguageWeights.get(name) || 0) + allocated);
                    }
                }
            }
        }

        // Format languages by repository
        let totalReposWithLang = 0;
        const repoLangList: {name: string; count: number}[] = [];
        for (const [name, count] of repoLanguageCounts.entries()) {
            repoLangList.push({name, count});
            totalReposWithLang += count;
        }
        repoLangList.sort((a, b) => b.count - a.count);

        const languagesByRepository: LanguageStat[] = repoLangList.map(item => ({
            name: item.name,
            color: languageColor(item.name) || '#586e75',
            repositoryCount: item.count,
            committedChanges: null,
            percentage: totalReposWithLang > 0 ? (item.count / totalReposWithLang) * 100 : 0
        }));

        // Format languages by commit
        let totalEstimatedCommits = 0;
        const commitLangList: {name: string; count: number}[] = [];
        for (const [name, weight] of commitLanguageWeights.entries()) {
            const rounded = Math.round(weight);
            if (rounded > 0) {
                commitLangList.push({name, count: rounded});
                totalEstimatedCommits += rounded;
            }
        }
        commitLangList.sort((a, b) => b.count - a.count);

        const languagesByCommit: LanguageStat[] = commitLangList.map(item => ({
            name: item.name,
            color: languageColor(item.name) || '#586e75',
            repositoryCount: 0,
            committedChanges: item.count,
            percentage: totalEstimatedCommits > 0 ? (item.count / totalEstimatedCommits) * 100 : 0,
            isEstimated: true
        }));

        const publicProjects = projects.filter(p => p.visibility === 'public');

        return {
            profile: {
                provider: 'gitlab',
                username: user.username,
                displayName: user.name || null,
                avatarUrl: user.avatar_url,
                profileUrl: user.web_url,
                createdAt: user.created_at,
                location: user.location || null,
                websiteUrl: user.website_url || null,
                publicRepositoryCount: publicProjects.length,
                totalRepositoryCount: projects.length
            },
            stats: {
                commits: totalCommits,
                contributions: totalContributions,
                mergeRequestsOrPullRequests: mergeRequests.length,
                issues: issues.length,
                stars: totalStars,
                contributedTo: contributedProjects.size,
                isApiLimited: true
            },
            languagesByRepository,
            languagesByCommit,
            activity,
            dailyContributions,
            warnings: [
                'GitLab activity is API-limited (events within last 365 days)',
                'Most commit languages estimated from project language ratios'
            ],
            fetchedAt: new Date().toISOString(),
            hasEstimatedCommitLanguages: true
        };
    }
}
