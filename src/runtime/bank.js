import { call, stableId } from './host.js'
import { answerService } from './rules.js'
import { norm, decodedSubject, subjectAnswer } from './answerPlan.js'
export const cacheId = question => stableId([question.subject_type, norm(question.stem)])
export function* readState(session_id, key) {
  const result = yield* call('state.read', { session_id, key })
  try { return result.json ? JSON.parse(result.json) : null } catch { return null }
}
export function* writeState(session_id, key, value) { return yield* call('state.write', { session_id, key, json: JSON.stringify(value) }) }
export function* session(interactive = true, replace = false) {
  const grant = yield* call('service.session', { service: 'account', interactive, ...(replace ? { replace: true } : {}) })
  return grant.authenticated ? grant.session_id : null
}
export function* request(session_id, path, query, method = 'GET', payload_id) {
  return yield { op: 'service.request', args: { session_id, path, method, query: Object.entries(query || {}).map(([name, value]) => ({ name, value: String(value) })),
    token_location: method === 'GET' && path === answerService.lookup ? 'query' : 'header',
    ...(method === 'GET' && path === answerService.lookup ? { token_name: 'token' } : {}), ...(payload_id ? { payload_id } : {}) } }
}
export function* readResponse(session_id, request_id, pointer, offset, limit) {
  return yield* call('service.read', { session_id, request_id, pointer, ...(offset === undefined ? {} : { offset }), ...(limit ? { limit } : {}) })
}
export function* cachedAnswers(paper, questions, session_id) {
  const result = new Map(), meta = yield* readState(session_id, paper.stateKey + '/ready')
  if (!meta?.complete || meta.courseId !== paper.courseId || meta.paperId !== paper.paperId) return result
  const parts = new Map()
  for (const question of questions) {
    const index = meta.index?.[cacheId(question)]
    if (!Number.isSafeInteger(index) || index < 0 || !meta.keys[index]) continue
    if (!parts.has(index)) parts.set(index, yield* readState(session_id, meta.keys[index]))
    const candidates = (parts.get(index)?.subjects || []).map(decodedSubject).filter(subject => subject && subject.title === norm(question.stem) && Number(subject.subjectType) === question.subject_type)
    if (candidates.length === 1) { const answer = subjectAnswer(question, candidates[0]); if (answer) result.set(question.id, answer) }
  }
  return result
}
export function* serverAnswers(paper, questions, session_id) {
  let response = yield* request(session_id, answerService.lookup, { id: paper.paperId, need_data: true })
  if (response?.status === 401 || response?.authenticationRejected) {
    session_id = yield* session(true, true)
    if (!session_id) return { stopped: true }
    response = yield* request(session_id, answerService.lookup, { id: paper.paperId, need_data: true })
  }
  if (response?.status === 403) return { denied: true, session_id }
  if (response?.status === 401 || response?.authenticationRejected) return { stopped: true, session_id }
  if (!response?.ok || response.status < 200 || response.status >= 300) return { unavailable: true, answers: new Map(), session_id }
  const id = yield* readResponse(session_id, response.request_id, '/data/id'), course = yield* readResponse(session_id, response.request_id, '/data/courseId')
  const answers = new Map(), matches = new Map()
  if (String(id.value) !== paper.paperId || String(course.value) !== paper.courseId) return { unavailable: true, answers, session_id }
  let offset = 0
  while (offset >= 0) {
    const page = yield* readResponse(session_id, response.request_id, '/data/paperSubjectList', offset, 8)
    if (page.tooLarge || !Array.isArray(page.items) || page.total > 1000) return { unavailable: true, answers: new Map(), session_id }
    for (const raw of page.items) {
      const subject = decodedSubject(raw)
      if (!subject) continue
      for (const question of questions) {
        if (Number(subject.subjectType) !== question.subject_type || subject.title !== norm(question.stem)) continue
        matches.set(question.id, (matches.get(question.id) || 0) + 1)
        const answer = subjectAnswer(question, subject)
        if (answer) answers.set(question.id, answer)
      }
    }
    offset = page.next_offset
  }
  for (const question of questions) if (matches.get(question.id) !== 1) answers.delete(question.id)
  return { answers, session_id }
}
