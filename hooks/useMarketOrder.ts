"use client";

/**
 * Simplified hook for executing orders on Polymarket.
 *
 * Simplified flow:
 * 1. If Safe has enough USDC.e → execute order directly
 * 2. If not → claim gas for EOA (if needed) + swap Safe's USDC → USDC.e → execute order
 *
 * We assume the Safe ALWAYS has native USDC deposited.
 *
 * NOTE: The 1% platform fee is collected on SELL orders, not on BUY orders.
 */

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTrading } from "@/providers/TradingProvider";
import usePolygonBalances from "@/hooks/usePolygonBalances";
import useNewFullConversion from "@/hooks/useNewFullConversion";
import usePostSellFlow from "@/hooks/usePostSellFlow";
import useClobOrder, { type OrderParams } from "@/hooks/useClobOrder";
import { parseUsdcAmount, formatUsdcAmount } from "@/utils/bridge";
import { USDC_E_CONTRACT_ADDRESS } from "@/constants/tokens";
import { erc20Abi, parseUnits } from "viem";
import { getPublicPolygonClient } from "@/utils/polygonGas";
import { Side } from "@polymarket/clob-client";

export type MarketOrderStatus =
  | "idle"
  | "checking-balance"
  | "full-conversion" // Bridge + buy gas (for BUY orders)
  | "placing-order"
  | "swapping-to-usdc" // Fee + swap USDC.e → USDC (for SELL orders)
  | "completed"
  | "failed";

export type ExecuteOrderParams = {
  tokenId: string;
  /** USD amount user wants to bet (will be converted via full flow if needed) */
  amount: number;
  /** Size in shares, passed to submitOrder */
  size: number;
  side: "BUY" | "SELL";
  price?: number;
  isMarketOrder?: boolean;
  negRisk?: boolean;
};

function throwInsufficientBalance(
  rawUsdc: bigint,
  rawNativeUsdc: bigint,
  required: number
): never {
  const availableUsdce = formatUsdcAmount(rawUsdc);
  const availableUsdc = formatUsdcAmount(rawNativeUsdc);
  const err = new Error(
    `Insufficient balance. You need at least $${required.toFixed(2)} USDC in your Safe. ` +
    `Available: $${availableUsdce.toFixed(2)} USDC.e + $${availableUsdc.toFixed(2)} USDC. ` +
    `Fund your Safe via Deposit to add more.`
  ) as Error & { code?: string };
  err.code = "INSUFFICIENT_BALANCE";
  throw err;
}

export default function useMarketOrder() {
  const { safeAddress, clobClient } = useTrading();
  const queryClient = useQueryClient();
  const { rawUsdcBalance, rawNativeUsdcBalance } = usePolygonBalances(safeAddress);
  const { executeNewConversion, step: conversionStep, message: conversionMessage } = useNewFullConversion();
  const { executePostSellFlow, step: postSellStep } = usePostSellFlow();
  const { submitOrder } = useClobOrder(clobClient, safeAddress);

  const [isExecuting, setIsExecuting] = useState(false);
  const [status, setStatus] = useState<MarketOrderStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [sellMessage, setSellMessage] = useState("");

  const executeOrder = useCallback(
    async (
      params: ExecuteOrderParams
    ): Promise<{ success: boolean; orderId?: string; conversionPerformed?: boolean }> => {
      if (!safeAddress || !clobClient) {
        throw new Error("Trading session not initialized");
      }

      setIsExecuting(true);
      setStatus("checking-balance");
      setError(null);
      setSellMessage("");

      const requiredUsdce = parseUsdcAmount(params.amount);
      const rawUsdc = rawUsdcBalance ?? parseUnits("0", 6);
      const rawNative = rawNativeUsdcBalance ?? parseUnits("0", 6);

      try {
        // ================================================================
        // SELL ORDER: Execute post-sell flow after selling shares
        // ================================================================
        if (params.side === "SELL") {
          // Execute sell order
          setStatus("placing-order");
          const orderParams: OrderParams = {
            tokenId: params.tokenId,
            size: params.size,
            price: params.price,
            side: params.side,
            isMarketOrder: params.isMarketOrder,
            negRisk: params.negRisk,
          };

          const result = await submitOrder(orderParams);

          // Invalidate balance queries to get fresh data
          queryClient.invalidateQueries({ queryKey: ["usdcBalance", safeAddress] });

          // Wait for CLOB to settle the sale and update balances


          const publicClient = getPublicPolygonClient();

          // Read INITIAL balance before waiting
          const initialUsdceBalance = (await publicClient.readContract({
            address: USDC_E_CONTRACT_ADDRESS,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [safeAddress as `0x${string}`],
          })) as bigint;

          const sellPollMessages = [
            "Procesando tu venta...",
            "Confirmando en el mercado...",
            "Tu venta se está procesando...",
            "Esperando confirmación...",
            "Ya casi está...",
            "Solo un momento más...",
          ];

          let currentUsdceBalance = initialUsdceBalance;
          const maxAttempts = 15; // 15 attempts * 2 seconds = 30 seconds max
          let attempts = 0;

          // Poll balance until it INCREASES or timeout
          while (currentUsdceBalance <= initialUsdceBalance && attempts < maxAttempts) {
            setSellMessage(sellPollMessages[Math.min(attempts, sellPollMessages.length - 1)]);
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds between checks
            attempts++;

            currentUsdceBalance = (await publicClient.readContract({
              address: USDC_E_CONTRACT_ADDRESS,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [safeAddress as `0x${string}`],
            })) as bigint;

            if (currentUsdceBalance > initialUsdceBalance) {
              break;
            }
          }

          if (currentUsdceBalance <= initialUsdceBalance) {
            throw new Error(
              `Sale settlement timeout: USDC.e balance did not increase after ${attempts * 2}s. ` +
              `Initial: ${formatUsdcAmount(initialUsdceBalance)}, Current: ${formatUsdcAmount(currentUsdceBalance)}`
            );
          }

          // Execute post-sell flow (fee + swap)
          setSellMessage("Cobrando comisión y convirtiendo...");
          await executePostSellFlow(currentUsdceBalance);

          // Update status based on post-sell step
          if (postSellStep === "swapping") {
            setStatus("swapping-to-usdc");
          }

          // Invalidate all balance and position queries
          queryClient.invalidateQueries({ queryKey: ["usdcBalance", safeAddress] });
          queryClient.invalidateQueries({ queryKey: ["nativeUsdcBalance", safeAddress] });
          queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] });

          setStatus("completed");
          return {
            success: true,
            orderId: result.orderId,
            conversionPerformed: false,
          };
        }

        // ================================================================
        // BUY ORDER PATH 0: Safe already has enough USDC.e
        // ================================================================
        if (rawUsdc >= requiredUsdce) {
          setStatus("placing-order");
          const orderParams: OrderParams = {
            tokenId: params.tokenId,
            size: params.size,
            price: params.price,
            side: params.side,
            isMarketOrder: params.isMarketOrder,
            negRisk: params.negRisk,
          };
          const result = await submitOrder(orderParams);
          setStatus("completed");
          return {
            success: true,
            orderId: result.orderId,
            conversionPerformed: false,
          };
        }

        // ================================================================
        // BUY ORDER PATH 1: Execute full flow (bridge + optional buy gas)
        // ================================================================

        // Verify that the Safe has enough native USDC
        if (rawNative < requiredUsdce) {
          throwInsufficientBalance(rawUsdc, rawNative, params.amount);
        }

        setStatus("full-conversion");

        // Execute new flow: claim gas (if needed) + swap USDC → USDC.e
        const conversionResult = await executeNewConversion(requiredUsdce);

        // Invalidate caches
        queryClient.invalidateQueries({ queryKey: ["usdcBalance", safeAddress] });
        queryClient.invalidateQueries({
          queryKey: ["nativeUsdcBalance", safeAddress],
        });
        queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] });

        // ================================================================
        // Adjust order size based on final available USDC.e
        // ================================================================

        // Use the final amount from conversion result (more reliable than reading on-chain immediately)
        const actualSafeBalanceUsd = formatUsdcAmount(conversionResult.finalUsdceAmount);

        // Get the REAL ask price from the orderbook (this is what CLOB will use)
        const priceResponse = await clobClient.getPrice(
          params.tokenId,
          Side.SELL // Get sell side price = ask price for buyers
        );
        const realAskPrice = parseFloat(priceResponse.price);

        if (isNaN(realAskPrice) || realAskPrice <= 0 || realAskPrice >= 1) {
          throw new Error("Unable to get valid market price from orderbook");
        }

        // Use 98% of available balance — BuyUsdce fee (1%) already applied,
        // just keep 2% buffer for CLOB rounding and minor price movement
        const safeBalanceWithMargin = actualSafeBalanceUsd * 0.98;
        const maxAffordableSize = safeBalanceWithMargin / realAskPrice;
        const adjustedSize = Math.min(params.size, maxAffordableSize);

        // ================================================================
        // Execute order with adjusted size
        // ================================================================

        // Wait for CLOB to see updated Safe balance
        await new Promise((resolve) => setTimeout(resolve, 3000));

        setStatus("placing-order");

        const orderParams: OrderParams = {
          tokenId: params.tokenId,
          size: adjustedSize,
          price: params.price,
          side: params.side,
          isMarketOrder: params.isMarketOrder,
          negRisk: params.negRisk,
        };

        const result = await submitOrder(orderParams);

        setStatus("completed");
        return {
          success: true,
          orderId: result.orderId,
          conversionPerformed: true,
        };
      } catch (err) {
        console.error("Error details:", {
          message: (err as Error).message,
          stack: (err as Error).stack,
        });
        setStatus("failed");
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsExecuting(false);
      }
    },
    [
      safeAddress,
      clobClient,
      rawUsdcBalance,
      rawNativeUsdcBalance,
      executeNewConversion,
      submitOrder,
      queryClient,
    ]
  );

  // Combine progress messages: conversion (BUY flow) or sell polling (SELL flow)
  const progressMessage = conversionMessage || sellMessage;

  return {
    executeOrder,
    isExecuting,
    status,
    conversionStep,
    postSellStep,
    progressMessage,
    error,
  };
}
