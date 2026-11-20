const query = (kind, selector, pattern) => ({ kind, selector, pattern })

export function observation({ origin, path, matches }) {
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
