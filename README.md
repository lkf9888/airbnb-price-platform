# Airbnb Price Platform

独立的 Airbnb 房价查价平台。

## 功能

- 输入日期范围、地址、物业类型、房型、卧室、卫生间
- 调用内置 Airbnb 查价脚本
- 返回日租/月租价格图
- 输出最高价、最低价、平均价、中位数
- 给出每日建议挂牌价和调价建议
- 支持基于 OpenStreetMap / Photon 的低成本地址自动建议和坐标定位（默认不需要 API key）
- 支持同城长租月租查价，参考 Collectly 聚合的 Craigslist、Kijiji、VanPeople 长租房源

## 本地运行

进入当前目录执行：

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run start`

## Airbnb 登录态

这个项目的真实查价功能依赖 Airbnb 登录态。

本地首次使用时，先执行：

- `npm run airbnb:research:setup`

登录完成后，脚本会把登录态保存到：

- `server/automation/state/auth/airbnb-chrome-storage-state.json`

这个文件不应提交到 GitHub。

## 环境变量

复制 `.env.example` 为 `.env.local`，按需填写：

- `AIRBNB_STORAGE_STATE_JSON`
- `AIRBNB_STORAGE_STATE_BASE64`
- `PHOTON_ENDPOINT`
- `COLLECTLY_RENTAL_ENDPOINT`
- `AUTH_SECRET`

说明：

- 地址自动建议默认走 [Photon](https://photon.komoot.io) / OpenStreetMap，不需要 Google Maps API key。`PHOTON_ENDPOINT` 可选，只有在你未来想换成自建 Photon 服务时才需要配置。
- `AIRBNB_STORAGE_STATE_JSON`：部署环境可直接注入 Airbnb storage state JSON
- `AIRBNB_STORAGE_STATE_BASE64`：如果不方便直接放 JSON，可用 base64 注入
- `COLLECTLY_RENTAL_ENDPOINT`：可选，用于覆盖长租查价接口；默认使用 Collectly 当前公开 rental listings endpoint
- `AUTH_SECRET`：用于签名 IP 试用记录和登录会话，请在部署环境配置一个足够长的随机字符串

## 账号和收费

- 未注册或未登录用户按 IP 地址只允许免费试用 1 次查询
- 同一 IP 第二次查询会要求注册或登录
- 注册/登录后，系统按 C$1 / 次查询记录查询次数和累计费用
- 当前版本只记录费用，不自动扣款；正式收款建议后续接入 Stripe 和持久数据库

如果部署环境没有本地登录态文件，接口会优先尝试从上面两个变量生成：

- `server/automation/state/auth/airbnb-chrome-storage-state.json`

## Docker 部署

项目已包含 `Dockerfile`，适合部署到支持 Docker 的平台，例如：

- Render
- Railway
- VPS / 云服务器

示例流程：

1. 把项目推到 GitHub
2. 在部署平台连接 GitHub 仓库
3. 选择用 `Dockerfile` 部署
4. 配置环境变量
5. 发布

## 重要说明

- 这个站点不包含 Turo、车辆、订单、车主或共享链接功能
- 这个项目不是纯静态网站，不能直接用 GitHub Pages 运行完整查价能力
- 完整查价需要后端 Node 运行环境、Playwright 浏览器环境和 Airbnb 登录态
