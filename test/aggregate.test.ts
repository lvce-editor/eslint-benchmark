import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregate } from '../src/aggregate.ts'

test('aggregates successful trial medians and preserves failures', () => {
  assert.deepEqual(aggregate([
    { mode: 'cold', iteration: 1, durationMs: 10, success: true },
    { mode: 'cold', iteration: 2, durationMs: 30, success: true },
    { mode: 'cold', iteration: 3, durationMs: null, success: false, error: 'timeout' },
  ]), {
    trialCount: 3,
    successfulTrials: 2,
    medianMs: 20,
    failures: ['cold trial 3: timeout'],
  })
})

test('does not turn an all-failed run into a zero measurement', () => {
  assert.equal(aggregate([
    { mode: 'warm', iteration: 1, durationMs: null, success: false, error: 'no worker' },
  ]).medianMs, null)
})
