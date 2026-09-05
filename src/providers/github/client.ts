import {getProfileDetails, ProfileDetails} from '../../github-api/profile-details';
import {getContributionTotals} from '../../utils/contribution-history';
import {getRepoLanguages, RepoLanguages} from '../../github-api/repos-per-language';
import {getContributionYears, getCommitLanguageAllYears, CommitLanguages} from '../../github-api/commits-per-language';
import {getProductiveTime, ProfuctiveTime} from '../../github-api/productive-time';

export interface GitHubRawData {
    profileDetails: ProfileDetails;
    totalContributions: number;
    totalCommitContributions: number;
    repoLanguages: RepoLanguages;
    commitLanguages: CommitLanguages;
    productiveTime: ProfuctiveTime;
}

export class GitHubClient {
    async fetchUserData(
        username: string,
        token: string,
        excludeLanguages: string[] = [],
        excludeRepos: string[] = []
    ): Promise<GitHubRawData> {
        const profileDetails = await getProfileDetails(username, token);
        const {totalContributions, totalCommitContributions} = await getContributionTotals(
            username,
            profileDetails.contributionYears,
            token
        );

        const repoLanguages = await getRepoLanguages(username, excludeLanguages, token, excludeRepos);

        const years = await getContributionYears(username, token);
        const commitLanguages = await getCommitLanguageAllYears(username, excludeLanguages, token, excludeRepos, years);

        const until = new Date();
        until.setUTCHours(24, 0, 0, 0);
        const since = new Date(until);
        since.setUTCFullYear(since.getUTCFullYear() - 1);
        const productiveTime = await getProductiveTime(username, until.toISOString(), since.toISOString(), token);

        return {
            profileDetails,
            totalContributions,
            totalCommitContributions,
            repoLanguages,
            commitLanguages,
            productiveTime
        };
    }
}
