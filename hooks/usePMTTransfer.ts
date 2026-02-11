 "use client";

  import { useState, useCallback } from "react";
  import { createPublicClient, encodeFunctionData, formatTransactionRequest, http, parseEther, toHex } from "viem";
  import { baseSepolia } from "viem/chains";
  import getMagicBaseSepolia from "@/lib/magicBaseSepolia";

  const PMT_CONTRACT = "0x8CC5e000199Ad0295491Fc4f6e8CC16e7108C270";
  const PMT_DECIMALS = 18;
  const VAULT_ADDRESS = process.env.NEXT_PUBLIC_PMT_VAULT_ADDRESS!;

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

        const publicClient = createPublicClient({
          chain: baseSepolia,
          transport: http("https://sepolia.base.org"),
        });
        const balanceWei = await publicClient.readContract({
          address: PMT_CONTRACT as `0x${string}`,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [from as `0x${string}`],
        });

        // #region agent log
        fetch("http://127.0.0.1:7256/ingest/f44b4f33-6007-4135-82ba-ef90eef410ef", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "usePMTTransfer.ts:revert-debug",
            message: "transfer params and balance before eth_sendTransaction",
            data: {
              amountPMT,
              amountWeiStr: amountWei.toString(),
              balanceWeiStr: balanceWei.toString(),
              sufficientBalance: balanceWei >= amountWei,
              vaultAddress: VAULT_ADDRESS || "(missing)",
              vaultSet: !!VAULT_ADDRESS,
            },
            timestamp: Date.now(),
            hypothesisId: "H1-H2",
          }),
        }).catch(() => {});
        // #endregion

        const data = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [VAULT_ADDRESS as `0x${string}`, amountWei],
        });

        const txParams = formatTransactionRequest({
          from: from as `0x${string}`,
          to: PMT_CONTRACT as `0x${string}`,
          data,
          value: parseEther("0"),
        });

        // #region agent log
        const hasBigInt = typeof (txParams as Record<string, unknown>).value === "bigint";
        fetch("http://127.0.0.1:7256/ingest/f44b4f33-6007-4135-82ba-ef90eef410ef", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "usePMTTransfer.ts:txParams",
            message: "txParams before provider.request",
            data: { hasBigInt, valueType: typeof (txParams as Record<string, unknown>).value },
            timestamp: Date.now(),
            hypothesisId: "A",
          }),
        }).catch(() => {});
        // #endregion

        const rpcParams = {
          from: txParams.from,
          to: txParams.to,
          data: txParams.data,
          value: toHex((txParams as { value?: bigint }).value ?? BigInt(0)),
        };

        const txHash: string = await provider.request({
          method: "eth_sendTransaction",
          params: [rpcParams],
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