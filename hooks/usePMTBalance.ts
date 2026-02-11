import { useQuery } from "@tanstack/react-query";                                                                                                                                                                      
  import { createPublicClient, http, formatUnits, parseUnits } from "viem";                                                                                                                                                            
  import { baseSepolia } from "viem/chains";                                                                                                                                                                               
                                                                                                                                                                                                                           
  const PMT_CONTRACT = "0x8CC5e000199Ad0295491Fc4f6e8CC16e7108C270";                                                                                                                                                       
  const PMT_DECIMALS = 18;                                                                                                                                                                                                 

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

  export default function usePMTBalance(address: string | null | undefined) {
    return useQuery({
      queryKey: ["pmtBalance", address],
      queryFn: async () => {
        if (!address) return { balance: 0, raw: parseUnits("0", 18) };

        const raw = await publicClient.readContract({
          address: PMT_CONTRACT,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        });

        return {
          balance: parseFloat(formatUnits(raw, PMT_DECIMALS)),
          raw,
        };
      },
      enabled: !!address,
      refetchInterval: 15_000,
    });
  }