export function run({ kind, host, modern, frameReady }) {
  if (kind === 'space' && ['i.chaoxing.com', 'i.mooc.chaoxing.com'].includes(host)) return 'logged_in'
  if (kind === 'challenge') return 'verify'
  if (host !== 'passport2.chaoxing.com') return kind === 'loading' ? 'wait' : 'open_space'
  if (kind === 'form' && modern && frameReady) return 'fill'
  return kind === 'passport' || (kind === 'form' && !modern) ? 'open_form' : 'wait'
}
