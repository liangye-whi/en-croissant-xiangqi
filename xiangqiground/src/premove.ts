import * as util from './util.js';
import * as cg from './types.js';

type Mobility = (x1: number, y1: number, x2: number, y2: number) => boolean;

const diff = (a: number, b: number): number => Math.abs(a - b);

const pawn =
  (color: cg.Color): Mobility =>
  (x1, y1, x2, y2) =>
    diff(x1, x2) < 2 &&
    (color === 'white'
      ? y2 === y1 + 1 || (y1 >= 5 && y1 === y2 && (x1 === x2 + 1 || x1 === x2 - 1))
      : y2 === y1 - 1 || (y1 <= 4 && y1 === y2 && (x1 === x2 + 1 || x1 === x2 - 1)));

export const rook: Mobility = (x1, y1, x2, y2) => {
  return x1 === x2 || y1 === y2;
};

export const knight: Mobility = (x1, y1, x2, y2) => {
  const xd = diff(x1, x2);
  const yd = diff(y1, y2);
  return (xd === 1 && yd === 2) || (xd === 2 && yd === 1);
};

export const bishop: Mobility = (x1, y1, x2, y2) => {
  const xd = diff(x1, x2);
  return xd === diff(y1, y2) && xd === 2 && (y1 <= 4 ? y2 <= 4 : y2 >= 5);
};

const advisor: Mobility = (x1, y1, x2, y2) => {
  const xd = diff(x1, x2);
  return xd === diff(y1, y2) && xd === 1 && 3 <= x2 && x2 <= 5 && (y1 <= 2 ? y2 <= 2 : y2 >= 7);
};

export const king: Mobility = (x1, y1, x2, y2) => {
  const xd = diff(x1, x2);
  const yd = diff(y1, y2);
  return (
    3 <= x2 &&
    x2 <= 5 &&
    (y1 <= 2 ? y2 <= 2 : y2 >= 7) &&
    ((xd === 0 && (yd === 1 || yd === -1)) || (yd === 0 && (xd === 1 || xd === -1)))
  );
};

export function premove(pieces: cg.Pieces, key: cg.Key): cg.Key[] {
  const piece = pieces.get(key);
  if (!piece) return [];
  const pos = util.key2pos(key),
    r = piece.role,
    mobility: Mobility =
      r === 'pawn'
        ? pawn(piece.color)
        : r === 'knight'
          ? knight
          : r === 'bishop'
            ? bishop
            : r === 'rook' || r === 'cannon'
              ? rook
              : r === 'advisor'
                ? advisor
                : king;
  return util.allPos
    .filter(pos2 => (pos[0] !== pos2[0] || pos[1] !== pos2[1]) && mobility(pos[0], pos[1], pos2[0], pos2[1]))
    .map(util.pos2key);
}
