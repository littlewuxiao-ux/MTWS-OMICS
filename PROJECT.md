# 精细化气象信息处理与客观评价平台 (OMICS) · 项目说明

> 本文件供跨机器 AI 协作时快速了解项目全貌，每次功能变更同步更新第一部分。

---

## 一、程序概览与架构

### 定位
航空气象报文综合监控告警系统 + 预报质量自动化评定平台。  
双轨架构：**事中监控**（轮询航班+气象报文，红黄绿告警）；**事后评定**（TAF/手工双模式评分、Excel导出）。

### 运行方式
- 统一启动器（推荐，同时跑 MTWS+OMICS）：双击 `统一服务器启动器.bat`；也可以双击带天气图标的 `统一服务器启动器.lnk`。首次运行点「路径配置」分别指定 MTWS 程序根目录（`server_gui.py` 所在目录，launcher 会自动定位 `mtws_django/manage.py`）和 OMICS 项目根目录（包含 backend/frontend，两个程序可在不同文件夹）。左屏 MTWS / 右屏 OMICS，各自状态灯 + 独立日志；任一未启动显示「服务未启动」。顶部「扫码登录」只完成控制台服务登录态写入，不显示/复制一次性 token，避免多程序重复登录互相挤下线。
- 开发调试（会出黑框）：`python main.py`（端口 56789；黑框来自 python.exe 本身，与 GUI 无关）
- 生产发布：PyInstaller 打包为 `ForecastTool.exe`（console=False），托盘常驻

### 目录结构
```
├── main.py                  # 入口：启动 Flask+Waitress，CustomTkinter 控制台，pystray 托盘
├── launcher.py              # 统一服务启动器：双屏并行启动/监控 MTWS(Django) + OMICS(Flask)；MTWS 可选根目录自动定位 manage.py；OMICS 内联服务不依赖 run_server.py
├── launcher_config.json     # 【运行时】启动器配置（两个服务路径/端口，首次保存路径配置时生成）
├── 统一服务器启动器.bat      # 唯一保留的根目录 bat：pythonw 启动 launcher.py（无黑框）
├── 统一服务器启动器.lnk      # 天气图标快捷方式，指向统一服务器启动器.bat，可复制到桌面
├── assets/weather.ico       # 启动器/快捷方式/托盘天气图标
├── assets/weather.png       # 托盘天气图标 PNG
├── server_gui.py            # MTWS 原始托盘控制台（未改动，launcher.py 参考其设计）
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

### v5.6-dev · 2026-06-08（统一控制台登录态中转与启动器交互修复）
- **新增** 统一控制台本地登录态中转接口：`launcher.py` 启动仅监听 `127.0.0.1:19529` 的 `/auth/status`，控制台作为唯一 token 持有方；扫码成功后顶部按钮由「扫码登录」更新为「工号 登录成功」，避免多个业务程序重复扫码导致账号互相挤下线。
- **调整** OMICS 后端登录/取数流程：`backend/app.py` 的 `/api/auth/status`、`/api/fetch_data`、`/api/fetch_flights` 优先读取控制台中转 token；即使前端仍传旧 token，后端也优先使用控制台 token，降低 OMICS 与 MTWS 并行时的登录冲突。
- **增强** MTWS 路径与启动体验：默认识别与 OMICS 项目目录平级的 `../MTWS/mtws_django/manage.py`；路径配置保存后自动启动未运行服务；外部接管服务被误关后自动恢复为可点击「启动」状态。
- **调整** 统一启动器双栏布局：MTWS / OMICS 面板改为 grid uniform 等宽布局，避免 MTWS 因多一个「数据库管理工具」按钮导致框体比 OMICS 更宽。
- **说明** MTWS 本体未改动；后续如需接入统一登录，只需在 MTWS 业务请求前读取 `http://127.0.0.1:19529/auth/status` 获取 `token/userCode/login_time`，不要再独立扫码登录。
- **验证** `launcher.py` 与 `backend/app.py` 均通过 `py_compile`。

### v5.6-dev · 2026-06-08（统一启动器修复与 MTWS 根目录适配）
- **修复** `统一服务器启动器.bat` 通过 `cmd start` 启动时在中文/特殊字符路径下会把 `launcher.py` 截断为 0 字节的问题；改为 PowerShell `Start-Process` 数组参数启动，规避批处理路径解析坑，并实测启动后 `launcher.py` 不再被清空。
- **调整** 扫码登录窗口：删除 token 文本框与「复制Token」按钮，不再展示/复制一次性 token；扫码后只完成控制台服务登录态写入，避免多个程序重复登录导致账号互相下线。
- **补齐** 统一控制台从 `server_gui.py` 继承的能力：服务信息卡显示地址/端口/协议，MTWS 面板增加「数据库管理工具」入口，顶部增加「退出服务」。
- **增强** MTWS 路径配置：可直接选择 `server_gui.py` 所在程序根目录，launcher 自动定位 `mtws_django/manage.py` 并按 `server_gui.py` 的方式执行 `runserver host:port`；也兼容旧配置中直接选择 `manage.py` 或 `server_gui.py`。
- **验证** `launcher.py` 通过 `py_compile`；用临时 MTWS 标准目录验证根目录、`server_gui.py`、`manage.py` 三种配置均可解析到启动入口。

### v5.6-dev · 2026-06-08（启动器单文件化与根目录清理）
- **合并** `run_server.py` 逻辑到 `launcher.py`：OMICS 服务由 launcher 内联 subprocess 启动 Flask+Waitress，不再需要单独的 `run_server.py`。交付统一控制台时，核心只需 `launcher.py` + `统一服务器启动器.bat` + `assets/weather.*`（如需图标快捷方式再带 `统一服务器启动器.lnk`）。
- **清理** 根目录重复启动器：删除 `run_server.py`、`启动(无黑框).bat`、`统一启动器(无黑框).bat`，根目录只保留 `统一服务器启动器.bat` 一个 bat。
- **调整** 路径配置：OMICS 侧从选择 `run_server.py` 改为选择项目根目录（需包含 backend/frontend），兼容旧配置中的 run_server 字段并自动折算为项目根目录。
- **保留** 通用「扫码登录/Token」窗口：界面不绑定 OMICS，只输出 token 并提供复制按钮；当前调用右侧服务接口，后续 MTWS 可由其他人对接复用。
- **验证** `launcher.py` 通过 `py_compile`；无 `run_server.py` 情况下实测可启动 OMICS 内联服务并监听 56789。

### v5.6-dev · 2026-06-08（扫码登录文案与启动路径说明）
- **调整** `launcher.py` 顶部扫码入口文案：由面向 OMICS 的登录入口改为通用「扫码登录/Token」窗口。窗口标题与说明不再写 OMICS，只负责通过当前右侧服务接口获取并显示 token，提供复制按钮；MTWS 或其它程序后续可由其他人对接复用该 token。
- **说明** 当前 `统一启动器(无黑框).bat` / `统一服务器启动器.bat` 与 `launcher.py` 需要放在同一文件夹，因为 bat 使用 `%~dp0launcher.py` 定位脚本。若要放桌面或其它目录，应移动 `.lnk` 快捷方式，不要移动 bat；若必须移动 bat，需要把 launcher.py 绝对路径写入 bat。
- **验证** `launcher.py` 与 `run_server.py` 均通过 `py_compile` 语法检查。

### v5.6-dev · 2026-06-08（误删恢复）
- **恢复** 误删的 `run_server.py`：该文件仍是当前 `launcher.py` 启动 OMICS 无界面服务的必要入口，不能删除。
- **恢复/重建** 启动脚本：从备份恢复 `统一启动器(无黑框).bat`，重建 `启动(无黑框).bat`；保留 `统一服务器启动器.bat/.lnk` 作为带天气图标的统一入口别名。
- **清理** 删除临时探测文件 `_omics_inline.py`、`_probe_launcher.py`。
- **验证** `launcher.py` 与 `run_server.py` 均通过 `py_compile` 语法检查；测试进程已清理，56789/8000 端口未被占用。

### v5.6-dev · 2026-06-08（统一服务器启动器修订）
- **注意** 本节为一次未完全落地的设计记录：曾计划将 OMICS 服务内联进 `launcher.py` 并删除 `run_server.py`，但当前实际版本已恢复为 `launcher.py` + `run_server.py` 的稳定方案。
- **新增** 天气图标：`assets/weather.ico` / `assets/weather.png`；保留 `统一服务器启动器.bat` 与带天气图标的 `统一服务器启动器.lnk` 作为可选启动入口。

### v5.6-dev · 2026-06-07（统一启动器）
- **新增** `launcher.py` 统一服务启动器：一个入口双屏并行启动/监控 MTWS(Django,8000) 与 OMICS(Flask,56789)。两服务对称处理：subprocess + CREATE_NO_WINDOW（无黑框）+ 读 stdout 实时显示。左 MTWS / 右 OMICS 独立日志面板 + 状态灯；任一未启动显示「服务未启动」。设计沉淀自 server_gui.py（原文件未动，MTWS 显示效果不变）。
- **新增** `launcher_config.json` 启动器配置（两服务路径/端口可配，不必同文件夹）。

### v5.6-dev · 2026-06-07

### v5.6-dev · 2026-06-06
- **修复** 预报发布「导出文本」时间格式缺少日期，改为「X月X日HH时」，跨日时日期自动推算

### v5.6-dev · 2026-06-03
- **修复** `publish.js` 3处模板字符串损坏（反引号/`${}`被吃掉），根因：整个文件解析失败导致 `initPublishModule` 未定义，引发"时间不加载/无动画/无数据"三症状
- **修复** `style.css` 缺少 `.spinner` 类定义（代码用 `.spinner`，只有 `.loader` 有动画），补充 spin 动画
- **修复** `publish.js` NWP 抓取 `.catch(()=>[])` 静默吞错，改为记录 HTTP 状态/异常原因
- **新增** 运行日志系统：`main.py`+`app.py` 接入 `logging`，写 `logs/runtime.log`（滚动 2MB×5）；新增 `/api/log` 接口收集前端日志；前端加 `PBLOG()` 日志器 + `copyPublishLog()` 一键复制
