import { expect, test } from "vitest";
import {
  getXiangqiRepetitionDrawReason,
  isXiangqiMaterialDraw,
  getXiangqiTerminalType,
  getXiangqiWinner,
  getPiecesCount,
  hasCaptures,
  NORMALIZED_INITIAL_FEN,
  normalizeFen,
  parseSanOrUci,
  positionFromFen,
  swapMove,
} from "../chessops";

test("should parse the default xiangqi position", () => {
  const [pos, error] = positionFromFen(NORMALIZED_INITIAL_FEN);

  expect(error).toBeNull();
  expect(pos).not.toBeNull();
  expect(getPiecesCount(pos!)).toBe(32);
  expect(hasCaptures(pos!)).toBe(true);
});

test("should swap the side to move in fen", () => {
  expect(swapMove(NORMALIZED_INITIAL_FEN)).toBe(
    "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR b - - 0 1",
  );
});

test("should normalize fen to uci-cyclone format", () => {
  expect(
    normalizeFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w 0 1"),
  ).toBe(NORMALIZED_INITIAL_FEN);
});

test("should parse xiangqi uci moves", () => {
  const [pos] = positionFromFen(NORMALIZED_INITIAL_FEN);
  const move = parseSanOrUci(pos!, "e3e4");

  expect(move).toEqual({ from: 31, to: 40 });
});

test("should classify checkmate and stalemate using xiangqi rules", () => {
  const [checkmatedPos, checkmatedError] = positionFromFen(
    "R3k4/R8/9/9/9/9/9/9/9/3K5 b 0 1",
  );
  const [stalematedPos, stalematedError] = positionFromFen(
    "4k4/5R3/9/9/9/9/9/9/9/R2K5 b - - 0 1",
  );

  expect(checkmatedError).toBeNull();
  expect(stalematedError).toBeNull();

  expect(checkmatedPos?.isEnd()).toBe(true);
  expect(checkmatedPos?.isCheck()).toBe(true);
  expect(getXiangqiTerminalType(checkmatedPos!)).toBe("checkmate");
  expect(getXiangqiWinner(checkmatedPos!)).toBe("white");

  expect(stalematedPos?.isEnd()).toBe(true);
  expect(stalematedPos?.isCheck()).toBe(false);
  expect(getXiangqiTerminalType(stalematedPos!)).toBe("stalemate");
  expect(getXiangqiWinner(stalematedPos!)).toBe("white");
});

test("should detect draw material when both sides have no attacking pieces", () => {
  const [pos, error] = positionFromFen("4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1");

  expect(error).toBeNull();
  expect(isXiangqiMaterialDraw(pos!)).toBe(true);
});

test("should detect cyclic repetition as a draw reason", () => {
  expect(
    getXiangqiRepetitionDrawReason([
      { fen: NORMALIZED_INITIAL_FEN, move: null, halfMoves: 0 },
      { fen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/4P4/P1P3P1P/1C5C1/9/RNBAKABNR b - - 1 1", move: { from: 31, to: 40 }, halfMoves: 1 },
      { fen: NORMALIZED_INITIAL_FEN, move: { from: 40, to: 31 }, halfMoves: 2 },
      { fen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/4P4/P1P3P1P/1C5C1/9/RNBAKABNR b - - 1 1", move: { from: 31, to: 40 }, halfMoves: 3 },
      { fen: NORMALIZED_INITIAL_FEN, move: { from: 40, to: 31 }, halfMoves: 4 },
    ]),
  ).toBe("cyclic-repetition");
});
