---
name: chaoxing
description: 使用站点仓库的隔离编译工具登录学习通、浏览学生课程、读取和填写作业，推进用户指定的章节。
license: MIT
---

# 学习通

本站流程由本仓库的 `runtime.json` 提供，软件只执行通用浏览器命令、凭据隔离和权限校验。不要调用旧版平台工具或猜测宿主中有本网站专用能力。

- 登录调用 `browser_site_chaoxing__login`。账号密码只在聊天中的安全表单填写，等待用户点击「继续」。模型不会读取密码。仅 `loggedIn=true` 表示已核对成功。
- 返回 `captcha` 时识别附带的验证码原图，携带同一个 `captcha_id` 和 `captcha_code` 再调用。密码错误与验证码失效分开处理，不能重复提交错误密码。验证码变化或文档更换后重新获取。
- 列表使用 `browser_site_chaoxing__catalog`，`kind` 为 `courses`、`homework` 或 `chapters`。按 `offset` 继续当前页，网页分页用 `next_page`。`open_id` 来自刚读取的条目，按名称打开须唯一匹配。
- 用户要求作答时使用 `browser_site_chaoxing__auto_answer`，每批最多四题，按回执的 `assignment_id` 与 `next_offset` 续批；用户限定题号时传 `question_range={start,end}`，不得扩大范围。只读使用 `browser_site_chaoxing__read_questions`（最多八题）；手工核实后的答案可用 `browser_site_chaoxing__answer_questions` 填写并回读。实填状态自动显示在软件题目面板；`verified` 仅表示实填一致，不表示答案正确或已交卷。
- 当前章节使用 `browser_site_chaoxing__study`。`read_only=true` 只复核，`current_only=true` 限定当前小节，`video_only=true` 限定媒体。视频在一次工具调用中等待事件，之后重新检查平台标记。遇到测验或讨论交回 Agent 处理，再继续原用户范围。
- 返回 `workflowPending=true` 时保留了检查点。恢复先重新读页面，不重放旧 DOM 定位。发布结果不明时不自动再次发送。

细则见 [登录](references/login.md)、[章节与阅读](references/study.md)、[作业与测验](references/homework.md)。

## 范围与完成依据

只处理用户指定的课程、作业、章节及授权操作。域名、frame/loader 与题目指纹每次重新校验。已存在的不同答案或草稿保留。媒体结束、滚到末页、工具正常返回均不等于平台登记完成。页面规则未命中或平台能力不支持时说明阻塞，不猜测、不伪造完成回执。

本地补充经验可以保存用户允许的章节/作业 HTTPS 快捷网址，使用前核对站点、课程和实际落地页。共享仓库不保存用户账号、密码、Cookie、会话地址、真实课程资料或聊天记录。
