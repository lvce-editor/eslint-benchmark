import { createHash } from 'node:crypto'
import { brotliDecompressSync } from 'node:zlib'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(root, '.tmp/cache')
const version = 'v1.24.1'
const archiveName = `eslint-${version}.tar.br`
const expectedSha256 = '2f1e9ed270346ffae860228126e484be92498feb349c71e4c08c96f1fefd9f2a'
const extensionDirectory = join(cache, 'extension')

const run = (command: string, args: string[]): void => {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
}

await mkdir(cache, { recursive: true })
const response = await fetch(`https://github.com/lvce-editor/eslint/releases/download/${version}/${archiveName}`)
if (!response.ok) throw new Error(`Unable to download ESLint ${version}: HTTP ${response.status}`)
const archive = Buffer.from(await response.arrayBuffer())
const sha256 = createHash('sha256').update(archive).digest('hex')
if (sha256 !== expectedSha256) throw new Error(`ESLint archive checksum mismatch: expected ${expectedSha256}, got ${sha256}`)
const tarPath = join(cache, 'eslint.tar')
await writeFile(tarPath, brotliDecompressSync(archive))
await rm(extensionDirectory, { recursive: true, force: true })
await mkdir(extensionDirectory, { recursive: true })
run('tar', ['-xf', tarPath, '-C', extensionDirectory])
const manifestPath = join(extensionDirectory, 'extension.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { id?: string; version?: string }
if (manifest.id !== 'builtin.eslint' || manifest.version !== version.slice(1)) {
  throw new Error(`Unexpected extension in pinned release: ${manifest.id}@${manifest.version}`)
}
await writeFile(join(cache, 'setup.json'), `${JSON.stringify({ extension: { repository: 'https://github.com/lvce-editor/eslint', version, archive: archiveName, sha256, id: manifest.id }, server: '@lvce-editor/server@0.115.5', fixture: 'fixture/src/benchmark.js', node: process.version }, null, 2)}\n`)
run('npm', ['ci', '--prefix', join(root, 'fixture'), '--ignore-scripts'])
console.log(`Prepared ESLint ${version} (${sha256})`)
