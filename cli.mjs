#!/usr/bin/env node
import fs from 'node:fs';
import { scan, formatReport } from './preflight.mjs';

const args = process.argv.slice(2);
try {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node cli.mjs [directory|SKILL.md] [--format text|json|markdown] [--output file] [--strict]\nExit: 0 passed, 1 findings (warnings fail only with --strict), 2 usage/I/O error.\nStatic inspection only. Never executes skill scripts or contacts a network.');
  } else {
    let target = null, format = 'text', output = null, strict = false;
    for (let i=0; i<args.length; i++) {
      const arg = args[i];
      if (arg === '--strict') strict = true;
      else if (arg === '--format' || arg === '--output') {
        const value = args[++i];
        if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value.`);
        if (arg === '--format') format = value; else output = value;
      } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
      else if (target !== null) throw new Error('Only one scan path is accepted.');
      else target = arg;
    }
    if (!['text','json','markdown'].includes(format)) throw new Error('Format must be text, json, or markdown.');
    const result = scan(target ?? '.');
    const report = formatReport(result, format);
    if (output) fs.writeFileSync(output, report, 'utf8'); else process.stdout.write(report);
    process.exitCode = result.errors || (strict && result.warnings) ? 1 : 0;
  }
} catch (error) { console.error(`skill-preflight: ${error.message}`); process.exitCode = 2; }
