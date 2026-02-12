import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createPublicClient, http, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";

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

export default function useClaimPMT() {
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const claimPMT = async (address: string, amount: number = 10) => {
    setIsClaiming(true);
    setError(null);
    setTxHash(null);

    try {
      const res = await fetch("/api/claim-pmt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, amount }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to claim PMT");
      }

      // 1. Esperar a que la tx se mine on-chain
      await publicClient.waitForTransactionReceipt({
        hash: data.pmtTxHash as `0x${string}`,
      });

      // 2. Leer el balance nuevo directamente del contrato
      const newRaw = await publicClient.readContract({
        address: PMT_CONTRACT,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });

      // 3. Inyectar al cache de React Query — balance se actualiza instantáneamente
      queryClient.setQueryData(["pmtBalance", address], {
        balance: parseFloat(formatUnits(newRaw, 18)),
        raw: newRaw,
      });

      // 4. Solo ahora marcamos como éxito — el balance ya está actualizado
      setTxHash(data.pmtTxHash);

      return data.pmtTxHash;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setIsClaiming(false);
    }
  };

  return { claimPMT, isClaiming, error, txHash };
}