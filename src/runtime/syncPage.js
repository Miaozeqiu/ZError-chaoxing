import { call, documents, result } from './host.js'
import { readChapterState, directoryState } from './chapterState.js'
import { readQuestions } from './questions.js'
import { courseIdentity } from './courses.js'
export function* syncPage(args) {
  const state = yield* readChapterState()
  if (!state.error) {
    const left = state.jobs.filter(row => !row.done), done = state.jobs.filter(row => row.done), next = left[0]
    const label = row => row.title || row.kind
    const panel = { current: state.title, event: state.complete ? 'chapter_jobs_done' : next?.kind === 'quiz' ? 'quiz_left' : 'progress',
      leftJobs: left.map(label), doneJobs: done.map(label), jobLine: state.jobs.map(row => label(row) + (row.done?'已完成':'未完成')).join(' · '),
      thisSection: { title: state.title, ...(next ? { next: { label: label(next), kind: next.kind } } : {}) } }
    yield* call('context.publish',{ document: state.document, json: JSON.stringify(panel) })
  } else {
    const all = state.all || (yield* documents()), course = courseIdentity(all[0].url)
    if (course?.clazz) {
      const directory = yield* directoryState(course.key, all)
      if (!directory.error) yield* call('context.publish',{ document: directory.document, json: JSON.stringify({ current:'', event:'progress',
        unfinishedCount: directory.pending, chapters: directory.chapters.slice(0,40).map(row => ({ title:[row.number,row.title].filter(Boolean).join(' '), unfinished: row.pending })),
        hint: directory.truncated || directory.unknown ? '目录仍有未确认条目。' : '' }) })
    }
  }
  const questions = yield* readQuestions({ offset: args.offset || 0, limit: 8 })
  return result('synced','已自动同步当前网站的章节或题目状态。', { next_offset: questions.next_offset ?? -1, retryAfterMs: questions.next_offset >= 0 ? 100 : 5000 })
}
