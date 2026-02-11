import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const PMT_CONTRACT = "0x8CC5e000199Ad0295491Fc4f6e8CC16e7108C270";
const PMT_DECIMALS = 18;

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

const transport = http("https://sepolia.base.org");

export async function POST(req: NextRequest) {
    try {
        const { address, amount } = await req.json();

        if (!address || !amount || amount <= 0) {
            return NextResponse.json(
                { error: "Address and valid amount required" },
                { status: 400 }
            );
        }

        // Usa la misma key del vault/faucet
        const privateKey = process.env.PMT_FAUCET_PRIVATE_KEY;
        if (!privateKey) {
            return NextResponse.json(
                { error: "Vault not configured" },
                { status: 500 }
            );
        }

        const account = privateKeyToAccount(privateKey as `0x${string}`);

        const publicClient = createPublicClient({
            chain: baseSepolia,
            transport,
        });

        const walletClient = createWalletClient({
            account,
            chain: baseSepolia,
            transport,
        });

        const nonce = await publicClient.getTransactionCount({
            address: account.address,
        });

        const amountWei = parseUnits(amount.toString(), PMT_DECIMALS);

        const txHash = await walletClient.writeContract({
            address: PMT_CONTRACT,
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [address as `0x${string}`, amountWei],
            nonce,
        });

        return NextResponse.json({
            success: true,
            txHash,
        });
    } catch (error) {
        console.error("Vault payout error:", error);
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
}
