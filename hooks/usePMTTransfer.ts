 "use client";

  import { useState, useCallback } from "react";
  import { createPublicClient, http, encodeFunctionData, toHex } from "viem";
  import { baseSepolia } from "viem/chains";
  import getMagicBaseSepolia from "@/lib/magicBaseSepolia";

  const PMT_CONTRACT = "0x8CC5e000199Ad0295491Fc4f6e8CC16e7108C270";
  const VAULT_ADDRESS = process.env.NEXT_PUBLIC_PMT_VAULT_ADDRESS!;

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  const ERC20_BALANCE_ABI = [
    {
      name: "balanceOf",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "account", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
    },
  ] as const;

  const ERC20_TRANSFER_ABI = [
    {
      name: "transfer",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bool" }],
    },
  ] as const;

  export default function usePMTTransfer() {
    const [isTransferring, setIsTransferring] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const transferToVault = useCallback(async (amountPMT: number): Promise<string> => {
      setIsTransferring(true);
      setError(null);

      try {
        const magic = getMagicBaseSepolia();
        // Magic SDK types `request` as protected in RPCProviderModule,
        // but it's accessible at runtime. Cast to `any` to bypass TS.
        const provider = magic.rpcProvider as any;

        const accounts: string[] = await provider.request({
          method: "eth_accounts",
        });

        if (!accounts || accounts.length === 0) {
          throw new Error("No wallet connected via Magic");
        }

        const from = accounts[0];
        const amountWei = BigInt(Math.round(Number(amountPMT) * 1e18));

        const balanceWei = await publicClient.readContract({
          address: PMT_CONTRACT as `0x${string}`,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [from as `0x${string}`],
        });

        if (balanceWei < amountWei) {
          throw new Error(
            `Balance PMT insuficiente on-chain. Tienes ${Number(balanceWei) / 1e18} PMT.`
          );
        }

        const data = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [VAULT_ADDRESS as `0x${string}`, amountWei],
        });

        // Estimar gas con viem y convertir a hex para evitar que Magic SDK
        // intente serializar BigInts internamente (causa "Do not know how
        // to serialize a BigInt").
        const gasEstimate = await publicClient.estimateGas({
          account: from as `0x${string}`,
          to: PMT_CONTRACT as `0x${string}`,
          data: data as `0x${string}`,
          value: BigInt(0),
        });
        const gasHex = toHex(gasEstimate);

        const txHash: string = await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from,
              to: PMT_CONTRACT,
              data,
              value: "0x0",
              gas: gasHex,
            },
          ],
        });

        return txHash;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsTransferring(false);
      }
    }, []);

    return { transferToVault, isTransferring, error };
  }
