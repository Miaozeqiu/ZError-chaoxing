export const pageRules = {
  rows: '.questionLi', quizRows: ':is(.questionLi, .singleQuesId)',
  keys: ['id', 'data-questionid', 'data-question-id', 'questionid', 'data'],
  typeInputs: 'input[id^="answertype"]',
  heading: '.mark_name, :scope > h3', quizHeading: '.mark_name, :scope > h3, .Zy_TItle',
  quizTitleKind: '.Zy_TItle', quizTitle: '.newZy_TItle', quizTitleNumber: ':scope > i',
  quizOptions: '.Zy_ulTop > li', quizChoiceText: '.after',
  options: '.answerBg .answer_p', optionRow: '.answerBg', optionMark: '.num_option', optionText: '.answer_p',
  nested: '.reading_answer, .filling_answer, .line_answer, iframe',
  extraStem: '.line_wid_half, .splitS-left .mark_name ~ .mark_name',
  visual: 'img,svg,canvas,math,mjx-container,.MathJax,.font-cxsecret,[class*="cxsecret"]',
  unreadableFont: 'cxsecret',
  title: '.mark_title, .work-title, h1',
  labels: { single: ['单选', '单选题', '单项选择', '单项选择题'], multiple: ['多选', '多选题', '多项选择', '多项选择题'],
    judgement: ['判断', '判断题'], completion: ['填空', '填空题'] },
  codes: { 0: 'single', 1: 'multiple', 2: 'completion', 3: 'judgement' },
} as const

export const homeworkListRules = {
  list: '.bottomList', item: 'li[data]',
  title: '.right-content .overHidden2, .titTxt, .workName, .work-title', status: '.status',
  page: '.pageDiv .xl-active', previous: '.pageDiv .xl-prevPage', next: '.pageDiv .xl-nextPage',
  previousButton: '.pageDiv .xl-prevPage:not(.xl-disabled)', nextButton: '.pageDiv .xl-nextPage:not(.xl-disabled)',
  disabled: '.xl-disabled, [aria-disabled="true"], :disabled', tabName: '作业',
} as const
