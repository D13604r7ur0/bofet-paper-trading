"use client";

/**
 * Hook for swapping USDC → USDC.e using the BuyUsdce contract.
 *
 * This hook allows the Safe to convert native USDC to USDC.e.
 * Ratio: 1 USDC = 0.99 USDC.e (1% fee).
 *
 * Flow:
 * 1. Check USDC allowance for BuyUsdce contract
 * 2. If insufficient, add approve(maxUint256) to batch
 * 3. Add swapUsdcForUsdCe(amountIn) to batch
 * 4. Execute Safe transaction
 */

import { useState, useCallback } from "react";
import { useTrading } from "@/providers/TradingProvider";
import { useWallet } from "@/providers/WalletContext";
import Safe from "@safe-global/protocol-kit";
import { MetaTransactionData, OperationType, SigningMethod } from "@safe-global/types-kit";
import { encodeFunctionData, erc20Abi, maxUint256, parseUnits } from "viem";
import { getPublicPolygonClient } from "@/utils/polygonGas";
import getMagic from "@/lib/magic";
import { POLYGON_RPC_URL } from "@/constants/api";
import { USDC_CONTRACT_ADDRESS, BUY_USDCE_CONTRACT_ADDRESS } from "@/constants/tokens";
import { HOOKS_ZERO } from "@/constants/fullConversion";
import { buyUsdceAbi } from "@/constants/abis/buyUsdce";

export type SwapStep = "idle" | "swapping" | "completed" | "failed";

export default function useUsdcToUsdceSwap() {
  const { safeAddress } = useTrading();
  const { eoaAddress } = useWallet();

  const [step, setStep] = useState<SwapStep>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);

  /**
   * Execute USDC → USDC.e swap via BuyUsdce contract.
   *
   * @param amountIn - Amount of USDC to swap (bigint, 6 decimals)
   */
  const executeSwap = useCallback(
    async (amountIn: bigint) => {
      if (!safeAddress || !eoaAddress) {
        throw new Error("Trading session not initialized");
      }

      if (amountIn <= parseUnits("0", 6)) {
        throw new Error("Amount must be greater than 0");
      }

      setStep("idle");
      setError(null);
      setIsSwapping(true);

      const publicClient = getPublicPolygonClient();

      try {
        // Initialize Safe Protocol Kit
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

        const safeProtocolKit = await Safe.init({
          provider: provider as Parameters<typeof Safe.init>[0]["provider"],
          signer: eoaAddress,
          safeAddress,
        });

        setStep("swapping");

        console.log(`[UsdcToUsdceSwap] Swapping ${amountIn} USDC → USDC.e`);

        // ================================================================
        // 1. Check Allowance and Build Batch
        // ================================================================

        const allowance = (await publicClient.readContract({
          address: USDC_CONTRACT_ADDRESS,
          abi: erc20Abi,
          functionName: "allowance",
          args: [safeAddress as `0x${string}`, BUY_USDCE_CONTRACT_ADDRESS],
        })) as bigint;

        const needApprove = allowance < amountIn;

        console.log(`[UsdcToUsdceSwap] USDC approval needed: ${needApprove}`);

        const batch: MetaTransactionData[] = [];

        // 1. Approve USDC → BuyUsdce (if needed)
        if (needApprove) {
          const approveData = encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [BUY_USDCE_CONTRACT_ADDRESS, maxUint256],
          });
          batch.push({
            to: USDC_CONTRACT_ADDRESS,
            value: "0",
            data: approveData,
            operation: OperationType.Call,
          });
        }

        // 2. Swap USDC → USDC.e
        const swapData = encodeFunctionData({
          abi: buyUsdceAbi,
          functionName: "swapUsdcForUsdCe",
          args: [amountIn],
        });
        batch.push({
          to: BUY_USDCE_CONTRACT_ADDRESS,
          value: "0",
          data: swapData,
          operation: OperationType.Call,
        });

        console.log(`[UsdcToUsdceSwap] Batch operations: ${batch.length}`);

        // ================================================================
        // 2. Execute Safe Transaction
        // ================================================================

        let safeTransaction = await safeProtocolKit.createTransaction({
          transactions: batch,
          options: {
            safeTxGas: "300000",
            baseGas: "0",
            gasPrice: "0",
            gasToken: HOOKS_ZERO,
            refundReceiver: HOOKS_ZERO,
          },
        });

        safeTransaction = await safeProtocolKit.signTransaction(
          safeTransaction,
          SigningMethod.ETH_SIGN_TYPED_DATA_V4
        );

        const txResponse = await safeProtocolKit.executeTransaction(safeTransaction);

        console.log(`[UsdcToUsdceSwap] Transaction sent: ${txResponse.hash}`);

        // Wait for confirmation
        if (
          txResponse.transactionResponse &&
          typeof txResponse.transactionResponse === "object" &&
          "wait" in txResponse.transactionResponse &&
          typeof (txResponse.transactionResponse as any).wait === "function"
        ) {
          await (txResponse.transactionResponse as { wait: () => Promise<unknown> }).wait();
          console.log(`[UsdcToUsdceSwap] Transaction confirmed`);
        }

        // ================================================================
        // COMPLETED
        // ================================================================
        setStep("completed");
        setIsSwapping(false);

        return {
          success: true,
          txHash: txResponse.hash,
        };
      } catch (err) {
        console.error("[UsdcToUsdceSwap] Error:", err);
        setStep("failed");
        setIsSwapping(false);
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      }
    },
    [safeAddress, eoaAddress]
  );

  return {
    executeSwap,
    step,
    error,
    isSwapping,
  };
}
