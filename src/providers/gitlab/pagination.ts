/**
 * GitLab API v4 Pagination utilities.
 */

/**
 * Extracts the next page number from GitLab response headers.
 * Checks `x-next-page` first, then falls back to parsing the `Link` header with `rel="next"`.
 *
 * @param {Record<string, any>} headers - The HTTP response headers.
 * @return {number | null} The next page number, or null if no further pages exist.
 */
export function getNextPageFromHeaders(headers: Record<string, any>): number | null {
    if (!headers) return null;

    // 1. Check X-Next-Page header (GitLab standard)
    const xNextPage = headers['x-next-page'] || headers['X-Next-Page'];
    if (xNextPage !== undefined && xNextPage !== null && String(xNextPage).trim() !== '') {
        const nextNum = parseInt(String(xNextPage).trim(), 10);
        if (!isNaN(nextNum) && nextNum > 0) {
            return nextNum;
        }
        return null;
    }

    // 2. Fall back to parsing Link header
    const linkHeader = headers['link'] || headers['Link'];
    if (typeof linkHeader === 'string' && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (match && match[1]) {
            try {
                const url = new URL(match[1]);
                const pageParam = url.searchParams.get('page');
                if (pageParam) {
                    const pageNum = parseInt(pageParam, 10);
                    if (!isNaN(pageNum) && pageNum > 0) {
                        return pageNum;
                    }
                }
            } catch {
                // Ignore URL parsing errors and return null
            }
        }
    }

    return null;
}

export const DEFAULT_MAX_PAGES = 50;
