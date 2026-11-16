import { matchTitles } from '../matchTitle'
import { resolveAnswers, type AnswerRequest } from './answers'

type HomeworkRequest = {
  operation: 'list' | 'open'
  query?: string
  assignments: Array<{ id: number; title: string }>
}

export function run(request: HomeworkRequest | AnswerRequest) {
  if (request.operation === 'resolve_answers') return resolveAnswers(request)
  const { operation, query = '', assignments } = request
  const matched = matchTitles(assignments, query)
  return {
    ids: matched.map(item => item.id),
    ...(operation === 'open' && query.trim() && matched.length === 1 ? { selected: matched[0].id } : {}),
  }
}
