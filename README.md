# ZError · 学习通网站能力包

维护 ZError Agent 在学习通（chaoxing.com）上的可复用操作经验与导航图谱。采用标准 `SKILL.md` 入口，任务细则按需读取。

首版整理自 [ZError `5511cd6`](https://github.com/Miaozeqiu/ZError/commit/5511cd6) 的内置学习通资源，包括学生课程入口、多层 iframe、视频事件等待、字体混淆以及题号与元素 ID 的对应核对。

## 内容

```text
skills/chaoxing/
├── SKILL.md                 入口与任务路由
├── website.json             网站身份与仓库内图标路径
├── assets/icon.png          学习通网站图标
├── references/
│   ├── login.md             登录、凭据变量、学生课表
│   ├── study.md             视频与章节任务的连续执行
│   └── homework.md          作业、章节测验与题序核对
└── site-graph.json          页面、iframe、页签与导航关系
```

这些文件依赖 ZError 提供的浏览器、凭据和事件等待工具；标准文档格式不代表其他 Agent 无需适配工具就能运行。导航图谱是 ZError 的附加资源，不是标准 Skill 必需文件。

## 与主程序的关系

本仓库维护学习通的通用操作经验与网站脚本。ZError 缓存站点文档与图标，Agent 写入经验时保存为独立的本地补充。网站仓库入口与通用 Skill 安装入口不同。

支持该功能的版本可在「设置 → Agent → 网站 → 导入 GitHub 仓库」预览并导入网站资源。网站包需要 `website.json`、`SKILL.md`、`site-graph.json` 和仓库内图标：

```json
{ "version": 1, "id": "chaoxing", "name": "学习通", "host": "chaoxing.com", "icon": "assets/icon.png" }
```

图标最多 256 KB，使用仓库内 PNG、ICO、JPEG、WebP 或 GIF，不使用外链；站点图标取自对应网站，仅作网站标识，品牌权利归其权利人。

维护者在 ZError 的开发分支中审核差异后，同步 `skills/chaoxing/` 中的文件到：

```text
src/services/agent/skills/bundled/chaoxing/
```

随后运行主程序的测试和构建，在原生浏览器验证受影响的流程。不要删除内置资源或仅凭远端最新版本自动执行更新。其他客户端可按自己的 Skill 加载规则读取 `skills/chaoxing/SKILL.md`，并自行适配工具契约。

## 课程脚本开发

在本仓库分模块维护 TypeScript。`src/courses/index.ts` 提供入口，`match.ts` 负责匹配课名与授课教师，`types.ts` 定义输入和返回值。开发由外部编辑器或开发 Agent 完成。

```sh
npm ci
npm run dev
```

在 ZError 的「设置 → Agent → 网站 → 学习通 → 网站设置」里，把网站经验 HTTP 地址设为 `http://127.0.0.1:8817/experience.json`，启用此来源的网站脚本并保存。`npm run build` 构建同样的静态文件到 `dist/`，可由自有 HTTP 服务托管。

保存 `src/courses/` 或 `src/homework/` 下的脚本后，开发服务重新构建 JS 和清单。下一次工具调用检查清单的 ETag，验证产物 SHA-256 后使用新版本，当前工具调用继续使用已经加载的脚本。

- `browser_list_courses` 列出当前学生课表中的课程，可按课名筛选。
- `browser_open_course` 接受用户提供的课名，可直接调用。它优先精确名称，其次唯一的部分匹配。重名时返回候选，可补充授课教师。ZError 读取已登录的课表，验证候选和落地页，脚本只接收课名、授课教师和临时索引。
- `browser_list_homework` 读取学生课程里的作业及状态。`browser_open_homework` 使用作业名称直接进入并返回页面快照。匹配脚本在 `src/homework/index.ts`，与课程共用名称匹配规则。

- `browser_answer_homework` 对已打开的课程作答页自动查题与填答，`browser_review_homework` 供 Agent 读取实填值、找漏题。答题决策在 `src/homework/answers.ts`：将本地题库的精确候选映射到当前选项，排除冲突和不明确答案。脚本在隔离运行时执行，页面操作、核对和权限由 ZError 处理。没有自动保存、交卷或上传答案。
- `browser_review_chapter` 核对学习通学生端当前小节。`browser_complete_chapter` 使用 `src/chapters/index.ts` 按页签、任务点顺序推进，并沿用应用的视频监控。宿主以章节目录待完成数核对完成状态。

## 维护原则

- 只保存跨课程可复用、在真实页面验证过的方法；页面变化时重新观察。
- 不保存账号密码、API Key、Cookie、会话令牌、个人学习记录、课程答案或真实课程/作业标识。
- 不上传本地聊天、截图、网页导出或用户机器上的站点经验覆盖文件。
- 学生课表来自当前页面。课程匹配脚本不保存任何用户数据。
- 图谱保留 `parserIds` 兼容字段供现有程序读取；这不代表本包提供解析器实现，Agent 仍使用当前浏览器工具。
- 完成以用户指定范围的真实页面回执为准，不把视频正在播放或清单勾选当作完成，不承诺答案满分。

## 校验

使用 Node.js 22 或更新版本。

```sh
npm ci
npm test
```

校验 Skill、图谱、脚本产物哈希和课名匹配。CI 使用本地样例，原生行为在 ZError 中验收。

## 许可

MIT，保留原 ZError 的版权与许可声明，见 [LICENSE](LICENSE)。

## 工具发布

`site-tools/tools.json` 定义 Agent 工具，`site-tools/*.js` 提供隔离脚本。Open 从同一 Git 提交同步这些文件。凭据、页面动作和提交授权由 ZError 宿主核验。
修改 `src/` 后运行 `npm run build:publish`，把更新的 `site-tools/` 与源代码一起提交。
