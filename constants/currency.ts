/**
 * Display currency constants for user preference.
 * PMT = 1 USD; amounts are shown in user-selected currency (USD, MXN, EUR).
 */

import type { DisplayCurrency } from "@/utils/currencyDisplay";

export type { DisplayCurrency };

export const VALID_DISPLAY_CURRENCIES: readonly string[] = ["USD", "MXN", "EUR"];

/**
 * Options for Nav balance currency select (value + label with flags).
 */
export const DISPLAY_CURRENCY_OPTIONS: { value: DisplayCurrency; label: string }[] = [
  { value: "USD", label: "USD 🇺🇸" },
  { value: "MXN", label: "MXN 🇲🇽" },
  { value: "EUR", label: "EUR 🇪🇺" },
];

export function isDisplayCurrencyValid(v: string): boolean {
  return (VALID_DISPLAY_CURRENCIES as readonly string[]).includes(v);
}
