export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'JPY' | 'CHF';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
  // Baseline exchange rate relative to USD (USD = 1.0)
  usdRate: number; // e.g. INR = 83.5, EUR = 0.92, GBP = 0.79, JPY = 152.0, CHF = 0.89
  annualVol: number; // typical FX annualized volatility against USD
}

export const SUPPORTED_CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    locale: 'en-US',
    usdRate: 1.0,
    annualVol: 0.0,
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    locale: 'de-DE',
    usdRate: 0.92,
    annualVol: 0.075,
  },
  GBP: {
    code: 'GBP',
    symbol: '£',
    name: 'British Pound',
    locale: 'en-GB',
    usdRate: 0.79,
    annualVol: 0.082,
  },
  INR: {
    code: 'INR',
    symbol: '₹',
    name: 'Indian Rupee',
    locale: 'en-IN',
    usdRate: 83.5,
    annualVol: 0.065,
  },
  JPY: {
    code: 'JPY',
    symbol: '¥',
    name: 'Japanese Yen',
    locale: 'ja-JP',
    usdRate: 152.0,
    annualVol: 0.105,
  },
  CHF: {
    code: 'CHF',
    symbol: 'CHF ',
    name: 'Swiss Franc',
    locale: 'de-CH',
    usdRate: 0.89,
    annualVol: 0.078,
  },
};

/**
 * Format monetary amounts cleanly and consistently across all views
 */
export function formatCurrency(
  amount: number,
  currencyCode: CurrencyCode = 'USD',
  compact: boolean = false
): string {
  const config = SUPPORTED_CURRENCIES[currencyCode] || SUPPORTED_CURRENCIES.USD;
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (compact) {
    if (absAmount >= 1e9) {
      return `${sign}${config.symbol}${(absAmount / 1e9).toFixed(2)}B`;
    }
    if (absAmount >= 1e6) {
      return `${sign}${config.symbol}${(absAmount / 1e6).toFixed(2)}M`;
    }
    if (absAmount >= 1e3) {
      return `${sign}${config.symbol}${(absAmount / 1e3).toFixed(1)}k`;
    }
  }

  // Exact localized number with 2 decimals if small or 0 decimals if large integer
  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits: absAmount < 100 && absAmount !== 0 ? 2 : 0,
    maximumFractionDigits: 2,
  };

  try {
    return `${sign}${config.symbol}${absAmount.toLocaleString(config.locale, options)}`;
  } catch {
    return `${sign}${config.symbol}${absAmount.toFixed(2)}`;
  }
}

/**
 * Compute cross-currency exchange rate from source currency to target currency
 */
export function getFxRate(from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return 1.0;
  const fromUsd = SUPPORTED_CURRENCIES[from]?.usdRate ?? 1.0;
  const toUsd = SUPPORTED_CURRENCIES[to]?.usdRate ?? 1.0;
  // toUsd / fromUsd: e.g. USD to INR = 83.5 / 1.0 = 83.5. INR to USD = 1.0 / 83.5 = 0.01197
  return toUsd / fromUsd;
}

/**
 * Adjust an asset's historical returns into the portfolio's base currency,
 * treating FX as an explicit risk factor with cross-currency volatility.
 */
export function convertReturnsToBaseCurrency(
  returns: number[],
  assetCurrency: CurrencyCode,
  baseCurrency: CurrencyCode,
  correlationWithAsset: number = -0.2
): number[] {
  if (assetCurrency === baseCurrency) {
    return returns;
  }

  const assetFxVol = SUPPORTED_CURRENCIES[assetCurrency]?.annualVol ?? 0.07;
  const baseFxVol = SUPPORTED_CURRENCIES[baseCurrency]?.annualVol ?? 0.07;
  // Combined daily FX volatility: sigma_fx / sqrt(252)
  const combinedAnnualVol = Math.sqrt(assetFxVol * assetFxVol + baseFxVol * baseFxVol);
  const dailyFxVol = combinedAnnualVol / Math.sqrt(252);

  // FX drift is assumed approximately zero / interest rate differential
  return returns.map((r, idx) => {
    // Generate correlated FX return shock deterministically based on return
    // r_base = (1 + r_asset)(1 + r_fx) - 1 ~ r_asset + r_fx
    const pseudoZ = Math.sin(idx * 7919 + idx) * 0.95;
    const fxReturn = dailyFxVol * (correlationWithAsset * (r / 0.015) + Math.sqrt(1 - correlationWithAsset ** 2) * pseudoZ);
    return (1 + r) * (1 + fxReturn) - 1;
  });
}
