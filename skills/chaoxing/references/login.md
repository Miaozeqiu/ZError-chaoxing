# 学习通登录与学生课表

## 登录

1. 从 `https://i.chaoxing.com` 进入。已有登录态时直接检查空间页，不重新填写凭据。
2. 被带到 passport2 登录页时先 `browser_get_page` 确认表单。确需直接打开登录页，可使用 `https://passport2.chaoxing.com/login?fid=&newversion=true&refer=https%3A%2F%2Fi.chaoxing.com`。不要反复在旧版和新版登录页之间跳转。
3. 常见控件是 `#phone`、`#pwd`、`#loginBtn`，仅在当前页面确认存在后使用。CSS 放 `selector`；`ref` 只用最新快照提供的元素引用。嵌套表单沿用快照的精确 frameId/loaderId，不读其他框中的同名字段。
4. 使用宿主提供的账号、密码变量，通过 `browser_type` 的 `secret_ref` 填写。用户刚发送明文凭据时，先用 `protect_credentials`（site 为 `chaoxing`）保护，成功后只用返回的引用；不把原文放进 `text` 或脚本。填写成功回执只证明填入，不能证明登录成功。
5. 点击真实登录按钮，读取后续页面确认已进入空间。`navigated:false`、空快照或表单仍在都不等于登录成功；内容尚未加载时短等后重新读取。
6. 出现验证码、滑块或其他需要用户处理的验证时，以 `browser_finish(blocked)` 说明原因并停止。用户完成后发来新指令，再重新读当前页面；不自动绕过验证。

## 学生课程入口

- 空间里的课表通常位于 `#frame_content`。先在最新快照中点击真实的「我学的课」，再读取框内内容，核对当前页签后找到用户指定课程。
- 空间首页同名课程可能属于「我教的课」，搜索框也可能搜索教师课程。不要以首页出现同名课程作为学生入口的证据。
- 页签切换后外壳地址与 iframe 的 `src` 属性可能都不变；看框内当前页签和列表，不改 iframe.src，不把 `visit/courses` 单独导航成顶层网页。
- 进入后再次确认学生课程视角；`/mycourse/tch`、章节编辑、发布控件表示教师入口。返回「我学的课」重新定位；学生列表中找不到时报告，不猜学生入口地址。
- 学生课程壳刚加载时可能默认显示「任务」。用户要章节则点击侧栏「章节」，再在目录中点击实际小节；课程作业点「作业」后读取名单。

章节流程见 [study.md](study.md)，作业与章节测验见 [homework.md](homework.md)。
