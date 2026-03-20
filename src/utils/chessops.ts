import {
  attacks,
  Chess,
  type Color,
  IllegalSetup,
  opposite,
  type Move,
  type PositionError,
  type Setup,
  type Square,
  type SquareName,
  SquareSet,
  makeSquare,
  parseUci,
  squareFile,
  squareRank,
} from "xiangqiops";
import { type FenError, InvalidFen, makeFen, parseFen } from "xiangqiops/fen";
import { parseSan } from "xiangqiops/san";
import { squareFromCoords } from "chessops/util";
import { match } from "ts-pattern";
import { INITIAL_FEN } from "xiangqiops/fen";

function normalizeTurn(turn: string): string {
  switch (turn) {
    case "black":
    case "b":
      return "b";
    case "white":
    case "w":
    case "red":
      return "w";
    default:
      return turn;
  }
}

export function normalizeFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) {
    return fen.trim();
  }

  const board = parts[0];
  const turn = normalizeTurn(parts[1] ?? "w");

  if (parts.length <= 2) {
    return `${board} ${turn} - - 0 1`;
  }
  if (parts.length === 4) {
    return `${board} ${turn} - - ${parts[2]} ${parts[3]}`;
  }
  if (parts.length >= 6) {
    return `${board} ${turn} ${parts[2]} ${parts[3]} ${parts[4]} ${parts[5]}`;
  }

  return fen.trim();
}

export const NORMALIZED_INITIAL_FEN = normalizeFen(INITIAL_FEN);

export function toChessopsFen(fen: string): string {
  const normalized = normalizeFen(fen);
  const parts = normalized.split(/\s+/);

  if (parts.length >= 6) {
    return `${parts[0]} ${parts[1]} ${parts[4]} ${parts[5]}`;
  }

  return normalized;
}

export function positionFromFen(
  fen: string,
): [Chess, null] | [null, FenError | PositionError] {
  const [setup, error] = parseFen(toChessopsFen(fen)).unwrap(
    (v) => [v, null],
    (e) => [null, e],
  );
  if (error) {
    return [null, error];
  }

  return Chess.fromSetup(setup).unwrap(
    (v) => [v, null],
    (e) => [null, e],
  );
}

export function swapMove(fen: string, color?: Color) {
  const setup = parseFen(toChessopsFen(fen)).unwrap();
  if (color) {
    setup.turn = color;
  } else {
    setup.turn = setup.turn === "white" ? "black" : "white";
  }

  return normalizeFen(makeFen(setup));
}

export function squareToCoordinates(
  square: Square,
  orientation: "white" | "black",
) {
  let file = squareFile(square) + 1;
  let rank = squareRank(square) + 1;
  if (orientation === "black") {
    file = 9 - file;
    rank = 9 - rank;
  }
  return { file, rank };
}

export function chessopsError(error: PositionError | FenError) {
  return match(error)
    .with({ message: IllegalSetup.Empty }, () => "Errors.EmptyBoard")
    .with({ message: IllegalSetup.Kings }, () => "Errors.InvalidKings")
    .with({ message: IllegalSetup.OppositeCheck }, () => "Errors.OppositeCheck")
    .with(
      { message: IllegalSetup.PawnsOnBackrank },
      () => "Errors.PawnsOnBackrank",
    )
    .with({ message: InvalidFen.Board }, () => "Errors.InvalidBoard")
    .with(
      { message: InvalidFen.Castling },
      () => "Errors.InvalidCastlingRights",
    )
    .with({ message: InvalidFen.EpSquare }, () => "Errors.InvalidEpSquare")
    .with({ message: InvalidFen.Fen }, () => "Errors.InvalidFen")
    .with({ message: InvalidFen.Fullmoves }, () => "Errors.InvalidFullmoves")
    .with({ message: InvalidFen.Halfmoves }, () => "Errors.InvalidHalfmoves")
    .with({ message: InvalidFen.Pockets }, () => "Errors.InvalidPockets")
    .with(
      { message: InvalidFen.RemainingChecks },
      () => "Errors.InvalidRemainingChecks",
    )
    .with({ message: InvalidFen.Turn }, () => "Errors.InvalidTurn")
    .otherwise(() => "Errors.Unknown");
}

export function forceEnPassant(
  dests: Map<SquareName, SquareName[]>,
  pos: Chess,
) {
  const epSquare = pos.epSquare ? makeSquare(pos.epSquare) : undefined;
  if (!epSquare) {
    return dests;
  }
  for (const [from, to] of dests.entries()) {
    let seen = false;
    if (to.includes(epSquare)) {
      seen = true;
      dests.set(from, [epSquare]);
    }
    if (!seen) {
      dests.delete(from);
    }
  }
  return dests;
}

export function getPiecesCount(pos: Chess) {
  return (
    pos.board.pawn.size() +
    pos.board.knight.size() +
    pos.board.bishop.size() +
    pos.board.advisor.size() +
    pos.board.rook.size() +
    pos.board.cannon.size() +
    pos.board.king.size()
  );
}

export function hasCaptures(pos: Chess) {
  const dests = pos.allDests();
  for (const to of dests.values()) {
    for (const square of to) {
      if (pos.board.get(square)) {
        return true;
      }
    }
  }
  return false;
}

export function parseSanOrUci(pos: Chess, sanOrUci: string): Move | null {
  const sanParsed = parseSan(pos, sanOrUci);
  if (sanParsed) {
    return sanParsed;
  }

  const uciParsed = parseUci(sanOrUci);
  if (uciParsed) {
    return uciParsed;
  }

  return null;
}

export type XiangqiTerminalType = "checkmate" | "stalemate";

export function getXiangqiTerminalType(pos: Chess): XiangqiTerminalType | null {
  if (!pos.isEnd()) {
    return null;
  }

  return pos.isCheck() ? "checkmate" : "stalemate";
}

export function getXiangqiWinner(pos: Chess): Color | null {
  if (!pos.isEnd()) {
    return null;
  }

  return opposite(pos.turn);
}

export function normalizeFenForRepetition(fen: string) {
  return fen.trim().split(" ").slice(0, 2).join(" ");
}

export type XiangqiRepetitionReason =
  | "one-check-one-idle"
  | "one-attack-one-idle"
  | "cyclic-repetition"
  | "threefold";

export type XiangqiRepetitionEntry = {
  fen: string;
  move: Move | null;
  halfMoves: number;
};

function getMoveColorFromHalfMoves(halfMoves: number): Color {
  return halfMoves % 2 === 1 ? "white" : "black";
}

export function hasXiangqiAttackingPieces(pos: Chess, color?: Color) {
  const colors = color ? [color] : (["white", "black"] as const);

  return colors.some((side) => {
    const board = pos.board[side];

    return (
      board.intersect(pos.board.rook).nonEmpty() ||
      board.intersect(pos.board.cannon).nonEmpty() ||
      board.intersect(pos.board.knight).nonEmpty() ||
      board.intersect(pos.board.pawn).nonEmpty()
    );
  });
}

export function isXiangqiMaterialDraw(pos: Chess) {
  return !hasXiangqiAttackingPieces(pos, "white") &&
    !hasXiangqiAttackingPieces(pos, "black");
}

function getAttackedTargets(entry: XiangqiRepetitionEntry) {
  if (!entry.move) {
    return [];
  }

  const [pos] = positionFromFen(entry.fen);
  if (!pos) {
    return [];
  }

  const mover = getMoveColorFromHalfMoves(entry.halfMoves);
  const movedPiece = pos.board.get(entry.move.to);
  if (!movedPiece || movedPiece.color !== mover) {
    return [];
  }

  const threatenedSquares = attacks(movedPiece, entry.move.to, pos.board.occupied);
  const targets: SquareName[] = [];

  for (const square of threatenedSquares) {
    const piece = pos.board.get(square);
    if (piece && piece.color !== mover && piece.role !== "king") {
      targets.push(makeSquare(square));
    }
  }

  return targets;
}

function getRestrictedRepeatReason(
  entries: XiangqiRepetitionEntry[],
  color: Color,
): XiangqiRepetitionReason | null {
  const moves = entries.filter(
    (entry) => entry.move && getMoveColorFromHalfMoves(entry.halfMoves) === color,
  );

  if (moves.length < 2) {
    return null;
  }

  const allChecking = moves.every((entry) => {
    const [pos] = positionFromFen(entry.fen);
    return !!pos?.isCheck();
  });

  let sharedTargets = new Set(getAttackedTargets(moves[0]));
  if (sharedTargets.size > 0) {
    for (const move of moves.slice(1)) {
      const currentTargets = new Set(getAttackedTargets(move));
      sharedTargets = new Set(
        [...sharedTargets].filter((target) => currentTargets.has(target)),
      );
      if (sharedTargets.size === 0) {
        break;
      }
    }
  }

  const otherMoves = entries.filter(
    (entry) => entry.move && getMoveColorFromHalfMoves(entry.halfMoves) !== color,
  );
  const otherAlwaysIdle = otherMoves.every((entry) => {
    const [pos] = positionFromFen(entry.fen);
    return !!pos && !pos.isCheck() && getAttackedTargets(entry).length === 0;
  });

  if (allChecking && otherAlwaysIdle) {
    return "one-check-one-idle";
  }
  if (sharedTargets.size > 0 && otherAlwaysIdle) {
    return "one-attack-one-idle";
  }

  return null;
}

export function getXiangqiRepetitionDrawReason(
  entries: XiangqiRepetitionEntry[],
): XiangqiRepetitionReason | null {
  const current = entries.at(-1);
  if (!current) {
    return null;
  }

  const normalizedCurrentFen = normalizeFenForRepetition(current.fen);
  const repetitionIndexes = entries
    .map((entry, index) =>
      normalizeFenForRepetition(entry.fen) === normalizedCurrentFen ? index : -1,
    )
    .filter((index) => index !== -1);

  if (repetitionIndexes.length < 3) {
    return null;
  }

  const cycleStart = repetitionIndexes[repetitionIndexes.length - 3];
  const cycleEntries = entries.slice(cycleStart + 1);

  const whiteReason = getRestrictedRepeatReason(cycleEntries, "white");
  const blackReason = getRestrictedRepeatReason(cycleEntries, "black");

  if (whiteReason || blackReason) {
    return whiteReason ?? blackReason;
  }

  return repetitionIndexes.length >= 3 ? "cyclic-repetition" : "threefold";
}

export function getCastlingSquare(
  setup: Setup,
  color: "w" | "b",
  side: "q" | "k",
) {
  const kingSquare = (color === "w" ? setup.board.white : setup.board.black)
    .intersect(setup.board.king)
    .singleSquare();
  if (kingSquare === undefined) {
    return;
  }

  let possibleRookSquares = SquareSet.empty();
  for (let file = 0; file < 8; file++) {
    const newSquare = squareFromCoords(file, squareRank(kingSquare));
    if (newSquare === undefined) {
      continue;
    }
    if (side === "q" && file < squareFile(kingSquare)) {
      possibleRookSquares = possibleRookSquares.set(newSquare, true);
    } else if (side === "k" && file > squareFile(kingSquare)) {
      possibleRookSquares = possibleRookSquares.set(newSquare, true);
    }
  }

  const rookSquares = (color === "w" ? setup.board.white : setup.board.black)
    .intersect(setup.board.rook)
    .intersect(possibleRookSquares);

  return rookSquares.first();
}
