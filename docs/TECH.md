# 技术文档

本文是本项目的技术规格。实现必须以本文为准。尚未实现的部分按「第一版」描述，不要自行扩大范围。

## 1. 技术目标与约束

### 1.1 要解决的问题

在不购买 Figma 官方 MCP / Dev Mode 会员的前提下，让**任何兼容 MCP 的 Agent**（Cursor、Claude Code、Codex、OpenCode 等）能操作**当前打开的 Figma 桌面端文件**：读取结构与样式、导出切图、写入画布，并据此做像素级代码还原。本项目不绑定某一家客户端，也不使用该客户端的私有扩展。

官方远程 MCP 需要付费席位，且不能稳定绑定「此刻打开的这份文件」。Figma REST API 需要 file key，写入能力弱，也不等于当前画布。因此本项目不走云端 MCP，也不走 REST 拉文件。

### 1.2 成功标准

同时满足以下四条，才算第一版技术目标达成：

1. Agent 能读到当前文件、当前页、当前选区。
2. Agent 能拿到某个节点的 `layout` 数值（坐标、颜色、字体、间距）以及该节点的预览图文件。
3. Agent 能把节点导出为本地 PNG / SVG 文件（切图）。
4. Agent 能在当前页创建、修改、删除基础节点，并再次读回核对。

「像素级」在本项目里是固定数据合同：`layout` 数值 + 本地预览图对照。`JSON_REST_V1` 是可选加深，不是成功标准的必达项。详见第 5 节。

### 1.3 硬约束

| 约束 | 说明 |
| --- | --- |
| 免费 | 不依赖 Figma 付费 MCP、Organization、Enterprise |
| 当前文件 | 只操作插件所在的打开文件，不按 file key 拉远程文件 |
| 当前页 | 第一版默认只碰 `figma.currentPage`。不调用 `loadAllPagesAsync()`。切页必须走 `figma_set_current_page`（内部 `loadAsync`） |
| 桌面端 | 必须使用 Figma Desktop；网页版到本机 WebSocket 不稳定，第一版不支持 |
| 插件常开 | 插件面板关闭即断连；除 `figma_status` 外，工具必须**立即**返回未连接错误 |
| 本机环回 | WebSocket 只绑定 `127.0.0.1` |
| 单会话 | 同一时刻只服务一个已连接插件；新连接替换旧连接 |
| 薄而全 | 读、切图、写三类都有；当前固定 **23** 个工具，不对齐即时设计 MCP 全量 |

### 1.4 技术栈

| 部分 | 选择 |
| --- | --- |
| 语言 | TypeScript |
| 工程 | 单一 `package.json`，两个构建入口（server / plugin） |
| 包管理 | npm（实现时生成 lockfile） |
| 对 Agent 的接口 | 标准 MCP。第一版只做 **stdio** |
| MCP SDK | `@modelcontextprotocol/sdk` |
| 桥 | `ws`，`ws://127.0.0.1:<port>` |
| 插件构建 | `esbuild` 打出 `code.js` 与 UI |
| 运行时 | Node.js 20+ |

不引入 Cloudflare、OAuth、远程托管、pnpm workspace。第一版没有服务端部署。

## 2. 架构与模块

### 2.1 总览

```text
任意 MCP 客户端（Cursor / Claude Code / Codex / …）
    │  标准 MCP / stdio
    ▼
server/          MCP 工具 + WebSocket 服务（同一进程）
    │  ws://127.0.0.1:17653
    ▼
plugin UI        iframe，允许联网
    │  postMessage（大二进制必须分片）
    ▼
plugin code      figma.* API（主线程，不直接联网）
    ▼
当前打开的 Figma 文件
```

Figma 插件主线程不能稳定访问本机网络。所有跨进程通信必须由 UI iframe 发起 WebSocket，再 `postMessage` 给主线程执行 `figma.*`。

### 2.2 为什么 MCP 和 WebSocket 放在同一进程

开源方案常见「先起 socket，再起 MCP」两步启动。本项目把两者放进 `server/` 一个进程：

- 任意 MCP 客户端按标准方式拉起本服务时，桥自动监听。
- 插件只需连默认端口，不必先手动起第二个服务。
- 进程退出则桥退出，避免残留端口。

第一版 **stdio 是唯一对外传输**。不实现 Cursor 专有协议，不实现云端 MCP，不把工具写进某个编辑器的插件里。客户端只要能配置「命令 + 参数」启动一个 MCP stdio 进程即可。

端口被占用时（通常是另一个 Agent 已经拉起了本服务）：本进程必须失败并打出中文说明，**禁止**再绑一个端口或静默连错桥。第一版不支持两个 MCP 进程同时为两个 Agent 服务。换 Agent 用时，关掉前一个客户端（或其 MCP）再开后一个。

同一客户端重启 MCP 时，旧进程可能还没放开端口。新进程可以在约 2 秒内重试绑定；超时后仍占用则按上面的规则失败。stdin 被关掉时必须立刻关闭 WebSocket 并退出，不能靠事件循环把桥留成孤儿进程。

开发期可用 `npx tsx server/src/index.ts`。端口由环境变量 `FIGMA_BRIDGE_PORT` 覆盖，默认 `17653`。不要占用官方桌面 MCP 的 `3845`，也不要默认使用社区方案常用的 `3055`。

### 2.2.1 各客户端怎么配

用户向的逐步安装（环境、导入插件、Cursor / Claude Code、排错）以仓库根目录 `README.md` 的「安装教程」为准。此处只保留配置要点。

入口文件以实现时的构建产物为准，下面用 `dist/server/index.js` 举例。路径换成本机绝对路径。

通用 JSON（Cursor、Cline、许多编辑器的 `mcp.json`）：

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "node",
      "args": ["/Users/lichao/Documents/Dev-project/Figma设计桥接/dist/server/index.js"]
    }
  }
}
```

Claude Code：

```bash
claude mcp add --transport stdio figma-bridge -- node "/Users/lichao/Documents/Dev-project/Figma设计桥接/dist/server/index.js"
```

Codex / OpenCode 等：按其 MCP 配置写同样的 `command` + `args`，不要改工具名协议。若某客户端只支持 HTTP MCP、不支持 stdio，第一版不覆盖，列入后续（本机 Streamable HTTP），不要为此改插件协议。

### 2.3 目录（实现时按此创建）

```text
Figma设计桥接/
  package.json
  plugin/
    manifest.json
    src/code.ts          # 主线程，执行 figma.*
    src/ui.html
    src/ui.ts            # WebSocket 客户端、分片重组
  server/
    src/index.ts         # 启动 MCP + WebSocket
    src/mcp.ts           # 工具、instructions、资源注册
    src/bridge.ts        # 连接、超时、单会话
    src/tools/           # 各工具的参数校验与转发
  shared/
    protocol.ts          # 请求/响应类型，插件与服务共用
    node-schema.ts       # 像素级节点字段
    write-guidelines.ts  # MCP instructions 与写入原则资源正文
  docs/TECH.md           # 本文
```

`shared/` 由 plugin 与 server 共同引用，禁止两边各写一套消息类型。

### 2.4 模块职责

| 模块 | 职责 | 不做 |
| --- | --- | --- |
| `server/mcp.ts` | 握手带写入原则；把 MCP 工具映射为桥请求；把结果写成 MCP content | 不直接调用 Figma |
| `server/bridge.ts` | 维护唯一插件连接、请求 id、超时、心跳 | 不解释设计语义 |
| `plugin/ui.ts` | 连上、重连、收发 JSON、分片、显示状态 | 不调用 `figma.*` |
| `plugin/code.ts` | 执行读、导出、写；序列化节点 | 不发起网络 |

### 2.5 插件 UI

只显示：连接状态、当前文件名、当前页名、端口、最后错误、重连按钮。不提供设计编辑界面。插件运行时必须保持面板打开。

### 2.6 `manifest.json` 必填项

第一版只做开发模式导入，`editorType` 仅为 `figma`。

```json
{
  "name": "Figma设计桥接",
  "id": "figma-design-bridge-local",
  "api": "1.0.0",
  "editorType": ["figma"],
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "documentAccess": "dynamic-page",
  "networkAccess": {
    "allowedDomains": ["none"],
    "devAllowedDomains": [
      "http://localhost:17653",
      "ws://localhost:17653"
    ]
  }
}
```

`documentAccess: dynamic-page` 是新插件必填。因此：

- 读当前页内容前，若页未加载，先 `await figma.currentPage.loadAsync()`。
- 列出页面名称和 id 可以遍历 `figma.root.children`，但**不要**在未 `loadAsync` 时读其它页的子节点。
- 禁止为了图省事调用 `figma.loadAllPagesAsync()`。
- 按 id 查找节点使用 `figma.getNodeByIdAsync`，不要用已废弃的同步 `getNodeById`。

Figma 清单校验不接受 `ws://127.0.0.1:端口`（会报不是合法 URL）。开发期必须写 `localhost`。插件 UI 也连 `ws://localhost:17653`。服务仍只绑回环地址（`127.0.0.1` 与 `::1`），不绑 `0.0.0.0`。

若以后改为正式发布的插件，再把 `ws://localhost:17653` 移入 `allowedDomains` 并补 `reasoning`。第一版只走开发导入。

## 3. 桥协议

版本号：`1`。不兼容变更必须升版本，旧插件连上后要被拒绝并提示升级。

### 3.1 帧格式

控制消息全部为 JSON 文本帧，一条消息一个 JSON 对象。导出二进制不得单帧塞进 JSON；见 3.5。

请求（服务 → 插件）：

```json
{
  "v": 1,
  "id": "uuid",
  "kind": "req",
  "method": "get_selection",
  "params": {}
}
```

成功响应：

```json
{
  "v": 1,
  "id": "uuid",
  "kind": "res",
  "ok": true,
  "result": {}
}
```

失败响应：

```json
{
  "v": 1,
  "id": "uuid",
  "kind": "res",
  "ok": false,
  "error": {
    "code": "NODE_NOT_FOUND",
    "message": "找不到节点 12:34"
  }
}
```

事件（双向，无 id）：

```json
{
  "v": 1,
  "kind": "event",
  "name": "hello",
  "payload": {}
}
```

第一版 MCP 不把事件推给 Agent。事件只用于握手和诊断。

### 3.2 握手

1. 插件 UI 连接 `ws://localhost:17653`。
2. 插件发事件 `hello`：`protocol`、`pluginVersion`、`fileName`（`figma.root.name`）、`currentPageName`、`currentPageId`。
3. 服务校验 `protocol === 1`。不匹配则发 `hello_nack`（`PROTOCOL_MISMATCH`）并断开。
4. 服务若已有连接，断开旧连接，接受新连接。
5. 服务发 `hello_ack`：`protocol`、`port`。
6. 未完成握手的连接上，工具调用一律立即失败。

### 3.3 超时与心跳

| 类型 | 默认 | 说明 |
| --- | --- | --- |
| 普通读写 | 15s | 从出队到响应；超时返回 `TIMEOUT` |
| 导出 / 像素级读取 | 60s | 大框截图和 REST JSON 可能较慢 |
| 心跳 | 20s | 使用 WebSocket 协议层 `ping` 保活。默认不因漏 `pong` 断开（`closeAfterMissedPongs = 0`）。Figma 插件 iframe 常常不回 pong，按漏 pong 关连接会把空闲约 1 分钟的会话误杀 |

并发：第一版对插件命令**串行排队**。MCP 可以同时收到多个工具调用，发往插件时必须按入队顺序一个一个等响应。

排队本身也计入超时：从入队起算。避免队列堵死时 Agent 无限等。

### 3.4 方法名

桥方法名与 MCP 工具名去掉 `figma_` 前缀后一致。例如 MCP `figma_get_selection` → 桥 `get_selection`。例外：`figma_status` 只查服务端连接状态，不进插件。

### 3.5 大二进制分片

`exportAsync` 的图片和 `JSON_REST_V1` 字节可能很大。第一版一律按片传输，避免 `postMessage` 或单条 JSON 过大失败，也不得把整图打进一条 JSON。

约定：

- 主线程把 `Uint8Array` 按 **256 KiB** 切片；每片先拷成独立 ArrayBuffer，再 postMessage **TypedArray** 到 UI：`{ id, index, total, bytes }`。禁止 `Array.from` 打成 `number[]`，片与片之间必须让出事件循环。
- UI 把收到的 TypedArray（兼容旧的 `number[]`）转成 base64，经 WebSocket 发到服务端。WS 上同样按片发送，最后由服务端拼好再写盘。
- 解码后体积超过 **20 MiB**：停止传输，返回 `PAYLOAD_TOO_LARGE`，提示降低 `scale` 或改导出 SVG。
- 第一版仍用 JSON 承载每片的 base64。片小，避免单帧过大。不要改用未约定的二进制帧，以免两端各写一套。

## 4. MCP 工具

前缀统一为 `figma_`。参数多余字段拒绝（`additionalProperties: false`）。当前工具清单以此节为准，共 23 个。

### 4.0 给 Agent 的说明与资源

别的 Agent 看不到本仓库的 `AGENTS.md` / `CONTEXT.md`。跨稿写入原则必须挂在 MCP 表面上：

| 通道 | 内容 | 用途 |
| --- | --- | --- |
| 握手 `instructions` | `shared/write-guidelines.ts` 的 `MCP_INSTRUCTIONS` | 客户端通常会自动注入，Agent 不必先调工具 |
| 资源 `figma://write-guidelines` | 同文件的 `WRITE_GUIDELINES` | 完整说明；需要展开时再读 |
| 相关工具描述 | `figma_create_frame` / `figma_set_auto_layout` / `figma_create_image` / `figma_set_fill` 的短提醒 | 动手时再强调一次 |

原则只写跨稿稳定写法：图文关系、图层盘点（底/容器底/描边/列表铬/饰件）、嵌套 Auto Layout、按钮 Frame、本机插图、纯色不能代替渐变或混合、`clear` 去底、指定字体不替换、导出对照、字压图落在留白、背景摄影 `scaleMode: FILL`、核对照片构图、目录列齐全。某一页的坐标、色值和构图量测不要写进 `instructions` 或该资源。握手短说明现为 16 条。

不单独提供「请先读原则」工具。多数 Agent 不会主动调用。

改原则后要进正在跑的客户端，必须三步都做：改 `shared/write-guidelines.ts` → `npm test` 且 `npm run build` → 重启该客户端的 `figma-bridge` MCP（可改 `FIGMA_BRIDGE_BOOT` 触发）。只改源码或只构建，旧进程仍会握手旧条文。不要另起一份 `npm run bridge`。

### 4.1 连接与导航

| 工具 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `figma_status` | 无 | `connected`、`fileName`、`pageName`、`pageId`、`protocol` | 未连接也要成功返回，供 Agent 自检 |
| `figma_get_document_info` | 无 | 文件名、页列表（id/name）、当前页 id | 不含整棵文档树，不加载其它页内容 |
| `figma_get_current_page` | 无 | 页 id/name、顶层子节点摘要、选区摘要 | 子节点只含 id/name/type/size |
| `figma_set_current_page` | `pageId` | 新页的 `get_current_page` 形状 | 先 `loadAsync` 再切换；切走后选区可能为空 |
| `figma_get_selection` | 无 | 选中节点摘要列表；无选区时 `nodes: []` | 不要把空选区当错误 |

### 4.2 读取（像素级）

| 工具 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `figma_get_node` | `nodeId`；`detail`=`summary` \| `layout` \| `rest_json`，默认 `layout`；`maxDepth` 默认 2，最大 10 | 见第 5 节 | 单节点，可带有限深度子树 |
| `figma_get_node_tree` | `nodeId`；`maxDepth` 默认 3，最大 10 | `layout` 级树 | 浏览结构用，不要默认 `rest_json` |
| `figma_read_for_implement` | `nodeId?`（默认当前选区，且必须恰好 1 个）；`outputDir` 必填 | 见 4.4 | 像素级还原的主入口 |

`detail` 三级：

- `summary`：id、name、type、宽高、子节点数。
- `layout`：summary + 第 5.1 节字段。给 Agent 做布局还原，控制 token。
- `rest_json`：该节点 `exportAsync({ format: "JSON_REST_V1" })` 的解析结果。字段最全，体积最大。只在明确需要时使用。

若运行时不支持 `JSON_REST_V1`：

- `figma_get_node({ detail: "rest_json" })` **必须失败**，错误码 `UNSUPPORTED_EXPORT_FORMAT`。不要改返回 `layout` 充数。
- `figma_read_for_implement` **不写** `rest.json`，在 `meta.warnings` 写明，其它文件照常。这是唯一允许的降级。

### 4.3 切图

| 工具 | 参数 | 返回 |
| --- | --- | --- |
| `figma_export_node` | `nodeId`；`format`=`PNG` \| `JPG` \| `SVG` \| `PDF`，默认 `PNG`；`scale` 默认 `2`，必须 `> 0`；`outputPath` 必填 | 写入后的绝对路径、宽高、字节数、format、scale |

第一版**禁止**把切图以 base64 放进 MCP 返回值。大图在对话通道里会被截断或损坏，无法做视觉核对。需要看图时，把文件写到 `outputPath`，再让 Agent 用读文件/看图能力打开该路径。

`outputPath` / `outputDir` 必须是本地绝对路径。服务端负责创建父目录。规范化规则：

- 使用解析后的绝对路径，拒绝相对路径。
- 拒绝路径等于 `/` 或用户家目录本身。
- 拒绝前缀为 `/etc`、`/usr`、`/bin`、`/sbin`、`/System`、`/private`、`/dev`、`/proc` 的路径。
- 允许 `/tmp`、项目目录、以及用户主目录**之下**的普通文件夹。

### 4.4 `figma_read_for_implement`

这是像素级还原的复合工具，一次完成「结构 + 截图 + 位图资源」，避免 Agent 漏步骤。

输入：

- `nodeId` 可选。省略时使用当前选区；选区不是恰好 1 个节点则失败，错误码 `SELECTION_INVALID`。
- `outputDir` 必填。例如 `/tmp/figma-bridge/home-frame`。

输出目录约定：

```text
<outputDir>/
  node.json          # layout 级树，每个节点含 boundsInRoot
  rest.json          # 仅根节点 JSON_REST_V1；不支持则不写此文件
  preview.png        # 根节点 PNG，scale=2
  assets/
    <imageHash>.png  # 该子树里 IMAGE fill 用到的位图
  meta.json          # 节点 id、名称、类型、尺寸、导出清单、警告
```

`meta.json` 必须列出：根节点宽高、遍历到的节点数、是否因 `maxDepth` 截断、缺失字体、是否写出 `rest.json`。Agent 应先读 `meta.json` 和 `preview.png`，再按需读 `node.json` / `rest.json`。

深度上限 10。遍历节点数超过 300 时仍导出，但 `meta.warnings` 必须包含 `LARGE_TREE`。

位图资源用 `figma.getImageByHashAsync` 取字节。某个 hash 取失败时跳过该文件，写入 `meta.warnings`，不要让整个工具失败。

### 4.5 写入

| 工具 | 必要参数 | 可改属性 |
| --- | --- | --- |
| `figma_create_frame` | `x`、`y`、`width`、`height`；`name?`、`parentId?` | 默认放当前页 |
| `figma_create_rectangle` | 同上 | 可带 `fill`、`cornerRadius` |
| `figma_create_ellipse` | 同矩形 | 可带 `fill` |
| `figma_create_text` | `characters`、`x`、`y`；`parentId?` | `fontSize`、`fontName`、`fill` |
| `figma_create_image` | `imagePath`、`x`、`y`、`width`、`height`；`parentId?`、`name?`、`cornerRadius?`、`scaleMode?` | 本机 PNG / JPG / WEBP / GIF / SVG。插件不能联网，禁止传 URL |
| `figma_update_node` | `nodeId` | `name`、`x`、`y`、`width`、`height`、`visible`、`opacity`、`rotation`、`horizontalSizing`、`verticalSizing`、`layoutPositioning` |
| `figma_set_fill` | `nodeId`；`fill` 或 `clear` | 单层纯色；`clear: true` 去掉填充。第一版不写渐变或混合模式；渐变 / multiply 落成本机 SVG 或 PNG 再走 `figma_create_image` |
| `figma_set_stroke` | `nodeId`、`color`、`weight` | 单层实线 |
| `figma_set_effects` | `nodeId`；`effects` 或 `clear` | `BACKGROUND_BLUR` / `LAYER_BLUR` / `DROP_SHADOW` / `INNER_SHADOW`。毛玻璃：半透明填充 + 背景模糊 |
| `figma_set_corner_radius` | `nodeId`、`radius` 或四角 | 四角独立优先 |
| `figma_set_text_style` | `nodeId` | `fontSize`、`fontName`、`lineHeight`、`letterSpacing`、`textAlignHorizontal`、`characters` |
| `figma_set_auto_layout` | `nodeId` | `layoutMode`、`padding`、`itemSpacing`、主轴/交叉轴对齐、`horizontalSizing`、`verticalSizing` |
| `figma_move_node` | `nodeId`、`x`、`y`；`parentId?`、`index?` | 跨父级时用 `parentId` |
| `figma_delete_node` | `nodeId` | 不可撤销；禁止删除 `PAGE` / `DOCUMENT` |

`parentId` 必须是当前已加载页里能容纳子节点的节点（PAGE / FRAME / GROUP / SECTION / COMPONENT）。否则 `UNSUPPORTED_NODE_TYPE`。

写入成功后统一返回该节点的 `layout` 摘要（不含深子树，`maxDepth=0`），便于 Agent 立刻核对坐标。不要只返回 `{ ok: true }`。

创建或改文本前必须 `figma.loadFontAsync`。指定了 `fontName` 且加载失败：返回 `FONT_NOT_AVAILABLE`，附带当前文件里已有的字体名最多 10 个，**不要改用别的字体**。未指定 `fontName` 时：先试 Inter Regular，再试 Roboto Regular；仍失败则报错。使用了默认字体时，在返回的 `warnings` 写明实际字体。

`horizontalSizing` / `verticalSizing` 为 `FIXED` | `HUG` | `FILL`。`layoutPositioning` 为 `AUTO` | `ABSOLUTE`，只对 Auto Layout 子项有效；压图、印章等重叠用绝对定位，其余用流式布局。同一调用里先写 `x`/`y` 再设 `ABSOLUTE` 时，坐标会被流式布局吃掉；必须先设绝对定位，再单独写坐标。

第一版不写：组件、变体、实例属性、样式库、变量、原型交互、布尔运算、矢量编辑、从远程 URL 插图。本地图片走 `figma_create_image`。

## 5. 像素级数据合同

Agent 做像素级还原时，以本节字段为准，而不是插件内部的 SceneNode 原始对象。

### 5.1 `layout` 节点

每个节点固定包含：

```ts
interface LayoutNode {
  id: string
  name: string
  type: string
  visible: boolean
  opacity: number
  rotation: number
  /** 相对父节点 */
  x: number
  y: number
  width: number
  height: number
  /** 相对本次请求的根节点；根节点为 {0,0,width,height} */
  boundsInRoot: Box
  /** 相对当前页，来自 absoluteBoundingBox */
  absoluteBox: Box
  /** 来自 absoluteRenderBounds；没有则为 null */
  renderBoundsInRoot: Box | null
  fills: Paint[]
  strokes: Paint[]
  strokeWeight: number | null
  effects: Effect[]
  cornerRadius: number | [number, number, number, number] | null
  constraints: { horizontal: string; vertical: string } | null
  layout: AutoLayout | null
  layoutChild: LayoutChild | null
  text: TextStyle | null
  component: { id: string; name: string } | null
  imageHashes: string[]
  children?: LayoutNode[]
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}
```

数值全部用 Figma 的逻辑像素。Figma 给的是整数就写整数，是小数就保留小数，禁止统一四舍五入。

`boundsInRoot` 是给代码还原用的主坐标。插件必须计算并写入：用根节点与当前节点的 `absoluteBoundingBox` 相减。禁止留给模型自己减。

第一版 `boundsInRoot` **按轴对齐包围盒计算**。若该节点或祖先 `rotation !== 0`，仍给出该值，但必须在该节点加 `warnings: ["ROTATED_BOUNDS_APPROX"]`（可只在 meta 汇总）。不要假装旋转后的坐标已经精确到变换矩阵。

实例节点的 `component` 使用 `getMainComponentAsync()`。取不到则 `component: null`，不要失败整棵树。

### 5.2 颜色与填充

所有颜色同时给出三种形式：

```ts
interface Color {
  r: number // 0–1
  g: number
  b: number
  a: number
  hex: string // #RRGGBB，不含 alpha
  css: string // rgba(r8,g8,b8,a)
}
```

`hex` 的 RGB 按 0–255 四舍五入。`css` 的 RGB 为 0–255 整数，alpha 最多 3 位小数。

```ts
interface Paint {
  type: "SOLID" | "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND" | "IMAGE" | "VIDEO" | string
  visible: boolean
  opacity: number
  color?: Color
  imageHash?: string
}
```

第一版 `layout` 对 `SOLID` 写全 `color`；对其它 type 保留 `type` / `visible` / `opacity`，图片再加 `imageHash`。完整渐变 stop 只出现在 `rest_json`。图片 fill 的 hash 必须进入该节点 `imageHashes`。

### 5.3 文本

```ts
interface TextStyle {
  characters: string
  fontFamily: string
  fontStyle: string
  fontSize: number
  fontWeight: number | null
  lineHeight: { unit: "AUTO" | "PIXELS" | "PERCENT"; value: number | null }
  letterSpacing: { unit: "PIXELS" | "PERCENT"; value: number }
  textAlignHorizontal: string
  textAlignVertical: string
  textAutoResize: string
  truncated?: boolean
}
```

第一版只导出**节点级 / 第一段**样式。分段样式不进 `layout`；需要分段时用 `rest_json`。`characters` 超过 4000 字时截断，并设 `truncated: true`。

### 5.4 Auto Layout 与子项

```ts
interface AutoLayout {
  mode: "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID"
  padding: { top: number; right: number; bottom: number; left: number }
  itemSpacing: number
  primaryAxisAlign: string
  counterAxisAlign: string
  primaryAxisSizing: string
  counterAxisSizing: string
  layoutWrap: string | null
}

interface LayoutChild {
  layoutAlign: string
  layoutGrow: number
  horizontalSizing: string | null
  verticalSizing: string | null
  minWidth: number | null
  maxWidth: number | null
  minHeight: number | null
  maxHeight: number | null
}
```

`layout === null` 或 `mode === "NONE"` 表示不是 Auto Layout 容器，子节点用相对 `x/y`。  
`layoutChild` 是该节点相对**父容器**的约束；根节点为 `null`。

### 5.5 效果

完整序列化 `DROP_SHADOW` / `INNER_SHADOW`（offset、radius、spread、color、visible）以及 `BACKGROUND_BLUR` / `LAYER_BLUR`（radius、visible）。其它 effect 只保留 `{ type, visible }`。写入走 `figma_set_effects`。

### 5.6 坐标系

- 子节点 `x/y`：相对父节点。
- `absoluteBox`：相对当前页。
- `boundsInRoot`：相对本次读取的根节点。
- 还原到代码时，根节点对应容器 `(0, 0, width, height)`。
- 根节点是 Auto Layout：优先按 Auto Layout + `layoutChild` 还原，不要把每个子节点写成绝对定位。
- 根节点不是 Auto Layout：子节点用 `boundsInRoot` 或父级相对坐标。两种策略不要在同一层混用。

### 5.7 建议的 Agent 读取顺序

1. `figma_status`：确认已连接。
2. `figma_get_selection` 或 `figma_get_current_page`：确定目标框。
3. `figma_read_for_implement`：落盘 `preview.png` + `node.json`。
4. 看 `preview.png`，再读 `node.json` 对数值。
5. 需要图标/插图时，对对应节点再调 `figma_export_node`，或使用 `assets/`。
6. 写入后用 `figma_get_node` 读回，或再导出一张图对照。

## 6. 数据流

### 6.1 读

1. Agent 调用 MCP 工具。
2. `mcp.ts` 校验参数。未连接则立即 `PLUGIN_NOT_CONNECTED`（`figma_status` 除外）。
3. `bridge.ts` 生成 id，入队，发 WebSocket。
4. UI 收到后 `postMessage` 给主线程。
5. 主线程读 SceneNode，序列化为 `layout`，或 `exportAsync` / `getImageByHashAsync`。
6. 大字节按 3.5 分片到 UI，再到服务端；服务端写盘。MCP 只回路径与元数据。
7. 响应按 id 配对；超时后丢弃迟到响应，不得再写入该次 MCP 结果。

插件到服务端的分片 base64 是桥的内部实现。MCP 对 Agent 的返回值不得再带这些字节。

### 6.2 写

与读取相同排队。主线程改节点后，再序列化 `layout` 摘要返回。

单工具失败时的处理（第一版能做到的上限）：

- **创建类**：若节点已创建但后续属性失败，删除这个新节点再报错。
- **更新类**：Figma API 往往当场生效，第一版**不保证回滚**。必须在错误里列出 `applied` 与 `failed` 字段。不要声称「更新失败则文档不变」。
- 没有跨工具事务。

### 6.3 错误码

| 码 | 何时 |
| --- | --- |
| `PLUGIN_NOT_CONNECTED` | 无握手成功的插件 |
| `PROTOCOL_MISMATCH` | 插件协议版本不等于 1 |
| `TIMEOUT` | 从入队起超过时限 |
| `NODE_NOT_FOUND` | id 在当前已加载页不存在 |
| `SELECTION_INVALID` | 需要恰好 1 个选区却不是 |
| `INVALID_ARGS` | schema 失败或路径非法 |
| `UNSUPPORTED_NODE_TYPE` | 对该类型做了不支持的操作 |
| `UNSUPPORTED_EXPORT_FORMAT` | 例如没有 `JSON_REST_V1` |
| `FONT_NOT_AVAILABLE` | 字体加载失败 |
| `EXPORT_FAILED` | `exportAsync` 失败 |
| `PAYLOAD_TOO_LARGE` | 导出超过 20 MiB |
| `WRITE_PARTIAL_DENIED` | 实例内部等只读属性无法设置 |
| `IO_FAILED` | 本地写文件失败 |

`message` 用中文，写明节点 id 或路径。MCP 的 `isError: true` 必须设置。

## 7. 安全与隐私

- 监听地址固定 `127.0.0.1`，禁止 `0.0.0.0`。
- 第一版无鉴权。同一台机器上的其他进程可以连接该端口并操作当前 Figma 文件。这是明确接受的风险；需要时再加共享令牌。
- 不把设计文件上传到除用户当前 Agent 对话之外的第三方。本服务不发起外网请求。
- 路径规则见 4.3。
- 不在日志里打印完整 `characters`、完整 REST JSON、切图 base64。
- 插件不申请与当前文件无关的权限。`manifest.json` 按 2.6。

## 8. 本地开发与测试

### 8.1 开发步骤（实现完成后）

逐步说明见 `README.md` 安装教程。开发时的最短路径：

1. `npm install`
2. `npm run build`：打 server 与 plugin
3. Figma Desktop → Plugins → Development → Import plugin from manifest → 选择 `plugin/manifest.json`
4. 打开目标文件，运行插件，确认「已连接」
5. 任意客户端配好本 MCP 后，先调 `figma_status`

### 8.2 测试分层

| 层 | 内容 | 环境 |
| --- | --- | --- |
| 协议单测 | 编码/解码、版本拒绝、超时、排队顺序、分片重组 | Node |
| 序列化单测 | 用固定 fixture 测颜色、boundsInRoot、文本截断、旋转标记 | Node |
| 路径单测 | 非法 outputPath、系统目录、目录创建 | Node |
| 插件命令 | 对 `figma` 做 mock，测参数与错误码 | Node |
| 手工验收 | 真实桌面端：读选区、切图落盘、画矩形、改文字 | Figma Desktop |

第一版不要求在 CI 里启动 Figma。没有桌面端的自动化不能代替第 1.2 节的四条成功标准。

### 8.3 手工验收清单

1. 未开插件时，`figma_status.connected === false`，其它工具立即返回 `PLUGIN_NOT_CONNECTED`。
2. 打开插件后，`figma_status` 出现文件名与页名。
3. 选中一个 Frame，`figma_get_selection` 返回该 id。
4. `figma_read_for_implement` 在 `outputDir` 生成 `preview.png` 与 `node.json`；图与画布观感一致；根节点 `boundsInRoot` 为 `(0,0,width,height)`。
5. `figma_export_node` 写出 SVG/PNG，文件非空，MCP 结果里没有 base64 图。
6. `figma_create_rectangle` 后画布出现矩形，返回的 x/y/width/height 与请求一致。
7. `figma_create_text` 在指定缺失字体时失败，不静默换字体。
8. 关掉插件后再调用写入/读取，必须立即失败，不能拖到超时。
9. 未启动 MCP 时，插件 UI 显示未连接，提供重连，不得显示已连接。
10. 再启动第二个本服务进程时，短重试后仍占用则必须失败，并提示先关掉另一个 Agent 的 MCP。禁止换端口启动。

## 9. 部署与回滚

第一版只有本机。没有远程部署。

回滚指：回到用户确认过的 Git commit / tag，重新 `npm run build`，再在 Figma 里重新导入插件。源码回退不等于 Figma 仍在运行旧插件。

当前目录还不是 Git 仓库，没有可回退快照。实现开始前应先由用户决定是否建 Git。未经授权不执行 `git init`。

## 10. 第一版明确不做

- 官方 Figma MCP / REST 拉文件 / OAuth
- 绑定某一家 Agent 客户端，或使用其私有扩展
- 第一版本机 HTTP / SSE MCP（只做 stdio）
- 两个 MCP 进程同时占桥
- 网页版 Figma
- 组件库、变体、Variables、样式发布
- 多文件、多插件并行会话
- 把切图 base64 回传给模型
- 远程云桥、Cloudflare Worker
- 对齐即时设计 MCP 的全部工具
- 在插件里做可视化设计编辑器
- 自动加载全部页面
- 旋转节点的精确矩阵坐标

## 11. 实现顺序

按这个顺序写代码，中途不插入第 10 节的内容：

1. `shared/protocol.ts` + 协议与分片单测
2. `server/bridge.ts`：监听、握手、排队、超时
3. `plugin`：连接 UI、hello、状态显示
4. 只读：`status` / `document` / `page` / `set_current_page` / `selection`
5. `get_node` / `get_node_tree` 的 `layout` 序列化
6. `export_node` 分片落盘
7. `read_for_implement`
8. 写入最小集：create / update / fill / text / delete
9. `set_auto_layout` / `move_node` / stroke / radius
10. 按 8.3 做桌面端验收

## 12. 已知技术风险

| 风险 | 处理 |
| --- | --- |
| `JSON_REST_V1` 在部分 Figma 版本不可用 | `rest.json` 可选；`layout` 必达 |
| 大框字节撑爆 postMessage / 对话 | 分片 + 落盘；MCP 不回传图 |
| 插件主线程不能联网 | 只让 UI 连 WebSocket |
| `dynamic-page` 未 load 就读子节点会抛错 | 当前页 `loadAsync`；不加载全文件 |
| 文本改字必须先加载字体 | 见 4.5 |
| 实例内部部分属性只读 | `WRITE_PARTIAL_DENIED`，列出字段 |
| 更新类工具难以回滚 | 不承诺回滚，见 6.2 |
| 本机无鉴权 | 只绑 loopback |
| Agent 未启动 MCP 时插件连不上 | UI 显示未连接并允许重连 |
| 两个客户端同时拉起本服务 | 第二份必须因端口占用失败，见 2.2 |
