/**
 * Display-only currency conversion: USD → user-selected display currency (USD, EUR, MXN).
 * Used for rendering balances and costs; underlying data and APIs remain in USD.
 * PMT is 1:1 with USD, so PMT amounts are passed as USD here.
 */

import type { ExchangeRates } from "@/utils/onrampUrl";
import config from "@/config";

export type DisplayCurrency = "USD" | "EUR" | "MXN";

const FALLBACK_RATES: ExchangeRates = {
  MXN_TO_USD: config.exchangeRates?.MXN_TO_USD ?? 0.058,
  EUR_TO_USD: config.exchangeRates?.EUR_TO_USD ?? 1.08,
};

/**
 * Convert a USD amount to the display currency amount.
 * USD: return as-is. MXN/EUR: divide USD by the rate (e.g. 1 MXN = X USD => amount MXN = usd / X).
 */
export function usdToDisplayAmount(
  usd: number,
  currency: DisplayCurrency,
  rates: ExchangeRates | null
): number {
  if (currency === "USD") return usd;
  const r = rates ?? FALLBACK_RATES;
  if (currency === "MXN" && r.MXN_TO_USD != null && r.MXN_TO_USD > 0)
    return usd / r.MXN_TO_USD;
  if (currency === "EUR" && r.EUR_TO_USD != null && r.EUR_TO_USD > 0)
    return usd / r.EUR_TO_USD;
  return usd;
}

/**
 * Symbol/label for the display currency (e.g. $ for USD, € for EUR, MX$ for MXN).
 */
export function getDisplaySymbol(currency: DisplayCurrency): string {
  switch (currency) {
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "MXN":
      return "MX$";
    default:
      return "$";
  }
}

/**
 * Default decimal places for the currency (e.g. 2 for balances, 3 can be passed for prices).
 */
export function getDisplayDecimals(currency: DisplayCurrency): number {
  return 2;
}

/**
 * Format a number in the display currency with symbol and optional decimal override.
 * Used by formatUsd in context after conversion.
 */
export function formatDisplayAmount(
  amount: number,
  currency: DisplayCurrency,
  decimals?: number
): string {
  const d = decimals ?? getDisplayDecimals(currency);
  const symbol = getDisplaySymbol(currency);
  return `${symbol}${amount.toFixed(d)}`;
}

/**
 * Infer display currency from browser language/locale (e.g. es-MX → MXN, en-US → USD).
 * Used once for new users (e.g. when no stored preference or when onboarding completes).
 * Default: EUR.
 */
export function getDisplayCurrencyFromBrowserLocale(): DisplayCurrency {
  if (typeof window === "undefined" || !navigator?.language) return "EUR";
  const raw = (navigator.language || "").toLowerCase().replace("_", "-");
  if (raw.includes("-mx") || raw === "es-mx") return "MXN";
  if (raw.includes("-us") || raw === "en-us" || raw === "es-us") return "USD";
  return "EUR";
}
