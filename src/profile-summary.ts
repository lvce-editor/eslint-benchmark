interface CpuProfileNode {
  readonly id?: number
  readonly callFrame?: {
    readonly functionName?: string
    readonly url?: string
  }
}

interface TraceEvent {
  readonly name?: string
  readonly args?: {
    readonly data?: {
      readonly cpuProfile?: {
        readonly nodes?: readonly CpuProfileNode[]
        readonly samples?: readonly number[]
      }
    }
  }
}

export interface SampledFunction {
  readonly functionName: string
  readonly url: string
  readonly samples: number
}

export interface SampledProfileSummary {
  readonly functions: readonly SampledFunction[]
  readonly targetSamples: number
  readonly totalSamples: number
  readonly idleSamples: number
}

export const summarizeSampledProfile = (
  traceText: string,
  target: string,
): SampledProfileSummary => {
  const trace = JSON.parse(traceText) as { readonly traceEvents?: readonly TraceEvent[] }
  const functions = new Map<string, SampledFunction>()
  let targetSamples = 0
  let totalSamples = 0
  let idleSamples = 0

  for (const event of trace.traceEvents || []) {
    if (event.name !== 'ProfileChunk') continue
    const profile = event.args?.data?.cpuProfile
    const nodesById = new Map((profile?.nodes || [])
      .filter((node): node is CpuProfileNode & { readonly id: number } => typeof node.id === 'number')
      .map((node) => [node.id, node]))
    for (const sample of profile?.samples || []) {
      totalSamples++
      const node = nodesById.get(sample)
      if (node?.callFrame?.functionName === '(idle)') idleSamples++
      const url = node?.callFrame?.url || ''
      if (!url.includes(target)) continue
      targetSamples++
      const functionName = node?.callFrame?.functionName || '(anonymous)'
      const key = `${url}\0${functionName}`
      const existing = functions.get(key)
      functions.set(key, {
        functionName,
        url,
        samples: (existing?.samples || 0) + 1,
      })
    }
  }

  return {
    functions: [...functions.values()].sort((left, right) => right.samples - left.samples),
    targetSamples,
    totalSamples,
    idleSamples,
  }
}
