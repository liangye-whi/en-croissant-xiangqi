import { TreeStateContext } from "@/components/common/TreeStateContext";
import { swapMove } from "@/utils/chessops";
import { Button, Group, Select, Stack, Text } from "@mantine/core";
import { EMPTY_FEN, INITIAL_FEN, makeFen, parseFen } from "xiangqiops/fen";
import { memo, useContext, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import FenSearch from "./FenSearch";

function FenInput({ currentFen }: { currentFen: string }) {
  const store = useContext(TreeStateContext)!;
  const setFen = useStore(store, (s) => s.setFen);

  const [setup, error] = useMemo(
    () =>
      parseFen(currentFen).unwrap(
        (v) => [v, null],
        (e) => [null, e],
      ),
    [currentFen],
  );

  if (!setup) {
    return <Text>{error.message}</Text>;
  }

  useEffect(() => {
    setFen(makeFen({ ...setup }));
  }, [setup, setFen]);

  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <Stack style={{ flexGrow: 1 }}>
        <Text fw="bold">Position FEN</Text>
        <FenSearch currentFen={currentFen} />
        <Group>
          <Button variant="default" onClick={() => setFen(INITIAL_FEN)}>
            {t("Fen.Start")}
          </Button>
          <Button variant="default" onClick={() => setFen(EMPTY_FEN)}>
            {t("Fen.Empty")}
          </Button>
          <Select
            flex={1}
            allowDeselect={false}
            data={[
              { label: t("Fen.WhiteToMove"), value: "white" },
              { label: t("Fen.BlackToMove"), value: "black" },
            ]}
            value={setup.turn}
            onChange={(value) => {
              if (value) {
                setFen(swapMove(currentFen, value as "white" | "black"));
              }
            }}
          />
        </Group>
      </Stack>
    </Stack>
  );
}

export default memo(FenInput);
