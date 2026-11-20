import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, access } from 'node:fs/promises'
import { artifact, host, execute } from './runtime-test-host.mjs'
import { login, catalog, questions, chapter } from '../src/runtime/rules.js'
const website = JSON.parse(await readFile(new URL('../skills/chaoxing/website.json', import.meta.url)))
const cx = website.id === 'chaoxing'
const space = cx ? 'https://i.chaoxing.com/' : 'https://www.zjooc.cn/'
const loggedHtml = cx ? '<button id="zne_kc_icon">课程</button>' : '<div class="front-header-top"><div class="ta-r"><a>退出</a></div></div>'
const loginUrl = cx ? login.entry : 'https://background.zjooc.cn/gxptLogin'
const loginHtml = cx ? '<input id="phone" type="text"><input id="pwd" type="password"><button id="loginBtn">登录</button><input type="hidden" id="needVcode" value="0">'
  : '<div class="login_box"><input id="login_name" type="text"><input id="password" type="password"><div class="forms code"><input name="captchaCode"><img alt="点击刷新" src="/captcha"></div><button class="dologin">登录</button></div><div id="error_msg"></div>'
const paperUrl = cx ? 'https://mooc1.chaoxing.com/mooc-ans/work/doWork' : 'https://www.zjooc.cn/course/study/sample/homework/do/paper'
function questionHtml(count = 1, completion = false) {
  return (cx ? '<div>' : '<div class="common_look_main">') + Array.from({ length: count }, (_, i) => cx
    ? `<div class="questionLi"><h3 class="mark_name">${i + 1}.（${completion ? '填空' : '单选'}题）合成测试题目 ${i + 1}</h3><input type="hidden" id="answertype${i}" value="${completion ? 2 : 0}">${completion ? '<input type="text"><textarea></textarea>' : '<button class="answerBg"><span class="num_option">A</span><span class="answer_p">选项一</span></button><button class="answerBg"><span class="num_option">B</span><span class="answer_p">选项二</span></button>'}</div>`
    : `<div class="questiono-item"><div class="questiono-header">${i + 1}.（${completion ? '填空' : '单选'}题）合成测试题目 ${i + 1}</div>${completion ? '<div class="blanks_box"><input><textarea></textarea></div>' : '<button class="common_test_option"><input type="radio">选项一</button><button class="common_test_option"><input type="radio">选项二</button>'}</div>`).join('') + '</div>'
}
function paper(count = 1, completion = false) {
  const io = host(questionHtml(count, completion), paperUrl)
  io.onClick = node => {
    if (!node.matches('.answerBg,.common_test_option')) return
    for (const other of node.parentElement.querySelectorAll('.answerBg,.common_test_option')) {
      other.classList.remove('checked'); const input = other.querySelector('input'); if (input) input.checked = false
    }
    node.classList.add('checked'); const input = node.querySelector('input'); if (input) input.checked = true
  }
  return io
}
test('one verified compiled runtime, no legacy artifact or host-side business operation', async () => {
  assert.equal(artifact.apiVersion, 2)
  assert.equal(createHash('sha256').update(artifact.bundle.code).digest('hex'), artifact.bundle.sha256)
  assert(Buffer.byteLength(artifact.bundle.code) < 256 * 1024)
  assert(!/ZErrorSiteScript|op:["'](?:process|lookup|fill_credentials|catalog)["']/.test(artifact.bundle.code))
  await assert.rejects(access(new URL('../dist/script-manifest.json', import.meta.url)))
  await assert.rejects(access(new URL('../site-tools/tools.json', import.meta.url)))
})
test('already logged in returns immediately without requesting credentials', async () => {
  const io = host(loggedHtml, space)
  try {
    assert.equal((await execute('login', {}, io)).loggedIn, true)
    assert(!io.events.some(event => event.op.startsWith('credentials.')))
  } finally { io.close() }
})
test('secure login fills through opaque grants and confirms the resulting page', async () => {
  const io = host(loginHtml, loginUrl)
  io.onClick = node => { if (node.matches(login.submit)) io.navigate(space, loggedHtml) }
  try {
    let result = await execute('login', {}, io)
    if (!cx) {
      assert.equal(result.status, 'captcha'); assert(result.captchaImage.startsWith('data:image/'))
      result = await execute('login', { captcha_id: result.captcha_id, captcha_code: 'ABCDE' }, io)
    }
    assert.equal(result.loggedIn, true)
    assert.equal(io.events.filter(event => event.op === 'credentials.request').length, 1)
    assert(!JSON.stringify(io.receipts).includes('fixture-private-password'))
    assert(!JSON.stringify(io.events).includes('fixture-private-password'))
  } finally { io.close() }
})
test('captcha is bound to the document and pixels; missing pairs never submit', { skip: cx }, async () => {
  const io = host(loginHtml, loginUrl)
  try {
    const first = await execute('login', {}, io)
    io.imageHash = 'b'.repeat(64)
    assert.equal((await execute('login', { captcha_id: first.captcha_id, captcha_code: 'ABCDE' }, io)).status, 'stale')
    assert.equal((await execute('login', { captcha_code: 'ABCDE' }, io)).status, 'invalid_captcha')
    io.imageHash = 'a'.repeat(64); io.reload()
    assert.equal((await execute('login', { captcha_id: first.captcha_id, captcha_code: 'ABCDE' }, io)).status, 'stale')
    assert(!io.events.some(event => event.op === 'document.click'))
  } finally { io.close() }
})
test('a rejected password opens the replacement form once and does not loop submissions', { skip: cx }, async () => {
  const io = host(loginHtml, loginUrl)
  io.onClick = node => { if (node.matches(login.submit)) io.window.document.querySelector('#error_msg').textContent = '用户名或密码错误' }
  try {
    const first = await execute('login', {}, io)
    const second = await execute('login', { captcha_id: first.captcha_id, captcha_code: 'ABCDE' }, io)
    assert.equal(second.status, 'captcha')
    assert.equal(io.events.filter(event => event.op === 'document.click').length, 1)
    assert.equal(io.events.filter(event => event.op === 'credentials.request' && event.args.replaceRejected).length, 1)
  } finally { io.close() }
})
test('reads a bounded question batch and fills only the unchanged question, preserving conflicts', async () => {
  const io = paper(10)
  try {
    const batch = await execute('read_questions', { limit: 2 }, io)
    assert.equal(batch.questions.length, 2); assert.equal(batch.total, 10); assert.equal(batch.next_offset, 2)
    assert.equal(batch.questions[0].options.length, 2)
    const id = batch.questions[0].id
    assert.equal((await execute('answer_questions', { answers: [{ question_id: id, choices: ['A'] }] }, io)).items[0].status, 'verified')
    const clicks = io.events.filter(event => event.op === 'document.click').length
    assert.equal((await execute('answer_questions', { answers: [{ question_id: id, choices: ['B'] }] }, io)).items[0].status, 'existing_answer_conflict')
    assert.equal(io.events.filter(event => event.op === 'document.click').length, clicks)
    io.window.document.querySelector(cx ? 'h3' : '.questiono-header').textContent = '单选题 changed'
    assert.equal((await execute('answer_questions', { answers: [{ question_id: id, choices: ['A'] }] }, io)).items[0].status, 'stale')
  } finally { io.close() }
})
test('completion answers are preflighted as a batch and verified without leaking values', async () => {
  const io = paper(1, true)
  try {
    const initial = await execute('read_questions', {}, io), id = initial.questions[0].id
    assert.equal(initial.questions[0].supported, true)
    assert.equal((await execute('answer_questions', { answers: [{ question_id: id, blanks: ['合成值一', '合成值二'] }] }, io)).items[0].status, 'verified')
    assert((await execute('read_questions', {}, io)).questions[0].blanks.every(blank => blank.filled))
    assert(!JSON.stringify(io.receipts.filter(value => value.nodes)).includes('合成值一'))
    assert.equal((await execute('answer_questions', { answers: [{ question_id: id, blanks: ['不同值', '另一值'] }] }, io)).items[0].status, 'existing_answer_conflict')
  } finally { io.close() }
})
function videoHost() {
  const html = cx ? '<div id="coursetree"><div id="cur1" class="posCatalog_select posCatalog_active"><span class="posCatalog_name">合成小节</span></div></div><div class="video-js"><video></video></div>'
    : '<div class="el-tabs__header"><button role="tab" aria-selected="true" class="is-active">合成视频<span class="icon-shipin"></span></button></div><div class="contain-video"><video></video></div>'
  return host(html, cx ? 'https://mooc1.chaoxing.com/mycourse/studentstudy' : 'https://www.zjooc.cn/course/study/sample/plan/detail/video')
}
test('mutes before play and a media ended event alone does not prove chapter completion', async () => {
  const io = videoHost()
  try {
    const result = await execute('study', { current_only: true, video_only: true }, io)
    assert.equal(result.complete, false); assert.equal(result.status, 'awaiting_credit')
    assert(io.events.findIndex(event => event.op === 'media.mute') < io.events.findIndex(event => event.op === 'media.play'))
    assert(io.events.some(event => event.op === 'media.wait'))
  } finally { io.close() }
})
test('observes the actual completion marker after media events', async () => {
  const io = videoHost()
  io.onMediaEnd = () => {
    if (cx) io.window.document.querySelector('.posCatalog_active').insertAdjacentHTML('beforeend', '<i class="icon_Completed"></i>')
    else io.window.document.querySelector('.icon-shipin').classList.add('complete')
  }
  try { assert.equal((await execute('study', { current_only: true }, io)).status, 'chapter_complete') }
  finally { io.close() }
})
test('read-only chapter inspection never starts media or moves a tab', async () => {
  const io = videoHost()
  try {
    await execute('study', { read_only: true }, io)
    assert(!io.events.some(event => /^media\.(play|mute|wait)$|document\.(click|fill|scroll|select)/.test(event.op)))
  } finally { io.close() }
})
test('ambiguous catalog titles do not click and opening uses a freshly observed id', async () => {
  const rows = cx ? '<ul id="courselistArea"><li><h3>合成课程</h3></li><li><h3>合成课程</h3></li></ul>'
    : '<div class="el-tree-node is-leaf"><div class="el-tree-node__content"><span class="el-tree-node__label">合成课程</span></div></div>'.repeat(2)
  const kind = cx ? 'courses' : 'chapters', io = host(rows, space)
  try {
    const listed = await execute('catalog', { kind, title: '合成课程' }, io)
    assert.equal(listed.status, 'ambiguous'); assert.equal(listed.items.length, 2)
    assert(!io.events.some(event => event.op === 'document.click'))
    assert.equal((await execute('catalog', { kind, open_id: listed.items[1].id }, io)).status, 'opened')
  } finally { io.close() }
})
test('read-only inspection of a completed chapter also cannot navigate', async () => {
  const io = videoHost()
  if (cx) io.window.document.querySelector('.posCatalog_active').insertAdjacentHTML('beforeend', '<i class="icon_Completed"></i>')
  else io.window.document.querySelector('.icon-shipin').classList.add('complete')
  try {
    assert.equal((await execute('study', { read_only: true }, io)).complete, true)
    assert(!io.events.some(event => event.op === 'document.click'))
  } finally { io.close() }
})
test('one completed video tab cannot complete another unfinished tab', { skip: cx }, async () => {
  const io = videoHost()
  io.window.document.querySelector('.icon-shipin').classList.add('complete')
  io.window.document.querySelector('.el-tabs__header').insertAdjacentHTML('beforeend', '<button role="tab" aria-selected="false"><span class="icon-shipin"></span>未完成页签</button>')
  try { assert.equal((await execute('study', { read_only: true }, io)).complete, false) }
  finally { io.close() }
})
test('discussion publishing is targeted, preserves drafts, and never replays an uncertain post', { skip: !cx }, async () => {
  const html = '<div id="subPageMain"><div class="topicDetail_detail"><h3 class="topicDetail_title">合成讨论</h3><div class="topicDetail_main"><div class="richText">如何设计可靠的软件？</div></div></div><div class="topicDetail_replyWrap"><div class="topicDetail_replyList"><div class="topicDetail_replyItem"><div class="topicReply_right"><div class="replyContent">合成匿名样本</div></div></div></div></div><div class="topicDetail_editContainer"><div class="replyEdit"><div class="textareawrap"><textarea></textarea></div></div><div class="replyEditBtnGroup"><button class="addReply">发送</button></div></div></div>'
  const io = host(html, 'https://mooc1.chaoxing.com/bbs/topicDetail')
  try {
    const first = await execute('discussion', {}, io), args = { discussion_id: first.discussion_id, reply: '合成测试回复' }
    assert.equal(first.replies.length, 1)
    io.window.document.querySelector('textarea').value = '用户已有草稿'
    assert.equal((await execute('discussion', args, io)).status, 'draft_conflict')
    io.window.document.querySelector('textarea').value = ''
    assert.equal((await execute('discussion', args, io)).workflowPending, true)
    const clicks = io.events.filter(event => event.op === 'document.click').length
    assert.equal((await execute('discussion', args, io, { state: io.checkpoint })).status, 'reply_unconfirmed')
    assert.equal(io.events.filter(event => event.op === 'document.click').length, clicks)
  } finally { io.close() }
})
test('continues from a completed section to the next freshly observed leaf', async () => {
  const io = videoHost()
  const doc = io.window.document
  if (cx) {
    doc.querySelector('.posCatalog_active').insertAdjacentHTML('beforeend', '<i class="icon_Completed"></i>')
    doc.querySelector('#coursetree').insertAdjacentHTML('beforeend', '<div id="cur2" class="posCatalog_select"><span>合成下一节</span></div>')
  } else {
    doc.querySelector('.icon-shipin').classList.add('complete')
    doc.body.insertAdjacentHTML('beforeend', '<div class="el-tree-node is-leaf is-current"><div class="el-tree-node__content"><span class="complete">第一节</span></div></div><div class="el-tree-node is-leaf"><div class="el-tree-node__content">第二节</div></div>')
  }
  io.onClick = () => {
    if (cx) { doc.querySelector('.posCatalog_active').classList.remove('posCatalog_active'); doc.querySelector('#cur2').classList.add('posCatalog_active') }
    else { doc.querySelector('.is-current').classList.remove('is-current'); doc.querySelectorAll('.el-tree-node')[1].classList.add('is-current'); doc.querySelector('.icon-shipin').classList.remove('complete') }
    io.state.ended = true
  }
  try {
    await execute('study', { video_only: true }, io)
    assert.equal(io.events.filter(event => event.op === 'document.click').length, 1)
  } finally { io.close() }
})

test('hidden question rows are not read into the model batch', async () => {
  const io = paper(2)
  io.window.document.querySelector(cx ? '.questionLi' : '.questiono-item').hidden = true
  try {
    const result = await execute('read_questions', {}, io)
    assert.equal(result.questions.length, 1)
    assert.equal(result.questions[0].number, 2)
  } finally { io.close() }
})
test('a truncated tab list cannot prove the whole section complete', { skip: cx }, async () => {
  const io = videoHost(), doc = io.window.document
  doc.querySelector('.icon-shipin').classList.add('complete')
  doc.querySelector('.el-tabs__header').insertAdjacentHTML('beforeend', '<button role="tab"><span class="complete"></span></button>'.repeat(40))
  try { assert.equal((await execute('study', { read_only: true }, io)).complete, false) }
  finally { io.close() }
})
