import {ProviderResult} from '../domain/types';
import {resolveTheme, Theme} from '../const/theme';
import {Icon} from '../const/icon';
import {abbreviateNumber} from 'js-abbreviation-number';
import {createDetailCard} from '../templates/profile-details-card';
import {createDonutChartCard} from '../templates/donut-chart-card';
import {createStatsCard} from '../templates/stats-card';
import {createProductiveCard} from '../templates/productive-time-card';
import {buildProfileTitle} from '../utils/profile-title';
import {CardGenerationOptions, resolveThemeNames} from '../utils/card-generation';
import {applyAnimation} from '../utils/animation';
import {writeSVG} from '../utils/file-writer';

/**
 * Calculates human readable joined date relative to now.
 *
 * @param {string | null} createdAtStr - The ISO createdAt timestamp.
 * @return {string} Formatted joined string.
 */
function getProfileDateJoined(createdAtStr: string | null): string {
    if (!createdAtStr) return 'recently';
    const s = (unit: number) => (unit === 1 ? '' : 's');
    const now = Date.now();
    const created = new Date(createdAtStr);
    const diff = new Date(Math.max(0, now - created.getTime()));
    const years = diff.getUTCFullYear() - new Date(0).getUTCFullYear();
    const months = diff.getUTCMonth() - new Date(0).getUTCMonth();
    const days = diff.getUTCDate() - new Date(0).getUTCDate();
    return years
        ? `${years} year${s(years)} ago`
        : months
          ? `${months} month${s(months)} ago`
          : `${days} day${s(days)} ago`;
}

/**
 * Adjusts fractional UTC offsets across hourly buckets.
 *
 * @param {number} offset - Hourly offset.
 * @param {{offset: number}} roundRobin - Round robin state tracker.
 * @return {number} Adjusted integer hour offset.
 */
function adjustOffset(offset: number, roundRobin: {offset: number}): number {
    if (offset % 1 === 0) {
        return offset;
    } else if ((offset % 1 > 0.29 && offset % 1 < 0.31) || (offset % 1 < -0.29 && offset % 1 > -0.31)) {
        roundRobin.offset = (roundRobin.offset + 1) % 2;
        return roundRobin.offset === 0 ? Math.floor(offset) : Math.ceil(offset);
    } else if ((offset % 1 > 0.44 && offset % 1 < 0.46) || (offset % 1 < -0.44 && offset % 1 > -0.45)) {
        roundRobin.offset = (roundRobin.offset + 1) % 4;
        return roundRobin.offset === 0 ? Math.floor(offset) : Math.ceil(offset);
    }
    return Math.floor(offset);
}

/**
 * Generates the SVG string for Profile Details card from unified ProviderResult.
 *
 * @param {ProviderResult} data - The provider data.
 * @param {Theme} theme - The resolved theme.
 * @param {string} [displayName] - Optional override for display name.
 * @return {string} SVG string.
 */
export function getUnifiedProfileDetailsSVG(data: ProviderResult, theme: Theme, displayName?: string): string {
    const title = buildProfileTitle(data.profile.username, data.profile.displayName, displayName);
    const provider = data.profile.provider;

    let contribIcon = Icon.GITHUB;
    let contribLabel = 'Contributions on GitHub';
    let joinedLabel = `Joined GitHub ${getProfileDateJoined(data.profile.createdAt)}`;

    if (provider === 'gitlab') {
        contribIcon = Icon.GITLAB;
        contribLabel = 'Contributions on GitLab';
        joinedLabel = `Joined GitLab ${getProfileDateJoined(data.profile.createdAt)}`;
    } else if (provider === 'combined') {
        contribIcon = Icon.STAR;
        contribLabel = 'Contributions on GitHub + GitLab';
        joinedLabel = `Active ${getProfileDateJoined(data.profile.createdAt)}`;
    }

    const userDetails: {index: number; icon: string; name: string; value: string}[] = [
        {
            index: 0,
            icon: contribIcon,
            name: 'Contributions',
            value: `${abbreviateNumber(data.stats.contributions ?? 0, 2)} ${contribLabel}`
        },
        {
            index: 1,
            icon: Icon.REPOS,
            name: 'Public Repos',
            value: `${abbreviateNumber(data.profile.publicRepositoryCount ?? data.profile.totalRepositoryCount ?? 0, 2)} Public Repos`
        },
        {
            index: 2,
            icon: Icon.CLOCK,
            name: 'JoinedAt',
            value: joinedLabel
        }
    ];

    if (
        data.profile.githubUsername &&
        data.profile.gitlabUsername &&
        data.profile.githubUsername !== data.profile.gitlabUsername
    ) {
        userDetails.push({
            index: 3,
            icon: Icon.PEOPLE,
            name: 'Accounts',
            value: `GitHub: ${data.profile.githubUsername} / GitLab: ${data.profile.gitlabUsername}`
        });
    } else if (data.profile.location) {
        userDetails.push({
            index: 3,
            icon: Icon.LOCATION,
            name: 'Location',
            value: data.profile.location
        });
    } else if (data.profile.websiteUrl) {
        userDetails.push({
            index: 3,
            icon: Icon.LINK,
            name: 'Website',
            value: data.profile.websiteUrl
        });
    }

    const contributionsData = data.dailyContributions.map(d => ({
        contributionCount: d.count,
        date: new Date(d.date)
    }));

    // Ensure at least 2 points so D3 line extent is valid
    if (contributionsData.length === 0) {
        const now = new Date();
        const past = new Date(now);
        past.setFullYear(past.getFullYear() - 1);
        contributionsData.push({contributionCount: 0, date: past});
        contributionsData.push({contributionCount: 0, date: now});
    }

    return createDetailCard(title, userDetails, contributionsData, theme);
}

/**
 * Generates the SVG string for Repositories per Language card.
 *
 * @param {ProviderResult} data - The provider data.
 * @param {Theme} theme - The resolved theme.
 * @return {string} SVG string.
 */
export function getUnifiedReposPerLanguageSVG(data: ProviderResult, theme: Theme): string {
    let langData = data.languagesByRepository.slice(0, 5).map(l => ({
        name: l.name,
        value: l.repositoryCount,
        color: l.color
    }));

    if (langData.length === 0) {
        langData = [
            {name: 'There are no', value: 1, color: '#586e75'},
            {name: 'repos to show', value: 1, color: '#586e75'}
        ];
    }

    return createDonutChartCard('Top Languages by Repo', langData, theme);
}

/**
 * Generates the SVG string for Most Commit Language card.
 *
 * @param {ProviderResult} data - The provider data.
 * @param {Theme} theme - The resolved theme.
 * @return {string} SVG string.
 */
export function getUnifiedMostCommitLanguageSVG(data: ProviderResult, theme: Theme): string {
    let langData = data.languagesByCommit.slice(0, 5).map(l => ({
        name: l.name,
        value: l.committedChanges ?? 0,
        color: l.color
    }));

    if (langData.length === 0) {
        langData = [
            {name: 'There are no', value: 1, color: '#586e75'},
            {name: 'commits to show', value: 1, color: '#586e75'}
        ];
    }

    const note = data.hasEstimatedCommitLanguages ? '* Estimated from project language ratios' : undefined;
    return createDonutChartCard('Top Languages by Commit', langData, theme, note);
}

/**
 * Generates the SVG string for Stats card.
 *
 * @param {ProviderResult} data - The provider data.
 * @param {Theme} theme - The resolved theme.
 * @return {string} SVG string.
 */
export function getUnifiedStatsSVG(data: ProviderResult, theme: Theme): string {
    const isGitLab = data.profile.provider === 'gitlab';
    const prLabel = isGitLab ? 'Total MRs:' : 'Total PRs / MRs:';

    const statsData = [
        {
            index: 0,
            icon: Icon.STAR,
            name: 'Total Stars:',
            value: `${abbreviateNumber(data.stats.stars ?? 0, 1)}`
        },
        {
            index: 1,
            icon: Icon.COMMIT,
            name: 'Total Commits:',
            value: `${abbreviateNumber(data.stats.commits ?? 0, 1)}`
        },
        {
            index: 2,
            icon: Icon.PULL_REQUEST,
            name: prLabel,
            value: `${abbreviateNumber(data.stats.mergeRequestsOrPullRequests ?? 0, 1)}`
        },
        {
            index: 3,
            icon: Icon.ISSUE,
            name: 'Total Issues:',
            value: `${abbreviateNumber(data.stats.issues ?? 0, 1)}`
        },
        {
            index: 4,
            icon: Icon.REPOS,
            name: 'Contributed to:',
            value: `${abbreviateNumber(data.stats.contributedTo ?? 0, 1)}`
        }
    ];

    const note = data.stats.isApiLimited ? '* GitLab activity is API-limited (Last 365 days)' : undefined;
    return createStatsCard('Stats', statsData, theme, false, data.profile.provider, note);
}

/**
 * Generates the SVG string for Productive Time card.
 *
 * @param {ProviderResult} data - The provider data.
 * @param {Theme} theme - The resolved theme.
 * @param {number} utcOffset - UTC hour offset.
 * @return {string} SVG string.
 */
export function getUnifiedProductiveTimeSVG(data: ProviderResult, theme: Theme, utcOffset: number): string {
    const chartData = new Array(24).fill(0);
    const roundRobin = {offset: 0};

    for (const point of data.activity) {
        const afterOffset = adjustOffset(Number(point.hourUtc) + Number(utcOffset), roundRobin);
        let hourIndex = afterOffset;
        if (afterOffset < 0) {
            hourIndex = 24 + afterOffset;
        } else if (afterOffset > 23) {
            hourIndex = afterOffset - 24;
        }
        chartData[hourIndex] += point.count;
    }

    return createProductiveCard(chartData, theme, utcOffset);
}

/**
 * Writes all 5 cards across all requested themes to the output folder.
 *
 * @param {ProviderResult} data - The provider data.
 * @param {number} utcOffset - UTC offset in hours.
 * @param {CardGenerationOptions} [options] - Generation options (theme, animation, duration, displayName).
 */
export function writeAllUnifiedCards(
    data: ProviderResult,
    utcOffset: number,
    options: CardGenerationOptions = {}
): void {
    const themeNames = resolveThemeNames(options.theme);

    for (const themeName of themeNames) {
        const theme = resolveTheme(themeName);

        // 0-profile-details
        const profileSVG = getUnifiedProfileDetailsSVG(data, theme, options.displayName);
        writeSVG(themeName, '0-profile-details', applyAnimation(profileSVG, options.animation, options.duration));

        // 1-repos-per-language
        const reposSVG = getUnifiedReposPerLanguageSVG(data, theme);
        writeSVG(themeName, '1-repos-per-language', applyAnimation(reposSVG, options.animation, options.duration));

        // 2-most-commit-language
        const commitsSVG = getUnifiedMostCommitLanguageSVG(data, theme);
        writeSVG(themeName, '2-most-commit-language', applyAnimation(commitsSVG, options.animation, options.duration));

        // 3-stats
        const statsSVG = getUnifiedStatsSVG(data, theme);
        writeSVG(themeName, '3-stats', applyAnimation(statsSVG, options.animation, options.duration));

        // 4-productive-time
        const productiveSVG = getUnifiedProductiveTimeSVG(data, theme, utcOffset);
        writeSVG(themeName, '4-productive-time', applyAnimation(productiveSVG, options.animation, options.duration));
    }
}
