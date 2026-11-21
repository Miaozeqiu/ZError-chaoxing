import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const root = fileURLToPath(new URL('../', import.meta.url))
const site = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).name.replace('zerror-', '')
test('development watch atomically updates tool schemas and automation metadata and retains the last good build', { timeout: 20000 }, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'zerror-runtime-watch-'))
  let child, log = ''
  const eventually = async (read, accept) => {
    const end = Date.now() + 10000
    while (Date.now() < end) {
      try { const value = await read(); if (accept(value)) return value } catch { /* Wait for rebuild. */ }
      await delay(50)
    }
    throw new Error('Runtime watch did not update: ' + log.slice(-3000))
  }
  try {
    for (const relative of ['src/runtime', 'skills/' + site, 'scripts/build-scripts.mjs']) {
      await mkdir(dirname(join(temp, relative)), { recursive: true })
      await cp(join(root, relative), join(temp, relative), { recursive: true })
    }
    await symlink(join(root, 'node_modules'), join(temp, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    child = spawn(process.execPath, [join(temp, 'scripts/build-scripts.mjs'), '--serve'], { cwd: temp, env: { ...process.env, ZERROR_SCRIPT_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
    const output = bytes => { log = (log + bytes).slice(-12000) }
    child.stdout.on('data', output); child.stderr.on('data', output)
    child.on('error', error => output(error.message))
    const url = await eventually(async () => /http:\/\/127\.0\.0\.1:\d+\/experience\.json/.exec(log)?.[0], Boolean)
    const read = async () => (await fetch(url)).json()
    const original = await read()
    const toolsPath = join(temp, 'src/runtime/tools.js'), source = await readFile(toolsPath, 'utf8')
    await writeFile(toolsPath, source + "\ntools[0].description += ' watch-fixture';\n")
    const updated = await eventually(read, value => value.runtime.tools[0].description.endsWith('watch-fixture'))
    assert.notEqual(updated.revision, original.revision)
    assert.equal(updated.runtime.bundle.sha256, original.runtime.bundle.sha256, 'metadata-only edits do not needlessly change executable bytes')
    const rules = join(temp, 'src/runtime/rules.js'), rulesSource = await readFile(rules, 'utf8')
    const expected = original.runtime.automations.length ? [] : [{ event: 'page', tool: 'sync_review' }]
    await writeFile(rules, rulesSource + '\nautomations.splice(0, automations.length, ...' + JSON.stringify(expected) + ');\n')
    const next = await eventually(read, value => JSON.stringify(value.runtime.automations) === JSON.stringify(expected))
    assert(next.runtime.tools[0].description.endsWith('watch-fixture'))
    log = ''
    await writeFile(toolsPath, 'export const tools = [;')
    await eventually(async () => log, value => /ERROR/.test(value))
    assert.deepEqual(await read(), next, 'failed metadata cannot replace the served complete snapshot')
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => {
        const timer = setTimeout(() => child.kill('SIGKILL'), 2000)
        child.once('exit', () => { clearTimeout(timer); resolve() })
        child.kill('SIGTERM')
      })
    }
    await rm(temp, { recursive: true, force: true })
  }
})
