# 梗王擂台 · GitHub / Vercel 版

保留 v0.6 双人选角、房间码、WebRTC 直连与服务器转发。

## 部署

1. 将本目录上传到 GitHub 仓库根目录。
2. 在 Vercel 导入该仓库，Framework 选择 Other，Output Directory 为 public，Build Command 留空。
3. 部署后，公开 Production 访问权限，双方进入「联机 · 房间对战」。

无需在仓库保存任何密钥。api/room.js 是 Vercel Node.js Function，浏览器始终请求同源 /api/room。

## 后端依赖

这是前端入口迁移版，不是完全脱离原服务的独立后端版本。联机接口由 Vercel 服务端连接现有公开房间服务，数据库仍位于原 Cloudflare D1。原站必须保持启用且公开。若原服务拒绝 Vercel 服务端请求，联机将返回明确错误；生产发布后必须验证真实创建、加入房间，不能仅以静态首页成功判定部署完成。

页面、美术和单机模式直接由 Vercel 提供，不依赖浏览器访问原域名。WebRTC 不通时的服务器转发可能有较高延迟。跨网络性能需要两台设备实测。

## 验证

运行 npm test。部署后验证：首页、美术、创建房间、第二位玩家加入、分别选角准备、双方血量一致、退出及重新加入。
