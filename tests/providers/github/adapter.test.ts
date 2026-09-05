import {GitHubProvider} from '../../../src/providers/github/adapter';
import {GitHubClient, GitHubRawData} from '../../../src/providers/github/client';
import {ProfileDetails} from '../../../src/github-api/profile-details';
import {RepoLanguages} from '../../../src/github-api/repos-per-language';
import {CommitLanguages} from '../../../src/github-api/commits-per-language';

describe('GitHubProvider', () => {
    it('throws error when token is missing', async () => {
        const provider = new GitHubProvider();
        await expect(provider.fetch({username: 'test'})).rejects.toThrow('GITHUB_TOKEN is required');
    });

    it('fetches and transforms raw data into Unified domain model', async () => {
        const mockRawData: GitHubRawData = {
            profileDetails: {
                id: 123,
                name: 'Octocat',
                email: 'octo@github.com',
                createdAt: '2020-01-01T00:00:00Z',
                company: 'GitHub',
                websiteUrl: 'https://octo.cat',
                twitterUsername: 'octocat',
                location: 'San Francisco',
                totalPublicRepos: 10,
                totalStars: 50,
                totalIssueContributions: 15,
                totalPullRequestContributions: 25,
                totalRepositoryContributions: 8,
                contributions: [
                    {date: new Date('2024-01-01'), contributionCount: 4},
                    {date: new Date('2024-01-02'), contributionCount: 6}
                ],
                contributionYears: [2024]
            } as ProfileDetails,
            totalContributions: 100,
            totalCommitContributions: 80,
            repoLanguages: {
                getLanguageMap: () =>
                    new Map([
                        ['TypeScript', {count: 8, color: '#3178c6'}],
                        ['JavaScript', {count: 2, color: '#f1e05a'}]
                    ])
            } as RepoLanguages,
            commitLanguages: {
                getLanguageMap: () =>
                    new Map([
                        ['TypeScript', {count: 80, color: '#3178c6'}],
                        ['JavaScript', {count: 20, color: '#f1e05a'}]
                    ])
            } as CommitLanguages,
            productiveTime: {
                productiveDate: [new Date('2024-01-01T12:00:00Z'), new Date('2024-01-01T13:00:00Z')]
            } as any
        };

        const mockClient = {
            fetchUserData: jest.fn().mockResolvedValue(mockRawData)
        } as unknown as GitHubClient;

        const provider = new GitHubProvider(mockClient);
        const result = await provider.fetch({username: 'octocat', token: 'token123'});

        expect(result.profile.provider).toBe('github');
        expect(result.profile.username).toBe('octocat');
        expect(result.profile.displayName).toBe('Octocat');
        expect(result.stats.commits).toBe(80);
        expect(result.stats.contributions).toBe(100);
        expect(result.stats.stars).toBe(50);
        expect(result.stats.mergeRequestsOrPullRequests).toBe(25);
        expect(result.stats.issues).toBe(15);
        expect(result.stats.contributedTo).toBe(8);

        expect(result.languagesByRepository).toHaveLength(2);
        expect(result.languagesByRepository[0].name).toBe('TypeScript');
        expect(result.languagesByRepository[0].percentage).toBe(80);

        expect(result.languagesByCommit).toHaveLength(2);
        expect(result.languagesByCommit[0].name).toBe('TypeScript');
        expect(result.languagesByCommit[0].percentage).toBe(80);

        expect(result.activity).toHaveLength(2);
        expect(result.activity[0].hourUtc).toBe(12);
        expect(result.activity[1].hourUtc).toBe(13);

        expect(result.dailyContributions).toHaveLength(2);
        expect(result.dailyContributions[0].date).toBe('2024-01-01');
        expect(result.dailyContributions[0].count).toBe(4);
    });
});
