type QuestionKind = 'single' | 'multiple' | 'judgement' | 'completion'
type Option = { label: string; text: string }
export type AnswerRequest = {
  operation: 'resolve_answers'
  questions: Array<{
    id: string
    type: QuestionKind
    options: Option[]
    blankCount: number
    matches: Array<{ id: number; answer: string }>
  }>
}

export const answerKey = (value: string) => value.normalize('NFKC').trim().replace(/\s+/gu, ' ')

const judgement = (value: string) => {
  const key = answerKey(value).toLowerCase()
  if (/^(?:正确|对|是|true|√|✓)$/u.test(key)) return true
  if (/^(?:错误|错|否|false|×|✗)$/u.test(key)) return false
  return undefined
}

const resolveChoice = (options: Option[], value: string, isJudgement: boolean) => {
  const polarity = isJudgement ? judgement(value) : undefined
  const matches = options.filter(option => polarity === undefined
    ? answerKey(option.text) === answerKey(value)
    : judgement(option.text) === polarity)
  return matches.length === 1 ? matches[0].label : null
}

export function resolveAnswers({ questions }: AnswerRequest) {
  return { decisions: questions.map(question => {
    const { id, options, type, blankCount, matches } = question
    if (!matches.length) return { id, status: 'no_match' }
    const resolutions = matches.map(match => {
      const parts = match.answer.split('###').map(part => part.trim())
      if (parts.some(part => !part)) return null
      if (type === 'completion') {
        return parts.length === blankCount ? { bankId: match.id, blanks: parts } : null
      }
      if (type !== 'multiple' && parts.length !== 1) return null
      const choices = parts.map(part => resolveChoice(options, part, type === 'judgement'))
      if (choices.some(choice => !choice) || new Set(choices).size !== choices.length) return null
      return { bankId: match.id, choices: choices.sort() }
    })
    const unique = new Set(resolutions.filter(item => item !== null).map(item => JSON.stringify(item.choices ?? item.blanks)))
    if (unique.size > 1) return { id, status: 'conflict' }
    if (resolutions.some(item => item === null)) return { id, status: 'unmatched' }
    return { id, status: 'ready', ...resolutions[0] }
  }) }
}
