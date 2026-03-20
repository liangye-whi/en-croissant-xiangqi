import { createTreeStore } from "@/state/store";
import { defaultTree } from "@/utils/treeReducer";
import { beforeEach, expect, test } from "vitest";
import { INITIAL_FEN } from "xiangqiops/fen";
import { parseUci } from "xiangqiops";

const store = createTreeStore();

beforeEach(() => {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  store.setState(defaultTree());
});

function getStateSnapshot() {
  const state = store.getState();
  return {
    root: state.root,
    position: state.position,
    headers: state.headers,
    dirty: state.dirty,
  };
}

function playOpeningMove() {
  const move = parseUci("e3e4");
  if (!move) {
    throw new Error("Failed to parse xiangqi opening move");
  }
  store.getState().makeMove({ payload: move });
}

test("should handle save", () => {
  store.setState({ dirty: true });
  store.getState().save();

  expect(getStateSnapshot()).toStrictEqual({ ...defaultTree(), dirty: false });
});

test("should handle reset", () => {
  playOpeningMove();
  store.getState().reset();

  expect(getStateSnapshot()).toStrictEqual(defaultTree());
});

test("should update headers for the current tree", () => {
  store.getState().setHeaders({
    ...defaultTree().headers,
    orientation: "black",
    start: [0],
  });

  expect(getStateSnapshot()).toStrictEqual({
    ...defaultTree(),
    dirty: true,
    headers: {
      ...defaultTree().headers,
      orientation: "black",
      start: [0],
    },
  });
});

test("should append a xiangqi move to the current tree", () => {
  playOpeningMove();

  const state = getStateSnapshot();
  expect(state.dirty).toBe(true);
  expect(state.position).toStrictEqual([0]);
  expect(state.root.children).toHaveLength(1);
  expect(state.root.children[0].san).toBe("B5.1");
  expect(state.root.children[0].fen).toBe(
    "rnbakabnr/9/1c5c1/p1p1p1p1p/9/4P4/P1P3P1P/1C5C1/9/RNBAKABNR b 1 1",
  );
});

test("should navigate forward and backward through the main line", () => {
  playOpeningMove();

  store.getState().goToStart();
  expect(store.getState().position).toStrictEqual([]);

  store.getState().goToNext();
  expect(store.getState().position).toStrictEqual([0]);

  store.getState().goToPrevious();
  expect(store.getState().position).toStrictEqual([]);
});

test("should delete a variation and keep the xiangqi root position", () => {
  playOpeningMove();

  store.getState().deleteMove([0]);

  const state = getStateSnapshot();
  expect(state.dirty).toBe(true);
  expect(state.position).toStrictEqual([]);
  expect(state.root.children).toHaveLength(0);
  expect(state.root.fen).toBe(INITIAL_FEN);
});

test("should replace the root fen", () => {
  const fen =
    "4k4/9/9/9/9/9/9/9/9/4K4 w 0 1";

  store.getState().setFen(fen);

  const state = getStateSnapshot();
  expect(state.dirty).toBe(true);
  expect(state.root.fen).toBe(fen);
  expect(state.headers.fen).toBe(fen);
  expect(state.position).toStrictEqual([]);
});

test("should update score and shapes on the current node", () => {
  playOpeningMove();

  store.getState().setScore({
    value: {
      type: "cp",
      value: 42,
    },
    wdl: null,
  });
  store.getState().setShapes([
    {
      brush: "red",
      orig: "e3",
      dest: "e4",
    },
  ]);

  const currentNode = store.getState().currentNode();
  expect(currentNode.score).toStrictEqual({
    value: {
      type: "cp",
      value: 42,
    },
    wdl: null,
  });
  expect(currentNode.shapes).toStrictEqual([
    {
      brush: "red",
      orig: "e3",
      dest: "e4",
    },
  ]);
});
