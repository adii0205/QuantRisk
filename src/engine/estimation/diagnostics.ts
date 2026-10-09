import { DiagnosticMetrics } from './types';
import { chiSquareSurvival } from '../../utils/math';

/**
 * Econometric Diagnostics Suite:
 * - Ljung-Box Q-test on squared standardized residuals (tests remaining ARCH effects)
 * - Jarque-Bera test on standardized residuals (tests normality)
 * - Akaike Information Criterion (AIC)
 * - Bayesian Information Criterion (BIC)
 */
export function computeModelDiagnostics(
  standardizedResiduals: number[],
  symbol: string,
  logLikelihood: number,
  numParameters: number = 4
): DiagnosticMetrics {
  const T = standardizedResiduals.length;
  if (T < 20) {
    return {
      symbol,
      sampleSize: T,
      ljungBoxQ: 0,
      ljungBoxPValue: 1.0,
      hasArchEffectsRemaining: false,
      jarqueBeraStat: 0,
      jarqueBeraPValue: 1.0,
      isNormallyDistributed: true,
      aic: 0,
      bic: 0,
    };
  }

  // 1. Squared standardized residuals z_t^2
  const z2 = standardizedResiduals.map((z) => z * z);
  const meanZ2 = z2.reduce((a, b) => a + b, 0) / T;
  const varZ2 = z2.reduce((s, x) => s + (x - meanZ2) ** 2, 0) / (T - 1);

  // Ljung-Box test for m = 10 lags
  const m = Math.min(10, Math.floor(T / 5));
  let qStat = 0;

  for (let k = 1; k <= m; k++) {
    let cov = 0;
    for (let t = k; t < T; t++) {
      cov += (z2[t]! - meanZ2) * (z2[t - k]! - meanZ2);
    }
    const rk = varZ2 > 0 ? (cov / (T - k)) / varZ2 : 0;
    qStat += (rk * rk) / (T - k);
  }
  qStat *= T * (T + 2);

  const lbPValue = chiSquareSurvival(qStat, m);
  const hasArchEffectsRemaining = lbPValue < 0.05;

  // 2. Jarque-Bera Normality Test
  const meanZ = standardizedResiduals.reduce((a, b) => a + b, 0) / T;
  let sum2 = 0;
  let sum3 = 0;
  let sum4 = 0;

  for (let t = 0; t < T; t++) {
    const diff = standardizedResiduals[t]! - meanZ;
    const d2 = diff * diff;
    sum2 += d2;
    sum3 += d2 * diff;
    sum4 += d2 * d2;
  }

  const s2 = sum2 / T;
  const sStd = Math.sqrt(Math.max(1e-8, s2));
  const skew = sum3 / (T * Math.pow(sStd, 3));
  const kurt = sum4 / (T * Math.pow(sStd, 4));

  const jbStat = (T / 6) * (skew * skew + ((kurt - 3) * (kurt - 3)) / 4);
  const jbPValue = chiSquareSurvival(jbStat, 2);
  const isNormallyDistributed = jbPValue > 0.05;

  // 3. AIC & BIC
  // AIC = 2k - 2 ln(L)
  // BIC = k ln(T) - 2 ln(L)
  const aic = 2 * numParameters - 2 * logLikelihood;
  const bic = numParameters * Math.log(T) - 2 * logLikelihood;

  return {
    symbol,
    sampleSize: T,
    ljungBoxQ: Math.round(qStat * 100) / 100,
    ljungBoxPValue: Math.round(lbPValue * 1000) / 1000,
    hasArchEffectsRemaining,
    jarqueBeraStat: Math.round(jbStat * 100) / 100,
    jarqueBeraPValue: Math.round(jbPValue * 1000) / 1000,
    isNormallyDistributed,
    aic: Math.round(aic * 10) / 10,
    bic: Math.round(bic * 10) / 10,
  };
}
