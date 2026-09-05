import {
    getUnifiedProfileDetailsSVG,
    getUnifiedReposPerLanguageSVG,
    getUnifiedMostCommitLanguageSVG,
    getUnifiedStatsSVG,
    getUnifiedProductiveTimeSVG,
    writeAllUnifiedCards
} from '../../src/cards/unified-cards';
import {ProviderResult} from '../../src/domain/types';
import {resolveTheme} from '../../src/const/theme';
import {writeSVG} from '../../src/utils/file-writer';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('../../src/utils/file-writer');

const sampleGitLabUser = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../fixtures/gitlab/sample-user.json'), 'utf8')
);

describe('Unified Cards Rendering', () => {
    const gitlabData = sampleGitLabUser as unknown as ProviderResult;
    const theme = resolveTheme('github_dark');

    it('renders 0-profile-details SVG correctly without undefined/NaN', () => {
        const svg = getUnifiedProfileDetailsSVG(gitlabData, theme);
        expect(svg).toContain('<svg');
        expect(svg).toContain('Contributions on GitLab');
        expect(svg).toContain('Joined GitLab');
        expect(svg).not.toContain('undefined');
        expect(svg).not.toContain('NaN');
        expect(svg).not.toContain('[object Object]');
    });

    it('renders 1-repos-per-language SVG correctly', () => {
        const svg = getUnifiedReposPerLanguageSVG(gitlabData, theme);
        expect(svg).toContain('<svg');
        expect(svg).toContain('Top Languages by Repo');
        expect(svg).toContain('TypeScript');
        expect(svg).not.toContain('undefined');
        expect(svg).not.toContain('NaN');
        expect(svg).not.toContain('[object Object]');
    });

    it('renders 2-most-commit-language SVG with estimation note', () => {
        const svg = getUnifiedMostCommitLanguageSVG(gitlabData, theme);
        expect(svg).toContain('<svg');
        expect(svg).toContain('Top Languages by Commit');
        expect(svg).toContain('Estimated from project language ratios');
        expect(svg).not.toContain('undefined');
        expect(svg).not.toContain('NaN');
        expect(svg).not.toContain('[object Object]');
    });

    it('renders 3-stats SVG with GitLab logo and API limited note', () => {
        const svg = getUnifiedStatsSVG(gitlabData, theme);
        expect(svg).toContain('<svg');
        expect(svg).toContain('Stats');
        expect(svg).toContain('Total MRs:');
        expect(svg).toContain('GitLab activity is API-limited');
        expect(svg).not.toContain('undefined');
        expect(svg).not.toContain('NaN');
        expect(svg).not.toContain('[object Object]');
    });

    it('renders 4-productive-time SVG with UTC offset', () => {
        const svg = getUnifiedProductiveTimeSVG(gitlabData, theme, 9);
        expect(svg).toContain('<svg');
        expect(svg).toContain('Commits (UTC +9.00)');
        expect(svg).not.toContain('undefined');
        expect(svg).not.toContain('NaN');
        expect(svg).not.toContain('[object Object]');
    });

    it('writeAllUnifiedCards writes all 5 cards', () => {
        const mockWriteSVG = writeSVG as jest.Mock;
        mockWriteSVG.mockClear();

        writeAllUnifiedCards(gitlabData, 9, {theme: 'github_dark'});

        expect(mockWriteSVG).toHaveBeenCalledWith('github_dark', '0-profile-details', expect.any(String));
        expect(mockWriteSVG).toHaveBeenCalledWith('github_dark', '1-repos-per-language', expect.any(String));
        expect(mockWriteSVG).toHaveBeenCalledWith('github_dark', '2-most-commit-language', expect.any(String));
        expect(mockWriteSVG).toHaveBeenCalledWith('github_dark', '3-stats', expect.any(String));
        expect(mockWriteSVG).toHaveBeenCalledWith('github_dark', '4-productive-time', expect.any(String));
        expect(mockWriteSVG).toHaveBeenCalledTimes(5);
    });

    it('renders combined mode 0-profile-details and 3-stats correctly', () => {
        const combinedData = JSON.parse(
            fs.readFileSync(path.join(__dirname, '../../fixtures/combined/sample-user.json'), 'utf8')
        ) as unknown as ProviderResult;

        const profileSvg = getUnifiedProfileDetailsSVG(combinedData, theme);
        expect(profileSvg).toContain('Contributions on GitHub + GitLab');
        expect(profileSvg).not.toContain('undefined');
        expect(profileSvg).not.toContain('NaN');

        const statsSvg = getUnifiedStatsSVG(combinedData, theme);
        expect(statsSvg).toContain('Total PRs / MRs:');
        expect(statsSvg).not.toContain('undefined');
        expect(statsSvg).not.toContain('NaN');
    });
});
