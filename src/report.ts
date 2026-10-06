import { cp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aggregate, type Trial } from './aggregate.ts'
import { summarizeSampledProfile } from './profile-summary.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pages = join(root, '.tmp/pages')
const results = JSON.parse(await readFile(join(root, 'results/results.json'), 'utf8')) as {
  metadata: { extension: { version: string }; server: string; node: string }
  fixture: { expectedRule: string; sha256: string }
  boundaries: { cold: string; warm: string; profiles: string }
  trials: Trial[]
}

const escapeHtml = (value: unknown): string => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const chart = (
  title: string,
  labels: readonly string[],
  values: readonly (number | null)[],
  unit: string,
): string => {
  const max = Math.max(1, ...values.filter((value): value is number => value !== null))
  const rows = labels.map((label, index) => {
    const value = values[index]
    const width = value === null ? 0 : Math.max(1, value / max * 100)
    const formatted = value === null ? 'unavailable' : `${value.toFixed(unit === 'samples' ? 0 : 1)} ${unit}`
    return `<div class="metric"><div class="metric-label"><span>${escapeHtml(label)}</span><strong>${formatted}</strong></div><div class="track" aria-hidden="true"><span style="width:${width}%"></span></div></div>`
  }).join('')
  return `<section><h2>${escapeHtml(title)}</h2>${rows || '<p>No measurements available.</p>'}</section>`
}

const unprofiledTrials = results.trials.filter((trial) => trial.iteration > 0)
const summaries = {
  cold: aggregate(unprofiledTrials.filter((trial) => trial.mode === 'cold')),
  warm: aggregate(unprofiledTrials.filter((trial) => trial.mode === 'warm')),
}
const readiness = `${chart('Readiness median · successful unprofiled trials', ['Cold', 'Warm'], [summaries.cold.medianMs, summaries.warm.medianMs], 'ms')}<p class="meta">Successful unprofiled trials: cold ${summaries.cold.successfulTrials}/${summaries.cold.trialCount}; warm ${summaries.warm.successfulTrials}/${summaries.warm.trialCount}. Profile captures are excluded.</p>`
const trialRows = unprofiledTrials.map((trial) => ({
  label: `${trial.mode} trial ${trial.iteration}${trial.success ? '' : ' · failed'}`,
  value: trial.success ? trial.durationMs : null,
}))
const trialChart = chart('Individual readiness trials', trialRows.map((trial) => trial.label), trialRows.map((trial) => trial.value), 'ms')
const failureRows = unprofiledTrials.filter((trial) => !trial.success)
  .map((trial) => `<li class="failure">${escapeHtml(`${trial.mode} trial ${trial.iteration}: ${trial.error || 'unknown failure'}`)}</li>`)
const failures = `<section><h2>Failed trials</h2>${failureRows.length ? `<ul>${failureRows.join('')}</ul>` : '<p>None</p>'}</section>`

const coldProfilePath = join(root, 'results/cold-0/cpu-profile.json')
const warmProfilePath = join(root, 'results/warm-0/cpu-profile.json')
const coldProfile = await readFile(coldProfilePath, 'utf8')
const warmProfile = await readFile(warmProfilePath, 'utf8')
const coldCpu = summarizeSampledProfile(coldProfile, 'eslintEvaluationWorkerMain.js')
const warmCpu = summarizeSampledProfile(warmProfile, 'eslintMain.js')
const cpuChart = (mode: 'cold' | 'warm', profile: typeof coldCpu): string => {
  const topFunctions = profile.functions.slice(0, 10)
  const rows = topFunctions.map((fn) => `${fn.functionName} · ${fn.url.split('/').at(-1)}`)
  return chart(`${mode[0]!.toUpperCase()}${mode.slice(1)} profile · worker-script sampled CPU`, rows, topFunctions.map((fn) => fn.samples), 'samples')
}

await rm(pages, { recursive: true, force: true })
await mkdir(join(pages, 'profiles'), { recursive: true })
await cp(join(root, 'node_modules/speedscope/dist/release'), join(pages, 'viewer'), { recursive: true })
await copyFile(coldProfilePath, join(pages, 'profiles/cold.json'))
await copyFile(warmProfilePath, join(pages, 'profiles/warm.json'))
await copyFile(join(root, 'results/results.json'), join(pages, 'results.json'))

const profileRow = (mode: 'cold' | 'warm'): string => {
  const profileUrl = `https://lvce-editor.github.io/eslint-benchmark/profiles/${mode}.json`
  const viewerUrl = `viewer/index.html#profileURL=${encodeURIComponent(profileUrl)}&title=ESLint%20${mode}%20CPU%20profile`
  return `<tr><th>${mode}</th><td><a href="profiles/${mode}.json">Download raw profile</a> · <a href="${viewerUrl}">Open profile in Speedscope</a></td></tr>`
}

const report = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ESLint diagnostic benchmark</title>
<style>body{font:16px system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:0 20px;color:#17212b;background:#f7f9fb}h1{font-size:2rem}h2{font-size:1.25rem}section{background:white;border:1px solid #dce3ea;border-radius:8px;padding:18px;margin:18px 0}.metric{margin:14px 0}.metric-label{display:flex;justify-content:space-between;gap:12px}.track{height:12px;background:#e7edf3;border-radius:6px;overflow:hidden;margin-top:6px}.track span{display:block;height:100%;background:#2276b8}.failure{color:#9c2630;white-space:pre-wrap;font-family:monospace}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #dce3ea;padding:8px}.meta{font-size:.9rem;color:#455565}</style>
<body><h1>ESLint diagnostic readiness</h1><p>ESLint ${escapeHtml(results.metadata.extension.version)}; ${escapeHtml(results.metadata.server)}; Node ${escapeHtml(results.metadata.node)}</p>
${readiness}${trialChart}${failures}
<section><h2>CPU profiles</h2><p>Separate profiled runs, excluded from readiness summaries. Each chart counts CPU sampling points whose sampled frame belongs to the named worker script; counts are not milliseconds, wall time, or a complete process CPU breakdown. Each sample contributes to one self frame. Low sample counts provide coarse evidence.</p><table><thead><tr><th>Profile</th><th>Raw profile and interactive viewer</th></tr></thead><tbody>${profileRow('cold')}${profileRow('warm')}</tbody></table></section>
${cpuChart('cold', coldCpu)}${cpuChart('warm', warmCpu)}
<section class="meta"><h2>Measurement boundaries</h2><p><strong>Cold:</strong> ${escapeHtml(results.boundaries.cold)}</p><p><strong>Warm:</strong> ${escapeHtml(results.boundaries.warm)}</p><p><strong>Profile capture:</strong> ${escapeHtml(results.boundaries.profiles)}. Cold samples are from the ESLint evaluation worker; warm samples are from the extension host's ESLint entry script. Profiles are separate measurements and readiness excludes profiler overhead.</p><p>Each successful trial validates the exact <code>no-debugger</code> diagnostic for the <code>debugger;</code> fixture. Failed trials and timeouts remain failures, not zero measurements. Fixture SHA-256: <code>${escapeHtml(results.fixture.sha256)}</code>; expected rule: <code>${escapeHtml(results.fixture.expectedRule)}</code>.</p><p>Raw data is available in <a href="results.json">results.json</a>.</p></section></body></html>`
await writeFile(join(pages, 'index.html'), report)
console.log(`Wrote report to ${pages}`)
