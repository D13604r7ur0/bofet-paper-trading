import type { PolymarketMarket } from "@/hooks/useMarkets";
import { useDictionary } from "@/providers/dictionary-provider";
import { formatVolume } from "@/utils/formatting";

interface PreviewMarketCardProps {
  market: PolymarketMarket;
}

export default function PreviewMarketCard({ market }: PreviewMarketCardProps) {
  const { dict } = useDictionary();
  const volumeUSD = parseFloat(
    String(market.volume24hr || market.volume || "0")
  );

  const outcomes = market.outcomes ? JSON.parse(market.outcomes) : [];

  const displayOutcomes = outcomes.slice(0, 2);

  return (
    <div className="card card-border bg-base-100 transition-all cursor-pointer group overflow-hidden">
      <div className="card-body pt-5 px-4 pb-3">
        {/* Fixed-height question block: more top margin, less bottom in resting state (same as magic-DEV) */}
        <div className="flex flex-col h-[5rem] min-h-[5rem] mt-1 mb-2">
          <div className="flex items-start gap-3 group-hover:gap-0 flex-1 min-h-0 min-w-0 h-12 group-hover:h-full transition-all duration-200">
            {market.icon && (
              <img
                src={market.icon}
                alt=""
                className="w-12 h-12 rounded-lg object-cover shrink-0 transition-all duration-200 group-hover:opacity-0 group-hover:w-0 group-hover:h-0 group-hover:min-w-0 group-hover:shrink group-hover:overflow-hidden group-hover:invisible"
                aria-hidden
              />
            )}
            <div className="w-full min-w-0 flex-1 min-h-0 overflow-hidden">
              <h2 className="card-title text-base leading-tight group-hover:text-primary transition-colors text-left line-clamp-2 group-hover:line-clamp-5 group-hover:text-sm group-hover:leading-snug break-words">
                {market.question}
              </h2>
            </div>
          </div>
        </div>

        {/* Outcome badges (Yes/No) — always visible */}
        {displayOutcomes.length > 0 && (
          <div className="card-actions grid grid-cols-2 gap-2 mb-2">
            {displayOutcomes.map((outcome: string, idx: number) => {
              const isSuccess = idx === 0; // First outcome is "success" (Yes), second is "error" (No)
              const o = outcome.toLowerCase();
              const isYesNo = o === "yes" || o === "no";
              const displayLabel = isYesNo
                ? (o === "yes" ? (dict.marketDetail?.tradingModal?.yes ?? "Sí") : (dict.marketDetail?.tradingModal?.no ?? "No"))
                : outcome;

              return (
                <div
                  key={`outcome-badge-${idx}`}
                  className={`badge badge-soft ${isSuccess ? "badge-success" : "badge-error"} badge-lg justify-center py-4 font-bold text-sm w-full cursor-not-allowed overflow-hidden`}
                >
                  <span className="truncate">{displayLabel}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Volume at end of card; hidden on hover (space preserved to keep height fixed) */}
        <div className="flex items-center text-xs text-base-content/60 h-5 shrink-0 duration-200">
          <span>{formatVolume(volumeUSD)} {dict.market.volume}</span>
        </div>
      </div>
    </div>
  );
}
