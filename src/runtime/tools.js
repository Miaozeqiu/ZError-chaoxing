const text = { type: 'string' }, flag = { type: 'boolean' }
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum })
const array = (items, maxItems) => ({ type: 'array', items, maxItems })
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false })
const item = object({ teacher: text, source: text, id: text, title: text, kind: text, status: text, url: text }, ['id', 'title', 'kind', 'status', 'url'])
const actual = object({ choices: array(text, 16), blanks: array(text, 16) })
const question = object({ actual, order: integer(1, 10000), subject_type: integer(0, 20), id: text, number: integer(1, 10000), stem: text, type: text, supported: flag, visual: flag,
  options: array(object({ key: text, text, selected: flag }, ['key', 'text', 'selected']), 16),
  blanks: array(object({ index: integer(1, 16), filled: flag }, ['index', 'filled']), 16), reviewAnswer: text,
}, ['id', 'number', 'stem', 'type', 'supported', 'visual', 'options', 'blanks', 'reviewAnswer'])
const chapter = object({ key: text, course_key: text, title: text, number: text, tab: integer(1,40), total_tabs: integer(0,40), remaining: integer(-1,10000), complete: flag, loaded: flag, jobs: array(item,40) })
const result = object({ chapter, status: text, message: text, loggedIn: flag, captchaImage: text, captcha_id: text,
  items: array(item, 40), questions: array(question, 8), total: integer(0, 1000000), next_offset: integer(-1, 10000),
  assignment_id: text, title: text, retryAfterMs: integer(0, 30000), complete: flag, workflowPending: flag, topic: text, discussion_id: text, replies: array(text, 6),
}, ['status', 'message'])
const read = ['document.list', 'document.frames', 'document.query', 'document.value', 'document.glyphs', 'resource.read', 'browser.wait'], wait = ['browser.wait'], click = ['document.click']
const tool = (name, description, properties, required, commands) => ({ name, description, parameters: object(properties, required), result, commands: [...new Set(commands)] })
const range = object({ start: integer(1,10000), end: integer(1,10000) }, ['start','end'])
const service = ['service.session','service.check','service.request','service.read','state.read','state.write','payload.from_state']
export const tools = [
  tool('sync_page', '后台只读同步当前章节计数、真实任务点和少量题目到软件；不登录、不调用模型、不填写网页。', { offset: integer(0,10000) }, [], [...read,'document.compare','questions.publish','context.publish']),
  tool('chapter_state', '只读当前学生章节、选中页签和真实任务点，iframe 绑定到其所属元素；缺失计数、空列表或其他课程的框架不能视为完成。', {}, [], [...read, 'document.compare']),
  tool('decode_font', '只读识别当前学习通混淆字体，用仓库内参考字形与置信度规则解码，不更改网页。通常读题工具会自动处理；低置信度返回 needs_review，不能猜测作答。', { offset: integer(0,10000) }, [], [...read]),
  tool('auto_answer', '自动处理当前作业或章节测验的小批题目：页面已公布解析、本地题库、模型依次获取答案，校验题目身份后填写并回读。不覆盖冲突答案，不保存或交卷。继续时保持 assignment_id 并传 next_offset。',
    { question_range: range, offset: integer(0,10000), limit: integer(1,4), assignment_id: text, use_model: flag }, [], [...read, ...click, ...service, 'document.fill','document.compare','knowledge.search','model.generate','questions.publish']),
  tool('sync_review', '自动采集已打开解析页中的官方答案并同步题库。只有全部题目、题数、课程和试卷身份一致才上传完整副本。后台不弹登录、不调用模型；服务器已有副本时不重复上传。',
    {}, [], [...read, ...service, 'document.compare']),
  tool('login', '登录当前站点。凭据由宿主在聊天表单中收集并安全填写，模型不可读取。返回 captcha 时识别附图，以相同 captcha_id 和 captcha_code 再调用；验证码或密码错误按实际网页分别处理。只有 loggedIn=true 表示已确认登录。',
    { captcha_id: text, captcha_code: text, replace_credentials: flag }, [], [...read, ...wait, ...click, 'document.navigate', 'document.image', 'document.fill', 'credentials.request', 'credentials.fill']),
  tool('catalog', '读取当前学生页面的课程、作业或章节列表。按 title 唯一匹配或 open_id 打开刚读取的条目；重复名称返回候选。offset 分批读取，next_page 只点击已确认的网页下一页。打开后用对应工具核对落地页。',
    { read_only: flag, kind: { type: 'string', enum: ['courses', 'homework', 'chapters'] }, offset: integer(0, 10000), title: text, teacher: text, open_id: text, next_page: flag }, ['kind'], [...read, ...click, ...wait, 'document.compare', 'document.navigate']),
  tool('read_questions', '只读当前作业或章节测验的小批题干、选项、实填值与页面公布的解析，每次最多八题，并同步软件题目面板。保留 question id 用于填写；含图、截断、低置信度字体或复杂题型不自动填写。用户要求自动作答时使用 auto_answer。',
    { question_range: range, assignment_id: text, offset: integer(0, 10000), limit: integer(1, 8) }, [], [...read, 'document.compare', 'questions.publish']),
  tool('answer_questions', '填写 Agent 已核实的答案并逐题回读。使用 read_questions 刚返回的 question_id 和当前选项字母或 blanks；保留冲突的已有作答，拒绝变化的题目和不支持题型。不会保存或交卷。',
    { total: integer(0, 10000), answers: { ...array(object({ question_id: text, source: text, choices: array(text, 16), blanks: array(text, 16) }, ['question_id']), 8), minItems: 1 } }, ['answers'], [...read, ...click, 'document.fill', 'document.compare', 'questions.publish']),
  tool('start_course', '登录、唯一匹配学生课程、打开章节目录并开始待完成任务，整个流程由仓库实现。验证码返回后识别附图并携带 captcha_id/captcha_code 重试；同名课程可传 teacher。范围与平台学分会逐步核对。',
    { course_name: text, teacher: text, captcha_id: text, captcha_code: text, replace_credentials: flag, current_only: flag, video_only: flag, muted: flag, chapter_range: range }, ['course_name'], [...read, ...click, 'document.navigate','document.image','document.fill','document.compare','document.reveal','document.scroll','document.select','credentials.request','credentials.fill','media.read','media.play','media.mute','media.wait','workflow.checkpoint']),
  tool('study', '当前章节工作流：按真实目录标记核对完成，按页签推进，处理视频和课件阅读。视频通过媒体事件等待，结束后重新检查平台标记；测验和讨论返回 needs_quiz/needs_discussion 给 Agent 处理后继续。中断后从检查点重新观察，不重放旧控件。不会仅因视频结束就宣称章节完成。',
    { read_only: flag, current_only: flag, video_only: flag, muted: flag, chapter_range: range }, [], [...read, ...wait, ...click, 'document.compare', 'document.reveal', 'document.scroll', 'document.select', 'media.read', 'media.play', 'media.mute', 'media.wait', 'workflow.checkpoint']),
  tool('read_document', '读取或推进当前 PDF、PPT、图书阅读器的真实下一页、页面选择或滚动控件。read_only=true 仅观察。停留要求和任务完成以平台为准，不伪造阅读统计。',
    { read_only: flag }, [], [...read, ...wait, ...click, 'document.compare', 'document.scroll', 'document.select']),
  tool('discussion', '读取当前章节讨论题目和最多六条匿名回复。用户已要求回复时，由 Agent 独立组织正文，再携带当前 discussion_id 和 reply 调用；发布后回读，结果不明时不自动重发。',
    { discussion_id: text, reply: text }, [], [...read, ...wait, ...click, 'document.fill', 'document.compare', 'workflow.checkpoint']),
]
