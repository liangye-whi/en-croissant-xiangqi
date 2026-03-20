import { events, type EngineOptions, type GoMode } from "@/bindings";
import {
  activeTabAtom,
  currentThreatAtom,
  engineMovesFamily,
  engineProgressFamily,
  enginesAtom,
  tabEngineSettingsFamily,
} from "@/state/atoms";
import { getVariationLine } from "@/utils/chess";
import { getBestMoves as chessdbGetBestMoves } from "@/utils/chessdb/api";
import {
  normalizeFen,
  NORMALIZED_INITIAL_FEN,
  positionFromFen,
  swapMove,
} from "@/utils/chessops";
import {
  type Engine,
  type LocalEngine,
  getBestMoves as localGetBestMoves,
  stopEngine,
} from "@/utils/engines";
import { getBestMoves as lichessGetBestMoves } from "@/utils/lichess/api";
import { useThrottledEffect } from "@/utils/misc";
import { parseUci } from "xiangqiops";
import { makeFen } from "xiangqiops/fen";
import equal from "fast-deep-equal";
import { useAtom, useAtomValue } from "jotai";
import { startTransition, useContext, useEffect, useMemo } from "react";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { TreeStateContext } from "../common/TreeStateContext";

function EvalListener() {
  const [engines] = useAtom(enginesAtom);
  const threat = useAtomValue(currentThreatAtom);
  const store = useContext(TreeStateContext)!;
  const is960 = useStore(store, (s) => s.headers.variant === "Chess960");
  const fen = useStore(store, (s) => s.root.fen);

  const moves = useStore(
    store,
    useShallow((s) => getVariationLine(s.root, s.position, is960)),
  );

  const [pos, error] = positionFromFen(fen);
  if (pos) {
    for (const uci of moves) {
      const move = parseUci(uci);
      if (!move) {
        console.log("Invalid move", uci);
        break;
      }
      pos.play(move);
    }
  }

  const isGameOver = pos?.isEnd() ?? false;
  const finalFen = useMemo(
    () => (pos ? normalizeFen(makeFen(pos.toSetup())) : null),
    [pos],
  );

  const { searchingFen, searchingMoves } = useMemo(
    () =>
      match(threat as boolean)
        .with(true, () => ({
          searchingFen: swapMove(finalFen || NORMALIZED_INITIAL_FEN),
          searchingMoves: [],
        }))
        .with(false, () => ({
          searchingFen: normalizeFen(fen),
          searchingMoves: moves,
        }))
        .exhaustive(),
    [fen, moves, threat, finalFen],
  );

  return engines.map((e) => (
    <EngineListener
      key={e.name}
      engine={e}
      isGameOver={isGameOver}
      finalFen={finalFen || ""}
      searchingFen={searchingFen}
      searchingMoves={searchingMoves}
      fen={fen}
      moves={moves}
      threat={threat}
      chess960={is960}
    />
  ));
}

function EngineListener({
  engine,
  isGameOver,
  finalFen,
  searchingFen,
  searchingMoves,
  fen,
  moves,
  threat,
  chess960,
}: {
  engine: Engine;
  isGameOver: boolean;
  finalFen: string;
  searchingFen: string;
  searchingMoves: string[];
  fen: string;
  moves: string[];
  threat: boolean;
  chess960: boolean;
}) {
  const store = useContext(TreeStateContext)!;
  const setScore = useStore(store, (s) => s.setScore);
  const activeTab = useAtomValue(activeTabAtom);

  const [, setProgress] = useAtom(
    engineProgressFamily({ engine: engine.name, tab: activeTab! }),
  );

  const [, setEngineVariation] = useAtom(
    engineMovesFamily({ engine: engine.name, tab: activeTab! }),
  );
  const [settings] = useAtom(
    tabEngineSettingsFamily({
      engineName: engine.name,
      defaultSettings: engine.settings ?? undefined,
      defaultGo: engine.go ?? undefined,
      tab: activeTab!,
    }),
  );
  useEffect(() => {
    if (!settings.enabled) return;
    const unlisten = events.bestMovesPayload.listen(({ payload }) => {
      const ev = payload.bestLines;
      const matches =
        payload.engine === engine.name &&
        payload.tab === activeTab &&
        payload.fen === searchingFen &&
        equal(payload.moves, searchingMoves) &&
        settings.enabled &&
        !isGameOver;

      console.debug("[analysis] bestMovesPayload received", {
        engineName: engine.name,
        activeTab,
        searchingFen,
        searchingMoves,
        payloadEngine: payload.engine,
        payloadTab: payload.tab,
        payloadFen: payload.fen,
        payloadMoves: payload.moves,
        payloadProgress: payload.progress,
        payloadBestLinesLength: ev.length,
        enabled: settings.enabled,
        isGameOver,
        matches,
      });

      if (
        matches
      ) {
        startTransition(() => {
          setEngineVariation((prev) => {
            const newMap = new Map(prev);
            newMap.set(`${searchingFen}:${searchingMoves.join(",")}`, ev);
            if (threat) {
              newMap.delete(`${fen}:${moves.join(",")}`);
            } else if (finalFen) {
              newMap.delete(`${swapMove(finalFen)}:`);
            }
            return newMap;
          });
          setProgress(payload.progress);
          setScore(ev[0].score);
        });
      } else {
        console.warn("[analysis] bestMovesPayload filtered out", {
          engineName: engine.name,
          activeTab,
          searchingFen,
          searchingMoves,
          payloadEngine: payload.engine,
          payloadTab: payload.tab,
          payloadFen: payload.fen,
          payloadMoves: payload.moves,
          enabled: settings.enabled,
          isGameOver,
          engineMatches: payload.engine === engine.name,
          tabMatches: payload.tab === activeTab,
          fenMatches: payload.fen === searchingFen,
          movesMatch: equal(payload.moves, searchingMoves),
        });
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [
    activeTab,
    setScore,
    settings.enabled,
    isGameOver,
    searchingFen,
    JSON.stringify(searchingMoves),
    engine.name,
    setEngineVariation,
  ]);

  const getBestMoves = useMemo(
    () =>
      match(engine.type)
        .with(
          "local",
          () => (fen: string, goMode: GoMode, options: EngineOptions) =>
            localGetBestMoves(engine as LocalEngine, fen, goMode, options),
        )
        .with("chessdb", () => chessdbGetBestMoves)
        .with("lichess", () => lichessGetBestMoves)
        .exhaustive(),
    [engine.type, engine],
  );

  useThrottledEffect(
    () => {
      if (settings.enabled) {
        if (isGameOver) {
          if (engine.type === "local") {
            stopEngine(engine, activeTab!);
          }
        } else {
          const options =
            settings.settings?.map((s) => ({
              name: s.name,
              value: s.value?.toString() || "",
            })) ?? [];
          if (chess960 && !options.find((o) => o.name === "UCI_Chess960")) {
            options.push({ name: "UCI_Chess960", value: "true" });
          }
          console.info("[analysis] requesting best moves", {
            engineName: engine.name,
            engineType: engine.type,
            activeTab,
            go: settings.go,
            fen: searchingFen,
            moves: searchingMoves,
            options,
            chess960,
          });
          getBestMoves(activeTab!, settings.go, {
            moves: searchingMoves,
            fen: searchingFen,
            extraOptions: options,
          }).then((moves) => {
            console.info("[analysis] getBestMoves resolved", {
              engineName: engine.name,
              activeTab,
              fen: searchingFen,
              moves: searchingMoves,
              returnedNull: moves == null,
            });
            if (moves) {
              const [progress, bestMoves] = moves;
              console.info("[analysis] getBestMoves returned immediate result", {
                engineName: engine.name,
                activeTab,
                fen: searchingFen,
                moves: searchingMoves,
                progress,
                bestMovesLength: bestMoves.length,
              });
              setEngineVariation((prev) => {
                const newMap = new Map(prev);
                newMap.set(
                  `${searchingFen}:${searchingMoves.join(",")}`,
                  bestMoves,
                );
                return newMap;
              });
              setProgress(progress);
            }
          }).catch((error) => {
            console.error("[analysis] getBestMoves failed", {
              engineName: engine.name,
              activeTab,
              fen: searchingFen,
              moves: searchingMoves,
              error,
            });
          });
        }
      } else {
        if (engine.type === "local") {
          console.info("[analysis] stopping engine because disabled", {
            engineName: engine.name,
            activeTab,
          });
          stopEngine(engine, activeTab!);
        }
      }
    },
    50,
    [
      settings.enabled,
      JSON.stringify(settings.settings),
      settings.go,
      searchingFen,
      JSON.stringify(searchingMoves),
      isGameOver,
      activeTab,
      getBestMoves,
      setEngineVariation,
      engine,
    ],
  );
  return null;
}

export default EvalListener;
