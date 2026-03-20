# Dev Log

## 2026-03-20

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
