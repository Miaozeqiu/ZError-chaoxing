import { observation as observeLogin } from './loginRules.js'
import { chapterRules } from './chapters.ts'
export const site = { id: 'chaoxing', name: '学习通', host: 'chaoxing.com' }
export const login = {
  observe: observeLogin,
  formHost: 'passport2.chaoxing.com', modern: true,
  entry: 'https://passport2.chaoxing.com/login?fid=&newversion=true&refer=https%3A%2F%2Fi.chaoxing.com',
  account: 'input#phone', password: 'input#pwd[type="password"]', submit: '#loginBtn:not(:disabled,[aria-disabled=true])',
}
export const catalog = {
  courses: { rows: '#courselistArea li, .courselistArea li, .course-list .course-item', heading: ':is(h3,h4,.course-name,.courseName)', entry: '#zne_kc_icon' },
  homework: { rows: '.bottomList li[data]', heading: ':is(.overHidden2,.titTxt,.workName,.work-title)', entry: 'a[title="作业"]', next: '.pageDiv .xl-nextPage:not(.xl-disabled)' },
  chapters: { rows: chapterRules.directory.row + ', ' + chapterRules.sidebar.target, heading: ':is(.catalog_name,.posCatalog_name)', entry: 'a[title="章节"]' },
}
export const questions = {
  rows: '.questionLi, .singleQuesId', heading: ':is(.mark_name,.Zy_TItle,h3)', typeInput: 'input[id^="answertype"]', codes: { 0: 'single', 1: 'multiple', 2: 'completion', 3: 'judgement' },
  types: { single: '单选|单项选择', multiple: '多选|多项选择', judgement: '判断', completion: '填空' },
  options: ':is(.answerBg,.Zy_ulTop > li)', fields: 'input[type="text"], textarea, [contenteditable="true"]',
  selectedClass: '(?:^|\\s)(?:check_answer|check_answer_dx|choice_answer|checked|selected|active|cur|is-checked)(?:\\s|$)',
  visual: 'img,svg,canvas,math,mjx-container,.MathJax', review: '.mark_answer',
}
export const chapter = {
  rows: chapterRules.sidebar.target + ', ' + chapterRules.directory.row,
  active: '.posCatalog_active', done: '.icon_Completed, .icon_yiwanc',
  remaining: '.catalog_task, .orangeNew, .catalog_points_yi',
  tabs: chapterRules.tabs, selectedTab: '(?:^|\\s)active(?:\\s|$)', disabledTab: '(?:^|\\s)disabled(?:\\s|$)',
  media: '.video-js video, .video-js audio, video, audio',
  question: questions.rows, discussion: '#subPageMain .topicDetail_detail',
}
export const discussion = {
  topic: '#subPageMain .topicDetail_detail .topicDetail_title, #subPageMain .topicDetail_detail .topicDetail_main > .richText',
  replies: '#subPageMain .topicDetail_replyWrap .topicDetail_replyList .topicDetail_replyItem .topicReply_right > .replyContent',
  input: '#subPageMain .topicDetail_editContainer .replyEdit .textareawrap > textarea',
  submit: '#subPageMain .topicDetail_editContainer .replyEditBtnGroup .addReply:not(.jb_btn_92_disable)',
}
export const viewer = {
  next: '#next, #nextPage, #nextpage, #nextpagebtn, #next-page, #reader .reader-next, .swiper-button-next:not(.swiper-button-disabled), #img .mkeRbtn, [aria-label="下一页"], [title="下一页"]',
  viewport: '#img.imglook, #viewerContainer, #reader, #ReadWeb',
  pageSelect: '#pageSelector, #pageSelect',
  marker: '#pageNumber, #pageNum, #currentPage, #pagejump, [aria-current="page"], .swiper-slide-active, #numPages, #img .documentImg',
}

export const paperRules = { title: '.mark_title, .work-title, .newZy_TItle, h1', totalLabels: '.totalQuestion, .total-question, .mark_sum', indexItems: '.answerCard li' }
export function paperForURL(value) {
  const match = /^https:\/\/([^/:?#]+)([^?#]*)(?:\?([^#]*))?/.exec(value)
  if (!match || !(match[1] === 'chaoxing.com' || match[1].endsWith('.chaoxing.com'))) return null
  const params = Object.fromEntries((match[3] || '').split('&').map(pair => { const [key, value = ''] = pair.split('='); return [key.toLowerCase(), decodeURIComponent(value)] }))
  const path = match[2].toLowerCase()
  if (!/\/(?:work|exam)\//.test(path) && !/\/(?:doWork|doHomework|viewWork|viewHomework|review|view)$/i.test(path)) return null
  const stage = /\/(?:view|viewwork|review)\/?$/.test(path) ? 'result' : 'do'
  return { key: [params.courseid, params.classid || params.clazzid, params.workid || params.workanswerid || params.knowledgeid, match[2]].join(':'),
    courseId: params.courseid || '', paperId: params.workid || params.workanswerid || '', kind: /dohomework/.test(path) ? 'quiz' : 'homework', stage, single: false, url: value }
}
Object.assign(questions, { choiceText: ':is(.answer_p,.after)', number: ':scope > i', subjectTypes: { single: 0, multiple: 1, judgement: 3, completion: 2 } })

export const answerService = null


export const automations = [{ event: 'page', tool: 'sync_page' }]
