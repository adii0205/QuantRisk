import { PCG32 } from '../../utils/rng';
import { calibrateGarchMle } from './garch-mle';
import { calibrateStudentTMle } from './student-t-mle';
import { RecoveryTestMetric, RecoveryTestReport } from './types';

/**
 * Parameter Recovery Verification Suite (50 Monte Carlo Replications)
 * Simulates data from true known DGPs and verifies that MLE estimators
 * faithfully recover the underlying parameters within statistical confidence intervals.
 */
export function runParameterRecoveryTests(
  replications: number = 50,
  sampleSize: number = 750
): RecoveryTestReport {
  const rng = new PCG32(8675309n, 12345n);

  // 1. True parameters
  const trueAlpha = 0.08;
  const trueBeta = 0.88;
  const trueNu = 6.0;

  const estimatedAlphas: number[] = [];
  const estimatedBetas: number[] = [];
  const estimatedNus: number[] = [];

  for (let rep = 0; rep < replications; rep++) {
    // Generate true GARCH(1,1) trajectory
    const omega = 0.000004;
    let sigma2 = 0.0001;
    const garchReturns: number[] = [];

    for (let t = 0; t < sampleSize; t++) {
      const z = rng.normal();
      const sigma = Math.sqrt(sigma2);
      const r = sigma * z;
      garchReturns.push(r);
      sigma2 = omega + trueAlpha * (r * r) + trueBeta * sigma2;
    }

    // Fit GARCH
    const garchFit = calibrateGarchMle(garchReturns, 'SIM_GARCH', false);
    estimatedAlphas.push(garchFit.alpha);
    estimatedBetas.push(garchFit.beta);

    // Generate true Student-t(nu=6) standardized innovations
    // Using Box-Muller normal / sqrt(chi2 / nu)
    const tInnovations: number[] = [];
    for (let t = 0; t < sampleSize; t++) {
      const z = rng.normal();
      const chi2 = rng.chiSquared(trueNu);
      // Student-t variance is nu / (nu - 2) = 6 / 4 = 1.5 => standardize by sqrt((nu-2)/nu)
      const studentTVal = z / Math.sqrt(chi2 / trueNu);
      const standardizedZ = studentTVal * Math.sqrt((trueNu - 2) / trueNu);
      tInnovations.push(standardizedZ);
    }

    // Fit Student-t MLE
    const tFit = calibrateStudentTMle(tInnovations, 'SIM_T');
    estimatedNus.push(tFit.nu);
  }

  // Statistical summary helper
  const summarize = (
    name: string,
    trueVal: number,
    samples: number[],
    maxRelErrorAllowed: number = 0.18
  ): RecoveryTestMetric => {
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((s, x) => s + (x - mean) ** 2, 0) / (samples.length - 1);
    const std = Math.sqrt(variance);
    const bias = mean - trueVal;
    const relError = Math.abs(bias) / trueVal;

    return {
      parameter: name,
      trueValue: trueVal,
      meanEstimated: Math.round(mean * 1000) / 1000,
      stdEstimated: Math.round(std * 1000) / 1000,
      bias: Math.round(bias * 1000) / 1000,
      relativeErrorPercent: Math.round(relError * 1000) / 10,
      recoveryPassed: relError <= maxRelErrorAllowed,
    };
  };

  const alphaMetric = summarize('GARCH Alpha (α)', trueAlpha, estimatedAlphas, 0.25);
  const betaMetric = summarize('GARCH Beta (β)', trueBeta, estimatedBetas, 0.10);
  const nuMetric = summarize('Student-t Dof (ν)', trueNu, estimatedNus, 0.20);

  const metrics: RecoveryTestMetric[] = [alphaMetric, betaMetric, nuMetric];
  const allPassed = metrics.every((m) => m.recoveryPassed);

  return {
    timestamp: new Date().toISOString(),
    replications,
    sampleSize,
    metrics,
    allPassed,
  };
}
