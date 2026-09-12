# Context 记录目录

- `events/`：Agent 或自动化任务的独立检查点。不要让多个 Agent 同时重写主 `CONTEXT.md`。
- `archive/`：项目阶段切换或主 Context 压缩时保存的历史快照。

项目自己的 `AGENTS.md` 决定具体记录格式和归档时机。

