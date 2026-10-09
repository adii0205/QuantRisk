import { HestonCalibrationResult } from './types';

/**
 * Method of Moments / GMM calibration for Heston Stochastic Volatility Model
 * Calibrates parameters:
 *   - kappa: rate of mean reversion
 *   - theta: long-term variance level
 *   - xi: volatility of variance (vol-of-vol)
 *   - rho: correlation between asset returns and variance innovations (leverage effect)
 *   - v0: initial / current spot variance
 */
export function calibrateHestonGmm(
  returns: number[],
  symbol: string
): HestonCalibrationResult {
  const T = returns.length;
  if (T < 40) {
    return {
      symbol,
      kappa: 2.5,
      theta: 0.04,
      xi: 0.35,
      rho: -0.65,
      v0: 0.04,
      fellerConditionSatisfied: true,
    };
  }

  // 1. Construct daily realized variance series (rolling 5-day window annualized)
  const window = 5;
  const varSeries: number[] = [];
  for (let t = window; t < T; t++) {
    let sumSq = 0;
    for (let k = 0; k < window; k++) {
      const r = returns[t - k]!;
      sumSq += r * r;
    }
    const annualVar = (sumSq / window) * 252;
    varSeries.push(Math.max(0.0001, annualVar));
  }

  const N = varSeries.length;
  const meanVar = varSeries.reduce((a, b) => a + b, 0) / N;
  const theta = Math.max(0.005, meanVar);
  const v0 = Math.max(0.005, varSeries[N - 1]!);

  // 2. Autocorrelation of variance to estimate kappa
  let sumCov = 0;
  let sumVar = 0;
  for (let i = 1; i < N; i++) {
    const d1 = varSeries[i]! - theta;
    const d0 = varSeries[i - 1]! - theta;
    sumCov += d1 * d0;
    sumVar += d0 * d0;
  }
  const autoCorr = sumVar > 0 ? Math.max(0.01, Math.min(0.99, sumCov / sumVar)) : 0.85;
  const dt = 1 / 252;
  // autoCorr ~ exp(-kappa * dt) => kappa = -ln(autoCorr) / dt
  let kappa = Math.max(0.5, Math.min(8.0, -Math.log(autoCorr) / dt));

  // 3. Volatility of variance xi
  const dVar: number[] = [];
  for (let i = 1; i < N; i++) {
    dVar.push(varSeries[i]! - varSeries[i - 1]!);
  }
  const meanDvar = dVar.reduce((a, b) => a + b, 0) / dVar.length;
  const varDvar = dVar.reduce((s, x) => s + (x - meanDvar) ** 2, 0) / (dVar.length - 1);
  // Var(dv) ~ xi^2 * theta * dt
  let xi = Math.sqrt(Math.max(0.001, varDvar / (theta * dt)));
  xi = Math.max(0.1, Math.min(1.2, xi));

  // 4. Correlation rho = corr(return, dVar)
  let covReturnVar = 0;
  let varReturn = 0;
  const offset = window;
  for (let i = 1; i < N; i++) {
    const ret = returns[offset + i]!;
    const dv = dVar[i - 1]!;
    covReturnVar += ret * dv;
    varReturn += ret * ret;
  }
  const stdReturn = Math.sqrt(varReturn / N);
  const stdDvar = Math.sqrt(varDvar);
  let rho = (covReturnVar / N) / (stdReturn * stdDvar || 1);
  // Leverage effect in equities/indices is typically negative (-0.4 to -0.85)
  rho = Math.max(-0.95, Math.min(0.2, rho));
  if (rho > -0.1) rho = -0.45; // enforce realistic financial leverage direction if noisy

  // 5. Feller Condition check: 2 * kappa * theta > xi^2
  let fellerSatisfied = 2 * kappa * theta > xi * xi;
  if (!fellerSatisfied) {
    // Regularize xi to ensure CIR numerical stability
    xi = Math.sqrt(2 * kappa * theta) * 0.92;
    fellerSatisfied = true;
  }

  return {
    symbol,
    kappa: Math.round(kappa * 100) / 100,
    theta: Math.round(theta * 1000) / 1000,
    xi: Math.round(xi * 100) / 100,
    rho: Math.round(rho * 100) / 100,
    v0: Math.round(v0 * 1000) / 1000,
    fellerConditionSatisfied: fellerSatisfied,
  };
}
