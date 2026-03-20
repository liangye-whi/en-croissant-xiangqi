import { TreeStateContext } from "@/components/common/TreeStateContext";
import { chessopsError, normalizeFen, toChessopsFen } from "@/utils/chessops";
import { InputBase } from "@mantine/core";
import { type FenError, parseFen } from "xiangqiops/fen";
import { useContext, useEffect, useState } from "react";
import { useStore } from "zustand";

export default function FenSearch({ currentFen }: { currentFen: string }) {
  const [error, setError] = useState<FenError | undefined>(undefined);
  const store = useContext(TreeStateContext)!;
  const headers = useStore(store, (s) => s.headers);
  const setHeaders = useStore(store, (s) => s.setHeaders);
  const [search, setSearch] = useState(currentFen);

  useEffect(() => {
    setSearch(currentFen);
  }, [currentFen]);

  function applyFen(fen: string) {
    const trimmedFen = fen.trim();
    if (!trimmedFen) {
      return;
    }

    const normalizedFen = normalizeFen(trimmedFen);
    const res = parseFen(toChessopsFen(normalizedFen));
    if (res.isErr) {
      setError(res.error);
      return;
    }

    setHeaders({
      ...headers,
      fen: normalizedFen,
      variant: undefined,
    });
    setError(undefined);
  }

  return (
    <InputBase
      error={error && chessopsError(error)}
      value={search}
      onChange={(event) => {
        setSearch(event.currentTarget.value);
        if (error) {
          setError(undefined);
        }
      }}
      onBlur={() => {
        applyFen(search);
        setSearch(headers.fen);
      }}
      onKeyDown={(event) => {
        if (
          event.nativeEvent.code === "Enter" ||
          event.nativeEvent.code === "NumpadEnter"
        ) {
          applyFen(search);
        }
      }}
      placeholder="Enter position FEN"
    />
  );
}
