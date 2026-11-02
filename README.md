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

本仓库作为学习通通用站点资源的独立维护源。支持网站仓库的 ZError 版本会缓存仓库文档与图标，Agent 修改保存到本地分支；较旧发行版仍使用其内置快照。网站仓库入口与通用 Skill 安装入口不同。

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

## 维护原则

- 只保存跨课程可复用、在真实页面验证过的方法；页面变化时重新观察。
- 不保存账号密码、API Key、Cookie、会话令牌、个人学习记录、课程答案或真实课程/作业标识。
- 不上传本地聊天、截图、网页导出或用户机器上的站点经验覆盖文件。
- 不加入旧的题卡、解析器、`locators.json`、`see.json` 或模拟网页。定位来自当前页面快照。
- 图谱保留 `parserIds` 兼容字段供现有程序读取；这不代表本包提供解析器实现，Agent 仍使用当前浏览器工具。
- 完成以用户指定范围的真实页面回执为准，不把视频正在播放或清单勾选当作完成，不承诺答案满分。

## 校验

Node.js 22 或更新版本，无第三方依赖：

```sh
npm test
```

校验 Skill 入口、文档内部引用、图谱节点唯一性、正则表达式与边关系。CI 不访问学习平台、不登录账号、不做真实答题；原生行为仍需在 ZError 中验收。

## 许可

MIT，保留原 ZError 的版权与许可声明，见 [LICENSE](LICENSE)。
