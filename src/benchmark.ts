import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium, type Browser, type CDPSession } from 'playwright'
import { aggregate, type Trial } from './aggregate.ts'
import { captureProfile } from './profile.ts'
import { validateDiagnostics } from './diagnostics.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iterations = Number(process.env.ITERATIONS || '5')
const timeout = Number(process.env.TIMEOUT_MS || '120000')
const resultDirectory = join(root, 'results')
const fixture = join(root, 'fixture')
const fixtureFile = join(fixture, 'src/benchmark.js')
const source = 'debugger;\nexport const ready = true\n'
const fixtureUri = pathToFileURL(fixtureFile).href

const createTest = async (): Promise<void> => {
  const directory = join(root, 'test-site/src')
  await mkdir(directory, { recursive: true })
  const resultUri = pathToFileURL(join(fixture, '.tmp/result.json')).href
  const fileUri = fixtureUri
  const code = `export const name = 'eslint.benchmark'
export const test = async ({ Command, FileSystem, Main }) => {
  const workspace = ${JSON.stringify(fixture)}
  const uri = ${JSON.stringify(fileUri)}
  await Command.execute('Workspace.setUri', workspace)
  await Main.openUri(uri)
  const text = await FileSystem.readFile(uri)
  const start = performance.now()
  const diagnostics = await Command.executeExtensionCommand('eslint.lint', { text, uri })
  const durationMs = performance.now() - start
  await FileSystem.writeFile(${JSON.stringify(resultUri)}, JSON.stringify({ diagnostics, durationMs }))
}
`
  await writeFile(join(directory, 'eslint.benchmark.ts'), code)
}

const waitForJson = async <T>(path: string, deadline: number): Promise<T> => {
  while (performance.now() < deadline) {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as T
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for benchmark result ${path}`)
}

const runTrial = async (mode: 'cold' | 'warm', iteration: number, profile = false): Promise<Trial> => {
  let browser: Browser | undefined
  let cdp: CDPSession | undefined
  let child: ReturnType<typeof spawn> | undefined
  let runtimeDirectory = ''
  const trialDirectory = join(resultDirectory, `${mode}-${iteration}`)
  try {
    await mkdir(trialDirectory, { recursive: true })
    await mkdir(dirname(fixtureFile), { recursive: true })
    await mkdir(join(fixture, '.tmp'), { recursive: true })
    await writeFile(fixtureFile, source)
    await rm(join(fixture, '.tmp/result.json'), { force: true })
    await createTest()
    const start = performance.now()
    runtimeDirectory = await mkdtemp(join(root, '.tmp/runtime-'))
    const port = 42000 + Math.floor(Math.random() * 15000)
    child = spawn(process.execPath, [fileURLToPath(import.meta.resolve('@lvce-editor/server/bin/server.js')), fixture, `--only-extension=${join(root, '.tmp/cache/extension')}`, `--test-path=${join(root, 'test-site')}`], {
      detached: process.platform !== 'win32',
      env: { ...process.env, FOLDER: fixture, PORT: String(port), XDG_CACHE_HOME: join(runtimeDirectory, 'cache'), XDG_CONFIG_HOME: join(runtimeDirectory, 'config'), XDG_DATA_HOME: join(runtimeDirectory, 'data'), XDG_STATE_HOME: join(runtimeDirectory, 'state') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let serverOutput = ''
    child.stdout?.on('data', (chunk) => { serverOutput += String(chunk) })
    child.stderr?.on('data', (chunk) => { serverOutput += String(chunk) })
    const url = `http://localhost:${port}`
    const deadline = performance.now() + timeout
    while (performance.now() < deadline) {
      try {
        const response = await fetch(url)
        if (response.ok) break
      } catch {}
      if (child.exitCode !== null) throw new Error(`Editor server exited: ${serverOutput}`)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (performance.now() >= deadline) throw new Error(`Editor server startup timeout: ${serverOutput}`)
    browser = await chromium.launch({ headless: true })
    cdp = await browser.newBrowserCDPSession()
    const page = await browser.newPage()
    const runPage = async (): Promise<{ diagnostics: unknown; durationMs: number }> => {
      await page.goto(`${url}/tests/eslint.benchmark.html`, { waitUntil: 'domcontentloaded', timeout })
      const deadline = performance.now() + timeout
      const result = await waitForJson<{ diagnostics: unknown; durationMs: number }>(join(fixture, '.tmp/result.json'), deadline)
      validateDiagnostics(result.diagnostics, fixtureUri)
      return result
    }

    let coldElapsedMs = 0
    let warmElapsedMs = 0
    if (profile && mode === 'cold') {
      await captureProfile(cdp, join(trialDirectory, 'cpu-profile.json'), async () => { await runPage() })
      coldElapsedMs = performance.now() - start
    } else {
      await runPage()
      coldElapsedMs = performance.now() - start
    }
    await rm(join(fixture, '.tmp/result.json'), { force: true })
    if (profile && mode === 'warm') {
      warmElapsedMs = await captureProfile(cdp, join(trialDirectory, 'cpu-profile.json'), async () => {
        await page.reload({ waitUntil: 'domcontentloaded', timeout })
        const deadline = performance.now() + timeout
        const result = await waitForJson<{ diagnostics: unknown; durationMs: number }>(join(fixture, '.tmp/result.json'), deadline)
        validateDiagnostics(result.diagnostics, fixtureUri)
      }, 'eslintMain.js')
    } else {
      await page.reload({ waitUntil: 'domcontentloaded', timeout })
      const deadline = performance.now() + timeout
      const result = await waitForJson<{ diagnostics: unknown; durationMs: number }>(join(fixture, '.tmp/result.json'), deadline)
      validateDiagnostics(result.diagnostics, fixtureUri)
      warmElapsedMs = result.durationMs
    }
    const durationMs = mode === 'cold' ? coldElapsedMs : warmElapsedMs
    const trial = { mode, iteration, durationMs, success: true } as const
    await writeFile(join(trialDirectory, 'trial.json'), `${JSON.stringify({ ...trial, profile: profile ? 'cpu-profile.json' : null, server: '@lvce-editor/server@0.121.4', extension: 'eslint@1.24.1', node: process.version, cache: mode === 'cold' ? 'new server and extension worker' : 'identical second request; extension result cache hit' }, null, 2)}\n`)
    return trial
  } catch (error) {
    const failure = { mode, iteration, durationMs: null, success: false, error: error instanceof Error ? error.stack || error.message : String(error) }
    await mkdir(trialDirectory, { recursive: true })
    await writeFile(join(trialDirectory, 'trial.json'), `${JSON.stringify(failure, null, 2)}\n`)
    return failure
  } finally {
    await browser?.close().catch(() => {})
    if (child?.pid && child.exitCode === null) {
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM') } catch {}
      await Promise.race([
        new Promise<void>((resolve) => child?.once('exit', () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ])
    }
    if (runtimeDirectory) await rm(runtimeDirectory, { recursive: true, force: true })
  }
}

if (!Number.isSafeInteger(iterations) || iterations < 1) throw new Error('ITERATIONS must be a positive integer')
await mkdir(resultDirectory, { recursive: true })
await mkdir(dirname(fixtureFile), { recursive: true })
await writeFile(fixtureFile, source)
const trials: Trial[] = []
for (let iteration = 1; iteration <= iterations; iteration++) {
  trials.push(await runTrial('cold', iteration))
  trials.push(await runTrial('warm', iteration))
}
trials.push(await runTrial('cold', 0, true))
trials.push(await runTrial('warm', 0, true))
const result = {
  metadata: JSON.parse(await readFile(join(root, '.tmp/cache/setup.json'), 'utf8')),
  fixture: { file: 'fixture/src/benchmark.js', sha256: createHash('sha256').update(source).digest('hex'), expectedRule: 'no-debugger' },
  boundaries: { cold: 'new server, browser, isolated XDG profile, extension worker launch through first validated diagnostics', warm: 'identical request after editor-page reload in the same isolated browser profile and server; ESLint result cache path', profiles: 'captured separately and excluded from readiness timing' },
  trials,
  summaries: { cold: aggregate(trials.filter((trial) => trial.mode === 'cold' && trial.iteration > 0)), warm: aggregate(trials.filter((trial) => trial.mode === 'warm' && trial.iteration > 0)) },
}
await writeFile(join(resultDirectory, 'results.json'), `${JSON.stringify(result, null, 2)}\n`)
if (trials.some((trial) => !trial.success)) process.exitCode = 1
