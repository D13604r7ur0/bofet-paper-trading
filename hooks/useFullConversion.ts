"use client";

/**
 * Main hook for the complete USDC → USDC.e + auto-funding flow.
 *
 * This hook orchestrates the conversion flow:
 * 1. Bridge USDC → USDC.e (using Polymarket bridge)
 * 2. Buy Gas (optional): Purchase POL with 0.2 USDC.e only if Safe has < MIN_POL_BALANCE_SAFE
 * 3. Distribute POL (optional): Transfer % of POL from Safe to EOA based on POL_SAFE_PERCENTAGE
 *
 * Final result:
 * - Safe has USDC.e ready to trade on Polymarket
 * - Safe has POL to pay gas for future transactions (if it didn't have enough)
 * - EOA has POL for direct wallet transactions (if distribution occurred)
 *
 * Example flow with 2 USDC initial (POL_SAFE_PERCENTAGE=50):
 * 1. Bridge:  2.00 USDC → 1.97 USDC.e (bridge fee ~$0.03)
 * 2. Buy Gas: If POL < MIN_POL_BALANCE_SAFE, spend 0.2 USDC.e → 1.77 USDC.e remaining
 *    If POL >= MIN_POL_BALANCE_SAFE, skip → 1.97 USDC.e remaining
 * 3. Distribute: If gas was purchased, send 50% of new POL to EOA
 * 4. Final:   1.77-1.97 USDC.e ready to trade ✅
 *
 * NOTE: The 1% fee is collected on SELL operations, not on BUY.
 */

import { useState, useCallback } from "react";
import { useTrading } from "@/providers/TradingProvider";
import { useWallet } from "@/providers/WalletContext";
import useBridgeDeposit from "@/hooks/useBridgeDeposit";
import { executeBridgeFlow } from "@/lib/bridgeOperations";
import Safe from "@safe-global/protocol-kit";
import { MetaTransactionData, OperationType, SigningMethod } from "@safe-global/types-kit";
import { encodeFunctionData, erc20Abi, formatUnits, maxUint256, parseUnits } from "viem";
import { getPublicPolygonClient } from "@/utils/polygonGas";
import getMagic from "@/lib/magic";
import { POLYGON_RPC_URL } from "@/constants/api";
import {
  USDC_E_CONTRACT_ADDRESS,
  BUYGAS_CONTRACT_ADDRESS,
  BUYGAS_USDC_E_AMOUNT,
} from "@/constants/tokens";
import { HOOKS_ZERO } from "@/constants/fullConversion";
import { buyGasAbi } from "@/constants/abis/buyGas";

/**
 * Possible states of the conversion flow.
 */
export type ConversionStep =
  | "idle"
  | "step1-bridging"
  | "step2-buying-gas"
  | "step3-distributing-pol"
  | "completed"
  | "failed";

/**
 * Result of the complete flow.
 */
export interface FullConversionResult {

  success: boolean;

  finalUsdceAmount: bigint;

  gasPurchased: boolean;

  polDistributed: boolean;

  polSentToEoa?: bigint;

  polBalanceSafe: bigint;

  polBalanceEoa: bigint;

  txHashes: {
    bridge: string;
    buyGas?: string; // Optional - only if gas was purchased
    distributePol?: string; // Optional - only if POL was distributed
  };
}

export default function useFullConversion() {
  const { safeAddress } = useTrading();
  const { eoaAddress } = useWallet();
  const { fetchDepositAddress } = useBridgeDeposit(safeAddress);

  const [step, setStep] = useState<ConversionStep>("idle");
  const [error, setError] = useState<Error | null>(null);

  /**
   * Execute the complete conversion flow.
   *
   * @param usdcAmount - Amount of USDC to convert (bigint, 6 decimals)
   * @returns Result with finalUsdceAmount, gasPurchased, polBalance, txHashes
   * @throws Error if any step fails
   *
   * @example
   * ```typescript
   * const { executeFullConversion, step } = useFullConversion();
   *
   * const result = await executeFullConversion(parseUnits("2", 6));
   * console.log(`Final USDC.e: ${formatUnits(result.finalUsdceAmount, 6)}`);
   * console.log(`Gas purchased: ${result.gasPurchased}`);
   * ```
   */
  const executeFullConversion = useCallback(
    async (usdcAmount: bigint): Promise<FullConversionResult> => {
      if (!safeAddress || !eoaAddress) {
        throw new Error("Trading session not initialized");
      }

      setStep("idle");
      setError(null);

      const publicClient = getPublicPolygonClient();

      // Initialize Safe Protocol Kit (same pattern as useRebalanceToUsdcV2)
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
        // STEP 1: Bridge USDC → USDC.e
        // ================================================================
        setStep("step1-bridging");

        const bridgeResult = await executeBridgeFlow(
          safeProtocolKit,
          fetchDepositAddress,
          usdcAmount,
          {
            onStatusChange: (status) => {
              console.log(`[FullConversion] Bridge status: ${status.kind}`);
            },
            onExtendedWait: (seconds) => {
              console.log(
                `[FullConversion] Bridge taking longer than usual (${seconds}s)...`
              );
            },
          }
        );

        // Leer balance INICIAL de USDC.e antes del polling
        const initialUsdceBalance = (await publicClient.readContract({
          address: USDC_E_CONTRACT_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [safeAddress as `0x${string}`],
        })) as bigint;

        // Polling: Esperar hasta que el balance de USDC.e REALMENTE aumente
        const maxWaitTime = 120_000; // 2 minutos
        const pollInterval = 5_000; // 5 segundos
        const startTime = Date.now();

        let usdceAfterBridge = initialUsdceBalance;

        while (Date.now() - startTime < maxWaitTime) {
          usdceAfterBridge = (await publicClient.readContract({
            address: USDC_E_CONTRACT_ADDRESS,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [safeAddress as `0x${string}`],
          })) as bigint;

          const elapsedSec = Math.floor((Date.now() - startTime) / 1000);

          if (usdceAfterBridge > initialUsdceBalance) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        // Verificar que realmente recibió USDC.e
        if (usdceAfterBridge <= initialUsdceBalance) {
          throw new Error(
            `Bridge timeout: USDC.e not received after ${Math.floor((Date.now() - startTime) / 1000)}s. ` +
            `Initial balance: ${formatUnits(initialUsdceBalance, 6)}, ` +
            `Current balance: ${formatUnits(usdceAfterBridge, 6)}`
          );
        }

        // ================================================================
        // STEP 2: Buy Gas - Only if Safe has < MIN_POL_BALANCE_SAFE
        // ================================================================

        // Check current POL balance
        const currentPolBalance = await publicClient.getBalance({
          address: safeAddress as `0x${string}`,
        });

        const minPolBalanceStr = process.env.NEXT_PUBLIC_MIN_POL_BALANCE_SAFE || "0.5";
        const minPolBalance = parseUnits(minPolBalanceStr, 18);
        const needsGas = currentPolBalance < minPolBalance;

        let buyGasTxHash: string | undefined;
        let finalUsdceAmount = usdceAfterBridge;

        if (needsGas) {
          setStep("step2-buying-gas");

          const buyGasAmount = parseUnits(BUYGAS_USDC_E_AMOUNT, 6);

          // Check allowance for buyGas
          const buyGasAllowance = (await publicClient.readContract({
            address: USDC_E_CONTRACT_ADDRESS,
            abi: erc20Abi,
            functionName: "allowance",
            args: [
              safeAddress as `0x${string}`,
              BUYGAS_CONTRACT_ADDRESS as `0x${string}`,
            ],
          })) as bigint;

          const buyGasTransactions: MetaTransactionData[] = [];

          // Approve if necessary
          if (buyGasAllowance < buyGasAmount) {

            buyGasTransactions.push({
              to: USDC_E_CONTRACT_ADDRESS,
              value: "0",
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "approve",
                args: [
                  BUYGAS_CONTRACT_ADDRESS as `0x${string}`,
                  maxUint256,
                ],
              }),
              operation: OperationType.Call,
            });
          }

          // Call buyGas
          buyGasTransactions.push({
            to: BUYGAS_CONTRACT_ADDRESS,
            value: "0",
            data: encodeFunctionData({
              abi: buyGasAbi,
              functionName: "buyGas",
              args: [buyGasAmount],
            }),
            operation: OperationType.Call,
          });

          // IMPORTANT: Pass non-zero safeTxGas to avoid GS013 error
          // Let Magic/RPC calculate gas price automatically for current network conditions
          let safeTransaction = await safeProtocolKit.createTransaction({
            transactions: buyGasTransactions,
            options: {
              safeTxGas: "350000", // Non-zero gas limit
              baseGas: "0",
              gasPrice: "0", // Let RPC calculate dynamically
              gasToken: HOOKS_ZERO,
              refundReceiver: HOOKS_ZERO,
            },
          });

          // Sign with ETH_SIGN_TYPED_DATA_V4 for Magic compatibility
          safeTransaction = await safeProtocolKit.signTransaction(
            safeTransaction,
            SigningMethod.ETH_SIGN_TYPED_DATA_V4
          );

          // Execute transaction (gas price calculated automatically)
          const buyGasTxResponse = await safeProtocolKit.executeTransaction(
            safeTransaction
          );

          buyGasTxHash = buyGasTxResponse.hash;

          // Wait for confirmation
          if (
            buyGasTxResponse.transactionResponse &&
            typeof buyGasTxResponse.transactionResponse === "object" &&
            "wait" in buyGasTxResponse.transactionResponse &&
            typeof (buyGasTxResponse.transactionResponse as any).wait === "function"
          ) {
            await (
              buyGasTxResponse.transactionResponse as { wait: () => Promise<unknown> }
            ).wait();
          }

          // Balance remaining after buy gas
          finalUsdceAmount = usdceAfterBridge - buyGasAmount;
        } else {
          finalUsdceAmount = usdceAfterBridge;
        }

        // ================================================================
        // STEP 3: Distribute POL - Only if gas was purchased
        // ================================================================

        let distributePolTxHash: string | undefined;
        let polSentToEoa: bigint | undefined;
        let polDistributed = false;

        if (needsGas) {
          setStep("step3-distributing-pol");

          // Get current POL balance in Safe after buying gas
          const polBalanceAfterBuyGas = await publicClient.getBalance({
            address: safeAddress as `0x${string}`,
          });

          // Read POL distribution percentage from env (default 50%)
          const polSafePercentageStr = process.env.NEXT_PUBLIC_POL_SAFE_PERCENTAGE || "50";
          const polSafePercentage = parseFloat(polSafePercentageStr);

          if (polSafePercentage < 0 || polSafePercentage > 100) {
            throw new Error(
              `Invalid POL_SAFE_PERCENTAGE: ${polSafePercentage}. Must be between 0 and 100.`
            );
          }

          // Calculate how much POL to send to EOA
          const polEoaPercentage = 100 - polSafePercentage;
          polSentToEoa = (polBalanceAfterBuyGas * parseUnits(String(Math.floor(polEoaPercentage * 100)), 2)) / parseUnits("1", 4);

          // Create Safe transaction to send POL to EOA
          // POL is the native token, so we just send value without data
          const distributePolTx: MetaTransactionData = {
            to: eoaAddress,
            value: polSentToEoa.toString(),
            data: "0x",
            operation: OperationType.Call,
          };

          let safeTransaction = await safeProtocolKit.createTransaction({
            transactions: [distributePolTx],
            options: {
              safeTxGas: "100000", // Non-zero gas limit for POL transfer
              baseGas: "0",
              gasPrice: "0", // Let RPC calculate dynamically
              gasToken: HOOKS_ZERO,
              refundReceiver: HOOKS_ZERO,
            },
          });

          // Sign with ETH_SIGN_TYPED_DATA_V4 for Magic compatibility
          safeTransaction = await safeProtocolKit.signTransaction(
            safeTransaction,
            SigningMethod.ETH_SIGN_TYPED_DATA_V4
          );

          // Execute transaction
          const distributePolTxResponse = await safeProtocolKit.executeTransaction(
            safeTransaction
          );

          distributePolTxHash = distributePolTxResponse.hash;

          // Wait for confirmation
          if (
            distributePolTxResponse.transactionResponse &&
            typeof distributePolTxResponse.transactionResponse === "object" &&
            "wait" in distributePolTxResponse.transactionResponse &&
            typeof (distributePolTxResponse.transactionResponse as any).wait === "function"
          ) {
            await (
              distributePolTxResponse.transactionResponse as { wait: () => Promise<unknown> }
            ).wait();
          }

          polDistributed = true;
        } else {
          console.log("[FullConversion] Skipping POL distribution - gas was not purchased");
        }

        // ================================================================
        // COMPLETED
        // ================================================================

        // Get final POL balances
        const finalPolBalanceSafe = await publicClient.getBalance({
          address: safeAddress as `0x${string}`,
        });
        const finalPolBalanceEoa = await publicClient.getBalance({
          address: eoaAddress as `0x${string}`,
        });

        setStep("completed");
        if (polSentToEoa) {
          console.log(
            `[FullConversion] POL sent to EOA: ${formatUnits(polSentToEoa, 18)} POL`
          );
        }

        return {
          success: true,
          finalUsdceAmount,
          gasPurchased: needsGas,
          polDistributed,
          polSentToEoa,
          polBalanceSafe: finalPolBalanceSafe,
          polBalanceEoa: finalPolBalanceEoa,
          txHashes: {
            bridge: bridgeResult.txHash,
            ...(buyGasTxHash && { buyGas: buyGasTxHash }),
            ...(distributePolTxHash && { distributePol: distributePolTxHash }),
          },
        };
      } catch (err) {
        console.error("[FullConversion] Error:", err);
        setStep("failed");
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      }
    },
    [safeAddress, eoaAddress, fetchDepositAddress]
  );

  return {
    executeFullConversion,
    step,
    error,
  };
}
