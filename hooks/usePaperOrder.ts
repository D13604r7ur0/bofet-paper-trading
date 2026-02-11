 "use client";

  import { useState, useCallback } from "react";
  import { useQueryClient } from "@tanstack/react-query";
  import { createPublicClient, http, formatUnits } from "viem";
  import { baseSepolia } from "viem/chains";
  import { useWallet } from "@/providers/WalletContext";
  import usePaperPositions from "@/hooks/usePaperPositions";
  import usePMTBalance from "@/hooks/usePMTBalance";
  import usePMTTransfer from "@/hooks/usePMTTransfer";

  const PMT_CONTRACT = "0x8CC5e000199Ad0295491Fc4f6e8CC16e7108C270";
  const ERC20_BALANCE_ABI = [
    {
      name: "balanceOf",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "account", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
    },
  ] as const;

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  export type PaperOrderStatus =
    | "idle"
    | "checking-balance"
    | "transferring-pmt"
    | "saving-position"
    | "completed"
    | "failed";

  export type ExecutePaperOrderParams = {
    tokenId: string;
    amount: number;
    size: number;
    side: "BUY" | "SELL";
    price?: number;
    isMarketOrder?: boolean;
    negRisk?: boolean;
    outcome: "yes" | "no";
    marketTitle: string;
    marketImage: string;
    marketSlug?: string;
  };

  export default function usePaperOrder() {
    const { eoaAddress } = useWallet();
    const { data: pmtData } = usePMTBalance(eoaAddress);
    const {
      openPositions,
      addPosition,
      reducePosition,
      totalLocked,
      getPositionByToken,
    } = usePaperPositions(eoaAddress);
    const { transferToVault } = usePMTTransfer();
    const queryClient = useQueryClient();

    const [isExecuting, setIsExecuting] = useState(false);
    const [status, setStatus] = useState<PaperOrderStatus>("idle");
    const [error, setError] = useState<Error | null>(null);
    const [progressMessage, setProgressMessage] = useState("");

    const pmtBalance = pmtData?.balance ?? 0;
    // El balance on-chain ya refleja las compras (PMT fue transferido al vault)
    // Disponible = balance on-chain directamente
    const availableBalance = pmtBalance;

    const executeOrder = useCallback(
      async (
        params: ExecutePaperOrderParams
      ): Promise<{ success: boolean; orderId?: string; txHash?: string }> => {
        setIsExecuting(true);
        setStatus("checking-balance");
        setError(null);
        setProgressMessage("Verificando balance PMT...");

        try {
          const effectivePrice = params.price ?? params.amount / params.size;

          if (params.side === "BUY") {
            const cost = params.size * effectivePrice;

            if (cost > availableBalance) {
              const err = new Error(
                `Balance insuficiente. Necesitas ${cost.toFixed(2)} PMT pero tienes ${availableBalance.toFixed(2)} PMT disponibles.`
              ) as Error & { code?: string };
              err.code = "INSUFFICIENT_BALANCE";
              throw err;
            }

            // 1. Transferir PMT on-chain (user → vault)
            setStatus("transferring-pmt");
            setProgressMessage("Transfiriendo PMT...");
            const txHash = await transferToVault(cost);

            // 2. Guardar posición en Supabase
            setStatus("saving-position");
            setProgressMessage("Guardando posición...");
            await addPosition({
              tokenId: params.tokenId,
              outcome: params.outcome,
              shares: params.size,
              entryPrice: effectivePrice,
              marketTitle: params.marketTitle,
              marketImage: params.marketImage,
              marketSlug: params.marketSlug,
            });

            // 3. Esperar confirmación on-chain y actualizar balance
            setProgressMessage("Esperando confirmación...");
            await publicClient.waitForTransactionReceipt({
              hash: txHash as `0x${string}`,
            });

            const newRaw = await publicClient.readContract({
              address: PMT_CONTRACT,
              abi: ERC20_BALANCE_ABI,
              functionName: "balanceOf",
              args: [eoaAddress as `0x${string}`],
            });
            queryClient.setQueryData(
              ["pmtBalance", eoaAddress],
              {
                balance: parseFloat(formatUnits(newRaw, 18)),
                raw: newRaw,
              }
            );

            // Refrescar posiciones y esperar a que se actualicen
            await queryClient.refetchQueries({
              queryKey: ["paperPositions", eoaAddress?.toLowerCase()],
            });

            setStatus("completed");
            setProgressMessage("");
            return { success: true, orderId: `paper-${Date.now()}`, txHash };
          } else {
            // SELL
            const position = getPositionByToken(params.tokenId);
            if (!position || position.shares < params.size - 0.001) {
              throw new Error(
                `Shares insuficientes. Tienes ${position?.shares.toFixed(2) ?? "0"} shares.`
              );
            }

            const sellTotal = params.size * effectivePrice;

            // 1. Reducir posición en Supabase
            setStatus("saving-position");
            setProgressMessage("Cerrando posición...");
            await reducePosition(
              params.tokenId,
              params.size,
              effectivePrice
            );

            // 2. Vault devuelve PMT al user al precio actual
            setStatus("transferring-pmt");
            setProgressMessage("Devolviendo PMT...");
            const payoutRes = await fetch("/api/vault-payout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address: eoaAddress,
                amount: sellTotal,
              }),
            });

            const payoutData = await payoutRes.json();
            if (!payoutRes.ok) {
              throw new Error(payoutData.error || "Error devolviendo PMT");
            }

            // 3. Esperar confirmación on-chain y actualizar balance
            setProgressMessage("Esperando confirmación...");
            if (payoutData.txHash) {
              await publicClient.waitForTransactionReceipt({
                hash: payoutData.txHash as `0x${string}`,
              });
            }

            const newRaw = await publicClient.readContract({
              address: PMT_CONTRACT,
              abi: ERC20_BALANCE_ABI,
              functionName: "balanceOf",
              args: [eoaAddress as `0x${string}`],
            });
            queryClient.setQueryData(
              ["pmtBalance", eoaAddress],
              {
                balance: parseFloat(formatUnits(newRaw, 18)),
                raw: newRaw,
              }
            );

            // Refrescar posiciones y esperar a que se actualicen
            await queryClient.refetchQueries({
              queryKey: ["paperPositions", eoaAddress?.toLowerCase()],
            });

            setStatus("completed");
            setProgressMessage("");
            return { success: true, orderId: `paper-sell-${Date.now()}`, txHash: payoutData.txHash };
          }
        } catch (err) {
          setStatus("failed");
          const e = err instanceof Error ? err : new Error(String(err));
          setError(e);
          setProgressMessage("");
          throw e;
        } finally {
          setIsExecuting(false);
        }
      },
      [
        eoaAddress,
        availableBalance,
        addPosition,
        reducePosition,
        getPositionByToken,
        transferToVault,
        queryClient,
      ]
    );

    return {
      executeOrder,
      isExecuting,
      status,
      error,
      progressMessage,
      positions: openPositions,
      totalLocked,
      availableBalance,
      pmtBalance,
    };
  }