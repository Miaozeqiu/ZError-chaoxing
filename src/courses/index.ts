import { matchCourses } from './match'
import type { CourseRequest, CourseResult } from './types'

export function run({ operation, query = '', teacher = '', courses }: CourseRequest): CourseResult {
  const matched = matchCourses(courses, query, teacher)
  return {
    ids: matched.map(course => course.id),
    ...(operation === 'open' && query.trim() && matched.length === 1 ? { selected: matched[0].id } : {}),
  }
}
