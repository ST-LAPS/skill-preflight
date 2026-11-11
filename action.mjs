import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { scan, formatReport } from './preflight.mjs';
import { cliMessage, validateLanguage } from './i18n.mjs';

// Inputs stay data: no shell or child process is used.
const language = process.env.INPUT_LANGUAGE || 'en';
const token = randomUUID();
// Findings can contain repository-controlled filenames: disable workflow commands
// while printing them, then restore commands with an unpredictable token.
process.stdout.write(`::stop-commands::${token}\n`);
try {
  validateLanguage(language);
  const strict = process.env.INPUT_STRICT || 'false';
  if (!['true', 'false'].includes(strict)) throw new Error('Input strict must be true or false.');
  if (!process.env.GITHUB_WORKSPACE) throw new Error('GITHUB_WORKSPACE is required.');
  const workspace = fs.realpathSync(process.env.GITHUB_WORKSPACE);
  const target = path.resolve(workspace, process.env.INPUT_PATH || '.');
  const inside = file => {
    const relative = path.relative(workspace, file);
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
  };
  if (!inside(target) || !inside(fs.realpathSync(target))) throw new Error('Scan path must stay inside GITHUB_WORKSPACE.');
  const report = scan(target);
  process.stdout.write(formatReport(report, 'text', language));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatReport(report, 'markdown', language), 'utf8');
  if (process.env.GITHUB_OUTPUT) {
    // Numeric outputs only; never interpolate repository text into command files.
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `skills=${report.skills}\nerrors=${report.errors}\nwarnings=${report.warnings}\n`, 'utf8');
  }
  process.exitCode = report.errors || (strict === 'true' && report.warnings) ? 1 : 0;
} catch (error) {
  process.stderr.write(`skill-preflight: ${cliMessage(error.message, language)}\n`);
  process.exitCode = 2;
} finally {
  process.stdout.write(`::${token}::\n`);
}
