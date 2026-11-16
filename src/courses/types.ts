export type Course = { id: number; title: string; teacher?: string }

export type CourseRequest = {
  operation: 'list' | 'open'
  query?: string
  teacher?: string
  courses: Course[]
}

export type CourseResult = { ids: number[]; selected?: number }
