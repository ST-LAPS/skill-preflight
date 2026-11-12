# Skill Preflight GitHub App development

This private development app reports static checks on non-draft pull requests whose head branch is in the same repository. It reads each commit by SHA, downloads only `SKILL.md` contents, and uses Git tree metadata to check whether other tracked files exist. The app never executes skill code. It deletes the temporary snapshot after each scan.

## Run the local tests

```sh
node --test github-app.test.mjs
```

The tests use a local HTTP server and simulated GitHub API responses. They check webhook signatures, installation token requests, failure reporting, unsafe paths, and repeated deliveries.

## Set up a private installation

1. Provision a Node.js 22 or later host with an HTTPS endpoint routed to `/github/webhook`. Keep the app private during this test.
2. Configure repository permissions for Contents (read), Pull requests (read), and Checks (read and write). Subscribe to Pull request events. GitHub grants Metadata read access automatically.
3. Generate the private key in GitHub and a separate random webhook secret. Store both in the host's secret manager. Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (PEM text), and `GITHUB_WEBHOOK_SECRET` on the host. Start the process with `node github-app.mjs`. It listens on `127.0.0.1:3000` by default. Set `HOST` and `PORT` if required by the host.
4. Set the GitHub App webhook URL to the HTTPS endpoint and configure the same webhook secret. Install the app only on the ST-LAPS example repository. Use a branch in that repository to test a pull request with a valid skill, then push a commit containing a missing link. Verify the named check succeeds on the first commit and fails on the second.

The development server uses a bounded queue in memory. A restart can lose accepted jobs, so review the logs and redeliver the webhook from GitHub if needed. Fork pull requests are skipped. Snapshots containing symlinks, submodules, or unsupported paths receive a neutral result. Large snapshots also receive a neutral result (limits of 10,000 entries, 300 skills, 1 MiB per skill and 16 MiB total skill content).

Public release still needs live installation testing, persistent delivery handling, an operational privacy and support setup, and GitHub Marketplace billing integration. The development app does not process purchases.
