# Skill Preflight

**Catch broken skill bundles before your users do.**

[العربية](README.ar.md) · [License](LICENSE) · [Changes](CHANGELOG.md)

An early ST-LAPS developer tool for inspecting agent `SKILL.md` bundles. Finds missing local Markdown links, undeclared command runtimes, and common POSIX-shell assumptions. Static checks only: it never executes skill instructions or scripts, calls a model, or sends your files to a server.

**Status: v0.2.0 experimental preview.** English and Arabic reports. Not published to npm or GitHub Marketplace. No paid plans or subscriptions are active.

## Quick start

Requirements: Node.js 20 or newer and Git, on Windows, macOS, or Linux. No npm dependencies, API key, or account required for local checks.

```sh
git clone https://github.com/ST-LAPS/skill-preflight.git
cd skill-preflight
node cli.mjs examples/ready
node cli.mjs examples/broken --format markdown
node --test
```

The broken example intentionally exits with code 1. This preview needs feedback on real skill bundles; supported static checks are described below.

## Scan your skills

```sh
node cli.mjs /path/to/your/skills
node cli.mjs /path/to/your/skills --format json --output report.json
node cli.mjs /path/to/your/skills --strict
node cli.mjs /path/to/your/skills --lang ar --format markdown
```

On Windows use a quoted Windows path, for example `node cli.mjs "C:\work\my-skills"`. A directory scan discovers nested `SKILL.md` files and skips `.git`, `node_modules`, `.venv`, `vendor`, and `coverage`. Symlink directories are not traversed. Relative references are resolved from each skill directory, with the scan directory as their allowed boundary. Scan the repository root if skills intentionally share parent resources.

## What it checks

| Rule | Level | Meaning |
|---|---|---|
| META_FRONTMATTER | Error | Frontmatter is absent |
| META_REQUIRED | Error | Name or description is empty |
| LINK_MISSING | Error | Inline local Markdown destination is missing |
| LINK_OUTSIDE_ROOT | Warning | A local link escapes the scan directory |
| LINK_ENCODING | Warning | Local destination has invalid percent encoding |
| RUNTIME_UNDECLARED | Warning | A recognized command runtime is absent from Requirements |
| PORTABILITY_SHELL | Warning | A shell example assumes POSIX conventions |
| NO_SKILLS | Error | Nothing was found to scan |

Declare prerequisites under `## Requirements`, `## Prerequisites`, `## Dependencies`, `## المتطلبات`, or `## متطلبات التشغيل`. Arabic headings with diacritics and Arabic filenames are supported. Name runtimes using their canonical names (for example `Python` or `Node.js`). Runtime detection covers common Node, Python, Bash, PowerShell and Git commands in shell code fences. Portability warnings are review prompts, including for intentionally Unix-only skills; they are not claims of confirmed Windows failures.

Exit codes: **0** no errors, **1** errors (or warnings with `--strict`), **2** usage or filesystem failure. Output formats: `text`, `json`, `markdown`.

Use `--lang en` (default) or `--lang ar` for report messages, help and CLI validation errors. JSON field names, rule identifiers and severity values remain stable in both languages. Native filesystem errors retain technical details. Arabic output requires a UTF-8 terminal and suitable font. The scanner checks structure and links; it does not understand or grade Arabic or English prose.

## GitHub Actions

Copy this workflow to your own repository and replace `./skills` with your skill directory. Pin external actions and this repository to reviewed commit SHAs for production use.

```yaml
name: Skill readiness
on: [push, pull_request]
permissions:
  contents: read
jobs:
  preflight:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          package-manager-cache: false
      # Put reviewed copies of cli.mjs, preflight.mjs and i18n.mjs in tools/preflight/.
      - run: node tools/preflight/cli.mjs ./skills --format markdown --output preflight-report.md
      - if: always()
        shell: bash
        run: cat preflight-report.md >> "$GITHUB_STEP_SUMMARY"
```

This is a CLI with an Actions recipe, not a published reusable GitHub Action or installed GitHub App. Checks can be run locally without consuming GitHub Actions minutes.

## Limits

The scanner recognizes a small frontmatter subset and inline Markdown links, not all YAML or CommonMark syntax. It does not validate reference-style links, Markdown anchors, remote URLs, shell syntax, dependencies at runtime, prompt quality, or behavior under a model. A clean report is not a security audit or compatibility guarantee. It does not promise cost savings. Do not run untrusted skill scripts as part of manual review.

## Product direction

Local checks are the first experiment. Possible future team features include private-repository history, shared policies and change reports. Pricing is unvalidated and billing is not implemented. We will measure useful findings, false positives, repeat usage and actual demand before building paid infrastructure.

## العربية

أداة تجريبية لفحص ملفات المهارات وروابطها ومتطلبات تشغيلها. تدعم التقارير بالعربية والإنجليزية، وتعمل محليًا دون تشغيل السكربتات أو إرسال الملفات. ابدأ باستخدام `node cli.mjs examples/ready --lang ar` أو اقرأ [الدليل العربي](README.ar.md).

Report reproducible problems through this repository's Issues. Include a small non-sensitive example and the expected result.
