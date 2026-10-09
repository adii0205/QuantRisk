import { describe, it, expect } from 'vitest';
import {
  blackScholesMertonRaw,
  calculateBlackScholes,
  priceAmericanCRR,
  revalueOptionFull,
  solveImpliedVolatility,
} from './options';
import { runPortfolioSimulation } from './models';
import { Portfolio, SimulationConfig } from '../types/risk';

describe('Phase 4.1: Options Engine Analytical Rigor & Greeks', () => {
  it('put-call parity holds to 1e-10 with continuous dividend yield q', () => {
    const testCases = [
      { S: 100, K: 100, T: 1.0, r: 0.05, q: 0.02, sigma: 0.20 },
      { S: 150, K: 140, T: 0.5, r: 0.04, q: 0.015, sigma: 0.28 },
      { S: 80, K: 95, T: 2.0, r: 0.03, q: 0.03, sigma: 0.35 },
      { S: 2500, K: 2600, T: 0.25, r: 0.055, q: 0.018, sigma: 0.16 },
      { S: 50, K: 50, T: 0.1, r: 0.02, q: 0.0, sigma: 0.45 },
    ];

    for (const { S, K, T, r, q, sigma } of testCases) {
      const call = blackScholesMertonRaw(S, K, T, r, q, sigma, 'call').price;
      const put = blackScholesMertonRaw(S, K, T, r, q, sigma, 'put').price;

      const parityLHS = call - put;
      const parityRHS = S * Math.exp(-q * T) - K * Math.exp(-r * T);
      const diff = Math.abs(parityLHS - parityRHS);

      expect(diff).toBeLessThan(1e-10);
    }
  });

  it('Greeks match central finite differences to high precision', () => {
    const S = 105;
    const K = 100;
    const T = 0.75;
    const r = 0.045;
    const q = 0.018;
    const sigma = 0.24;

    const pricer = (s: number, k: number, t: number, rate: number, vol: number, type: 'call' | 'put') =>
      blackScholesMertonRaw(s, k, t, rate, q, vol, type).price;

    const hS = 0.001;
    const hVol = 0.0001;
    const hT = 0.0001;
    const hR = 0.0001;

    // Call Greeks finite difference
    const pCenter = pricer(S, K, T, r, sigma, 'call');
    const pS_up = pricer(S + hS, K, T, r, sigma, 'call');
    const pS_down = pricer(S - hS, K, T, r, sigma, 'call');
    const fdDelta = (pS_up - pS_down) / (2 * hS);
    const fdGamma = (pS_up - 2 * pCenter + pS_down) / (hS * hS);

    const pVol_up = pricer(S, K, T, r, sigma + hVol, 'call');
    const pVol_down = pricer(S, K, T, r, sigma - hVol, 'call');
    const fdVega = (pVol_up - pVol_down) / (2 * hVol); // unscaled vega

    const pT_up = pricer(S, K, T + hT, r, sigma, 'call');
    const pT_down = pricer(S, K, T - hT, r, sigma, 'call');
    // Theta = -dP/dT
    const fdThetaAnnual = -(pT_up - pT_down) / (2 * hT);
    const fdThetaCalendarDay = fdThetaAnnual / 365;

    const pR_up = pricer(S, K, T, r + hR, sigma, 'call');
    const pR_down = pricer(S, K, T, r - hR, sigma, 'call');
    const fdRhoPer1Pct = (pR_up - pR_down) / (2 * hR) / 100;

    // Analytical values from calculateBlackScholes
    const analytical = calculateBlackScholes(S, K, T, r, sigma, 'call', q);

    expect(Math.abs(analytical.delta - fdDelta)).toBeLessThan(1e-4);
    expect(Math.abs(analytical.gamma - fdGamma)).toBeLessThan(1e-4);
    expect(Math.abs(analytical.vega - fdVega / 100)).toBeLessThan(1e-2);
    expect(Math.abs(analytical.theta - fdThetaCalendarDay)).toBeLessThan(1e-2);
    expect(Math.abs(analytical.rho - fdRhoPer1Pct)).toBeLessThan(1e-2);

    // Cross Greek: Vanna = dDelta/dVol
    const deltaVolUp = (pricer(S + hS, K, T, r, sigma + hVol, 'call') - pricer(S - hS, K, T, r, sigma + hVol, 'call')) / (2 * hS);
    const deltaVolDown = (pricer(S + hS, K, T, r, sigma - hVol, 'call') - pricer(S - hS, K, T, r, sigma - hVol, 'call')) / (2 * hS);
    const fdVannaUnscaled = (deltaVolUp - deltaVolDown) / (2 * hVol);
    const fdVannaPer1Pct = fdVannaUnscaled / 100;
    expect(Math.abs(analytical.vanna - fdVannaPer1Pct)).toBeLessThan(1e-2);

    // Cross Greek: Volga = dVega/dVol
    const fdVolgaUnscaled = (pVol_up - 2 * pCenter + pVol_down) / (hVol * hVol);
    const fdVolgaPer1Pct = fdVolgaUnscaled / 10000;
    expect(Math.abs(analytical.volga - fdVolgaPer1Pct)).toBeLessThan(1e-2);
  });

  it('American CRR option pricing satisfies early exercise bounds', () => {
    // Put option with high interest rate: American put must be >= European put
    const S = 85;
    const K = 100;
    const T = 0.5;
    const r = 0.08;
    const q = 0.0;
    const sigma = 0.25;

    const euroPut = blackScholesMertonRaw(S, K, T, r, q, sigma, 'put').price;
    const americanPut = priceAmericanCRR(S, K, T, r, q, sigma, 'put', 100);
    const intrinsic = K - S; // 15

    expect(americanPut).toBeGreaterThanOrEqual(euroPut);
    expect(americanPut).toBeGreaterThanOrEqual(intrinsic);
  });

  it('implied volatility solver recovers exact volatility to within 1e-6', () => {
    const S = 100;
    const K = 105;
    const T = 0.45;
    const r = 0.04;
    const q = 0.015;
    const trueSigma = 0.265;

    const marketCall = blackScholesMertonRaw(S, K, T, r, q, trueSigma, 'call').price;
    const recoveredVol = solveImpliedVolatility(marketCall, S, K, T, r, q, 'call');

    expect(Math.abs(recoveredVol - trueSigma)).toBeLessThan(1e-6);
  });
});

describe('Phase 4.3: Options inside Monte Carlo Simulation', () => {
  it('protective put portfolio truncates left tail and reduces Expected Shortfall', () => {
    const baseAsset = {
      symbol: 'EQ1',
      name: 'Equity Portfolio Core',
      category: 'Equity' as const,
      weight: 1.0,
      currentPrice: 100,
      expectedAnnualReturn: 0.08,
      annualVolatility: 0.25,
      historicalReturns: new Array(500).fill(0).map((_, i) => (Math.sin(i * 0.1) * 0.01)),
    };

    const unhedgedPortfolio: Portfolio = {
      id: 'unhedged',
      name: 'Unhedged Equity',
      description: 'Pure 100% long equity without options floor',
      cashWeight: 0,
      leverage: 1.0,
      totalCapital: 100000,
      assets: [baseAsset],
    };

    const hedgedPortfolio: Portfolio = {
      id: 'hedged',
      name: 'Protective Put Hedged Equity',
      description: 'Long equity + Long 10 OTM protective put contracts floor',
      cashWeight: 0,
      leverage: 1.0,
      totalCapital: 100000,
      assets: [baseAsset],
      options: [
        {
          id: 'prot_put',
          underlying: 'EQ1',
          type: 'put',
          style: 'european',
          strike: 95, // 5% OTM strike floor
          expiryDays: 30,
          impliedVol: 0.25,
          quantity: 10, // 10 contracts * 100 multiplier = 1000 shares protected
          premium: 0,
          dividendYield: 0.0,
        },
      ],
    };

    const simConfig: SimulationConfig = {
      model: 'gbm',
      paths: 10000,
      timeHorizonDays: 21,
      varianceReduction: 'sobol_qmc',
      hardwareEngine: 'cpu_single',
      confidenceLevels: [0.95, 0.99],
      optionsPricingMode: 'full_revaluation',
    };

    const unhedgedResult = runPortfolioSimulation(unhedgedPortfolio, simConfig);
    const hedgedResult = runPortfolioSimulation(hedgedPortfolio, simConfig);

    // Hedged portfolio 99% ES should be lower (smaller loss) than unhedged portfolio
    expect(hedgedResult.riskMetrics.es99).toBeLessThan(unhedgedResult.riskMetrics.es99);

    // Hedged portfolio 99% VaR should also be lower than unhedged
    expect(hedgedResult.riskMetrics.var99).toBeLessThan(unhedgedResult.riskMetrics.var99);
  });
});
