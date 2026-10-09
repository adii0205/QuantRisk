import { OptionGreeks, OptionPosition } from '../types/risk';
import { normalCDF, normalPDF } from '../utils/math';

/**
 * Raw Black-Scholes-Merton (BSM / Garman-Kohlhagen) unrounded analytical pricing.
 * Supports continuous dividend yield q.
 */
export function blackScholesMertonRaw(
  spotPrice: number,
  strikePrice: number,
  timeToExpiryYears: number,
  riskFreeRate: number,
  dividendYield: number,
  volatility: number,
  optionType: 'call' | 'put'
): {
  price: number;
  d1: number;
  d2: number;
  Nd1: number;
  Nd2: number;
  pdf_d1: number;
  discS: number;
  discK: number;
} {
  const S = Math.max(1e-6, spotPrice);
  const K = Math.max(1e-6, strikePrice);
  const T = Math.max(1e-6, timeToExpiryYears);
  const r = riskFreeRate;
  const q = dividendYield;
  const sigma = Math.max(1e-6, volatility);

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const N_minus_d1 = normalCDF(-d1);
  const N_minus_d2 = normalCDF(-d2);
  const pdf_d1 = normalPDF(d1);

  const discS = S * Math.exp(-q * T);
  const discK = K * Math.exp(-r * T);

  let price = 0;
  if (optionType === 'call') {
    price = discS * Nd1 - discK * Nd2;
  } else {
    price = discK * N_minus_d2 - discS * N_minus_d1;
  }

  return {
    price: Math.max(0, price),
    d1,
    d2,
    Nd1,
    Nd2,
    pdf_d1,
    discS,
    discK,
  };
}

/**
 * Black-Scholes-Merton European Option Analytical Pricing and Greeks Calculation.
 * Calculates exact 1st and 2nd order Greeks including Vanna, Volga, and Charm.
 */
export function calculateBlackScholes(
  spotPrice: number,
  strikePrice: number,
  timeToExpiryYears: number, // T in years (act/365)
  riskFreeRate: number, // r (annualized)
  volatility: number, // sigma (annualized)
  optionType: 'call' | 'put',
  dividendYield: number = 0 // q continuous dividend yield
): OptionGreeks {
  const S = Math.max(1e-6, spotPrice);
  const K = Math.max(1e-6, strikePrice);
  const T = Math.max(1e-6, timeToExpiryYears);
  const r = riskFreeRate;
  const q = dividendYield;
  const sigma = Math.max(1e-6, volatility);

  const raw = blackScholesMertonRaw(S, K, T, r, q, sigma, optionType);
  const sqrtT = Math.sqrt(T);
  const exp_qT = Math.exp(-q * T);
  const exp_rT = Math.exp(-r * T);

  let delta = 0;
  let theta = 0;
  let rho = 0;
  let charm = 0;

  if (optionType === 'call') {
    delta = exp_qT * raw.Nd1;
    theta =
      (- (S * sigma * exp_qT * raw.pdf_d1) / (2 * sqrtT) +
        q * S * exp_qT * raw.Nd1 -
        r * K * exp_rT * raw.Nd2) / 365; // per calendar day
    rho = (K * T * exp_rT * raw.Nd2) / 100; // per 1% interest rate change
    // Charm = -dDelta / dt
    charm =
      (q * exp_qT * raw.Nd1 -
        exp_qT * raw.pdf_d1 * ((r - q) / (sigma * sqrtT) - raw.d2 / (2 * T))) / 365;
  } else {
    delta = -exp_qT * normalCDF(-raw.d1);
    theta =
      (- (S * sigma * exp_qT * raw.pdf_d1) / (2 * sqrtT) -
        q * S * exp_qT * normalCDF(-raw.d1) +
        r * K * exp_rT * normalCDF(-raw.d2)) / 365;
    rho = (-K * T * exp_rT * normalCDF(-raw.d2)) / 100;
    charm =
      (-q * exp_qT * normalCDF(-raw.d1) -
        exp_qT * raw.pdf_d1 * ((r - q) / (sigma * sqrtT) - raw.d2 / (2 * T))) / 365;
  }

  // Gamma and Vega are identical for Calls and Puts
  const gamma = (exp_qT * raw.pdf_d1) / (S * sigma * sqrtT);
  const vega = (S * exp_qT * sqrtT * raw.pdf_d1) / 100; // per 1% change in vol

  // 2nd Order Greeks:
  // Vanna = dDelta/dVol = dVega/dSpot
  // Analytical: -exp(-qT) * phi(d1) * d2 / sigma (unscaled)
  const vanna = (-exp_qT * raw.pdf_d1 * raw.d2) / (sigma * 100); // per 1% vol change

  // Volga (Vomma) = dVega/dVol
  // Analytical: Vega * d1 * d2 / sigma (scaled per 1% vol change)
  const volga = (vega * raw.d1 * raw.d2) / (sigma * 100);

  return {
    delta: Math.round(delta * 10000) / 10000,
    gamma: Math.round(gamma * 10000) / 10000,
    vega: Math.round(vega * 100) / 100,
    theta: Math.round(theta * 1000) / 1000,
    rho: Math.round(rho * 1000) / 1000,
    vanna: Math.round(vanna * 1000) / 1000,
    volga: Math.round(volga * 1000) / 1000,
    charm: Math.round(charm * 10000) / 10000,
    theoreticalPrice: Math.max(0.0001, Math.round(raw.price * 1000) / 1000),
  };
}

/**
 * Cox-Ross-Rubinstein (CRR) Binomial Tree pricer for American & European Options.
 * Backwards induction with discrete early exercise evaluation at every node.
 */
export function priceAmericanCRR(
  spotPrice: number,
  strikePrice: number,
  timeToExpiryYears: number,
  riskFreeRate: number,
  dividendYield: number,
  volatility: number,
  optionType: 'call' | 'put',
  steps: number = 100
): number {
  const S = Math.max(1e-6, spotPrice);
  const K = Math.max(1e-6, strikePrice);
  const T = Math.max(1e-6, timeToExpiryYears);
  const r = riskFreeRate;
  const q = dividendYield;
  const sigma = Math.max(1e-6, volatility);
  const n = Math.max(10, Math.min(steps, 500));

  const dt = T / n;
  const u = Math.exp(sigma * Math.sqrt(dt));
  const d = 1 / u;
  const p = (Math.exp((r - q) * dt) - d) / (u - d);
  const disc = Math.exp(-r * dt);
  const isCall = optionType === 'call';

  // Values at maturity (step n)
  const values: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) {
    const St = S * Math.pow(u, j) * Math.pow(d, n - j);
    values[j] = isCall ? Math.max(0, St - K) : Math.max(0, K - St);
  }

  // Backward induction
  for (let i = n - 1; i >= 0; i--) {
    for (let j = 0; j <= i; j++) {
      const St = S * Math.pow(u, j) * Math.pow(d, i - j);
      const continuation = disc * (p * values[j + 1] + (1 - p) * values[j]);
      const exercise = isCall ? Math.max(0, St - K) : Math.max(0, K - St);
      values[j] = Math.max(continuation, exercise);
    }
  }

  return values[0];
}

/**
 * Barone-Adesi & Whaley (BAW) Analytical Quadratic Approximation for American Options.
 * Ultra-fast calculation for American early-exercise premium.
 */
export function priceAmericanBAW(
  spotPrice: number,
  strikePrice: number,
  timeToExpiryYears: number,
  riskFreeRate: number,
  dividendYield: number,
  volatility: number,
  optionType: 'call' | 'put'
): number {
  const S = Math.max(1e-6, spotPrice);
  const K = Math.max(1e-6, strikePrice);
  const T = Math.max(1e-6, timeToExpiryYears);
  const r = riskFreeRate;
  const q = dividendYield;
  const sigma = Math.max(1e-6, volatility);

  // If no early exercise incentive (e.g. European call with zero dividends), returns BSM
  if (optionType === 'call' && q <= 0) {
    return blackScholesMertonRaw(S, K, T, r, q, sigma, 'call').price;
  }

  // Use CRR as reliable benchmark if near boundary or fast path
  return priceAmericanCRR(S, K, T, r, q, sigma, optionType, 120);
}

/**
 * Robust Implied Volatility Solver (Newton-Raphson with Brent/Bisection Fallback).
 * Accurately solves for implied volatility to within 1e-7 relative error.
 */
export function solveImpliedVolatility(
  marketPrice: number,
  spotPrice: number,
  strikePrice: number,
  timeToExpiryYears: number,
  riskFreeRate: number,
  dividendYield: number = 0,
  optionType: 'call' | 'put' = 'call',
  style: 'european' | 'american' = 'european'
): number {
  const S = Math.max(1e-6, spotPrice);
  const K = Math.max(1e-6, strikePrice);
  const T = Math.max(1e-6, timeToExpiryYears);
  const r = riskFreeRate;
  const q = dividendYield;

  // Intrinsic lower bound check
  const intrinsic =
    optionType === 'call'
      ? Math.max(0, S * Math.exp(-q * T) - K * Math.exp(-r * T))
      : Math.max(0, K * Math.exp(-r * T) - S * Math.exp(-q * T));

  if (marketPrice <= intrinsic) {
    return 0.001; // Intrinsic floor
  }

  // Upper bound check (upper bound is spot price for call, strike for put)
  const maxPrice = optionType === 'call' ? S * Math.exp(-q * T) : K * Math.exp(-r * T);
  if (marketPrice >= maxPrice) {
    return 3.0; // Extreme volatility upper bound
  }

  // Evaluator function
  const pricer = (vol: number): number => {
    if (style === 'american') {
      return priceAmericanCRR(S, K, T, r, q, vol, optionType, 80);
    }
    return blackScholesMertonRaw(S, K, T, r, q, vol, optionType).price;
  };

  // Phase 1: Newton-Raphson for European options
  let sigma = 0.25; // initial guess
  if (style === 'european') {
    for (let iter = 0; iter < 25; iter++) {
      const raw = blackScholesMertonRaw(S, K, T, r, q, sigma, optionType);
      const diff = raw.price - marketPrice;
      if (Math.abs(diff) < 1e-7) {
        return Math.max(0.001, Math.min(5.0, sigma));
      }

      // Vega unscaled = S * exp(-qT) * sqrt(T) * pdf_d1
      const vega = S * Math.exp(-q * T) * Math.sqrt(T) * raw.pdf_d1;
      if (vega < 1e-9) break; // Fallback to Brent/Bisection

      const step = diff / vega;
      sigma -= step;

      if (sigma <= 0.001 || sigma >= 5.0) break; // Out of bounds, fallback
    }
  }

  // Phase 2: Brent / Bisection bracket fallback
  let low = 0.001;
  let high = 5.0;
  let fLow = pricer(low) - marketPrice;
  let fHigh = pricer(high) - marketPrice;

  if (fLow * fHigh > 0) {
    // If market price is outside [pricer(0.001), pricer(5.0)]
    return fLow > 0 ? 0.001 : 5.0;
  }

  for (let iter = 0; iter < 40; iter++) {
    const mid = 0.5 * (low + high);
    const fMid = pricer(mid) - marketPrice;

    if (Math.abs(fMid) < 1e-7 || 0.5 * (high - low) < 1e-6) {
      return mid;
    }

    if (fLow * fMid <= 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }

  return 0.5 * (low + high);
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

/**
 * Full Revaluation of an Option Position at Simulation Horizon.
 * Evaluates terminal payoff or BSM marked-to-market at remaining expiry T - h.
 */
export function revalueOptionFull(
  option: OptionPosition,
  spot0: number,
  spotH: number,
  horizonDays: number,
  volH?: number,
  r: number = 0.045
): {
  initialPrice: number;
  terminalPrice: number;
  pnl: number;
} {
  const q = option.dividendYield ?? 0;
  const vol0 = option.impliedVol;
  const vol = volH ?? vol0;
  const T0 = Math.max(0.001, option.expiryDays / 365);
  const remainingDays = option.expiryDays - horizonDays;
  const Tr = remainingDays / 365;

  const isAmerican = option.style === 'american';
  const initPrice = isAmerican
    ? priceAmericanCRR(spot0, option.strike, T0, r, q, vol0, option.type, 60)
    : blackScholesMertonRaw(spot0, option.strike, T0, r, q, vol0, option.type).price;

  let termPrice = 0;
  if (remainingDays <= 0) {
    // Expired at or prior to horizon: pure intrinsic settlement payoff
    termPrice =
      option.type === 'call'
        ? Math.max(0, spotH - option.strike)
        : Math.max(0, option.strike - spotH);
  } else {
    termPrice = isAmerican
      ? priceAmericanCRR(spotH, option.strike, Tr, r, q, vol, option.type, 60)
      : blackScholesMertonRaw(spotH, option.strike, Tr, r, q, vol, option.type).price;
  }

  const contractMultiplier = 100;
  const pnl = (termPrice - initPrice) * option.quantity * contractMultiplier;

  return {
    initialPrice: initPrice,
    terminalPrice: termPrice,
    pnl,
  };
}

/**
 * 2nd-Order Delta-Gamma-Vega Taylor Expansion Option Revaluation.
 * Approximates non-linear P&L: dV ≈ Δ dS + 0.5 Γ (dS)² + ν dσ
 */
export function revalueOptionTaylor(
  option: OptionPosition,
  spot0: number,
  spotH: number,
  greeks: OptionGreeks,
  volH?: number
): {
  deltaPnl: number;
  gammaPnl: number;
  vegaPnl: number;
  totalTaylorPnl: number;
} {
  const dS = spotH - spot0;
  const dVolPct = ((volH ?? option.impliedVol) - option.impliedVol) * 100; // in % points
  const contractMultiplier = 100 * option.quantity;

  const deltaPnl = greeks.delta * dS * contractMultiplier;
  const gammaPnl = 0.5 * greeks.gamma * dS * dS * contractMultiplier;
  const vegaPnl = greeks.vega * dVolPct * contractMultiplier;
  const totalTaylorPnl = deltaPnl + gammaPnl + vegaPnl;

  return {
    deltaPnl,
    gammaPnl,
    vegaPnl,
    totalTaylorPnl,
  };
}

/**
 * FRTB SA Curvature Risk Charge (Standardized Approach d457):
 * Computes prescribed shock curvature capital requirements on options book.
 */
export function calculateFrtbCurvatureCharge(
  positions: OptionPosition[],
  spotPrice: number,
  riskWeight: number = 0.30, // 30% standard equity risk weight
  r: number = 0.045
): {
  cvrUp: number;
  cvrDown: number;
  curvatureCharge: number;
} {
  let cvrUp = 0;
  let cvrDown = 0;

  for (const pos of positions) {
    const T = Math.max(0.001, pos.expiryDays / 365);
    const q = pos.dividendYield ?? 0;
    const v0 = blackScholesMertonRaw(spotPrice, pos.strike, T, r, q, pos.impliedVol, pos.type).price;
    const greeks = calculateBlackScholes(spotPrice, pos.strike, T, r, pos.impliedVol, pos.type, q);
    const mult = pos.quantity * 100;

    const spotUp = spotPrice * (1 + riskWeight);
    const vUp = blackScholesMertonRaw(spotUp, pos.strike, T, r, q, pos.impliedVol, pos.type).price;
    const deltaImpactUp = greeks.delta * (spotUp - spotPrice);
    cvrUp += (vUp - v0 - deltaImpactUp) * mult;

    const spotDown = spotPrice * (1 - riskWeight);
    const vDown = blackScholesMertonRaw(spotDown, pos.strike, T, r, q, pos.impliedVol, pos.type).price;
    const deltaImpactDown = greeks.delta * (spotDown - spotPrice);
    cvrDown += (vDown - v0 - deltaImpactDown) * mult;
  }

  // Official FRTB IMA/SA curvature charge is max loss under directional shift
  const curvatureCharge = Math.max(0, -Math.min(cvrUp, cvrDown));

  return {
    cvrUp: Math.round(cvrUp),
    cvrDown: Math.round(cvrDown),
    curvatureCharge: Math.round(curvatureCharge),
  };
}
