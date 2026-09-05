/**
 * Privacy and sanitization helpers to ensure no secret tokens, query parameters,
 * or private project information ever leak into SVG, logs, or metadata.
 */

/**
 * Escapes characters for safe inclusion in SVG / XML documents.
 *
 * @param {string | null | undefined} unsafe - The raw string to escape.
 * @return {string} The escaped string.
 */
export function escapeXml(unsafe: string | null | undefined): string {
    if (unsafe === null || unsafe === undefined) {
        return '';
    }
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Removes query parameters and credentials from URLs before logging.
 *
 * @param {string} rawUrl - The raw URL string.
 * @return {string} The sanitized URL without credentials or query params.
 */
export function sanitizeUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    try {
        const parsed = new URL(rawUrl);
        parsed.search = '';
        parsed.hash = '';
        parsed.password = '';
        parsed.username = '';
        return parsed.toString();
    } catch {
        // If URL parsing fails, strip query string via regex
        return rawUrl.split('?')[0].split('#')[0];
    }
}

/**
 * Masks secrets and tokens in log strings or error messages.
 *
 * @param {string} message - The message string that may contain secrets.
 * @param {Array<string | undefined | null>} [secrets] - Explicit secret values to mask.
 * @return {string} The sanitized message with secrets replaced by ***MASKED***.
 */
export function maskSecrets(message: string, secrets: (string | undefined | null)[] = []): string {
    let result = message;
    for (const secret of secrets) {
        if (secret && secret.length >= 4) {
            // Replace secret with masked version
            const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'g');
            result = result.replace(regex, '***MASKED***');
        }
    }
    // Also mask common token patterns (e.g. glpat-*, ghp_*, bearer tokens)
    result = result.replace(/(glpat-[a-zA-Z0-9_-]{10,})/g, 'glpat-***MASKED***');
    result = result.replace(/(ghp_[a-zA-Z0-9]{10,})/g, 'ghp_***MASKED***');
    result = result.replace(/(bearer\s+)[a-zA-Z0-9._-]+/gi, '$1***MASKED***');
    return result;
}

/**
 * Sanitizes project names: if private, hide name/path and return [private project] or project ID.
 *
 * @param {string} projectPathOrName - The original project name or path with namespace.
 * @param {boolean} isPrivate - Whether the project is private.
 * @param {number | string} [projectId] - Optional numeric or string project ID.
 * @return {string} The sanitized project display string.
 */
export function sanitizeProjectName(
    projectPathOrName: string,
    isPrivate: boolean,
    projectId?: number | string
): string {
    if (isPrivate) {
        return projectId ? `[private project #${projectId}]` : `[private project]`;
    }
    return projectPathOrName;
}
