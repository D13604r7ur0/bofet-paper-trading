"use client";

/**
 * New full conversion hook — replaces useFullConversion.
 *
 * Orchestrates the pre-order flow for BUY orders:
 *
 * Step 1: Claim Gas (SendGas)
 *   - Check Redis (via GET /api/send-gas) — if already claimed, skip instantly
 *   - If not claimed: EOA signs EIP-712, relayer executes claimGasFor()
 *   - Poll EOA's POL balance until it increases (confirms gas arrived)
 *
 * Step 2: Swap USDC → USDC.e (BuyUsdce)
 *   - Safe executes swapUsdcForUsdCe() on-chain (EOA pays gas with claimed POL)
 *   - Poll Safe's USDC.e balance until it increases (confirms swap settled)
 *
 * After both steps, Safe has USDC.e ready for the market order.
 *
 * Exposes `message` — a friendly progress string the UI can display directly.
 */

import { useState, useCallback } from "react";
import { useTrading } from "@/providers/TradingProvider";
import { useWallet } from "@/providers/WalletContext";
import Safe from "@safe-global/protocol-kit";
import { MetaTransactionData, OperationType, SigningMethod } from "@safe-global/types-kit";
import { encodeFunctionData, erc20Abi, formatUnits, maxUint256, parseUnits } from "viem";
import { getPublicPolygonClient } from "@/utils/polygonGas";
import getMagic from "@/lib/magic";
import { POLYGON_RPC_URL } from "@/constants/api";
import {
  USDC_CONTRACT_ADDRESS,
  USDC_E_CONTRACT_ADDRESS,
  BUY_USDCE_CONTRACT_ADDRESS,
  SEND_GAS_CONTRACT_ADDRESS,
} from "@/constants/tokens";
import { HOOKS_ZERO } from "@/constants/fullConversion";
import { buyUsdceAbi } from "@/constants/abis/buyUsdce";

// ─── Types ───────────────────────────────────────────────

export type NewConversionStep =
  | "idle"
  | "step1-claiming-gas"
  | "step1-polling-gas"
  | "step2-swapping"
  | "step2-polling-usdce"
  | "completed"
  | "failed";

export interface NewConversionResult {
  success: boolean;
  /** USDC.e available in Safe after the swap */
  finalUsdceAmount: bigint;
  /** Whether gas was claimed in this run (false if already claimed) */
  gasClaimed: boolean;
  txHashes: {
    swap: string;
    claimGas?: string;
  };
}

// ─── Constants ───────────────────────────────────────────

const EIP712_DOMAIN = {
  name: "SendGas",
  version: "1",
  chainId: 137,
  verifyingContract: SEND_GAS_CONTRACT_ADDRESS,
} as const;

const EIP712_TYPES = {
  ClaimGasFor: [
    { name: "recipient", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** Poll intervals & timeouts */
const POL_POLL_INTERVAL = 3_000;   // 3 seconds
const POL_POLL_TIMEOUT = 60_000;   // 1 minute
const USDCE_POLL_INTERVAL = 3_000; // 3 seconds
const USDCE_POLL_TIMEOUT = 60_000; // 1 minute

// ─── Progress messages (friendly, non-technical) ─────────

const GAS_POLL_MESSAGES = [
  "Confirmando transacción...",
  "Estamos preparando todo...",
  "Ya casi llega...",
  "Solo un momento más...",
  "Casi listo, gracias por esperar...",
];

const USDCE_POLL_MESSAGES = [
  "Confirmando la conversión...",
  "Tu balance se está actualizando...",
  "Ya casi está listo...",
  "Un momento más...",
  "Finalizando, ya casi...",
];

function getProgressMessage(messages: string[], attempt: number): string {
  const index = Math.min(attempt, messages.length - 1);
  return messages[index];
}

// ─── Hook ────────────────────────────────────────────────

export default function useNewFullConversion() {
  const { safeAddress } = useTrading();
  const { eoaAddress, walletClient } = useWallet();

  const [step, setStep] = useState<NewConversionStep>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [message, setMessage] = useState("");

  const executeNewConversion = useCallback(
    async (usdcAmount: bigint): Promise<NewConversionResult> => {
      if (!safeAddress || !eoaAddress || !walletClient) {
        throw new Error("Trading session not initialized");
      }

      setStep("idle");
      setError(null);
      setMessage("Iniciando...");

      const publicClient = getPublicPolygonClient();
      let gasClaimed = false;
      let claimGasTxHash: string | undefined;

      try {
        // ================================================================
        // STEP 1: Claim Gas (if not already claimed)
        // ================================================================

        // 1a. Check Redis — fast, no gas cost
        setMessage("Verificando tu cuenta...");
        const checkRes = await fetch(`/api/send-gas?address=${eoaAddress}`);
        const checkData = await checkRes.json();
        const alreadyClaimed = checkData?.hasClaimed === true;

        if (!alreadyClaimed) {
          setStep("step1-claiming-gas");
          setMessage("Firma para reclamar gas...");

          // Read initial EOA POL balance BEFORE claiming
          const initialEoaPol = await publicClient.getBalance({
            address: eoaAddress as `0x${string}`,
          });

          console.log(
            `[NewFullConversion] EOA POL before claim: ${formatUnits(initialEoaPol, 18)}`
          );

          // Sign EIP-712
          const deadline = Math.floor(Date.now() / 1000) + 600;

          const signature = await walletClient.signTypedData({
            account: eoaAddress,
            domain: EIP712_DOMAIN,
            types: EIP712_TYPES,
            primaryType: "ClaimGasFor",
            message: {
              recipient: eoaAddress,
              deadline: parseUnits(String(deadline), 0),
            },
          });

          setMessage("Procesando tu gas...");

          // POST to relayer
          const claimRes = await fetch("/api/send-gas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: eoaAddress,
              deadline,
              signature,
            }),
          });

          const claimData = await claimRes.json();

          if (!claimRes.ok) {
            throw new Error(claimData.error || `Claim gas failed (${claimRes.status})`);
          }

          claimGasTxHash = claimData.transactionHash;
          gasClaimed = true;

          console.log(`[NewFullConversion] Gas claimed: ${claimGasTxHash}`);

          // 1b. Poll EOA POL balance until it increases
          setStep("step1-polling-gas");

          const polPollStart = Date.now();
          let currentEoaPol = initialEoaPol;
          let polAttempt = 0;

          while (Date.now() - polPollStart < POL_POLL_TIMEOUT) {
            setMessage(getProgressMessage(GAS_POLL_MESSAGES, polAttempt));

            currentEoaPol = await publicClient.getBalance({
              address: eoaAddress as `0x${string}`,
            });

            if (currentEoaPol > initialEoaPol) {
              console.log(
                `[NewFullConversion] EOA POL arrived: ${formatUnits(currentEoaPol, 18)}`
              );
              break;
            }

            polAttempt++;
            await new Promise((r) => setTimeout(r, POL_POLL_INTERVAL));
          }

          if (currentEoaPol <= initialEoaPol) {
            throw new Error(
              `Gas claim timeout: EOA POL balance did not increase after ${Math.floor(
                (Date.now() - polPollStart) / 1000
              )}s`
            );
          }
        } else {
          console.log("[NewFullConversion] Gas already claimed, skipping step 1");
        }

        // ================================================================
        // STEP 2: Swap Safe's native USDC → USDC.e via BuyUsdce
        // ================================================================
        setStep("step2-swapping");
        setMessage("Preparando la conversión...");

        // Read Safe's USDC.e balance BEFORE swap
        const usdceBeforeSwap = (await publicClient.readContract({
          address: USDC_E_CONTRACT_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [safeAddress as `0x${string}`],
        })) as bigint;

        console.log(
          `[NewFullConversion] Safe USDC.e before swap: ${formatUnits(usdceBeforeSwap, 6)}`
        );

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

        // Build batch: approve (if needed) + swap
        const batch: MetaTransactionData[] = [];

        const allowance = (await publicClient.readContract({
          address: USDC_CONTRACT_ADDRESS,
          abi: erc20Abi,
          functionName: "allowance",
          args: [safeAddress as `0x${string}`, BUY_USDCE_CONTRACT_ADDRESS],
        })) as bigint;

        if (allowance < usdcAmount) {
          batch.push({
            to: USDC_CONTRACT_ADDRESS,
            value: "0",
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [BUY_USDCE_CONTRACT_ADDRESS, maxUint256],
            }),
            operation: OperationType.Call,
          });
        }

        batch.push({
          to: BUY_USDCE_CONTRACT_ADDRESS,
          value: "0",
          data: encodeFunctionData({
            abi: buyUsdceAbi,
            functionName: "swapUsdcForUsdCe",
            args: [usdcAmount],
          }),
          operation: OperationType.Call,
        });

        console.log(`[NewFullConversion] Swap batch: ${batch.length} operations`);

        setMessage("Firma para convertir USDC...");

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

        setMessage("Ejecutando conversión...");

        const txResponse = await safeProtocolKit.executeTransaction(safeTransaction);
        const swapTxHash = txResponse.hash;

        console.log(`[NewFullConversion] Swap tx sent: ${swapTxHash}`);

        // Wait for tx confirmation
        if (
          txResponse.transactionResponse &&
          typeof txResponse.transactionResponse === "object" &&
          "wait" in txResponse.transactionResponse &&
          typeof (txResponse.transactionResponse as any).wait === "function"
        ) {
          await (txResponse.transactionResponse as { wait: () => Promise<unknown> }).wait();
          console.log("[NewFullConversion] Swap tx confirmed");
        }

        // 2b. Poll Safe's USDC.e balance until it increases
        setStep("step2-polling-usdce");

        const usdcePollStart = Date.now();
        let usdceAfterSwap = usdceBeforeSwap;
        let usdceAttempt = 0;

        while (Date.now() - usdcePollStart < USDCE_POLL_TIMEOUT) {
          setMessage(getProgressMessage(USDCE_POLL_MESSAGES, usdceAttempt));

          usdceAfterSwap = (await publicClient.readContract({
            address: USDC_E_CONTRACT_ADDRESS,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [safeAddress as `0x${string}`],
          })) as bigint;

          if (usdceAfterSwap > usdceBeforeSwap) {
            console.log(
              `[NewFullConversion] Safe USDC.e arrived: ${formatUnits(usdceAfterSwap, 6)}`
            );
            break;
          }

          usdceAttempt++;
          await new Promise((r) => setTimeout(r, USDCE_POLL_INTERVAL));
        }

        if (usdceAfterSwap <= usdceBeforeSwap) {
          throw new Error(
            `Swap timeout: Safe USDC.e balance did not increase after ${Math.floor(
              (Date.now() - usdcePollStart) / 1000
            )}s. Before: ${formatUnits(usdceBeforeSwap, 6)}, After: ${formatUnits(
              usdceAfterSwap,
              6
            )}`
          );
        }

        // ================================================================
        // COMPLETED
        // ================================================================
        setStep("completed");
        setMessage("Listo, colocando tu orden...");

        return {
          success: true,
          finalUsdceAmount: usdceAfterSwap,
          gasClaimed,
          txHashes: {
            swap: swapTxHash,
            ...(claimGasTxHash && { claimGas: claimGasTxHash }),
          },
        };
      } catch (err) {
        console.error("[NewFullConversion] Error:", err);
        setStep("failed");
        setMessage("");
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      }
    },
    [safeAddress, eoaAddress, walletClient]
  );

  return {
    executeNewConversion,
    step,
    message,
    error,
  };
}
