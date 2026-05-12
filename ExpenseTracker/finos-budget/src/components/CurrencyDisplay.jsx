/**
 * CurrencyDisplay — Centralized currency formatting that respects selected currency.
 */

export const CURRENCIES = {
  INR: { symbol: "₹", code: "INR", locale: "en-IN", name: "Indian Rupee" },
  USD: { symbol: "$", code: "USD", locale: "en-US", name: "US Dollar" },
  EUR: { symbol: "€", code: "EUR", locale: "de-DE", name: "Euro" },
  GBP: { symbol: "£", code: "GBP", locale: "en-GB", name: "British Pound" },
  JPY: { symbol: "¥", code: "JPY", locale: "ja-JP", name: "Japanese Yen" },
};

export function formatCurrency(amount, currencyCode = "INR") {
  const c = CURRENCIES[currencyCode] || CURRENCIES.INR;
  try {
    return c.symbol + Number(amount).toLocaleString(c.locale);
  } catch {
    return c.symbol + Number(amount).toLocaleString("en-IN");
  }
}

export function getCurrencySymbol(currencyCode = "INR") {
  return (CURRENCIES[currencyCode] || CURRENCIES.INR).symbol;
}

/**
 * React component version
 */
export default function CurrencyDisplay({ amount, currency = "INR", style = {}, className = "" }) {
  return (
    <span className={className} style={style}>
      {formatCurrency(amount, currency)}
    </span>
  );
}
