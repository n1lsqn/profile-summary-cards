import {mergeProviderResults} from '../../../src/providers/combined/merge';
import {ProviderResult} from '../../../src/domain/types';

describe('mergeProviderResults', () => {
    const mockGitHub: ProviderResult = {
        profile: {
            provider: 'github',
            username: 'casper_gh',
            displayName: 'Casper GitHub',
            avatarUrl: 'https://avatars.githubusercontent.com/u/1',
            profileUrl: 'https://github.com/casper_gh',
            createdAt: '2016-01-01T00:00:00Z',
            location: 'Taipei',
            websiteUrl: 'https://casper.tw',
            publicRepositoryCount: 20,
            totalRepositoryCount: 20
        },
        stats: {
            commits: 1000,
            contributions: 1200,
            mergeRequestsOrPullRequests: 50,
            issues: 30,
            stars: 200,
            contributedTo: 10,
            isApiLimited: false
        },
        languagesByRepository: [
            {name: 'TypeScript', color: '#3178c6', repositoryCount: 12, committedChanges: null, percentage: 60},
            {name: 'JavaScript', color: '#f1e05a', repositoryCount: 8, committedChanges: null, percentage: 40}
        ],
        languagesByCommit: [
            {
                name: 'TypeScript',
                color: '#3178c6',
                repositoryCount: 0,
                committedChanges: 600,
                percentage: 60,
                isEstimated: false
            },
            {
                name: 'JavaScript',
                color: '#f1e05a',
                repositoryCount: 0,
                committedChanges: 400,
                percentage: 40,
                isEstimated: false
            }
        ],
        activity: [{occurredAt: '2024-01-01T10:00:00Z', hourUtc: 10, count: 2, source: 'github'}],
        dailyContributions: [{date: '2024-01-01', count: 5, source: 'github'}],
        warnings: [],
        fetchedAt: '2024-01-02T00:00:00Z',
        hasEstimatedCommitLanguages: false
    };

    const mockGitLab: ProviderResult = {
        profile: {
            provider: 'gitlab',
            username: 'casper_gl',
            displayName: 'Casper GitLab',
            avatarUrl: 'https://gitlab.example.com/uploads/avatar.png',
            profileUrl: 'https://gitlab.example.com/casper_gl',
            createdAt: '2018-05-01T00:00:00Z',
            location: 'Tokyo',
            websiteUrl: 'https://gitlab.example.com',
            publicRepositoryCount: 10,
            totalRepositoryCount: 15
        },
        stats: {
            commits: 500,
            contributions: 600,
            mergeRequestsOrPullRequests: 40,
            issues: 20,
            stars: 50,
            contributedTo: 5,
            isApiLimited: true
        },
        languagesByRepository: [
            {name: 'typescript', color: '#3178c6', repositoryCount: 4, committedChanges: null, percentage: 40},
            {name: 'Rust', color: '#dea584', repositoryCount: 6, committedChanges: null, percentage: 60}
        ],
        languagesByCommit: [
            {
                name: 'typescript',
                color: '#3178c6',
                repositoryCount: 0,
                committedChanges: 200,
                percentage: 40,
                isEstimated: true
            },
            {
                name: 'Rust',
                color: '#dea584',
                repositoryCount: 0,
                committedChanges: 300,
                percentage: 60,
                isEstimated: true
            }
        ],
        activity: [{occurredAt: '2024-01-01T15:00:00Z', hourUtc: 15, count: 3, source: 'gitlab'}],
        dailyContributions: [{date: '2024-01-01', count: 3, source: 'gitlab'}],
        warnings: ['GitLab limited'],
        fetchedAt: '2024-01-02T00:00:00Z',
        hasEstimatedCommitLanguages: true
    };

    it('merges counts and stats from both providers', () => {
        const merged = mergeProviderResults(mockGitHub, mockGitLab);

        expect(merged.profile.provider).toBe('combined');
        expect(merged.profile.publicRepositoryCount).toBe(30);
        expect(merged.profile.totalRepositoryCount).toBe(35);
        expect(merged.profile.githubUsername).toBe('casper_gh');
        expect(merged.profile.gitlabUsername).toBe('casper_gl');
        expect(merged.profile.createdAt).toBe('2016-01-01T00:00:00Z'); // earlier date

        expect(merged.stats.commits).toBe(1500);
        expect(merged.stats.contributions).toBe(1800);
        expect(merged.stats.mergeRequestsOrPullRequests).toBe(90);
        expect(merged.stats.issues).toBe(50);
        expect(merged.stats.stars).toBe(250);
        expect(merged.stats.contributedTo).toBe(15);
    });

    it('merges and dedupes languages case-insensitively', () => {
        const merged = mergeProviderResults(mockGitHub, mockGitLab);

        // Repos: TypeScript = 12 + 4 = 16; JavaScript = 8; Rust = 6 (Total: 30)
        expect(merged.languagesByRepository).toHaveLength(3);
        const tsRepo = merged.languagesByRepository.find(l => l.name.toLowerCase() === 'typescript');
        expect(tsRepo?.repositoryCount).toBe(16);

        // Commits: TypeScript = 600 + 200 = 800; JavaScript = 400; Rust = 300 (Total: 1500)
        expect(merged.languagesByCommit).toHaveLength(3);
        const tsCommit = merged.languagesByCommit.find(l => l.name.toLowerCase() === 'typescript');
        expect(tsCommit?.committedChanges).toBe(800);
        expect(merged.hasEstimatedCommitLanguages).toBe(true);
    });

    it('combines activity points and daily contributions', () => {
        const merged = mergeProviderResults(mockGitHub, mockGitLab);

        expect(merged.activity).toHaveLength(2);
        expect(merged.dailyContributions).toHaveLength(1);
        expect(merged.dailyContributions[0].date).toBe('2024-01-01');
        expect(merged.dailyContributions[0].count).toBe(8); // 5 + 3
    });

    it('applies repository deduplication when specified', () => {
        const merged = mergeProviderResults(mockGitHub, mockGitLab, {
            dedupe: {
                mode: 'repository-url',
                map: {'casper/my-project': 'casper/my-project-mirror'}
            }
        });
        // 10 + 5 - 1 = 14
        expect(merged.stats.contributedTo).toBe(14);
    });
});
