/**
 * Data Generating Process (DGP) for Synthetic and Empirical Asset Returns.
 * Generates controlled econometric processes:
 * - GARCH(1,1) with Student-t innovations (true known DGP with volatility clustering & fat tails)
 * - Multi-asset correlated returns with time-varying volatility
 * - Rolling window extraction for backtesting
 */
import { Asset, Portfolio } from '../types/risk';
import { PCG32 } from '../utils/rng';
import { choleskyDecomposition, correlateShocks } from '../utils/math';

export interface MultiAssetHistory {
  dates: string[];
  // assetIndex -> daily returns array (length T)
  returns: number[][];
  // portfolio aggregate daily return array (length T)
  portfolioReturns: number[];
  // portfolio daily P&L in currency
  portfolioPnL: number[];
}

/**
 * Generates an out-of-sample ground truth multi-asset dataset using a known GARCH(1,1)-t DGP.
 * This guarantees a realistic, economically rigorous testbed where constant-vol models (GBM)
 * fail Kupiec/Christoffersen tests, and dynamic volatility models (GARCH, GJR) pass.
 */
export function generateGarchTMarketHistory(
  portfolio: Portfolio,
  totalDays: number = 750,
  seed: number = 101
): MultiAssetHistory {
  const rng = new PCG32(seed, 99);
  const assets = portfolio.assets;
  const numAssets = assets.length;
  const capital = portfolio.totalCapital;

  // Asset weights normalized
  const sumW = assets.reduce((s, a) => s + a.weight, 0) || 1;
  const weights = assets.map((a) => a.weight / sumW);

  // Correlation matrix between assets
  const corr: number[][] = Array.from({ length: numAssets }, () => new Array(numAssets).fill(0));
  for (let i = 0; i < numAssets; i++) {
    for (let j = 0; j < numAssets; j++) {
      if (i === j) corr[i][j] = 1.0;
      else {
        // Realistic equity/commodity correlation ~ 0.35 - 0.55
        corr[i][j] = 0.40;
      }
    }
  }
  const L = choleskyDecomposition(corr);

  // GARCH(1,1)-t parameters for each asset
  // sigma_t^2 = omega + alpha * eps_{t-1}^2 + beta * sigma_{t-1}^2
  // Unconditional variance = omega / (1 - alpha - beta)
  const garchParams = assets.map((a) => {
    const targetAnnualVol = a.annualVolatility || 0.22;
    const targetDailyVar = (targetAnnualVol * targetAnnualVol) / 252;
    const alpha = 0.09;
    const beta = 0.88;
    const omega = targetDailyVar * (1 - alpha - beta);
    return {
      omega,
      alpha,
      beta,
      nu: 5.5, // Student-t degrees of freedom (fat-tailed innovations)
      dailyMu: (a.expectedAnnualReturn || 0.12) / 252,
      currentVar: targetDailyVar,
    };
  });

  const assetReturns: number[][] = Array.from({ length: numAssets }, () => new Array(totalDays).fill(0));
  const portfolioReturns: number[] = new Array(totalDays).fill(0);
  const portfolioPnL: number[] = new Array(totalDays).fill(0);
  const dates: string[] = [];

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() - totalDays);

  for (let t = 0; t < totalDays; t++) {
    const curDate = new Date(baseDate);
    curDate.setDate(curDate.getDate() + t);
    dates.push(curDate.toISOString().slice(0, 10));

    // Draw independent standard normal shocks
    const zShocks: number[] = [];
    for (let i = 0; i < numAssets; i++) {
      zShocks.push(rng.normal());
    }

    // Correlate shocks
    const correlatedZ = correlateShocks(zShocks, L);

    // Transform to Student-t innovations with nu degrees of freedom using shared chi-squared scale
    // W ~ Chi2(nu), shock_t = Z * sqrt((nu - 2) / W)
    const nu = 5.5;
    const chiVal = rng.chiSquared(nu);
    const tScale = Math.sqrt((nu - 2) / Math.max(0.1, chiVal));

    let portRet = 0;

    for (let i = 0; i < numAssets; i++) {
      const p = garchParams[i];
      const dailySigma = Math.sqrt(p.currentVar);
      // Innovation
      const eps = dailySigma * (correlatedZ[i] * tScale);
      const r = p.dailyMu + eps;
      assetReturns[i][t] = r;

      // Update GARCH variance for tomorrow: sigma_{t+1}^2 = omega + alpha * eps_t^2 + beta * sigma_t^2
      p.currentVar = p.omega + p.alpha * (eps * eps) + p.beta * p.currentVar;

      portRet += weights[i] * r;
    }

    portfolioReturns[t] = portRet;
    portfolioPnL[t] = Math.round(portRet * capital);
  }

  return {
    dates,
    returns: assetReturns,
    portfolioReturns,
    portfolioPnL,
  };
}
