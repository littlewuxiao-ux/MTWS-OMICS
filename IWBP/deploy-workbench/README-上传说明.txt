# 气象智能业务工作台（慧应用上传包）

本目录由 `node tools/build-deploy-workbench.cjs` 自动生成，请勿手改后当源码维护。

## 上传步骤

1. 确认下方「打包前检查」全部通过
2. 登录 ai.sf-express.com → 慧应用 → 新疆项目
3. **上传本文件夹 deploy-workbench**（不是整个 V2 根目录）
4. 调试默认入口：index.html
5. 内网访问验证后发布

## 本包结构（慧应用）

- index.html：页面骨架（**不含** 50 万行内联 JS，避免上传被截断）
- assets/app.js：主业务脚本
- assets/bootstrap.js：首页三按钮兜底导航
- assets/head-boot.js：嵌入模式初始化

## 本包不含

- tools/、node_modules/、review-search/（复盘搜索另发慧应用）
- FOC / 天地图 / 机器人密钥（*.local.json）
- 发布 outbox、开发脚本

## 慧应用静态托管下的能力边界

- 可用：三屏界面、浏览器 localStorage、AWC 报文（视内网与 CORS）
- 不可用或降级：公司 FOC、多人共享生效警报、发布 outbox、复盘 API、机器人推送

详细清单见项目 docs/慧应用部署清单.md

构建时间：2026-07-16T08:34:59.792Z
