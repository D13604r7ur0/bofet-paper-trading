"use client";

/**
 * Hook for claiming free gas (2 POL) via the SendGas contract.
 *
 * Flow:
 * 1. useQuery checks GET /api/send-gas?address=... (Redis-backed) to see if already claimed
 * 2. claimGas() signs EIP-712 ClaimGasFor(recipient, deadline) with the EOA via Magic
 * 3. POSTs {recipient, deadline, signature} to /api/send-gas
 * 4. Server relayer executes on-chain, writes Redis
 * 5. Query is invalidated → button shows "Gas Claimed"
 */

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/providers/WalletContext";
import { SEND_GAS_CONTRACT_ADDRESS } from "@/constants/tokens";
import { parseUnits } from "viem";

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

interface ClaimCheckResponse {
  hasClaimed: boolean;
  txHash?: string | null;
}

export default function useSendGas() {
  const { eoaAddress, walletClient } = useWallet();
  const queryClient = useQueryClient();

  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Check if this wallet already claimed (Redis-backed)
  const {
    data: claimCheck,
    isLoading: isCheckingClaimed,
  } = useQuery<ClaimCheckResponse>({
    queryKey: ["hasClaimedGas", eoaAddress],
    queryFn: async () => {
      const res = await fetch(`/api/send-gas?address=${eoaAddress}`);
      if (!res.ok) throw new Error("Failed to check claim status");
      return res.json();
    },
    enabled: !!eoaAddress,
    staleTime: 60_000,
  });

  const hasClaimed = claimCheck?.hasClaimed ?? false;

  const claimGas = useCallback(async () => {
    if (!eoaAddress || !walletClient) {
      throw new Error("Wallet not connected");
    }

    setError(null);
    setIsClaiming(true);

    try {
      // 1. Build deadline: now + 10 minutes
      const deadline = Math.floor(Date.now() / 1000) + 600;

      // 2. Sign EIP-712 typed data
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

      // 3. POST to relayer API
      const res = await fetch("/api/send-gas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: eoaAddress,
          deadline,
          signature,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Claim failed (${res.status})`);
      }

      // 4. Invalidate query so UI updates
      queryClient.invalidateQueries({
        queryKey: ["hasClaimedGas", eoaAddress],
      });

      return data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setIsClaiming(false);
    }
  }, [eoaAddress, walletClient, queryClient]);

  return {
    claimGas,
    isClaiming,
    error,
    hasClaimed,
    isCheckingClaimed,
  };
}
