"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/providers/WalletContext";
import usePaperPositions, { PaperPosition } from "@/hooks/usePaperPositions";
import usePaperOrder from "@/hooks/usePaperOrder";
import PaperPositionCard from "@/components/Trading/Positions/PaperPositionCard";
import ErrorState from "@/components/shared/ErrorState";
import EmptyState from "@/components/shared/EmptyState";
import LoadingState from "@/components/shared/LoadingState";

export default function PaperUserPositions() {
  const { eoaAddress } = useWallet();

  const {
    openPositions,
    closedPositions,
    isLoading,
    error,
    totalLocked,
    totalRealizedPnl,
  } = usePaperPositions(eoaAddress);

  const { executeOrder } = usePaperOrder();

  const [sellingTokenId, setSellingTokenId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"open" | "closed">("open");
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});

  // Fetch current prices from CLOB midpoint API for open positions
  const tokenIdsKey = openPositions.map((p) => p.tokenId).join(",");
  useEffect(() => {
    if (openPositions.length === 0) return;

    const uniqueTokenIds = [...new Set(openPositions.map((p) => p.tokenId))];

    const fetchPrices = async () => {
      const prices: Record<string, number> = {};
      await Promise.allSettled(
        uniqueTokenIds.map(async (tokenId) => {
          try {
            const res = await fetch(
              `/api/polymarket/midpoint?tokenId=${tokenId}`
            );
            if (!res.ok) return;
            const data = await res.json();
            // CLOB midpoint returns { mid: "0.55" }
            if (data.mid) {
              prices[tokenId] = parseFloat(data.mid);
            }
          } catch {
            // ignore individual failures
          }
        })
      );
      setCurrentPrices((prev) => ({ ...prev, ...prices }));
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 15_000);
    return () => clearInterval(interval);
  }, [tokenIdsKey]);

  const handleSell = useCallback(
    async (position: PaperPosition) => {
      setSellingTokenId(position.tokenId);
      try {
        const sellPrice = currentPrices[position.tokenId] ?? position.entryPrice;
        await executeOrder({
          tokenId: position.tokenId,
          amount: position.shares * sellPrice,
          size: position.shares,
          side: "SELL",
          price: sellPrice,
          outcome: position.outcome,
          marketTitle: position.marketTitle,
          marketImage: position.marketImage,
          marketSlug: position.marketSlug ?? undefined,
        });
      } catch (err) {
        console.error("Failed to sell paper position:", err);
        alert("Error al vender la posición. Intenta de nuevo.");
      } finally {
        setSellingTokenId(null);
      }
    },
    [executeOrder, currentPrices]
  );

    if (isLoading) {
      return <LoadingState message="Cargando posiciones paper..." />;
    }

    if (error) {
      return (
        <ErrorState error={error} title="Error cargando posiciones paper" />
      );
    }

    const displayPositions = activeTab === "open" ? openPositions : closedPositions;

    if (openPositions.length === 0 && closedPositions.length === 0) {
      return (
        <EmptyState
          title="Sin Posiciones Paper"
          message="No tienes posiciones de paper trading. Compra shares en cualquier mercado para empezar."
        />
      );
    }

    return (
      <div className="space-y-6">
        {/* Summary Bar */}
        <div className="stats stats-horizontal bg-base-200 w-full">
          <div className="stat">
            <div className="stat-title text-xs">Posiciones Abiertas</div>
            <div className="stat-value text-lg">{openPositions.length}</div>
          </div>
          <div className="stat">
            <div className="stat-title text-xs">PMT Invertido</div>
            <div className="stat-value text-lg text-purple-700">
              {totalLocked.toFixed(2)}
            </div>
          </div>
          <div className="stat">
            <div className="stat-title text-xs">P&L Realizado</div>
            <div
              className={`stat-value text-lg ${
                totalRealizedPnl >= 0 ? "text-success" : "text-error"
              }`}
            >
              {totalRealizedPnl >= 0 ? "+" : ""}
              {totalRealizedPnl.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div role="tablist" className="tabs tabs-bordered">
          <a
            role="tab"
            className={`tab ${activeTab === "open" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("open")}
          >
            Abiertas ({openPositions.length})
          </a>
          <a
            role="tab"
            className={`tab ${activeTab === "closed" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("closed")}
          >
            Cerradas ({closedPositions.length})
          </a>
        </div>

        {/* Positions Grid */}
        {displayPositions.length === 0 ? (
          <EmptyState
            title={
              activeTab === "open"
                ? "Sin posiciones abiertas"
                : "Sin posiciones cerradas"
            }
            message={
              activeTab === "open"
                ? "Compra shares en cualquier mercado para empezar."
                : "Aun no has cerrado ninguna posicion."
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {displayPositions.map((position) => (
              <PaperPositionCard
                key={position.id}
                position={position}
                currentPrice={currentPrices[position.tokenId] ?? null}
                onSell={handleSell}
                isSelling={sellingTokenId === position.tokenId}
              />
            ))}
          </div>
        )}
      </div>
    );
  }