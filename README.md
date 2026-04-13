# Airbnb Price Platform

独立的 Airbnb 房价查价平台。

## 功能

- 输入日期范围、地址、物业类型、房型、卧室、卫生间
- 调用内置 Airbnb 查价脚本
- 返回日租/月租价格图
- 输出最高价、最低价、平均价、中位数
- 给出每日建议挂牌价和调价建议
- 支持 Google Maps 地址自动建议

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

- `GOOGLE_MAPS_API_KEY`
- `AIRBNB_STORAGE_STATE_JSON`
- `AIRBNB_STORAGE_STATE_BASE64`

说明：

- `GOOGLE_MAPS_API_KEY`：用于地址自动建议
- `AIRBNB_STORAGE_STATE_JSON`：部署环境可直接注入 Airbnb storage state JSON
- `AIRBNB_STORAGE_STATE_BASE64`：如果不方便直接放 JSON，可用 base64 注入

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
