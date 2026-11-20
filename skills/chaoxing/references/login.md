# 登录

先确认当前浏览器在 `chaoxing.com` 的站内页面，再调用 `browser_site_chaoxing__login`。工具先检查登录标记；已登录不再填写凭据。

凭据请求及填写使用宿主的 `credentials.request` 和 `credentials.fill`，脚本只取得本次文档绑定的临时授权。密码不进入模型参数、结果或检查点。

在浙学的验证码返回原图与绑定 frame、loader、URL 和图片哈希的 `captcha_id`。Agent 识别后同时传 `captcha_code`；刷新、换页或重载使旧标识失效。识别不了时重新取图，不能声称已登录。学习通的滑块、风险验证交给用户在网页完成。

网站提示凭据错误时由安全表单更换；不反复重试被拒绝的凭据。`pending` 只表示已提交但未确认成功，不能继续以已登录身份执行课程操作。
