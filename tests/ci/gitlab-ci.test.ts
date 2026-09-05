import fs from 'fs';
import path from 'path';
import {spawnSync} from 'child_process';

describe('GitLab CI Configuration and CLI Security', () => {
    const gitlabCiPath = path.join(__dirname, '../../.gitlab-ci.yml');

    it('verifies .gitlab-ci.yml exists and contains required directives', () => {
        expect(fs.existsSync(gitlabCiPath)).toBe(true);
        const content = fs.readFileSync(gitlabCiPath, 'utf8');

        // Rule sources
        expect(content).toContain('$CI_PIPELINE_SOURCE == "schedule"');
        expect(content).toContain('$CI_PIPELINE_SOURCE == "web"');

        // Concurrency control
        expect(content).toContain('resource_group: profile-card-generation');

        // Skip CI on push
        expect(content).toContain('[skip ci]');

        // Node 22 image
        expect(content).toContain('node:22');

        // Output artifacts
        expect(content).toContain('profile-summary-card-output/');
    });

    it('prints help message with exit code 0', () => {
        const result = spawnSync('npx', ['ts-node', 'scripts/generate.ts', '--help'], {
            encoding: 'utf8'
        });
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Unified Profile Summary Cards Generator');
        expect(result.stdout).toContain('--provider');
    });

    it('exits with code 2 (CONFIG_INVALID) on invalid provider', () => {
        const result = spawnSync('npx', ['ts-node', 'scripts/generate.ts', '--provider=unknown'], {
            encoding: 'utf8',
            env: {...process.env, GITHUB_TOKEN: 'dummy'}
        });
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('CONFIG_INVALID');
    });

    it('exits with code 2 (CONFIG_INVALID) when missing required username', () => {
        const result = spawnSync(
            'npx',
            ['ts-node', 'scripts/generate.ts', '--provider=gitlab', '--gitlab-url=https://gitlab.example.com'],
            {
                encoding: 'utf8',
                env: {
                    PATH: process.env.PATH,
                    GITLAB_TOKEN: 'glpat-test-secret-token-abcdef123456'
                }
            }
        );
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('CONFIG_INVALID');
        // Verify token was not leaked anywhere in stdout or stderr
        expect(result.stdout).not.toContain('glpat-test-secret-token-abcdef123456');
        expect(result.stderr).not.toContain('glpat-test-secret-token-abcdef123456');
    });

    it('masks glpat and ghp tokens if an error message contains them', () => {
        const secretToken = 'glpat-SuperSecretToken999999999';
        const result = spawnSync(
            'npx',
            [
                'ts-node',
                'scripts/generate.ts',
                '--provider=gitlab',
                '--gitlab-username=testuser',
                '--gitlab-url=https://127.0.0.1:1' // Invalid URL to trigger network/API error
            ],
            {
                encoding: 'utf8',
                env: {
                    PATH: process.env.PATH,
                    GITLAB_TOKEN: secretToken
                }
            }
        );
        // Should fail with API_UNAVAILABLE (7) or AUTH_FAILED (4)
        expect(result.status).not.toBe(0);
        // Ensure token is never printed in plain text
        expect(result.stdout).not.toContain(secretToken);
        expect(result.stderr).not.toContain(secretToken);
    });
});
