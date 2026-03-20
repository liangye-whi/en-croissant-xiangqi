# Xiangiground

[![Continuous Integration](https://github.com/lucaferranti/xiangqiground/workflows/Continuous%20Integration/badge.svg)](https://github.com/lucaferranti/xiangqiground/actions?query=workflow%3A%22Continuous+Integration%22)
[![npm](https://img.shields.io/npm/v/xiangqiground)](https://www.npmjs.com/package/xiangqiground)

_Xiangqiground_ is a free/libre open source xiangqi UI.
It targets modern browsers, as well as mobile development using Cordova.

## License

Xiangiground is distributed under the **GPL-3.0 license** (or any later version,
at your option).
When you use Xiangiground for your website, your combined work may be
distributed only under the GPL. **You must release your source code** to the
users of your website.

Please read more about GPL for JavaScript on [greendrake.info](https://greendrake.info/publications/js-gpl).

## Features

- Well typed with TypeScript
- Fast. Uses a custom DOM diff algorithm to reduce DOM writes to the absolute minimum.
- Small footprint: 10K gzipped (31K unzipped). No dependencies.
- SVG drawing of circles, arrows, and custom user shapes on the board
- Arrows snap to valid moves. Freehand arrows can be drawn by dragging the mouse off the board and back while drawing an arrow.
- Entirely configurable and reconfigurable at any time
- Styling with CSS only: board and pieces can be changed by simply switching a class
- Fluid layout: board can be resized at any time
- Support for 3D pieces and boards
- Full mobile support (touchstart, touchmove, touchend)
- Move pieces by click
- Move pieces by drag & drop
  - Minimum distance before drag
  - Centralisation of the piece under the cursor
  - Piece ghost element
  - Drop off revert or trash
- Premove by click or drag
- Drag new pieces onto the board (editor, Crazyhouse)
- Animation of pieces: moving and fading away
- Display last move, check, move destinations, and premove destinations (hover effects possible)
- Import and export positions in FEN notation
- User callbacks
- No xiangqi logic inside

## Installation

```sh
npm install --save xiangqiground
```

### Usage

```js
import { Xiangqiground } from 'xiangqiground';

const config = {};
const ground = Xiangqiground(document.body, config);
```

## Documentation

- [Config types](https://github.com/lucaferranti/xiangqiground/tree/main/src/config.ts)
- [Default config values](https://github.com/lucaferranti/xiangqiground/tree/main/src/state.ts)
- [API type signatures](https://github.com/lucaferranti/xiangqiground/tree/main/src/api.ts)
- [Simple standalone example](https://github.com/lucaferranti/xiangqiground/blob/main/demo.html)
- [Base CSS](https://github.com/lucaferranti/xiangqiground/blob/main/assets/xiangqiground.base.css)

## Development

Install build dependencies:

```sh
pnpm install
```

To build the node module:

```sh
pnpm run compile --watch
```

To build the standalone:

```sh
pnpm run dist
```

## Acknowledgement

Xiangqiground is a rewrite of [chessground](https://github.com/lichess-org/chessground) adapted to xiangqi. This work would not have been possible without the amazing work from the lichess team. On the other hand, most bugs are probably my own.

The pieces design used in the demo is from wikimedia.
