"use client";

/**
 * Send USDC.e from Safe to EOA using Safe SDK (protocol-kit).
 * Same flow as send_gnosis.ts: createTransaction → signTransaction → executeTransaction.
 * Uses a split provider: sign methods (eth_signTypedData_v4) go to Magic; all other RPC to public Polygon.
 */

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import Safe from "@safe-global/protocol-kit";
import type { MetaTransactionData } from "@safe-global/types-kit";
import { useTrading } from "@/providers/TradingProvider";
import { useWallet } from "@/providers/WalletContext";
import usePolygonBalances from "@/hooks/usePolygonBalances";
import {
  getPolygonEip1559GasParams,
  getPublicPolygonClient,
} from "@/utils/polygonGas";
import { USDC_E_CONTRACT_ADDRESS } from "@/constants/tokens";
import {
  POLYGON_PUBLIC_RPC_URL,
  POLYGON_PRIVATE_RPC_URL,
  getRpcNode,
} from "@/constants/polymarket";
import getMagic from "@/lib/magic";

const SAFE_TX_GAS = "300000";

/** RPC methods that must go to the wallet (Magic): signing + tx broadcast (public RPCs can reject or rate-limit sendRawTransaction). */
const WALLET_RPC_METHODS = new Set([
  "eth_signTypedData_v4",
  "eth_signTypedData",
  "eth_sign",
  "personal_sign",
  "eth_sendRawTransaction",
  "eth_sendTransaction",
]);

/**
 * EIP-1193 provider: sign + tx broadcast → Magic; all other RPC → public Polygon.
 * - Sign methods (eth_signTypedData_v4 etc.): public RPCs don't support them.
 * - eth_sendRawTransaction: public RPCs can reject or rate-limit it (per debug_swap_EOA.txt); Magic accepts broadcast.
 */
function createSplitProvider(publicRpcUrl: string): {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
} {
  const magic = typeof window !== "undefined" ? getMagic() : null;
  const magicProvider = magic?.rpcProvider as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | undefined;

  return {
    async request(args: { method: string; params?: unknown[] | object }): Promise<unknown> {
      const useWalletRpc = WALLET_RPC_METHODS.has(args.method);
      if (useWalletRpc && magicProvider) {
        return magicProvider.request({ method: args.method, params: Array.isArray(args.params) ? args.params : undefined });
      }
      // JSON-RPC params must be an array (e.g. [tx, blockTag] for eth_call)
      const params = args.params == null ? [] : Array.isArray(args.params) ? args.params : [args.params];
      const res = await fetch(publicRpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: args.method,
          params,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`RPC HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        result?: unknown;
        error?: { code?: number; message?: string; data?: string };
      };
      if (data.error) {
        const msg = data.error.message ?? "RPC error";
        const dataStr = data.error.data != null ? ` (data: ${String(data.error.data).slice(0, 100)})` : "";
        throw new Error(`${msg}${dataStr}`);
      }
      return data.result;
    },
  };
}

export default function useSafeToEoaTransfer() {
  const { safeAddress } = useTrading();
  const { eoaAddress, publicClient } = useWallet();
  const { rawUsdcBalance } = usePolygonBalances(safeAddress);
  const queryClient = useQueryClient();

  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const transferSafeUsdceToEoa = useCallback(
    async (amount?: bigint): Promise<void> => {
      if (!safeAddress || !eoaAddress) {
        throw new Error("Trading session not initialized");
      }
      const balance = rawUsdcBalance ?? parseUnits("0", 6);
      const sendAmount = amount ?? balance;
      if (sendAmount <= parseUnits("0", 6)) {
        throw new Error("No USDC.e balance in Safe to send");
      }

      // Split provider: sign methods (eth_signTypedData_v4) → Magic; all other RPC → public Polygon (avoids rate limit + signing works).
      const rpcNode = getRpcNode();
      const publicRpcUrl =
        rpcNode === "private" ? POLYGON_PRIVATE_RPC_URL : POLYGON_PUBLIC_RPC_URL;
      if (!publicRpcUrl) {
        throw new Error("No provider available for Safe SDK");
      }
      const provider = createSplitProvider(publicRpcUrl);

      setIsTransferring(true);
      setError(null);

      try {
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [eoaAddress as `0x${string}`, sendAmount],
        });

        const metaTx: MetaTransactionData = {
          to: USDC_E_CONTRACT_ADDRESS,
          value: "0",
          data,
          operation: 0, // Call
        };

        const protocolKit = await Safe.init({
          provider,
          signer: eoaAddress,
          safeAddress,
        });

        const safeTransaction = await protocolKit.createTransaction({
          transactions: [metaTx],
          onlyCalls: true,
          options: {
            safeTxGas: SAFE_TX_GAS,
            baseGas: "0",
            gasPrice: "0",
            gasToken: "0x0000000000000000000000000000000000000000",
            refundReceiver: "0x0000000000000000000000000000000000000000",
          },
        });

        const signedTx = await protocolKit.signTransaction(safeTransaction);

        // Always use dedicated public Polygon RPC for gas so we never hit polygon-rpc.com or Magic (rate limit).
        const feeClient = getPublicPolygonClient();
        const gasParams = await getPolygonEip1559GasParams(feeClient);
        const txOptions = {
          maxFeePerGas: gasParams.maxFeePerGas.toString(),
          maxPriorityFeePerGas: gasParams.maxPriorityFeePerGas.toString(),
        };

        const isMagicRpcError = (msg: string) =>
          /Magic RPC Error.*-32603|Magic RPC Error.*-32090|rate limit exhausted|retry in \d+s|Failed to fetch/.test(msg);
        const retryDelayMs = (msg: string) => {
          const m = msg.match(/retry in (\d+)s/);
          if (m) return Math.min(12000, (parseInt(m[1], 10) + 1) * 1000);
          return msg.includes("Failed to fetch") ? 5000 : 2000;
        };
        const maxAttempts = 3;
        let lastErr: Error | null = null;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            const txResponse = await protocolKit.executeTransaction(
              signedTx,
              txOptions
            );
            lastErr = null;
            if (txResponse?.hash) {
              const publicRpc = getPublicPolygonClient();
              await publicRpc.waitForTransactionReceipt({ hash: txResponse.hash as `0x${string}` });
              queryClient.invalidateQueries({ queryKey: ["usdcBalance", safeAddress] });
              queryClient.invalidateQueries({ queryKey: ["usdcBalance", eoaAddress] });
            }
            break;
          } catch (execErr) {
            lastErr = execErr instanceof Error ? execErr : new Error(String(execErr));
            const msg = lastErr.message;
            const canRetry = attempt < maxAttempts - 1 && isMagicRpcError(msg);
            if (canRetry) {
              const delay = retryDelayMs(msg);
              await new Promise((r) => setTimeout(r, delay));
              continue;
            }
            throw lastErr;
          }
        }
        if (lastErr) throw lastErr;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsTransferring(false);
      }
    },
    [safeAddress, eoaAddress, rawUsdcBalance, queryClient, publicClient]
  );

  return {
    transferSafeUsdceToEoa,
    isTransferring,
    error,
    safeUsdcBalance: rawUsdcBalance ?? parseUnits("0", 6),
  };
}
