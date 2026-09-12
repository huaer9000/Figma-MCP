# Changelog

记录对用户、部署、兼容性或协作有意义的项目变化。普通工作日志写入 `CONTEXT.md`，不要全部堆入本文件。

能够被精确恢复的版本还应记录对应的 commit、tag 或构建产物标识；用户确认版本可用或验收通过时应及时补充。本文件的文字描述不能代替版本快照。

## Unreleased

- 开源仓库名为 **Figma-MCP**，公开地址 `https://github.com/huaer9000/Figma-MCP`，使用 MIT 许可。Figma 插件显示名和服务名 `figma-bridge` 未改。本地 `repro/` 不进仓库。
- README 安装教程改为逐步中文说明：环境要求、构建产物、Figma 桌面端导入插件、Cursor / Claude Code / 其它 stdio 客户端配置、连上验收和排错。
- Aetherfield 展示页：Journal 印章叠在列表最上并可拖动；文章行补 hovered 底、缩略图放大和下划线；Clarity 卡片随指针做三维倾斜。
- 当前选中的 Aetherfield 首页已做成静态展示页 `repro/aetherfield-site/index.html`，含滚动显现、导航磨砂、按钮/卡片 hover。本地预览 `http://127.0.0.1:8767/`。
- 新增 `figma_set_effects`（背景模糊 / 图层模糊 / 投影 / 内阴影）；`figma_set_text_style` 可改 `characters`。工具现为 23 个。
- 桥心跳默认只 ping 保活，不再因插件 iframe 漏 pong 把空闲连接掐断。改完须构建并重启 `figma-bridge`。
- MCP 写入原则现为 16 条：字压图落在留白、背景摄影 `FILL`、核对照片构图、目录列齐全。
- 大图导出不再把每片打成 `number[]` 同步狂发；插件主线程改为独立 TypedArray 分片并让出事件循环，避免 Figma 把插件杀掉。插件版本现为 `1.0.1`，改完须重新运行插件。
- 当前页新增苹果官网复刻画板 `Apple / Homepage`（1920×5978）。文件无 SF Pro，按授权使用 Inter。
- MCP 写入原则增加「复刻流程」和铬清单；改完须构建并重启 `figma-bridge` 才会进握手。
- MCP 写入原则增加图层盘点：底、容器底、描边、列表铬、饰件必须单独核对；纯色不能代替渐变或混合。
- Aetherfield 首页已补案例灰卡、仪表盘 2px 黑描边、底栏灰底；Clarity 双行标题已居中。
- Aetherfield 首页已补 Hero 蓝→奶油渐变、Features 编号与分割线、Clarity 三张卡图标、Nav logo/箭头、Journal 贴纸尺寸，以及页脚 multiply 预合成纹理。
- Aetherfield 首页 Auto Layout 画板已按官网补齐 CTA：直角黑底、大钮带 4×4 白点、小钮无点；并补上 Read case study、View all articles、底栏 Request a demo。
- 重启本机桥后，可用 `figma_create_image` 把本机摄影和 SVG 写入画布。
- MCP 握手下发跨稿写入原则（`instructions`），完整条文见资源 `figma://write-guidelines`。
- `figma_set_auto_layout` / `figma_update_node` 可写 `FIXED` / `HUG` / `FILL` 和子项绝对定位；`figma_set_fill` 可用 `clear` 去掉填充。
- 新增 `figma_create_image`：从本机 PNG / JPG / WEBP / GIF / SVG 写入画布，不支持远程 URL。
- 初始化项目文档。
- 完成第一版技术规格：插件桥架构、工具清单、像素级数据合同。
- 明确对 Agent 只暴露标准 MCP stdio，不绑定 Cursor。
- 实现第一版：本机桥、21 个 MCP 工具、Figma 插件、单测与构建。
- 修正插件清单：Figma 不接受 `ws://127.0.0.1:端口`，改为 `localhost`。
