import { call, child, documents, nodes, query, one, click, stableId, result } from './host.js'
import { questions as rules, paperForURL } from './rules.js'
import { paperMetadata, publishBatch } from './paper.js'
const selected = node => node.checked || node.attributes['aria-checked'] === 'true' || new RegExp(rules.selectedClass).test(node.attributes.class)
const normalize = text => text.replace(/\s+/g, ' ').trim()
export function* readQuestion(document, row, paper) {
  const heading = yield* nodes(document, child(row, rules.heading), 2)
  const stemNodes = rules.stem ? yield* nodes(document, child(row, rules.stem), 2) : []
  let stem = (stemNodes[0]?.text || heading[0]?.text || '').trim()
  if (!stemNodes.length) stem = stem.replace(/^\d+\s*[.、．]\s*/, '').replace(/^[（(](?:单选题|多选题|判断题|填空题)[）)]\s*/, '')
  const stemTooLong = stem.length > 2000
  stem = normalize(stem).slice(0, 2000)
  let type = 'unknown'
  for (const [name, pattern] of Object.entries(rules.types)) if (new RegExp(pattern).test(heading[0]?.text.slice(0, 150) || '')) { type = name; break }
  if (rules.typeInput) {
    const field = yield* one(document, child(row, rules.typeInput))
    if (field) for (const [code, name] of Object.entries(rules.codes)) {
      const check = yield* call('document.compare', { document, selector: field.selector, text: code })
      if (check.matches) { type = name; break }
    }
  }
  const optionPage = yield* query(document, child(row, rules.options), 16)
  const rawOptions = optionPage.nodes
  const controls = yield* nodes(document, child(row, 'input, [aria-checked], .num_option, .before'), 40)
  const options = []; let optionTooLong = false
  for (const node of rawOptions) {
    const own = controls.filter(control => control.selector.startsWith(node.selector + ' > '))
    const label = own.find(control => /^[A-Z]$/.test(control.choice || ''))?.choice
      || own.find(control => /^[A-Z]$/.test(control.text.trim()))?.text.trim()
      || /^([A-Z])(?:[\s.、．)）]|$)/.exec(node.text.trim())?.[1] || String.fromCharCode(65 + options.length)
    const body = rules.choiceText ? yield* nodes(document, child(node, rules.choiceText), 1) : []
    if ((body[0]?.text || node.text).length > 400) optionTooLong = true
    options.push({ key: label, text: normalize(body[0]?.text || node.text).replace(new RegExp('^' + label + '[.、．]\\s*'), '').slice(0, 400),
      selected: selected(node) || own.some(selected), node })
  }
  const fieldPage = yield* query(document, child(row, rules.fields), 16)
  const fields = fieldPage.nodes.filter(node => node.visible)
  if (type === 'unknown') {
    const inputs = controls.filter(node => ['radio', 'checkbox'].includes(node.attributes.type))
    if (fields.length && !options.length) type = 'completion'
    else if (inputs.length === options.length && options.length >= 2) type = inputs.some(node => node.attributes.type === 'checkbox') ? 'multiple'
      : options.length === 2 && options.every(option => /^(正确|错误|对|错)$/.test(option.text)) ? 'judgement' : 'single'
  }
  const actualBlanks = []; let readable = true
  for (const field of fields) {
    const receipt = yield { op: 'document.value', args: { document, selector: field.selector } }
    if (!receipt?.ok || receipt.truncated || typeof receipt.value !== 'string') { readable = false; actualBlanks.push('') }
    else actualBlanks.push(receipt.value)
  }
  const visual = (yield* nodes(document, child(row, rules.visual), 1)).length > 0
  const unsupported = stemTooLong || optionTooLong || optionPage.truncated || fieldPage.truncated || !readable || new Set(options.map(option => option.key)).size !== options.length || !stem || visual || type === 'unknown'
    || /材料题|完形|完型|听力|简答|论述/.test(heading[0]?.text.slice(0, 100) || '')
    || (type === 'completion' ? !fields.length || options.length > 0 : options.length < 2 || options.length > 16 || fields.length > 0)
  let review = rules.review ? yield* nodes(document, child(row, rules.review), 1) : []
  if (rules.reviewMarker) {
    const markers = (yield* nodes(document, child(row, rules.reviewMarker), 3)).filter(node => node.visible)
    if (markers.length !== 1 || !markers[0].text.includes(rules.reviewLabel)) review = []
  }
  const numberNodes = rules.number ? yield* nodes(document, child(row, rules.number), 1) : []
  const singleNumber = paper.single && rules.singleNumber ? yield* nodes(document, rules.singleNumber, 1) : []
  const number = Number((singleNumber[0]?.text || numberNodes[0]?.text || heading[0]?.text || '').match(/^\s*(\d+)/)?.[1]) || row.index
  const publicOptions = options.map(({ node, ...option }) => option)
  const id = JSON.stringify([document.frameId, document.loaderId, document.url, row.index,
    stableId([number, stem, type, publicOptions.map(({ key, text }) => ({ key, text })), fields.length])])
  return { id, number, order: paper.single ? number : row.index, stem, type, supported: !unsupported, visual,
    subject_type: type === 'multiple' && rules.alternateType && /不定项/.test(heading[0]?.text || '') ? rules.alternateType : rules.subjectTypes?.[type] || 0, options: publicOptions,
    blanks: fields.map((field, index) => ({ index: index + 1, filled: field.hasValue })),
    actual: type === 'completion' ? { blanks: actualBlanks } : { choices: options.filter(option => option.selected).map(option => option.key) },
    reviewAnswer: review[0]?.visible ? review[0].text.trim().slice(0, 4000) : '',
    _options: options, _fields: fields, _document: document, _row: row, _paper: paper }
}
export const publicQuestion = ({ _options, _fields, _document, _row, _paper, ...question }) => question
export function* readBatch(args) {
  const candidates = [], docs = yield* documents()
  const range = args.question_range
  if (range && (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 1 || range.end < range.start || range.end > 10000)) return { error: 'invalid_range' }
  for (const document of docs) {
    const base = paperForURL(document.url)
    if (!base) continue
    let found = yield* query(document, rules.rows, range ? 40 : args.limit || 4, range ? 0 : args.offset || 0)
    if (!found.nodes.some(row => row.visible)) continue
    const paper = yield* paperMetadata(document, base, found.total)
    if (args.assignment_id && args.assignment_id !== paper.assignmentId) continue
    let rangeNext
    if (range) {
      if (found.total > 1000) return { error: 'invalid_range' }
      const all = [...found.nodes]
      while (found.truncated) {
        found = yield* query(document, rules.rows, 40, all.length)
        if (!found.nodes.length) return { error: 'stale' }
        all.push(...found.nodes)
      }
      const singleNumber = paper.single && rules.singleNumber ? yield* nodes(document, rules.singleNumber, 1) : []
      const inRange = all.filter(row => {
        const number = Number((singleNumber[0]?.text || row.text).match(/^\s*(\d+)/)?.[1])
        return row.visible && number >= range.start && number <= range.end
      })
      const numbers = inRange.map(row => Number((singleNumber[0]?.text || row.text).match(/^\s*(\d+)/)?.[1]))
      if (new Set(numbers).size !== numbers.length || (!paper.single && numbers.length !== range.end - range.start + 1) || !numbers.length) return { error: 'ambiguous_range' }
      const offset = args.offset || 0, limit = args.limit || 4
      found = { total: paper.total, nodes: inRange.slice(offset, offset + limit), truncated: offset + limit < inRange.length }
      rangeNext = found.truncated ? offset + found.nodes.length : -1
    }
    candidates.push({ document, found, paper, rangeNext })
  }
  if (candidates.length !== 1) return { error: candidates.length ? 'ambiguous' : 'not_found' }
  const { document, found, paper, rangeNext } = candidates[0], questions = []
  for (const row of found.nodes) if (row.selector && row.visible) questions.push(yield* readQuestion(document, row, paper))
  return { paper, questions, next_offset: rangeNext ?? (found.truncated ? (args.offset || 0) + found.nodes.length : -1) }
}
export function* readQuestions(args) {
  const batch = yield* readBatch(args)
  if (batch.error) return result(batch.error, '未确认唯一的当前作业或章节测验；请打开目标页面。')
  yield* publishBatch(batch.paper, batch.questions)
  return result('questions', '仅返回本批题目及实填值；没有保存或交卷。', {
    assignment_id: batch.paper.assignmentId, title: batch.paper.title,
    questions: batch.questions.map(publicQuestion), total: Math.max(batch.paper.total, batch.paper.declared), next_offset: batch.next_offset,
  })
}
export function* currentQuestion(id) {
  let parts
  try { parts = JSON.parse(id) } catch { return null }
  if (!Array.isArray(parts) || parts.length !== 5 || !Number.isSafeInteger(parts[3]) || parts[3] < 1 || parts[3] > 10000) return null
  const document = (yield* documents()).find(doc => doc.frameId === parts[0] && doc.loaderId === parts[1] && doc.url === parts[2])
  const base = document && paperForURL(document.url)
  if (!base) return null
  const [row] = yield* nodes(document, rules.rows, 1, parts[3] - 1)
  if (!row?.selector || !row.visible) return null
  const rows = yield* query(document, rules.rows, 1)
  const paper = yield* paperMetadata(document, base, rows.total), question = yield* readQuestion(document, row, paper)
  return question.id === id ? question : null
}
export function* answerQuestions(args) {
  const items = []
  for (const answer of args.answers) {
    const question = yield* currentQuestion(answer.question_id)
    const finish = status => items.push({ id: answer.question_id, title: question?.stem.slice(0, 200) || '', kind: 'question', status, url: '' })
    if (!question) { finish('stale'); continue }
    if (!question.supported || question._paper.stage !== 'do') { finish('unsupported'); continue }
    const document = question._document
    if (question.type === 'completion') {
      if (answer.choices?.length || !answer.blanks?.length || answer.blanks.length !== question._fields.length || answer.blanks.some(text => !text.trim() || text.length > 4000)) { finish('invalid_answer'); continue }
      if (question.actual.blanks.some((text, index) => text && text !== answer.blanks[index])) { finish('existing_answer_conflict'); continue }
      for (let index = 0; index < question._fields.length; index++) {
        if (!question._fields[index].hasValue) yield* call('document.fill', { document, selector: question._fields[index].selector, text: answer.blanks[index] })
      }
      let verified = true
      for (let index = 0; index < question._fields.length; index++) {
        if (!(yield* call('document.compare', { document, selector: question._fields[index].selector, text: answer.blanks[index] })).matches) verified = false
      }
      finish(verified ? 'verified' : 'unconfirmed')
    } else {
      const choices = answer.choices || [], unique = [...new Set(choices)]
      if (answer.blanks?.length || !choices.length || choices.length !== unique.length || question.type !== 'multiple' && choices.length !== 1
        || choices.some(key => !question.options.some(option => option.key === key))) { finish('invalid_answer'); continue }
      if (question.options.some(option => option.selected && !choices.includes(option.key))) { finish('existing_answer_conflict'); continue }
      for (const option of question._options) if (choices.includes(option.key) && !option.selected) yield* click(document, option.node)
      const after = yield* currentQuestion(answer.question_id)
      finish(after && after.options.every(option => option.selected === choices.includes(option.key)) ? 'verified' : 'unconfirmed')
    }
    const after = yield* currentQuestion(answer.question_id)
    if (after) yield* publishBatch({ ...after._paper, total: Math.max(args.total || 0, after._paper.total, after._paper.declared, after.number) }, [{ ...after, status: items.at(-1).status === 'verified' ? 'filled' : 'unverified', source: answer.source || 'agent' }], 'result')
  }
  return result('answers_reviewed', '已逐题回读；verified 仅表示网页实填一致。未保存或交卷。', { items })
}
