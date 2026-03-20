# Dev Log

## 2026-03-20

### 引擎分析：Pikafish 实时分析链路修复

问题现象：

- Analyse 面板首次启动引擎时，前端经常一直停留在 loading。
- 引擎已加载后，走子触发新的分析请求时，经常看不到新局面的分析结果。
- Pikafish 明明持续输出 `info depth ... pv ...`，但前端没有拿到可用结果。

排查过程：

- 首先确认了前端 `engineVariations` 的写入链路，发现真正控制 loading 消失的是 `bestMovesPayload` 是否成功写入 `engineMovesFamily`。
- 随后补充了前后端日志，区分：
  - 请求是否真的发起
  - 后端是否真的发出 payload
  - 前端是否把 payload 过滤掉
- 进一步确认前后端 FEN 原来并不统一：
  - 前端部分链路还在使用旧 4 段式
  - 后端实际发事件时使用的是 UCI-Cyclone 风格 6 段式
- 统一 FEN 后，又发现复用旧引擎进程时，旧搜索的尾部输出仍会在 `stop` 之后继续出现。
- 最终通过原始 `engine -> gui` 日志确认：
  - Pikafish 在新局面上确实有持续输出
  - 问题不在引擎没搜索，而在后端没有正确解析 xiangqi 风格 `pv`

根因：

- 分析链路中同时存在两个问题：
  - 前后端 FEN 格式不统一，导致同一局面的 key 和 payload 不能稳定匹配
  - `vampirc_uci` 能把 Pikafish 的行识别成 `info`，但不能可靠提取中国象棋 `pv`，因此 `parse_uci_attrs` 最终报 `NoMovesFound`
- 另外，在复用旧进程时，旧搜索尾部输出会在新请求开始前后继续到达，因此需要根据“当前请求”主动丢弃过期输出

本次修改：

- 前端增加统一的 FEN 规范化逻辑：
  - 新增 `normalizeFen`
  - 新增 `NORMALIZED_INITIAL_FEN`
  - 新增 `toChessopsFen`
- 分析面板、缓存 key、导入/编辑/拼图等直接处理 FEN 的入口统一切换到规范化后的格式。
- 后端统一将分析链路中的 FEN 标准化为 UCI-Cyclone 风格。
- 后端给本地引擎分析链路增加了“当前请求”检查：
  - 如果收到的输出不再属于当前请求，就直接丢弃
- 后端不再依赖 `vampirc_uci` 解析 `pv`：
  - `depth / score / nodes / multipv / nps` 仍由 `vampirc_uci` 解析
  - `pv` 改为直接从原始 `info ... pv ...` 行手动提取
- 增加了较完整的调试日志，覆盖：
  - `gui -> engine`
  - `engine -> gui`
  - payload 接收/丢弃
  - `parse_uci_attrs` 成功/失败

结论：

- 现在 Analyse 面板能够正常显示 Pikafish 的实时分析结果。
- 首次加载引擎与走子后复用引擎两条链路都可以正确工作。
- 当前中国象棋引擎分析链路的关键兼容层已经稳定：
  - FEN 统一为 UCI-Cyclone
  - `xiangqiops` 仍可通过适配层继续使用
  - Pikafish 的中国象棋 `pv` 由后端手动提取

### 本地双人对局：拖拽落子与合法落点修复

问题现象：

- 开始对局后，棋子可以被按下，但合法落点不显示。
- 拖拽落子不稳定，很多情况下无法正确落子。
- 在 `xiangqiground/src/events.ts` 中打印按下棋子的坐标时，`dests` 一直是 `(none)`。

根因：

- `xiangqiops/chessgroundDests` 生成的落点坐标使用的是 `a0..i9`。
- `xiangqiground` 内部一部分坐标逻辑使用的是 `a1..i10`。
- 鼠标按下时命中的起点 key 和 `movable.dests` 里的 key 不一致，导致：
  - 查不到合法落点
  - 不显示落点高亮
  - 拖拽落子判断失败

最终规范：

- 本项目棋盘交互层统一使用 `a0..i9` 坐标体系。
- 以下模块必须保持一致：
  - `xiangqiops`
  - `Board.tsx` 传给棋盘的 `movable.dests`
  - `xiangqiground` 内部 `Key` / `Rank` / FEN 读写 / 鼠标命中计算

本次修改：

- 将 `xiangqiground/src/types.ts` 中的 `ranks` 从 `1..10` 改为 `0..9`。
- 重新编译 `xiangqiground`，让主程序实际使用更新后的 `dist`。
- 在 `xiangqiground/src/events.ts` 中增加调试日志，按下棋子时输出：
  - 当前棋子坐标
  - 当前棋子的全部合法落点

结论：

- 现在本地双人对局中，按下棋子可以正确得到合法落点。
- 拖拽落子已经恢复正常。

后续开发注意事项：

- 如果再修改 `xiangqiground/src/*`，需要重新执行：

```bash
pnpm --dir xiangqiground compile
```

- 原因是主程序运行时使用的是 `xiangqiground/dist/*`，不是 `src/*`。
- 后续凡是涉及棋盘坐标、FEN 读写、拖拽命中、`dests` 显示的问题，先优先检查是否仍然满足 `a0..i9` 这一统一规范。
