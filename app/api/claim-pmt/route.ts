import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, parseUnits, parseEther, hexToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { supabase } from "@/lib/supabase";

const PMT_CONTRACT = "0x8CC5e000199Ad0295491Fc4f6e8CC16e7108C270";
const PMT_DECIMALS = 18;
const GAS_AMOUNT = parseEther("0.001");
const COOLDOWN_HOURS = 24;
const MAX_CLAIM_AMOUNT = 1_000_000;
const DAILY_LIMIT = MAX_CLAIM_AMOUNT;

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
        const { address, amount: requestedAmount } = await req.json();

        if (!address) {
            return NextResponse.json({ error: "Address required" }, { status: 400 });
        }

        const amountNum = Math.min(
            MAX_CLAIM_AMOUNT,
            Math.max(1, Number(requestedAmount) || 10)
        );
        const claimAmountWei = parseUnits(String(amountNum), PMT_DECIMALS);

        const addr = address.toLowerCase();

        // --- Validación: límite de 1M PMT por 24h ---
        const since = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();

        const { data: recentClaims, error: claimsError } = await supabase
            .from("pmt_claims")
            .select("amount, created_at")
            .eq("user_address", addr)
            .gte("created_at", since)
            .order("created_at", { ascending: false });

        if (claimsError) {
            console.error("Error checking claims:", claimsError);
            return NextResponse.json(
                { error: "Error verificando claims" },
                { status: 500 }
            );
        }

        const totalClaimed = (recentClaims ?? []).reduce(
            (sum, c) => sum + Number(c.amount), 0
        );

        if (totalClaimed + amountNum > DAILY_LIMIT) {
            const oldest = recentClaims?.[recentClaims.length - 1];
            const resetTime = oldest?.created_at
                ? new Date(new Date(oldest.created_at).getTime() + COOLDOWN_HOURS * 60 * 60 * 1000)
                : null;
            const remainingHours = resetTime
                ? Math.ceil((resetTime.getTime() - Date.now()) / (1000 * 60 * 60))
                : COOLDOWN_HOURS;

            return NextResponse.json(
                { error: `Ya reclamaste ${totalClaimed} PMT en las últimas 24h (límite: ${DAILY_LIMIT}). Espera ~${remainingHours}h.` },
                { status: 429 }
            );
        }

        // --- Faucet config ---
        const rawKey = process.env.PMT_FAUCET_PRIVATE_KEY;
        if (!rawKey) {
            return NextResponse.json(
                { error: "Faucet not configured" },
                { status: 500 }
            );
        }

        // Normalize: trim whitespace, ensure 0x prefix
        let privateKey = rawKey.trim();
        if (!privateKey.startsWith("0x")) {
            privateKey = `0x${privateKey}`;
        }

        if (process.env.NODE_ENV === "development") {
            console.log("[claim-pmt] PMT_FAUCET_PRIVATE_KEY debug:", {
                length: privateKey.length,
                has0x: privateKey.startsWith("0x"),
                first10: privateKey.slice(0, 10) + "...",
                repr: JSON.stringify(privateKey.slice(0, 12) + "..."),
            });
        }

        try {
            const bytes = hexToBytes(privateKey as `0x${string}`);
            if (bytes.length !== 32) {
                throw new Error(`Private key must be 32 bytes (64 hex chars), got ${bytes.length}`);
            }
        } catch (e) {
            console.error("[claim-pmt] Invalid PMT_FAUCET_PRIVATE_KEY format:", e);
            throw e;
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

        // 1. Enviar PMT
        const pmtTxHash = await walletClient.writeContract({
            address: PMT_CONTRACT,
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [address as `0x${string}`, claimAmountWei],
            nonce,
        });

        // 2. Verificar si la EOA ya tiene suficiente gas
        const userBalance = await publicClient.getBalance({
            address: address as `0x${string}`,
        });

        let ethTxHash: string | null = null;

        if (userBalance < GAS_AMOUNT) {
            ethTxHash = await walletClient.sendTransaction({
                to: address as `0x${string}`,
                value: GAS_AMOUNT,
                nonce: nonce + 1,
            });
        }

        // 3. Registrar claim en Supabase
        const { error: insertError } = await supabase
            .from("pmt_claims")
            .insert({
                user_address: addr,
                amount: amountNum,
                tx_hash: pmtTxHash,
            });

        if (insertError) {
            console.error("Error registering claim:", insertError);
        }

        return NextResponse.json({
            success: true,
            pmtTxHash,
            ethTxHash,
            gasSkipped: ethTxHash === null,
            amount: amountNum,
            totalClaimedToday: totalClaimed + amountNum,
            dailyLimit: DAILY_LIMIT,
        });
    } catch (error) {
        console.error("Claim PMT error:", error);
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
}