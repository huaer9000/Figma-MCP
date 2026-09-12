# Figma设计桥接 — Context

> 这是供新 Agent 快速接手的压缩快照，不是无限追加的原始聊天记录。

## 当前快照

- 项目状态：第一版已实现；读、切图、写入都已在「务工平台 / 设计稿」上试过
- 当前阶段：工具 23 个。当前选中的 `Aetherfield / Homepage` 已做成可滚动的前端展示页
- 最近检查点：2026-09-12（公开仓库 https://github.com/huaer9000/Figma-MCP ，commit `aa00e31`）

## 已完成

- 2026-09-12：已初始化 Git（`main`）并推送到公开仓库 https://github.com/huaer9000/Figma-MCP 。首个 commit：`aa00e31`。未上传 `node_modules/`、`dist/`、`plugin/dist/`、`repro/`。许可为 MIT。
- 2026-09-12：用户指定开源仓库名为 `Figma-MCP`。对外名称、README 标题、`package.json` 的 `name` 改为 Figma-MCP / `figma-mcp`。本机目录和 Figma 插件显示名仍为「Figma设计桥接」，MCP 服务名仍为 `figma-bridge`。新增 MIT `LICENSE`。`.gitignore` 排除 `repro/`、`.cursor/`、`logs/`、`.env*`。
- 2026-09-12：按用户要求把 README「使用方法」改成中文逐步安装教程（环境、构建产物、桌面端导入插件、Cursor / Claude Code / 其它 stdio 客户端、连上验收、排错）。路径改为占位符，不再写死本机目录。`docs/TECH.md` 第 2.2.1、8.1 节改为指向 README，避免两套说明分叉。
- 初始化项目文档并写完技术规格。
- 实现共享协议、路径校验、layout 序列化、WebSocket 桥、Figma 插件。
- 工具现为 23 个：原 22 个加上 `figma_set_effects`（背景模糊 / 图层模糊 / 投影 / 内阴影）。`figma_set_text_style` 可改 `characters`。
- `npm test` 44 项通过；`npm run build` 已产出新的 `dist/server/index.js` 与 `plugin/dist/`。
- 用户确认：免费自建桥；读写切图都要；像素级还原；不绑定 Cursor。
- 已从该 Figma Site 下载首页图片到 `repro/aetherfield-site/`。
- 已在当前页创建 1920×5932 画板并写入导航、标题、模块文案、按钮和黄底页脚。站点原字体 `Source Serif Pro` / `Radio Canada Big` 可用。
- 2026-09-10：按用户要求另建 Auto Layout 画板 `1307:2638`（1920×4935，位置约 3300, -2000）。旧画板 `1307:2588` 未删。
- Auto Layout 写入已补 `FILL` / `HUG` / `ABSOLUTE` 与 `set_fill.clear`。
- 2026-09-10：跨稿写入原则写入 MCP 握手 `instructions` 和资源 `figma://write-guidelines`（正文 `shared/write-guidelines.ts`）。不含 Aetherfield 量测。
- 2026-09-11：在「务工平台 / 设计稿」另建 `Apple / Homepage`（`1324:2844`，约 x=10144，1920×5978）。含 Nav、Event（字压图）、Duo/Pro（上字下图）、Watch 12（字压图）、Ultra、AirPods、简化页脚。用户授权用 Inter Regular/Medium，因文件无 SF Pro。整页导出：`repro/apple-site/figma-homepage.png`。
- 2026-09-11：根因是主线程 `Array.from` 把每片 256KiB 打成 `number[]` 后同步狂发。已改为独立 TypedArray + 片间让出（`plugin/src/bin-transfer.ts`）。重载插件后整页导出仍为 1920×5978 / 2,021,724 字节，随后 `figma_status` 与 `figma_get_current_page` 都成功。对照：`repro/apple-site/figma-homepage-after-fix.png`。
- 2026-09-11：第二次断连不是大图，也不是用户关插件。空闲约 1 分钟后，旧心跳按漏 pong 把套接字关掉。Figma iframe 常常不回 pong。已改为默认只 ping、不因漏 pong 断开。`npm test` 40 项通过。`FIGMA_BRIDGE_BOOT=4` 后握手含第 13–16 条。空闲 95s 再查 `figma_status.connected === true`。
- 2026-09-11：`Apple / Homepage` 已换 Watch 12 产品图 `1325:3146`（914×638，文案在表盘下留白）、AirPods 宽幅 FILL `1325:3148`。页脚为 5 列 11 组 + 6 条注 + 含 Sales and Refunds 的法律行 `1325:3155`。按块对照：`repro/apple-site/section-watch12.png`、`section-ultra.png`、`section-airpods.png`、`section-footer.png`。
- 2026-09-11：用户指 Pro / Ultra「背景颜色不对」。官网 1920 下两块 `.tile-wrapper.theme-dark` 实测都是 `rgb(0,0,0)`，画板填充本来就是 `#000`，没有改纯色。Pro 产品图本来就是官网静帧（酒红机 + 铬色 PRO）。Ultra 当时是黑表 3/4 首帧，官网 `welcome` 视频播完是钛金属侧面静帧；已换成 `watch-ultra-static-2x.jpg`（节点 `1326:3183`，仍 1090×578 @ y=322）。对照：`section-pro.png`、`section-ultra.png`。
- 2026-09-11：按当前选区 `Aetherfield / Homepage`（`1307:2638`）做成前端展示页 `repro/aetherfield-site/index.html`。未改苹果稿和小程序画板。预览：`http://127.0.0.1:8767/`（在该目录 `python3 -m http.server 8767`）。浏览器已对照 Hero、Features、Clarity、Case、Journal、Quote、底栏 CTA、黄底页脚。窄屏页脚改为纵向排列，避免版权压到纹理。
- 2026-09-11：Journal 印章 `z-index: 20`，菱形内补白底，避免镂空透出缩略图；支持拖动（移动超过 4px 才跟手）。文章行 hovered 为灰底、缩略图放大、标题下划线。Clarity 三张卡随指针做 rotateX/Y + 高光。`prefers-reduced-motion` 时只保留拖动、关掉倾斜。

## 正在进行

- 大图导出打挂、空闲漏 pong 误杀都已端到端验证，插件保持连接。
- 2026-09-11：导航写成 `rgba(250,250,252,0.8)` + `BACKGROUND_BLUR` 20，并压在 Event 图上，否则静帧上看不出磨砂。页脚 11 组标题与链接拆开：标题 `a=0.92`，链接 `a=0.8`（官网也是 Regular，不是更粗）。Duo 文案 2 行 / Watch 12 文案 3 行（Inter 比 SF Pro 宽，框收到 640）。整页导出 `repro/apple-site/figma-homepage-latest.png`（1920×5978 / 2,269,785 字节），随后 `figma_status.connected === true`。`FIGMA_BRIDGE_BOOT=6`。
- 新画板 `1307:2638` 已按官网图文关系搭成嵌套 Auto Layout，主要摄影已贴上。
- 2026-09-10：外面 SIGTERM 旧桥后 Cursor 不会自动拉起；改了 `~/.cursor/mcp.json` 的 `FIGMA_BRIDGE_BOOT=1` 才重新 spawn。现进程 PID 见 17653。插件已重连。`figma_create_image` 可用。
- 已贴进 `1307:2638`：仪表盘、Features 电图、Clarity 织物、案例合影、期刊贴纸和三篇文章缩略图、引言肖像、页脚纹理和 wordmark SVG。预览：`repro/aetherfield-site/homepage-al-preview.png`（1920×5543）。
- 2026-09-10：对照官网 1920 宽量测后，画板 `1307:2638` 的 CTA 已补齐并改对。原先缺 Read case study / View all articles / 底栏 Request a demo；旧按钮是圆角 12、无左侧白点。现为直角黑底。不能再起一份 `npm run bridge`。
- 2026-09-10：用户指出仍缺渐变、列表分割线/编号、卡图标。根因是只盘了文案和照片，且 `figma_set_fill` 只能写纯色。已补 Hero 三色渐变 SVG、Features 001–004 与 `#DBE0EC` 细线、Clarity 三枚 42px 图标；原则增加图层盘点。改完原则后须重启 MCP 才会进握手。
- 2026-09-10：继续闭合盘点里未写的层：Nav 122×20 logo SVG + Get started 12×10 下箭头；Journal 贴纸改为官网实测 421×221 @ (363, 11)；页脚纹理预乘 `#FFF546` 后贴回，页脚高 693。画板现 1920×5936（官网 5932）。`figma_update_node` 必须先 `ABSOLUTE` 再写坐标。
- 2026-09-10：案例区改为 `#F6F8FB` 980×320 r=16 灰卡；仪表盘 2px 黑描边；底栏 CTA 同色灰底、高 358。原则拆出容器底和描边。
- 2026-09-11：Clarity titles（`1307:2683`）交叉轴改为 CENTER，「Built for clarity / Designed for action」居中。对照：`section-clarity.png`。

## 官网图文关系（2026-09-10 量测）

没有 CSS `mask`，正文也没有 `mix-blend`。字压图只出现在 Clarity；页脚纹理是唯一的 `multiply`。其余要么是并排，要么是放大的独立图形。

| 区块 | 关系 | 不要做成 |
| --- | --- | --- |
| Hero | 80px 衬线+无衬线标题是主设计元素，坐在蓝→奶油 **SVG 渐变**（`#A8D3FF` / `#D3E3EF` / `#FFF4DF`，高约 815）上。仪表盘 PNG 960×608 @ (480,482) r=24 是独立产品图，压在渐变下沿，**不**托住标题。 | 标题压在仪表盘上；渐变当白底 |
| Features | 居中标题在上。左：天空+薄纱摄影里已经合成了 UI 卡（693×502 @ 210,1330），图本身就是设计物。右：01–04 列表+细线+按钮，与图并排。 | 四条能力挤在空白里；字叠到天空图上 |
| Clarity | 全宽奶油织物摄影是底（1920×694 @ 0,1952）。「Built for clarity / Designed for action」80px 黑字 **居中压在织物上**（无阴影、无混合）。其下三张白卡 489×246 r=16 @ y=2280，图标和短文在卡里，卡也压在织物上。 | 大标题左对齐或写在白底上；三列没有白卡；织物当配图贴在字旁边 |
| Case | 蓝双色同事照 498×280 @ (490,2936) r=8 在左，案例文+按钮在右。并排。 | 字压在合影上 |
| Journal | 左侧蓝色菱形贴纸 SVG（渲染约 281×304 @ 441,3335，`preserveAspectRatio=none`）是图形印章，内含 Aetherfield Journal。标题「From the journal」压在贴纸右侧。右栏三行：165×100 缩略图+标题+分类。贴纸与首条缩略图也有重叠。 | 普通列表；贴纸当小图标 |
| Quote | 蓝双色全身抠图像 742×849 @ (210,3962) 是造型元素（浅底，不是方框照片）。引言 40px 在右，不压脸。小引号 SVG 在文案上方。 | 肖像当背景、字叠脸上 |
| 底 CTA | 白底居中大标题+按钮。无图。 | 黄底或压图 |
| Footer | 黄底 `#FFF546`。橄榄色织物 PNG 1880×280 的父层 `mix-blend-mode: multiply`，是材质不是配图。超大 wordmark SVG 1880×309 @ (20,5603) 填满页脚宽度，字本身是主设计。链接在黄底上沿。 | 200px 普通字；纹理当独立插画 |

## 重要决策

- 自建「插件 + 本机 MCP」，同一进程听 WebSocket。对 Agent 只暴露标准 MCP stdio。
- 默认端口 `17653`，只绑 `127.0.0.1`。两个 MCP 进程不能同时占桥。
- 切图和像素级读取必须落盘，MCP 不回传大图 base64。
- 主数据合同是自研 `layout`（含 `boundsInRoot`），`JSON_REST_V1` 可选。
- 插图只走本机文件，不走远程 URL。
- Auto Layout `mode` 含 Figma 实际存在的 `GRID`。
- 跨稿写入原则通过 MCP `instructions` 和资源 `figma://write-guidelines` 下发；单页量测不进全局说明。

## 阻塞与风险

- 目录还不是 Git 仓库，没有可回退快照。未授权不执行 `git init`。
- 2026-09-10：导入插件时 Figma 拒绝 `ws://127.0.0.1:17653`。已改为 `localhost`。
- 2026-09-10：探测脚本结束后会关掉桥，插件立刻变未连接。
- 2026-09-10：只保留用户 `~/.cursor/mcp.json` 的 `figma-bridge`，已删项目级重复配置。
- 2026-09-10：Cursor 重启 MCP 时旧进程未放端口；已改为 stdin 关闭即退出，并对占用做短重试。
- 2026-09-10：改完 `figma_create_image` 后必须让 Cursor 重新 spawn MCP。外面 SIGTERM 不够，要改 `mcp.json` 触发重连。已写入 `docs/PITFALLS.md`。
- 第一版无鉴权，同机其它进程可连桥。

## 官网按钮规格（2026-09-10，1920 宽实测）

Nav / Footer 的 Get started 是文字链接，不是黑底按钮。

| 规格 | 出现位置 | 结构 |
| --- | --- | --- |
| 大号 46px | Hero 两枚、Explore features、底栏 Request a demo | 黑底 `#000`，圆角 0；水平 AL，`padding: 16`，`gap: 10`；左侧 **4×4 白正方形**；文案 Geist Mono Medium 14 / 行高 14 / 白 |
| 小号 38px | Read case study、View all articles | 同样黑底直角，**没有白点**；`padding: 12`；同一字体 |

实测宽度（hug）：Request a demo 164×46；Explore the platform 214×46；Explore features 180×46（稿里 181，差 1px，来自 Figma 字宽）；Read case study 150×38；View all articles 167×38。

间距：Hero 两钮相距 16；Case 正文到按钮 32；Journal 列表到按钮 24（按钮水平居中）；底栏标题到按钮 32。

## 下一步

- Aetherfield 展示页已可在 `http://127.0.0.1:8767/` 滚动、拖印章、悬停列表和倾斜 Clarity 卡片。若要改动效力度、加真实表单，或做成可部署站点，再说范围。
- Pro 填充和产品图已与官网静帧一致（`#000` + 酒红/铬色 PRO）。若你看到的「背景颜色」仍不对，需要指出期望色值或发一张对照。
- Ultra 现为官网播完后的钛金属侧面。若仍要黑表 3/4 首帧，再说一声即可换回。
- 装 SF Pro 后可把 Duo / Watch 文案框收回官网宽度（580 / 560），并换回官方字体。
- 导航压在 Event 上是为了让静帧看得出磨砂；官网首屏 Event 从 y=44 开始，图并不伸进导航底下。
- 页脚「Get started」仍是一行字，缺下箭头；页脚链接色是 `#66640F`，官网看起来更接近黑。
- Features 比官网高约 40px。Hero 渐变是导入 SVG，不是原生 `figma_set_fill` 渐变。
- 若要原生写渐变和 blendMode，需扩 MCP 并重启。当前用落盘 SVG/PNG 绕过。
- 用户已指定开源名为 `Figma-MCP`，公开仓库，MIT。`repro/` 不上传。
- 若插件显示名也要改成 Figma-MCP，或要把 `repro/` 一并公开，再说一声。
- 复刻经验已在 `shared/write-guidelines.ts` 和 `dist/`。Cursor 正在跑的 MCP 握手已含第 13–16 条。再改原则或桥后必须：`npm run build`，再改 `FIGMA_BRIDGE_BOOT` 重启。不要再起 `npm run bridge`。
- `~/.cursor/mcp.json` 的 `FIGMA_BRIDGE_BOOT` 现为 `"6"`。改 `"5"` 时发现失败，再改 `"6"` 才拉起。

## 关键证据与产物

- 项目路径：`/Users/lichao/Documents/Dev-project/Figma设计桥接`
- 画板：`Apple / Homepage`（`1324:2844`）；`Aetherfield / Homepage` Auto Layout 版（`1307:2638`）；旧版 `1307:2588` 仍在
- 苹果站点资源：`repro/apple-site/`；当前整页对照 `figma-homepage-latest.png`；分块对照 `section-duo.png` / `section-watch12.png` / `section-ultra.png` / `section-airpods.png` / `section-footer.png`
- 站点资源：`repro/aetherfield-site/`；前端展示页 `repro/aetherfield-site/index.html`；预览 `http://127.0.0.1:8767/`
- Auto Layout 预览：`repro/aetherfield-site/homepage-al-preview.png`（1920×5936）
- 对照切图：`repro/aetherfield-site/section-hero.png`、`section-features.png`、`section-clarity.png`、`section-case.png`、`section-journal.png`、`section-footer.png`、`section-bottom-cta.png`、`btn-*.png`
- 页脚预乘纹理：`repro/aetherfield-site/footer-texture-multiply.png`
- 写入原则：`shared/write-guidelines.ts`（MCP `instructions` + `figma://write-guidelines`）
- 技术规格：`docs/TECH.md`
- 服务入口：`dist/server/index.js`
- 插件清单：`plugin/manifest.json`

## 规则候选

- 2026-09-10：写入画板时，按钮必须用 Auto Layout Frame 包住文案并十字居中；不要把标签做成按钮矩形的兄弟节点再估算坐标。待你确认是否升为项目规则。
- 2026-09-10：复刻画板尽量用嵌套 Auto Layout，方便改文案；只有压图、印章重叠才用绝对定位。已写入 `docs/DECISIONS.md`。待你确认是否升为 `AGENTS.md` 规则。
- 2026-09-10：复刻必须先做图层盘点（底 / 容器底 / 描边 / 列表铬 / 饰件 / 字 / 图 / 按钮 / 效果），缺一层不算完。已写入 MCP 原则。待你确认是否升为 `AGENTS.md` 规则。

## 压缩与归档

- 当本文件明显影响新 Agent 快速接手，或项目进入新阶段时，将旧快照归档到 `docs/context/archive/`，再重写本文件为当前状态。
- 单次 Agent 的详细检查点可以写入 `docs/context/events/`。
