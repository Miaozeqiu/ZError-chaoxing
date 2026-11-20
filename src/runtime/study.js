import { call, documents, nodes, query, one, click, pause, checkpoint, child, stableId, result, urlParts } from './host.js'
import { chapter, viewer, discussion } from './rules.js'

function* chapterState() {
  const all = yield* documents()
  for (const document of all) {
    const active = yield* nodes(document, ':is(' + chapter.rows + ')' + chapter.active, 2)
    if (active.length !== 1) continue
    const row = active[0]
    let done = (yield* nodes(document, child(row, chapter.done), 1)).length > 0
    if (done && chapter.completionScope === 'tabs') {
      const tabPage = yield* query(document, chapter.tabs, 40)
      if (tabPage.truncated) done = false
      for (const tab of tabPage.nodes) {
        if (!tab.disabled && !(yield* nodes(document, child(tab, chapter.done), 1)).length) { done = false; break }
      }
    }
    return { all, document, row, complete: done, key: stableId([document.url, row.attributes.id, row.text]) }
  }
  return { all, complete: false, key: '' }
}
function* readViewer(document, args) {
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
export function* readDocument(args) {
  const documentsNow = yield* documents()
  for (const document of documentsNow) { const read = yield* readViewer(document, args); if (read) return read }
  return result('not_found', '没有识别到支持的课件阅读器。')
}
export function* studyFlow(args) {
  // Restoring a checkpoint always starts with a fresh DOM observation; never reuse saved locators.
  let previous = '', stagnant = 0, pauses = 0
  for (let step = 0; step < 24; step++) {
    let state = yield* chapterState()
    if (args.read_only) return result('chapter', '已按当前平台标记复核章节。', { complete: state.complete })
    if (state.complete) {
      if (args.current_only) return result('chapter_complete', '已观察到当前章节的完成图标。', { complete: true })
      let directoryDocument = state.document, directoryRow = state.row
      if (chapter.directoryRows) {
        directoryRow = undefined
        for (const document of state.all) {
          const active = yield* one(document, chapter.directoryActive, true)
          if (active) { directoryDocument = document; directoryRow = active; break }
        }
      }
      if (!directoryRow) return result('directory_unavailable', '当前节已完成，但尚未确认其在课程目录中的位置。', { complete: true })
      const directoryPage = yield* query(directoryDocument, chapter.directoryRows || chapter.rows, 40)
      const rows = directoryPage.nodes
      const current = rows.findIndex(node => node.selector === directoryRow.selector)
      if (current < 0) return result('directory_unavailable', '当前小节不在已读取的目录范围中，请重新读取目录。', { complete: true })
      let next
      for (const row of rows.slice(Math.max(0, current + 1))) {
        if (!(yield* nodes(directoryDocument, child(row, chapter.directoryDone || chapter.done), 1)).length && row.visible && !row.disabled) { next = row; break }
      }
      if (!next && directoryPage.truncated) return result('directory_more', '目录仍有未读取条目，请继续读取目录后核对用户范围。', { complete: false })
      if (!next) return result('no_next_observed', '当前已读取的目录中没有下一待完成章节；未把未读取条目视为完成。', { complete: true })
      yield* click(directoryDocument, next); yield* pause(250); continue
    }
    let mediaTarget
    for (const document of state.all) {
      const media = (yield* nodes(document, chapter.media, 4)).filter(node => node.selector)
      // Hidden preload players must never be started alongside the active player.
      const visible = media.filter(node => node.visible)
      if (visible.length === 1) { mediaTarget = { document, node: visible[0] }; break }
    }
    if (mediaTarget) {
      const { document, node } = mediaTarget
      const target = { document, selector: node.selector }
      let media = yield* call('media.read', target)
      if (!media.ended) {
        yield* checkpoint({ phase: 'media', url: document.url, chapter: state.key })
        yield* call('media.mute', { ...target, muted: args.muted !== false })
        if (media.paused) media = yield* call('media.play', target)
        for (let wait = 0; wait < 48 && !media.ended; wait++) {
          media = yield* call('media.wait', { ...target, until: 'ended', timeoutMs: 30000 })
          if (['error', 'emptied', 'cancelled'].includes(media.event)) return result('media_interrupted', '媒体状态变化，请重新核对页面。', { complete: false, workflowPending: true })
          if (media.paused && !media.ended) {
            // A site quiz or a user pause is not permission to fight the page indefinitely.
            if (++pauses > 1) return result('paused', '媒体再次暂停，请核对弹题、验证或用户操作。', { complete: false, workflowPending: true })
            const quiz = (yield* nodes(document, chapter.question, 1)).length
            if (quiz) return result('needs_quiz', '播放中出现测验，请先读取题目。', { complete: false })
            media = yield* call('media.play', target)
          }
        }
        if (!media.ended) return result('watching', '媒体仍在播放，可从检查点继续等待。', { complete: false, workflowPending: true })
      }
      // A media ended event never proves platform completion.
      yield* pause(500); state = yield* chapterState()
      if (state.complete) continue
    }
    let readingAdvanced = false
    for (const document of state.all) {
      if ((yield* nodes(document, chapter.question, 1)).length) return result('needs_quiz', '当前有章节测验，请读取题目并核对答案。', { complete: false })
      if (chapter.discussion && (yield* nodes(document, chapter.discussion, 1)).length) return result('needs_discussion', '当前有章节讨论，请读取题目与匿名回复样本。', { complete: false })
      if (!args.video_only) {
        const read = yield* readViewer(document, {})
        if (read?.status === 'document_advanced') {
          const fingerprint = JSON.stringify([document, (yield* nodes(document, viewer.marker, 8)).map(node => [node.text, node.attributes.src])])
          stagnant = fingerprint === previous ? stagnant + 1 : 0; previous = fingerprint
          if (stagnant >= 2) return result('reading_unconfirmed', '课件操作后未观察到阅读位置推进，请核对阅读器。', { complete: false })
          readingAdvanced = true
          yield* checkpoint({ phase: 'reading', url: document.url, chapter: state.key })
          break
        }
      }
    }
    if (readingAdvanced) continue
    let moved = false
    for (const document of state.all) {
      const tabs = (yield* nodes(document, chapter.tabs, 40)).filter(node => node.visible)
      const active = tabs.findIndex(node => node.attributes['aria-selected'] === 'true' || new RegExp(chapter.selectedTab).test(node.attributes.class))
      const next = tabs[active + 1]
      if (active >= 0 && next && !next.disabled && !new RegExp(chapter.disabledTab).test(next.attributes.class) && next.attributes['aria-disabled'] !== 'true') {
        yield* click(document, next); yield* pause(250); moved = true; break
      }
    }
    if (!moved) return result('awaiting_credit', '没有观察到章节完成标记或可安全推进的页签。', { complete: false })
  }
  return result('pending', '已达到单次推进上限，请重新核对当前章节后继续。', { complete: false })
}
export function* discussionFlow(args, resume) {
  if (!discussion) return result('unsupported', '该站点尚无已核实的讨论规则。')
  const documentsNow = yield* documents()
  for (const document of documentsNow) {
    const topic = yield* nodes(document, discussion.topic, 4)
    if (!topic.length) continue
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
