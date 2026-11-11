import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const entry = path.resolve('action.mjs');
function workspace(t, body = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-action-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'SKILL.md'),'---\nname: example\ndescription: A test skill\n---\n'+body);
  return root;
}
function run(root, extra = {}) {
  const env = { ...process.env, GITHUB_WORKSPACE:root, GITHUB_STEP_SUMMARY:path.join(root,'summary.md'), GITHUB_OUTPUT:path.join(root,'outputs.txt'), INPUT_PATH:'.', INPUT_LANGUAGE:'en', INPUT_STRICT:'false', ...extra };
  return spawnSync(process.execPath,[entry],{env,encoding:'utf8'});
}

test('Action scans caller workspace, writes Arabic summary and numeric outputs', t => {
  const root = workspace(t);
  const r = run(root,{INPUT_LANGUAGE:'ar'});
  assert.equal(r.status,0,r.stderr);
  assert.match(fs.readFileSync(path.join(root,'summary.md'),'utf8'),/فحص المهارات/);
  assert.equal(fs.readFileSync(path.join(root,'outputs.txt'),'utf8'),'skills=1\nerrors=0\nwarnings=0\n');
});

test('Action fails for missing files and preserves useful reports', t => {
  const root = workspace(t,'[guide](missing.md)');
  assert.equal(run(root).status,1);
  assert.match(fs.readFileSync(path.join(root,'summary.md'),'utf8'),/LINK_MISSING/);
  assert.match(fs.readFileSync(path.join(root,'outputs.txt'),'utf8'),/errors=1/);
});

test('Action strict mode and invalid inputs use explicit exit codes', t => {
  const root = workspace(t,'```sh\npython3 build.py\n```');
  assert.equal(run(root).status,0);
  assert.equal(run(root,{INPUT_STRICT:'true'}).status,1);
  assert.equal(run(root,{INPUT_STRICT:'yes'}).status,2);
  assert.equal(run(root,{INPUT_LANGUAGE:'fr'}).status,2);
  assert.equal(run(root,{GITHUB_WORKSPACE:''}).status,2);
});

test('Action rejects caller paths outside the workspace', t => {
  const root = workspace(t);
  const r = run(root,{INPUT_PATH:'..'});
  assert.equal(r.status,2);
  assert.match(r.stderr,/inside GITHUB_WORKSPACE/);
  assert.equal(fs.existsSync(path.join(root,'outputs.txt')),false);
});

test('Action suspends workflow commands while printing repository text', t => {
  const root = workspace(t,'[guide](::warning::untrusted)');
  const r = run(root);
  const lines = r.stdout.trim().split(/\r?\n/);
  const token = lines[0].slice('::stop-commands::'.length);
  assert.match(lines[0],/^::stop-commands::[a-f0-9-]{36}$/);
  assert.equal(lines.at(-1),`::${token}::`);
});
