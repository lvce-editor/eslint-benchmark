import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEslintWorkerSampleCount } from './profile.ts'

const root = join(fileURLToPath(new URL('..', import.meta.url)))
const html = await readFile(join(root, '.tmp/pages/index.html'), 'utf8')
const results = JSON.parse(await readFile(join(root, '.tmp/pages/results.json'), 'utf8'))
assert.match(html, /Cold:/)
assert.match(html, /Warm:/)
assert.match(html, /profiles\/cold\.json/)
assert.match(html, /profiles\/warm\.json/)
assert.match(html, /viewer\/index\.html#profileURL=/)
assert.ok((await readFile(join(root, '.tmp/pages/viewer/index.html'), 'utf8')).includes('speedscope'))
assert.ok(results.trials.every((trial: { success: boolean }) => trial.success))
for (const mode of ['cold', 'warm']) {
  const profile = await readFile(join(root, `.tmp/pages/profiles/${mode}.json`), 'utf8')
  const target = mode === 'cold' ? 'eslintEvaluationWorkerMain.js' : 'eslintMain.js'
  assert.ok(getEslintWorkerSampleCount(profile, target) > 0, `${mode} profile has no ${target} samples`)
}
console.log('ESLint benchmark report links and trial results passed')
