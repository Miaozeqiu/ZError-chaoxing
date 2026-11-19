import { homeworkListRules, pageRules } from './pageRules'
import { matchTitles } from '../matchTitle'
import { resolveAnswers, type AnswerRequest } from './answers'

type HomeworkRequest = {
  operation: 'list' | 'open'
  query?: string
  assignments: Array<{ id: number; title: string }>
}

export function run(request: HomeworkRequest | AnswerRequest | { operation: 'page_rules' } | { operation: 'list_rules' }) {
  if (request.operation === 'page_rules') return pageRules
  if (request.operation === 'list_rules') return homeworkListRules
  if (request.operation === 'resolve_answers') return resolveAnswers(request)
  const { operation, query = '', assignments } = request
  const matched = matchTitles(assignments, query)
  return {
    ids: matched.map(item => item.id),
    ...(operation === 'open' && query.trim() && matched.length === 1 ? { selected: matched[0].id } : {}),
  }
}

export function* workflow({ rows }: { rows: Array<{ status: string }> }): Generator<Record<string, unknown>, Record<string, unknown>, Record<string, unknown>> {
  for (const [index, row] of rows.entries()) {
    const receipt = yield { op: row.status === 'ready' ? 'apply' : 'record', index }
    if (receipt?.ok !== true) return { done: false }
  }
  return { done: true }
}
