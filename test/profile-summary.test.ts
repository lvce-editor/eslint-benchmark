import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeSampledProfile } from '../src/profile-summary.ts'

test('counts self samples from the requested worker script without estimating milliseconds', () => {
  const trace = JSON.stringify({ traceEvents: [{
    name: 'ProfileChunk',
    args: { data: { cpuProfile: {
      nodes: [
        { id: 1, callFrame: { functionName: '(root)', url: '' } },
        { id: 2, callFrame: { functionName: 'lint', url: 'file:///eslintEvaluationWorkerMain.js' } },
        { id: 3, callFrame: { functionName: 'restore', url: 'file:///eslintMain.js' } },
        { id: 4, callFrame: { functionName: '(idle)', url: '' } },
      ],
      samples: [2, 2, 3, 4],
    } } },
  }] })

  assert.deepEqual(summarizeSampledProfile(trace, 'eslintEvaluationWorkerMain.js'), {
    functions: [{ functionName: 'lint', url: 'file:///eslintEvaluationWorkerMain.js', samples: 2 }],
    targetSamples: 2,
    totalSamples: 4,
    idleSamples: 1,
  })
})
