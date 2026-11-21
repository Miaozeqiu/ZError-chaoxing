import { parseDocument } from 'htmlparser2'
export const norm = text => String(text || '').normalize('NFKC').replace(/\s+/g, ' ').trim()
export function plain(html) {
  if (typeof html !== 'string' || html.length > 32000) return ''
  const root = parseDocument(html), parts = []
  let visual = false, count = 0
  function visit(node, depth) {
    if (++count > 4000 || depth > 32) { visual = true; return }
    if (['img', 'svg', 'canvas', 'video', 'audio', 'math'].includes(node.name)) visual = true
    if (node.type === 'text') parts.push(node.data)
    for (const child of node.children || []) visit(child, depth + 1)
  }
  visit(root, 0)
  return visual ? '' : norm(parts.join(''))
}
export function plan(question, parts, labels = false) {
  if (!Array.isArray(parts) || !parts.length || parts.some(value => typeof value !== 'string' || !value.trim() || value.length > 4000)) return null
  if (question.type === 'completion') return parts.length === question.blanks.length ? parts.map(value => value.trim()) : null
  const choices = parts.map(part => {
    const value = norm(part)
    if (question.type === 'judgement' && /^(yes|true|no|false)$/i.test(value)) {
      const positive = /^(yes|true)$/i.test(value)
      return question.options.find(option => (positive ? /^(正确|对)$/ : /^(错误|错)$/).test(option.text))?.key
    }
    const options = question.options.filter(option => labels ? option.key === value : norm(option.text) === value)
    return options.length === 1 ? options[0].key : null
  })
  if (choices.some(value => !value) || new Set(choices).size !== choices.length || question.type !== 'multiple' && choices.length !== 1) return null
  return question.options.filter(option => choices.includes(option.key)).map(option => option.key)
}
export function completion(question, raw) {
  if (typeof raw !== 'string') return null
  if (!raw.trim().startsWith('[')) return plan(question, [plain(raw)])
  try {
    let values
    try { values = JSON.parse(raw) } catch { values = JSON.parse(raw.replace(/\|/g, ',')) }
    return Array.isArray(values) ? plan(question, values.map(value => plain(Array.isArray(value) ? value[0] : value))) : null
  } catch { return null }
}
export function official(question) {
  if (!question.reviewAnswer) return null
  if (question.type === 'completion') return completion(question, question.reviewAnswer)
  const parts = question.reviewAnswer.split(/[,，]/)
  return plan(question, parts, true) || (question.type === 'judgement' ? plan(question, parts) : null)
}
export function decodedSubject(raw) {
  if (!raw || typeof raw.rightAnswer !== 'string') return null
  return { ...raw, title: plain(raw.subjectName), options: Array.isArray(raw.subjectOptions) ? raw.subjectOptions.map(option => ({ key: option.optionHead, text: plain(option.optionContent) })) : [] }
}
export function subjectAnswer(question, subject) {
  if (!subject || Number(subject.subjectType) !== question.subject_type || subject.title !== norm(question.stem)) return null
  if (question.type === 'completion') return completion(question, subject.rightAnswer)
  const parts = subject.rightAnswer.split(/[,，]/).map(value => value.trim())
  if (question.type === 'judgement') return plan(question, parts)
  if (subject.options.length !== question.options.length || new Set(subject.options.map(option => option.key)).size !== subject.options.length
    || new Set(subject.options.map(option => option.text)).size !== subject.options.length
    || !question.options.every(option => subject.options.some(candidate => candidate.text === norm(option.text)))) return null
  return plan(question, parts.map(key => subject.options.find(option => option.key === key)?.text || ''))
}
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export function reviewSubject(question) {
  const answer = question.supported && official(question)
  if (!answer) return null
  return { subjectName: escape(question.stem), subjectType: question.subject_type,
    subjectOptions: question.options.map(option => ({ optionHead: option.key, optionContent: escape(option.text) })),
    rightAnswer: question.type === 'completion' ? JSON.stringify(answer.map(value => [escape(value)])) : question.type === 'judgement'
      ? /^(正确|对)$/.test(question.options.find(option => option.key === answer[0]).text) ? 'yes' : 'no' : answer.join(',') }
}
