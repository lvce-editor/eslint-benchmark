import assert from 'node:assert/strict'
import test from 'node:test'
import { expectedDiagnostic, validateDiagnostics } from '../src/diagnostics.ts'

test('accepts the fixture diagnostic only when rule, message, location and URI match', () => {
  assert.equal(validateDiagnostics([{ ...expectedDiagnostic, endColumnIndex: 9, endRowIndex: 0, uri: 'file:///workspace/benchmark.js' }], 'file:///workspace/benchmark.js').length, 1)
})

test('rejects missing or unexpected diagnostics', () => {
  assert.throws(() => validateDiagnostics([], 'file:///workspace/benchmark.js'), /Expected one/)
  assert.throws(() => validateDiagnostics([{ ...expectedDiagnostic, source: 'other', endColumnIndex: 9, endRowIndex: 0, uri: 'file:///workspace/benchmark.js' }], 'file:///workspace/benchmark.js'), /Unexpected/)
})
