import { boardImageAtom, moveMethodAtom } from "@/state/atoms";
import { Box } from "@mantine/core";
import { Xiangqiground as NativeChessground } from "xiangqiground";
import type { Api } from "xiangqiground/api";
import type { Config } from "xiangqiground/config";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";

export function Chessground(
  props: Config & { setBoardFen?: (fen: string) => void },
) {
  const [api, setApi] = useState<Api | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const moveMethod = useAtomValue(moveMethodAtom);
  const previousViewOnly = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    const nextViewOnly = !!props.viewOnly;
    if (previousViewOnly.current !== nextViewOnly) {
      console.log("[Chessground] viewOnly changed:", nextViewOnly);
      previousViewOnly.current = nextViewOnly;
    }
  }, [props.viewOnly]);

  function buildConfig(currentApi: Api | null): Config {
    return {
      ...props,
      events: {
        change: () => {
          if (props.setBoardFen && currentApi) {
            props.setBoardFen(currentApi.getFen());
          }
        },
      },
      draggable: {
        ...props.draggable,
        enabled: moveMethod !== "select",
      },
      selectable: {
        ...props.selectable,
        enabled: moveMethod !== "drag",
      },
    };
  }

  useEffect(() => {
    if (!ref.current) return;

    if (api && api.state.viewOnly !== !!props.viewOnly) {
      api.destroy();
      setApi(null);
      return;
    }

    if (!api) {
      const chessgroundApi = NativeChessground(ref.current, {
        ...buildConfig(null),
        addDimensionsCssVarsTo: ref.current,
      });
      setApi(chessgroundApi);
      return;
    }

    api.set(buildConfig(api));
  }, [api, props, moveMethod]);

  useEffect(() => {
    return () => {
      api?.destroy();
    };
  }, [api]);

  const boardImage = useAtomValue(boardImageAtom);

  return (
    <Box
      style={{
        aspectRatio: 0.9,
        height: "100%",
        "--board-image": `url('/board/${boardImage}')`,
      }}
      ref={ref}
    />
  );
}
