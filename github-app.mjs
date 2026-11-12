import { createHmac, sign, timingSafeEqual } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatReport, scan } from './preflight.mjs';

const shaPattern = /^[a-f0-9]{40}$/;
const checkName = 'ST-LAPS Skill Preflight';
const validId = value => Number.isSafeInteger(value) && value > 0;
const activeActions = new Set(['opened', 'reopened', 'synchronize', 'ready_for_review']);
const maxTreeEntries = 10000;
const maxSkills = 300;
const maxSkillBytes = 1024 * 1024;
const maxTotalSkillBytes = 16 * maxSkillBytes;
const maxWebhookBytes = 1024 * 1024;
const maxPendingJobs = 20;
const compareFileLimit = 300;
const annotationLimit = 50;

export function verifySignature(secret, body, signature) {
  if (typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

export function pullRequestJob(event, payload) {
  if (event !== 'pull_request' || (!activeActions.has(payload?.action) &&
      !(payload?.action === 'edited' && payload.changes?.base))) return null;
  const { installation, repository, pull_request: pr } = payload;
  const repo = repository?.full_name;
  if (!validId(installation?.id) || !validId(repository?.id) ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? '') ||
      !shaPattern.test(pr?.head?.sha ?? '') || !shaPattern.test(pr?.base?.sha ?? '') ||
      pr?.head?.repo?.id !== repository.id ||
      pr.draft !== false) return null;
  return { installationId: installation.id, repositoryId: repository.id, repo,
    sha: pr.head.sha, baseSha: pr.base.sha };
}

function createJwt(appId, privateKey, now = Math.floor(Date.now() / 1000)) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' +
    encode({ iat: now - 60, exp: now + 540, iss: String(appId) });
  return unsigned + '.' + sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url');
}

function githubClient(fetchImpl = fetch) {
  return async (route, token, options = {}) => {
    const response = await fetchImpl('https://api.github.com' + route, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'User-Agent': 'ST-LAPS-Skill-Preflight',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('GitHub API returned HTTP ' + response.status);
    return response.json();
  };
}

function snapshotPath(root, entryPath) {
  if (typeof entryPath !== 'string') throw new Error('Invalid Git tree entry');
  const parts = entryPath.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' ||
      /^(?:\.git|con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) ||
      /[\\:*?"<>|\x00-\x1f]|[. ]$/.test(part))) throw new Error('Unsupported repository path');
  return path.join(root, ...parts);
}

async function scanCommit(api, repoRoute, sha, token) {
  const commit = await api(repoRoute + '/git/commits/' + sha, token);
  if (!shaPattern.test(commit.tree?.sha ?? '')) throw new Error('Invalid commit tree');
  const { tree, truncated } = await api(repoRoute + '/git/trees/' + commit.tree.sha + '?recursive=1', token);
  if (truncated || !Array.isArray(tree) || tree.length > maxTreeEntries) {
    throw new Error('Repository tree exceeds the development app limits');
  }
  const root = await mkdtemp(path.join(tmpdir(), 'skill-preflight-app-'));
  let skills = 0;
  let skillBytes = 0;
  try {
    for (const entry of tree) {
      const target = snapshotPath(root, entry.path);
      if (entry.type === 'tree' && entry.mode === '040000') {
        await mkdir(target, { recursive: true });
        continue;
      }
      if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
        throw new Error('Repository contains a symlink or submodule');
      }
      await mkdir(path.dirname(target), { recursive: true });
      let contents = '';
      if (path.basename(target) === 'SKILL.md') {
        if (++skills > maxSkills || !Number.isSafeInteger(entry.size) || entry.size < 0 ||
            entry.size > maxSkillBytes || !shaPattern.test(entry.sha ?? '') ||
            (skillBytes += entry.size) > maxTotalSkillBytes) {
          throw new Error('Skill files exceed the development app limits');
        }
        const blob = await api(repoRoute + '/git/blobs/' + entry.sha, token);
        if (blob.encoding !== 'base64' || typeof blob.content !== 'string' ||
            blob.content.length > Math.ceil(maxSkillBytes * 1.5)) throw new Error('Invalid skill blob');
        contents = Buffer.from(blob.content, 'base64');
        if (contents.length !== entry.size) throw new Error('Invalid skill blob length');
      }
      await writeFile(target, contents, { flag: 'wx' });
    }
    return scan(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function renameImpact(report, files) {
  if (!Array.isArray(files) || files.length >= compareFileLimit) return [];
  const changedPaths = new Set();
  const renamedPaths = new Map();
  for (const file of files) {
    changedPaths.add(file.filename);
    if (file.previous_filename) changedPaths.add(file.previous_filename);
    if (file.status === 'renamed' && file.previous_filename && file.filename) {
      renamedPaths.set(file.previous_filename, file.filename);
    }
  }
  return report.findings.flatMap(finding => {
    if (finding.rule !== 'LINK_MISSING' || changedPaths.has(finding.file)) return [];
    const skillDir = path.posix.dirname(finding.file);
    const link = finding.details.link.split(path.sep).join('/');
    const oldPath = path.posix.resolve('/', skillDir, link).slice(1);
    const newPath = renamedPaths.get(oldPath);
    if (!newPath) return [];
    const suggestedPath = path.posix.relative(skillDir, newPath).split('/').map(segment =>
      encodeURIComponent(segment).replace(/[!'()*]/g, char =>
        '%' + char.charCodeAt(0).toString(16).toUpperCase())).join('/');
    return [{
      path: finding.file,
      start_line: finding.line,
      end_line: finding.line,
      annotation_level: 'failure',
      title: 'File rename broke a skill link',
      message: `${oldPath} was renamed to ${newPath}. Suggested link destination: ${suggestedPath}`,
    }];
  });
}

export function createProcessor({ appId, privateKey, fetchImpl, log = console.error }) {
  const api = githubClient(fetchImpl);
  return async ({ installationId, repositoryId, repo, sha, baseSha }) => {
    const repoRoute = '/repos/' + repo.split('/').map(encodeURIComponent).join('/');
    const { token } = await api('/app/installations/' + installationId + '/access_tokens',
      createJwt(appId, privateKey), { method: 'POST', body: { repository_ids: [repositoryId] } });
    if (typeof token !== 'string' || !token) throw new Error('Missing installation token');
    const checks = repoRoute + '/check-runs';
    const externalId = 'skill-preflight:' + repositoryId + ':' + baseSha + ':' + sha;
    const prior = await api(repoRoute + '/commits/' + sha + '/check-runs?check_name=' +
      encodeURIComponent(checkName) + '&app_id=' + encodeURIComponent(appId) + '&filter=all', token);
    const existing = prior.check_runs?.find(run => run.external_id === externalId);
    if (existing?.status === 'completed' && existing.conclusion !== 'neutral') return;
    let result;
    try {
      const report = await scanCommit(api, repoRoute, sha, token);
      const markdown = formatReport(report, 'markdown', 'en');
      let summary = markdown.length > 20000 ? markdown.slice(0, 20000) + '\n\nReport truncated.' : markdown;
      let annotations = [];
      if (report.findings.some(finding => finding.rule === 'LINK_MISSING')) {
        try {
          const comparison = await api(repoRoute + '/compare/' + baseSha + '...' + sha + '?per_page=1', token);
          const impact = renameImpact(report, comparison.files);
          if (impact.length) {
            const count = new Set(impact.map(annotation => annotation.path)).size;
            annotations = impact.slice(0, annotationLimit);
            summary = `File renames broke ${impact.length} link(s) across ${count} unchanged skill(s). ` +
              `Showing ${annotations.length} location(s) with suggested destinations.\n\n` + summary;
          }
        } catch (error) {
          log('Skill Preflight could not compare the PR commits:', error.message);
        }
      }
      result = {
        conclusion: report.errors ? 'failure' : 'success',
        output: { title: report.errors ? 'Skill errors found' : 'Skill check passed', summary, annotations },
      };
    } catch (error) {
      log('Skill Preflight scan could not complete:', error.message);
      result = {
        conclusion: 'neutral',
        output: { title: 'Skill check could not complete', summary: 'The development app could not scan this commit. Run the Skill Preflight action in the repository for a full checkout-based scan.' },
      };
    }
    const body = { name: checkName, status: 'completed', ...result };
    if (existing) {
      await api(checks + '/' + existing.id, token, { method: 'PATCH', body });
    } else {
      await api(checks, token, { method: 'POST', body: { ...body, head_sha: sha, external_id: externalId } });
    }
  };
}

export function createWebhookServer({ secret, processJob, log = console.error }) {
  if (!secret) throw new Error('A webhook secret is required');
  const pending = new Set();
  let queue = Promise.resolve();
  return createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/github/webhook') {
      response.writeHead(404).end();
      return;
    }
    try {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        bytes += chunk.length;
        if (bytes > maxWebhookBytes) {
          response.writeHead(413, { Connection: 'close' }).end();
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (!verifySignature(secret, body, request.headers['x-hub-signature-256'])) {
        response.writeHead(401).end();
        return;
      }
      let payload;
      try { payload = JSON.parse(body.toString('utf8')); }
      catch { response.writeHead(400).end(); return; }
      const job = pullRequestJob(request.headers['x-github-event'], payload);
      if (!job) { response.writeHead(204).end(); return; }
      const key = job.installationId + ':' + job.repositoryId + ':' + job.baseSha + ':' + job.sha;
      if (pending.has(key)) { response.writeHead(202).end(); return; }
      if (pending.size >= maxPendingJobs) { response.writeHead(503).end(); return; }
      pending.add(key);
      queue = queue.then(() => processJob(job)).catch(error => {
        log('Skill Preflight job failed:', error.message);
      }).finally(() => pending.delete(key));
      response.writeHead(202).end();
    } catch {
      if (!response.headersSent && !response.destroyed) response.writeHead(400).end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { GITHUB_APP_ID: appId, GITHUB_APP_PRIVATE_KEY: privateKey,
    GITHUB_WEBHOOK_SECRET: secret, PORT = '3000', HOST = '127.0.0.1' } = process.env;
  if (!/^\d+$/.test(appId ?? '') || !privateKey || !secret || !/^\d+$/.test(PORT) || +PORT > 65535) {
    throw new Error('Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET and a valid PORT');
  }
  const processJob = createProcessor({ appId, privateKey });
  createWebhookServer({ secret, processJob }).listen(Number(PORT), HOST, () => {
    console.log('Skill Preflight GitHub App webhook is listening.');
  });
}
