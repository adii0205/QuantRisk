import { OptionGreeks, OptionPosition } from '../types/risk';
import { normalCDF, normalPDF } from '../utils/math';

/**
 * Black-Scholes European Option Analytical Pricing and Greeks Calculation.
 */
export function calculateBlackScholes(
  spotPrice: number,
  strikePrice: number,
  timeToExpiryYears: number, // T
  riskFreeRate: number, // r
  volatility: number, // sigma
  optionType: 'call' | 'put'
): OptionGreeks {
  const S = Math.max(0.01, spotPrice);
  const K = Math.max(0.01, strikePrice);
  const T = Math.max(0.001, timeToExpiryYears);
  const r = riskFreeRate;
  const sigma = Math.max(0.01, volatility);

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const N_minus_d1 = normalCDF(-d1);
  const N_minus_d2 = normalCDF(-d2);
  const pdf_d1 = normalPDF(d1);

  let theoreticalPrice = 0;
  let delta = 0;
  let theta = 0;
  let rho = 0;

  if (optionType === 'call') {
    theoreticalPrice = S * Nd1 - K * Math.exp(-r * T) * Nd2;
    delta = Nd1;
    theta =
      (- (S * pdf_d1 * sigma) / (2 * sqrtT) -
        r * K * Math.exp(-r * T) * Nd2) / 365; // Per calendar day
    rho = (K * T * Math.exp(-r * T) * Nd2) / 100; // Per 1% interest rate change
  } else {
    theoreticalPrice = K * Math.exp(-r * T) * N_minus_d2 - S * N_minus_d1;
    delta = -N_minus_d1;
    theta =
      (- (S * pdf_d1 * sigma) / (2 * sqrtT) +
        r * K * Math.exp(-r * T) * N_minus_d2) / 365;
    rho = (-K * T * Math.exp(-r * T) * N_minus_d2) / 100;
  }

  // Gamma and Vega are identical for Calls and Puts
  const gamma = pdf_d1 / (S * sigma * sqrtT);
  const vega = (S * sqrtT * pdf_d1) / 100; // Dollar change per 1% change in IV

  return {
    delta: Math.round(delta * 1000) / 1000,
    gamma: Math.round(gamma * 10000) / 10000,
    vega: Math.round(vega * 100) / 100,
    theta: Math.round(theta * 100) / 100,
    rho: Math.round(rho * 100) / 100,
    theoreticalPrice: Math.max(0.01, Math.round(theoreticalPrice * 100) / 100),
  };
}

export type StrategyType =
  | 'covered_call'
  | 'protective_put'
  | 'straddle'
  | 'strangle'
  | 'iron_condor'
  | 'custom';

export interface StrategyTemplate {
  name: string;
  type: StrategyType;
  description: string;
  legs: {
    type: 'call' | 'put';
    strikeOffsetPercent: number; // e.g. 0.05 = +5% OTM
    expiryDays: number;
    quantity: number; // +1 = long, -1 = short
  }[];
}

export const OPTION_STRATEGIES: StrategyTemplate[] = [
  {
    name: 'Covered Call (Yield Enhancement)',
    type: 'covered_call',
    description: 'Sell 1 OTM Call against 100 shares of underlying to generate premium income.',
    legs: [{ type: 'call', strikeOffsetPercent: 0.05, expiryDays: 30, quantity: -1 }],
  },
  {
    name: 'Protective Put (Downside Catastrophe Floor)',
    type: 'protective_put',
    description: 'Long OTM Put floor hedge protecting equity holdings against extreme market crashes.',
    legs: [{ type: 'put', strikeOffsetPercent: -0.07, expiryDays: 45, quantity: 1 }],
  },
  {
    name: 'Long Straddle (Pure Volatility Long)',
    type: 'straddle',
    description: 'Simultaneously buy ATM Call and ATM Put. Profits from massive volatility expansions in either direction.',
    legs: [
      { type: 'call', strikeOffsetPercent: 0.0, expiryDays: 30, quantity: 1 },
      { type: 'put', strikeOffsetPercent: 0.0, expiryDays: 30, quantity: 1 },
    ],
  },
  {
    name: 'Long Strangle (Out-of-the-Money Volatility)',
    type: 'strangle',
    description: 'Buy OTM Call and OTM Put at lower cost than straddle, expecting violent price breakout.',
    legs: [
      { type: 'call', strikeOffsetPercent: 0.06, expiryDays: 30, quantity: 1 },
      { type: 'put', strikeOffsetPercent: -0.06, expiryDays: 30, quantity: 1 },
    ],
  },
  {
    name: 'Iron Condor (Delta-Neutral Range Bound)',
    type: 'iron_condor',
    description: 'Defined-risk 4-legged options strategy seeking theta decay inside an expected price channel.',
    legs: [
      { type: 'put', strikeOffsetPercent: -0.10, expiryDays: 30, quantity: 1 },
      { type: 'put', strikeOffsetPercent: -0.05, expiryDays: 30, quantity: -1 },
      { type: 'call', strikeOffsetPercent: 0.05, expiryDays: 30, quantity: -1 },
      { type: 'call', strikeOffsetPercent: 0.10, expiryDays: 30, quantity: 1 },
    ],
  },
];

// Calculate Portfolio Volatility Shock Impact (Basel Market Risk Options Requirement)
export function calculateOptionsVolatilityShock(
  positions: OptionPosition[],
  spotPrice: number,
  volShockPercent: number = 0.30 // e.g. +30% volatility shock
): {
  baseValue: number;
  shockedValue: number;
  valueChange: number;
  totalDelta: number;
  totalGamma: number;
  totalVega: number;
} {
  let baseValue = 0;
  let shockedValue = 0;
  let totalDelta = 0;
  let totalGamma = 0;
  let totalVega = 0;
  const r = 0.045;

  for (const pos of positions) {
    const T = pos.expiryDays / 365;
    const baseGreeks = calculateBlackScholes(spotPrice, pos.strike, T, r, pos.impliedVol, pos.type);
    const shockedGreeks = calculateBlackScholes(
      spotPrice,
      pos.strike,
      T,
      r,
      pos.impliedVol * (1 + volShockPercent),
      pos.type
    );

    const posValBase = baseGreeks.theoreticalPrice * pos.quantity * 100;
    const posValShocked = shockedGreeks.theoreticalPrice * pos.quantity * 100;

    baseValue += posValBase;
    shockedValue += posValShocked;
    totalDelta += baseGreeks.delta * pos.quantity * 100;
    totalGamma += baseGreeks.gamma * pos.quantity * 100;
    totalVega += baseGreeks.vega * pos.quantity * 100;
  }

  return {
    baseValue: Math.round(baseValue),
    shockedValue: Math.round(shockedValue),
    valueChange: Math.round(shockedValue - baseValue),
    totalDelta: Math.round(totalDelta * 100) / 100,
    totalGamma: Math.round(totalGamma * 1000) / 1000,
    totalVega: Math.round(totalVega),
  };
}
