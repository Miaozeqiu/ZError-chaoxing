import { courseListRules } from './pageRules'
import { matchCourses } from './match'
import type { CourseRequest, CourseResult } from './types'

export function run(input: CourseRequest | { operation: 'list_rules' }): CourseResult | typeof courseListRules {
  if (input.operation === 'list_rules') return courseListRules
  const { operation, query = '', teacher = '', courses } = input

  const matched = matchCourses(courses, query, teacher)
  return {
    ids: matched.map(course => course.id),
    ...(operation === 'open' && query.trim() && matched.length === 1 ? { selected: matched[0].id } : {}),
  }
}
