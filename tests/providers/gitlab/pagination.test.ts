import {getNextPageFromHeaders} from '../../../src/providers/gitlab/pagination';

describe('GitLab Pagination', () => {
    it('extracts page from x-next-page header', () => {
        expect(getNextPageFromHeaders({'x-next-page': '3'})).toBe(3);
        expect(getNextPageFromHeaders({'X-Next-Page': '5'})).toBe(5);
    });

    it('returns null when x-next-page is empty string', () => {
        expect(getNextPageFromHeaders({'x-next-page': ''})).toBeNull();
        expect(getNextPageFromHeaders({'x-next-page': '   '})).toBeNull();
    });

    it('falls back to Link header with rel="next"', () => {
        const link =
            '<https://gitlab.example.com/api/v4/projects?page=4&per_page=100>; rel="next", <https://gitlab.example.com/api/v4/projects?page=10&per_page=100>; rel="last"';
        expect(getNextPageFromHeaders({link})).toBe(4);
    });

    it('returns null when no next link or page header exists', () => {
        expect(getNextPageFromHeaders({})).toBeNull();
        const link = '<https://gitlab.example.com/api/v4/projects?page=1&per_page=100>; rel="first"';
        expect(getNextPageFromHeaders({link})).toBeNull();
    });
});
