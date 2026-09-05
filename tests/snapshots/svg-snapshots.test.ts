import {
    getUnifiedProfileDetailsSVG,
    getUnifiedReposPerLanguageSVG,
    getUnifiedMostCommitLanguageSVG,
    getUnifiedStatsSVG,
    getUnifiedProductiveTimeSVG
} from '../../src/cards/unified-cards';
import {ProviderResult} from '../../src/domain/types';
import {resolveTheme} from '../../src/const/theme';
import {JSDOM} from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

describe('SVG Snapshot and Validity Tests', () => {
    const gitlabData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../fixtures/gitlab/sample-user.json'), 'utf8')
    ) as unknown as ProviderResult;

    const githubData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../fixtures/github/sample-user.json'), 'utf8')
    ) as unknown as ProviderResult;

    const combinedData = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../../fixtures/combined/sample-user.json'), 'utf8')
    ) as unknown as ProviderResult;

    const testThemes = ['github_dark', 'default', 'radical'];

    function assertSvgSanity(svg: string, expectedWidth?: number, expectedHeight?: number) {
        expect(svg).toBeDefined();
        expect(svg.startsWith('<svg') || svg.includes('<svg')).toBe(true);

        // Disallow forbidden text artifacts
        expect(svg).not.toContain('undefined');
        expect(svg).not.toContain('NaN');
        expect(svg).not.toContain('[object Object]');

        // Validate XML well-formedness
        const dom = new JSDOM(svg, {contentType: 'image/svg+xml'});
        const parserErrors = dom.window.document.querySelectorAll('parsererror');
        expect(parserErrors.length).toBe(0);

        const svgElement = dom.window.document.querySelector('svg');
        expect(svgElement).not.toBeNull();

        if (expectedWidth !== undefined) {
            expect(svgElement?.getAttribute('width')).toBe(String(expectedWidth));
        }
        if (expectedHeight !== undefined) {
            expect(svgElement?.getAttribute('height')).toBe(String(expectedHeight));
        }
    }

    describe.each(testThemes)('Theme: %s', themeName => {
        const theme = resolveTheme(themeName);

        it('renders valid 0-profile-details SVG', () => {
            const svg = getUnifiedProfileDetailsSVG(gitlabData, theme);
            assertSvgSanity(svg, 700, 200);
        });

        it('renders valid 1-repos-per-language SVG', () => {
            const svg = getUnifiedReposPerLanguageSVG(gitlabData, theme);
            assertSvgSanity(svg, 340, 200);
        });

        it('renders valid 2-most-commit-language SVG', () => {
            const svg = getUnifiedMostCommitLanguageSVG(gitlabData, theme);
            assertSvgSanity(svg, 340, 200);
        });

        it('renders valid 3-stats SVG', () => {
            const svg = getUnifiedStatsSVG(gitlabData, theme);
            assertSvgSanity(svg, 340, 200);
        });

        it('renders valid 4-productive-time SVG', () => {
            const svg = getUnifiedProductiveTimeSVG(gitlabData, theme, 9);
            assertSvgSanity(svg, 340, 200);
        });
    });

    it('renders GitHub provider cards cleanly', () => {
        const theme = resolveTheme('github_dark');
        const svg = getUnifiedProfileDetailsSVG(githubData, theme);
        assertSvgSanity(svg, 700, 200);
        expect(svg).toContain('Contributions on GitHub');
    });

    it('renders Combined provider cards cleanly with dual logo', () => {
        const theme = resolveTheme('github_dark');
        const statsSvg = getUnifiedStatsSVG(combinedData, theme);
        assertSvgSanity(statsSvg, 340, 200);
        expect(statsSvg).toContain('Total PRs / MRs:');
    });
});
