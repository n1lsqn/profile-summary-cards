export interface UnifiedStats {
    commits: number | null;
    contributions: number | null;
    mergeRequestsOrPullRequests: number | null;
    issues: number | null;
    stars: number | null;
    contributedTo: number | null;
    isApiLimited?: boolean;
}
