#!/usr/bin/env node
import fs from 'node:fs';
import { scan, formatReport } from './preflight.mjs';
import { cliMessage, help, validateLanguage } from './i18n.mjs';

const args = process.argv.slice(2);
let language = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'en';
try {
  validateLanguage(language);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(help(language));
  } else {
    let target = null, format = 'text', output = null, strict = false;
    for (let i=0; i<args.length; i++) {
      const arg = args[i];
      if (arg === '--strict') strict = true;
      else if (arg === '--format' || arg === '--output' || arg === '--lang') {
        const value = args[++i];
        if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value.`);
        if (arg === '--format') format = value; else if (arg === '--lang') language = value; else output = value;
      } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
      else if (target !== null) throw new Error('Only one scan path is accepted.');
      else target = arg;
    }
    if (!['text','json','markdown'].includes(format)) throw new Error('Format must be text, json, or markdown.');
    validateLanguage(language);
    const result = scan(target ?? '.');
    const report = formatReport(result, format, language);
    if (output) fs.writeFileSync(output, report, 'utf8'); else process.stdout.write(report);
    process.exitCode = result.errors || (strict && result.warnings) ? 1 : 0;
  }
} catch (error) { console.error(`skill-preflight: ${cliMessage(error.message, language)}`); process.exitCode = 2; }
