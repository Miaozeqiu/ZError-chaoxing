import { test } from 'node:test'
import assert from 'node:assert/strict'
import { framedHost, execute } from './runtime-test-host.mjs'
const url = 'https://i.chaoxing.com/base', listURL = 'https://mooc1-1.chaoxing.com/visit/courses'
const card = (id, name, teacher) => `<li><h3 title="${name}">${name}</h3><span class="teacher">${teacher}</span><a href="https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu?courseid=${id}&clazzid=7">进入学习</a></li>`
const list = cards => '<div class="tab-item current" coursetype="1">我学的课</div><ul id="courselistArea">' + cards + '</ul>'
const fixture = html => framedHost('<iframe id="courses"></iframe>', url, [{ id: 'courses', selector: '#courses', url: listURL, html }])
test('course names and teachers are read from the actual student iframe, and only the root navigates', async () => {
  const io = fixture(list(card(42, '数据库基础', '张老师') + card(43, '数据库基础', '李老师')))
  try {
    assert.equal((await execute('catalog', { kind: 'courses', title: '数据库基础' }, io)).status, 'ambiguous')
    assert(!io.events.some(event => event.op === 'document.navigate'))
    const opened = await execute('catalog', { kind: 'courses', title: '数据库基础', teacher: '张老师' }, io)
    assert.equal(opened.status, 'opened')
    assert.equal(io.events.filter(event => event.op === 'document.navigate').length, 1)
    assert.equal(io.events.find(event => event.op === 'document.navigate').args.document.frameId, 'root')
    assert(io.window.location.href.includes('courseid=42'))
  } finally { io.close() }
})
test('teacher courses are not used; a unique student tab is clicked before rereading', async () => {
  const io = fixture('<div class="tab-item current" coursetype="2">我教的课</div><button class="tab-item" coursetype="1">我学的课</button><ul id="courselistArea">' + card(99, '教师课程', '教研组') + '</ul>')
  io.child('courses').onClick = () => { io.child('courses').window.document.body.innerHTML = list(card(42, '学生课程', '张老师')) }
  try {
    const readOnly = await execute('catalog', { kind: 'courses', read_only: true }, io)
    assert.equal(readOnly.status, 'student_unconfirmed')
    assert(!io.events.some(event => event.op === 'document.click'))
    const result = await execute('catalog', { kind: 'courses' }, io)
    assert.deepEqual(result.items.map(item => item.title), ['学生课程'])
    assert.equal(io.events.filter(event => event.op === 'document.click').length, 1)
  } finally { io.close() }
})
test('a collapsed folder or unread rows cannot prove a course name unique', async () => {
  const io = fixture(list(card(42, '目标课程', '张老师')) + '<button class="folder">文件夹</button>')
  try { assert.equal((await execute('catalog', { kind: 'courses', title: '目标课程' }, io)).status, 'ambiguous'); assert(!io.events.some(event => event.op === 'document.navigate')) }
  finally { io.close() }
})
