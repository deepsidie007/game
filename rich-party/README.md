# 大富翁 · 欢乐城市冒险（Cloudflare 免费额度版）

这是可以部署到你自己 Cloudflare 账号的完整游戏。包含40格地图、1—4名真人、电脑玩家、房间码邀请、买地升级收租、银行利息、15秒全员拍卖、护盾/双骰/遥控骰、地铁传送和游乐场。

## 1.1 更新：完整棋盘与立体骰子

已经部署过的用户：

1. 解压这份完整压缩包，打开里面 `Cloudflare_RichParty_40` 文件夹。
2. 双击 **`update-windows.cmd`**。
3. 它会使用你电脑上现有的 Cloudflare 授权，将这份新版发布到同名 `rich-party-city` 项目。
4. 完成后打开原来的游戏链接并刷新；如果浏览器仍显示旧画面，按 Ctrl+F5。

请使用与你当前游戏相同的 Cloudflare 账号。现有房间存档仍在原 Durable Object 中，不会因覆盖网页代码被清空。旧对局会在下一次实际掷骰时开始携带新版动画信息。这个更新脚本不会主动重新发起登录；仅在明确提示未登录时，再按错误提示完成设备授权。

本版新增：

- 默认完整棋盘总览，保留放大、拖动和玩家定位。
- 六面真实3D骰子、凹陷点数、光影和落地阴影。
- 掷骰即时翻滚，随后弹跳减速并停在服务器决定的点数。
- 双骰卡显示两颗独立的立体骰子及点数总和。
- 联机玩家共享同一次掷骰的信息；买地等非掷骰操作不触发骰子动画。
- 完整地点说明移到侧栏，避免占用棋盘中央空间。
- 支持系统“减少动态效果”偏好。

## Windows 首次部署

1. 安装 Node.js 22 或更新的 LTS 版本：https://nodejs.org/
2. 注册并登录 Cloudflare：https://dash.cloudflare.com/
3. 解压整个文件夹，然后双击 `deploy-windows.cmd`。
4. 脚本会安装依赖，打开浏览器让你授权 Cloudflare，再发布游戏。
5. 首次使用 Workers 时，如提示创建 workers.dev 子域名，按 Cloudflare 的提示设置后重新运行脚本。
6. 部署结束时终端会显示你的 `https://rich-party-city.<你的子域名>.workers.dev` 地址。这个示例包含占位符；实际链接以部署结果为准。

玩家无需注册 Cloudflare。打开正式游戏地址，创建房间，复制邀请链接或分享6位房间码即可。手机与电脑都可以参加。创建者是房主，真人加入后由房主选择电脑数量并开局。

## 命令行部署（Windows / macOS / Linux）

在这个文件夹中打开终端：

```sh
npm install
npx --yes --package=wrangler@latest wrangler login --device
npx --yes --package=wrangler@latest wrangler deploy
```

需要 Cloudflare 账号的 Workers 发布权限。若有多个账号，Wrangler 会提示选择；选定要托管游戏的账号。如果 Worker 名称冲突，可修改 `wrangler.jsonc` 中的 `name` 再发布。

## 免费套餐

使用 Cloudflare Workers Free 与 SQLite-backed Durable Objects，无需自行购买服务器或数据库。保持 Workers Free 套餐，不主动升级为付费套餐。免费额度有每日请求、运行时间和存储限制；超出免费额度会影响可用性，不能承诺无限使用。账号的实际额度和当前规则以 Cloudflare 控制台及官方文档为准。

官方说明：
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/pricing/

游戏通过可休眠 WebSocket 同步状态；浏览器心跳使用自动应答，回合/电脑/拍卖由服务器 Alarm 管理。所有玩家离线时暂停回合计时，重连后继续。房间7天无玩家操作或重新连接后自动清理。游戏资产均为虚拟积分。

## 开发与验证

```sh
npm run check
npm test
npm run dev
```

`npm run check` 只打包检查，不会发布。测试使用本地 Cloudflare workerd/Miniflare 模拟器，覆盖真实 Worker 路由、四人房间、鉴权、WebSocket同步、服务器自动回合、断线续玩和存储重启恢复。

## 文件说明

- `src/worker.js`：HTTP路由、每个房间独立的 Durable Object、实时连接和服务器计时。
- `src/game.js`：40格地图与权威游戏规则。
- `public/`：网页、界面样式与项目内置 React 文件。
- `wrangler.jsonc`：Cloudflare Worker 和 SQLite Durable Object 绑定。
- `tests/`：游戏规则和本地运行时集成测试。

## 关于原 Hatchable 版本

新地址部署后使用独立的房间与存档。原 Hatchable 的房间码不会自动迁移到新地址；请在新地址创建房间。此包保留旧地图规则辅助代码供兼容和后续维护，新的房间固定使用40格地图。

## 常见情况

- 提示“未登录”：重新运行 `npx wrangler login` 完成浏览器授权。
- 提示没有 Workers 子域名：在 Cloudflare Workers & Pages 中设置后重新部署。
- 朋友打不开：确认分享的是部署输出中的正式地址，并使用手机流量和另一台设备测试。不同网络可能影响海外服务的访问。
- 同一个房间在多个标签页打开：只保留一个；同一设备身份的新连接会替换旧连接。
- 进入后仍有旧画面：刷新页面后重新开房。

本压缩包不包含任何 Cloudflare 账号凭据。授权由 Wrangler 在你的电脑上完成。
