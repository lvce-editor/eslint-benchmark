import { writeFile } from 'node:fs/promises'
import type { CDPSession } from 'playwright'

interface CpuProfileNode {
  readonly id?: number
  readonly callFrame?: { readonly url?: string }
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

export const getEslintWorkerSampleCount = (
  traceText: string,
  target = 'eslintEvaluationWorkerMain.js',
): number => {
  const trace = JSON.parse(traceText) as { readonly traceEvents?: readonly TraceEvent[] }
  let sampleCount = 0
  for (const event of trace.traceEvents || []) {
    if (event.name !== 'ProfileChunk') continue
    const profile = event.args?.data?.cpuProfile
    const nodeIds = new Set((profile?.nodes || [])
      .filter((node) => node.callFrame?.url?.includes(target))
      .flatMap((node) => typeof node.id === 'number' ? [node.id] : []))
    sampleCount += (profile?.samples || []).filter((sample) => nodeIds.has(sample)).length
  }
  return sampleCount
}

const readStream = async (cdp: CDPSession, stream: string): Promise<string> => {
  let text = ''
  while (true) {
    const chunk = await cdp.send('IO.read', { handle: stream }) as { data?: string; eof?: boolean }
    text += chunk.data || ''
    if (chunk.eof) break
  }
  await cdp.send('IO.close', { handle: stream }).catch(() => {})
  return text
}

export const captureProfile = async (
  cdp: CDPSession,
  outputPath: string,
  operation: () => Promise<void>,
  target = 'eslintEvaluationWorkerMain.js',
): Promise<number> => {
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,v8,blink.user_timing,disabled-by-default-v8.cpu_profiler',
    options: 'sampling-frequency=1000',
    transferMode: 'ReturnAsStream',
  })
  const started = performance.now()
  await operation()
  const durationMs = performance.now() - started
  const complete = new Promise<string>((resolve) => {
    cdp.once('Tracing.tracingComplete', (event: { stream?: string }) => resolve(event.stream || ''))
  })
  await cdp.send('Tracing.end')
  const stream = await complete
  if (!stream) throw new Error('Chromium CPU profile returned no trace stream')
  const trace = await readStream(cdp, stream)
  const sampleCount = getEslintWorkerSampleCount(trace, target)
  if (!sampleCount) throw new Error(`CPU profile contains no samples from ${target}`)
  await writeFile(outputPath, trace)
  return durationMs
}
