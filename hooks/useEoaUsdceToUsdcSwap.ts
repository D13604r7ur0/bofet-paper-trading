"use client";

/**
 * EOA USDC.e → Native USDC swap via Uniswap V4 (Permit2 + Universal Router).
 * Ref: swap_test/swap_EOA.ts; plan: USDC.e to USDC.txt.
 * Does NOT use the bridge flow (useEoaBridgeConvert / Polygon Bridge).
 */

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { encodeFunctionData, erc20Abi, maxUint160, maxUint256, parseUnits } from "viem";
import { polygon } from "viem/chains";
import { useWallet } from "@/providers/WalletContext";
import usePolygonBalances from "@/hooks/usePolygonBalances";
import { getSwapQuote } from "@/utils/uniswapV4Quote";
import { buildEoaUsdceToUsdcExecutePayload } from "@/utils/uniswapV4EoaExecute";
import {
  getPolygonEip1559GasParams,
  getPublicPolygonClient,
} from "@/utils/polygonGas";
import { USDC_E_CONTRACT_ADDRESS } from "@/constants/tokens";
import {
  UNISWAP_V4_UNIVERSAL_ROUTER,
  UNISWAP_V4_PERMIT2,
} from "@/constants/uniswap";
import {
  universalRouterAbi,
  permit2Abi,
} from "@/constants/abis/uniswapV4";


const WAIT_TIMEOUT_MS = 120_000; // 2 min per debug_swap_EOA.txt
const PENDING_TX_POLL_MS = 8_000; // 8 s between checks (debug_swap_EOA.txt)
const PENDING_TX_TIMEOUT_MS = 180_000; // 3 min max wait for no pending (debug_swap_EOA.txt §1, §20)
const SLIPPAGE_BPS = 200; // 2%
const DEADLINE_SEC = 3600; // 1 hour

/** Wait until no pending txs for EOA to avoid REPLACEMENT_UNDERPRICED / nonce issues (debug_swap_EOA.txt §1). */
async function waitForNoPendingTx(
  publicClient: { getTransactionCount: (args: { address: `0x${string}`; blockTag: "latest" | "pending" }) => Promise<number> },
  address: `0x${string}`
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < PENDING_TX_TIMEOUT_MS) {
    const [latest, pending] = await Promise.all([
      publicClient.getTransactionCount({ address, blockTag: "latest" }),
      publicClient.getTransactionCount({ address, blockTag: "pending" }),
    ]);
    if (pending <= latest) return;
    await new Promise((r) => setTimeout(r, PENDING_TX_POLL_MS));
  }
  throw new Error(
    `Timeout waiting for pending tx(s) to clear after ${PENDING_TX_TIMEOUT_MS / 1000}s. Check Polygonscan.`
  );
}

function waitForReceipt(
  publicClient: { waitForTransactionReceipt: (args: { hash: `0x${string}` }) => Promise<unknown> },
  hash: `0x${string}`
): Promise<void> {
  return Promise.race([
    publicClient.waitForTransactionReceipt({ hash }).then(() => {}),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Tx confirmation timeout after ${WAIT_TIMEOUT_MS / 1000}s. Hash: ${hash} — check https://polygonscan.com/tx/${hash}`
            )
          ),
        WAIT_TIMEOUT_MS
      )
    ),
  ]);
}

export default function useEoaUsdceToUsdcSwap() {
  const { eoaAddress, walletClient, publicClient } = useWallet();
  const { rawUsdcBalance: eoaRawUsdcBalance } = usePolygonBalances(eoaAddress);
  const queryClient = useQueryClient();

  const [isSwapping, setIsSwapping] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const swapUsdceToUsdc = useCallback(async (): Promise<void> => {
    if (!eoaAddress) {
      setError(new Error("Wallet not connected"));
      return;
    }
    if ((eoaRawUsdcBalance ?? parseUnits("0", 6)) <= parseUnits("0", 6)) {
      setError(new Error("No USDC.e in your wallet"));
      return;
    }
    if (!walletClient || !publicClient) {
      setError(new Error("Wallet not ready for transactions"));
      return;
    }

    const amountIn = eoaRawUsdcBalance!;
    setIsSwapping(true);
    setError(null);

    const publicRpc = getPublicPolygonClient();
    const deadline = parseUnits(String(Math.floor(Date.now() / 1000) + DEADLINE_SEC), 0);

    try {
      // 0) Wait for no pending txs to avoid REPLACEMENT_UNDERPRICED / nonce issues (debug_swap_EOA.txt §1)
      await waitForNoPendingTx(publicRpc, eoaAddress as `0x${string}`);

      // 1) ERC20: USDC.e allowance to Permit2
      const erc20Allowance = await publicClient.readContract({
        address: USDC_E_CONTRACT_ADDRESS,
        abi: erc20Abi,
        functionName: "allowance",
        args: [eoaAddress as `0x${string}`, UNISWAP_V4_PERMIT2],
      });
      if (erc20Allowance < amountIn) {
        const gasParams = await getPolygonEip1559GasParams(publicRpc);
        const nonce = await publicRpc.getTransactionCount({
          address: eoaAddress as `0x${string}`,
          blockTag: "pending",
        });
        const hash = await walletClient.sendTransaction({
          account: eoaAddress as `0x${string}`,
          chain: polygon,
          to: USDC_E_CONTRACT_ADDRESS,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [UNISWAP_V4_PERMIT2, maxUint256],
          }),
          maxFeePerGas: gasParams.maxFeePerGas,
          maxPriorityFeePerGas: gasParams.maxPriorityFeePerGas,
          nonce,
        });
        await waitForReceipt(publicRpc, hash);
      }

      // 2) Permit2: allowance for Universal Router
      const [permit2Amount, permit2Expiration] = await publicClient.readContract({
        address: UNISWAP_V4_PERMIT2,
        abi: permit2Abi,
        functionName: "allowance",
        args: [
          eoaAddress as `0x${string}`,
          USDC_E_CONTRACT_ADDRESS,
          UNISWAP_V4_UNIVERSAL_ROUTER,
        ],
      });
      const now = Math.floor(Date.now() / 1000);
      const permit2Valid =
        permit2Amount >= amountIn && Number(permit2Expiration) > now;
      if (!permit2Valid) {
        const gasParams = await getPolygonEip1559GasParams(publicRpc);
        const nonce = await publicRpc.getTransactionCount({
          address: eoaAddress as `0x${string}`,
          blockTag: "pending",
        });
        const hash = await walletClient.sendTransaction({
          account: eoaAddress as `0x${string}`,
          chain: polygon,
          to: UNISWAP_V4_PERMIT2,
          data: encodeFunctionData({
            abi: permit2Abi,
            functionName: "approve",
            args: [
              USDC_E_CONTRACT_ADDRESS,
              UNISWAP_V4_UNIVERSAL_ROUTER,
              maxUint160,
              Number(deadline),
            ],
          }),
          maxFeePerGas: gasParams.maxFeePerGas,
          maxPriorityFeePerGas: gasParams.maxPriorityFeePerGas,
          nonce,
        });
        await waitForReceipt(publicRpc, hash);
      }

      // 3) Re-read USDC.e balance before quote/execute to avoid V4TooMuchRequested / BalanceTooLow (debug_swap_EOA.txt §5, §9, §10)
      const currentBalance = await publicRpc.readContract({
        address: USDC_E_CONTRACT_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [eoaAddress as `0x${string}`],
      });
      if (currentBalance <= parseUnits("0", 6)) {
        throw new Error("USDC.e balance is zero or changed. Please try again.");
      }
      // Use min(initial amountIn, current balance) so we never exceed Permit2 allowance or current balance
      const amountToSwap = currentBalance < amountIn ? currentBalance : amountIn;

      // 4) Quote and minAmountOut (2% slippage)
      const { amountOut } = await getSwapQuote(amountToSwap, {
        publicClient: publicRpc,
      });
      const minAmountOut = (amountOut * parseUnits(String(10000 - SLIPPAGE_BPS), 4)) / parseUnits("1", 4);

      // 5) Build execute payload with Uniswap SDK (same as swap_EOA.ts) and execute Universal Router
      const payload = buildEoaUsdceToUsdcExecutePayload({
        amountIn: amountToSwap,
        minAmountOut,
      });
      const executeData = encodeFunctionData({
        abi: universalRouterAbi,
        functionName: "execute",
        args: [payload.commands, payload.inputs, deadline],
      });

      const gasParams = await getPolygonEip1559GasParams(publicRpc);
      const nonce = await publicRpc.getTransactionCount({
        address: eoaAddress as `0x${string}`,
        blockTag: "pending",
      });
      // Estimate gas on public RPC (same state as after approvals) and pass gasLimit so the wallet
      // (e.g. Magic) does not run estimateGas itself — Magic RPC can revert during estimateGas (no data; require(false)).
      let gasLimit: bigint;
      try {
        const estimated = await publicRpc.estimateContractGas({
          address: UNISWAP_V4_UNIVERSAL_ROUTER,
          abi: universalRouterAbi,
          functionName: "execute",
          args: [payload.commands, payload.inputs, deadline],
          account: eoaAddress as `0x${string}`,
        });
        gasLimit = (estimated * parseUnits("120", 0)) / parseUnits("100", 0); // 20% buffer
      } catch (estimateErr) {
        const msg = estimateErr instanceof Error ? estimateErr.message : String(estimateErr);
        throw new Error(`Swap simulation failed. ${msg}`);
      }
      const hash = await walletClient.sendTransaction({
        account: eoaAddress as `0x${string}`,
        chain: polygon,
        to: UNISWAP_V4_UNIVERSAL_ROUTER,
        data: executeData,
        gas: gasLimit,
        maxFeePerGas: gasParams.maxFeePerGas,
        maxPriorityFeePerGas: gasParams.maxPriorityFeePerGas,
        nonce,
      });
      await waitForReceipt(publicRpc, hash);

      queryClient.invalidateQueries({ queryKey: ["usdcBalance", eoaAddress] });
      queryClient.invalidateQueries({
        queryKey: ["nativeUsdcBalance", eoaAddress],
      });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setIsSwapping(false);
    }
  }, [
    eoaAddress,
    eoaRawUsdcBalance,
    walletClient,
    publicClient,
    queryClient,
  ]);

  return {
    swapUsdceToUsdc,
    isSwapping,
    error,
    eoaUsdcBalance: eoaRawUsdcBalance ?? parseUnits("0", 6),
  };
}
