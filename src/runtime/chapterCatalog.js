import { documents, result, click, pause, clean } from './host.js'
import { courseIdentity } from './courses.js'
import { directoryState, readChapterState } from './chapterState.js'
import { openDirectory } from './study.js'
export function* chapterCatalog(args) {
  const all = yield* documents(), course = courseIdentity(all[0].url)
  if (!course?.clazz) return result('course_unconfirmed', '请先进入目标学生课程。')
  const directory = args.read_only ? yield* directoryState(course.key, all) : yield* openDirectory(course.key)
  if (directory.error) return result(directory.error, '尚未确认学生章节目录。')
  const items = directory.chapters.map(row => ({ id: row.key, title: [row.number,row.title].filter(Boolean).join(' '), kind: 'chapters', status: row.complete ? 'complete' : row.pending ? 'pending' : 'unknown', url: '' }))
  if (args.open_id || args.title) {
    const key = value => clean(value).normalize('NFKC').replace(/\s/g,'')
    const matches = directory.chapters.filter(row => args.open_id ? row.key === args.open_id : key(row.title) === key(args.title) || key(row.number) === key(args.title))
    if (matches.length !== 1 || directory.truncated && !args.open_id) return result('ambiguous', '未确认唯一章节，请使用刚读取的 id。', { items: items.slice(0,40), total: directory.total })
    if (args.read_only) return result('chapter', '只读核对章节，没有打开。', { items: items.filter(row => row.id === matches[0].key) })
    const row = matches[0]
    yield* click(row.document,row.node)
    for (let attempt=0; attempt<8; attempt++) {
      yield* pause(200)
      const state = yield* readChapterState()
      if (!state.error && state.key === row.key) return result('opened','已核对目标章节落地页。',{ items: items.filter(item => item.id === row.key) })
    }
    return result('chapter_unconfirmed','打开请求已发出，但目标章节尚未确认。')
  }
  const offset=args.offset||0
  return result('listed','已读取章节计数；未知任务和未读目录不视为完成。',{ items:items.slice(offset,offset+40), total:directory.total, next_offset:offset+40<items.length?offset+40:-1 })
}
