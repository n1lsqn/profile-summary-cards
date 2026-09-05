import {escapeXml, sanitizeUrl, maskSecrets, sanitizeProjectName} from '../../src/privacy/sanitize';

describe('Privacy and Sanitization', () => {
    describe('escapeXml', () => {
        it('escapes XML special characters', () => {
            expect(escapeXml('<script>alert("xss" & \'test\')</script>')).toBe(
                '&lt;script&gt;alert(&quot;xss&quot; &amp; &apos;test&apos;)&lt;/script&gt;'
            );
        });

        it('handles null and undefined', () => {
            expect(escapeXml(null)).toBe('');
            expect(escapeXml(undefined)).toBe('');
            expect(escapeXml('')).toBe('');
        });
    });

    describe('sanitizeUrl', () => {
        it('removes query parameters and hash', () => {
            expect(sanitizeUrl('https://gitlab.example.com/api/v4/projects?private_token=secret#top')).toBe(
                'https://gitlab.example.com/api/v4/projects'
            );
        });

        it('removes username and password in URL', () => {
            expect(sanitizeUrl('https://user:password@gitlab.example.com/repo.git')).toBe(
                'https://gitlab.example.com/repo.git'
            );
        });

        it('handles non-URL strings safely', () => {
            expect(sanitizeUrl('invalid-url?foo=bar')).toBe('invalid-url');
        });
    });

    describe('maskSecrets', () => {
        it('masks explicit secrets', () => {
            const secret = 'my-super-secret-pat-12345';
            const log = `Error fetching data with token ${secret} from server`;
            expect(maskSecrets(log, [secret])).toBe('Error fetching data with token ***MASKED*** from server');
        });

        it('masks glpat tokens automatically', () => {
            const log = 'Failed request: glpat-abcdef1234567890xyz is invalid';
            expect(maskSecrets(log)).toBe('Failed request: glpat-***MASKED*** is invalid');
        });

        it('masks ghp_ tokens automatically', () => {
            const log = 'Failed request: ghp_abcdef1234567890xyz is invalid';
            expect(maskSecrets(log)).toBe('Failed request: ghp_***MASKED*** is invalid');
        });

        it('masks Bearer authorization header tokens', () => {
            const log = 'Request headers: Authorization: Bearer some_secret_token_value_here';
            expect(maskSecrets(log)).toBe('Request headers: Authorization: Bearer ***MASKED***');
        });
    });

    describe('sanitizeProjectName', () => {
        it('returns original name for public projects', () => {
            expect(sanitizeProjectName('open-source/lib', false, 123)).toBe('open-source/lib');
        });

        it('returns masked name for private projects', () => {
            expect(sanitizeProjectName('secret-org/classified-project', true, 456)).toBe('[private project #456]');
            expect(sanitizeProjectName('secret-org/classified-project', true)).toBe('[private project]');
        });
    });
});
