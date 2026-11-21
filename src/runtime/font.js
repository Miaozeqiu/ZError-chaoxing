// Packed feature matching adapted from OCS, copyright 2022 enncy and contributors.
// MIT notice and reference data are shipped as verified runtime resources.
import { call, nodes, documents, pause, result, stableId } from './host.js'
const bits = Uint8Array.from({ length: 256 }, (_, value) => { let count = 0; for (; value; value &= value - 1) count++; return count })
let reference
const matches = new Map()
export function parseReference(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 20 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'FRB2') throw new Error('字形参考资源无效')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(4, true), threshold = view.getUint32(8, true), coarse = view.getUint32(12, true), fine = view.getUint32(16, true)
  if (!count || count > 20000 || threshold > 255 || ![8,16,24,32].includes(coarse) || ![8,16,24,32].includes(fine)
    || bytes.length !== 20 + count * (4 + coarse * coarse / 8 + fine * fine / 8)) throw new Error('字形参考资源尺寸无效')
  return { bytes, view, count, threshold, coarse, fine, coarseOffset: 20 + count * 4, fineOffset: 20 + count * (4 + coarse * coarse / 8) }
}
function* loadReference() {
  if (reference) return reference
  const first = yield* call('resource.read', { id: 'font-reference', offset: 0, length: 20 })
  if (!Number.isSafeInteger(first.total) || first.total < 20 || first.total > 1024 * 1024) throw new Error('字形参考资源过大')
  const bytes = new Uint8Array(first.total); bytes.set(first.bytes)
  let offset = first.next_offset
  while (offset >= 0) {
    const page = yield* call('resource.read', { id: 'font-reference', offset, length: 8192 })
    if (page.total !== bytes.length || !page.bytes.length || page.next_offset >= 0 && page.next_offset <= offset) throw new Error('字形资源分页无效')
    bytes.set(page.bytes, offset); offset = page.next_offset
  }
  reference = parseReference(bytes)
  return reference
}
const distance = (bytes, offset, query) => { let value = 0; for (let i = 0; i < query.length; i++) value += bits[bytes[offset + i] ^ query[i]]; return value }
export function matchGlyph(table, glyph) {
  const coarseLength = table.coarse * table.coarse / 8, fineLength = table.fine * table.fine / 8
  if (!Array.isArray(glyph.coarse) || glyph.coarse.length !== coarseLength || !Array.isArray(glyph.fine) || glyph.fine.length !== fineLength) return null
  const distances = new Float64Array(table.count)
  for (let index = 0; index < table.count; index++) distances[index] = distance(table.bytes, table.coarseOffset + index * coarseLength, glyph.coarse)
  const sorted = Float64Array.from(distances).sort(), cutoff = sorted[Math.min(40, table.count) - 1]
  let best = Infinity, second = Infinity, selected = -1
  for (let index = 0; index < table.count; index++) {
    if (distances[index] > cutoff) continue
    const score = distance(table.bytes, table.fineOffset + index * fineLength, glyph.fine)
    if (score < best) { second = best; best = score; selected = index } else if (score < second) second = score
  }
  // Two identical candidate glyphs have zero confidence, even when both are a perfect match.
  const margin = second === 0 ? 0 : Number.isFinite(second) ? 1 - best / second : 1
  return selected >= 0 && best <= fineLength * 8 * 0.25 && margin >= 0.3 ? { text: String.fromCodePoint(table.view.getUint32(20 + selected * 4, true)), margin } : null
}
export function* decodeText(document, node, text) {
  if (!node || !/font-cxsecret/.test(node.fontFamily || '') && !/font-cxsecret/.test(node.attributes?.class || '')) return { text, decoded: false }
  if (node.fontFamily && !/font-cxsecret/.test(node.fontFamily)) return { text, unavailable: true }
  const characters = [...new Set(Array.from(text).filter(ch => ch.trim()))]
  if (!characters.length) return { text, decoded: false }
  if (text.length > 2000 || characters.length > 256) return { text, unavailable: true }
  const map = new Map(); let covered = 0
  try {
    for (let offset = 0; offset < characters.length; offset += 16) {
      const batch = characters.slice(offset, offset + 16)
      const response = yield* call('document.glyphs', { document, selector: node.selector, characters: batch.join(''),
        raster: { size: 480, fontSize: 360, baseline: 384, threshold: 30, coarse: 16, fine: 24 } })
      if (response.webFont !== true || !Array.isArray(response.glyphs) || response.glyphs.length !== batch.length) return { text, unavailable: true }
      for (let index = 0; index < response.glyphs.length; index++) {
        const glyph = response.glyphs[index], character = batch[index]
        if (glyph.character !== character) return { text, unavailable: true }
        if (!glyph.covered || glyph.empty) { map.set(character, character); continue }
        covered++
        const key = JSON.stringify([document, character, glyph.coarse, glyph.fine])
        if (!matches.has(key)) {
          const table = yield* loadReference()
          matches.set(key, matchGlyph(table, glyph))
          if (matches.size > 512) matches.delete(matches.keys().next().value)
          yield* pause(1)
        }
        const match = matches.get(key)
        if (!match) return { text, unavailable: true }
        map.set(character, match.text)
      }
    }
  } catch { return { text, unavailable: true } }
  if (!covered) return { text, unavailable: true }
  return { text: Array.from(text, ch => map.get(ch) || ch).join(''), decoded: true }
}
export function* decodeFont(args) {
  const all = yield* documents(), items = []
  for (const document of all) {
    const entries = yield* nodes(document, '.font-cxsecret', 1, args.offset || 0)
    for (const node of entries) {
      const value = yield* decodeText(document, node, node.text)
      items.push({ id: stableId([document, node.selector]), title: value.unavailable ? '' : value.text, kind: 'text', status: value.unavailable ? 'needs_review' : 'decoded', url: document.url })
    }
  }
  return result('font_read', '仅返回经过置信度校验的文字，不改变页面；无法确认时保留给视觉核对。', { items })
}
