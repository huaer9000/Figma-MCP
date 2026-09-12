# PITFALLS

只记录原因已经查清、处理方式经过验证、未来可能再次遇到的问题。

不要记录普通语法知识、未经验证的猜测、偶发错误或单纯的工作流水账。

## 使用规则

- 开始开发前，阅读与当前任务相关的条目。
- 解决非显而易见且可能复现的问题后，补充或更新条目。
- 技术或环境变化后重新验证；失效内容标记为“已失效”，不要继续当作当前事实。
- 同类问题优先更新原条目，避免重复。

### 官方 Figma MCP 需要付费席位

- 适用范围：选型、用户环境
- 首次发现：2026-09-10
- 最后验证：2026-09-10（Figma 帮助文档与用户实际约束）
- 现象：Cursor 里的官方 Figma MCP 无法作为免费方案使用。
- 根因：官方远程 / 桌面 MCP 面向付费 Dev 或企业席位，不是普通免费文件权限。
- 正确处理方式：用本项目的桌面端插件 + 本机桥操作当前打开文件。
- 不要使用的错误方案：让用户去开通会员；改用 REST 冒充「当前文件」。
- 验证方法：对照 Figma 官方 Cursor MCP 说明与本项目 `docs/TECH.md` 第 1 节。
- 相关文件：`docs/TECH.md`、`docs/DECISIONS.md`
- 适用版本：项目文档阶段
- 当前状态：有效

### Figma 清单不接受 ws://127.0.0.1:端口

- 适用范围：插件 manifest
- 首次发现：2026-09-10
- 最后验证：2026-09-10（Figma Desktop 导入时报 Manifest error）
- 现象：`devAllowedDomains` 写成 `ws://127.0.0.1:17653` 时，导入失败：must be a valid URL。
- 根因：Figma 的域名校验按文档示例认 `http://localhost:端口` / `ws://localhost:端口`，不认带 IP 的 `ws://127.0.0.1:端口`。
- 正确处理方式：清单与插件 UI 都用 `localhost`。服务额外听 `::1`，避免 `localhost` 走到 IPv6 连不上。
- 不要使用的错误方案：在清单里写 `ws://127.0.0.1:17653`。
- 验证方法：Import plugin from manifest 不再报 Manifest error。
- 相关文件：`plugin/manifest.json`、`plugin/src/ui.ts`、`docs/TECH.md` 第 2.6 节
- 适用版本：第一版
- 当前状态：有效

### 插件主线程不能承担 WebSocket

- 适用范围：插件架构
- 首次发现：2026-09-10
- 最后验证：2026-09-10（Figma Plugin API 网络限制）
- 现象：在 `code.ts` 里连 `ws://127.0.0.1` 会失败或根本没有网络 API。
- 根因：插件沙箱主线程不能稳定访问本机网络；UI iframe 可以。
- 正确处理方式：UI 连桥，`postMessage` 给主线程执行 `figma.*`。
- 不要使用的错误方案：在主线程 `fetch` / `WebSocket`；或改走 Figma REST 绕过插件。
- 验证方法：按 `docs/TECH.md` 第 2.1 节实现后，主线程无网络代码，UI 能握手。
- 相关文件：`docs/TECH.md`
- 适用版本：第一版架构
- 当前状态：有效

### dynamic-page 未加载就读子树会抛错

- 适用范围：插件读页、切页
- 首次发现：2026-09-10
- 最后验证：2026-09-10（Figma 官方 dynamic-page 文档）
- 现象：新插件清单必须写 `documentAccess: dynamic-page`；未 `loadAsync` 就读其它页或未加载页的子节点会异常。
- 根因：Figma 不再在启动插件前装载全部页面。
- 正确处理方式：只操作当前页；读当前页前 `await figma.currentPage.loadAsync()`；切页走 `figma_set_current_page`。禁止图省事 `loadAllPagesAsync()`。
- 不要使用的错误方案：按旧插件假设「一启动整份文件都在内存」。
- 验证方法：多页文件中只 load 当前页，读其它页子节点应失败或先切页。
- 相关文件：`docs/TECH.md` 第 2.6 节
- 适用版本：第一版架构
- 当前状态：有效

### MCP 返回值里的大图 base64 不可靠

- 适用范围：切图、像素级读取
- 首次发现：2026-09-10
- 最后验证：2026-09-10（即时设计 MCP 已用 `outputPath` 规避同一问题）
- 现象：把 PNG base64 放进工具结果后，模型侧截断或损坏，无法做视觉核对。
- 根因：MCP / 对话通道对超长文本不完整保留。
- 正确处理方式：服务端写本地文件，工具只回绝对路径和元数据。
- 不要使用的错误方案：把 preview 当 `image` content 或超长 base64 塞回对话。
- 验证方法：导出后检查磁盘文件完整，MCP 结果不含图片字节。
- 相关文件：`docs/TECH.md` 第 4.3、4.4 节
- 适用版本：第一版合同
- 当前状态：有效

### Cursor 重启 MCP 后端口被自己占用

- 适用范围：MCP 启动、日常使用
- 首次发现：2026-09-10
- 最后验证：2026-09-10（Cursor 日志：先 `stopped connection`，再报端口 17653 已被占用，随后桥进程消失）
- 现象：插件刚显示过「已连接」，很快又变「未连接」；Agent 调 `figma_status` 超时或 MCP 处于 error。
- 根因：stdio 被关掉后，若 WebSocket 服务还占着事件循环，旧进程不会立刻退出。客户端随即拉起新进程，绑定失败后放弃，旧进程稍后也被杀掉，端口空了但没有人再听。
- 正确处理方式：stdin / SIGTERM 时立刻 `bridge.close()` 并退出；固定端口启动时对 `EADDRINUSE` 做短重试。用户级和项目级 `mcp.json` 不要重复注册同一个 `figma-bridge`。
- 不要使用的错误方案：再起一份 `npm run bridge` 和 Cursor MCP 抢端口；换一个端口默默启动。
- 验证方法：重启 MCP 后 `figma_status` 仍能连上；Cursor 日志不再出现「端口 17653 已被占用」。
- 相关文件：`server/src/index.ts`、`server/src/bridge.ts`
- 适用版本：第一版
- 当前状态：有效

### 从外面 SIGTERM 掉桥，Cursor 不会自动拉起

- 适用范围：日常使用、更新 MCP 代码后
- 首次发现：2026-09-10
- 最后验证：2026-09-10（对 Cursor Helper 拉起的 `dist/server/index.js` 发 SIGTERM 后，日志只有 `退出（SIGTERM）`，没有 `connecting stdio`；`STATUS.md` 停在 errored）
- 现象：进程没了，端口空了，Agent 调工具报 `Not connected`，工具列表仍是旧的 21 个。
- 根因：Cursor 自己关 stdin 时会立刻再 spawn；外面杀进程会被当成异常断开，不会自动重连。
- 正确处理方式：改 `~/.cursor/mcp.json` 里该服务的配置（即使只加一个无害环境变量）触发 Cursor 重新 `connecting stdio`。不要再起一份 `npm run bridge`。插件一般 3 秒内会自动重连。
- 不要使用的错误方案：只杀 PID 就指望 Cursor 拉新进程；杀完后自己再起一个 node 占 17653，Cursor 重连时会抢端口。
- 验证方法：新 PID 在听 17653；工具目录出现 `figma_create_image`；`figma_status.connected === true`。
- 相关文件：`~/.cursor/mcp.json`、`server/src/index.ts`
- 适用版本：第一版
- 当前状态：有效

### 探测结束或没开 MCP 时插件显示未连接

- 适用范围：日常使用、验收
- 首次发现：2026-09-10
- 最后验证：2026-09-10（探测脚本退出后插件立刻断连；写入 Cursor MCP 后握手恢复）
- 现象：插件能读到文件名和页名，但状态是「未连接」。点「重连」仍失败。
- 根因：WebSocket 桥和 MCP 在同一进程。探测脚本或临时进程退出后端口空了；只开插件、没有客户端拉起 `dist/server/index.js`，同样连不上。
- 正确处理方式：在 Cursor（或其它 Agent）里配置并启用 `figma-bridge` MCP，让该进程一直开着。没有客户端时用 `npm run bridge`，且不要和 MCP 同时开。
- 不要使用的错误方案：指望探测脚本保持常驻；在已有 MCP 占端口时再起一份桥。
- 验证方法：`figma_status` 返回 `connected: true`，插件面板显示「已连接」。
- 相关文件：`scripts/probe.ts`、`scripts/serve-bridge.ts`、`README.md`
- 适用版本：第一版
- 当前状态：有效

### 插件不能从网站 URL 插图，必须先落盘

- 适用范围：写入画布、复刻带摄影的页面
- 首次发现：2026-09-10
- 最后验证：2026-09-10（复刻 Aetherfield Figma Site 时，插件 `networkAccess` 只有 localhost；旧 MCP 进程也没有 `figma_create_image`）
- 现象：`figma_set_fill` 只能铺纯色。网站上的 PNG / SVG 无法直接填进节点。
- 根因：插件主线程不能联网；清单也不允许访问外部域名。图片必须由 Agent 下载到本机，再经 MCP 读文件发给插件。
- 正确处理方式：把资源下到项目目录，调用 `figma_create_image`（`imagePath` 为绝对路径）。改插件或 MCP 代码后，必须重新运行插件，并重启 Cursor 里的 `figma-bridge`，否则新工具不可用。
- 不要使用的错误方案：给插件传 http(s) URL；用色块冒充摄影图却声称已经插图。
- 验证方法：对本机 PNG 调用 `figma_create_image` 后导出画板，预览里能看到原图而不是色块。
- 相关文件：`server/src/mcp.ts`、`plugin/src/commands.ts`、`docs/TECH.md` 第 4.5 节
- 适用版本：第一版（22 个工具）
- 当前状态：有效

### Auto Layout 开启后横排区块会 HUG 变窄

- 适用范围：写入画布、复刻整页
- 首次发现：2026-09-10
- 最后验证：2026-09-10（`Aetherfield / Homepage` `1307:2638` 的 Case / Quote）
- 现象：给 Frame 打开水平 Auto Layout 后，宽度从 1920 收成内容宽（约 1774–1820）。
- 根因：主轴默认 `AUTO`（HUG）。当前会话的 MCP 还不能写 `horizontalSizing: FIXED`。
- 正确处理方式：打开 Auto Layout 后立刻 `figma_update_node` 把宽度写回 1920，使 `primaryAxisSizing` 变成 `FIXED`。MCP 重启后直接传 `horizontalSizing: "FIXED"` 或子项 `FILL`。
- 不要使用的错误方案：以为创建时的 1920 会一直保持。
- 验证方法：读回该节点 `layout.primaryAxisSizing === "FIXED"` 且 `width === 1920`。
- 相关文件：`plugin/src/commands.ts`、`docs/TECH.md` 第 4.5 节
- 适用版本：第一版
- 当前状态：有效

### 纯色填充不能当成已经还原渐变或混合

- 适用范围：写入画布、复刻落地页
- 首次发现：2026-09-10
- 最后验证：2026-09-10（Aetherfield Hero 洗被铺成 `#A8D3FF`；官网是蓝→灰蓝→奶油 SVG 渐变）
- 现象：预览里头部是一块蓝，列表只有标题没有编号和细线，白卡里没有图标。Agent 仍报「节点已创建」。
- 根因：复刻只盘了文案和照片；`figma_set_fill` 只能写纯色，没有渐变和 blendMode。
- 正确处理方式：动手前做图层盘点。渐变 / multiply 先落盘再 `figma_create_image`。列表铬和卡片图标单独写、单独导出对照。
- 不要使用的错误方案：用最接近的纯色冒充渐变；看见标题就当列表已还原。
- 验证方法：导出该区块，能看到渐变过渡、编号、分割线和图标，而不是扁色和纯文字。
- 相关文件：`shared/write-guidelines.ts`、`docs/TECH.md` 第 4.5 节
- 适用版本：第一版（22 个工具）
- 当前状态：有效

### 同一调用里先写 x/y 再设 ABSOLUTE，坐标会被 Auto Layout 吃掉

- 适用范围：写入画布、复刻落地页
- 首次发现：2026-09-10
- 最后验证：2026-09-10（页脚纹理、Journal 贴纸）
- 现象：`figma_update_node` 同时传 `layoutPositioning: ABSOLUTE` 和 `x`/`y`，读回来坐标仍是流式位置。
- 根因：插件先写 x/y，此时节点还在 Auto Layout 流里，父级会忽略或改回坐标，然后再改成绝对定位。
- 正确处理方式：先只设 `ABSOLUTE`，确认后再单独写 `x`/`y`。`figma_move_node` 换父级后也要重新设绝对定位。
- 不要使用的错误方案：以为一次调用里两个字段会按「先绝对、再坐标」生效。
- 验证方法：读回该节点坐标等于目标值，且兄弟节点没有被撑开。
- 相关文件：`plugin/src/commands.ts`（`update_node` 字段顺序）
- 适用版本：第一版
- 当前状态：有效

### 贴了照片仍会漏容器底和描边

- 适用范围：写入画布、复刻落地页
- 首次发现：2026-09-10
- 最后验证：2026-09-10（案例卡官网 `#F6F8FB` 980×320 r=16；仪表盘外包 2px 黑边；底栏 CTA 也是同一灰底）
- 现象：合影和仪表盘都已贴上，但案例区看起来像白底拼图，首屏产品图没有黑框。
- 根因：图层盘点把「底」当成全宽洗，把「图」当成已贴文件。卡片自己的填充、压在图上的 border 没有单独核对。
- 正确处理方式：动手前列出所有非透明 `background-color` 和 `border-width > 0`。容器底用 `figma_set_fill`，描边用 `figma_set_stroke`。有图不等于没有描边。
- 不要使用的错误方案：看见照片就当这块已还原；把页面白底当成卡片也是白的。
- 验证方法：导出该区块，能看到浅灰卡和黑描边，而不是照片直接坐在白底上。
- 相关文件：`shared/write-guidelines.ts`、`docs/TECH.md` 第 4.5 节
- 适用版本：第一版（22 个工具）
- 当前状态：有效

### `figma_set_fill` 的 r/g/b 必须是 0–1

- 适用范围：写入画布
- 首次发现：2026-09-11
- 最后验证：2026-09-11（Nav `#FAFAFC`）
- 现象：传入 `r: 250` 一类 0–255 值时返回 `WRITE_PARTIAL_DENIED`，fills 写不进去。
- 根因：插件把数字原样交给 Figma `SolidPaint.color`，该字段只接受 0–1。
- 正确处理方式：颜色通道除以 255，例如 `#1D1D1F` 写成 `r: 0.114, g: 0.114, b: 0.122`。`a` 才是 0–1 的不透明度。
- 不要使用的错误方案：按 CSS 的 0–255 整数传 `fill`。
- 验证方法：读回 fills 的 `hex` 等于目标色。
- 相关文件：`plugin/src/commands.ts`（`solidPaint`）
- 适用版本：第一版
- 当前状态：有效

### 大图导出后插件会自己关掉

- 适用范围：切图、整页预览
- 首次发现：2026-09-11
- 最后验证：2026-09-11（修复后重导 `1324:2844` 得 1920×5978 PNG 2,021,724 字节；紧接着 `figma_status.connected === true`，`figma_get_current_page` 也成功）
- 现象：整页或大框导出刚成功，Figma 插件面板消失或变成未连接，桥报 `PLUGIN_NOT_CONNECTED`。
- 根因：主线程把每片 256KiB 做成 `Array.from` 的 `number[]`，再在紧循环里 `postMessage`。数十万个 Number 加上不同步让出，会打满插件沙箱或触发看门狗，Figma 直接杀掉插件。`chunkBytes` 的 subarray 若原样发送，还可能把整图 ArrayBuffer 克隆多次。
- 正确处理方式：经 `sendBinaryChunks` 发送独立 `Uint8Array`，片间 `setTimeout(0)`。改完后必须重新运行插件才能加载 `plugin/dist/`。
- 不要使用的错误方案：把分片打成 `number[]`；在主线程紧循环里连发大消息；把整图塞进一条 JSON。
- 验证方法：重新运行插件后导出同一整页，文件完整，且紧接着 `figma_status.connected === true`。
- 相关文件：`plugin/src/bin-transfer.ts`、`plugin/src/code.ts`、`plugin/src/ui.ts`、`docs/TECH.md` 第 3.5 节
- 适用版本：插件 `1.0.1`
- 当前状态：有效

### 空闲约一分钟后桥会把插件误杀

- 适用范围：本机桥、长时间对照官网或写文档后继续改稿
- 首次发现：2026-09-11
- 最后验证：2026-09-11（复现：整页导出后仍连接，空闲数分钟后再写报 `PLUGIN_NOT_CONNECTED`。修复后：`FIGMA_BRIDGE_BOOT=4`，空闲 95s 再查 `figma_status.connected === true`）
- 现象：插件面板仍开着或已经自己变成未连接；空闲一会儿后再调工具立刻失败。
- 根因：服务每 20s `socket.ping()`，先把 `missedPongs += 1`，漏 2 次就 `socket.close()`。Figma 插件 iframe 常常不回 WebSocket `pong`，空闲约 60s 会被当成死连接。
- 正确处理方式：默认 `closeAfterMissedPongs = 0`，只 ping 保活，不因漏 pong 断开。改完必须构建并重启 Cursor 的 `figma-bridge`。
- 不要使用的错误方案：把漏 pong 当成一定断线；空闲后不查 `figma_status` 就继续写；再起一份 `npm run bridge` 抢端口。
- 验证方法：重启 MCP 后插件显示已连接；空闲超过 90s 再调 `figma_status`，`connected` 仍为 `true`。
- 相关文件：`server/src/bridge.ts`、`docs/TECH.md` 第 3.3 节
- 适用版本：第一版（构建进 `dist/server/index.js` 并重启 MCP 后）
- 当前状态：有效

### 过宽的 JPG 不能直接 `figma_create_image`

- 适用范围：写入画布、本机插图
- 首次发现：2026-09-11
- 最后验证：2026-09-11（苹果 Event hero 6016×1092）
- 现象：`figma_create_image` 报 `in createImage: Image is too large`。
- 根因：Figma `createImage` 对单边像素有上限，2x 全宽摄影常超过。
- 正确处理方式：先把图缩到显示尺寸或长边低于约 4096，再导入。
- 不要使用的错误方案：反复用同一张超大原图重试。
- 验证方法：缩小后导入成功，画布上能看到摄影而不是色块。
- 相关文件：`plugin/src/commands.ts`
- 适用版本：第一版
- 当前状态：有效

### Aetherfield 展示页必须在本目录起服务

- 适用范围：本地预览 `repro/aetherfield-site/`
- 首次发现：2026-09-11
- 最后验证：2026-09-11（`http://127.0.0.1:8767/` 能加载相对路径摄影和 SVG）
- 现象：从仓库根目录起 `http.server` 时，页面能打开但 `./dashboard.png` 等资源 404。
- 根因：HTML 里的图和字标都是相对当前目录的路径，不是仓库根路径。
- 正确处理方式：在 `repro/aetherfield-site` 起静态服务；预览口用 `8767`，不要占用小程序页的 `8765`，也不要占用桥的 `17653`。
- 不要使用的错误方案：在仓库根目录起服务；把预览接到 `8765` 或桥端口。
- 验证方法：打开 `http://127.0.0.1:8767/`，Hero 仪表盘、Clarity 织物、页脚 wordmark 都出现。
- 相关文件：`repro/aetherfield-site/index.html`、`README.md`
- 适用版本：复刻预览阶段
- 当前状态：有效
