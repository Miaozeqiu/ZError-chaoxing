import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import releaseSync from '@jitl/quickjs-wasmfile-release-sync'
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core'
const quickjs = await newQuickJSWASMModuleFromVariant(releaseSync)
import { JSDOM } from 'jsdom'
import Ajv from 'ajv'
export const artifact = JSON.parse(await readFile(new URL('../dist/runtime.json', import.meta.url)))
const plain = value => JSON.parse(JSON.stringify(value))
const validate = new Ajv({ strict: false, allErrors: true })
export function host(html, url) {
  const dom = new JSDOM(html, { url }), window = dom.window
  let loader = 'loader-1'
  const events = [], receipts = [], check = () => ({ frameId: 'main', loaderId: loader, url: window.location.href })
  const visible = node => !node.hidden && node.type !== 'hidden' && !node.closest('[hidden]')
  const locator = node => {
    const parts = []
    for (let current = node; current; current = current.parentElement) {
      const siblings = current.parentElement ? [...current.parentElement.children].filter(other => other.tagName === current.tagName) : [current]
      parts.unshift(current.tagName.toLowerCase() + ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')')
    }
    return parts.join(' > ')
  }
  const state = { ok: true, paused: true, ended: false, muted: false, current: 0, duration: 5, ready: 4 }
  const io = { window, events, receipts, state, imageHash: 'a'.repeat(64),
    document: () => check(), reload: () => { loader += '-new' },
    navigate: (url, html) => { dom.reconfigure({ url }); loader += '-new'; if (html !== undefined) window.document.body.innerHTML = html },
    onClick: () => {}, onWait: () => {}, onMediaEnd: () => {},
    async execute(op, args) {
      events.push({ op, args: plain(args) })
      let result
      if (op === 'document.list') result = { ok: true, documents: [check()] }
      else if (op === 'browser.wait') { io.onWait(); result = { ok: true } }
      else if (op === 'workflow.checkpoint') { io.checkpoint = plain(args.state); result = { ok: true, checkpoint_id: 'saved' } }
      else {
        assert.deepEqual(args.document, check(), 'stale document must not reach DOM actions')
        if (op === 'document.navigate') { io.navigate(args.url); result = { ok: true } }
        else if (op === 'credentials.request') result = { ok: true, credential_id: 'grant' }
        else {
          const all = [...window.document.querySelectorAll(args.selector || 'body')]
          const node = args.nth ? all[args.nth - 1] : all.length === 1 ? all[0] : undefined
          if (op === 'document.query') {
            const offset = args.offset || 0
            result = { ok: true, nodes: all.slice(offset, offset + args.limit).map((node, index) => ({
              selector: locator(node), index: offset + index + 1, tag: node.tagName.toLowerCase(),
              text: node.type === 'password' || node.hasAttribute('data-zerror-private') || node.tagName === 'TEXTAREA' ? '' : node.textContent.slice(0, 2048),
              visible: visible(node), disabled: node.disabled || false, checked: node.checked || false, selected: node.selected || false,
              hasValue: Boolean(node.value), valueIsTrue: node.type === 'hidden' && /^(1|true)$/i.test(node.value), scroll: { top: 0, max: 0, viewport: 100 },
              attributes: Object.fromEntries(['id', 'class', 'type', 'name', 'role', 'href', 'src', 'alt', 'title', 'aria-label', 'aria-checked', 'aria-selected', 'aria-disabled', 'placeholder'].map(key => [key, node.getAttribute(key) || ''])),
            })), total: all.length, truncated: all.length > offset + args.limit }
          } else if (!node && !op.startsWith('media.')) result = { ok: false, reason: 'not_found' }
          else if (op === 'credentials.fill') {
            assert.equal(args.credential_id, 'grant'); node.value = args.field === 'account' ? 'fixture-user' : 'fixture-private-password'
            node.setAttribute('data-zerror-private', 'true'); result = { ok: true, filled: true }
          } else if (op === 'document.image') result = { ok: true, image_id: io.imageHash, image: 'data:image/png;base64,' + 'A'.repeat(44) }
          else if (op === 'document.fill') {
            assert.notEqual(node.type, 'password'); assert(!node.hasAttribute('data-zerror-private'))
            node.value = args.text; node.dispatchEvent(new window.Event('input', { bubbles: true })); result = { ok: true, filled: true }
          } else if (op === 'document.compare') result = node.type === 'password' || node.hasAttribute('data-zerror-private') ? { ok: false, reason: 'private_input' } : { ok: true, matches: node.value === args.text }
          else if (op === 'document.click') { node.click(); io.onClick(node); result = { ok: true, dispatched: true } }
          else if (op === 'document.scroll' || op === 'document.select') result = { ok: true }
          else if (op === 'media.read') result = { ...state }
          else if (op === 'media.mute') { state.muted = args.muted; result = { ...state } }
          else if (op === 'media.play') { state.paused = false; result = { ...state } }
          else if (op === 'media.wait') { state.ended = true; state.current = 5; state.paused = true; io.onMediaEnd(); result = { ...state, event: 'ended' } }
          else throw new Error('Unexpected host command ' + op)
        }
      }
      receipts.push(plain(result)); return plain(result)
    },
    close: () => window.close(),
  }
  return io
}
export async function execute(tool, args, io, resume) {
  const spec = artifact.tools.find(row => row.name === tool); assert(spec, 'declared tool')
  assert(validate.validate(spec.parameters, args), JSON.stringify(validate.errors))
  const runtime = quickjs.newRuntime()
  runtime.setMemoryLimit(8 * 1024 * 1024); runtime.setMaxStackSize(256 * 1024)
  let deadline = 0
  runtime.setInterruptHandler(() => performance.now() > deadline)
  const context = runtime.newContext()
  const evaluate = source => {
    deadline = performance.now() + 100
    const result = context.evalCode(source)
    if (result.error) { const error = context.dump(result.error); result.error.dispose(); throw new Error(JSON.stringify(error)) }
    try { return JSON.parse(context.getString(result.value)) } finally { result.value.dispose() }
  }
  try {
    evaluate(artifact.bundle.code + '\n;const task = ZErrorSitePackage.create(' + JSON.stringify({ tool, args, resume }) + '); JSON.stringify(true)')
    let receipt = null
    for (let index = 0; index < 512; index++) {
      const step = evaluate('JSON.stringify(task.next(' + JSON.stringify(receipt) + '))')
      if (step.done) {
        assert(validate.validate(spec.result, step.value), JSON.stringify(validate.errors))
        return step.value
      }
      const command = step.value
      assert(spec.commands.includes(command.op), 'undeclared command ' + command.op)
      receipt = await io.execute(command.op, command.args)
    }
    throw new Error('command budget exceeded')
  } finally { context.dispose(); runtime.dispose() }
}
