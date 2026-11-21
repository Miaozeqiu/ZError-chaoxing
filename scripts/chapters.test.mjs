import { test } from 'node:test'
import assert from 'node:assert/strict'
import { framedHost, execute } from './runtime-test-host.mjs'
const chapterURL = id => `https://mooc1.chaoxing.com/mycourse/studentstudy?courseid=42&clazzid=7&chapterId=${id}`
const cardsURL = (id = 101, num = 0) => `https://mooc1.chaoxing.com/knowledge/cards?courseid=42&clazzid=7&knowledgeid=${id}&num=${num}`
const markup = (count = 1) => `<div id="coursetree"><div id="cur101" class="posCatalog_select posCatalog_active"><span class="posCatalog_name">合成章节</span><span class="posCatalog_sbar">1</span>${count === null ? '' : `<input class="jobUnfinishCount" type="hidden" value="${count}">`}</div></div><div id="prev_tab"><ul class="prev_ul"><li cardid="0" id="dct0" class="active">视频</li><li cardid="1" id="dct1">测验</li></ul></div><iframe id="iframe" info="card"></iframe>`
const jobs = '<div class="ans-attach-ct" id="job"><span class="ans-job-icon"></span><iframe id="player" mid="video1" src="/ananas/modules/video/index.html"></iframe></div>'
function fixture(options = {}) {
  return framedHost(markup(options.count === undefined ? 1 : options.count), chapterURL(101), [
    { id: 'cards', selector: '#iframe', url: options.cardsURL || cardsURL(), html: options.jobs ?? jobs },
    { id: 'player', parent: 'cards', selector: '#player', url: 'https://mooc1.chaoxing.com/ananas/modules/video/index.html', html: '<video></video>' },
    // Same source URL does not imply the same owner. This player must never start.
    { id: 'preload', selector: '#preload', url: 'https://mooc1.chaoxing.com/ananas/modules/video/index.html', html: '<video></video>' },
  ])
}
const credit = io => { io.child('cards').window.document.querySelector('.ans-job-icon').classList.add('ans-job-icon-finish'); io.window.document.querySelector('.jobUnfinishCount').value = '0' }
test('chapter study binds the owner iframe, mutes before playing and rechecks real task credit', async () => {
  const io = fixture(); io.window.document.body.insertAdjacentHTML('beforeend', '<iframe id="preload" hidden></iframe>')
  io.child('player').onMediaEnd = () => credit(io)
  try {
    const result = await execute('study', { current_only: true }, io)
    assert.equal(result.status, 'chapter_complete')
    const operations = io.events.filter(row => /^media\./.test(row.op))
    assert(operations.length > 0)
    assert(operations.every(row => row.args.document.frameId === 'player'))
    assert(operations.findIndex(row => row.op === 'media.mute') < operations.findIndex(row => row.op === 'media.play'))
    assert.equal(io.child('preload').state.paused, true)
  } finally { io.close() }
})
test('media ended alone does not prove platform credit or advance a tab', async () => {
  const io = fixture()
  try { const result = await execute('study', { current_only: true }, io); assert.equal(result.status, 'awaiting_credit'); assert.equal(result.complete, false); assert(!io.events.some(row => row.op === 'document.click')) }
  finally { io.close() }
})
test('stale course, chapter or tab frames never start a media element', async () => {
  for (const url of [cardsURL(102), cardsURL(101, 1), cardsURL().replace('courseid=42','courseid=99')]) {
    const io = fixture({ cardsURL: url })
    try { const result = await execute('study', {}, io); assert.equal(result.status, 'chapter_loading'); assert(!io.events.some(row => row.op === 'media.play')) }
    finally { io.close() }
  }
})
test('missing counters and empty task lists are never treated as completion', async () => {
  const io = fixture({ count: null, jobs: '' })
  try { const result = await execute('study', {}, io); assert.equal(result.complete, false); assert.equal(result.status, 'chapter_loading') }
  finally { io.close() }
})
test('completion continues to the next verified directory chapter in the same invocation', async () => {
  const directoryURL = 'https://mooc1.chaoxing.com/mycourse/studentcourse?courseid=42&clazzid=7'
  const row = (id, count) => `<div class="chapter_item" id="cur${id}"><div class="catalog_title" role="link"><span class="catalog_name">第${id}节</span><input class="knowledgeJobCount" type="hidden" value="${count}"></div></div>`
  const io = framedHost(markup(0) + '<iframe id="directory"></iframe>', chapterURL(101), [
    { id:'directory', selector:'#directory', url:directoryURL, html:row(101,0)+row(102,1) },
    { id:'cards', selector:'#iframe', url:cardsURL(102), html:jobs },
    { id:'player', parent:'cards', selector:'#player', url:'https://mooc1.chaoxing.com/ananas/modules/video/index.html', html:'<video></video>' },
  ])
  io.child('directory').onClick = () => { io.navigate(chapterURL(102), markup(1).replaceAll('cur101','cur102') + '<iframe id="directory"></iframe>') }
  io.child('player').onMediaEnd = () => { credit(io); io.child('directory').window.document.querySelector('#cur102 .knowledgeJobCount').value='0' }
  try { const result = await execute('study', {}, io); assert.equal(result.status,'course_complete'); assert.equal(result.complete,true); assert(io.events.some(row => row.op === 'media.play' && row.args.document.frameId === 'player')) }
  finally { io.close() }
})

test('read-only chapter inspection never reveals, plays or moves a tab', async () => {
  const io = fixture()
  try { const read = await execute('study',{read_only:true},io); assert.equal(read.chapter.key,'42:7:101'); assert(!io.events.some(row => /^(media\.(play|mute|wait)|document\.(click|reveal))$/.test(row.op))) }
  finally { io.close() }
})
test('resume refuses a different course and current-only requests cannot escape their confirmed range', async () => {
  const io = fixture()
  try {
    assert.equal((await execute('study',{},io,{state:{course:'99:7',chapter:'99:7:101'}})).status,'workflow_mismatch')
    assert.equal((await execute('study',{current_only:true,chapter_range:{start:2,end:3}},io)).status,'range_unconfirmed')
    assert(!io.events.some(row => /^(media\.play|document\.(navigate|click|reveal))$/.test(row.op)))
  } finally { io.close() }
})
test('start_course resumes the verified current course without replaying login or course navigation', async () => {
  const io = fixture(); io.child('player').onMediaEnd = () => credit(io)
  try {
    const result = await execute('start_course',{course_name:'合成课程',current_only:true},io,{state:{phase:'media',course:'42:7',chapter:'42:7:101',job:'video1'}})
    assert.equal(result.status,'chapter_complete')
    assert(!io.events.some(row => /^(credentials\.|document\.navigate)/.test(row.op)))
  } finally { io.close() }
})
test('passive page automation publishes source-owned task state and never starts a video', async () => {
  const io = fixture()
  try {
    const result=await execute('sync_page',{},io)
    assert.equal(result.retryAfterMs,5000)
    assert.equal(io.context.thisSection.title,'合成章节')
    assert.deepEqual(io.context.leftJobs,['video'])
    assert(!io.events.some(row => /^(media\.(play|mute|wait)|document\.(click|reveal|navigate))$/.test(row.op)))
  } finally { io.close() }
})
test('chapter question reading only accepts the current quiz owner, never a preloaded paper', async () => {
  const paper='<div class="questionLi"><h3 class="mark_name">单选题 合成测验</h3><input type="hidden" id="answertype1" value="0"><button class="answerBg">A 甲</button><button class="answerBg">B 乙</button></div>'
  const io=framedHost(markup()+'<iframe id="unrelated"></iframe>',chapterURL(101),[
    {id:'cards',selector:'#iframe',url:cardsURL(),html:'<div class="ans-attach-ct"><span class="ans-job-icon"></span><iframe id="quiz" mid="quiz1" src="/ananas/modules/work/index.html"></iframe></div>'},
    {id:'quiz',parent:'cards',selector:'#quiz',url:'https://mooc1.chaoxing.com/mooc-ans/work/doHomeWork?courseid=42&clazzid=7&knowledgeid=101',html:paper},
    {id:'unrelated',selector:'#unrelated',url:'https://mooc1.chaoxing.com/mooc-ans/work/doHomeWork?courseid=99&clazzid=8&knowledgeid=102',html:paper.replace('合成测验','过期题目')},
  ])
  try {
    const read=await execute('read_questions',{},io)
    assert.equal(read.questions.length,1)
    assert(read.questions[0].stem.includes('合成测验'))
    assert(!JSON.stringify(read).includes('过期题目'))
    io.child('cards').navigate(cardsURL(102))
    const stale=await execute('answer_questions',{answers:[{question_id:read.questions[0].id,choices:['A']}]},io)
    assert.equal(stale.items[0].status,'stale')
    assert(!io.events.some(row => row.op==='document.click'))
  } finally { io.close() }
})

test('PDF workflow follows the owned nested reader and recognizes actual page advancement', async () => {
  const io=framedHost(markup(),chapterURL(101),[
    {id:'cards',selector:'#iframe',url:cardsURL(),html:'<div class="ans-attach-ct"><span class="ans-job-icon"></span><iframe id="doc" mid="doc1" src="/ananas/modules/pdf/index.html"></iframe></div>'},
    {id:'doc',parent:'cards',selector:'#doc',url:'https://mooc1.chaoxing.com/ananas/modules/pdf/index.html',html:'<iframe id="reader"></iframe>'},
    {id:'reader',parent:'doc',selector:'#reader',url:'https://mooc1.chaoxing.com/reader/document',html:'<span id="pageNumber">1</span><button id="next">下一页</button>'},
  ])
  let clicks=0
  io.child('reader').onClick=()=>{ clicks++; io.child('reader').window.document.querySelector('#pageNumber').textContent=String(clicks+1); if(clicks===3)credit(io) }
  try {
    assert.equal((await execute('read_document',{read_only:true},io)).status,'document')
    assert.equal(clicks,0)
    const result=await execute('study',{current_only:true},io)
    assert.equal(result.status,'chapter_complete')
    assert.equal(clicks,3)
    assert(io.events.filter(row=>row.op==='document.click').every(row=>row.args.document.frameId==='reader'))
  } finally { io.close() }
})

test('a paused player is resumed at most once and a quiz blocks recovery immediately', async () => {
  for(const blocked of [false,true]){
    const io=fixture(), player=io.child('player'), executeHost=player.execute.bind(player)
    if(blocked)player.window.document.body.insertAdjacentHTML('beforeend','<div class="questionLi">合成弹题</div>')
    player.execute=async(op,args)=>op==='media.wait'?{ok:true,ended:false,paused:true,event:'timeout',current:1,duration:5}:executeHost(op,args)
    try {
      const result=await execute('study',{current_only:true},io)
      assert.equal(result.status,blocked?'needs_review':'paused')
      assert.equal(io.events.filter(row=>row.op==='media.play').length,blocked?1:2)
    } finally { io.close() }
  }
})

test('large catalogs checkpoint the selected course before yielding at the command budget', async () => {
  const courses=Array.from({length:80},(_,index)=>`<li><h3>合成课程${index}</h3><span class="teacher">合成教师</span><a href="https://mooc1.chaoxing.com/mycourse/stu?courseid=${index+42}&clazzid=7">进入</a></li>`).join('')
  const directory=Array.from({length:160},(_,index)=>`<div class="chapter_item" id="cur${index+101}"><div class="catalog_title" role="link"><span class="catalog_name">合成章节${index}</span><input class="knowledgeJobCount" type="hidden" value="1"></div></div>`).join('')
  const io=framedHost('<a id="zne_kc_icon">课程</a><iframe id="courses"></iframe>','https://i.chaoxing.com/',[
    {id:'courses',selector:'#courses',url:'https://mooc1-1.chaoxing.com/visit/courses',html:'<div class="tab-item current" coursetype="1">我学的课</div><ul id="courselistArea">'+courses+'</ul>'},
    {id:'directory',selector:'#directory',url:'https://mooc1.chaoxing.com/mycourse/studentcourse?courseid=42&clazzid=7',html:directory},
  ])
  const navigate=io.navigate
  io.navigate=(url)=>navigate(url,'<iframe id="directory"></iframe>')
  try {
    const result=await execute('start_course',{course_name:'合成课程0'},io)
    assert.equal(result.status,'pending')
    assert.equal(result.workflowPending,true)
    assert.deepEqual(io.checkpoint,{phase:'course_opened',course:'42:7'})
    assert.equal(io.events.filter(row=>row.op==='document.navigate').length,1)
    assert(io.events.length<512)
  } finally { io.close() }
})
