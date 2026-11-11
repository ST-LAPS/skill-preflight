import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scan, formatReport } from './preflight.mjs';

const header = '---\nname: test-skill\ndescription: A test skill.\n---\n';
function fixture(t, text, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-preflight-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'SKILL.md'),text);
  for(const [name,content] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true}); fs.writeFileSync(path.join(root,name),content); }
  return root;
}
test('ready bundle passes and includes no absolute paths',t=>{
  const root=fixture(t,header+'## Requirements\nNode.js 20\n[guide](guide.md)\n```sh\nnode --version\n```',{ 'guide.md':'ok' });
  const report=scan(root); assert.equal(report.errors,0); assert.equal(report.warnings,0); assert.ok(!JSON.stringify(report).includes(root));
});
test('missing local files fail with line numbers',t=>{
  const r=scan(fixture(t,header+'[guide](gone.md)\n')); assert.equal(r.errors,1); assert.equal(r.findings[0].rule,'LINK_MISSING'); assert.equal(r.findings[0].line,5);
});
test('external links, inline code and fenced code are not opened',t=>{
  const r=scan(fixture(t,header+'[web](https://invalid.example/a)\n`[ignore](gone.md)`\n```md\n[ignore](also-gone.md)\n```')); assert.equal(r.errors,0);
});
test('URL-encoded local link and anchor resolve',t=>{
  const r=scan(fixture(t,header+'[guide](my%20guide.md#section)',{'my guide.md':'ok'})); assert.equal(r.errors,0);
});
test('parent reference within repository is valid',t=>{
  const root=fixture(t,header,{'child/SKILL.md':header+'[parent](../guide.md)','guide.md':'ok'}); assert.equal(scan(root).errors,0);
});
test('outside-root link is a warning, never followed',t=>{
  const r=scan(fixture(t,header+'[outside](../../elsewhere.md)')); assert.equal(r.errors,0); assert.equal(r.findings[0].rule,'LINK_OUTSIDE_ROOT');
});
test('frontmatter missing and empty fields fail',t=>{
  assert.equal(scan(fixture(t,'# No metadata')).findings[0].rule,'META_FRONTMATTER');
  const r=scan(fixture(t,'---\nname: ""\ndescription: null\n---\n')); assert.equal(r.errors,2);
});
test('multiline YAML description recognized',t=>{
  const r=scan(fixture(t,'---\nname: demo\ndescription: |\n  First line\n  Second line\n---\n')); assert.equal(r.errors,0);
});
test('empty multiline metadata fails',t=>{
  const r=scan(fixture(t,'---\nname: demo\ndescription: |\n---\n')); assert.equal(r.errors,1);
});
test('BOM and CRLF work',t=>{
  assert.equal(scan(fixture(t,'\uFEFF'+header.replaceAll('\n','\r\n'))).errors,0);
});
test('runtime warnings are deduplicated and ignore comments',t=>{
  const r=scan(fixture(t,header+'```sh\n# npm install\npython3 x.py\npython3 y.py\nnpx thing\n```')); assert.equal(r.warnings,2);
});
test('requirements end at next sibling heading',t=>{
  const r=scan(fixture(t,header+'## Requirements\nNone\n## Notes\nPython\n```sh\npython3 x.py\n```')); assert.equal(r.findings[0].rule,'RUNTIME_UNDECLARED');
});
test('POSIX assumptions are warnings',t=>{
  const r=scan(fixture(t,header+'```bash\nexport OUT=/tmp/out\nchmod +x script\n```')); assert.equal(r.warnings,2);
});
test('ignored directories are not scanned',t=>{
  const root=fixture(t,header,{'node_modules/pkg/SKILL.md':'broken','.git/SKILL.md':'broken'}); assert.equal(scan(root).skills,1);
});
test('no skills fails rather than reporting success',t=>{
  const root=fixture(t,header); fs.unlinkSync(path.join(root,'SKILL.md')); assert.equal(scan(root).findings[0].rule,'NO_SKILLS');
});
test('Markdown escapes report-controlled table and HTML characters',()=>{
  const text=formatReport({skills:1,errors:1,warnings:0,findings:[{file:'a|b',line:1,rule:'LINK_MISSING',severity:'error',message:'<script>|x'}]},'markdown'); assert.ok(text.includes('a\\|b')); assert.ok(text.includes('&lt;script&gt;\\|x'));
});
test('CLI exit codes and strict mode',t=>{
  const root=fixture(t,header+'```sh\npython3 a.py\n```');
  const cli=path.resolve('cli.mjs');
  assert.equal(spawnSync(process.execPath,[cli,root]).status,0);
  assert.equal(spawnSync(process.execPath,[cli,root,'--strict']).status,1);
  assert.equal(spawnSync(process.execPath,[cli,root,'--format','xml']).status,2);
  assert.equal(spawnSync(process.execPath,[cli,root,'--bogus']).status,2);
});
