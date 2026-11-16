type Kind = 'video' | 'quiz' | 'document' | 'unknown'

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
export function run(chapter: Chapter) {
  if (chapter.remaining === 0) return { action: 'complete' }
  if (!chapter.loaded) return { action: 'loading' }
  if (chapter.targetTab !== null) return { action: 'tab', tab: chapter.targetTab }
  const index = chapter.jobs.findIndex(job => !job.done && (!chapter.videoOnly || job.kind === 'video'))
  if (index !== -1) return { action: chapter.jobs[index].kind, index }
  if (chapter.nextTab !== null) return { action: 'tab', tab: chapter.nextTab }
  return { action: 'pending' }
}
