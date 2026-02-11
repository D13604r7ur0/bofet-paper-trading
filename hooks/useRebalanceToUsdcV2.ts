"use client";

/** 0x343062586Bf473371F4dD948AD3B24662cad7833
 * Rebalance to USDC via Safe SDK (protocol-kit) instead of Polymarket RelayClient.
 * Same Uniswap encoding (createUsdcEToUsdcSwapTx); signing/execution: Safe.init →
 * createTransaction → signTransaction → executeTransaction.
 * Fixes GS013: pass non-zero safeTxGas so inner failures surface (when safeTxGas
 * and gasPrice are 0, Safe reverts with GS013 and hides the real error).
 * Fixes Magic RPC fee error: fetch maxFeePerGas/maxPriorityFeePerGas from public
 * Polygon RPC and pass into executeTransaction so Magic is never used for fee data.
 * Ref: rebalance_update_v2.txt, https://ethereum.stackexchange.com/questions/116976
 */

import { useState, useCallback } from "react";
import { createPublicClient, http, parseGwei, parseUnits } from "viem";
import { polygon } from "viem/chains";
import { useQueryClient } from "@tanstack/react-query";
import Safe from "@safe-global/protocol-kit";
import type { MetaTransactionData } from "@safe-global/types-kit";
import { useTrading } from "@/providers/TradingProvider";
import { useWallet } from "@/providers/WalletContext";
import usePolygonBalances from "@/hooks/usePolygonBalances";
import { createUsdcEToUsdcSwapTx } from "@/utils/uniswapV4Swap";
import { getSwapQuote } from "@/utils/uniswapV4Quote";
import getMagic from "@/lib/magic";
import { POLYGON_RPC_URL } from "@/constants/polymarket";

/** Non-zero safeTxGas so execTransaction does not revert with GS013 when inner call fails. */
const SAFE_TX_GAS = "300000";

export type RebalanceV2Status =
  | "idle"
  | "quoting"
  | "swapping"
  | "signing"
  | "complete"
  | "error";

/** Map Polymarket SafeTransaction shape to Safe SDK MetaTransactionData. */
function toMetaTransactionData(tx: {
  to: string;
  data?: string;
  value?: string;
  operation?: number;
}): MetaTransactionData {
  return {
    to: tx.to,
    value: tx.value ?? "0",
    data: tx.data ?? "0x",
    operation: tx.operation === 1 ? 1 : 0, // 0 = Call, 1 = DelegateCall
  };
}

/** Fetch EIP-1559 fee params from a public RPC so Magic is never used for fee data. */
async function getExecutionFeeOptions(client: {
  getFeeHistory: (args: {
    blockCount: number;
    rewardPercentiles: number[];
  }) => Promise<{
    baseFeePerGas: bigint[];
    reward?: (bigint | null)[][] | undefined;
  }>;
  getGasPrice: () => Promise<bigint>;
}): Promise<{ maxFeePerGas: string; maxPriorityFeePerGas: string }> {
  try {
    const feeHistory = await client.getFeeHistory({
      blockCount: 1,
      rewardPercentiles: [25, 75],
    });
    const baseFee = feeHistory.baseFeePerGas[feeHistory.baseFeePerGas.length - 1] ?? parseUnits("0", 0);
    const reward = feeHistory.reward?.[0];
    const priorityFee =
      (reward && (reward[1] ?? reward[0])) ?? parseGwei("30"); // 30 gwei fallback
    const maxFeePerGas = baseFee + priorityFee;
    return {
      maxFeePerGas: maxFeePerGas.toString(),
      maxPriorityFeePerGas: priorityFee.toString(),
    };
  } catch {
    const gasPrice = await client.getGasPrice();
    return {
      maxFeePerGas: gasPrice.toString(),
      maxPriorityFeePerGas: gasPrice.toString(),
    };
  }
}

export default function useRebalanceToUsdcV2() {
  const { safeAddress } = useTrading();
  const { eoaAddress, publicClient } = useWallet();
  const { rawUsdcBalance } = usePolygonBalances(safeAddress);
  const queryClient = useQueryClient();

  const [isRebalancingV2, setIsRebalancingV2] = useState(false);
  const [statusV2, setStatusV2] = useState<RebalanceV2Status>("idle");
  const [errorV2, setErrorV2] = useState<Error | null>(null);

  const rebalanceToUsdcV2 = useCallback(async (): Promise<void> => {
    if (!safeAddress || !eoaAddress) {
      throw new Error("Trading session not initialized");
    }
    const amount = rawUsdcBalance ?? parseUnits("0", 6);
    if (amount <= parseUnits("0", 6)) return;

    const magic = typeof window !== "undefined" ? getMagic() : null;
    const provider =
      magic?.rpcProvider != null
        ? (magic.rpcProvider as unknown as {
            request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
          })
        : POLYGON_RPC_URL;
    if (!provider) {
      throw new Error("No provider available for Safe SDK");
    }

    setIsRebalancingV2(true);
    setStatusV2("quoting");
    setErrorV2(null);

    try {
      const amountIn =
        (amount * parseUnits("99", 0)) / parseUnits("100", 0);
      const quote = await getSwapQuote(amountIn, {
        publicClient: publicClient ?? undefined,
      });
      const minAmountOut =
        (quote.amountOut * parseUnits("85", 0)) / parseUnits("100", 0);
      setStatusV2("swapping");

      const txs = createUsdcEToUsdcSwapTx(
        amountIn,
        minAmountOut,
        safeAddress as `0x${string}`
      );
      const metaTxs: MetaTransactionData[] = txs.map(toMetaTransactionData);

      const protocolKit = await Safe.init({
        provider: provider as Parameters<typeof Safe.init>[0]["provider"],
        signer: eoaAddress,
        safeAddress,
      });

      const safeTransaction = await protocolKit.createTransaction({
        transactions: metaTxs,
        onlyCalls: true,
        options: {
          safeTxGas: SAFE_TX_GAS,
          baseGas: "0",
          gasPrice: "0",
          gasToken: "0x0000000000000000000000000000000000000000",
          refundReceiver: "0x0000000000000000000000000000000000000000",
        },
      });

      setStatusV2("signing");
      const signedTx = await protocolKit.signTransaction(safeTransaction);

      const feeClient =
        publicClient ??
        createPublicClient({
          chain: polygon,
          transport: http(POLYGON_RPC_URL),
        });
      const txOptions = await getExecutionFeeOptions(feeClient);
      const txResponse = await protocolKit.executeTransaction(signedTx, txOptions);

      if (txResponse?.hash) {
        console.log("[Rebalance v2] execTransaction hash:", txResponse.hash);
        setStatusV2("complete");
        queryClient.invalidateQueries({ queryKey: ["usdcBalance", safeAddress] });
        queryClient.invalidateQueries({
          queryKey: ["nativeUsdcBalance", safeAddress],
        });
      } else {
        console.log("[Rebalance v2] execTransaction completed but no hash in response:", txResponse);
      }
    } catch (err) {
      setStatusV2("error");
      setErrorV2(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      setIsRebalancingV2(false);
    }
  }, [safeAddress, eoaAddress, rawUsdcBalance, queryClient, publicClient]);

  return { rebalanceToUsdcV2, isRebalancingV2, statusV2, errorV2 };
}
