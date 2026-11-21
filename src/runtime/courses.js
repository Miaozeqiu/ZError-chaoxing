import { call, child, documents, nodes, query, one, click, pause, clean, stableId, result, urlParts } from './host.js'
export const courseRules = {
  active: '.tab-item.current, .tab-item.active, .tab-item.selected', type: '#courseType', student: '.tab-item[coursetype="1"]',
  rows: '#courselistArea li, .courselistArea li, .course-list .course-item, #courselistArea .course-card',
  heading: '[class*="course-name"], [class*="courseName"], .course-title, .courseTitle, h3, h4',
  teacher: '.teacher, .teacher-name, .teacherName, [class*="courseTeacher"], .course-info > p.line2:last-child',
  links: 'a[href], [data-href], [data-url], [onclick]', more: '.folder, .course-folder, [folderid], [data-folder-id], .pagination .next:not(.disabled), .load-more',
}
export function parameters(value) {
  const query = urlParts(value).query, pairs = {}
  try { for (const pair of query.split('&')) { const at = pair.indexOf('='); if (at >= 0) pairs[decodeURIComponent(pair.slice(0, at)).toLowerCase()] = decodeURIComponent(pair.slice(at + 1)) } }
  catch { return null }
  return pairs
}
export function courseIdentity(value) {
  const address = urlParts(value), params = parameters(value)
  if (!params || !/(^|\.)chaoxing\.com$/.test(address.host) || !/^\/(?:(?:mooc2?-ans)\/)?(?:visit\/stucoursemiddle|mycourse\/(?:stu|studentcourse|studentstudy))\/?$/i.test(address.path) || !/^\d+$/.test(params.courseid || '')) return null
  const clazz = params.clazzid || params.classid || ''
  if (clazz && !/^\d+$/.test(clazz)) return null
  return { courseId: params.courseid, clazz, key: params.courseid + ':' + clazz }
}
const titleKey = text => clean(text).normalize('NFKC').replace(/\s/g, '').toLowerCase()
function addressFrom(node, document) {
  for (const name of ['href','data-href','data-url','onclick']) {
    const value = node.attributes[name] || ''
    for (const candidate of value.match(/(?:https:\/\/[^\s'"<>]+|\/(?:[^\s'"<>/?]+\/)*(?:stucoursemiddle|stu)\?[^\s'"<>);]+)/g) || []) {
      const url = candidate.startsWith('https://') ? candidate : urlParts(document.url).origin + candidate
      const identity = courseIdentity(url)
      if (identity) return { url, ...identity }
    }
  }
  return null
}
function* isStudent(document) {
  const active = yield* one(document, courseRules.active)
  if (active) {
    const [projected] = (yield* query(document, active.selector, 1, 0, ['coursetype'])).nodes
    if (projected?.attributes.coursetype) return projected.attributes.coursetype === '1'
    if (['我学的课','已学的课'].includes(clean(active.text))) return true
  }
  const type = yield* one(document, courseRules.type)
  return type ? (yield* call('document.compare', { document, selector: type.selector, text: '1' })).matches === true : false
}
export function* courseCatalog(args) {
  let entered = false, switched = false
  for (let attempt = 0; attempt < 8; attempt++) {
    const all = yield* documents(), root = all[0]
    if (/^https:\/\/passport2\.chaoxing\.com\//.test(root.url)) return result('login_required', '请先用本站登录工具确认登录。')
    const pages = all.filter(document => /\/(?:visit\/(?:interaction|courses)|courselist)(?:[/?#]|$)/i.test(document.url))
    if (pages.length > 1) return result('ambiguous', '存在多个课表文档，请核对学生课表。')
    const candidates = pages.length ? pages : [root]
    for (const document of candidates) {
      const first = yield* query(document, courseRules.rows, 40, 0, ['data-href','data-url','onclick'])
      if (!first.total && !pages.length) continue
      if (!(yield* isStudent(document))) {
        if (args.read_only || switched) return result('student_unconfirmed', '未确认「我学的课」，没有读取教师课程。')
        const tab = yield* one(document, courseRules.student, true)
        if (tab) { yield* click(document, tab); switched = true; yield* pause(200); break }
        return result('student_unconfirmed', '没有确认唯一学生课表入口。')
      }
      const found = [], seen = new Set(); let offset = 0, processed = 0, truncated = false
      while (offset >= 0 && processed < 80) {
        const page = offset ? yield* query(document, courseRules.rows, 40, offset, ['data-href','data-url','onclick']) : first
        processed += page.nodes.length
        for (const row of page.nodes) {
          if (!row.visible) continue
          const heading = yield* nodes(document, child(row, courseRules.heading), 2)
          const teacher = yield* nodes(document, child(row, courseRules.teacher), 2)
          const links = (yield* query(document, child(row, courseRules.links), 8, 0, ['data-href','data-url','onclick'])).nodes
          const targets = [addressFrom(row, document), ...links.map(link => addressFrom(link, document))].filter(Boolean)
          const identities = [...new Map(targets.map(target => [target.key, target])).values()]
          if (identities.length !== 1) continue
          const target = identities[0], title = clean(heading[0]?.attributes.title || heading[0]?.text || row.attributes.title || '')
          if (!title || title.length > 180 || heading[0]?.textTruncated || seen.has(target.key)) continue
          seen.add(target.key)
          found.push({ id: stableId([document, row.selector, title, teacher[0]?.text, target]), title,
            teacher: clean(teacher[0]?.text).slice(0, 100), kind: 'courses', status: '', url: target.url, target })
        }
        truncated = page.truncated
        offset = page.truncated ? offset + page.nodes.length : -1
      }
      truncated ||= offset >= 0
      truncated ||= (yield* nodes(document, courseRules.more, 1)).some(node => node.visible && !node.disabled)
      const publicItems = found.map(({ target, ...item }) => item)
      if (!args.title && !args.open_id) {
        const start = args.offset || 0
        return result('listed', '已读取学生课程；未将折叠文件夹或未读分页当成完整课表。', { items: publicItems.slice(start, start + 40), total: found.length,
          next_offset: start + 40 < found.length ? start + 40 : -1 })
      }
      const eligible = args.teacher ? found.filter(row => titleKey(row.teacher).includes(titleKey(args.teacher))) : found
      const exact = args.title ? eligible.filter(row => titleKey(row.title) === titleKey(args.title)) : []
      const matches = args.open_id ? found.filter(row => row.id === args.open_id) : exact.length ? exact : eligible.filter(row => titleKey(row.title).includes(titleKey(args.title)))
      if (matches.length !== 1 || truncated && !args.open_id) return result('ambiguous', '尚未确认唯一课程；可用教师信息或刚读取的 id 区分。', { items: publicItems.slice(0, 40), total: found.length })
      if (args.read_only) return result('course', '只读核对课程，没有打开。', { items: publicItems.filter(row => row.id === matches[0].id) })
      const selected = matches[0]
      yield* call('document.navigate', { document: root, url: selected.url })
      for (let wait = 0; wait < 12; wait++) {
        const current = (yield* documents())[0], identity = courseIdentity(current.url)
        if (identity?.courseId === selected.target.courseId && (!selected.target.clazz || identity.clazz === selected.target.clazz)) return result('opened', '已核对进入目标学生课程。', { items: publicItems.filter(row => row.id === selected.id) })
        if (/passport2\.chaoxing\.com/.test(current.url)) return result('login_required', '打开课程后需要重新登录；未声称已进入。')
        yield* pause(200)
      }
      return result('landing_unconfirmed', '已发出打开请求，但落地课程尚未确认；请读取实际页面。')
    }
    if (!entered && !switched && !args.read_only && !args.open_id) {
      const entry = yield* one(root, '#zne_kc_icon', true)
      if (entry) yield* click(root, entry)
      else if (!/^https:\/\/i(?:\.mooc)?\.chaoxing\.com\//.test(root.url)) yield* call('document.navigate', { document: root, url: 'https://i.chaoxing.com/' })
      entered = true
    }
    yield* pause(200)
  }
  return result('not_found', '学生课表尚未就绪；没有猜测课程链接。')
}
