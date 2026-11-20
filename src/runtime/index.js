import { loginFlow } from './login.js'
import { catalogFlow } from './catalog.js'
import { readQuestions, answerQuestions } from './questions.js'
import { studyFlow, readDocument, discussionFlow } from './study.js'
export function* create({ tool, args, resume }) {
  const handlers = { login: loginFlow, catalog: catalogFlow, read_questions: readQuestions, answer_questions: answerQuestions,
    study: studyFlow, read_document: readDocument, discussion: discussionFlow }
  if (!handlers[tool]) throw new Error('未知站点工具')
  return yield* handlers[tool](args, resume)
}
