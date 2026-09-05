import {GitLabProvider} from '../../../src/providers/gitlab/adapter';
import {GitLabClient} from '../../../src/providers/gitlab/client';

describe('GitLabProvider Adapter', () => {
    it('throws error when token or baseUrl is missing', async () => {
        const provider = new GitLabProvider();
        await expect(provider.fetch({username: 'test', baseUrl: 'https://gitlab.com'})).rejects.toThrow(
            /GITLAB_TOKEN is required/
        );
        await expect(provider.fetch({username: 'test', token: 'token'})).rejects.toThrow(/GITLAB_BASE_URL is required/);
    });

    it('transforms GitLab data into normalized ProviderResult', async () => {
        const mockClient = {
            getUser: jest.fn().mockResolvedValue({
                id: 10,
                username: 'gitlabuser',
                name: 'GitLab User',
                avatar_url: 'https://gitlab.example.com/avatar.png',
                web_url: 'https://gitlab.example.com/gitlabuser',
                created_at: '2021-03-01T00:00:00Z',
                location: 'Tokyo, Japan',
                website_url: 'https://user.example'
            }),
            getProjects: jest.fn().mockResolvedValue([
                {
                    id: 101,
                    name: 'public-repo',
                    path_with_namespace: 'gitlabuser/public-repo',
                    visibility: 'public',
                    star_count: 25,
                    owner: {id: 10, username: 'gitlabuser'}
                },
                {
                    id: 102,
                    name: 'private-repo',
                    path_with_namespace: 'gitlabuser/private-repo',
                    visibility: 'private',
                    star_count: 50,
                    owner: {id: 10, username: 'gitlabuser'}
                }
            ]),
            getEvents: jest.fn().mockResolvedValue([
                {
                    id: 1001,
                    project_id: 101,
                    action_name: 'pushed to',
                    created_at: '2024-05-01T14:30:00Z',
                    push_data: {commit_count: 3}
                },
                {
                    id: 1002,
                    project_id: 102,
                    action_name: 'pushed to',
                    created_at: '2024-05-02T16:00:00Z',
                    push_data: {commit_count: 2}
                }
            ]),
            getMergeRequests: jest
                .fn()
                .mockResolvedValue([{id: 201, iid: 1, project_id: 101, created_at: '2024-05-03T10:00:00Z'}]),
            getIssues: jest
                .fn()
                .mockResolvedValue([{id: 301, iid: 1, project_id: 101, created_at: '2024-05-04T11:00:00Z'}]),
            getLanguages: jest.fn().mockImplementation((projectId: number) => {
                if (projectId === 101) {
                    return Promise.resolve({TypeScript: 70, Python: 30});
                }
                return Promise.resolve({Rust: 50, Go: 50});
            })
        } as unknown as GitLabClient;

        const provider = new GitLabProvider(mockClient);
        const result = await provider.fetch({
            username: 'gitlabuser',
            token: 'test-token',
            baseUrl: 'https://gitlab.example.com'
        });

        expect(result.profile.provider).toBe('gitlab');
        expect(result.profile.username).toBe('gitlabuser');
        expect(result.profile.displayName).toBe('GitLab User');
        expect(result.profile.publicRepositoryCount).toBe(1);
        expect(result.profile.totalRepositoryCount).toBe(2);

        // Stats: total commits = 3 + 2 = 5; MRs = 1; Issues = 1; total contributions = 7
        expect(result.stats.commits).toBe(5);
        expect(result.stats.mergeRequestsOrPullRequests).toBe(1);
        expect(result.stats.issues).toBe(1);
        expect(result.stats.contributions).toBe(7);
        // Only public project stars are counted (25, not 25+50)
        expect(result.stats.stars).toBe(25);
        expect(result.stats.isApiLimited).toBe(true);

        // Repositories per Language:
        // Project 101: TypeScript (70%) vs Python (30%) -> TypeScript
        // Project 102: Rust (50%) vs Go (50%) -> Go (alphabetical tie-break)
        expect(result.languagesByRepository).toHaveLength(2);
        const repoLangNames = result.languagesByRepository.map(l => l.name);
        expect(repoLangNames).toContain('TypeScript');
        expect(repoLangNames).toContain('Go');

        // Most Commit Languages:
        // Project 101 has 3 commits: TypeScript (70% of 3 = 2.1 ~ 2), Python (30% of 3 = 0.9 ~ 1)
        // Project 102 has 2 commits: Go (50% of 2 = 1), Rust (50% of 2 = 1)
        expect(result.languagesByCommit.length).toBeGreaterThan(0);
        expect(result.hasEstimatedCommitLanguages).toBe(true);

        // Activity points
        expect(result.activity).toHaveLength(2);
        expect(result.activity[0].hourUtc).toBe(14);
        expect(result.activity[1].hourUtc).toBe(16);
    });

    it('honors excluded languages and projects', async () => {
        const mockClient = {
            getUser: jest.fn().mockResolvedValue({
                id: 10,
                username: 'gitlabuser',
                name: 'User'
            }),
            getProjects: jest.fn().mockResolvedValue([
                {
                    id: 101,
                    name: 'proj1',
                    path_with_namespace: 'gitlabuser/proj1',
                    visibility: 'public'
                }
            ]),
            getEvents: jest.fn().mockResolvedValue([]),
            getMergeRequests: jest.fn().mockResolvedValue([]),
            getIssues: jest.fn().mockResolvedValue([]),
            getLanguages: jest.fn().mockResolvedValue({HTML: 60, TypeScript: 40})
        } as unknown as GitLabClient;

        const provider = new GitLabProvider(mockClient);
        const result = await provider.fetch({
            username: 'gitlabuser',
            token: 'test-token',
            baseUrl: 'https://gitlab.example.com',
            excludeLanguages: ['html']
        });

        // HTML excluded, so TypeScript becomes primary language
        expect(result.languagesByRepository).toHaveLength(1);
        expect(result.languagesByRepository[0].name).toBe('TypeScript');
    });
});
