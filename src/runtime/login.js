import { call, documents, nodes, one, click, pause, urlParts, sameDocument, result } from './host.js'
import { login } from './rules.js'

function* observe(capture = false) {
  const all = yield* documents(), document = all[0], location = urlParts(document.url)
  const input = { operation: 'observe', origin: location.origin, path: location.path, captureCaptcha: capture }
  const rules = login.observe(input).rules
  const matches = []
  let image
  for (const rule of rules) {
    if (rule.kind === 'parameter') {
      matches.push(location.query.split('&').some(pair => pair === rule.selector + '=' + rule.pattern))
      continue
    }
    if (rule.kind === 'image') {
      const node = yield* one(document, rule.selector, true)
      if (node) {
        const receipt = yield { op: 'document.image', args: { document, selector: node.selector } }
        if (receipt?.ok) image = receipt
      }
      matches.push(Boolean(image)); continue
    }
    const found = yield* nodes(document, rule.selector)
    matches.push(rule.kind === 'frame_path' ? found.length === 1 ? found[0].attributes.src : ''
      : rule.kind === 'hidden_flag' ? found.some(node => node.valueIsTrue)
      : rule.kind === 'text' ? found.some(node => node.visible && new RegExp(rule.pattern).test(node.text.trim()))
      : found.some(node => node.visible && (rule.kind !== 'editable' || !node.disabled)))
  }
  return { ...login.observe({ ...input, matches }), document, ...location, image }
}
const challengeId = state => state.image ? JSON.stringify([state.document.frameId, state.document.loaderId, state.document.url, state.image.image_id]) : ''
function captcha(state) {
  if (!state.image) return result('verification_unavailable', '验证码图片暂时无法读取，请刷新页面后重试。', { loggedIn: false })
  return result('captcha', '请识别附带的验证码原图，使用同一个 captcha_id 和 captcha_code 再调用登录工具。', {
    loggedIn: false, captchaImage: state.image.image, captcha_id: challengeId(state),
  })
}
function* fill(state, replaceRejected) {
  const grant = yield* call('credentials.request', { document: state.document, ...(replaceRejected ? { replaceRejected: true } : {}) })
  if (!grant.credential_id) throw new Error('凭据表单未完成')
  for (const field of ['account', 'password']) {
    yield* call('credentials.fill', { document: state.document, selector: login[field], credential_id: grant.credential_id, field })
  }
}
function* verifiedSubmit(state) {
  const before = yield* observe(Boolean(state.image))
  if (!sameDocument(before.document, state.document) || !['form', 'rejected'].includes(before.kind)) return result('stale', '登录表单已变化，请重新读取。', { loggedIn: false })
  yield* click(before.document, yield* one(before.document, login.submit, true))
  for (let i = 0; i < 16; i++) {
    yield* pause(375)
    const current = yield* observe()
    if (current.kind === 'space') return result('logged_in', '已核对站点的登录标记。', { loggedIn: true })
    if (current.kind === 'reset') return result('password_reset', '网站要求修改密码，请在网页完成。', { loggedIn: false })
    if (current.kind === 'challenge') return result('verification_required', '网站要求人工验证，请在网页处理。', { loggedIn: false })
    if (i >= 2 && (current.rejection === 'credentials' || current.rejected)) {
      // Open the secure replacement form now; never ask the model to read or repeat a password.
      yield* fill(current, true)
      const replaced = yield* observe(true)
      if (replaced.challenge) return captcha(replaced)
      return result('credentials_replaced', '已安全更换凭据，请再次调用登录工具核对并提交。', { loggedIn: false })
    }
    if (current.rejection === 'captcha') return result('captcha_rejected', '网站提示验证码错误或失效，请刷新验证码后重新识别。', { loggedIn: false })
    if (current.kind === 'rejected' && current.rejection !== 'credentials') return result('login_rejected', '网站返回登录错误，请核对网页提示。', { loggedIn: false })
  }
  return result('pending', '已提交，但尚未观察到登录成功标记。', { loggedIn: false })
}
export function* loginFlow(args) {
  if (Boolean(args.captcha_id) !== Boolean(args.captcha_code)) return result('invalid_captcha', 'captcha_id 与 captcha_code 必须一起提供。', { loggedIn: false })
  if (args.captcha_code && !/^[a-z\d]{5}$/i.test(args.captcha_code)) return result('invalid_captcha', '验证码应为五位字母或数字。', { loggedIn: false })
  let state = yield* observe(Boolean(args.captcha_code))
  if (state.kind === 'space') return result('logged_in', '当前已经登录。', { loggedIn: true })
  if (args.captcha_code) {
    if (!state.challenge || challengeId(state) !== args.captcha_id) return result('stale', '验证码或文档已更新，请重新获取验证码。', { loggedIn: false })
    const fields = []
    for (const selector of [login.account, login.password]) fields.push(yield* one(state.document, selector, true))
    if (!fields.every(node => node?.hasValue)) {
      yield* fill(state, args.replace_credentials === true)
      return captcha(yield* observe(true))
    }
    yield* call('document.fill', { document: state.document, selector: login.captcha, text: args.captcha_code })
    const checked = yield* observe(true)
    if (!sameDocument(checked.document, state.document) || challengeId(checked) !== args.captcha_id) return result('stale', '填写时验证码已刷新，请重新识别。', { loggedIn: false })
    return yield* verifiedSubmit(checked)
  }
  if (state.kind === 'challenge') return result('verification_required', '网站要求人工验证，请在网页处理。', { loggedIn: false })
  if (state.kind === 'reset') return result('password_reset', '网站要求修改密码，请在网页完成。', { loggedIn: false })
  if (state.kind === 'guest' && login.homeLink) {
    const links = (yield* nodes(state.document, login.homeLink)).filter(node => node.visible && node.text.trim() === '请登录')
    if (links.length !== 1) return result('unrecognized', '没有确认唯一的登录入口。', { loggedIn: false })
    yield* click(state.document, links[0])
  } else if (state.host !== login.formHost) {
    yield* call('document.navigate', { document: state.document, url: login.entry })
  } else if (login.modern && !state.modern) {
    yield* call('document.navigate', { document: state.document, url: login.entry })
  }
  for (let i = 0; i < 12 && !['form', 'rejected'].includes(state.kind); i++) {
    yield* pause(); state = yield* observe()
    if (state.kind === 'space') return result('logged_in', '已核对登录状态。', { loggedIn: true })
    if (state.kind === 'challenge') return result('verification_required', '请在网页完成验证。', { loggedIn: false })
  }
  if (!['form', 'rejected'].includes(state.kind)) return result('unrecognized', '尚未确认登录表单，请核对当前页面。', { loggedIn: false })
  yield* fill(state, args.replace_credentials === true || state.rejection === 'credentials' || state.rejected === true)
  const filled = yield* observe(true)
  if (!sameDocument(filled.document, state.document)) return result('stale', '安全填写后表单已改变，请重新核对。', { loggedIn: false })
  if (filled.challenge) return captcha(filled)
  if (filled.kind === 'challenge') return result('verification_required', '网站要求人工验证，请在网页处理。', { loggedIn: false })
  return yield* verifiedSubmit(filled)
}
