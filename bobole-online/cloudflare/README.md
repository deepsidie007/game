# 博博乐 · Cloudflare Workers + Durable Objects

独立 Workers 部署目录，保留2–6人好友房间、德州扑克、炸金花、二十一点、庄闲对决及 `/solo` 原版单机入口。

## 本地运行

需要 Node.js 22 或更新版本。

```sh
npm ci
npm run check
npm test
npm run dev
```

## 部署

```sh
npx wrangler login
npx wrangler whoami
npm run deploy
```

使用仓库时的根目录：`bobole-online/cloudflare`。Workers Builds 的部署命令为 `npx wrangler deploy`；Wrangler 使用此目录下的 `wrangler.jsonc`。服务名为 `bobole-online`，不会覆盖其他游戏的 Worker。第一次部署会应用 SQLite Durable Object 迁移；应保留已发布的迁移标签和类名。

部署成功后使用 Wrangler 返回的 HTTPS URL。进入游戏创建房间，复制邀请链接给朋友，所有在线玩家准备后由房主开始。两个独立浏览器或无痕会话代表两位玩家；同一浏览器的多个标签页共用身份。

## 实现

- 一个房间对应一个 SQLite-backed `BoboleRoom` Durable Object；统一发牌、检查轮次、结算并保存牌局。
- 房间状态、虚拟筹码、座位恢复凭据持久保存，唤醒时重新关联手牌和玩家引用。
- Hibernation WebSocket API：连接可在对象休眠后继续接收事件，每条连接保存服务器端身份附件。
- 服务器只向当前座位发送有权限查看的牌；底牌不会广播给其他玩家。
- `blockConcurrencyWhile` 串行处理房间操作，版本号阻止重复或过期操作；输入与来源检查限制无效请求。
- Durable Object Alarm 处理45秒超时、房主离线30秒后的转移和闲置24小时房间关闭；浏览器无需发送轮询或超时请求。
- 重连使用同源 HttpOnly Cookie；账号、支付和充值均不参与。筹码是本房间的练习积分，与其他部署及单机存档独立。
- 同一玩家最多3个并行标签页；关闭其中一页不会把另外仍连接的标签页标记离线。

## 验证

运行 `npm run check && npm test`。规则测试和 Miniflare/workerd 实测覆盖四种双人对局、WebSocket双向操作与推送、底牌隔离、同源检查、德州全下边池、重复操作拒绝、多标签页、运行时重启恢复及无客户端时的Alarm。

连接实际部署后仍需检查 `/api/health`、页面访问及两名玩家的真实在线同步。源码和本地测试通过不等于已经发布成功。

## 范围

使用 Cloudflare SQLite Durable Objects 配置，具体可用额度由 Cloudflare 账户套餐决定。默认不创建付费订阅。原版的剧情、商店和老虎机可从单机入口打开；联机牌桌使用界面展示的基础规则。
