import { child, documents, nodes, query, one, click, pause, stableId, result } from './host.js'
import { catalog } from './rules.js'

export function* catalogFlow(args) {
  const rule = catalog[args.kind]
  if (!rule) return result('unsupported', '该类型没有仓库规则。')
  let all = yield* documents()
  if (args.next_page) {
    let changed = false
    for (const document of all) {
      if (!rule.next) break
      const next = yield* one(document, rule.next, true)
      if (next && !next.disabled) { yield* click(document, next); changed = true; break }
    }
    if (!changed) return result('no_next_page', '未观察到可用的下一页控件。')
    yield* pause(250)
    all = yield* documents()
  }
  for (const document of all) {
    const found = yield* query(document, rule.rows, 40, args.offset || 0)
    if (!found.nodes.length) continue
    const items = []
    for (const node of found.nodes) {
      if (!node.selector) continue
      const heading = rule.heading ? yield* nodes(document, child(node, rule.heading), 2) : []
      const title = (heading[0]?.text || node.attributes.title || node.text).replace(/\s+/g, ' ').trim().slice(0, 320)
      const done = rule.completed && (yield* nodes(document, child(node, rule.completed), 1)).length > 0
      items.push({ id: stableId([document, node.selector, title]), title, kind: args.kind,
        status: done ? 'complete' : node.text.replace(/\s+/g, ' ').trim().slice(0, 500),
        url: /^https:\/\//.test(node.attributes.href || '') ? node.attributes.href : '', node })
    }
    const publicItems = items.map(({ node, ...item }) => item)
    if (args.open_id || args.title) {
      const normalized = text => text.replace(/\s+/g, '').normalize('NFKC')
      let matches = items.filter(item => args.open_id ? item.id === args.open_id : normalized(item.title) === normalized(args.title))
      if (!matches.length && args.title) matches = items.filter(item => normalized(item.title).includes(normalized(args.title)))
      if (matches.length !== 1) return result('ambiguous', '没有唯一匹配；请按返回的名称和 id 选择。', { items: publicItems, total: found.total })
      yield* click(document, matches[0].node)
      return result('opened', '已点击刚读取的唯一条目；请用对应工具核对落地页。', { items: publicItems.filter(item => item.id === matches[0].id) })
    }
    return result('listed', '当前网页列表，未把未读取的分页视为已完成。', { items: publicItems,
      total: found.total, next_offset: found.truncated ? (args.offset || 0) + found.nodes.length : -1 })
  }
  // Entry selectors belong to the site repository. Do not interpret arbitrary page text as a command.
  for (const document of all) {
    if (!rule.entry) break
    const entry = yield* one(document, rule.entry, true)
    if (entry) { yield* click(document, entry); return result('navigated', '已打开列表入口，请重新读取列表。') }
  }
  return result('not_found', '当前页面未识别到该列表；请先打开对应学生课程页面。')
}
