import { syncPage } from './syncPage.js'
import { inspectChapter } from './chapterState.js'
import { decodeFont } from './font.js'
import { autoAnswer } from './autoAnswer.js'
import { syncReview } from './syncReview.js'
import { loginFlow } from './login.js'
import { catalogFlow } from './catalog.js'
import { readQuestions, answerQuestions } from './questions.js'
import { studyFlow, startCourse, readDocument, discussionFlow } from './study.js'
export function* create({ tool, args, resume }) {
  const handlers = { sync_page: syncPage, chapter_state: inspectChapter, decode_font: decodeFont, auto_answer: autoAnswer, sync_review: syncReview, login: loginFlow, catalog: catalogFlow, read_questions: readQuestions, answer_questions: answerQuestions,
    start_course: startCourse, study: studyFlow, read_document: readDocument, discussion: discussionFlow }
  if (!handlers[tool]) throw new Error('未知站点工具')
  const task = handlers[tool](args, resume)
  let receipt, count = 0
  while (true) {
    const step = task.next(receipt)
    if (step.done) return step.value
    // Leave headroom below the host limit; a new invocation starts with fresh observation.
    if (++count >= 480) return { status: 'pending', message: '单次观察预算已到，请继续当前流程。', complete: false, workflowPending: true, retryAfterMs: 500 }
    receipt = yield step.value
  }
}
