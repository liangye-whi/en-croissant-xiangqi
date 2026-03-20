<br />
<div align="center">
  <a href="https://github.com/franciscoBSalgueiro/en-croissant">
    <img width="115" height="115" src="https://github.com/franciscoBSalgueiro/en-croissant/blob/master/src-tauri/icons/icon.png" alt="Logo">
  </a>

<h3 align="center">En Croissant Xiangqi</h3>

  <p align="center">
    基于 En Croissant 开发的中国象棋 GUI
  </p>
</div>

## 项目简介

本项目是在 [En Croissant](https://github.com/franciscoBSalgueiro/en-croissant)
基础上开发的中国象棋桌面 GUI，目标是提供一个适合本地对弈、引擎分析和人机对战的跨平台图形界面。

当前仓库仍处于持续重构阶段，一部分底层能力继承自 En Croissant，正在逐步去除西洋棋遗留概念并替换为中国象棋语义。

## 当前开发重点

当前最小稳定主线目标是：

- 本地双人对弈稳定

围绕这条主线，现阶段会优先处理：

- 棋盘与走子逻辑的中国象棋化
- 前端遗留西洋棋概念和 UI 清理
- 历史备份代码和无用文件清理
- 基础测试收敛到中国象棋主线

## 规划中的核心能力

- 本地双人对弈
- 加载中国象棋引擎进行局面分析
- 中国象棋人机对战
- 多标签棋局编辑与浏览
- 局面保存、加载与基本文件管理

## 从源码构建

构建前请先确认本机满足 Tauri 的开发环境要求：

- 参考 [Tauri 官方文档](https://tauri.app/)
- 使用 `pnpm` 作为前端依赖管理工具

安装与构建：

```bash
pnpm install
pnpm build
```

如需本地开发运行：

```bash
pnpm dev
```

构建产物位于：

```bash
src-tauri/target/release
```

## 说明

- 本项目当前重点不是完整兼容 En Croissant 的全部原始功能。
- 与在线棋站、国际象棋开局库、PGN 相关的部分能力仍在重构或清理中。
- 若某些功能表现仍带有西洋棋命名或行为，通常说明该模块还未完成中国象棋化。

## 致谢

- 原项目 [En Croissant](https://github.com/franciscoBSalgueiro/en-croissant)
- Tauri、React、Mantine 及相关开源项目
