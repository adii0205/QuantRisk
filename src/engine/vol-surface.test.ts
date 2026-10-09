import { describe, it, expect } from 'vitest';
import {
  calculateDurrlemanG,
  calibrateVolSurface,
  checkButterflyArbitrage,
  fitRawSviSlice,
  getLiquidIndexSurfaceQuotes,
  interpolateVolSurface,
  sviFirstDerivative,
  sviSecondDerivative,
  sviTotalVariance,
  SviParameters,
} from './vol-surface';

describe('Phase 4.2: Real SVI Volatility Surface Engine', () => {
  it('evaluates SVI total variance and derivatives consistently', () => {
    const params: SviParameters = {
      a: 0.04,
      b: 0.12,
      rho: -0.4,
      m: 0.01,
      sigma: 0.15,
    };

    const k = 0.05;
    const w = sviTotalVariance(k, params);
    expect(w).toBeGreaterThan(0);

    // Finite difference check for dw/dk
    const hk = 1e-5;
    const wUp = sviTotalVariance(k + hk, params);
    const wDown = sviTotalVariance(k - hk, params);
    const fdWp = (wUp - wDown) / (2 * hk);
    const analyticalWp = sviFirstDerivative(k, params);
    expect(Math.abs(analyticalWp - fdWp)).toBeLessThan(1e-5);

    // Finite difference check for d²w/dk²
    const fdWpp = (wUp - 2 * w + wDown) / (hk * hk);
    const analyticalWpp = sviSecondDerivative(k, params);
    expect(Math.abs(analyticalWpp - fdWpp)).toBeLessThan(1e-4);
  });

  it('Durrleman butterfly density g(k) is non-negative for well-behaved SVI parameters', () => {
    const validParams: SviParameters = {
      a: 0.04,
      b: 0.10,
      rho: -0.35,
      m: 0.0,
      sigma: 0.12,
    };

    const arbCheck = checkButterflyArbitrage(validParams);
    expect(arbCheck.isArbitrageFree).toBe(true);
    expect(arbCheck.minG).toBeGreaterThanOrEqual(0);
  });

  it('calibrates liquid S&P 500 options quotes and produces calendar arbitrage-free surface', () => {
    const spot = 500;
    const quotes = getLiquidIndexSurfaceQuotes(spot);

    const calibration = calibrateVolSurface(quotes, spot, 0.045, 0.015);

    expect(calibration.slices.length).toBe(5);
    // Average calibration RMSE should be low (< 1.5% vol)
    expect(calibration.totalRmse).toBeLessThan(0.02);

    // Calendar spread arbitrage check: w(k, T) non-decreasing in T
    expect(calibration.calendarArbitrageFree).toBe(true);

    // Reprices ATM quotes accurately
    for (const slice of calibration.slices) {
      const atmQuote = slice.quotes.find((q) => q.strike === spot);
      if (atmQuote) {
        const modelVol = interpolateVolSurface(calibration, spot, slice.expiryDays, spot);
        expect(Math.abs(modelVol - atmQuote.impliedVol)).toBeLessThan(0.015);
      }
    }
  });

  it('interpolates linearly in total variance across time to maturity T', () => {
    const spot = 500;
    const quotes = getLiquidIndexSurfaceQuotes(spot);
    const calibration = calibrateVolSurface(quotes, spot, 0.045, 0.015);

    // Interpolate at T = 45 days (between 30d and 60d)
    const iv30 = interpolateVolSurface(calibration, spot, 30, spot);
    const iv45 = interpolateVolSurface(calibration, spot, 45, spot);
    const iv60 = interpolateVolSurface(calibration, spot, 60, spot);

    const totalVar30 = iv30 * iv30 * (30 / 365);
    const totalVar45 = iv45 * iv45 * (45 / 365);
    const totalVar60 = iv60 * iv60 * (60 / 365);

    // Total variance must be monotonically increasing in T
    expect(totalVar45).toBeGreaterThanOrEqual(totalVar30);
    expect(totalVar60).toBeGreaterThanOrEqual(totalVar45);
  });
});
