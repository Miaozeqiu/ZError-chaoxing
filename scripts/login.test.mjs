import { readFile } from 'node:fs/promises'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const dist = new URL('../dist/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('script-manifest.json', dist)))
const source = await readFile(new URL(manifest.bundles.login.url, dist), 'utf8')
const adapter = runInNewContext(source + '\nZErrorSiteScript')

test('recognizes an authenticated course frame and declines an unrelated iframe', () => {
  const input = { operation: 'observe', origin: 'https://i.chaoxing.com', path: '/base' }
  assert.equal(adapter.run({ ...input, matches: [false, 'https://mooc1.chaoxing.com/visit/interaction'] }).kind, 'space')
  assert.equal(adapter.run({ ...input, matches: [false, 'https://example.com/visit/interaction'] }).kind, 'loading')
})

test('performs a secure fill only after confirming the current form and stops at a challenge', () => {
  const flow = adapter.workflow({})
  const page = { kind: 'form', modern: true, origin: 'https://passport2.chaoxing.com', document: 'current' }
  assert.equal(flow.next().value.op, 'read')
  assert.equal(flow.next(page).value.op, 'fill_credentials')
  assert.equal(flow.next('filled').value.op, 'read')
  assert.equal(flow.next({ ...page, kind: 'challenge' }).value.status, 'manual')
})
