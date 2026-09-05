import {GitLabClient} from '../../../src/providers/gitlab/client';
import {AppError} from '../../../src/config/errors';
import MockAdapter from 'axios-mock-adapter';

describe('GitLabClient', () => {
    describe('constructor & validation', () => {
        it('throws CONFIG_INVALID if baseUrl is missing', () => {
            expect(() => new GitLabClient({baseUrl: '', token: 'pat123'})).toThrow(AppError);
        });

        it('throws CONFIG_INVALID if token is missing', () => {
            expect(() => new GitLabClient({baseUrl: 'https://gitlab.com', token: ''})).toThrow(AppError);
        });

        it('throws CONFIG_INVALID if insecure http is used on non-local host without flag', () => {
            expect(() => new GitLabClient({baseUrl: 'http://gitlab.example.com', token: 'pat123'})).toThrow(
                /must use HTTPS/
            );
        });

        it('allows http on localhost or 127.0.0.1', () => {
            expect(() => new GitLabClient({baseUrl: 'http://localhost:8080', token: 'pat123'})).not.toThrow();
            expect(() => new GitLabClient({baseUrl: 'http://127.0.0.1:8080', token: 'pat123'})).not.toThrow();
        });

        it('allows http when allowInsecureHttp is true', () => {
            expect(
                () => new GitLabClient({baseUrl: 'http://gitlab.example.com', token: 'pat123', allowInsecureHttp: true})
            ).not.toThrow();
        });

        it('normalizes trailing slashes and redundant /api/v4 in baseUrl', () => {
            const client = new GitLabClient({
                baseUrl: 'https://gitlab.example.com/api/v4///',
                token: 'pat123'
            });
            expect((client as any).apiBaseUrl).toBe('https://gitlab.example.com/api/v4');
        });
    });

    describe('API operations with mock adapter', () => {
        let client: GitLabClient;
        let mock: MockAdapter;

        beforeEach(() => {
            client = new GitLabClient({
                baseUrl: 'https://gitlab.example.com',
                token: 'test-token',
                timeoutMs: 1000,
                maxRetries: 1
            });
            mock = new MockAdapter((client as any).axiosInstance);
        });

        afterEach(() => {
            mock.restore();
        });

        it('getUser finds exact username match', async () => {
            mock.onGet('/users', {params: {username: 'n1lsqn'}}).reply(200, [
                {id: 99, username: 'other_user', name: 'Other'},
                {id: 101, username: 'n1lsqn', name: 'Casper N1L', state: 'active'}
            ]);

            const user = await client.getUser('n1lsqn');
            expect(user.id).toBe(101);
            expect(user.username).toBe('n1lsqn');
        });

        it('getUser throws USER_NOT_FOUND when user does not exist', async () => {
            mock.onGet('/users', {params: {username: 'unknown'}}).reply(200, []);
            await expect(client.getUser('unknown')).rejects.toThrow(AppError);
        });

        it('handles 401 with AUTH_FAILED', async () => {
            mock.onGet('/users').reply(401);
            await expect(client.getUser('test')).rejects.toThrow(AppError);
            try {
                await client.getUser('test');
            } catch (err: any) {
                expect(err.code).toBe('AUTH_FAILED');
            }
        });

        it('handles 403 with PERMISSION_DENIED', async () => {
            mock.onGet('/users').reply(403);
            await expect(client.getUser('test')).rejects.toThrow(AppError);
            try {
                await client.getUser('test');
            } catch (err: any) {
                expect(err.code).toBe('PERMISSION_DENIED');
            }
        });

        it('retries on 429 and eventually throws RATE_LIMITED if retries exhausted', async () => {
            mock.onGet('/users').reply(429, {}, {'retry-after': '0'});
            await expect(client.getUser('test')).rejects.toThrow(AppError);
            try {
                await client.getUser('test');
            } catch (err: any) {
                expect(err.code).toBe('RATE_LIMITED');
            }
        });

        it('memoizes languages responses for the same project', async () => {
            mock.onGet('/projects/42/languages').reply(200, {TypeScript: 80, JavaScript: 20});

            const lang1 = await client.getLanguages(42);
            const lang2 = await client.getLanguages(42);

            expect(lang1).toEqual({TypeScript: 80, JavaScript: 20});
            expect(lang2).toEqual({TypeScript: 80, JavaScript: 20});
            expect(mock.history.get.filter(req => req.url === '/projects/42/languages').length).toBe(1);
        });
    });
});
