import assert from 'node:assert/strict'
import test from 'node:test'
import { getEslintWorkerSampleCount } from '../src/profile.ts'

test('counts sampled ESLint evaluation worker stacks in Chromium trace chunks', () => {
  const trace = JSON.stringify({ traceEvents: [{
    name: 'ProfileChunk',
    args: { data: { cpuProfile: {
      nodes: [
        { id: 1, callFrame: { url: 'eslintEvaluationWorkerMain.js' } },
        { id: 2, callFrame: { url: 'other.js' } },
      ],
      samples: [1, 2, 1],
    } } },
  }] })
  assert.equal(getEslintWorkerSampleCount(trace), 2)
  assert.equal(getEslintWorkerSampleCount(trace, 'eslintMain.js'), 0)
})
