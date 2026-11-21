import { call, result, stableId } from './host.js'
import { answerService } from './rules.js'
import { readBatch } from './questions.js'
import { reviewSubject } from './answerPlan.js'
import { session, request, readResponse, readState, writeState, cacheId } from './bank.js'

export function* syncReview() {
  if (!answerService) return result('not_applicable', '该仓库未声明解析同步。')
  const initial = yield* readBatch({ offset: 0, limit: 1 })
  if (initial.error || initial.paper.stage !== 'result' || initial.paper.single) return result('not_applicable', '当前不是可采集的完整解析页。')
  const paper = initial.paper, document = paper.document
  if (!paper.title || !paper.total || paper.total !== paper.declared || paper.total > 1000) return result('loading', '等待完整题目与总题数出现。', { retryAfterMs: 1000 })
  const session_id = yield* session(false)
  if (!session_id) return result('login_required', '未登录题库，后台不弹出登录。')
  const run = stableId([document.frameId, document.loaderId, document.url, paper.total, paper.declared])
  const progressKey = paper.stateKey + '/' + run + '/progress'
  let meta = yield* readState(session_id, progressKey)
  if (!meta || meta.total !== paper.total || meta.paperId !== paper.paperId || meta.courseId !== paper.courseId) meta = {
    courseId: paper.courseId, paperId: paper.paperId, total: paper.total, cursor: 0, count: 0, keys: [], index: {}, complete: false, valid: true,
  }
  if (meta.uploaded) return result('synced', '这份完整解析已核对并同步。')
  if (meta.cursor < paper.total) {
    const batch = yield* readBatch({ offset: meta.cursor, limit: 4, assignment_id: paper.assignmentId })
    if (batch.error || batch.paper.document.loaderId !== document.loaderId || batch.paper.total !== paper.total) return result('stale', '解析页已变化，未上传部分内容。')
    const subjects = []
    for (const question of batch.questions) {
      const subject = reviewSubject(question)
      if (!subject) { meta.valid = false; continue }
      subjects.push(subject)
    }
    if (subjects.length) {
      const key = paper.stateKey + '/' + run + '/part/' + meta.keys.length
      // Each write remains bounded; no whole paper is returned to the model.
      const json = JSON.stringify({ subjects })
      if (encodeURIComponent(json).replace(/%[A-F\d]{2}/g, 'x').length > 90 * 1024) return result('needs_review', '本批解析过大，未上传不完整副本。')
      const part = meta.keys.length
      yield* writeState(session_id, key, { subjects })
      meta.keys.push(key)
      for (const question of batch.questions) {
        if (!reviewSubject(question)) continue
        const id = cacheId(question)
        meta.index[id] = Object.hasOwn(meta.index, id) ? -1 : part
      }
    }
    meta.count += batch.questions.length
    meta.cursor = batch.next_offset < 0 ? paper.total : batch.next_offset
    yield* writeState(session_id, progressKey, meta)
    if (meta.cursor < paper.total) return result('collecting', '继续采集同一解析页。', { retryAfterMs: 100 })
  }
  if (!meta.valid || meta.count !== paper.total) {
    // Official answers can appear after the initial render. Retry a fresh pass, never publish a partial paper.
    yield* writeState(session_id, progressKey, { ...meta, cursor: 0, count: 0, keys: [], index: {}, valid: true })
    return result('incomplete', '未得到每道题的可靠官方答案，未上传部分副本。', { retryAfterMs: 2000 })
  }
  meta.complete = true
  yield* writeState(session_id, paper.stateKey + '/ready', meta)
  const status = yield* request(session_id, answerService.lookup, { id: paper.paperId, need_data: false })
  if (status?.status === 401 || status?.authenticationRejected) return result('login_required', '题库会话失效，后台不重新登录。')
  if (status?.status === 403) return result('access_denied', '题库拒绝访问，未上传。')
  if (!status?.ok || ![200, 404].includes(status.status)) return result('service_unavailable', '解析已在本机加密缓存，稍后重试同步。', { retryAfterMs: 3000 })
  const existing = status.status === 200 && (yield* readResponse(session_id, status.request_id, '/has_original_json')).value === true
  if (!existing) {
    const payload = yield* call('payload.from_state', { session_id, keys: meta.keys, source_pointer: '/subjects', pointer: '/data/paperSubjectList',
      json: JSON.stringify({ data: { id: paper.paperId, courseId: paper.courseId, paperType: paper.kind === 'homework' ? 2 : 0, paperName: paper.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), paperSubjectList: [] } }) })
    if (payload.count !== paper.total) return result('incomplete', '缓存题数与页面不符，未上传。')
    const uploaded = yield* request(session_id, answerService.upload, {}, 'POST', payload.payload_id)
    if (!uploaded?.ok || uploaded.status < 200 || uploaded.status >= 300) return result('upload_unconfirmed', '上传未确认；重试前会先查询服务器是否已有完整副本。', { retryAfterMs: uploaded?.status === 401 || uploaded?.status === 403 ? 0 : 3000 })
  }
  yield* writeState(session_id, progressKey, { ...meta, uploaded: true })
  return result('synced', existing ? '服务器已有完整副本，未重复上传。' : '完整官方解析已上传并保留本机加密缓存。')
}
