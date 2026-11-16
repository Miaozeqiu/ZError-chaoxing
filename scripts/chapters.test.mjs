import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const manifestUrl = new URL('../dist/script-manifest.json', import.meta.url)
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))
const bundle = manifest.bundles.chapters
const source = await readFile(new URL(bundle.url, manifestUrl), 'utf8')

const run = (input = {}) => JSON.parse(runInNewContext(source + '\nJSON.stringify(ZErrorSiteScript.run(input))', {
  input: { remaining: 2, loaded: true, videoOnly: false, targetTab: null, nextTab: null, jobs: [], ...input },
}))

test('ships a verified chapter bundle and handles task points in page order', () => {
  assert.equal(createHash('sha256').update(source).digest('hex'), bundle.sha256)
  const jobs = [{ kind: 'document', done: true }, { kind: 'quiz', done: false }, { kind: 'video', done: false }]
  assert.deepEqual(run({ jobs, nextTab: 2 }), { action: 'quiz', index: 1 })
  assert.deepEqual(run({ jobs, videoOnly: true }), { action: 'video', index: 2 })
  assert.deepEqual(run({ jobs, targetTab: 3 }), { action: 'tab', tab: 3 })
})

test('completion requires the chapter counter; loading never advances a tab', () => {
  assert.deepEqual(run({ remaining: 0, loaded: false }), { action: 'complete' })
  assert.deepEqual(run({ loaded: false, nextTab: 2 }), { action: 'loading' })
  assert.deepEqual(run({ nextTab: 2 }), { action: 'tab', tab: 2 })
  assert.deepEqual(run({ remaining: null, jobs: [{ kind: 'video', done: true }] }), { action: 'pending' })
  assert.deepEqual(run({ jobs: [{ kind: 'unknown', done: false }], nextTab: 2 }), { action: 'unknown', index: 0 })
})
