const text = { type: 'string' }, flag = { type: 'boolean' }
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum })
const array = (items, maxItems) => ({ type: 'array', items, maxItems })
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false })
const item = object({ id: text, title: text, kind: text, status: text, url: text }, ['id', 'title', 'kind', 'status', 'url'])
const question = object({ id: text, number: integer(1, 10000), stem: text, type: text, supported: flag, visual: flag,
  options: array(object({ key: text, text, selected: flag }, ['key', 'text', 'selected']), 16),
  blanks: array(object({ index: integer(1, 16), filled: flag }, ['index', 'filled']), 16), reviewAnswer: text,
}, ['id', 'number', 'stem', 'type', 'supported', 'visual', 'options', 'blanks', 'reviewAnswer'])
const result = object({ status: text, message: text, loggedIn: flag, captchaImage: text, captcha_id: text,
  items: array(item, 40), questions: array(question, 8), total: integer(0, 1000000), next_offset: integer(-1, 10000),
  complete: flag, workflowPending: flag, topic: text, discussion_id: text, replies: array(text, 6),
}, ['status', 'message'])
const read = ['document.list', 'document.query'], wait = ['browser.wait'], click = ['document.click']
const tool = (name, description, properties, required, commands) => ({ name, description, parameters: object(properties, required), result, commands: [...new Set(commands)] })
export const tools = [
  tool('login', '登录当前站点。凭据由宿主在聊天表单中收集并安全填写，模型不可读取。返回 captcha 时识别附图，以相同 captcha_id 和 captcha_code 再调用；验证码或密码错误按实际网页分别处理。只有 loggedIn=true 表示已确认登录。',
    { captcha_id: text, captcha_code: text, replace_credentials: flag }, [], [...read, ...wait, ...click, 'document.navigate', 'document.image', 'document.fill', 'credentials.request', 'credentials.fill']),
  tool('catalog', '读取当前学生页面的课程、作业或章节列表。按 title 唯一匹配或 open_id 打开刚读取的条目；重复名称返回候选。offset 分批读取，next_page 只点击已确认的网页下一页。打开后用对应工具核对落地页。',
    { kind: { type: 'string', enum: ['courses', 'homework', 'chapters'] }, offset: integer(0, 10000), title: text, teacher: text, open_id: text, next_page: flag }, ['kind'], [...read, ...click, ...wait]),
  tool('read_questions', '只读当前作业或章节测验的题干、选项、已有作答标记与页面公布的解析，每次最多八题。保留 question id 用于填写；含图、混淆字体、未知或复杂题型不自动填写。没有题库答案时由 Agent 使用通用题库检索或模型推理，不能声称已查询服务器。',
    { offset: integer(0, 10000), limit: integer(1, 8) }, [], [...read, 'document.compare']),
  tool('answer_questions', '填写 Agent 已核实的答案并逐题回读。使用 read_questions 刚返回的 question_id 和当前选项字母或 blanks；保留冲突的已有作答，拒绝变化的题目和不支持题型。不会保存或交卷。',
    { answers: { ...array(object({ question_id: text, choices: array(text, 16), blanks: array(text, 16) }, ['question_id']), 8), minItems: 1 } }, ['answers'], [...read, ...click, 'document.fill', 'document.compare']),
  tool('study', '当前章节工作流：按真实目录标记核对完成，按页签推进，处理视频和课件阅读。视频通过媒体事件等待，结束后重新检查平台标记；测验和讨论返回 needs_quiz/needs_discussion 给 Agent 处理后继续。中断后从检查点重新观察，不重放旧控件。不会仅因视频结束就宣称章节完成。',
    { read_only: flag, current_only: flag, video_only: flag, muted: flag }, [], [...read, ...wait, ...click, 'document.scroll', 'document.select', 'media.read', 'media.play', 'media.mute', 'media.wait', 'workflow.checkpoint']),
  tool('read_document', '读取或推进当前 PDF、PPT、图书阅读器的真实下一页、页面选择或滚动控件。read_only=true 仅观察。停留要求和任务完成以平台为准，不伪造阅读统计。',
    { read_only: flag }, [], [...read, ...wait, ...click, 'document.scroll', 'document.select']),
  tool('discussion', '读取当前章节讨论题目和最多六条匿名回复。用户已要求回复时，由 Agent 独立组织正文，再携带当前 discussion_id 和 reply 调用；发布后回读，结果不明时不自动重发。',
    { discussion_id: text, reply: text }, [], [...read, ...wait, ...click, 'document.fill', 'document.compare', 'workflow.checkpoint']),
]
