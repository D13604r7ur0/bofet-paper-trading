"use client";

/**
 * Hook for post-sell flow: Fee collection + USDC.e → USDC swap using Uniswap V4.
 *
 * This hook executes after a SELL order is completed:
 * 1. Single Transaction Batch:
 *    - Transfer 1% fee (USDC.e) to FEE_RECIPIENT_ADDRESS
 *    - Approve USDC.e → Permit2 (if needed)
 *    - Approve Permit2 → UniversalRouter (if needed)
 *    - Execute Uniswap V4 swap: USDC.e → USDC
 *
 * Final result:
 * - User has USDC (native) in Safe, ready to withdraw
 * - Bofet receives 1% fee in USDC.e
 *
 * Example flow after selling for 10 USDC.e:
 * 1. Fee:  10 * 1% = 0.1 USDC.e → FEE_RECIPIENT
 * 2. Swap: 9.9 USDC.e → ~9.88 USDC (via Uniswap V4)
 * 3. Final: ~9.88 USDC ready to withdraw ✅
 *
 * This is OPTION B: Single transaction with combined fee + swap for better UX and gas efficiency.
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
import { FEE_BPS, HOOKS_ZERO, SLIPPAGE_BPS } from "@/constants/fullConversion";
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

/**
 * Possible states of the post-sell flow.
 */
export type PostSellStep =
  | "idle"                    // Not started
  | "swapping"                // Fee + swap in single batch
  | "completed"               // Completed successfully
  | "failed";                 // Failed

/**
 * Result of the post-sell flow.
 */
export interface PostSellFlowResult {
  /** Success */
  success: boolean;
  /** Final amount of USDC available for withdrawal */
  finalUsdcAmount: bigint;
  /** Fee collected (1% of USDC.e from sale) */
  feeCollected: bigint;
  /** Transaction hash */
  txHash: string;
}

export default function usePostSellFlow() {
  const { safeAddress } = useTrading();
  const { eoaAddress } = useWallet();

  const [step, setStep] = useState<PostSellStep>("idle");
  const [error, setError] = useState<Error | null>(null);

  /**
   * Execute the complete post-sell flow.
   *
   * @param usdceBalance - Current USDC.e balance in Safe (bigint, 6 decimals)
   * @returns Result with finalUsdcAmount, feeCollected, txHash
   * @throws Error if any step fails
   *
   * @example
   * ```typescript
   * const { executePostSellFlow, step } = usePostSellFlow();
   *
   * // After selling shares for 10 USDC.e
   * const result = await executePostSellFlow(parseUnits("10", 6));
   * console.log(`Final USDC: ${formatUnits(result.finalUsdcAmount, 6)}`);
   * console.log(`Fee collected: ${formatUnits(result.feeCollected, 6)}`);
   * ```
   */
  const executePostSellFlow = useCallback(
    async (usdceBalance: bigint): Promise<PostSellFlowResult> => {
      if (!safeAddress || !eoaAddress) {
        throw new Error("Trading session not initialized");
      }

      setStep("idle");
      setError(null);

      const publicClient = getPublicPolygonClient();
      const feeRecipientAddress = process.env.NEXT_PUBLIC_FEE_RECIPIENT_ADDRESS;

      if (!feeRecipientAddress) {
        throw new Error("NEXT_PUBLIC_FEE_RECIPIENT_ADDRESS not configured");
      }

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

      try {
        // ================================================================
        // SINGLE STEP: Fee Collection + Uniswap V4 Swap
        // ================================================================
        setStep("swapping");

        // Calculate fee (1%)
        const feeAmount = (usdceBalance * parseUnits(String(FEE_BPS), 0)) / parseUnits("1", 4);
        const amountToSwap = usdceBalance - feeAmount;

        if (amountToSwap <= parseUnits("0", 6)) {
          throw new Error("Amount to swap must be greater than 0 after fee collection");
        }

        console.log(`[PostSellFlow] USDC.e balance: ${usdceBalance}`);
        console.log(`[PostSellFlow] Fee (1%): ${feeAmount}`);
        console.log(`[PostSellFlow] Amount to swap: ${amountToSwap}`);

        // ================================================================
        // 1. Build Fee Transfer
        // ================================================================
        const feeTransferData = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [feeRecipientAddress as `0x${string}`, feeAmount],
        });

        const feeTx: MetaTransactionData = {
          to: USDC_E_CONTRACT_ADDRESS,
          value: "0",
          data: feeTransferData,
          operation: OperationType.Call,
        };

        // ================================================================
        // 2. Get Quote from Uniswap V4 Quoter
        // ================================================================

        // Build PoolKey
        // For USDC.e → USDC swap: currency0 = USDC.e, currency1 = USDC, zeroForOne = true
        const poolKey: PoolKey = {
          currency0: USDC_E_CONTRACT_ADDRESS as `0x${string}`, // USDC.e
          currency1: USDC_CONTRACT_ADDRESS as `0x${string}`, // Native USDC
          fee: USDC_E_TO_USDC_POOL_FEE, // 20 (0.002%)
          tickSpacing: 1,
          hooks: HOOKS_ZERO as `0x${string}`,
        };

        console.log(`[PostSellFlow] Getting quote for ${amountToSwap} USDC.e → USDC`);

        const quoteResult = await publicClient.simulateContract({
          address: UNISWAP_V4_QUOTER,
          abi: v4QuoterAbi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              poolKey,
              zeroForOne: true, // USDC.e → USDC (currency0 → currency1)
              exactAmount: amountToSwap,
              hookData: "0x00",
            },
          ],
        });

        const quotedOutput = quoteResult.result[0]; // amountOut
        console.log(`[PostSellFlow] Quoted output: ${quotedOutput} USDC`);

        // Apply slippage tolerance (2%)
        const minAmountOut = (quotedOutput * parseUnits(String(10000 - SLIPPAGE_BPS), 4)) / parseUnits("1", 4);
        console.log(`[PostSellFlow] Min amount out (with ${SLIPPAGE_BPS / 100}% slippage): ${minAmountOut} USDC`);

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
            amountIn: amountToSwap.toString(),
            amountOutMinimum: minAmountOut.toString(),
            hookData: "0x00",
          },
        ]);

        v4Planner.addAction(Actions.SETTLE_ALL, [
          poolKey.currency0, // Pay USDC.e to pool
          amountToSwap.toString(),
        ]);

        v4Planner.addAction(Actions.TAKE_ALL, [
          poolKey.currency1, // Receive USDC from pool
          minAmountOut.toString(),
        ]);

        const encodedActions = v4Planner.finalize();
        routePlanner.addCommand(CommandType.V4_SWAP, [
          v4Planner.actions,
          v4Planner.params,
        ]);

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

        const needErc20Approve = erc20Allowance < amountToSwap;

        // Check Permit2 allowance: Permit2 → UniversalRouter
        const permit2Allowance = (await publicClient.readContract({
          address: UNISWAP_V4_PERMIT2,
          abi: permit2Abi,
          functionName: "allowance",
          args: [
            safeAddress as `0x${string}`,
            USDC_E_CONTRACT_ADDRESS,
            UNISWAP_V4_UNIVERSAL_ROUTER,
          ],
        })) as readonly [bigint, number, number];

        const [permit2Amount, permit2Expiration] = permit2Allowance;
        const now = Math.floor(Date.now() / 1000);
        const needPermit2Approve = permit2Amount < amountToSwap || permit2Expiration <= now;

        console.log(`[PostSellFlow] ERC20 approval needed: ${needErc20Approve}`);
        console.log(`[PostSellFlow] Permit2 approval needed: ${needPermit2Approve}`);

        // Build transaction batch
        const batch: MetaTransactionData[] = [];

        // 1. Fee transfer
        batch.push(feeTx);

        // 2. Approve USDC.e → Permit2 (if needed)
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

        // 3. Approve Permit2 → UniversalRouter (if needed)
        if (needPermit2Approve) {
          const approveUniversalRouterData = encodeFunctionData({
            abi: permit2Abi,
            functionName: "approve",
            args: [
              USDC_E_CONTRACT_ADDRESS,
              UNISWAP_V4_UNIVERSAL_ROUTER,
              maxUint160,
              deadline,
            ],
          });
          batch.push({
            to: UNISWAP_V4_PERMIT2,
            value: "0",
            data: approveUniversalRouterData,
            operation: OperationType.Call,
          });
        }

        // 4. Execute swap
        batch.push({
          to: UNISWAP_V4_UNIVERSAL_ROUTER,
          value: "0",
          data: executeData,
          operation: OperationType.Call,
        });

        console.log(`[PostSellFlow] Batch operations: ${batch.length}`);

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

        console.log(`[PostSellFlow] Transaction sent: ${txResponse.hash}`);

        // Wait for confirmation
        if (
          txResponse.transactionResponse &&
          typeof txResponse.transactionResponse === "object" &&
          "wait" in txResponse.transactionResponse &&
          typeof (txResponse.transactionResponse as any).wait === "function"
        ) {
          await (
            txResponse.transactionResponse as { wait: () => Promise<unknown> }
          ).wait();
          console.log(`[PostSellFlow] Transaction confirmed`);
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

        console.log(`[PostSellFlow] Final USDC balance: ${finalUsdcBalance}`);

        // ================================================================
        // COMPLETED
        // ================================================================
        setStep("completed");

        return {
          success: true,
          finalUsdcAmount: finalUsdcBalance,
          feeCollected: feeAmount,
          txHash: txResponse.hash,
        };
      } catch (err) {
        console.error("[PostSellFlow] Error:", err);
        setStep("failed");
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      }
    },
    [safeAddress, eoaAddress]
  );

  return {
    executePostSellFlow,
    step,
    error,
  };
}
