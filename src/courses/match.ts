import type { Course } from './types'
import { matchTitles, normalizeTitle } from '../matchTitle'

export function matchCourses(courses: Course[], text: string, teacherName: string) {
  const teacher = normalizeTitle(teacherName)
  const eligible = teacher ? courses.filter(course => normalizeTitle(course.teacher ?? '').includes(teacher)) : courses
  return matchTitles(eligible, text)
}
