# 精细化气象信息处理与客观评价平台 (OMICS) · 项目说明

> 本文件供跨机器 AI 协作时快速了解项目全貌，每次功能变更同步更新第一部分。

---

## 一、程序概览与架构

### 定位
航空气象报文综合监控告警系统 + 预报质量自动化评定平台。  
双轨架构：**事中监控**（轮询航班+气象报文，红黄绿告警）；**事后评定**（TAF/手工双模式评分、Excel导出）。

### 运行方式
- 统一启动器（推荐）：从交付根目录 `MTWS+OMICS` 双击 `统一服务器启动器.bat`，或双击同目录的 `统一服务器启动器.lnk`。启动器同时管理 MTWS、OMICS 与后台 Nginx：MTWS 内部监听 `127.0.0.1:8001`，OMICS 内部监听 `127.0.0.1:8002`，Nginx 对外提供统一入口 `127.0.0.1:8000`。
- 访问地址：MTWS 使用 `http://127.0.0.1:8000/mtws/`，OMICS 使用 `http://127.0.0.1:8000/omics/`。两个前端同源；扫码仍从各软件页面发起，但登录成功后的 token 统一交由 Nginx 管理，任一软件登录后其他软件可复用同一 token，减少不同 IP/入口重复登录导致的掉线。
- 启动器界面只显示两个业务面板：左侧 MTWS / 右侧 OMICS，各自状态灯 + 独立日志。Nginx 是基础设施服务，已隐藏单独监控面板，但仍会随「全部启动」「退出服务」和托盘右键退出一起启动/停止。
- 中控台不再提供扫码登录功能；原登录入口改为说明框，只展示当前统一登录状态（目前谁登录、用户标识、登录来源/时间等）。
- portable Nginx 随 OMICS 携带在 `OMICS 5.8/tools/nginx/nginx.exe`，目标电脑不需要额外安装 Nginx；运行时配置生成到 `%LOCALAPPDATA%/MTWS_OMICS_Nginx`，避免 Windows Nginx 中文路径问题。
- 开发调试（会出黑框）：`python main.py`（旧单 OMICS 开发入口，端口 56789；不经过统一 Nginx 入口）
- 生产发布：PyInstaller 打包为 `ForecastTool.exe`（console=False），托盘常驻

### 目录结构
```
├── main.py                  # 入口：启动 Flask+Waitress，CustomTkinter 控制台，pystray 托盘
├── ../launcher.py            # 交付根目录统一启动器：两栏监控 MTWS + OMICS，后台静默管理 Nginx 统一入口
├── ../launcher_config.json   # 【运行时】统一启动器配置：MTWS/OMICS/Nginx 路径与端口
├── ../统一服务器启动器.bat    # 交付根目录 bat：pythonw 启动 ../launcher.py（无黑框）
├── ../统一服务器启动器.lnk    # 天气图标快捷方式，指向统一服务器启动器.bat，可复制到桌面
├── tools/nginx/nginx.exe     # portable Nginx，随 OMICS 携带，目标电脑无需额外安装 Nginx
├── assets/weather.ico        # OMICS/打包图标资源
├── assets/weather.png        # OMICS 图标资源
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
| Excel 导出/逆向同步 | openpyxl 生成格式化 Excel；winreg 穿透 OneDrive 写入物理桌面 `SF预报评定导出` 文件夹；支持 Excel→系统双向同步。预报发布导出不依赖外部模板文件，按原版式直接生成「24小时天气预报」xlsx + PNG |
| 预报发布 | publish.js 独立模块；拉取 NWP 数值预报（open-meteo ECMWF IFS）；管理发布字典表 |
| 事中监控 | 轮询航班数据 + METAR/TAF 实时解析；7要素红黄绿弹窗告警 |
| SF平台登录 | 各软件端口/页面发起扫码登录；登录成功 token 统一由 Nginx 管理并供 MTWS/OMICS 复用，OMICS 前端保存登录信息用于页面状态和请求携带，后端不再作为统一登录态来源。 |
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

### v5.8-dev · 2026-06-12（启动器登录态识别、托盘图标、无模板导出与路径浏览）
- **增强** 启动器登录态识别：OMICS 前端打开后，会把浏览器缓存里已存在的 token（`sf_weather_token`/`mtws_token`）主动回灌到 Nginx 统一登录态（`/auth/update`），启动器信息框据此正确显示「已登录」及用户标识，无需重新扫码。
- **调整** 系统托盘/窗口图标：启动器优先使用项目根目录 `系统图标.ico`（依次回退 `图标.png`），窗口标题栏与托盘图标统一，该图标已纳入 Git 版本管理。
- **重做** 预报发布导出：图表 PNG 与 Excel 不再依赖外部 `.xlsm` 模板文件，后端用 openpyxl 按原模板版式直接生成 `.xlsx`（标题区、计数区、起报时间、机场行、24 小时天气列、颜色图例、发布说明），导出文件名统一为「24小时天气预报_时间戳」，内容与预报发布界面一致。
- **新增** 系统设置路径浏览：「JSON 备份」和「图表导出云盘配置」改为只读输入框 + 「浏览」按钮，通过 `/api/select_folder` 选择目录并持久化到 LocalStorage。
- **验证** `script.js` 通过 `node --check`；`app.py`、`launcher.py` 通过 `py_compile`。

### v5.8-dev · 2026-06-11（扫码登录调整为 Nginx 统一 Token 管理）
- **调整** 扫码登录入口：登录动作仍在各业务软件自己的页面/端口触发，MTWS 和 OMICS 均可独立发起扫码。
- **调整** token 归属：扫码成功后的 token 统一由 Nginx 管理，不再由统一中控台或 OMICS 后端作为跨系统唯一持有方。
- **增强** token 复用：不管从 MTWS 还是 OMICS 登录，其他软件都应复用 Nginx 当前 token，避免不同 IP、不同入口或重复扫码导致账号互相挤下线。
- **取消** 中控台扫码登录功能：统一启动器/中控台原登录区域改为说明框，只显示当前谁已登录、用户标识、登录来源和登录时间等状态信息。
- **调整** OMICS 登录态：OMICS 的登录信息不再放在后端作为统一状态来源，改为由前端保存；业务请求需要 token 时通过前端携带或通过 Nginx 统一登录态获取。
- **说明** LocalStorage 仍可用于前端页面展示、兼容旧 key 和刷新后恢复 UI，但跨 MTWS/OMICS 的 token 权威来源是 Nginx。

### v5.8-dev · 2026-06-09（MTWS+OMICS 交付目录、Nginx 同源入口与启动器精简）
- **调整** 交付目录统一为 `MTWS+OMICS`：顶层放置 `launcher.py`、`launcher_config.json`、`统一服务器启动器.bat/.lnk`，业务目录为 `MTWS/` 与 `OMICS 5.8/`。
- **调整** 统一启动器架构：MTWS(Django) 内部 `127.0.0.1:8001`，OMICS(Flask+Waitress) 内部 `127.0.0.1:8002`，Nginx 对外统一入口 `127.0.0.1:8000`。
- **新增** OMICS 统一访问入口：`http://127.0.0.1:8000/omics/`；Nginx 同时保留 `/api/`、`/assets/` 等 OMICS 旧绝对路径兼容。
- **新增** portable Nginx：随 OMICS 放置于 `OMICS 5.8/tools/nginx/nginx.exe`，目标电脑无需额外安装 Nginx；运行配置生成到纯英文路径 `%LOCALAPPDATA%/MTWS_OMICS_Nginx`，规避 Windows Nginx 中文路径报错。
- **调整** 启动器 UI：界面只保留 MTWS / OMICS 两个业务监控面板，Nginx 监控栏隐藏为后台基础设施；「全部启动」「退出服务」和托盘右键退出仍会统一启动/停止 Nginx、MTWS、OMICS 及端口残留监听进程。
- **增强** 同源登录态：OMICS 前端在 LocalStorage 中同步 `sf_weather_token` 与 `mtws_token`、`sf_userId` 与 `mtws_userCode`，配合 MTWS 减少两个程序重复扫码互相挤下线。
- **修复** 迁移后的配置路径：`launcher_config.json` 改为 `MTWS+OMICS/MTWS` 与 `MTWS+OMICS/OMICS 5.8`，避免旧中文乱码路径影响跨机运行。
- **验证** `launcher.py`、`backend/app.py` 通过 `py_compile`；`frontend/script.js`、`frontend/publish.js` 通过 `node --check`；Nginx 配置 `-t` 成功。

### v5.6-dev · 2026-06-08（24小时模板导出、登录姓名映射与发布表细节修复）
- **调整** 发布表机场删除：机场名单元格右上角 `×` 点击后直接删除，不再二次确认。
- **调整** 非常驻机场确认适航逻辑：编辑内容为空并确认编发时，若该机场不是常驻机场，则直接从发布表移除；常驻机场仍保留为“适航”确认态。
- **重做** 预报发布 Excel 导出：导出 Excel 改为复制 `未来24小时天气预报20260507（模版）（如提示宏已被禁用，点击【启用内容】）.xlsm` 模板并保留宏，填写 `24小时天气预报` 工作表；起报时间写入 `C6`，机场从第 9 行开始写入，24 小时天气写入 `D:AA`。
- **修复** HTML 表格合并列导致 Excel 天气列偏移的问题：前端新增结构化 `publish_rows` 导出数据，后端优先使用结构化数据填模板。
- **新增** OMICS 后端人员映射缓存接口 `/api/personnel_mapping`，高级管理员“人员映射管理”的浏览器本地配置会同步到后端 `personnel_mapping.json`，供统一启动器读取。
- **调整** 统一启动器扫码登录显示：登录成功后不再直接显示工号，而是按人员映射显示姓名，例如 `吴霄 登录成功`。
- **新增** 统一启动器“退出登录”按钮：清空控制台登录态，并调用 OMICS `/api/auth/logout` 退出后端会话；中转接口随即返回未登录状态。
- **验证** `frontend/publish.js`、`frontend/script.js` 通过 `node --check`；`backend/app.py`、`launcher.py` 通过 `py_compile`；模板导出通过 Flask test client 生成 `.xlsm` 并验证 `C6/A9/B9/D9/E9` 写入正确。

### v5.6-dev · 2026-06-08（预报发布界面交互与导出优化）
- **优化** 预报发布导出文本：同一日期的时段只写一次日期，如 `5日04-07时有...`；不跨月时不写月份，跨天/跨月时自动补齐日期/月信息。
- **补强** 导出图表/Excel入口：前端导出前检查 `html2canvas` 是否加载，导出成功提示保存目录与文件名；后端 `/api/export_publish` 原有 PNG + Excel 保存逻辑保持可用。
- **修复** 确认编发后的右键撤销菜单：仅在备注列右键时出现，鼠标移出备注/菜单后自动消失，不再整行任意位置触发。
- **优化** 机场增删：去掉右键删除机场，改为机场名单元格右上角 hover 显示 `×` 删除；右键菜单移除红/黄/绿/删除标记与展开/收起机场入口，菜单文字去掉颜色和图标。
- **修复** 插入/添加机场后只出现空行的问题：新增机场加入强制显示集合后重新执行数据加载，确保自动获取最新 TAF 与 EC 数据。
- **修复** 附加行删除：行内有内容时删除会二次确认，避免误删后后续操作又复现异常空行。
- **优化** 表格编辑输入法体验：选中单元格后直接键入时不再把第一个字母强行写入输入框，优先让输入法接管输入。
- **修复** 展开后的 TAF/EC 明细复制：天气、风、能见度、温度、气压等明细单元格补齐选择坐标，支持选区复制和再次复制粘贴。
- **调整** 广州不再显示为“备选”分类，按普通机场处理。
- **修复** 编辑栏无天气点击确认后机场被自动删除的问题：空内容确认统一保存为“适航”确认态，不再依赖常驻机场豁免。
- **验证** `frontend/publish.js` 通过 `node --check`，`backend/app.py` 通过 `py_compile`。

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
