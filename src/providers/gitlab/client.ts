import axios, {AxiosInstance, AxiosRequestConfig, AxiosResponse} from 'axios';
import {AppError} from '../../config/errors';
import {sanitizeUrl, maskSecrets} from '../../privacy/sanitize';
import {getNextPageFromHeaders, DEFAULT_MAX_PAGES} from './pagination';
import {
    GitLabUser,
    GitLabProject,
    GitLabEvent,
    GitLabMergeRequest,
    GitLabIssue,
    GitLabLanguagesResponse
} from './types';

export interface GitLabClientConfig {
    baseUrl: string;
    token: string;
    allowInsecureHttp?: boolean;
    maxConcurrency?: number;
    timeoutMs?: number;
    maxRetries?: number;
}

/**
 * Client for interacting with the GitLab REST API v4.
 */
export class GitLabClient {
    private readonly baseUrl: string;
    private readonly apiBaseUrl: string;
    private readonly token: string;
    private readonly maxConcurrency: number;
    private readonly timeoutMs: number;
    private readonly maxRetries: number;
    private readonly axiosInstance: AxiosInstance;
    private activeRequests = 0;
    private readonly requestQueue: (() => void)[] = [];
    private readonly languagesCache: Map<number, GitLabLanguagesResponse> = new Map();

    /**
     * Creates an instance of GitLabClient.
     *
     * @param {GitLabClientConfig} config - The configuration options.
     */
    constructor(config: GitLabClientConfig) {
        if (!config.baseUrl) {
            throw new AppError('CONFIG_INVALID', 'GitLab BASE_URL is required');
        }
        if (!config.token) {
            throw new AppError('CONFIG_INVALID', 'GitLab TOKEN is required');
        }

        // Normalize base URL
        let normalized = config.baseUrl.trim();
        while (normalized.endsWith('/')) {
            normalized = normalized.slice(0, -1);
        }
        // Strip /api/v4 if user mistakenly included it in base url
        if (normalized.endsWith('/api/v4')) {
            normalized = normalized.slice(0, -7);
        }

        // Protocol validation
        try {
            const parsed = new URL(normalized);
            const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
            if (parsed.protocol !== 'https:' && !config.allowInsecureHttp && !isLocal) {
                throw new AppError(
                    'CONFIG_INVALID',
                    'GitLab base URL must use HTTPS (set allowInsecureHttp=true for local testing)'
                );
            }
        } catch (err: any) {
            if (err instanceof AppError) throw err;
            throw new AppError('CONFIG_INVALID', `Invalid GitLab base URL: ${err.message}`);
        }

        this.baseUrl = normalized;
        this.apiBaseUrl = `${this.baseUrl}/api/v4`;
        this.token = config.token;
        this.maxConcurrency = Math.min(Math.max(config.maxConcurrency ?? 4, 1), 8);
        this.timeoutMs = config.timeoutMs ?? 15000;
        this.maxRetries = config.maxRetries ?? 3;

        this.axiosInstance = axios.create({
            baseURL: this.apiBaseUrl,
            timeout: this.timeoutMs,
            headers: {
                'PRIVATE-TOKEN': this.token,
                Accept: 'application/json'
            }
        });
    }

    /**
     * Executes a request with concurrency limiting and exponential backoff retry.
     *
     * @param {AxiosRequestConfig} config - The request configuration.
     * @return {Promise<AxiosResponse<T>>} The HTTP response.
     */
    private async request<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        // Concurrency limiter
        await this.acquireSlot();

        try {
            let attempt = 0;
            while (attempt <= this.maxRetries) {
                try {
                    return await this.axiosInstance.request<T>(config);
                } catch (error: any) {
                    const status = error.response?.status;

                    if (status === 401) {
                        throw new AppError('AUTH_FAILED', 'GitLab authentication failed: invalid or expired token');
                    }
                    if (status === 403) {
                        throw new AppError('PERMISSION_DENIED', 'GitLab permission denied: insufficient token scope');
                    }

                    const isRetryable =
                        status === 429 || (status >= 500 && status <= 504) || error.code === 'ECONNABORTED';
                    if (!isRetryable || attempt >= this.maxRetries) {
                        if (status === 429) {
                            throw new AppError('RATE_LIMITED', 'GitLab API rate limit exceeded after retries');
                        }
                        if (status && status >= 500) {
                            throw new AppError(
                                'API_UNAVAILABLE',
                                `GitLab API unavailable (status ${status}) after retries`
                            );
                        }
                        const safeUrl = sanitizeUrl(config.url || '');
                        const safeMsg = maskSecrets(error.message, [this.token]);
                        throw new Error(`GitLab request failed [${safeUrl}]: ${safeMsg}`);
                    }

                    // Calculate delay with exponential backoff + jitter
                    let delayMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 200, 10000);
                    const retryAfter = error.response?.headers?.['retry-after'];
                    if (retryAfter) {
                        const parsedSec = parseInt(retryAfter, 10);
                        if (!isNaN(parsedSec) && parsedSec > 0) {
                            delayMs = Math.min(parsedSec * 1000, 30000);
                        }
                    }

                    attempt++;
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
            throw new AppError('API_UNAVAILABLE', 'Exceeded maximum retries for GitLab request');
        } finally {
            this.releaseSlot();
        }
    }

    private acquireSlot(): Promise<void> {
        if (this.activeRequests < this.maxConcurrency) {
            this.activeRequests++;
            return Promise.resolve();
        }
        return new Promise<void>(resolve => {
            this.requestQueue.push(() => {
                this.activeRequests++;
                resolve();
            });
        });
    }

    private releaseSlot(): void {
        this.activeRequests--;
        if (this.requestQueue.length > 0) {
            const next = this.requestQueue.shift();
            if (next) next();
        }
    }

    /**
     * Fetches all pages for a given GitLab endpoint.
     *
     * @param {string} endpoint - The API endpoint relative to baseURL.
     * @param {Record<string, any>} [params] - Query parameters.
     * @param {number} [maxPages] - Maximum pages to retrieve.
     * @return {Promise<T[]>} Combined list of items across all pages.
     */
    public async fetchAllPages<T = any>(
        endpoint: string,
        params: Record<string, any> = {},
        maxPages = DEFAULT_MAX_PAGES
    ): Promise<T[]> {
        const results: T[] = [];
        let currentPage: number | null = 1;
        let pageCount = 0;

        while (currentPage !== null && pageCount < maxPages) {
            pageCount++;
            const response = await this.request<T[]>({
                method: 'GET',
                url: endpoint,
                params: {...params, page: currentPage, per_page: params.per_page ?? 100}
            });

            if (Array.isArray(response.data)) {
                results.push(...response.data);
            } else {
                break;
            }

            currentPage = getNextPageFromHeaders(response.headers);
        }

        return results;
    }

    /**
     * Looks up a user by username.
     *
     * @param {string} username - The GitLab username.
     * @return {Promise<GitLabUser>} The matched user object.
     */
    public async getUser(username: string): Promise<GitLabUser> {
        const response = await this.request<GitLabUser[]>({
            method: 'GET',
            url: '/users',
            params: {username}
        });

        const users = response.data;
        if (!Array.isArray(users) || users.length === 0) {
            throw new AppError('USER_NOT_FOUND', `GitLab user "${username}" was not found`);
        }

        const match = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!match) {
            throw new AppError('USER_NOT_FOUND', `GitLab user "${username}" was not found`);
        }

        return match;
    }

    /**
     * Retrieves projects for a user.
     *
     * @param {number} userId - The numeric user ID.
     * @param {boolean} [includePrivate] - Whether to include visible private/internal projects.
     * @param {Array<string>} [excludeProjects] - Array of lowercase project paths to exclude.
     * @return {Promise<GitLabProject[]>} Deduplicated list of projects.
     */
    public async getProjects(
        userId: number,
        includePrivate = false,
        excludeProjects: string[] = []
    ): Promise<GitLabProject[]> {
        const projectMap = new Map<number, GitLabProject>();

        // 1. User projects
        const userProjects = await this.fetchAllPages<GitLabProject>(`/users/${userId}/projects`, {
            simple: true,
            order_by: 'id',
            sort: 'asc'
        });
        for (const p of userProjects) {
            projectMap.set(p.id, p);
        }

        // 2. If including private, fetch accessible projects where user is a member
        if (includePrivate) {
            const memberProjects = await this.fetchAllPages<GitLabProject>('/projects', {
                membership: true,
                simple: true,
                order_by: 'id',
                sort: 'asc'
            });
            for (const p of memberProjects) {
                projectMap.set(p.id, p);
            }
        }

        let projects = Array.from(projectMap.values());

        // Filter out excluded projects
        if (excludeProjects.length > 0) {
            const excludeSet = new Set(excludeProjects.map(p => p.toLowerCase().trim()));
            projects = projects.filter(p => {
                const pathWithNs = (p.path_with_namespace || '').toLowerCase();
                const nameWithNs = (p.name_with_namespace || '').toLowerCase();
                return !excludeSet.has(pathWithNs) && !excludeSet.has(nameWithNs);
            });
        }

        return projects;
    }

    /**
     * Retrieves user events within a date range.
     *
     * @param {number} userId - The numeric user ID.
     * @param {string} [afterDate] - ISO date string for start of range.
     * @param {string} [beforeDate] - ISO date string for end of range.
     * @return {Promise<GitLabEvent[]>} Deduplicated list of events.
     */
    public async getEvents(userId: number, afterDate?: string, beforeDate?: string): Promise<GitLabEvent[]> {
        const params: Record<string, any> = {};
        if (afterDate) params.after = afterDate.slice(0, 10);
        if (beforeDate) params.before = beforeDate.slice(0, 10);

        const events = await this.fetchAllPages<GitLabEvent>(`/users/${userId}/events`, params);
        const eventMap = new Map<number, GitLabEvent>();
        for (const ev of events) {
            eventMap.set(ev.id, ev);
        }
        return Array.from(eventMap.values());
    }

    /**
     * Retrieves merge requests authored by user within a date range.
     *
     * @param {number} userId - The numeric user ID.
     * @param {string} [createdAfter] - ISO date string for start of range.
     * @return {Promise<GitLabMergeRequest[]>} Deduplicated merge requests.
     */
    public async getMergeRequests(userId: number, createdAfter?: string): Promise<GitLabMergeRequest[]> {
        const params: Record<string, any> = {
            author_id: userId,
            scope: 'all'
        };
        if (createdAfter) params.created_after = createdAfter;

        const mrs = await this.fetchAllPages<GitLabMergeRequest>('/merge_requests', params);
        const mrMap = new Map<number, GitLabMergeRequest>();
        for (const mr of mrs) {
            mrMap.set(mr.id, mr);
        }
        return Array.from(mrMap.values());
    }

    /**
     * Retrieves issues authored by user within a date range.
     *
     * @param {number} userId - The numeric user ID.
     * @param {string} [createdAfter] - ISO date string for start of range.
     * @return {Promise<GitLabIssue[]>} Deduplicated issues.
     */
    public async getIssues(userId: number, createdAfter?: string): Promise<GitLabIssue[]> {
        const params: Record<string, any> = {
            author_id: userId,
            scope: 'all'
        };
        if (createdAfter) params.created_after = createdAfter;

        const issues = await this.fetchAllPages<GitLabIssue>('/issues', params);
        const issueMap = new Map<number, GitLabIssue>();
        for (const issue of issues) {
            issueMap.set(issue.id, issue);
        }
        return Array.from(issueMap.values());
    }

    /**
     * Retrieves languages for a project, with memory caching.
     *
     * @param {number} projectId - The numeric project ID.
     * @return {Promise<GitLabLanguagesResponse>} Object mapping language name to percentage.
     */
    public async getLanguages(projectId: number): Promise<GitLabLanguagesResponse> {
        if (this.languagesCache.has(projectId)) {
            return this.languagesCache.get(projectId)!;
        }

        try {
            const response = await this.request<GitLabLanguagesResponse>({
                method: 'GET',
                url: `/projects/${encodeURIComponent(projectId)}/languages`
            });
            const data = response.data || {};
            this.languagesCache.set(projectId, data);
            return data;
        } catch (error: any) {
            // If languages API fails for an individual project (e.g. empty repo), return empty object
            this.languagesCache.set(projectId, {});
            return {};
        }
    }
}
