"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import useExchangeRates from "@/hooks/useExchangeRates";
import {
  type DisplayCurrency,
  formatDisplayAmount,
  usdToDisplayAmount,
  getDisplayCurrencyFromBrowserLocale,
} from "@/utils/currencyDisplay";

const STORAGE_KEY = "bofet_display_currency";

function readStoredCurrency(): DisplayCurrency | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "EUR" || v === "MXN" || v === "USD") return v;
  } catch {
    // ignore
  }
  return null;
}

type CurrencyContextValue = {
  currency: DisplayCurrency;
  setCurrency: (c: DisplayCurrency) => void;
  rates: ReturnType<typeof useExchangeRates>["rates"];
  isLoading: boolean;
  formatUsd: (usd: number, decimals?: number) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<DisplayCurrency>("EUR");
  const { rates, isLoading } = useExchangeRates();

  useEffect(() => {
    const stored = readStoredCurrency();
    if (stored) {
      setCurrencyState(stored);
    } else {
      const detected = getDisplayCurrencyFromBrowserLocale();
      setCurrencyState(detected);
      try {
        localStorage.setItem(STORAGE_KEY, detected);
      } catch {
        // ignore
      }
    }
  }, []);

  const setCurrency = useCallback((c: DisplayCurrency) => {
    setCurrencyState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      // ignore
    }
  }, []);

  const formatUsd = useCallback(
    (usd: number, decimals?: number): string => {
      const amount = usdToDisplayAmount(usd, currency, rates ?? null);
      return formatDisplayAmount(amount, currency, decimals);
    },
    [currency, rates]
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      setCurrency,
      rates,
      isLoading,
      formatUsd,
    }),
    [currency, setCurrency, rates, isLoading, formatUsd]
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return ctx;
}
