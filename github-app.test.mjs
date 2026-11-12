import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, verify } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createProcessor, createWebhookServer } from './github-app.mjs';

const sha = 'a'.repeat(40);
const treeSha = 'b'.repeat(40);
const skillSha = 'c'.repeat(40);
const payload = {
  action: 'opened',
  installation: { id: 42 },
  repository: { id: 7, full_name: 'ST-LAPS/example' },
  pull_request: { draft: false, head: { sha, repo: { id: 7 } } },
};
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const skill = Buffer.from('---\nname: example\ndescription: A test skill.\n---\n[Valid](present.md)\n[Broken](missing.md)\n');

function githubMock({ treeOverride, existing = [] } = {}) {
  const writes = [];
  const fetchImpl = async (input, { method, headers, body }) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://api.github.com');
    if (url.pathname === '/app/installations/42/access_tokens') {
      assert.equal(method, 'POST');
      assert.deepEqual(JSON.parse(body), { repository_ids: [7] });
      const [header, claims, signature] = headers.Authorization.slice(7).split('.');
      assert.equal(JSON.parse(Buffer.from(claims, 'base64url')).iss, '100');
      assert.ok(verify('RSA-SHA256', Buffer.from(header + '.' + claims),
        privateKey, Buffer.from(signature, 'base64url')));
      return Response.json({ token: 'test-token' });
    }
    assert.equal(headers.Authorization, 'Bearer test-token');
    if (url.pathname.endsWith('/commits/' + sha + '/check-runs')) {
      assert.equal(url.searchParams.get('app_id'), '100');
      return Response.json({ check_runs: existing });
    }
    if (url.pathname.endsWith('/git/commits/' + sha)) return Response.json({ tree: { sha: treeSha } });
    if (url.pathname.endsWith('/git/trees/' + treeSha)) {
      assert.equal(url.searchParams.get('recursive'), '1');
      return Response.json(treeOverride ?? { truncated: false, tree: [
        { path: 'SKILL.md', type: 'blob', mode: '100644', size: skill.length, sha: skillSha },
        { path: 'present.md', type: 'blob', mode: '100644', size: 10 },
      ] });
    }
    if (url.pathname.endsWith('/git/blobs/' + skillSha)) {
      return Response.json({ encoding: 'base64', content: skill.toString('base64') });
    }
    if (url.pathname.endsWith('/check-runs') && method === 'POST') {
      writes.push(JSON.parse(body));
      return Response.json({ id: 10 }, { status: 201 });
    }
    assert.fail('Unexpected GitHub route: ' + url.pathname);
  };
  return { fetchImpl, writes };
}

test('signed webhook creates a failing check for the pinned PR commit', { timeout: 5000 }, async t => {
  const { fetchImpl, writes } = githubMock();
  const processor = createProcessor({ appId: '100', privateKey, fetchImpl, log: () => {} });
  let completed;
  const done = new Promise(resolve => { completed = resolve; });
  const server = createWebhookServer({
    secret: 'local-test-secret',
    processJob: job => processor(job).then(() => completed()),
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/github/webhook';
  const send = async (data, signed = true) => {
    const body = JSON.stringify(data);
    const digest = createHmac('sha256', 'local-test-secret').update(body).digest('hex');
    return fetch(endpoint, { method: 'POST', body, headers: {
      'X-GitHub-Event': 'pull_request',
      'X-Hub-Signature-256': 'sha256=' + (signed ? digest : '0'.repeat(64)),
    } });
  };
  assert.equal((await send(payload, false)).status, 401);
  const fork = structuredClone(payload);
  fork.pull_request.head.repo.id = 8;
  assert.equal((await send(fork)).status, 204);
  assert.equal((await send(payload)).status, 202);
  await done;
  assert.equal(writes.length, 1);
  assert.equal(writes[0].head_sha, sha);
  assert.equal(writes[0].conclusion, 'failure');
  assert.match(writes[0].output.summary, /LINK_MISSING.*missing\.md/);
  assert.doesNotMatch(writes[0].output.summary, /present\.md/);
});

test('an unsafe Git path results in a neutral check', async () => {
  const { fetchImpl, writes } = githubMock({ treeOverride: {
    truncated: false,
    tree: [{ path: '../outside', type: 'blob', mode: '100644' }],
  } });
  const processor = createProcessor({ appId: '100', privateKey, fetchImpl, log: () => {} });
  await processor({ installationId: 42, repositoryId: 7, repo: 'ST-LAPS/example', sha });
  assert.equal(writes[0].conclusion, 'neutral');
});

test('redelivery does not duplicate a completed check', async () => {
  const { fetchImpl, writes } = githubMock({ existing: [{
    id: 10, status: 'completed', conclusion: 'failure', external_id: 'skill-preflight:7:' + sha,
  }] });
  const processor = createProcessor({ appId: '100', privateKey, fetchImpl, log: () => {} });
  await processor({ installationId: 42, repositoryId: 7, repo: 'ST-LAPS/example', sha });
  assert.deepEqual(writes, []);
});
