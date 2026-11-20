// Host API 2 only. Page rules and decisions belong to this repository.
export const clean = value => String(value || '').replace(/\s+/g, ' ').trim()
export const urlParts = value => {
  const match = /^https:\/\/([^/:?#]+)([^?#]*)(?:\?([^#]*))?/.exec(value)
  return match ? { origin: 'https://' + match[1], host: match[1], path: match[2] || '/', query: match[3] || '' } : { origin: '', host: '', path: '', query: '' }
}
export const sameDocument = (a, b) => a && b && a.frameId === b.frameId && a.loaderId === b.loaderId && a.url === b.url
export const result = (status, message = '', extra = {}) => ({ status, message, ...extra })
export function* call(op, args = {}) {
  const receipt = yield { op, args }
  if (!receipt || receipt.ok === false || receipt.error || receipt.denied) throw new Error(String(receipt?.error || receipt?.reason || op + ' failed'))
  return receipt
}
export function* documents() {
  const receipt = yield* call('document.list')
  if (!receipt.documents?.length) throw new Error('没有可操作的站内文档')
  return receipt.documents
}
export function* query(document, selector, limit = 40, offset = 0) {
  if (!selector) return { nodes: [], total: 0, truncated: false }
  return yield* call('document.query', { document, selector, limit, ...(offset ? { offset } : {}) })
}
export function* nodes(document, selector, limit = 40, offset = 0) { return (yield* query(document, selector, limit, offset)).nodes || [] }
export function* one(document, selector, visible = false) {
  const found = (yield* nodes(document, selector)).filter(node => !visible || node.visible)
  return found.length === 1 ? found[0] : undefined
}
export function* click(document, node) {
  if (!node?.selector || !node.visible || node.disabled) throw new Error('未确认唯一可操作控件')
  return yield* call('document.click', { document, selector: node.selector })
}
export function* pause(ms = 250) { return yield* call('browser.wait', { ms }) }
export function* checkpoint(state) { return yield* call('workflow.checkpoint', { state }) }
export const child = (node, selector) => node.selector + ' :is(' + selector + ')'
export const stableId = parts => {
  // A locator/fingerprint, not an authorization token. Native document identities authorize every operation.
  const text = JSON.stringify(parts)
  let a = 2166136261, b = 5381
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i) }
  return (a >>> 0).toString(16) + '-' + (b >>> 0).toString(16)
}
