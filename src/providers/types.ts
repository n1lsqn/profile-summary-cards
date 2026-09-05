import {ProviderResult} from '../domain/types';

export interface ProviderFetchOptions {
    username: string;
    token?: string;
    baseUrl?: string;
    includePrivate?: boolean;
    timeRangeDays?: number;
    excludeLanguages?: string[];
    excludeProjects?: string[];
    utcOffset?: number;
    logLevel?: string;
    failOnPartialError?: boolean;
}

export interface Provider {
    readonly name: 'github' | 'gitlab' | 'combined';
    fetch(options: ProviderFetchOptions): Promise<ProviderResult>;
}
