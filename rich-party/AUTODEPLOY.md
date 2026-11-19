# 大富翁自动部署

仓库：deepsidie007/game，分支：main，项目根目录：rich-party。
现有 Worker：rich-party-city。

## 连接状态

2026-11-19 已在现有 Worker 中连接 deepsidie007/game 的 main 分支，根目录为 rich-party。连接后需再推送一次提交，才会启动首次自动构建；本次文档更新用于触发首次构建。

## 一次性连接

在 Cloudflare 中选择原有 rich-party-city → Settings（设置）→ Builds（构建）→ Connect（连接），连接 GitHub 的 deepsidie007/game。

- 生产分支：main
- 根目录：rich-party
- 构建命令：npm test
- 部署命令：npm run deploy
- Node.js：22（如需填写变量，NODE_VERSION=22）
- 构建监视路径：rich-party/**

保存并部署，检查构建日志显示成功。之后对 rich-party 内文件的 main 分支提交会自动发布到原网址。无需本地 npm 或重复 Wrangler 登录。

请连接现有 Worker，保持 wrangler.jsonc 的 name、ROOMS 绑定及迁移配置，沿用已有房间数据。不要另外创建同名项目或删除 Durable Object。

## 更新与排错

修改文件并提交 main 后，在 Cloudflare 的构建记录查看状态；发布后刷新游戏。仅上传 ZIP 到 GitHub 不会更新游戏，需提交解压后的源代码。
构建命令会检查 Worker 打包、游戏规则、骰子结果和多人联机运行。测试失败时不会继续发布。
