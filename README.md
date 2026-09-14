# Figma-MCP

本机 Figma 插件 + 标准 MCP。不经过官方付费 MCP，让 Cursor、Claude Code、Codex、OpenCode 等 Agent 读写**当前打开的 Figma 桌面端文件**，并按精确数值和预览图做像素级还原。不绑定某一家客户端。

开源仓库名是 **Figma-MCP**。Figma 里导入后，开发插件仍显示为「Figma设计桥接」。Agent 配置里的服务名建议继续用 `figma-bridge`。本仓库使用 MIT 许可。

## 可实现

- 读取当前文件、当前页、选区和节点结构。
- 把节点切成本地 PNG / SVG 等文件。
- 在当前画布创建和修改基础节点。
- 用固定的 `layout` 数据合同支持像素级实现。


## 安装教程

整套东西分三块，缺一块都连不上：

1. 本仓库构建出 `dist/server/index.js`（MCP + 本机 WebSocket 桥，同一进程）。
2. Figma **桌面端**导入并运行开发插件「Figma设计桥接」，面板保持打开。
3. Cursor / Claude Code 等客户端用 **stdio** 拉起上面的 Node 进程。

插件只连本机，不连 Figma 云端 MCP，也不支持网页版 Figma。同一时间只能有一个 MCP 进程占桥，默认 `127.0.0.1:17653`。

下面命令里的 `/绝对路径/Figma-MCP` 请换成你本机仓库目录。macOS / Linux 用正斜杠；Windows 建议同样写成正斜杠，例如 `C:/Users/你/Figma-MCP`。

### 1. 准备环境

| 项 | 要求 |
| --- | --- |
| 系统 | macOS、Windows 或 Linux。插件必须在 **Figma Desktop** 里跑。 |
| Node.js | **20 或更高**。终端执行 `node -v` 确认。 |
| npm | 随 Node 一起安装即可。本仓库用 npm，不用 pnpm / yarn。 |
| Figma | 安装 [Figma 桌面端](https://www.figma.com/downloads/)，用能打开目标文件的账号登录。网页版不要用来接本桥。 |
| Agent | 任意能配置「命令 + 参数」拉起 **stdio MCP** 的客户端。第一版不提供 HTTP / SSE MCP。 |

官方 Figma MCP / Dev Mode 会员不是前置条件。本项目就是为了不走那条付费通道。

### 2. 拿到代码并构建

```bash
git clone https://github.com/huaer9000/Figma-MCP.git
cd Figma-MCP
npm install
npm run build
```

如果你已经把代码放在别的目录，把下面出现的 `/绝对路径/Figma-MCP` 换成实际路径即可。

构建成功后必须能看到这两个产物，缺了后面一定连不上：

- `dist/server/index.js`：给 Agent 启动的 MCP 入口
- `plugin/dist/code.js` 与 `plugin/dist/ui.html`：给 Figma 加载的插件

可选自检：

```bash
npm test
```

改过 TypeScript 源码、写入原则或插件之后，都要重新 `npm run build`。只改源码、不构建，正在跑的进程和 Figma 里的插件都还是旧的。

### 3. 在 Figma 桌面端导入开发插件

必须先完成上一步构建。导入的是清单，不是某个 `.js` 单文件。

1. 打开 **Figma Desktop**（不要用浏览器里的 Figma）。
2. 打开你要操作的那份设计文件。
3. 菜单按界面语言二选一：
   - 中文：**插件 → 开发 → 从清单导入插件…**
   - 英文：**Plugins → Development → Import plugin from manifest…**
4. 选中本仓库里的 `plugin/manifest.json`（就是这一份，不要选 `plugin/dist/` 下的文件）。
5. 导入成功后，再运行一次插件：
   - 中文：**插件 → 开发 → Figma设计桥接**
   - 英文：**Plugins → Development → Figma设计桥接**
6. 会弹出插件面板，里面有状态、文件名、页面名、端口、错误信息和「重连」按钮。**面板关掉就断连**，除 `figma_status` 外其它工具会立刻报未连接。

导入时报清单错误、提到 `127.0.0.1` 不合法时：不要改成 `ws://127.0.0.1:17653`。本仓库已经写成 `localhost`，请确认你导入的是当前这份 `plugin/manifest.json`。

第一次打开面板时，状态多半是红色「未连接」，提示先启动 Agent 里的 MCP。这是正常的，先去做第 4 步，再回到面板点「重连」，或等几秒让它自动重连。

### 4. 在 Agent 里接入 MCP

所有客户端都是同一条命令：用本机 `node` 跑构建好的入口。服务名建议固定为 `figma-bridge`。

```text
command: node
args:    /绝对路径/Figma-MCP/dist/server/index.js
```

**不要**同时在「用户级配置」和「项目级配置」里各写一份同名服务，Cursor 会起两个进程抢端口。本机只保留一份。

#### Cursor

1. 打开 Cursor 设置里的 MCP 配置，或直接编辑用户级文件：
   - macOS / Linux：`~/.cursor/mcp.json`
   - Windows：`%USERPROFILE%\.cursor\mcp.json`
2. 写入（可与你已有的其它 `mcpServers` 合并，不要覆盖整份文件）：

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "node",
      "args": ["/绝对路径/Figma-MCP/dist/server/index.js"]
    }
  }
}
```

3. 保存后确认该服务处于已启用。Cursor 会自己拉起 Node 进程；一般不必再开一个终端跑服务。
4. 若列表报错或一直灰色：看 Cursor 的 MCP 日志。常见原因是路径写错、还没 `npm run build`、或 17653 已被另一份桥占用。

更新本仓库代码后，只保存 `mcp.json` 有时不会换新进程。可在该服务下加一个无害环境变量再保存，逼它重新 spawn，例如：

```json
{
  "mcpServers": {
    "figma-bridge": {
      "command": "node",
      "args": ["/绝对路径/Figma-MCP/dist/server/index.js"],
      "env": {
        "FIGMA_BRIDGE_BOOT": "1"
      }
    }
  }
}
```

以后每更新一次桥，把这个数字加 1 即可。不要在外面 `kill` 掉 Cursor 拉起的进程后又自己 `npm run bridge`，端口会被抢走，Cursor 也不会自动再拉起来。

#### Claude Code

```bash
claude mcp add --transport stdio figma-bridge -- node "/绝对路径/Figma-MCP/dist/server/index.js"
```

用 `claude mcp list` 确认服务名是 `figma-bridge`，且指向构建后的 `dist/server/index.js`。

#### Codex、OpenCode、Cline 及其它 stdio 客户端

按该客户端自己的 MCP 配置格式，填同样的 `command` + `args`。不要改工具名，也不要改成本项目没有的 HTTP 地址。

若某个客户端只支持远程 HTTP MCP、不支持本地 stdio，第一版接不上，不要为此改插件协议。

### 5. 确认已经连上

建议按这个顺序：

1. Agent 里的 `figma-bridge` 已启用（Node 进程在跑）。
2. Figma 桌面端打开目标文件，运行「Figma设计桥接」，面板开着。
3. 面板状态变成绿色「已连接」，并显示当前文件名和页名，端口为 `17653`。
4. 在 Agent 里让它调用 `figma_status`。应返回 `connected: true`，以及文件名、页名。

插件已连接后，在 Figma 里选中一个 Frame，再对 Agent 说「按当前选区做像素级还原」。握手时客户端会收到写入原则；完整条文在资源 `figma://write-guidelines`。

未开插件时：`figma_status.connected` 为 `false`，其它工具应立刻失败，而不是空等超时。

### 6. 日常使用注意

- 同一时间只开一个本服务进程。换一个 Agent 用可以，两个一起开会抢 `17653`。
- 默认端口可用环境变量 `FIGMA_BRIDGE_PORT` 覆盖。改端口后，必须同步改 `plugin/manifest.json` 的 `devAllowedDomains`，重新构建插件并重新导入。不要占用官方桌面 MCP 的 `3845`。
- 改完原则、工具或桥之后必须三步都做：`npm run build` → 重启该客户端的 `figma-bridge` → 在 Figma 里重新运行插件。旧 MCP 进程看不到新说明和新工具。
- 第一版无鉴权。桥只绑本机回环地址，但同机其它进程也能连上并操作当前打开的文件。

### 没有 MCP 客户端时

只想让插件先显示「已连接」，可以在仓库根目录执行：

```bash
cd "/绝对路径/Figma-MCP"
npm run bridge
```

它只听 WebSocket，**不要和 Cursor（或其它客户端）里已经启用的 `figma-bridge` 同时开**，会抢端口。

`npx tsx scripts/probe.ts` 是探测脚本，跑完会关掉桥，插件会立刻变回未连接。这是预期行为，不要靠它保活。

### 安装排错

| 现象 | 处理 |
| --- | --- |
| 插件一直「未连接」 | 先确认 MCP 进程已拉起；再在面板点「重连」。不要只开插件、不启 MCP。 |
| 导入插件失败 | 确认选的是 `plugin/manifest.json`，且已经 `npm run build`。清单里必须是 `localhost`，不能是 `127.0.0.1`。 |
| MCP 报端口已被占用 | 关掉另一份 `figma-bridge` 或终端里的 `npm run bridge`。不要换端口偷偷再起一份。 |
| 改完代码 Agent 仍是旧工具 | 先 `npm run build`，再重启 MCP（Cursor 可改 `FIGMA_BRIDGE_BOOT`），并重新运行插件。 |
| 网页版 Figma 连不上 | 换桌面端。第一版不支持浏览器。 |
| `node` 命令找不到或版本过低 | 安装 Node.js 20+，用 `which node` / `where node` 核对 MCP 配置里用的就是这个可执行文件。 |

更多已验证的环境问题见 [已知陷阱](docs/PITFALLS.md)。

## 文档导航

- [项目规则](AGENTS.md)
- [当前上下文](CONTEXT.md)
- [产品](docs/PRODUCT.md)
- [技术规格](docs/TECH.md)
- [决策](docs/DECISIONS.md)
- [已知陷阱](docs/PITFALLS.md)
- [项目配置](PROJECT.yaml)

## 相关 Skill 与工具

- 项目初始化：`project-initializer`
- 运行时：Figma Desktop Plugin API、标准 MCP stdio、本机 WebSocket

## 当前里程碑

1. 技术规格
2. 协议、桥、23 个工具与插件（已完成代码）
3. Figma Desktop 手工验收（未完成）
