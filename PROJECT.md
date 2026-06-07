# 精细化气象信息处理与客观评价平台 (OMICS) · 项目说明

> 本文件供跨机器 AI 协作时快速了解项目全貌，每次功能变更同步更新第一部分。

---

## 一、程序概览与架构

### 定位
航空气象报文综合监控告警系统 + 预报质量自动化评定平台。  
双轨架构：**事中监控**（轮询航班+气象报文，红黄绿告警）；**事后评定**（TAF/手工双模式评分、Excel导出）。

### 运行方式
- 开发调试：`python main.py`（端口 56789）
- 生产发布：PyInstaller 打包为 `ForecastTool.exe`（console=False），托盘常驻

### 目录结构
```
├── main.py                  # 入口：启动 Flask+Waitress，CustomTkinter 控制台，pystray 托盘
├── server_gui.py            # 备用 GUI 模块
├── config.json              # 运行时路径/端口配置（自动生成）
├── backend/
│   ├── app.py               # Flask 应用主体，所有 API 路由（~82KB）
│   └── logic/
│       ├── avwx_standalone_parser.py  # 国际报文解析（avwx，英制→公制）
│       ├── taf_parser.py              # TAF 解析与要素提取
│       ├── metar_parser.py            # METAR 解析（7要素）
│       ├── sf_client.py               # 数字填图/SF平台 HTTP 客户端（扫码登录）
│       └── exporter.py                # 评定结果→Excel 导出（openpyxl）
├── frontend/
│   ├── index.html           # 单页应用入口
│   ├── script.js            # 评分主逻辑（评定计算、数据管理、JSON库读写）
│   ├── publish.js           # 预报发布模块（独立，initPublishModule）
│   ├── airports.js          # 机场基础数据（ICAO、坐标等）
│   └── style.css            # 样式（含 .spinner/.loader 动画）
├── logs/
│   └── runtime.log          # 滚动日志（2MB×5，RotatingFileHandler）
└── backup/                  # 自动备份（auto_YYYYMMDD_HHMMSS/）
```

### 主要功能模块

| 模块 | 说明 |
|------|------|
| 评定计算器 | TAF 自动解析 + 手工录入双模式；7要素逐项打分；AMD溯源 |
| 评分公式 | 总分 = 准确率×50% + 完美率×30% + 优秀率×20% − 空报率×10% − 漏报率×10%；未参评项目不计入总评 |
| JSON 数据库 | 层级化 JSON 持久化评定结果，SQLite 辅助 |
| Excel 导出/逆向同步 | openpyxl 生成格式化 Excel；winreg 穿透 OneDrive 写入物理桌面 `SF预报评定导出` 文件夹；支持 Excel→系统双向同步 |
| 预报发布 | publish.js 独立模块；拉取 NWP 数值预报（open-meteo ECMWF IFS）；管理发布字典表 |
| 事中监控 | 轮询航班数据 + METAR/TAF 实时解析；7要素红黄绿弹窗告警 |
| SF平台登录 | 扫码登录获取 token，拉取数字填图气象数据（sf_client.py） |
| 运行日志 | 后端 RotatingFileHandler + 前端 PBLOG() 批量上报 `/api/log`；一键复制 copyPublishLog() |

### 主要依赖库

**后端（Python）**
- `flask` + `waitress` — Web 服务器
- `pandas` — 数据处理
- `openpyxl` — Excel 读写
- `customtkinter` / `pystray` / `Pillow` — 桌面 GUI / 托盘
- `winreg`（标准库）— OneDrive 路径穿透
- `avwx`（内嵌 avwx_standalone_parser.py）— 国际报文解析

**前端（原生）**
- `ECharts 5` — 图表
- `Flatpickr` — 日期选择器
- 无其他第三方框架（纯 HTML/CSS/ES6）

---

## 二、更新日志

### v5.6-dev · 2026-06-06
- **修复** 预报发布「导出文本」时间格式缺少日期，改为「X月X日HH时」，跨日时日期自动推算

### v5.6-dev · 2026-06-03
- **修复** `publish.js` 3处模板字符串损坏（反引号/`${}`被吃掉），根因：整个文件解析失败导致 `initPublishModule` 未定义，引发"时间不加载/无动画/无数据"三症状
- **修复** `style.css` 缺少 `.spinner` 类定义（代码用 `.spinner`，只有 `.loader` 有动画），补充 spin 动画
- **修复** `publish.js` NWP 抓取 `.catch(()=>[])` 静默吞错，改为记录 HTTP 状态/异常原因
- **新增** 运行日志系统：`main.py`+`app.py` 接入 `logging`，写 `logs/runtime.log`（滚动 2MB×5）；新增 `/api/log` 接口收集前端日志；前端加 `PBLOG()` 日志器 + `copyPublishLog()` 一键复制
