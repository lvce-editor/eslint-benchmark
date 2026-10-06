# ESLint diagnostic benchmark

This Node 26 project measures cold launch-to-diagnostics and warm cached lint requests in the ESLint extension. GitHub Actions runs cross-platform unit checks, benchmarks on Ubuntu, and deploys the report to GitHub Pages from `main`.

## Run

On Linux with Node 26, npm, and Chromium dependencies:

```sh
npm ci
npx playwright install --only-shell chromium
npm run setup
ITERATIONS=5 npm run benchmark
npm run report
npm run test:report
```

`setup` downloads and SHA-256 verifies ESLint extension `v1.24.1` and installs pinned ESLint `10.12.0` for the fixture. Each trial starts a fresh LVCE server and Chromium browser with isolated XDG application directories. The checked-in fixture enables only `no-debugger` and contains `debugger;`, so a successful measurement must return exactly one error with the expected rule, message, line, column, and URI.

## Measurement boundaries

Cold timing starts before a fresh server and browser launch and ends when the first `eslint.lint` command returns the expected diagnostic. Warm timing repeats the identical request after the cold result has been saved, reloading the editor page while retaining its isolated browser profile and server. This deliberately measures the extension's persisted `LintResultCache` path and does not claim to measure a fresh ESLint evaluation. Every trial validates results. Missing diagnostics, worker/server failures, and timeouts are recorded as failures and make the run fail; they are never represented as zero.

Separate launches capture cold and warm Chromium CPU profiles using the V8 CPU profiler trace category at 1 kHz. The harness verifies that the cold profile contains sampled stacks from `eslintEvaluationWorkerMain.js` and the warm cache-hit profile contains samples from `eslintMain.js`, where diagnostic results are restored. Profile runs do not contribute to readiness statistics. Raw traces are retained for download and opened with self-hosted Speedscope `1.25.0`, so the viewer reads the same-origin profile files. The report shows exact version metadata, individual trial outcomes, summaries, and profile links.

The report charts cold and warm medians from successful unprofiled trials and shows every individual trial outcome. It also charts each separate CPU profile by sampled self-frame counts from the ESLint worker script. Those counts are sampling points, not milliseconds, wall time, or a complete process CPU breakdown; profile runs do not contribute to readiness medians. The raw JSON results and cold/warm profiles remain downloadable, and both profiles open in the self-hosted Speedscope viewer.

The workflow requires all four test matrix jobs and the Ubuntu benchmark/report checks before merge. A successful main deployment publishes the report and its raw profile artifacts.
