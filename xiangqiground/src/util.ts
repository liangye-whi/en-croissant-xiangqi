import * as cg from './types.js';

export const invRanks: readonly cg.Rank[] = [...cg.ranks].reverse();

export const allKeys: readonly cg.Key[] = Array.prototype.concat(
  ...cg.files.map(c => cg.ranks.map(r => c + r)),
);

console.log(allKeys);

export const pos2key = (pos: cg.Pos): cg.Key => allKeys[10 * pos[0] + pos[1]];

export const key2pos = (k: cg.Key): cg.Pos => [
  cg.files.indexOf(k[0] as cg.File),
  cg.ranks.indexOf(k.slice(1) as cg.Rank),
];

export const uciToMove = (uci: string | undefined): cg.Key[] | undefined => {
  if (!uci) return undefined;
  const regex = /^([a-i](?:[1-9]|10))([a-i](?:[1-9]|10))$/;
  const match = uci.match(regex);
  if (match) {
    return [match[1], match[2]] as cg.Key[];
  }
  return;
};

export const allPos: readonly cg.Pos[] = allKeys.map(key2pos);

export function memo<A>(f: () => A): cg.Memo<A> {
  let v: A | undefined;
  const ret = (): A => {
    if (v === undefined) v = f();
    return v;
  };
  ret.clear = () => {
    v = undefined;
  };
  return ret;
}

export const timer = (): cg.Timer => {
  let startAt: number | undefined;
  return {
    start() {
      startAt = performance.now();
    },
    cancel() {
      startAt = undefined;
    },
    stop() {
      if (!startAt) return 0;
      const time = performance.now() - startAt;
      startAt = undefined;
      return time;
    },
  };
};

export const opposite = (c: cg.Color): cg.Color => (c === 'white' ? 'black' : 'white');

export const distanceSq = (pos1: cg.Pos, pos2: cg.Pos): number => {
  const dx = pos1[0] - pos2[0],
    dy = pos1[1] - pos2[1];
  return dx * dx + dy * dy;
};

export const samePiece = (p1: cg.Piece, p2: cg.Piece): boolean =>
  p1.role === p2.role && p1.color === p2.color;

export const posToTranslate =
  (bounds: DOMRectReadOnly): ((pos: cg.Pos, asWhite: boolean) => cg.NumberPair) =>
  (pos, asWhite) => [
    ((asWhite ? pos[0] : 8 - pos[0]) * bounds.width) / 9,
    ((asWhite ? 9 - pos[1] : pos[1]) * bounds.height) / 10,
  ];

export const translate = (el: HTMLElement, pos: cg.NumberPair): void => {
  el.style.transform = `translate(${pos[0]}px,${pos[1]}px)`;
};

export const translateAndScale = (el: HTMLElement, pos: cg.NumberPair, scale = 1): void => {
  el.style.transform = `translate(${pos[0]}px,${pos[1]}px) scale(${scale})`;
};

export const setVisible = (el: HTMLElement, v: boolean): void => {
  el.style.visibility = v ? 'visible' : 'hidden';
};

export const eventPosition = (e: cg.MouchEvent): cg.NumberPair | undefined => {
  if (e.clientX || e.clientX === 0) return [e.clientX, e.clientY!];
  if (e.targetTouches?.[0]) return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
  return; // touchend has no position!
};

export const isRightButton = (e: cg.MouchEvent): boolean => e.button === 2;

export const createEl = (tagName: string, className?: string): HTMLElement => {
  const el = document.createElement(tagName);
  if (className) el.className = className;
  return el;
};

export function computeSquareCenter(key: cg.Key, asWhite: boolean, bounds: DOMRectReadOnly): cg.NumberPair {
  const pos = key2pos(key);
  if (!asWhite) {
    pos[0] = 8 - pos[0];
    pos[1] = 9 - pos[1];
  }
  return [
    bounds.left + (bounds.width * pos[0]) / 9 + bounds.width / 18,
    bounds.top + (bounds.height * (9 - pos[1])) / 10 + bounds.height / 20,
  ];
}
