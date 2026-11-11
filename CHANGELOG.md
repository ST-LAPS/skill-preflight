# Changelog

## 0.3.1 — 2026-11-11

- Fix false errors for indented multiline plain YAML descriptions.
- Resolve `{baseDir}/` relative to the skill directory without bypassing scan boundaries.
- Classify unresolved dynamic destinations and example URL placeholders as review warnings.
- Avoid treating prompt prose or expected-output logs as POSIX command assumptions.
- Clarify that unrecognized prerequisites and portability warnings are review hints, not confirmed upstream defects.
- Add regressions motivated by a ten-repository static benchmark; retain all existing tests.

## 0.3.0 — 2026-11-11

- Add a dependency-free Node.js 24 GitHub Action with English and Arabic job summaries.
- Accept path, language and strict inputs; export numeric skills, errors and warnings counts.
- Constrain action scan paths to the checked-out workspace; treat inputs as data and suspend workflow command parsing during log output.
- Add action integration tests and workflow usage documentation.
- Preserve the standalone CLI. No billing, telemetry or GitHub App added.

## 0.2.0 — 2026-11-11

Experimental preview, not a production guarantee.

- Add Arabic text, Markdown and JSON messages through `--lang ar`.
- Add Arabic CLI help and validation messages, plus an Arabic guide.
- Fix Arabic requirements headings, including diacritics and punctuation.
- Verify Arabic filenames and percent-encoded destinations.
- Keep rule identifiers, JSON keys and severity values stable across languages.
- Fix blank frontmatter fields incorrectly consuming the following line.
- Add an MIT license and tests for Arabic output and CLI behavior.
- No telemetry, billing, model calls, or script execution.

## 0.1.0

Initial private prototype: dependency-free scanner, CLI, fixtures and regression tests.
