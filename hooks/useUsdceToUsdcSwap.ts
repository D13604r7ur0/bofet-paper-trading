"use client";

/**
 * Hook for swapping USDC.e → USDC using Uniswap V4.
 *
 * This hook allows users to convert their USDC.e balance to native USDC.
 * Unlike usePostSellFlow, this does NOT charge any fees.
 *
 * Flow:
 * 1. Get quote from Uniswap V4 Quoter
 * 2. Check and set approvals (USDC.e → Permit2, Permit2 → UniversalRouter)
 * 3. Execute swap via UniversalRouter
 *
 * @example
 * ```typescript
 * const { executeSwap, isSwapping } = useUsdceToUsdcSwap();
 *
 * // Swap 10 USDC.e to USDC
 * const result = await executeSwap(parseUnits("10", 6));
 * console.log(`Received ${formatUnits(result.amountOut, 6)} USDC`);
 * ```
 */

import { useState, useCallback } from "react";
import { useTrading } from "@/providers/TradingProvider";
import { useWallet } from "@/providers/WalletContext";
import Safe from "@safe-global/protocol-kit";
import { MetaTransactionData, OperationType, SigningMethod } from "@safe-global/types-kit";
import { encodeFunctionData, erc20Abi, maxUint160, parseUnits } from "viem";
import { getPublicPolygonClient } from "@/utils/polygonGas";
import getMagic from "@/lib/magic";
import { POLYGON_RPC_URL } from "@/constants/api";
import { USDC_E_CONTRACT_ADDRESS, USDC_CONTRACT_ADDRESS } from "@/constants/tokens";
import { HOOKS_ZERO, SLIPPAGE_BPS } from "@/constants/fullConversion";
import {
  UNISWAP_V4_UNIVERSAL_ROUTER,
  UNISWAP_V4_PERMIT2,
  UNISWAP_V4_QUOTER,
  USDC_E_TO_USDC_POOL_FEE,
} from "@/constants/uniswap";
import {
  universalRouterAbi,
  v4QuoterAbi,
  permit2Abi,
  Actions,
  type PoolKey,
} from "@/constants/abis/uniswapV4";
import { V4Planner } from "@uniswap/v4-sdk";
import { RoutePlanner, CommandType } from "@uniswap/universal-router-sdk";

export type SwapStep = "idle" | "swapping" | "completed" | "failed";

export interface SwapResult {
  success: boolean;
  amountOut: bigint;
  txHash: string;
}

export default function useUsdceToUsdcSwap() {
  const { safeAddress } = useTrading();
  const { eoaAddress } = useWallet();

  const [step, setStep] = useState<SwapStep>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);

  /**
   * Execute USDC.e → USDC swap.
   *
   * @param amountIn - Amount of USDC.e to swap (bigint, 6 decimals)
   * @returns Result with amountOut and txHash
   * @throws Error if swap fails
   */
  const executeSwap = useCallback(
    async (amountIn: bigint): Promise<SwapResult> => {
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

        console.log(`[UsdceToUsdcSwap] Swapping ${amountIn} USDC.e → USDC`);

        // ================================================================
        // 1. Build PoolKey
        // ================================================================
        const poolKey: PoolKey = {
          currency0: USDC_E_CONTRACT_ADDRESS as `0x${string}`, // USDC.e (lower address)
          currency1: USDC_CONTRACT_ADDRESS as `0x${string}`, // Native USDC
          fee: USDC_E_TO_USDC_POOL_FEE, // 20 (0.002%)
          tickSpacing: 1,
          hooks: HOOKS_ZERO as `0x${string}`,
        };

        // ================================================================
        // 2. Get Quote from Uniswap V4 Quoter
        // ================================================================
        console.log(`[UsdceToUsdcSwap] Getting quote for ${amountIn} USDC.e → USDC`);

        const quoteResult = await publicClient.simulateContract({
          address: UNISWAP_V4_QUOTER,
          abi: v4QuoterAbi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              poolKey,
              zeroForOne: true, // USDC.e → USDC (currency0 → currency1)
              exactAmount: amountIn,
              hookData: "0x00",
            },
          ],
        });

        const quotedOutput = quoteResult.result[0]; // amountOut
        console.log(`[UsdceToUsdcSwap] Quoted output: ${quotedOutput} USDC`);

        // Apply slippage tolerance (2%)
        const minAmountOut = (quotedOutput * parseUnits(String(10000 - SLIPPAGE_BPS), 4)) / parseUnits("1", 4);
        console.log(
          `[UsdceToUsdcSwap] Min amount out (with ${SLIPPAGE_BPS / 100}% slippage): ${minAmountOut} USDC`
        );

        // ================================================================
        // 3. Build Uniswap V4 Swap using V4Planner
        // ================================================================
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

        const v4Planner = new V4Planner();
        const routePlanner = new RoutePlanner();

        // Add swap actions
        v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [
          {
            poolKey,
            zeroForOne: true, // USDC.e → USDC (currency0 → currency1)
            amountIn: amountIn.toString(),
            amountOutMinimum: minAmountOut.toString(),
            hookData: "0x00",
          },
        ]);

        v4Planner.addAction(Actions.SETTLE_ALL, [
          poolKey.currency0, // Pay USDC.e to pool
          amountIn.toString(),
        ]);

        v4Planner.addAction(Actions.TAKE_ALL, [
          poolKey.currency1, // Receive USDC from pool
          minAmountOut.toString(),
        ]);

        const encodedActions = v4Planner.finalize();
        routePlanner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params]);

        // Encode execute call for Universal Router
        const executeData = encodeFunctionData({
          abi: universalRouterAbi,
          functionName: "execute",
          args: [routePlanner.commands as `0x${string}`, [encodedActions as `0x${string}`], parseUnits(String(deadline), 0)],
        });

        // ================================================================
        // 4. Check Approvals and Build Batch
        // ================================================================

        // Check ERC20 allowance: USDC.e → Permit2
        const erc20Allowance = (await publicClient.readContract({
          address: USDC_E_CONTRACT_ADDRESS,
          abi: erc20Abi,
          functionName: "allowance",
          args: [safeAddress as `0x${string}`, UNISWAP_V4_PERMIT2],
        })) as bigint;

        const needErc20Approve = erc20Allowance < amountIn;

        // Check Permit2 allowance: Permit2 → UniversalRouter
        const permit2Allowance = (await publicClient.readContract({
          address: UNISWAP_V4_PERMIT2,
          abi: permit2Abi,
          functionName: "allowance",
          args: [safeAddress as `0x${string}`, USDC_E_CONTRACT_ADDRESS, UNISWAP_V4_UNIVERSAL_ROUTER],
        })) as readonly [bigint, number, number];

        const [permit2Amount, permit2Expiration] = permit2Allowance;
        const now = Math.floor(Date.now() / 1000);
        const needPermit2Approve = permit2Amount < amountIn || permit2Expiration <= now;

        console.log(`[UsdceToUsdcSwap] ERC20 approval needed: ${needErc20Approve}`);
        console.log(`[UsdceToUsdcSwap] Permit2 approval needed: ${needPermit2Approve}`);

        // Build transaction batch
        const batch: MetaTransactionData[] = [];

        // 1. Approve USDC.e → Permit2 (if needed)
        if (needErc20Approve) {
          const approvePermit2Data = encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [UNISWAP_V4_PERMIT2, maxUint160],
          });
          batch.push({
            to: USDC_E_CONTRACT_ADDRESS,
            value: "0",
            data: approvePermit2Data,
            operation: OperationType.Call,
          });
        }

        // 2. Approve Permit2 → UniversalRouter (if needed)
        if (needPermit2Approve) {
          const approveUniversalRouterData = encodeFunctionData({
            abi: permit2Abi,
            functionName: "approve",
            args: [USDC_E_CONTRACT_ADDRESS, UNISWAP_V4_UNIVERSAL_ROUTER, maxUint160, deadline],
          });
          batch.push({
            to: UNISWAP_V4_PERMIT2,
            value: "0",
            data: approveUniversalRouterData,
            operation: OperationType.Call,
          });
        }

        // 3. Execute swap
        batch.push({
          to: UNISWAP_V4_UNIVERSAL_ROUTER,
          value: "0",
          data: executeData,
          operation: OperationType.Call,
        });

        console.log(`[UsdceToUsdcSwap] Batch operations: ${batch.length}`);

        // ================================================================
        // 5. Execute Safe Transaction
        // ================================================================

        let safeTransaction = await safeProtocolKit.createTransaction({
          transactions: batch,
          options: {
            safeTxGas: "500000",
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

        console.log(`[UsdceToUsdcSwap] Transaction sent: ${txResponse.hash}`);

        // Wait for confirmation
        if (
          txResponse.transactionResponse &&
          typeof txResponse.transactionResponse === "object" &&
          "wait" in txResponse.transactionResponse &&
          typeof (txResponse.transactionResponse as any).wait === "function"
        ) {
          await (txResponse.transactionResponse as { wait: () => Promise<unknown> }).wait();
          console.log(`[UsdceToUsdcSwap] Transaction confirmed`);
        }

        // ================================================================
        // Read final USDC balance
        // ================================================================

        const finalUsdcBalance = (await publicClient.readContract({
          address: USDC_CONTRACT_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [safeAddress as `0x${string}`],
        })) as bigint;

        console.log(`[UsdceToUsdcSwap] Final USDC balance: ${finalUsdcBalance}`);

        // ================================================================
        // COMPLETED
        // ================================================================
        setStep("completed");
        setIsSwapping(false);

        return {
          success: true,
          amountOut: quotedOutput,
          txHash: txResponse.hash,
        };
      } catch (err) {
        console.error("[UsdceToUsdcSwap] Error:", err);
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
