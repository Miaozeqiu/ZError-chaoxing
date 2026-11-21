import { call, nodes, query, urlParts, stableId } from './host.js'
import { paperRules } from './rules.js'
export function* paperMetadata(document, base, total) {
  const title = (yield* nodes(document, paperRules.title, 2)).map(node => node.text.trim()).find(Boolean) || ''
  let declared = 0
  if (base.single) declared = (yield* query(document, paperRules.indexItems, 1)).total
  else {
    const labels = yield* nodes(document, paperRules.totalLabels, 20)
    for (const node of labels) {
    const match = node.text.match(/共\s*(\d+)\s*题/)
    if (match) declared = Math.max(declared, Number(match[1]))
  }
  }
  return { ...base, document, title: title.slice(0, 320), total, declared,
    assignmentId: stableId([base.key, document.url]), stateKey: 'review/' + stableId([base.courseId, base.kind, base.paperId]) }
}
export function* publishBatch(paper, questions, phase = 'read') {
  yield* call('questions.publish', { document: paper.document, assignmentId: paper.assignmentId, title: paper.title,
    total: Math.max(paper.total, paper.declared), phase,
    questions: questions.map(question => ({ question_id: question.id, number: question.number, order: question.order || question.number,
      stem: question.stem, type: question.type === 'unknown' ? 'unsupported' : question.type,
      options: question.options.map(option => ({ label: option.key, text: option.text })), actual: question.actual,
      status: question.status || (!question.supported ? 'needs_review' : question.type === 'completion'
        ? question.blanks.every(blank => blank.filled) ? 'answered' : question.blanks.some(blank => blank.filled) ? 'partial' : 'unanswered'
        : question.options.some(option => option.selected) ? 'answered' : 'unanswered'),
      ...(question.source ? { source: question.source === 'model' ? 'agent' : 'bank' } : {}),
    })) })
}
export const relativePath = value => urlParts(value).path
