# 🧰 不吃工具箱

一个**完全在浏览器本地运行**的工具集网站——无需联网、无需安装、无需后端，你的文件永远不会离开设备。

## ✨ 功能一览

| 工具 | 说明 | 技术实现 |
| --- | --- | --- |
| 🖼️ 图片工具 | 批量压缩、格式转换（JPEG / PNG / WebP）、文字 / 图片水印、AI 一键去背景 | 原生 Canvas + @imgly/background-removal |
| 📄 PDF 工具 | 多文件合并（可排序）、每页拆分 / 按页码范围提取、PDF 转图片 | pdf-lib + pdf.js |
| 🔁 数据格式转换 | Excel（xlsx/xls）/ CSV / JSON 互转，CSV 自动带 BOM 防乱码 | SheetJS |
| 📝 Markdown 编辑器 | 分屏实时预览、格式工具栏、导入导出 .md/.html、草稿自动保存 | marked + DOMPurify |
| 🔳 二维码工具 | 生成（尺寸 / 纠错 / 颜色自定义）+ 识别图片中的二维码（支持粘贴截图） | qrcode.js + jsQR |
| 🧠 流程图 / 导图 | 流程图与思维导图编辑：节点、连线、dagre 自动布局，导出 PNG / JSON | Cytoscape + dagre |
| 🎨 画板 / 标注 | 画笔、图形、文字、图片标注，撤销与 PNG / JSON 导出 | Fabric.js |
| 🎵 音频工具 | Winamp 风格可视化（频谱 / 波形）；剪辑器：裁剪、淡入淡出、拼接、变速不变调，导出 WAV / MP3 | Web Audio API + lamejs |
| 🎬 视频工具 | 视频转 GIF（截取片段、帧率 / 尺寸 / 色数可调）与帧提取（缩略图网格 + ZIP） | Canvas + omggif |
| 🔐 密码 / 哈希 | 密码生成（强度评估、防取模偏差）+ 文本 / 文件 MD5、SHA 系列哈希 | Web Crypto + 内置 MD5 |

## 🚀 使用方式

**方式一（最简单）**：直接双击 `index.html`，在浏览器中打开即可。全部功能均已适配 `file://` 直开。

**方式二（推荐）**：启动本地静态服务器，获得 `http://localhost` 环境：

```bat
:: Windows：双击 start.bat，自动打开 http://localhost:8080
```

或手动执行（任选其一）：

```bash
python -m http.server 8080
npx serve .
```

然后访问 <http://localhost:8080>。

## 📁 目录结构

```
不吃工具箱/
├── index.html          # 单页应用：首页 + 六个工具
├── start.bat           # Windows 一键启动本地服务器
├── css/
│   └── style.css       # 全部样式（深色 / 浅色主题）
├── js/
│   ├── app.js          # 注册机制、hash 路由、主题、公共工具
│   ├── md5.js          # 纯 JS 的 MD5 实现（Web Crypto 不含 MD5）
│   ├── image.js        # 图片压缩 / 格式转换
│   ├── removebg.js     # 图片去背景（AI 推理）
│   ├── pdf.js          # PDF 合并 / 拆分 / 转图片
│   ├── convert.js      # JSON / CSV / Excel 互转
│   ├── markdown.js     # Markdown 编辑器
│   ├── qrcode.js       # 二维码生成 + 识别
│   ├── security.js     # 密码生成器 + 哈希计算器
│   ├── flowchart.js    # 流程图 / 思维导图
│   ├── board.js        # 画板 / 标注
│   ├── removebg.js     # 图片去背景（AI 推理，归入图片工具）
│   ├── audio.js        # 音频可视化 + 剪辑器（WAV / MP3 导出）
│   └── video.js        # 视频转 GIF + 帧提取
└── vendor/             # 第三方库（本地化，离线可用）
    ├── pdf-lib.min.js      # PDF 读写（合并 / 拆分）
    ├── pdf.min.js          # pdf.js 渲染内核（转图片）
    ├── pdf.worker.min.js   # pdf.js worker（file:// 下自动转主线程）
    ├── xlsx.full.min.js    # SheetJS
    ├── jszip.min.js        # 批量结果打包 ZIP
    ├── marked.min.js       # Markdown 解析
    ├── purify.min.js       # HTML 消毒（防 XSS）
    ├── qrcode.min.js       # 二维码编码
    ├── jsqr.min.js         # 二维码识别（纯 JS 本地解码）
    ├── cytoscape.min.js    # 图可视化（流程图 / 导图）
    ├── dagre.min.js        # 层次布局算法
    ├── cytoscape-dagre.min.js # dagre 布局适配器
    ├── fabric.min.js       # 画板 / 标注
    ├── omggif.min.js       # GIF 编码（视频转 GIF）
    └── lame.min.js         # MP3 编码（音频剪辑导出）
```

## 📝 实现说明

- **图片去背景**：使用 `@imgly/background-removal`（ISNet 模型，ONNX 在浏览器本地推理，图片不上传）。AI 引擎以 ES Module 从 jsdelivr CDN 动态导入；模型权重（约 40–80 MB，按所选模型不同）通过官方 CDN（staticimgly.com）HTTP 分块下载。**下载内容保存在浏览器内存与 HTTP 磁盘缓存中，不会写入项目文件夹**；该库 v1.7.0 不做持久化缓存，重新打开页面通常需要重新下载。此功能需要联网，其余功能完全离线。
- **图片去背景许可**：该库采用 IMG.LY 免费许可（Free License，可免费商用），详见其仓库 `LICENSE.md`。

## 🪄 图片去背景：模型缓存的三种方案

当前实现（方案 3）的行为：模型（约 40–80 MB）在每次打开页面并开始处理时从官方 CDN 分块下载，
存于页面内存与浏览器 HTTP 磁盘缓存中。库本身（v1.7.0）不写任何持久化缓存（源码中 Cache Storage /
IndexedDB 零引用），因此**同一页面内多次处理只下载一次，但重新打开页面通常会重新下载**。
如需持久化，可按以下方案改造：

| 方案 | 模型存放位置 | 断网可用 | 项目文件夹体积 | 改造要点 |
| --- | --- | --- | --- | --- |
| 1. 模型本地化 | 项目 `vendor/bg-data/` | ✅ 稳定 | +50–100 MB | 把资源整体下载到本地，`removeBackground(...)` 配置中加 `publicPath: 'vendor/bg-data/'`。**注意：仅 localhost 可用**——`file://` 直开时浏览器会拦截对本地文件的 `fetch`，需改用 `start.bat` 启动 |
| 2. 浏览器持久缓存 | 浏览器站点数据（Cache Storage） | ✅ 稳定 | 不变 | 在 `js/removebg.js` 调用前包装 `window.fetch`：拦截 `staticimgly.com` 资源请求，命中 `caches.match(...)` 直接返回，否则下载并 `cache.put(...)`。`file://` 与 localhost 均可用；缓存可在浏览器设置中清除 |
| 3. 保持现状（默认） | 页面内存 + HTTP 磁盘缓存（随缘） | ❌ 不可靠 | 不变 | 无需改动；页面开着期间反复使用不再下载 |

补充说明：

- 模型资源清单（含全部文件与分块哈希，可用于整体下载或校验）：
  `https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/resources.json`
- 方案 1 实施步骤：按清单下载 `dist/` 下全部文件放入 `vendor/bg-data/`（保持目录结构），再在 `js/removebg.js` 中加 `publicPath` 配置即可，随时删除该目录即可回到方案 3。
- 方案 2 手动清除缓存：浏览器设置 → 清除对应站点数据，或 DevTools → Application → Storage → Clear site data。

- **PDF 转图片**：pdf-lib 只能读写 PDF 结构、无法渲染页面，因此转图片使用 Mozilla 的 pdf.js 将每页绘制到 Canvas 再导出。合并 / 拆分则由 pdf-lib 完成。
- **file:// 直开兼容**：Chrome 禁止在 `file://` 页面创建 Web Worker，因此 pdf.js 的 worker 会在本地文件环境自动降级为主线程模式（功能不受影响，仅超大 PDF 略慢）；用 `start.bat` 走 localhost 则使用真实 Worker，性能更佳。
- **MD5**：浏览器 Web Crypto API 出于安全设计不提供 MD5，本项目内置了一个经过标准测试向量校验的纯 JS 实现（RFC 1321）。
- **密码生成**：使用 `crypto.getRandomValues` 拒绝采样保证均匀分布；"每类至少一个"通过先取样再 Fisher-Yates 洗牌实现。
- **Markdown 预览**：输出一律经过 DOMPurify 消毒，粘贴恶意 HTML 也不会执行脚本。
- **二维码识别**：jsQR 为零依赖纯 JS（已本地化），配合 Canvas 解码，支持拖入 / 选择 / Ctrl+V 粘贴截图，识别与生成两功能可互相联动。
- **音频可视化 / 剪辑**：基于 Web Audio API。剪辑器支持波形拖选裁剪、淡入淡出、多文件拼接、变速不变调（Hann 窗 OLA 时域拉伸，浏览器原生不支持该能力）；WAV 导出为纯 JS 写 PCM 头，MP3 由 lamejs 本地编码。
- **视频转 GIF / 帧提取**：`<video>` 按时间轴 seek 逐帧绘入 Canvas，保证时间精确；GIF 使用 omggif 编码，调色板由中位切分法从全部帧采样生成（256 色内）。仅支持浏览器可播放的视频格式。
- **CSV 中文乱码**：所有 CSV 输出自动携带 UTF-8 BOM，Excel 双击打开不乱码。
- **SHA 系列**：使用原生 `crypto.subtle`，在 `file://`、`localhost`、HTTPS 下均可用（非安全上下文的 http 站点中不可用，页面会给出提示）。

## 🔒 隐私

所有解析、压缩、加密均在你的浏览器内完成，**没有任何网络请求**（第三方库已全部本地化），可以放心处理含敏感信息的文件。
