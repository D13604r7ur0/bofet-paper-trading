
  "use client";

  import type { PaperPosition } from "@/hooks/usePaperPositions";
  import { useRouter } from "next/navigation";
  import { useDictionary } from "@/providers/dictionary-provider";
  import { useCurrency } from "@/providers/CurrencyContext";
  import { ExternalLink } from "lucide-react";

  interface PaperPositionCardProps {
    position: PaperPosition;
    currentPrice: number | null;
    onSell: (position: PaperPosition) => void;
    isSelling: boolean;
  }

  export default function PaperPositionCard({
    position,
    currentPrice,
    onSell,
    isSelling,
  }: PaperPositionCardProps) {
    const { locale } = useDictionary();
    const { formatUsd } = useCurrency();
    const router = useRouter();

    const curPrice = currentPrice ?? position.entryPrice;
    const currentValue = position.shares * curPrice;
    const initialValue = position.cost;
    const cashPnl = currentValue - initialValue;
    const percentPnl = initialValue > 0 ? (cashPnl / initialValue) * 100 : 0;
    const isProfitable = cashPnl >= 0;

    const handleViewMarket = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (position.marketSlug) {
        router.push(`/${locale}/market/${position.marketSlug}`);
      }
    };

    return (
      <div className="card bg-base-100 border border-base-300 transition-all duration-200 hover:shadow-md">
        <div className="card-body p-4 md:p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="card-title text-base md:text-lg line-clamp-2 flex-1">
                  {position.marketTitle}
                </h3>
                {position.marketSlug && (
                  <button
                    onClick={handleViewMarket}
                    className="btn btn-ghost btn-xs gap-1 shrink-0"
                    title="View Market"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="badge badge-outline badge-sm gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {position.outcome.toUpperCase()}
                </div>
                {position.status !== "open" && (
                  <div className="badge badge-secondary badge-sm">
                    {position.status === "closed_sold"
                      ? "Cerrada"
                      : position.status === "won"
                      ? "Ganada"
                      : "Perdida"}
                  </div>
                )}
              </div>
            </div>
            {position.marketImage && (
              <div className="avatar">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-lg">
                  <img src={position.marketImage} alt="" />
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="stats stats-vertical lg:stats-horizontal bg-base-200 mb-4">
            <div className="stat p-3 md:p-4">
              <div className="stat-title text-xs">Shares</div>
              <div className="stat-value text-lg md:text-2xl">
                {position.shares.toFixed(2)}
              </div>
              <div className="stat-desc text-xs">shares</div>
            </div>

            <div className="stat p-3 md:p-4">
              <div className="stat-title text-xs">Precio Entrada</div>
              <div className="stat-value text-lg md:text-2xl">
                {(position.entryPrice * 100).toFixed(1)}c
              </div>
              <div className="stat-desc text-xs">
                Actual: {(curPrice * 100).toFixed(1)}c
              </div>
            </div>

            <div className="stat p-3 md:p-4">
              <div className="stat-title text-xs">P&L</div>
              <div
                className={`stat-value text-lg md:text-2xl ${
                  isProfitable ? "text-success" : "text-error"
                }`}
              >
                {cashPnl >= 0 ? "+" : ""}
                {formatUsd(cashPnl)}
              </div>
              <div
                className={`stat-desc text-xs font-semibold ${
                  isProfitable ? "text-success" : "text-error"
                }`}
              >
                {percentPnl >= 0 ? "+" : ""}
                {percentPnl.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Value Information */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-base-200 rounded-lg p-3">
              <div className="text-xs text-base-content/60 mb-1">Valor Actual</div>
              <div className="text-base font-bold">{formatUsd(currentValue)}</div>
            </div>
            <div className="bg-base-200 rounded-lg p-3">
              <div className="text-xs text-base-content/60 mb-1">Costo Inicial</div>
              <div className="text-base font-bold">{formatUsd(initialValue)}</div>
            </div>
          </div>

          {/* Realized P&L (if any) */}
          {position.realizedPnl !== 0 && (
            <div className="bg-base-200 rounded-lg p-3 mb-4">
              <div className="text-xs text-base-content/60 mb-1">P&L Realizado</div>
              <div
                className={`text-base font-bold ${
                  position.realizedPnl >= 0 ? "text-success" : "text-error"
                }`}
              >
                {position.realizedPnl >= 0 ? "+" : ""}
                {formatUsd(position.realizedPnl)}
              </div>
            </div>
          )}

          {/* Actions */}
          {position.status === "open" && (
            <div className="card-actions" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => onSell(position)}
                disabled={isSelling}
                className="btn btn-soft btn-error btn-block"
              >
                {isSelling ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Vendiendo...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                      />
                    </svg>
                    Vender
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }