# Product experiment

## Completed

- Shipped a dependency-free CLI and a free GitHub Action with English and Arabic reports. [Marketplace](https://github.com/marketplace/actions/st-laps-skill-preflight)
- Benchmarked 278 skills from ten public repositories at fixed commits. The v0.3.1 scanner reports zero errors on that sample after correcting 37 false errors. The 175 remaining warnings require context. [Benchmark and findings](https://github.com/ST-LAPS/skill-preflight-example/blob/4c596d03f4c9a97ba0cc8ec728e385b01de362f8/BENCHMARK-2026-11-11.md)

## Current gate — real maintainer use

- Start with an external maintainer using the tool on a repository they maintain. Record setup success or the step that blocked them, plus one concrete action or decision the scan helped with, if any.
- Ask the maintainer to update the same report after their next real skill change or release. Count a second dated run on that repository as repeat use. Track missing follow-up as unknown.
- Count distinct external teams once. Exclude ST-LAPS examples, benchmark runs, stars and forks from adoption counts. Record incorrect or unclear findings alongside useful ones. [Pilot feedback template](https://github.com/ST-LAPS/skill-preflight/issues/new?template=pilot-feedback.md)

## Next gate — a paid offer

- If external teams return to the tool and describe a recurring problem, test a concrete offer for that problem. Ask the person who can approve the purchase to decide on a defined deliverable at a stated price.
- Track feature interest, a buyer's acceptance of a priced offer, and payment as separate outcomes. Use evidence from the offer to decide whether subscription infrastructure is warranted.

Hosted history, shared policies, a GitHub App and billing remain unimplemented. External adoption and willingness to pay remain unverified.
