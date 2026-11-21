# ZError · 学习通网站能力包

本仓库维护学习通的网站规则、经验及执行流程。Open 从同一 Git 提交分发 `skills/chaoxing/` 的文档、图谱、图标和隔离编译包 `runtime.json`；软件只提供通用浏览器操作、凭据隔离和授权校验，不内置本站业务流程。

## 开发

```sh
npm ci
npm run dev
```

网站经验地址继续使用 `http://127.0.0.1:8817/experience.json`。不增加 `/v2` 路径或版本参数。保存源码后自动重编译，下一次工具调用使用校验后的新包；当前调用固定原代码版本。修改文档下次请求即生效。

`npm run build` 输出 `dist/experience.json` 与 `dist/runtime.json`；`npm run build:publish` 同时更新提交到仓库的 `skills/chaoxing/runtime.json`。只发布编译后的 IIFE、SHA-256 及严格工具定义，不向客户端下发 TypeScript 源码；没有旧版脚本产物或回退流程。包内 `apiVersion:2` 只用于格式校验。

## 工具与边界

命名空间为 `browser_site_chaoxing__`：`login`、`catalog`、`read_questions`、`answer_questions`、`study`、`read_document`、`discussion`。脚本通过固定的 document/media/credentials 命令驱动网页，不使用网页 eval、网络或文件系统。验证码原图交给模型识别，凭据始终由宿主隔离。

读题、填答和复核按小批次进行，实填状态同步到软件题目面板。`auto_answer` 使用页面已公布解析、本地题库和模型；本仓库没有声明远程题库或解析上传服务。未知、含图、截断或混淆字体题目保留给 Agent 核对，不保存、交卷或伪造完成状态。详见 [作答边界](skills/chaoxing/references/homework.md)。原生浏览器仍需实站回归；本仓库 CI 负责编译契约及确定性流程样例。

## 校验与发布

```sh
npm test
npm run build:publish
git diff --exit-code -- skills/chaoxing/runtime.json
```

CI 使用与软件相同的 QuickJS 0.32、内存和执行限额运行产物，检查编译包和源码一致。发布经验仓库不会发布客户端或部署 Open 服务。MIT，见 [LICENSE](LICENSE)。
