# 航空气象复盘智能搜索系统

复盘知识库 + 语义搜索引擎，与气象智能业务工作台（`index.html`）**独立部署、松耦合**运行。

## 功能

- 智能语义搜索（BGE-M3 + BM25 混合检索）
- 多维筛选（机场 / 天气类型 / 时间 / 系统影响）
- 文档入库（Word / PDF / PPT / TXT）
- 一键打开原始复盘文档

## 环境要求

- Windows 10+（或其他支持 Python 的系统）
- Python 3.10+
- 无需 GPU，可全离线运行

## 快速开始

### 1. 安装依赖

```powershell
cd "d:\weather agent\V2\review-search"
python -m pip install -r requirements.txt
```

### 2. 准备语义模型（离线）

**方式 A：一键下载（推荐，国内可用 ModelScope 镜像）**

```powershell
cd "d:\weather agent\V2\review-search"
python tools/download_model.py
```

**方式 B：内网离线包**

在有网络的机器执行上述脚本后，将整个 `models/bge-m3/` 文件夹 U 盘拷贝到内网同路径。

> 未放置模型时系统仍可运行，自动降级为 **关键词搜索模式**（BM25）。

### 3. 放入复盘文档

将复盘文件复制到：

```
review-search/data/documents/
```

支持：`.docx` `.pdf` `.pptx` `.txt` `.md`

目录中已附带一份示例文档 `示例_2024深圳雷雨复盘.txt` 供试跑。

### 4. 启动系统

```powershell
cd "d:\weather agent\V2\review-search"
python -m streamlit run app/main.py
```

浏览器访问：`http://localhost:8501`

### 5. 命令行批量入库（可选）

```powershell
python -m app.ingest
```

## 使用流程

1. 打开 **文档入库** 页，上传文件或点击「扫描并入库新文档」
2. 切换到 **智能搜索** 页，输入自然语言查询
3. 使用侧边栏筛选机场、天气类型等
4. 点击 **打开原文** 查看完整复盘

## 目录结构

```
review-search/
├── app/              # Streamlit 界面 + 命令行入库
├── core/             # 分块、元数据、向量索引、混合检索
├── parsers/          # 文档解析
├── data/
│   ├── documents/    # 原始复盘（只读存放）
│   └── chroma/       # 向量库（自动生成）
├── models/
│   └── bge-m3/       # 离线语义模型
├── config.py
└── requirements.txt
```

## 与气象工作台的关系

| 项目 | 说明 |
|------|------|
| 气象工作台 | `d:\weather agent\V2\index.html`，静态前端 |
| 复盘搜索 | `review-search/`，Python + Streamlit 独立服务 |
| Demo 阶段 | 两者分开启动，互不改代码 |
| 后续集成 | 可在工作台分析屏增加入口链接到 `http://localhost:8501` |

## 常见问题

**Q: 首次启动很慢？**  
A: 正在加载 BGE-M3 模型，属正常现象。建议提前将模型放入 `models/bge-m3/`。

**Q: PPT 里图表搜不到？**  
A: 当前仅提取文字。图表内容请通过「打开原文」查看。

**Q: 元数据不准确？**  
A: 系统从文件名和正文自动提取标签。可在「库管理」查看识别结果，后续版本将支持人工校对。
