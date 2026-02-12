import { useState, useCallback } from "react";
import { useWallet } from "@/providers/WalletContext";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { RelayClient } from "@polymarket/builder-relayer-client";
import { polygon } from "viem/chains";

import {
  RELAYER_URL,
  POLYGON_CHAIN_ID,
  REMOTE_SIGNING_URL,
} from "@/constants/polymarket";

// This hook is responsible for creating and managing the relay client instance
// The user's signer and builder config are used to initialize the relay client

/**
 * Builder-relayer-client's createAbstractSigner treats our ethers signer as a Viem
 * WalletClient (different ethers package → instanceof JsonRpcSigner fails). ViemSigner
 * then reads walletClient.transport.config; in viem 2 transport is a function, so
 * we pass a walletClient with a resolved transport object (has .config) to avoid
 * "Cannot read properties of undefined (reading 'config')".
 */
function wrapWalletClientForRelay<T extends { transport: unknown; chain?: unknown }>(
  walletClient: T
): T {
  const rawTransport = walletClient.transport;
  const resolved =
    typeof rawTransport === "function"
      ? (rawTransport as (opts: { chain?: unknown }) => { config: unknown; name: string; request: unknown; type: string; value?: unknown })({
          chain: walletClient.chain ?? polygon,
        })
      : rawTransport;
  return {
    ...walletClient,
    get transport() {
      return resolved;
    },
  } as T;
}

export default function useRelayClient() {
  const [relayClient, setRelayClient] = useState<RelayClient | null>(null);
  const { walletClient, eoaAddress } = useWallet();

  // This function initializes the relay client with
  // the user's signer and builder config
  const initializeRelayClient = useCallback(async () => {
    if (!eoaAddress || !walletClient) {
      throw new Error("Wallet not connected");
    }

    // The Builder's credentials are obtained from 'polymarket.com/settings?tab=builder'
    // A remote signing server allows the builder credentials to be kept secure while signing requests

    const builderConfig = new BuilderConfig({
      remoteBuilderConfig: {
        url: REMOTE_SIGNING_URL(),
      },
    });

    // Pass walletClient with resolved transport so @polymarket/builder-abstract-signer's
    // ViemSigner can read transport.config (viem 2 transport is a function by default).
    const client = new RelayClient(
      RELAYER_URL,
      POLYGON_CHAIN_ID,
      wrapWalletClientForRelay(walletClient),
      builderConfig
    );

    setRelayClient(client);
    return client;
  }, [eoaAddress, walletClient]);

  // This function clears the relay client and resets the state
  const clearRelayClient = useCallback(() => {
    setRelayClient(null);
  }, []);

  return {
    relayClient,
    initializeRelayClient,
    clearRelayClient,
  };
}
