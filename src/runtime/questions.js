import { call, child, documents, nodes, query, one, click, stableId, result } from './host.js'
import { questions as rules } from './rules.js'

const selectState = node => node.checked || node.attributes['aria-checked'] === 'true' || new RegExp(rules.selectedClass).test(node.attributes.class)
function* readQuestion(document, row) {
  const heading = yield* nodes(document, child(row, rules.heading), 2)
  const stem = heading.map(node => node.text.trim()).filter(Boolean).join(' ').slice(0, 2000)
  let type = 'unknown'
  for (const [name, pattern] of Object.entries(rules.types)) if (new RegExp(pattern).test(stem.slice(0, 150))) { type = name; break }
  if (rules.typeInput) {
    const field = yield* one(document, child(row, rules.typeInput))
    if (field) for (const [code, name] of Object.entries(rules.codes)) {
      const check = yield* call('document.compare', { document, selector: field.selector, text: code })
      if (check.matches) { type = name; break }
    }
  }
  const rawOptions = yield* nodes(document, child(row, rules.options), 16)
  const controls = yield* nodes(document, child(row, 'input, [aria-checked], .num_option, .before'), 40)
  const options = rawOptions.map((node, index) => {
    const own = controls.filter(control => control.selector.startsWith(node.selector + ' > '))
    const label = own.find(control => /^[A-H]$/.test(control.text.trim()))?.text.trim()
      || /^([A-H])(?:[\s.、．)）]|$)/.exec(node.text.trim())?.[1]
    return { key: label || String.fromCharCode(65 + index), text: node.text.trim().slice(0, 400),
      selected: selectState(node) || own.some(selectState), node }
  })
  const fields = yield* nodes(document, child(row, rules.fields), 16)
  const visual = (yield* nodes(document, child(row, rules.visual), 1)).length > 0
  const unsupported = new Set(options.map(option => option.key)).size !== options.length || !stem || visual || type === 'unknown' || /材料题|完形|完型|听力|简答|论述/.test(stem.slice(0, 100))
    || (type === 'completion' ? !fields.length : options.length < 2 || options.length > 16)
  const review = rules.review ? yield* nodes(document, child(row, rules.review), 1) : []
  const publicOptions = options.map(({ node, ...option }) => option)
  const id = JSON.stringify([document.frameId, document.loaderId, document.url, row.index,
    stableId([stem, type, publicOptions.map(({ key, text }) => ({ key, text })), fields.length])])
  return { id, number: row.index, stem, type, supported: !unsupported, visual, options: publicOptions,
    blanks: fields.map((field, index) => ({ index: index + 1, filled: field.hasValue })),
    reviewAnswer: review[0]?.text.trim().slice(0, 2000) || '', _options: options, _fields: fields, _document: document, _row: row }
}
const publicQuestion = ({ _options, _fields, _document, _row, ...question }) => question
export function* readQuestions(args) {
  const documentsNow = yield* documents()
  for (const document of documentsNow) {
    const found = yield* query(document, rules.rows, args.limit || 4, args.offset || 0)
    if (!found.nodes.length) continue
    const questions = []
    for (const row of found.nodes) {
      if (row.selector) questions.push(publicQuestion(yield* readQuestion(document, row)))
    }
    return result('questions', '仅返回本批题目。含图片、混淆字体或不支持题型时不自动填写；空格仅返回是否有作答。', {
      questions, total: found.total, next_offset: found.truncated ? (args.offset || 0) + found.nodes.length : -1,
    })
  }
  return result('not_found', '当前授权文档中没有识别到作业或章节测验。')
}
function* currentQuestion(id) {
  let parts
  try { parts = JSON.parse(id) } catch { return null }
  if (!Array.isArray(parts) || parts.length !== 5 || !Number.isSafeInteger(parts[3]) || parts[3] < 1 || parts[3] > 10000) return null
  const document = (yield* documents()).find(doc => doc.frameId === parts[0] && doc.loaderId === parts[1] && doc.url === parts[2])
  if (!document) return null
  const [row] = yield* nodes(document, rules.rows, 1, parts[3] - 1)
  if (!row?.selector) return null
  const question = yield* readQuestion(document, row)
  return question.id === id ? question : null
}
export function* answerQuestions(args) {
  const items = []
  for (const answer of args.answers) {
    const question = yield* currentQuestion(answer.question_id)
    const finish = status => items.push({ id: answer.question_id, title: question?.stem.slice(0, 200) || '', kind: 'question', status, url: '' })
    if (!question) { finish('stale'); continue }
    if (!question.supported) { finish('unsupported'); continue }
    const document = question._document
    if (question.type === 'completion') {
      if (answer.choices?.length || !answer.blanks?.length || answer.blanks.length !== question._fields.length || answer.blanks.some(text => !text.trim() || text.length > 4000)) { finish('invalid_answer'); continue }
      let conflict = false
      for (let i = 0; i < question._fields.length; i++) {
        const field = question._fields[i]
        if (field.hasValue && !(yield* call('document.compare', { document, selector: field.selector, text: answer.blanks[i] })).matches) conflict = true
      }
      if (conflict) { finish('existing_answer_conflict'); continue }
      for (let i = 0; i < question._fields.length; i++) {
        if (!question._fields[i].hasValue) yield* call('document.fill', { document, selector: question._fields[i].selector, text: answer.blanks[i] })
      }
      let verified = true
      for (let i = 0; i < question._fields.length; i++) {
        if (!(yield* call('document.compare', { document, selector: question._fields[i].selector, text: answer.blanks[i] })).matches) verified = false
      }
      finish(verified ? 'verified' : 'unconfirmed')
      continue
    }
    const choices = answer.choices || [], unique = [...new Set(choices)]
    if (answer.blanks?.length || !choices.length || choices.length !== unique.length || question.type !== 'multiple' && choices.length !== 1
      || choices.some(key => !question.options.some(option => option.key === key))) { finish('invalid_answer'); continue }
    if (question.options.some(option => option.selected && !choices.includes(option.key))) { finish('existing_answer_conflict'); continue }
    for (const option of question._options) if (choices.includes(option.key) && !option.selected) yield* click(document, option.node)
    const after = yield* currentQuestion(answer.question_id)
    finish(after && after.options.every(option => option.selected === choices.includes(option.key)) ? 'verified' : 'unconfirmed')
  }
  return result('answers_reviewed', '已逐题回读；verified 仅表示网页实填一致。未保存、交卷或提交整份作业。', { items })
}
