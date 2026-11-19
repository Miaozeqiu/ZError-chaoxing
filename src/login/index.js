export function run(input) {
  if (input.operation === "observe") return observation(input)
  const { kind, host, modern, frameReady } = input
  if (kind === 'space' && ['i.chaoxing.com', 'i.mooc.chaoxing.com'].includes(host)) return 'logged_in'
  if (kind === 'challenge') return 'verify'
  if (host !== 'passport2.chaoxing.com') return kind === 'loading' ? 'wait' : 'open_space'
  if (kind === 'form' && modern && frameReady) return 'fill'
  return kind === 'passport' || (kind === 'form' && !modern) ? 'open_form' : 'wait'
}

const query = (kind, selector, pattern) => ({ kind, selector, pattern })

function observation({ origin, path, matches }) {
  const space = ['https://i.chaoxing.com', 'https://i.mooc.chaoxing.com'].includes(origin)
  let rules
  if (space && /^\/(?:$|(?:space|base)(?:\/|$))/i.test(path)) {
    rules = [query('visible', '#zne_kc_icon, #zne_sy_icon, a[href*="logout" i], a[href*="loginOut" i]'),
      query('frame_path', 'iframe#frame_content[src]')]
    if (!matches) return { rules }
    return { kind: matches[0] || (/^\/base\/?$/i.test(path) && typeof matches[1] === 'string'
      && /^https:\/\/[^/]+\.chaoxing\.com\/visit\/(?:interaction|courses)\/?$/i.test(matches[1])) ? 'space' : 'loading' }
  }
  if (origin !== 'https://passport2.chaoxing.com') return matches ? { kind: 'other' } : { rules: [] }
  if (!/^\/login\/?$/i.test(path)) return matches ? { kind: 'passport' } : { rules: [] }
  const errors = '#phoneMsg, #pwdMsg, #loginTip'
  rules = [
    query('text', errors, '验证码|滑块|安全验证|人机验证'),
    query('visible', '#vercode, .geetest_panel, .geetest_slider, .geetest_captcha, .nc-container, iframe[src*="captcha" i]'),
    query('hidden_flag', 'input#needVcode[type=hidden]'),
    query('editable', 'input#phone:is([type=text], [type=tel], [type=email], [type=number], :not([type]))'),
    query('editable', 'input#pwd[type="password"]'),
    query('visible', '#loginBtn:not(:disabled, [aria-disabled=true])'),
    query('text', errors, '\\S'),
    { kind: 'parameter', selector: 'newversion', pattern: 'true' },
  ]
  if (!matches) return { rules }
  if (matches[0] || matches[1] || matches[2]) return { kind: 'challenge' }
  return { kind: matches[3] && matches[4] && matches[5] ? 'form' : 'loading', rejected: matches[6] === true, modern: matches[7] === true }
}

export function* workflow({ verify, submittingCaptcha }) {
  const manual = message => ({ status: 'manual', message })
  if (verify || submittingCaptcha) return manual('请在学习通页面完成验证。')
  const logged = { status: 'logged_in' }
  const space = 'https://i.chaoxing.com/'
  const passport = 'https://passport2.chaoxing.com'
  const login = passport + '/login?fid=&newversion=true&refer=https%3A%2F%2Fi.chaoxing.com'
  const challenge = manual('学习通要求人工验证。请在浏览器完成验证码或滑块后继续。')
  let state = yield { op: 'read' }
  if (state.kind === 'unsupported') return manual('当前浏览器请手动登录学习通。')
  if (state.kind === 'space') return logged
  if (state.kind === 'challenge') return challenge
  if (state.kind !== 'loading' && state.origin !== passport) yield { op: 'navigate', url: space }
  let openedForm = false
  for (let i = 0; i < 20; i++) {
    if (state.kind === 'space') return logged
    if (state.kind === 'challenge') return challenge
    if (state.origin === passport && state.kind === 'form' && state.modern && state.document) break
    if (!openedForm && state.origin === passport && ['passport', 'form'].includes(state.kind)) {
      yield { op: 'navigate', url: login }
      openedForm = true
    }
    state = yield { op: 'read', delay: 250 }
  }
  if (state.origin !== passport || state.kind !== 'form' || !state.modern || !state.document) {
    return manual('未确认学习通登录表单或已登录空间，请核对当前浏览器页面。')
  }
  const filled = yield { op: 'fill_credentials', account: 'input#phone', password: 'input#pwd[type="password"]' }
  if (filled === 'missing') return manual('学习通账号或密码未配置，请在对话中填写。')
  const stale = { status: 'stale', message: '学习通表单已变化，请核对当前页面。' }
  if (filled !== 'filled') return stale
  const before = yield { op: 'read' }
  if (before.kind === 'challenge') return challenge
  if (before.kind !== 'form' || before.document !== state.document) return stale
  if (!(yield { op: 'submit', button: '#loginBtn' })) return stale
  for (let i = 0; i < 24; i++) {
    state = yield { op: 'read', delay: 250 }
    if (state.kind === 'space') return logged
    if (state.kind === 'challenge') return challenge
    if (state.origin === passport && state.rejected && (i >= 3 || !before.rejected)) {
      return { status: 'rejected', message: '学习通登录表单返回错误，请检查账号、密码或网页提示。' }
    }
  }
  return manual('已尝试登录，尚未确认进入学习通空间。')
}
