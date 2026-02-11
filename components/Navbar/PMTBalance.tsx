"use client";

import { useState, useEffect } from "react";
import { Coins, ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import { useWallet } from "@/providers/WalletContext";
import usePMTBalance from "@/hooks/usePMTBalance";
import usePaperPositions from "@/hooks/usePaperPositions";

export default function PMTBalance() {
    const { eoaAddress } = useWallet();
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
    // Disponible = lo que tiene en wallet (ya descontadas las compras on-chain)
    const disponible = onChainBalance;
    // Balance = disponible + valor actual de posiciones abiertas (a precio de mercado)
    const totalBalance = onChainBalance + currentValue;

      return (
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
              {isLoading ? (
                  <span className="text-sm text-gray-400">Loading...</span>
              ) : (
                  <>
                      {/* Balance PMT total */}
                      <div className="flex flex-col items-end">
                          <span className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">
                              Balance
                          </span>
                          <span className="text-sm sm:text-base font-semibold text-gray-900">
                              <Coins className="w-3.5 h-3.5 inline mr-1" />
                              {totalBalance.toFixed(2)} PMT
                          </span>
                      </div>

                      {/* PMT Disponible (total - locked en posiciones) */}
                      <div className="flex flex-col items-end">
                          <span className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">
                              Disponible
                          </span>
                          <span className="text-sm sm:text-base font-semibold text-green-600">
                              <Coins className="w-3.5 h-3.5 inline mr-1" />
                              {disponible.toFixed(2)} PMT
                          </span>
                      </div>

                      {/* Botones Depositar y Retirar DISABLED */}
                      <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden bg-gray-100">
                          {/* Depositar - Disabled */}
                          <button
                              disabled
                              title="Depositar (próximamente)"
                              className="flex-shrink-0 p-1.5 sm:px-2 sm:py-1.5 md:px-3 md:py-1.5 text-xs font-medium text-gray-400 flex items-center gap-1 md:gap-1.5 border-r border-gray-300
  cursor-not-allowed opacity-50"
                          >
                              <ArrowDownToLine className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Depositar</span>
                          </button>

                          {/* Retirar - Disabled */}
                          <button
                              disabled
                              title="Retirar (próximamente)"
                              className="flex-shrink-0 p-1.5 sm:px-2 sm:py-1.5 md:px-3 md:py-1.5 text-xs font-medium text-gray-400 flex items-center gap-1 md:gap-1.5 cursor-not-allowed opacity-50"
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
