export interface LanguageStat {
    name: string;
    color: string;
    repositoryCount: number;
    committedChanges: number | null;
    percentage: number;
    isEstimated?: boolean;
}
