import { call, documents, nodes, one, click, pause, checkpoint, stableId, result, urlParts } from './host.js'
import { chapter, viewer, discussion } from './rules.js'
import { readChapterState, directoryState, publicChapter, taskDocuments } from './chapterState.js'
import { courseIdentity, courseCatalog } from './courses.js'
import { loginFlow } from './login.js'

export function* readViewer(document, args) {
  const indicators = yield* nodes(document, viewer.marker, 8)
  const viewports = (yield* nodes(document, viewer.viewport, 4)).filter(node => node.visible && node.scroll?.max > 0)
  const buttons = (yield* nodes(document, viewer.next, 4)).filter(node => node.visible && !node.disabled && node.attributes['aria-disabled'] !== 'true')
  const selector = viewer.pageSelect ? yield* one(document, viewer.pageSelect, true) : undefined
  if (!indicators.length && !viewports.length && !buttons.length && !selector) return null
  if (args.read_only) return result('document', '已识别课件阅读器。', { items: indicators.map(node => ({ id: node.selector, title: node.text.slice(0, 300), kind: 'page', status: '', url: '' })) })
  // Respect the visible viewer and any site-provided dwell time. No completion-report endpoint is fabricated.
  const match = /(?:^|&)timing=(\d+)(?:&|$)/.exec(urlParts(document.url).query)
  const seconds = match ? Number(match[1]) : 0
  if (seconds > 60) return result('reading_wait', '此课件要求较长停留时间，请保持阅读器打开后继续。', { complete: false })
  for (let waited = 0; waited < seconds; waited += 10) yield* pause(Math.min(10, seconds - waited) * 1000)
  if (buttons.length === 1) {
    yield* click(document, buttons[0]); yield* pause(250)
    return result('document_advanced', '已点击阅读器下一页，完成状态仍需平台标记确认。', { complete: false })
  }
  if (selector) {
    const options = yield* nodes(document, selector.selector + ' option', 40)
    const index = options.findIndex(option => option.selected)
    if (index >= 0 && index + 1 < options.length) {
      yield* call('document.select', { document, selector: selector.selector, index: index + 2 })
      return result('document_advanced', '已切换阅读页。', { complete: false })
    }
  }
  const viewport = viewports.find(node => node.scroll.top + 4 < node.scroll.max)
  if (viewport) {
    yield* call('document.scroll', { document, selector: viewport.selector, amount: Math.min(2000, Math.max(100, Math.floor(viewport.scroll.viewport * 0.8))) })
    return result('document_advanced', '已滚动阅读器，完成状态仍需平台确认。', { complete: false })
  }
  return result('awaiting_credit', '阅读器已无可确认的下一页，尚未将其视为章节完成。', { complete: false })
}
function* readOwnedViewer(document, args) {
  for (let depth = 0; depth < 4; depth++) {
    const read = yield* readViewer(document, args)
    if (read) return { receipt: read, document }
    const frames = (yield* nodes(document, 'iframe,frame', 2)).filter(node => node.visible)
    if (frames.length !== 1) return null
    const child = yield* call('document.frames', { document, selector: frames[0].selector })
    if (child.documents?.length !== 1) return null
    document = child.documents[0]
  }
  return null
}
export function* readDocument(args) {
  const state = yield* readChapterState()
  if (!state.error) {
    const job = state.jobs.find(job => job.kind === 'document' && !job.done)
    if (!job?.selector) return result('not_found', '当前页签没有未完成的课件任务。')
    const frame = yield* call('document.frames', { document: job.document, selector: job.selector })
    if (frame.documents?.length !== 1) return result('task_loading', '课件所属文档尚未加载。')
    return (yield* readOwnedViewer(frame.documents[0], args))?.receipt || result('not_found','当前课件没有已确认的阅读器。')
  }
  const root = (state.all || (yield* documents()))[0]
  return (yield* readOwnedViewer(root,args))?.receipt || result('not_found','当前页面没有识别到支持的课件阅读器。')
}
function report(state, status, message, extra = {}) {
  return result(status, message, { complete: Boolean(state.complete), chapter: publicChapter(state), ...extra })
}
export function* openDirectory(expected) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const all = yield* documents(), directory = yield* directoryState(expected, all)
    if (!directory.error) return directory
    if (directory.error !== 'directory_unavailable') return directory
    if (attempt === 0) {
      const entries = []
      for (const document of all) {
        if (courseIdentity(document.url)?.key !== expected) continue
        const node = yield* one(document, 'a[title="章节"][data-url*="/mycourse/studentcourse"]', true)
        if (node) entries.push({ document, node })
      }
      if (entries.length !== 1) return directory
      yield* click(entries[0].document, entries[0].node)
    }
    yield* pause(200)
  }
  return { error: 'directory_unavailable' }
}
function* advanceCourse(state, args) {
  const directory = yield* openDirectory(state.key?.split(':').slice(0, 2).join(':') || state.courseKey)
  if (directory.error) return report(state, directory.error, '未确认完整学生章节目录，停止自动跳转。', { complete: false })
  const rows = directory.chapters, scope = args.chapter_range
  const eligible = scope ? rows.filter(row => { const number = Number(row.number); return Number.isInteger(number) && number >= scope.start && number <= scope.end }) : rows
  if (scope && (!eligible.length || !eligible.some(row => Number(row.number) === scope.start) || !eligible.some(row => Number(row.number) === scope.end))) return report(state, 'range_unconfirmed', '尚未确认请求范围中的全部章节。', { complete: false })
  const next = eligible.find(row => row.pending)
  if (!next) return report(state, !directory.truncated && eligible.length && eligible.every(row => row.complete) ? 'course_complete' : 'directory_unconfirmed',
    '已按目录重新核对任务计数；未知条目或未读目录不视为完成。', { complete: !directory.truncated && eligible.length > 0 && eligible.every(row => row.complete) })
  if (!next.node?.visible || next.node.disabled) return report(state, 'chapter_unavailable', '待完成章节没有唯一可用的打开控件。', { complete: false })
  yield* checkpoint({ phase: 'opening_chapter', course: directory.courseKey, chapter: next.key })
  yield* click(next.document, next.node)
  for (let wait = 0; wait < 8; wait++) {
    yield* pause(200)
    const current = yield* readChapterState()
    if (!current.error && current.key === next.key) return null
  }
  return report(state, 'chapter_unconfirmed', '打开请求已发出，目标章节尚未确认。', { complete: false })
}
function* jobDocument(state, job) {
  yield* call('document.reveal', { document: job.document, selector: job.selector })
  for (let attempt = 0; attempt < 4; attempt++) {
    const frame = yield* call('document.frames', { document: job.document, selector: job.selector })
    if (frame.documents?.length === 1) return frame.documents[0]
    yield* pause(200)
  }
  return null
}
export function* studyFlow(args, resume) {
  const restored = resume?.state
  let expected = args.current_only && typeof restored?.chapter === 'string' ? restored.chapter : '', previous = '', stagnant = 0
  for (let step = 0; step < 12; step++) {
    const state = yield* readChapterState()
    if (restored?.course && courseIdentity(state.all?.[0]?.url || state.root?.url || '')?.key !== restored.course) return report(state, 'workflow_mismatch', '当前页面不再属于原课程；没有重放导航或播放。', { complete: false, workflowPending: true })
    if (state.error) {
      if (args.read_only || args.current_only || expected) return report(state, state.error, '当前章节身份尚未确认，没有操作其他文档。', { complete: false })
      const all = state.all || (yield* documents()), course = courseIdentity(all[0].url)
      if (!course?.clazz) return report(state, state.error, '请先进入目标学生课程。', { complete: false })
      const advanced = yield* advanceCourse({ ...state, courseKey: course.key }, args)
      if (advanced) return advanced
      continue
    }
    if (expected && state.key !== expected) return report(state, 'chapter_changed', '章节已变化，请重新核对请求范围。', { complete: false })
    expected = state.key
    if (args.read_only) return report(state, 'chapter', '已只读核对当前章节身份、平台计数与任务点。')
    if (args.chapter_range) {
      const number = Number(state.number), range = args.chapter_range
      if (!Number.isInteger(number) || number < range.start || number > range.end) {
        if (args.current_only) return report(state, 'range_unconfirmed', '当前章节不在已确认的请求范围内。', { complete: false })
        const advanced = yield* advanceCourse(state, args)
        if (advanced) return advanced
        expected = ''; continue
      }
    }
    if (state.complete) {
      if (args.current_only) return report(state, 'chapter_complete', '已观察到当前章节任务计数为零或明确完成标记。')
      const advanced = yield* advanceCourse(state, args)
      if (advanced) return advanced
      expected = ''; previous = ''; stagnant = 0; continue
    }
    if (!state.loaded) return report(state, 'chapter_loading', '当前页签的任务文档尚未正确加载；空列表不视为完成。', { workflowPending: true })
    const job = state.jobs.find(row => !row.done)
    if (!job) {
      const next = state.tabs[state.tab]
      if (!next?.visible || next.disabled || /(?:^|\s)disabled(?:\s|$)/.test(next.attributes.class) || next.attributes['aria-disabled'] === 'true') return report(state, 'awaiting_credit', '任务点已核对，但章节计数尚未确认完成。', { workflowPending: true })
      yield* click(state.document, next); yield* pause(250)
      const after = yield* readChapterState()
      if (after.key !== state.key || after.tab !== state.tab + 1 || !after.loaded) return report(state, 'tab_unconfirmed', '新页签身份或所属任务文档尚未确认。', { workflowPending: true })
      continue
    }
    if (!job.selector || job.kind === 'unknown') return report(state, 'unsupported_task', '存在未识别的真实任务点，请核对当前页面。')
    if (args.video_only && job.kind !== 'video') return report(state, 'needs_' + job.kind, '当前待完成任务不是视频。')
    const document = yield* jobDocument(state, job)
    if (!document) return report(state, 'task_loading', '当前任务点的所属 iframe 尚未加载。', { workflowPending: true })
    if (job.kind === 'quiz' || job.kind === 'discussion') return report(state, 'needs_' + job.kind, '已确认所属任务文档，请使用本站读题或讨论工具后继续。')
    if (job.kind === 'video') {
      const mediaNodes = (yield* nodes(document, chapter.media, 4)).filter(node => node.visible)
      if (mediaNodes.length !== 1) return report(state, 'media_unconfirmed', '未确认当前任务内唯一可见播放器。')
      const target = { document, selector: mediaNodes[0].selector }
      let media = yield* call('media.read', target), pauses = 0
      if (!media.ended) {
        yield* checkpoint({ phase: 'media', course: state.key.split(':').slice(0,2).join(':'), chapter: state.key, job: job.id })
        yield* call('media.mute', { ...target, muted: args.muted !== false })
        if (media.paused) media = yield* call('media.play', target)
        for (let wait = 0; wait < 48 && !media.ended; wait++) {
          media = yield* call('media.wait', { ...target, until: 'ended', timeoutMs: 30000 })
          if (['error','emptied','cancelled'].includes(media.event)) return report(state, 'media_interrupted', '媒体已中断，等待重新观察。', { workflowPending: true })
          if (media.paused && !media.ended) {
            const blocking = (yield* nodes(document, chapter.question + ', [id*="captcha"], [class*="captcha"]', 4)).some(node => node.visible)
            if (blocking) return report(state, 'needs_review', '播放器出现测验或验证控件，停止自动恢复。', { workflowPending: true })
            if (++pauses > 1) return report(state, 'paused', '当前视频再次暂停，请核对网页或用户操作。', { workflowPending: true })
            media = yield* call('media.play', target)
          }
        }
        if (!media.ended) return report(state, 'watching', '视频仍在播放，可从检查点继续等待。', { workflowPending: true })
      }
      for (let credit = 0; credit < 6; credit++) {
        yield* pause(250)
        const after = yield* readChapterState()
        if (after.key !== state.key || after.tab !== state.tab) return report(state, 'chapter_changed', '播放后页面身份发生变化，请重新核对。', { complete: false })
        const actual = after.jobs.find(row => row.id === job.id)
        if (after.complete || actual?.done) break
        if (credit === 5) return report(after, 'awaiting_credit', '视频已结束，平台任务点尚未确认完成。', { complete: false, workflowPending: true })
      }
      continue
    }
    const bound = yield* readOwnedViewer(document, {}), read = bound?.receipt
    if (!read) return report(state, 'viewer_unconfirmed', '当前课件任务中没有识别到阅读器。')
    if (read.status !== 'document_advanced') return report(state, read.status, read.message, { workflowPending: true })
    const fingerprint = JSON.stringify([state.key, state.tab, job.id, (yield* nodes(bound.document, viewer.marker, 8)).map(node => [node.text, node.attributes.src])])
    stagnant = fingerprint === previous ? stagnant + 1 : 0; previous = fingerprint
    if (stagnant >= 2) return report(state, 'reading_unconfirmed', '阅读位置没有推进，请核对课件。')
    yield* checkpoint({ phase: 'reading', course: state.key.split(':').slice(0,2).join(':'), chapter: state.key, job: job.id }); yield* pause(250)
  }
  return result('pending', '已到单次推进上限，请重新观察后继续。', { complete: false, workflowPending: true })
}
export function* startCourse(args, resume) {
  if (resume?.state?.course) {
    const all = yield* documents()
    if (courseIdentity(all[0].url)?.key !== resume.state.course) return result('workflow_mismatch', '当前页面不属于原课程，请先核对原流程。', { complete: false, workflowPending: true })
    return yield* studyFlow(args, resume)
  }
  const login = yield* loginFlow(args)
  if (!login.loggedIn) return login
  const opened = yield* courseCatalog({ title: args.course_name, teacher: args.teacher })
  if (opened.status !== 'opened') return opened
  const course = courseIdentity((yield* documents())[0].url)
  if (!course?.clazz) return result('course_unconfirmed', '学生课程身份尚未完整确认。')
  // Persist progress before the potentially large directory scan exhausts this invocation.
  yield* checkpoint({ phase: 'course_opened', course: course.key })
  return yield* studyFlow(args)
}
export function* discussionFlow(args, resume) {
  if (!discussion) return result('unsupported', '该站点尚无已核实的讨论规则。')
  const documentsNow = yield* taskDocuments('discussion'), candidates = []
  for (const document of documentsNow) {
    const topic = yield* nodes(document, discussion.topic, 4)
    if (topic.some(node => node.visible)) candidates.push({document,topic})
  }
  if (candidates.length > 1) return result('ambiguous','存在多个讨论正文，未选择发布目标。')
  for (const { document, topic } of candidates) {
    const text = topic.map(node => node.text.trim()).filter(Boolean).join('\n').slice(0, 2600)
    const id = stableId([document, text])
    const replies = (yield* nodes(document, discussion.replies, 6)).map(node => node.text.trim().slice(0, 500))
    const base = { discussion_id: id, topic: text, replies }
    if (!args.reply) return result('discussion', '仅取讨论题目和少量匿名回复；由模型独立组织回复。', base)
    if (args.discussion_id !== id || args.reply.length > 4000 || !args.reply.trim()) return result('stale', '讨论目标已变化或回复格式无效。', base)
    if (replies.includes(args.reply.trim())) return result('reply_observed', '已观察到相同正文，不重复发布。', base)
    if (resume?.state?.phase === 'posting') return result('reply_unconfirmed', '上次发布结果不明确，已停止自动重发，请核对网页。', { ...base, workflowPending: true })
    const input = yield* one(document, discussion.input, true), submit = yield* one(document, discussion.submit, true)
    if (!input || !submit || input.disabled || submit.disabled) return result('unavailable', '未确认唯一的讨论输入框和发送按钮。', base)
    if (input.hasValue && !(yield* call('document.compare', { document, selector: input.selector, text: args.reply })).matches) return result('draft_conflict', '保留网页中已有的不同草稿。', base)
    yield* call('document.fill', { document, selector: input.selector, text: args.reply })
    if (!(yield* call('document.compare', { document, selector: input.selector, text: args.reply })).matches) return result('draft_unconfirmed', '回复正文未回读一致。', base)
    yield* checkpoint({ phase: 'posting', url: document.url, discussion: id })
    yield* click(document, submit)
    for (let attempt = 0; attempt < 4; attempt++) {
      yield* pause(250)
      const after = (yield* nodes(document, discussion.replies, 40)).map(node => node.text.trim())
      if (after.includes(args.reply.trim())) return result('reply_observed', '已在网页回读到回复，章节学分仍以平台标记为准。', { ...base, replies: after.slice(0, 6).map(text => text.slice(0, 500)) })
    }
    return result('reply_unconfirmed', '已点击发布，尚未回读到正文，请核对网页，不自动重复发送。', { ...base, workflowPending: true })
  }
  return result('not_found', '当前页面没有识别到支持的章节讨论。')
}
