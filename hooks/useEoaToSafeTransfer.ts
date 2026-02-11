"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, parseUnits } from "viem";
import { polygon } from "viem/chains";
import { useWallet } from "@/providers/WalletContext";
import { useTrading } from "@/providers/TradingProvider";
import { buildEoaTransferUsdceToSafe } from "@/utils/transfer";
import {
  getPolygonEip1559GasParams,
  getPublicPolygonClient,
} from "@/utils/polygonGas";
import { formatUsdcAmount } from "@/utils/bridge";
import { USDC_E_CONTRACT_ADDRESS } from "@/constants/tokens";

const MAGIC_RATE_LIMIT_RETRY_MS = 15_000;

function isMagicRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const causeMsg =
    err instanceof Error &&
    (err as Error & { cause?: { message?: string } }).cause?.message
      ? (err as Error & { cause: { message?: string } }).cause.message
      : "";
  const details =
    typeof (err as Error & { details?: string })?.details === "string"
      ? (err as Error & { details: string }).details
      : "";
  const fullText = [msg, causeMsg, details].filter(Boolean).join(" ");

  // Check if it's an insufficient funds error (not rate limit)
  if (fullText.includes("insufficient funds") || fullText.includes("exceeds the balance")) {
    return false;
  }

  return (
    fullText.includes("rate limit exhausted") ||
    fullText.includes("retry in") ||
    fullText.includes("Too many requests")
  );
}

export default function useEoaToSafeTransfer() {
  const { eoaAddress, walletClient, publicClient } = useWallet();
  const { safeAddress } = useTrading();
  const queryClient = useQueryClient();

  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const transferUsdceToSafe = useCallback(
    async (amount: bigint, options?: { useActualBalance?: boolean }): Promise<void> => {
      if (!eoaAddress) {
        throw new Error("Wallet not connected");
      }
      if (!safeAddress) {
        throw new Error("Trading session not initialized; Safe address unknown");
      }
      if (!walletClient || !publicClient) {
        throw new Error("Wallet not ready for transactions");
      }

      setIsTransferring(true);
      setError(null);

      // If requested, read actual balance from blockchain instead of using provided amount
      let actualAmount = amount;
      if (options?.useActualBalance) {
        console.log("📊 [useEoaToSafeTransfer] Leyendo balance real del EOA desde blockchain...");
        const publicRpc = getPublicPolygonClient();

        // Retry reading balance until it's available (bridge transaction confirmed)
        let balance = parseUnits("0", 6);
        const maxReadAttempts = 10;
        for (let attempt = 0; attempt < maxReadAttempts; attempt++) {
          balance = await publicRpc.readContract({
            address: USDC_E_CONTRACT_ADDRESS as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [eoaAddress],
          }) as bigint;

          console.log(`💰 [useEoaToSafeTransfer] Intento ${attempt + 1}/${maxReadAttempts} - Balance leído:`, {
            expected: formatUsdcAmount(amount),
            actual: formatUsdcAmount(balance),
          });

          if (balance > parseUnits("0", 6)) {
            console.log("✅ [useEoaToSafeTransfer] Balance encontrado!");
            break;
          }

          if (attempt < maxReadAttempts - 1) {
            const waitTime = 2000 + (attempt * 1000); // 2s, 3s, 4s, 5s...
            console.log(`⏳ [useEoaToSafeTransfer] Balance aún 0, esperando ${waitTime / 1000}s antes de reintentar...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }

        if (balance === parseUnits("0", 6)) {
          throw new Error("Bridge conversion completed but USDC.e not yet visible in EOA after multiple retries. Please try again in a moment.");
        }

        actualAmount = balance;
      }

      console.log("🚀 [useEoaToSafeTransfer] Iniciando transferencia", {
        from: eoaAddress,
        to: safeAddress,
        amount: formatUsdcAmount(actualAmount),
      });

      try {
        const tx = buildEoaTransferUsdceToSafe(safeAddress, actualAmount);
        const publicRpc = getPublicPolygonClient();
        const gasParams = await getPolygonEip1559GasParams(publicRpc);
        let hash: `0x${string}` | null = null;
        let lastSendErr: unknown;

        // Retry up to 5 times for "transfer amount exceeds balance" (waiting for bridge confirmations)
        const maxAttempts = 5;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            console.log(`📤 [useEoaToSafeTransfer] Intento ${attempt + 1} de ${maxAttempts} sendTransaction...`);

            // For attempts after the first, skip gas estimation by providing a fixed gas limit
            // This avoids reading from stale RPC cache during estimateGas
            const txParams: any = {
              account: eoaAddress,
              chain: polygon,
              to: tx.to,
              data: tx.data,
              value: tx.value,
              maxFeePerGas: gasParams.maxFeePerGas,
              maxPriorityFeePerGas: gasParams.maxPriorityFeePerGas,
            };

            // After first attempt, use fixed gas limit to skip estimation
            if (attempt > 0) {
              txParams.gas = parseUnits("100000", 0); // ERC20 transfer typically uses ~65k gas
              console.log("🔧 [useEoaToSafeTransfer] Usando gas fijo (100k) para skip estimateGas en retry");
            }

            hash = await walletClient.sendTransaction(txParams);
            console.log("✅ [useEoaToSafeTransfer] sendTransaction exitoso, hash:", hash);
            break;
          } catch (sendErr) {
            console.error(`❌ [useEoaToSafeTransfer] sendTransaction intento ${attempt + 1} falló:`, sendErr);
            lastSendErr = sendErr;

            const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);

            // Check if it's "transfer amount exceeds balance" - bridge not confirmed yet
            if (errMsg.includes("transfer amount exceeds balance")) {
              if (attempt < maxAttempts - 1) {
                // Wait progressively longer: 3s, 5s, 7s, 9s
                const waitTime = 3000 + (attempt * 2000);
                console.log(`⏳ [useEoaToSafeTransfer] Balance aún no disponible (bridge confirmando). Esperando ${waitTime / 1000}s antes de reintentar...`);
                await new Promise((r) => setTimeout(r, waitTime));
                console.log("🔄 [useEoaToSafeTransfer] Reintentando transferencia...");
                continue;
              } else {
                console.error("🚫 [useEoaToSafeTransfer] Balance no disponible después de múltiples intentos");
                throw new Error(
                  "Bridge conversion is taking longer than expected. Please try again in a moment."
                );
              }
            }

            // Check if it's insufficient funds for gas (POL)
            if (errMsg.includes("insufficient funds")) {
              console.error("💰 [useEoaToSafeTransfer] Fondos insuficientes para gas");
              throw new Error(
                "Insufficient POL/MATIC for gas. Your wallet needs ~0.1 POL to pay for transaction fees. Please add POL/MATIC to your wallet."
              );
            }

            // Check if it's Magic rate limit
            if (isMagicRateLimitError(sendErr)) {
              if (attempt < maxAttempts - 1) {
                console.log(`⏳ [useEoaToSafeTransfer] Rate limit detectado, esperando ${MAGIC_RATE_LIMIT_RETRY_MS / 1000}s...`);
                await new Promise((r) => setTimeout(r, MAGIC_RATE_LIMIT_RETRY_MS));
                console.log("🔄 [useEoaToSafeTransfer] Reintentando después de espera...");
                continue;
              } else {
                console.error("🚫 [useEoaToSafeTransfer] Rate limit persistente después de retry");
                throw new Error(
                  "Too many requests. Please wait a moment and try again."
                );
              }
            }

            // Unknown error - throw it
            throw sendErr;
          }
        }
        if (hash == null) throw lastSendErr;
        console.log("⏳ [useEoaToSafeTransfer] Esperando confirmación de transacción...");
        let lastReceiptErr: unknown;
        let receipt: any;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            console.log(`🔍 [useEoaToSafeTransfer] Intento ${attempt + 1} de waitForTransactionReceipt...`);
            receipt = await publicRpc.waitForTransactionReceipt({ hash });

            // Check if transaction was successful
            if (receipt.status === 'reverted') {
              console.error("❌ [useEoaToSafeTransfer] Transacción FALLÓ (reverted):", receipt);
              throw new Error("Transfer transaction failed: ERC20 transfer amount exceeds balance");
            }

            console.log("✅ [useEoaToSafeTransfer] Transacción confirmada exitosamente");
            lastReceiptErr = null;
            break;
          } catch (waitErr) {
            console.error(`❌ [useEoaToSafeTransfer] waitForTransactionReceipt intento ${attempt + 1} falló:`, waitErr);
            lastReceiptErr = waitErr;
            if (attempt === 0 && isMagicRateLimitError(waitErr)) {
              console.log(`⏳ [useEoaToSafeTransfer] Rate limit en waitForTransactionReceipt, esperando ${MAGIC_RATE_LIMIT_RETRY_MS / 1000}s...`);
              await new Promise((r) => setTimeout(r, MAGIC_RATE_LIMIT_RETRY_MS));
              console.log("🔄 [useEoaToSafeTransfer] Reintentando waitForTransactionReceipt después de espera...");
              continue;
            }
            if (attempt === 1 && isMagicRateLimitError(waitErr)) {
              console.error("🚫 [useEoaToSafeTransfer] Rate limit persistente en waitForTransactionReceipt");
              throw new Error(
                "Too many requests. Please wait a moment and try again."
              );
            }
            throw waitErr;
          }
        }
        if (lastReceiptErr != null) throw lastReceiptErr;

        queryClient.invalidateQueries({ queryKey: ["usdcBalance", safeAddress] });
        queryClient.invalidateQueries({
          queryKey: ["usdcBalance", eoaAddress],
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsTransferring(false);
      }
    },
    [eoaAddress, safeAddress, walletClient, publicClient, queryClient]
  );

  return {
    transferUsdceToSafe,
    isTransferring,
    error,
  };
}
