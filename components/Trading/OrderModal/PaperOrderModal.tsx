"use client";

import { useState, useEffect, useRef } from "react";
import { useWallet } from "@/providers/WalletContext";
import usePaperOrder from "@/hooks/usePaperOrder";
import useTickSize from "@/hooks/useTickSize";
import { useDictionary } from "@/providers/dictionary-provider";
import { isValidDecimalInput } from "@/utils/validation";

import Portal from "@/components/Portal";
import OrderTypeToggle from "@/components/Trading/OrderModal/OrderTypeToggle";

function getDecimalPlaces(tickSize: number): number {
  if (tickSize >= 1) return 0;
  const str = tickSize.toString();
  const decimalPart = str.split(".")[1];
  return decimalPart ? decimalPart.length : 0;
}

function isValidTickPrice(price: number, tickSize: number): boolean {
  if (tickSize <= 0) return false;
  const multiplier = Math.round(price / tickSize);
  const expectedPrice = multiplier * tickSize;
  return Math.abs(price - expectedPrice) < 1e-10;
}

type PaperOrderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  marketTitle: string;
  marketImage: string;
  marketSlug: string;
  outcome: string;
  currentPrice: number;
  tokenId: string;
  negRisk?: boolean;
};

export default function PaperOrderModal({
  isOpen,
  onClose,
  marketTitle,
  marketImage,
  marketSlug,
  outcome,
  currentPrice,
  tokenId,
  negRisk = false,
}: PaperOrderModalProps) {
  const [size, setSize] = useState<string>("");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const { eoaAddress } = useWallet();
  const { dict } = useDictionary();
  const modalRef = useRef<HTMLDivElement>(null);

  const { tickSize, isLoading: isLoadingTickSize } = useTickSize(
    isOpen ? tokenId : null
  );
  const decimalPlaces = getDecimalPlaces(tickSize);

  const {
    executeOrder,
    isExecuting,
    status: orderStatus,
    progressMessage,
    error: orderError,
    availableBalance,
  } = usePaperOrder();

  useEffect(() => {
    if (isOpen) {
      setSize("");
      setOrderType("market");
      setLimitPrice("");
      setLocalError(null);
      setShowSuccess(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeNum = parseFloat(size) || 0;
  const limitPriceNum = parseFloat(limitPrice) || 0;
  const effectivePrice = orderType === "limit" ? limitPriceNum : currentPrice;
  const total = sizeNum * effectivePrice;

  const outcomeNorm = outcome.trim().toLowerCase();
  const isYes = outcomeNorm === "yes" || outcomeNorm === "sí";
  const displayOutcome = isYes
    ? (dict.marketDetail?.tradingModal?.yes ?? "Sí")
    : (dict.marketDetail?.tradingModal?.no ?? "No");

  const handlePlaceOrder = async () => {
    if (sizeNum <= 0) {
      setLocalError("Las shares deben ser mayores a 0");
      return;
    }

    if (orderType === "limit") {
      if (!limitPrice || limitPriceNum <= 0) {
        setLocalError("El precio límite es requerido");
        return;
      }
      if (limitPriceNum < tickSize || limitPriceNum > 1 - tickSize) {
        setLocalError(
          `El precio debe estar entre $${tickSize.toFixed(decimalPlaces)} y $${(1 - tickSize).toFixed(decimalPlaces)}`
        );
        return;
      }
      if (!isValidTickPrice(limitPriceNum, tickSize)) {
        setLocalError(`El precio debe ser múltiplo de $${tickSize}`);
        return;
      }
    }

    try {
      setLocalError(null);
      const priceToUse = orderType === "market" ? currentPrice : limitPriceNum;
      const amountPmt = sizeNum * priceToUse;

      if (amountPmt > availableBalance) {
        setLocalError(
          `Balance insuficiente. Necesitas ${amountPmt.toFixed(2)} PMT pero tienes ${availableBalance.toFixed(2)} PMT disponibles. Usa "Recibir PMT" para obtener más.`
        );
        return;
      }

      const result = await executeOrder({
        tokenId,
        amount: amountPmt,
        size: sizeNum,
        side: "BUY",
        price: priceToUse,
        isMarketOrder: orderType === "market",
        negRisk,
        outcome: isYes ? "yes" : "no",
        marketTitle,
        marketImage,
        marketSlug,
      });

      if (result.success) {
        setShowSuccess(true);
        setTimeout(() => onClose(), 2000);
      }
    } catch (err) {
      console.error("Error placing paper order:", err);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const safeTickSize =
    typeof tickSize === "number" && !isNaN(tickSize) ? tickSize : 0.01;
  const tickSizeDisplay = safeTickSize.toFixed(decimalPlaces);
  const maxPriceDisplay = (1 - safeTickSize).toFixed(decimalPlaces);

  const isValidPriceInput = (value: string): boolean => {
    if (value === "" || value === "0" || value === "0.") return true;
    const regex = new RegExp(`^(0?\\.[0-9]{0,${decimalPlaces}}|0)$`);
    return regex.test(value);
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={handleBackdropClick}
      >
        <div
          ref={modalRef}
          className="bg-base-100 rounded-lg p-4 max-w-md w-full border border-base-300 shadow-xl animate-modal-fade-in overflow-x-hidden"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 mb-4 border-b border-base-300">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-base-content">{marketTitle}</h3>
                <span className="text-xs font-medium text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                  Paper
                </span>
              </div>
              <p className={`text-sm font-medium ${isYes ? "text-success" : "text-error"}`}>
                Comprando: {displayOutcome}
              </p>
            </div>
            <button
              onClick={onClose}
              className="btn btn-ghost btn-sm btn-circle"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Success */}
          {showSuccess && (
            <div role="alert" className="alert alert-success mb-4 shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="font-bold">Orden paper colocada!</h3>
                <div className="text-sm opacity-90">Tu orden paper ha sido procesada.</div>
              </div>
            </div>
          )}

          {/* Error */}
          {(localError || orderError) && (
            <div className="mb-3">
              <div className="flex items-center gap-2 text-amber-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm">
                  {localError ?? (orderError instanceof Error ? orderError.message : String(orderError))}
                </span>
              </div>
            </div>
          )}

          {/* Order Type */}
          <OrderTypeToggle
            orderType={orderType}
            onChangeOrderType={(type) => {
              setOrderType(type);
              setLocalError(null);
            }}
            marketLabel={dict.marketDetail?.tradingModal?.market ?? "Market"}
            limitLabel={dict.marketDetail?.tradingModal?.limit ?? "Limit"}
          />

          {/* Current Price */}
          <div className="mb-4 bg-base-200 rounded-lg p-3 border border-base-300">
            <p className="text-sm font-bold text-base-content mb-1">Precio actual</p>
            <p className="text-base font-bold text-primary">{Math.round(currentPrice * 100)}c</p>
          </div>

          {/* Shares Input */}
          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-2">
              {dict.marketDetail?.tradingModal?.shares ?? "Shares"}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={size}
              onChange={(e) => {
                if (isValidDecimalInput(e.target.value)) {
                  setSize(e.target.value);
                  setLocalError(null);
                }
              }}
              placeholder="0"
              className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-base-content"
              disabled={isExecuting}
            />
          </div>

          {/* Limit Price */}
          {orderType === "limit" && (
            <div className="mb-4">
              <label className="block text-sm font-bold text-base-content mb-2">
                {dict.marketDetail?.tradingModal?.limitPrice ?? "Precio Límite"}
                {isLoadingTickSize && (
                  <span className="ml-2 text-xs text-blue-600">Cargando tick size...</span>
                )}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={limitPrice}
                onChange={(e) => {
                  if (isValidPriceInput(e.target.value)) {
                    setLimitPrice(e.target.value);
                    setLocalError(null);
                  }
                }}
                placeholder={tickSizeDisplay}
                className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-base-content"
                disabled={isExecuting || isLoadingTickSize}
              />
              <p className="text-xs text-gray-600 mt-1">
                Tick size: ${tickSizeDisplay} &bull; Rango: ${tickSizeDisplay} - ${maxPriceDisplay}
              </p>
            </div>
          )}

          {/* Summary */}
          {sizeNum > 0 && (
            <div className="space-y-3 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-base-content">Total</span>
                <span className="text-base font-bold text-purple-700">
                  {total.toFixed(2)} PMT
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-base-content">Shares</span>
                <span className="text-base font-bold text-success">
                  {sizeNum.toFixed(2)} shares
                </span>
              </div>
            </div>
          )}

          {/* Place Order Button */}
          {(() => {
            const disabled = isExecuting || sizeNum <= 0 || !eoaAddress;
            let buttonLabel = "Comprar";
            let helpText = "";

            if (isExecuting) {
              if (orderStatus === "checking-balance") {
                buttonLabel = "Verificando balance...";
              } else if (orderStatus === "transferring-pmt") {
                buttonLabel = progressMessage?.includes("confirmación")
                  ? "Esperando confirmación..."
                  : "Transfiriendo PMT...";
              } else if (orderStatus === "saving-position") {
                buttonLabel = "Guardando posición...";
              } else {
                buttonLabel = "Procesando...";
              }
              helpText = progressMessage || "Un momento por favor";
            }

            return (
              <>
                <button
                  onClick={handlePlaceOrder}
                  disabled={disabled}
                  className={`w-full py-3 font-bold rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    !disabled
                      ? "bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                      : "bg-gray-600 text-white cursor-not-allowed"
                  }`}
                >
                  {isExecuting && <span className="loading loading-spinner loading-sm"></span>}
                  {buttonLabel}
                </button>
                {isExecuting && helpText && (
                  <p className="text-xs text-gray-500 mt-2 text-center animate-pulse">
                    {helpText}
                  </p>
                )}
                {!eoaAddress && (
                  <p className="text-xs text-yellow-600 mt-2 text-center">
                    Conecta tu wallet primero
                  </p>
                )}
                {eoaAddress && (
                  <p className="text-xs text-gray-500 mt-2">
                    Disponible: <span className="font-semibold text-purple-700">{availableBalance.toFixed(2)} PMT</span>
                  </p>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </Portal>
  );
}
