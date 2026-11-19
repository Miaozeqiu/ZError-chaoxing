import { chapterRules, jobKinds } from './rules'

type Kind = 'video' | 'quiz' | 'document' | 'discussion' | 'unknown'

type Chapter = {
  remaining: number | null
  loaded: boolean
  videoOnly: boolean
  targetTab: number | null
  nextTab: number | null
  jobs: { kind: Kind; done: boolean }[]
}

// The host supplies a verified view of the active cards frame. An empty card
// or a video ending is insufficient to report the whole chapter as complete.
type Probe = { operation: 'page_rules' } | { operation: 'classify_jobs'; sources: string[] }

export function run(chapter: Chapter | Probe) {
  if ('operation' in chapter) {
    if (chapter.operation === 'page_rules') return chapterRules
    const kinds = jobKinds.map(([kind, path]) => [kind, new RegExp(path, 'i')] as const)
    return chapter.sources.map(source => kinds.find(([, regex]) => regex.test(source))?.[0] ?? 'unknown')
  }
  if (chapter.remaining === 0) return { action: 'complete' }
  if (!chapter.loaded) return { action: 'loading' }
  if (chapter.targetTab !== null) return { action: 'tab', tab: chapter.targetTab }
  const index = chapter.jobs.findIndex(job => !job.done && (!chapter.videoOnly || job.kind === 'video'))
  if (index !== -1) return { action: chapter.jobs[index].kind, index }
  if (chapter.nextTab !== null) return { action: 'tab', tab: chapter.nextTab }
  return { action: 'pending' }
}

export function* workflow({ currentOnly, allowQuiz }: { currentOnly: boolean; allowQuiz: boolean }): Generator<Record<string, unknown>, Record<string, unknown>, Record<string, unknown>> {
  let readinessChecks = 0
  const transitions = new Set<string>()
  while (true) {
    const result = yield { op: 'process' }
    if (result.ok === true && result.status === 'complete' && !currentOnly) {
      const next = yield { op: 'next' }
      if (!next.opened) return { done: true }
      readinessChecks = 0
      continue
    }
    if (result.ok === true && result.status === 'needs_quiz' && allowQuiz) {
      yield { op: 'quiz' }
      return { done: true }
    }
    if (result.ok === true && ['tab_changed', 'job_completed', 'discussion_completed'].includes(String(result.status))) {
      const transition = JSON.stringify([result.chapterKey, result.status, result.tab, result.job, result.remaining])
      if (transitions.has(transition)) return { error: '章节任务点没有继续推进，请核对当前页面。' }
      transitions.add(transition)
      readinessChecks = 0
      continue
    }
    if (result.status !== 'loading' && result.retryable !== true) return { done: true }
    if (++readinessChecks >= 12) return { done: true }
    yield { op: 'wait' }
  }
}
