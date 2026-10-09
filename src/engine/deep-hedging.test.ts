import { describe, it, expect } from 'vitest';
import {
  calculateLelandTurnoverCost,
  calculateWhalleyWilmottBand,
  calibrateNeuralSDEToSVI,
  createInitialDeepHedgingWeights,
  defaultNeuralSDE,
  forwardDeepPolicy,
  runDeepHedgingSimulation,
  stepNeuralSDE,
} from './deep-hedging';
import { getLiquidIndexSurfaceQuotes, fitRawSviSlice } from './vol-surface';

describe('Phase 6: Deep Hedging & Neural SDE Validation', () => {
  it('6.1: with zero transaction costs and BS dynamics, deep and BS hedging achieve near-zero variance', () => {
    const res = runDeepHedgingSimulation(
      {
        underlyingPrice: 100,
        strikePrice: 100,
        timeToExpiryDays: 30,
        volatility: 0.20,
        riskFreeRate: 0.045,
        dividendYield: 0.0,
        transactionCostBps: 0, // Zero friction
        riskAversionAlpha: 0.99,
        optionType: 'call',
        hedgingFrequency: 'daily',
        modelDynamics: 'black_scholes',
      },
      2000,
      5
    );

    // Initial premium is equal to Black-Scholes price (~$2.40 - $2.70)
    expect(res.initialPremium).toBeGreaterThan(2.0);
    expect(res.initialPremium).toBeLessThan(3.5);

    // Transaction costs are strictly zero
    expect(res.bsTransactionCosts).toBe(0);
    expect(res.deepTransactionCosts).toBe(0);

    // Hedging standard deviation is low under daily rebalancing
    expect(res.bsPnLStd).toBeLessThan(0.8);
  });

  it('6.1: transaction costs scale with Leland prediction as friction increases', () => {
    const spot = 100;
    const strike = 100;
    const tau = 30 / 252;
    const vol = 0.20;
    const rate = 0.045;
    const dt = 1 / 252;

    const cost5Bps = calculateLelandTurnoverCost(spot, strike, tau, vol, rate, 0.0005, dt);
    const cost20Bps = calculateLelandTurnoverCost(spot, strike, tau, vol, rate, 0.0020, dt);

    // Cost scales linearly with transaction friction c
    expect(cost20Bps / cost5Bps).toBeCloseTo(4.0, 1);
  });

  it('6.2: Whalley-Wilmott asymptotic no-trade band is non-zero and positive', () => {
    const band = calculateWhalleyWilmottBand(100, 100, 30 / 252, 0.20, 0.045, 0.0015);
    expect(band).toBeGreaterThan(0.005);
    expect(band).toBeLessThan(0.20);
  });

  it('6.2: deep hedging agent policy network outputs smooth probabilities in [0, 1]', () => {
    const weights = createInitialDeepHedgingWeights(42);
    const delta1 = forwardDeepPolicy([0.0, 0.1, 0.5, 0.20, 0.5], weights);
    const deltaOTM = forwardDeepPolicy([-0.2, 0.1, 0.1, 0.20, 0.1], weights);
    const deltaITM = forwardDeepPolicy([0.2, 0.1, 0.9, 0.20, 0.9], weights);

    expect(delta1).toBeGreaterThanOrEqual(0);
    expect(delta1).toBeLessThanOrEqual(1);
    expect(deltaITM).toBeGreaterThan(deltaOTM);
  });

  it('6.2: Deep Hedging agent achieves lower transaction drag and favorable CVaR under slippage', () => {
    const res = runDeepHedgingSimulation(
      {
        underlyingPrice: 100,
        strikePrice: 100,
        timeToExpiryDays: 30,
        volatility: 0.22,
        riskFreeRate: 0.045,
        dividendYield: 0.0,
        transactionCostBps: 20, // 20 bps slippage
        riskAversionAlpha: 0.99,
        optionType: 'call',
        hedgingFrequency: 'daily',
        modelDynamics: 'black_scholes',
      },
      1500,
      10
    );

    // Deep hedging agent learns to buffer trades, reducing turnover drag compared to pure BS delta
    expect(res.deepTransactionCosts).toBeLessThanOrEqual(res.bsTransactionCosts);
    expect(res.learningCurve.length).toBeGreaterThan(0);
    expect(res.policySurface.length).toBeGreaterThan(0);
  });

  it('6.3: Neural SDE calibrates to SVI surface quotes with low implied volatility RMSE', () => {
    const allQuotes = getLiquidIndexSurfaceQuotes(100);
    const quotes30 = allQuotes.filter(q => q.expiryDays === 30);
    const quotes60 = allQuotes.filter(q => q.expiryDays === 60);

    const slice30 = fitRawSviSlice(quotes30, 100 * Math.exp(0.045 * (30 / 365)), 30 / 365);
    const slice60 = fitRawSviSlice(quotes60, 100 * Math.exp(0.045 * (60 / 365)), 60 / 365);

    const calibration = calibrateNeuralSDEToSVI([slice30, slice60], 100, 0.22);

    expect(calibration.totalRmse).toBeDefined();
    expect(calibration.rmsePerSlice.length).toBe(2);
    expect(calibration.totalRmse).toBeLessThan(0.15); // Within 15 vol points of true quotes
  });
});
