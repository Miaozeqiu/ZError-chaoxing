import { call, documents, query, nodes, one, child, clean, result, urlParts } from './host.js'
import { courseIdentity, parameters } from './courses.js'
import { chapterRules, jobKinds } from './chapters.ts'
const digits = value => /^\d+$/.test(value || '')
export function chapterIdentity(value) {
  const course = courseIdentity(value), params = parameters(value), path = urlParts(value).path
  const chapterId = params?.chapterid || params?.knowledgeid || ''
  return course?.clazz && /\/mycourse\/studentstudy\/?$/i.test(path) && digits(chapterId) ? { ...course, chapterId, key: course.key + ':' + chapterId } : null
}
function cardIdentity(value) {
  const params = parameters(value), path = urlParts(value).path
  const courseId = params?.courseid, clazz = params?.clazzid || params?.classid, chapterId = params?.knowledgeid
  return /\/knowledge\/cards\/?$/i.test(path) && [courseId,clazz,chapterId,params?.num].every(digits)
    ? { key: [courseId,clazz,chapterId].join(':'), tab: Number(params.num) + 1 } : null
}
export function* readAll(document, selector, cap = 1000, attributes) {
  const rows = []; let offset = 0, total = 0
  while (rows.length < cap) {
    const page = yield* query(document, selector, Math.min(40, cap - rows.length), offset, attributes)
    total = page.total; rows.push(...page.nodes)
    if (!page.truncated || !page.nodes.length) break
    offset += page.nodes.length
  }
  return { nodes: rows, total, truncated: rows.length < total }
}
function owned(row, nodes, selector) {
  return nodes.filter(node => node.selector.startsWith(row.selector + ' > ') && selector(node))
}
export function* remaining(document, row, rules) {
  const badge = (yield* nodes(document, child(row, rules.badge), 2)).filter(node => node.visible)
  const value = badge.length === 1 && digits(clean(badge[0].text)) ? Number(clean(badge[0].text)) : -1
  if (value > 0) return { remaining: value, pending: true, complete: false }
  const hidden = yield* one(document, child(row, rules.hiddenCount))
  if (hidden) {
    const zero = (yield* call('document.compare', { document, selector: hidden.selector, text: '0' })).matches === true
    return { remaining: zero ? 0 : -1, pending: !zero, complete: zero }
  }
  const complete = (yield* nodes(document, child(row, rules.completed), 2)).some(node => node.visible)
  return { remaining: complete || value === 0 ? 0 : -1, pending: false, complete: complete || value === 0 }
}
export function* directoryState(expectedCourse, existing) {
  const all = existing || (yield* documents())
  let selected
  for (const document of all) {
    const course = courseIdentity(document.url)
    if (!course?.clazz || expectedCourse && course.key !== expectedCourse || !/\/mycourse\/studentcourse\/?$/i.test(urlParts(document.url).path)) continue
    if (selected) return { error: 'ambiguous_directory' }
    selected = { document, course }
  }
  if (!selected) return { error: 'directory_unavailable' }
  const { document, course } = selected, rows = yield* readAll(document, '.chapter_item[id^="cur"]', 160)
  // Collect heading/badge metadata in pages rather than evaluating a page script or issuing one read per field.
  const metadata = yield* readAll(document, '.chapter_item[id^="cur"] :is(.catalog_name,.catalog_sbar,.catalog_points_yi,.knowledgeJobCount,.icon_yiwanc)', 1600)
  const chapters = []
  for (const row of rows.nodes) {
    const id = row.attributes.id?.slice(3), children = owned(row, metadata.nodes, () => true)
    if (!digits(id)) continue
    const named = children.find(node => /(?:^|\s)catalog_name(?:\s|$)/.test(node.attributes.class)), number = children.find(node => /(?:^|\s)catalog_sbar(?:\s|$)/.test(node.attributes.class))
    const title = clean(row.attributes.title || named?.text).slice(0, 160)
    if (!title) continue
    const badge = children.find(node => /(?:^|\s)catalog_points_yi(?:\s|$)/.test(node.attributes.class) && node.visible)
    const hidden = children.find(node => /(?:^|\s)knowledgeJobCount(?:\s|$)/.test(node.attributes.class))
    let count = digits(clean(badge?.text)) ? Number(clean(badge.text)) : -1
    let pending = count > 0
    if (!pending && hidden) {
      const zero = (yield* call('document.compare', { document, selector: hidden.selector, text: '0' })).matches === true
      count = zero ? 0 : -1; pending = !zero
    } else if (!pending && children.some(node => /(?:^|\s)icon_yiwanc(?:\s|$)/.test(node.attributes.class) && node.visible)) count = 0
    const [target] = yield* nodes(document, row.selector + ' > .catalog_title[role="link"]', 1)
    chapters.push({ id, key: course.key + ':' + id, title, number: clean(number?.text), remaining: count, pending, complete: count === 0, node: target, document })
  }
  return { courseKey: course.key, document, chapters, total: rows.total, truncated: rows.truncated || metadata.truncated || chapters.length !== rows.total,
    completed: chapters.filter(row => row.complete).length, pending: chapters.filter(row => row.pending).length, unknown: chapters.filter(row => !row.complete && !row.pending).length }
}
export function* readChapterState() {
  const all = yield* documents(), rootCourse = courseIdentity(all[0].url)
  const chapters = all.filter(document => { const identity = chapterIdentity(document.url); return identity && (!rootCourse || identity.courseId === rootCourse.courseId && (!rootCourse.clazz || identity.clazz === rootCourse.clazz)) })
  if (chapters.length !== 1) return { error: chapters.length ? 'ambiguous_chapter' : 'chapter_unavailable', all }
  const document = chapters[0], identity = chapterIdentity(document.url)
  const active = yield* nodes(document, chapterRules.sidebar.target + chapterRules.sidebar.active, 2)
  if (active.length !== 1 || active[0].attributes.id !== 'cur' + identity.chapterId) return { error: 'chapter_unconfirmed', all }
  const row = active[0], progress = yield* remaining(document, row, chapterRules.sidebar)
  const name = yield* nodes(document, child(row, chapterRules.sidebar.name), 1), number = yield* nodes(document, child(row, chapterRules.sidebar.number), 1)
  const tabPage = yield* query(document, chapterRules.tabs, 40, 0, ['cardid'])
  const tabs = tabPage.nodes, selected = tabs.filter(tab => /(?:^|\s)active(?:\s|$)/.test(tab.attributes.class))
  if (selected.length > 1 || tabPage.truncated) return { error: 'ambiguous_tabs', all }
  const tab = selected.length ? tabs.indexOf(selected[0]) + 1 : 1
  const state = { ...identity, ...progress, root: all[0], document, row, all, title: clean(name[0]?.attributes.title || name[0]?.text), number: clean(number[0]?.text), tab, tabs,
    cards: null, jobs: [], loaded: false }
  const frame = yield* one(document, chapterRules.cards)
  if (!frame) return state
  const children = yield* call('document.frames', { document, selector: frame.selector })
  if (children.documents?.length !== 1) return state
  const cards = children.documents[0], actual = cardIdentity(cards.url)
  if (!actual || actual.key !== identity.key || actual.tab !== tab) return state
  state.cards = cards
  const containers = yield* query(cards, chapterRules.jobContainer, 40)
  if (containers.truncated) return { ...state, error: 'too_many_jobs' }
  for (const container of containers.nodes) {
    const icons = yield* nodes(cards, child(container, chapterRules.jobIcon), 2)
    if (icons.length !== 1) continue
    const frames = yield* query(cards, child(container, 'iframe'), 2, 0, ['data','mid','data-mid','jobid','data-jobid','objectid','_src','switchwindow'])
    if (frames.nodes.length !== 1) { state.jobs.push({ kind: 'unknown', done: false, title: '', id: String(state.jobs.length) }); continue }
    const iframe = frames.nodes[0], attributes = iframe.attributes
    let data = {}; try { data = JSON.parse(attributes.data || '{}') } catch { /* Invalid attachment metadata remains unknown. */ }
    const source = attributes._src || attributes.src || '', kind = jobKinds.find(([, pattern]) => new RegExp(pattern).test(source))?.[0] || 'unknown'
    const done = /(?:^|\s)(?:ans-job-icon-finish|ans-job-icon-finished|ans-job-done)(?:\s|$)/.test(icons[0].attributes.class)
      || /(?:^|\s)ans-job-finished(?:\s|$)/.test(container.attributes.class) || icons[0].attributes.title === chapterRules.jobDoneLabel
    const mid = attributes.mid || attributes['data-mid'] || String(data.mid || '')
    state.jobs.push({ id: mid || attributes.jobid || attributes['data-jobid'] || String(state.jobs.length), kind, done,
      title: clean(data.name || data.title || attributes.title).slice(0, 160), selector: iframe.selector,
      document: cards, focusRequired: attributes.switchwindow === 'true' })
  }
  state.loaded = containers.total > 0 && state.jobs.length > 0
  return state
}
export const publicChapter = state => ({ key: state.key, course_key: state.key?.split(':').slice(0, 2).join(':'), title: state.title || '', number: state.number || '',
  tab: state.tab || 1, total_tabs: state.tabs?.length || 0, remaining: state.remaining ?? -1, complete: Boolean(state.complete), loaded: Boolean(state.loaded),
  jobs: (state.jobs || []).map(job => ({ id: job.id, title: job.title, kind: job.kind, status: job.done ? 'complete' : 'pending', url: '' })) })
export function* inspectChapter() {
  const state = yield* readChapterState()
  return result(state.error || 'chapter', state.error ? '当前章节身份或子文档尚未确认。' : '已读取当前章节与真实任务点。', { complete: Boolean(state.complete), chapter: publicChapter(state) })
}

/** Descendants are reached through exact owner elements, never URL substring matches. */
export function* taskDocuments(kind) {
  const all = yield* documents()
  if (!chapterIdentity(all[0].url)) return all
  const state = yield* readChapterState()
  if (state.error || !state.loaded) return []
  const queue = [], found = [], seen = new Set()
  for (const job of state.jobs.filter(job => job.kind === kind && job.selector)) {
    const receipt = yield* call('document.frames', { document: job.document, selector: job.selector })
    queue.push(...receipt.documents || [])
  }
  for (let index = 0; index < queue.length && index < 12; index++) {
    const document = queue[index], key = document.frameId + ':' + document.loaderId
    if (seen.has(key)) continue
    seen.add(key); found.push(document)
    const frames = yield* query(document, 'iframe,frame', 8)
    if (frames.truncated) return []
    for (const frame of frames.nodes.filter(node => node.visible)) {
      const receipt = yield* call('document.frames', { document, selector: frame.selector })
      queue.push(...receipt.documents || [])
    }
  }
  return queue.length > 12 ? [] : found
}
