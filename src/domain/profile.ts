export type ProviderName = 'github' | 'gitlab' | 'combined';

export interface UnifiedProfile {
    provider: ProviderName;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    profileUrl: string | null;
    createdAt: string | null;
    location: string | null;
    websiteUrl: string | null;
    publicRepositoryCount: number | null;
    totalRepositoryCount: number | null;
    // Sub-accounts for combined mode
    githubUsername?: string;
    gitlabUsername?: string;
}
