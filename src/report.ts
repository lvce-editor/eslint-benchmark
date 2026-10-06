import { cp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pages = join(root, '.tmp/pages')
const results = JSON.parse(await readFile(join(root, 'results/results.json'), 'utf8')) as {
  metadata: { extension: { version: string }; server: string }
  boundaries: { cold: string; warm: string; profiles: string }
  summaries: Record<'cold' | 'warm', { medianMs: number | null; successfulTrials: number; trialCount: number; failures: string[] }>
  trials: { mode: 'cold' | 'warm'; iteration: number; success: boolean; durationMs: number | null; error?: string }[]
}
await rm(pages, { recursive: true, force: true })
await mkdir(join(pages, 'profiles'), { recursive: true })
await cp(join(root, 'node_modules/speedscope/dist/release'), join(pages, 'viewer'), { recursive: true })
for (const mode of ['cold', 'warm'] as const) {
  const profile = join(root, `results/${mode}-0/cpu-profile.json`)
  await copyFile(profile, join(pages, `profiles/${mode}.json`))
}
await copyFile(join(root, 'results/results.json'), join(pages, 'results.json'))
const row = (mode: 'cold' | 'warm'): string => {
  const summary = results.summaries[mode]
  const duration = summary.medianMs === null ? 'No successful trials' : `${summary.medianMs.toFixed(1)} ms`
  const profileUrl = `https://lvce-editor.github.io/eslint-benchmark/profiles/${mode}.json`
  const viewerUrl = `viewer/index.html#profileURL=${encodeURIComponent(profileUrl)}&title=ESLint%20${mode}%20CPU%20profile`
  return `<tr><th>${mode}</th><td>${duration}</td><td>${summary.successfulTrials}/${summary.trialCount}</td><td><a href="profiles/${mode}.json">Download raw profile</a> · <a href="${viewerUrl}">Open profile in Speedscope</a></td></tr>`
}
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ESLint diagnostic benchmark</title>
<style>body{font:16px system-ui;max-width:960px;margin:3rem auto;padding:0 1rem;color:#202124}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #ddd;padding:.7rem}code{background:#f3f3f3;padding:.15rem .3rem}.muted{color:#555}</style>
<h1>ESLint diagnostic readiness</h1><p>ESLint ${results.metadata.extension.version}; ${results.metadata.server}; Node ${process.version}</p>
<table><thead><tr><th>Mode</th><th>Median</th><th>Successful trials</th><th>CPU profile</th></tr></thead><tbody>${row('cold')}${row('warm')}</tbody></table>
<h2>Measurement boundaries</h2><p><strong>Cold:</strong> ${results.boundaries.cold}</p><p><strong>Warm:</strong> ${results.boundaries.warm}</p><p><strong>Profiles:</strong> ${results.boundaries.profiles}. Profiles are Chromium trace captures with 1 kHz V8 CPU sampling. The cold profile includes sampled ESLint evaluation worker stacks; the warm cache-hit profile includes sampled extension host stacks. Readiness values exclude profiler overhead.</p>
<h2>Trials</h2><p>Fixture <code>debugger;</code> must yield exactly one <code>no-debugger</code> diagnostic at line 1, column 1 with the expected message. Failed trials and timeouts remain failures and never produce zero measurements.</p><ul>${results.trials.map((trial) => `<li>${trial.mode} ${trial.iteration}: ${trial.success ? `${trial.durationMs?.toFixed(1)} ms` : `failed — ${trial.error || 'unknown error'}`}</li>`).join('')}</ul>
<p class="muted">Raw data is available in <a href="results.json">results.json</a>.</p></html>`
await writeFile(join(pages, 'index.html'), html)
console.log(`Wrote report to ${pages}`)
