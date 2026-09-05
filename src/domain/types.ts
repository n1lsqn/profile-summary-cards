import {UnifiedProfile} from './profile';
import {UnifiedStats} from './stats';
import {LanguageStat} from './languages';
import {ActivityPoint, DailyContribution} from './activity';

export * from './profile';
export * from './stats';
export * from './languages';
export * from './activity';

export interface ProviderResult {
    profile: UnifiedProfile;
    stats: UnifiedStats;
    languagesByRepository: LanguageStat[];
    languagesByCommit: LanguageStat[];
    activity: ActivityPoint[];
    dailyContributions: DailyContribution[];
    warnings: string[];
    fetchedAt: string;
    hasEstimatedCommitLanguages?: boolean;
}
