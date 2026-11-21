import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parseReference, matchGlyph } from '../src/runtime/font.js'
import { artifact, host, execute } from './runtime-test-host.mjs'
const makeReference = duplicate => {
  const bytes = new Uint8Array(60), view = new DataView(bytes.buffer)
  bytes.set([...Buffer.from('FRB2')]); [2,30,8,8].forEach((value, index) => view.setUint32(4 + index * 4, value, true))
  view.setUint32(20, '甲'.codePointAt(0), true); view.setUint32(24, '乙'.codePointAt(0), true)
  bytes.fill(255, 28, duplicate ? 60 : 36); bytes.fill(255, 44, 52)
  return parseReference(bytes)
}
test('packed glyph matching rejects ambiguous perfect matches and malformed reference tables', () => {
  const glyph = { coarse: Array(8).fill(255), fine: Array(8).fill(255) }
  assert.equal(matchGlyph(makeReference(false), glyph).text, '甲')
  assert.equal(matchGlyph(makeReference(true), glyph), null)
  assert.throws(() => parseReference(new Uint8Array(20)))
})
test('the published runtime contains the exact repository reference and license, not an app asset URL', async () => {
  const original = await readFile(new URL('../src/resources/font-reference.bin', import.meta.url))
  const resource = artifact.resources.find(row => row.id === 'font-reference')
  assert.equal(resource.sha256, createHash('sha256').update(original).digest('hex'))
  assert.deepEqual(Buffer.from(resource.data, 'base64'), original)
  assert(artifact.resources.some(row => row.id === 'font-license'))
  assert(!artifact.bundle.code.includes('font-data/'))
})
test('compiled question reading decodes a verified glyph, rereads it before filling and keeps low-confidence text unsupported', async () => {
  const asset = artifact.resources.find(row => row.id === 'font-reference'), table = parseReference(Uint8Array.from(Buffer.from(asset.data, 'base64')))
  let index = -1
  for (let i = 0; i < table.count; i++) if (table.view.getUint32(20 + i * 4, true) === '学'.codePointAt(0)) index = i
  assert(index >= 0)
  const coarse = [...table.bytes.subarray(table.coarseOffset + index * 32, table.coarseOffset + (index + 1) * 32)]
  const fine = [...table.bytes.subarray(table.fineOffset + index * 72, table.fineOffset + (index + 1) * 72)]
  const io = host('<div class="questionLi"><h3 class="mark_name font-cxsecret" style="font-family:font-cxsecret">甲</h3><input type="hidden" id="answertype1" value="0"><button class="answerBg">A. 选项一</button><button class="answerBg">B. 选项二</button></div>', 'https://mooc1.chaoxing.com/work/doWork')
  io.onGlyphs = args => ({ ok: true, family: 'font-cxsecret', webFont: true, glyphs: [...args.characters].map(character => ({ character, covered: true, empty: false, coarse, fine })) })
  io.onClick = node => node.classList.add('checked')
  try {
    const first = await execute('read_questions', {}, io)
    assert.equal(first.questions[0].stem, '学'); assert.equal(first.questions[0].supported, true)
    assert.equal((await execute('answer_questions', { answers: [{ question_id: first.questions[0].id, choices: ['A'] }] }, io)).items[0].status, 'verified')
    io.onGlyphs = () => ({ ok: false, reason: 'font_unavailable' })
    assert.equal((await execute('read_questions', {}, io)).questions[0].supported, false)
  } finally { io.close() }
})
