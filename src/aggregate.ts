export interface Trial {
  readonly mode: 'cold' | 'warm'
  readonly iteration: number
  readonly durationMs: number | null
  readonly success: boolean
  readonly error?: string
}

export interface Summary {
  readonly trialCount: number
  readonly successfulTrials: number
  readonly medianMs: number | null
  readonly failures: readonly string[]
}

const median = (values: number[]): number | null => {
  if (!values.length) return null
  values.sort((left, right) => left - right)
  const middle = Math.floor(values.length / 2)
  return values.length % 2
    ? values[middle]!
    : (values[middle - 1]! + values[middle]!) / 2
}

export const aggregate = (trials: readonly Trial[]): Summary => ({
  trialCount: trials.length,
  successfulTrials: trials.filter((trial) => trial.success).length,
  medianMs: median(
    trials.flatMap((trial) =>
      trial.success && trial.durationMs !== null ? [trial.durationMs] : [],
    ),
  ),
  failures: trials.flatMap((trial) =>
    trial.success ? [] : [`${trial.mode} trial ${trial.iteration}: ${trial.error || 'unknown failure'}`],
  ),
})
