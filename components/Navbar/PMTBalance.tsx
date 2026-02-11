"use client";

import { useState, useEffect } from "react";
import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import { useWallet } from "@/providers/WalletContext";
import { useCurrency } from "@/providers/CurrencyContext";
import type { DisplayCurrency } from "@/utils/currencyDisplay";
import { DISPLAY_CURRENCY_OPTIONS } from "@/constants/currency";
import usePMTBalance from "@/hooks/usePMTBalance";
import usePaperPositions from "@/hooks/usePaperPositions";

/** PMT = 1 USD. Balance component with currency selector (clone of magic-DEV PortfolioCashBalance). */
export default function PMTBalance() {
    const { eoaAddress } = useWallet();
    const { currency, setCurrency, formatUsd } = useCurrency();
    const { data, isLoading: isLoadingBalance } = usePMTBalance(eoaAddress);
    const { openPositions, isLoading: isLoadingPositions } = usePaperPositions(eoaAddress);

    const [currentValue, setCurrentValue] = useState(0);

    // Fetch current market prices for open positions
    const tokenIdsKey = openPositions.map((p) => p.tokenId).join(",");
    useEffect(() => {
        if (openPositions.length === 0) {
            setCurrentValue(0);
            return;
        }

        const uniqueTokenIds = [...new Set(openPositions.map((p) => p.tokenId))];

        const fetchAndCalc = async () => {
            const prices: Record<string, number> = {};
            await Promise.allSettled(
                uniqueTokenIds.map(async (tokenId) => {
                    try {
                        const res = await fetch(`/api/polymarket/midpoint?tokenId=${tokenId}`);
                        if (!res.ok) return;
                        const data = await res.json();
                        if (data.mid) {
                            prices[tokenId] = parseFloat(data.mid);
                        }
                    } catch {
                        // ignore
                    }
                })
            );

            let total = 0;
            for (const pos of openPositions) {
                const price = prices[pos.tokenId] ?? pos.entryPrice;
                total += pos.shares * price;
            }
            setCurrentValue(total);
        };

        fetchAndCalc();
        const interval = setInterval(fetchAndCalc, 15_000);
        return () => clearInterval(interval);
    }, [tokenIdsKey, openPositions]);

    if (!eoaAddress) return null;

    const isLoading = isLoadingBalance || isLoadingPositions;
    const onChainBalance = data?.balance ?? 0;
    // Disponible = wallet balance (1 PMT = 1 USD)
    const disponible = onChainBalance;
    // Balance = disponible + current value of open positions (1 PMT = 1 USD)
    const totalBalance = onChainBalance + currentValue;

    return (
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
            {isLoading ? (
                <span className="text-sm text-gray-400">Loading...</span>
            ) : (
                <>
                    {/* Balance (PMT = USD, shown in selected currency) */}
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">
                            Balance
                        </span>
                        <span className="text-sm sm:text-base font-semibold text-gray-900">
                            {formatUsd(totalBalance)}
                        </span>
                    </div>

                    {/* Disponible (PMT = USD, shown in selected currency) */}
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">
                            Disponible
                        </span>
                        <span className="text-sm sm:text-base font-semibold text-green-600">
                            {formatUsd(disponible)}
                        </span>
                    </div>

                    {/* Currency selector (USD / MXN / EUR) */}
                    <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as DisplayCurrency)}
                        className="select select-bordered select-sm text-[10px] sm:text-xs h-7 min-h-7 py-0 pl-1 pr-4 w-fit min-w-0 shrink bg-gray-50 border-gray-300 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
                        aria-label="Currency"
                    >
                        {DISPLAY_CURRENCY_OPTIONS.map(({ value, label }) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>

                    {/* Depositar / Retirar (visual only, no functionality) */}
                    <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden bg-gray-100">
                        <button
                            type="button"
                            title="Depositar"
                            className="flex-shrink-0 p-1.5 sm:px-2 sm:py-1.5 md:px-3 md:py-1.5 text-xs font-medium text-gray-700 flex items-center gap-1 md:gap-1.5 border-r border-gray-300 hover:bg-gray-200 transition-colors cursor-pointer"
                        >
                            <ArrowDownToLine className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Depositar</span>
                        </button>

                        <button
                            type="button"
                            title="Retirar"
                            className="flex-shrink-0 p-1.5 sm:px-2 sm:py-1.5 md:px-3 md:py-1.5 text-xs font-medium text-gray-700 flex items-center gap-1 md:gap-1.5 hover:bg-gray-200 transition-colors cursor-pointer"
                        >
                            <ArrowUpToLine className="w-3.5 h-3.5" />
                            <span className="hidden md:inline">Retirar</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
