"use client";

import { useState, useCallback } from "react";
import { parseUnits } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { useTrading } from "@/providers/TradingProvider";
import { useWallet } from "@/providers/WalletContext";
import usePolygonBalances from "@/hooks/usePolygonBalances";
import { createUsdcEToUsdcSwapTx } from "@/utils/uniswapV4Swap";
import { getSwapQuote } from "@/utils/uniswapV4Quote";

const REBALANCE_DESCRIPTION = "Rebalance to USDC";

export type RebalanceStatus =
  | "idle"
  | "quoting"
  | "swapping"
  | "complete"
  | "error";

export default function useRebalanceToUsdc() {
  const { safeAddress, relayClient } = useTrading();
  const { rawUsdcBalance } = usePolygonBalances(safeAddress);
  const queryClient = useQueryClient();
  const publicClient = useWallet().publicClient ?? undefined;

  const [isRebalancing, setIsRebalancing] = useState(false);
  const [status, setStatus] = useState<RebalanceStatus>("idle");
  const [error, setError] = useState<Error | null>(null);

  const rebalanceToUsdc = useCallback(async (): Promise<void> => {
    if (!safeAddress || !relayClient) {
      throw new Error("Trading session not initialized");
    }
    const amount = rawUsdcBalance ?? parseUnits("0", 6);
    if (amount <= parseUnits("0", 6)) return;

    setIsRebalancing(true);
    setStatus("quoting");
    setError(null);

    try {
      // Send 99% of balance as input; accept 85% of quoted output as minimum
      const amountIn =
        (amount * parseUnits("99", 0)) / parseUnits("100", 0);
      const quote = await getSwapQuote(amountIn, { publicClient });
      const minAmountOut =
        (quote.amountOut * parseUnits("85", 0)) / parseUnits("100", 0);
      setStatus("swapping");
      const txs = createUsdcEToUsdcSwapTx(
        amountIn,
        minAmountOut,
        safeAddress as `0x${string}`
      );
      const response = await relayClient.execute(txs, REBALANCE_DESCRIPTION);
      await response.wait();
      setStatus("complete");
      queryClient.invalidateQueries({ queryKey: ["usdcBalance", safeAddress] });
      queryClient.invalidateQueries({
        queryKey: ["nativeUsdcBalance", safeAddress],
      });
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      setIsRebalancing(false);
    }
  }, [safeAddress, relayClient, rawUsdcBalance, queryClient, publicClient]);

  return { rebalanceToUsdc, isRebalancing, status, error };
}
