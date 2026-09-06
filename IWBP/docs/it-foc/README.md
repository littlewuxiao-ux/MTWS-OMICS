# IT 提供的 FOC 接口资料



## 权威来源



- 桌面 **`C:\Users\HUAWEI\Desktop\cjj\数据接口文档.doc`**（内网网关、接口路径）

- **IT 联调说明（2026-06）**：带 token 访问 UAT 请用 **外网域名**（见下）



## 网关 baseUrl（联调用哪个）



| 场景 | baseUrl | token 来源 |

|------|---------|------------|

| **生产外网（席位正式）** | `http://sfa-wgw-inn.sf-airlines.com:1080` | **`python tools/cas_login.py`** 丰声扫码（或 `renew-cas-token.bat`） |

| **UAT 联调** | `http://sfa-wgw-inn.uat.sf-airlines.com:1080` | UAT 系统 F12 复制 token，或丰声扫码 |

| UAT 内网（席位 DNS 常 Query refused） | `http://sfa-intra-gw-uat-inn-apis.int-inn.sfcloud.local:1080` | 同上或丰声扫码 |

| 生产内网 | `http://sfa-intra-gw-inn-apis.int-inn.sfcloud.local:1080` | CAS / 生产登录 |



写入 `data/sf-foc-config.local.json` 的 `baseUrl`（**域名:端口**，不要改成 IP）。



完整请求示例：



`http://sfa-wgw-inn.sf-airlines.com:1080/met/dispatchMetarMetTel/queryMetarTelList`

（UAT 将域名改为 `sfa-wgw-inn.uat.sf-airlines.com`）



## 从 UAT 系统拿 token（IT 步骤）



1. 浏览器登录 **UAT 业务系统**（IT 提供的地址）

2. 按 **F12** → **网络 / Network**

3. 在系统里随便点一个会发请求的功能

4. 选中一条 XHR/Fetch → **请求头 Headers** → 复制 **`token`** 的值

5. 写入 config：



```powershell

cd "d:\weather agent\V2"

node tools/sf-foc-set-token.cjs <粘贴token>

```



或手动编辑 `data/sf-foc-config.local.json` 的 `"token"` 字段。



> **生产外网**：`cas_login.py` 扫码即可（config 里 `casAppKey`/`casAppSecret` 用 IT 给的 **sfaAlgo**）。  
> **UAT 外网联调**：也可 F12 复制 UAT 系统 token；丰声 token 可能与 UAT 环境不一致。



## 接口清单（路径与内网文档一致）



| 章节 | 路径 | 工作台用途 |

|------|------|------------|

| 1.3.1 | `/flight/flightSchedule/getByFlightDate` | 航班 → 机场池 |

| 1.3.2 | `/met/dispatchMetTelSummary/selectNewestTopMet` | 单机场最近 N 条报文 |

| 1.3.4 | `/met/dispatchMetarMetTel/queryMetarTelList` | 报文监控 METAR |

| 1.3.5 | `/met/dispatchTafMetTel/queryTafTelList` | 报文监控 TAF |

> UAT 外网路径 **无** `api/` 前缀（IT 确认）。旧 txt 文档里的 `/api/met/...` 为内网 Market 写法。



本地代理（`npm start`）：`/api/sf-foc/metar/list`、`/taf/list`、`/met/top`。



## 鉴权（IT 2026-06）

**UAT 外网 / 生产外网**：只需请求头 **`Token`**（CAS 扫码写入 config），可选 **`sfUserId`**。**不要** systemKey/accessKey。

**内网 Market API**：systemKey + accessKey + token。



## 自检



```powershell

cd "d:\weather agent\V2"

node tools/sf-foc-ping.cjs

npm start

```



浏览器：`http://localhost:8787/index.html`



## 本目录 txt 文件



早期 IT 摘录；基址 `public-api-market-apis.intsit.sfcloud.local:8000` 已过时，**路径仍可参考**。



联调流程见 `docs/席位与笔记本协作.md`。


