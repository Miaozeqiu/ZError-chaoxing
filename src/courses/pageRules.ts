export const courseListRules = {
  active: '.tab-item.current, .tab-item.active, .tab-item.selected',
  type: '#courseType', studentTab: '.tab-item[coursetype="1"]', menuName: '课程',
  list: '#courselistArea, .courselistArea, .course-list',
  item: 'a[href], [data-href], [data-url], [onclick]',
  card: 'li, .course, .course-item, .courseItem, .course-card, .courseCard',
  heading: '[class*="course-name"], [class*="courseName"], .course-title, .courseTitle, h3, h4',
  teacher: '.teacher, .teacher-name, .teacherName, [class*="courseTeacher"], .course-info > p.line2:last-child',
  more: '.folder, .course-folder, [folderid], [data-folder-id], .pagination .next, .load-more',
  disabled: ':disabled, .disabled, [aria-disabled="true"]',
  studentNames: ['我学的课', '已学的课'],
  actionNames: ['进入学习', '进入课程', '课程封面', '学习'],
} as const
