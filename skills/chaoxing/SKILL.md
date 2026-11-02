---
name: chaoxing
description: 在 ZError 中登录学习通、浏览学生课程、完成用户指定的章节视频、作业与章节测验。操作学习通网站时使用。
license: MIT
metadata:
  display-name: 学习通
  requires: ZError browser, credential and video-wait tools
---

# 学习通

仅用于学习通通用流程。需要 ZError 的 `browser_*`、`protect_credentials` 和 Skill 读取能力；缺少工具时说明实际限制，不假定执行成功。

按当前用户目标与最新页面执行，任务清单只记录进度。完成章节默认包括范围内的视频与测验；用户明确排除答题、限制章节或要求暂存时遵守其范围。不要从旧对话推断新的操作授权。

## 按需读取

| 当前任务 | 参考文件 |
|---|---|
| 登录、学生课表与进入课程 | [references/login.md](references/login.md) |
| 章节、视频、监控与连续执行 | [references/study.md](references/study.md) |
| 课程作业、章节测验与题序核对 | [references/homework.md](references/homework.md) |

[site-graph.json](site-graph.json) 记录页面与嵌套框架的导航关系。图谱是观察线索，实际定位用当前快照中的 ref、frameId 和 loaderId；旧 ref、图谱里的框名和 URL 都不能替代新观察。

## 共同约束

- 学生任务从「我学的课」进入并核对学生视角；`/mycourse/tch`、章节编辑或发布控件说明进错教师入口，返回学生课表，不猜 URL。
- 多层 iframe 的内容、页签与顶层网址可独立变化。操作后核对目标框内容，不能仅凭网址不变判定失败。
- 账号密码只通过宿主凭据变量填写；不读取回显、不写入脚本、Skill、图谱或诊断文件。验证码交用户处理。
- 视频按正常播放进度等待结束事件，再继续章节任务；不修改播放时间或伪造完成状态。用户接管或停止后结束当前执行，不自行夺回控制权。
- 作答前绑定页面题号、完整题干、选项与该题容器 ID；按 DOM 顺序读取数组，不按数字 ID 排题。字体混淆先解码，失败再用模型视觉；无法辨认时报告阻塞。
- 按真实回执核对用户指定的全部任务。等待用 `browser_watch`、`browser_wait`；完成或真实阻塞用 `browser_finish`，不能只输出“稍后继续”就结束。已提交不擅自重做。
