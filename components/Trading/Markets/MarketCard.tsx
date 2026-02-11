import type { PolymarketMarket } from "@/hooks/useMarkets";
import { useDictionary } from "@/providers/dictionary-provider";
import { useToast } from "@/providers/ToastProvider";
import { formatVolume } from "@/utils/formatting";
import { convertPriceToCents } from "@/utils/order";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";

interface MarketCardProps {
  market: PolymarketMarket;
  disabled?: boolean;
  onOutcomeClick: (
    marketTitle: string,
    outcome: string,
    price: number,
    tokenId: string,
    negRisk: boolean,
    marketImage: string,
    marketSlug: string
  ) => void;
}

export default function MarketCard({
  market,
  disabled = false,
  onOutcomeClick,
}: MarketCardProps) {

  const params = useParams();
  const router = useRouter();
  const lang = params?.lang || 'es';
  const marketUrl = `/${lang}/market/${market.slug}`;

  const { dict } = useDictionary();
  const { showToast } = useToast();
  const volumeUSD = parseFloat(
    String(market.volume24hr || market.volume || "0")
  );
  const isClosed = market.closed;

  const outcomes = market.outcomes ? JSON.parse(market.outcomes) : [];
  const tokenIds = market.clobTokenIds ? JSON.parse(market.clobTokenIds) : [];
  const negRisk = market.negRisk || false;
  const outcomePrices = tokenIds.map((tokenId: string) => {
    return market.realtimePrices?.[tokenId]?.bidPrice || 0;
  });

  // Calculate chance percentage from first outcome price (if available)
  const firstPrice = outcomePrices[0] || 0;
  const chance = Math.round(firstPrice * 100);

  // For display: show first two outcomes as Yes/No style badges
  const displayOutcomes = outcomes.slice(0, 2);
  const displayPrices = outcomePrices.slice(0, 2);
  const displayTokenIds = tokenIds.slice(0, 2);

  const handleOutcomeClick = (outcome: string, price: number, tokenId: string, index: number) => {
    if (!disabled && !isClosed && tokenId) {
      onOutcomeClick(market.question, outcome, price, tokenId, negRisk, market.icon || "", market.slug || "");
    }
  };

  const handleCardClick = async () => {
    try {
      router.push(marketUrl);
    } catch (error) {
      console.log("Not slug")
    }
  };

  const handleShareClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${marketUrl}` : marketUrl;
    try {
      await navigator.clipboard.writeText(fullUrl);
      showToast("Copiado a portapepeles");
    } catch {
      // fallback for older browsers
      if (typeof document !== "undefined") {
        const input = document.createElement("input");
        input.value = fullUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
        showToast("Copiado a portapepeles");
      }
    }
  };

  return (
    <div onClick={handleCardClick} className="card card-border bg-base-100 transition-all cursor-pointer group block overflow-hidden">
      <div className="card-body pt-5 px-4 pb-3">
        {/* Fixed-height question block: image/odds hidden on hover, question expands (same as magic-DEV) */}
        <div className="flex flex-col h-[5rem] min-h-[5rem] mt-1 mb-2">
          <div className="flex items-start justify-between gap-3 group-hover:gap-0 flex-1 min-h-0 min-w-0 h-12 group-hover:h-full transition-all duration-200">
            <div className="flex items-start gap-3 group-hover:gap-0 flex-1 min-w-0 min-h-0 overflow-hidden">
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
            {!isClosed && (
              <div
                className="radial-progress text-[#00C805] shrink-0 transition-all duration-200 group-hover:opacity-0 group-hover:w-0 group-hover:min-w-0 group-hover:overflow-hidden group-hover:invisible"
                style={{ "--value": chance, "--size": "3rem", "--thickness": "3px" } as React.CSSProperties}
                role="progressbar"
                aria-valuenow={chance}
              >
                <span className="text-[10px] font-bold">{chance}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Outcome badges (Yes/No) — always visible */}
        {displayOutcomes.length > 0 && (
          <div className="card-actions grid grid-cols-2 gap-2 mb-2">
            {displayOutcomes.map((outcome: string, idx: number) => {
              const tokenId = displayTokenIds[idx] || "";
              const price = displayPrices[idx] || 0;
              const priceInDollars = price.toFixed(2);
              const isSuccess = idx === 0; // First outcome is "success" (Yes), second is "error" (No)
              const o = outcome.toLowerCase();
              const isYesNo = o === "yes" || o === "no";
              const displayLabel = isYesNo
                ? (o === "yes" ? (dict.marketDetail?.tradingModal?.yes ?? "Sí") : (dict.marketDetail?.tradingModal?.no ?? "No"))
                : outcome;

              return (
                <div
                  key={`outcome-badge-${idx}`}
                  className={`badge badge-soft ${isSuccess ? "badge-success" : "badge-error"} badge-lg justify-center py-4 font-bold text-sm w-full cursor-pointer overflow-hidden ${disabled || isClosed || !tokenId ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOutcomeClick(outcome, price, tokenId, idx);
                  }}
                >
                  {isYesNo ? (
                    <>
                      <span className="hidden md:inline">{displayLabel} </span>${priceInDollars}
                    </>
                  ) : (
                    <>
                      <span className="text-[9px] sm:text-[10px] md:text-xs lg:text-sm shrink min-w-0 truncate">{outcome} </span>
                      <span className="shrink-0">${priceInDollars}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Volume + Share at end of card; volume hidden on hover (space preserved) */}
        <div className="flex items-center justify-between text-xs text-base-content/60 h-5 shrink-0">
          <div className="flex items-center gap-1 duration-200">
            <span>{formatVolume(volumeUSD)} {dict.market.volume}</span>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <button
            className="btn btn-ghost btn-circle btn-xs shrink-0"
            onClick={handleShareClick}
            aria-label={dict.marketDetail?.header?.share ?? "Share"}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
