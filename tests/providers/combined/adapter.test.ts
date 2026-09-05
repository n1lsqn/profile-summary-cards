import {CombinedProvider} from '../../../src/providers/combined/adapter';
import {GitHubProvider} from '../../../src/providers/github/adapter';
import {GitLabProvider} from '../../../src/providers/gitlab/adapter';
import {ProviderResult} from '../../../src/domain/types';

describe('CombinedProvider', () => {
    it('throws error when required options are missing', async () => {
        const provider = new CombinedProvider();
        await expect(provider.fetch({username: 'test'})).rejects.toThrow(/GITHUB_TOKEN is required/);
        await expect(provider.fetch({username: 'test', githubToken: 'gh-token'})).rejects.toThrow(
            /GITLAB_TOKEN is required/
        );
    });

    it('orchestrates GitHub and GitLab providers and merges their outputs', async () => {
        const mockGitHubResult: ProviderResult = {
            profile: {
                provider: 'github',
                username: 'user_gh',
                displayName: 'GH User',
                avatarUrl: null,
                profileUrl: null,
                createdAt: '2020-01-01T00:00:00Z',
                location: null,
                websiteUrl: null,
                publicRepositoryCount: 5,
                totalRepositoryCount: 5
            },
            stats: {
                commits: 100,
                contributions: 120,
                mergeRequestsOrPullRequests: 10,
                issues: 5,
                stars: 50,
                contributedTo: 3,
                isApiLimited: false
            },
            languagesByRepository: [
                {name: 'TypeScript', color: '#3178c6', repositoryCount: 5, committedChanges: null, percentage: 100}
            ],
            languagesByCommit: [
                {
                    name: 'TypeScript',
                    color: '#3178c6',
                    repositoryCount: 0,
                    committedChanges: 100,
                    percentage: 100,
                    isEstimated: false
                }
            ],
            activity: [{occurredAt: '2024-01-01T12:00:00Z', hourUtc: 12, count: 1, source: 'github'}],
            dailyContributions: [{date: '2024-01-01', count: 1, source: 'github'}],
            warnings: [],
            fetchedAt: '2024-01-02T00:00:00Z',
            hasEstimatedCommitLanguages: false
        };

        const mockGitLabResult: ProviderResult = {
            profile: {
                provider: 'gitlab',
                username: 'user_gl',
                displayName: 'GL User',
                avatarUrl: null,
                profileUrl: null,
                createdAt: '2021-01-01T00:00:00Z',
                location: null,
                websiteUrl: null,
                publicRepositoryCount: 3,
                totalRepositoryCount: 4
            },
            stats: {
                commits: 50,
                contributions: 60,
                mergeRequestsOrPullRequests: 5,
                issues: 2,
                stars: 10,
                contributedTo: 2,
                isApiLimited: true
            },
            languagesByRepository: [
                {name: 'Rust', color: '#dea584', repositoryCount: 3, committedChanges: null, percentage: 100}
            ],
            languagesByCommit: [
                {
                    name: 'Rust',
                    color: '#dea584',
                    repositoryCount: 0,
                    committedChanges: 50,
                    percentage: 100,
                    isEstimated: true
                }
            ],
            activity: [{occurredAt: '2024-01-01T15:00:00Z', hourUtc: 15, count: 1, source: 'gitlab'}],
            dailyContributions: [{date: '2024-01-01', count: 1, source: 'gitlab'}],
            warnings: ['GitLab limited'],
            fetchedAt: '2024-01-02T00:00:00Z',
            hasEstimatedCommitLanguages: true
        };

        const mockGhProvider = {
            fetch: jest.fn().mockResolvedValue(mockGitHubResult)
        } as unknown as GitHubProvider;

        const mockGlProvider = {
            fetch: jest.fn().mockResolvedValue(mockGitLabResult)
        } as unknown as GitLabProvider;

        const combined = new CombinedProvider(mockGhProvider, mockGlProvider);
        const result = await combined.fetch({
            username: 'user_gh',
            githubUsername: 'user_gh',
            githubToken: 'gh-token',
            gitlabUsername: 'user_gl',
            gitlabToken: 'gl-token',
            gitlabBaseUrl: 'https://gitlab.example.com'
        });

        expect(result.profile.provider).toBe('combined');
        expect(result.profile.githubUsername).toBe('user_gh');
        expect(result.profile.gitlabUsername).toBe('user_gl');
        expect(result.stats.commits).toBe(150);
        expect(result.stats.contributions).toBe(180);
        expect(result.stats.stars).toBe(60);
        expect(result.languagesByRepository).toHaveLength(2);
        expect(result.languagesByCommit).toHaveLength(2);
    });
});
