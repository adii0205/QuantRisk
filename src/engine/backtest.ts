import { KupiecBacktestResult, Portfolio, SimulationModelType } from '../types/risk';
import { sampleStandardNormal } from '../utils/math';

/**
 * Kupiec Proportion of Failures (POF) & Christoffersen Independence Backtesting Test.
 */
export function runKupiecBacktest(
  portfolio: Portfolio,
  model: SimulationModelType,
  confidenceLevel: number = 0.99,
  sampleDays: number = 750 // ~3 years of trading observations
): KupiecBacktestResult {
  const p = 1 - confidenceLevel; // Expected failure rate e.g. 0.01 for 99% VaR
  const N = sampleDays;
  const portfolioCapital = portfolio.totalCapital;

  // Calculate baseline portfolio daily return and volatility
  const assetWeights = portfolio.assets.map((a) => a.weight);
  const totalWeight = assetWeights.reduce((a, b) => a + b, 0) || 1;
  const normalizedWeights = assetWeights.map((w) => w / totalWeight);

  const portAnnualReturn = portfolio.assets.reduce(
    (acc, a, i) => acc + normalizedWeights[i] * a.expectedAnnualReturn,
    0
  );
  const portAnnualVol = portfolio.assets.reduce(
    (acc, a, i) => acc + normalizedWeights[i] * a.annualVolatility,
    0
  );

  const dailyMu = portAnnualReturn / 252;
  const dailySigma = portAnnualVol / Math.sqrt(252);

  // Model-specific tail multipliers for 99% VaR threshold
  // Standard Normal z_0.99 = 2.326; Fat-tailed Student-t/EVT/GJR higher threshold
  let modelVaRMultiplier = 2.326;
  switch (model) {
    case 'gbm':
      modelVaRMultiplier = 2.326; // Gaussian
      break;
    case 'student_t':
      modelVaRMultiplier = 2.68; // Fat tails
      break;
    case 'bootstrap':
      modelVaRMultiplier = 2.54; // Empirical
      break;
    case 'garch':
    case 'gjr_garch':
      modelVaRMultiplier = 2.62; // Time-varying
      break;
    case 'heston':
      modelVaRMultiplier = 2.72; // Stochastic vol
      break;
    case 'regime_switching':
    case 'bayesian_hybrid':
      modelVaRMultiplier = 2.85; // Macro crisis regimes
      break;
    case 'copula':
      modelVaRMultiplier = 2.75;
      break;
  }

  const historicalVaRSeries: number[] = [];
  const historicalPnLSeries: number[] = [];
  const breachIndices: number[] = [];

  let rollingVol = dailySigma;

  for (let t = 0; t < N; t++) {
    // Dynamic volatility clustering for realistic actual returns
    const prevRet = t > 0 ? (historicalPnLSeries[t - 1] / portfolioCapital) : 0;
    rollingVol = Math.sqrt(
      0.000004 + 0.08 * (prevRet * prevRet) + 0.88 * (rollingVol * rollingVol)
    );

    // Predicted 99% VaR in currency (Loss threshold)
    const predictedVaR = portfolioCapital * (modelVaRMultiplier * rollingVol - dailyMu);
    historicalVaRSeries.push(Math.round(predictedVaR));

    // Simulated actual market PnL for this trading day
    // Generate actual fat-tailed returns with real-world occasional market shocks
    let marketShock = sampleStandardNormal();
    // 3% probability of fat crisis shock
    if (Math.random() < 0.03) {
      marketShock = marketShock * 2.6 - 1.2;
    }
    const dayReturn = dailyMu + rollingVol * marketShock;
    const actualPnL = portfolioCapital * dayReturn;
    historicalPnLSeries.push(Math.round(actualPnL));

    // A VaR breach occurs when actual Loss exceeds predicted VaR (i.e. PnL <= -VaR)
    if (actualPnL <= -predictedVaR) {
      breachIndices.push(t);
    }
  }

  const x = breachIndices.length; // Actual breaches
  const expectedBreaches = Math.round(N * p * 10) / 10;
  const breachRate = Math.round((x / N) * 1000) / 10; // in %

  // Kupiec Likelihood Ratio Test:
  // LR_POF = -2 * ln( ((1-p)^(N-x) * p^x) / ((1 - x/N)^(N-x) * (x/N)^x) )
  let lrPOF = 0;
  if (x > 0 && x < N) {
    const termNum = (N - x) * Math.log(1 - p) + x * Math.log(p);
    const termDen = (N - x) * Math.log(1 - x / N) + x * Math.log(x / N);
    lrPOF = Math.max(0, -2 * (termNum - termDen));
  } else if (x === 0) {
    lrPOF = Math.max(0, -2 * (N * Math.log(1 - p)));
  }

  // Chi-Square(1) approximation p-value: P(X >= lr)
  // For 1 dof: p = 1 - erf(sqrt(lr / 2))
  const pValuePOF = Math.max(0, 1 - Math.min(1, Math.sqrt(lrPOF / 2) * 0.79788 * (1 - lrPOF / 6)));

  // Christoffersen Independence Test (consecutive breach clustering)
  let n00 = 0, n01 = 0, n10 = 0, n11 = 0;
  const breachSet = new Set(breachIndices);
  for (let t = 1; t < N; t++) {
    const prevBreach = breachSet.has(t - 1) ? 1 : 0;
    const currBreach = breachSet.has(t) ? 1 : 0;
    if (prevBreach === 0 && currBreach === 0) n00++;
    else if (prevBreach === 0 && currBreach === 1) n01++;
    else if (prevBreach === 1 && currBreach === 0) n10++;
    else if (prevBreach === 1 && currBreach === 1) n11++;
  }

  const pi0 = n01 / (n00 + n01 || 1);
  const pi1 = n11 / (n10 + n11 || 1);
  const pi = (n01 + n11) / (N - 1);

  let christoffersenLR = 0;
  if (pi0 > 0 && pi1 > 0 && pi < 1) {
    const lNull = (n00 + n10) * Math.log(1 - pi) + (n01 + n11) * Math.log(pi);
    const lAlt = n00 * Math.log(1 - pi0) + n01 * Math.log(pi0) + n10 * Math.log(1 - pi1) + n11 * Math.log(pi1);
    christoffersenLR = Math.max(0, -2 * (lNull - lAlt));
  }

  // Basel Traffic Light Classification (for 250 to 1000 days at 99% VaR)
  // Scaled for N days:
  const redThreshold = Math.ceil(expectedBreaches * 2.2);
  const yellowThreshold = Math.ceil(expectedBreaches * 1.4);

  let baselZone: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';
  if (x >= redThreshold) {
    baselZone = 'RED';
  } else if (x >= yellowThreshold) {
    baselZone = 'YELLOW';
  } else {
    baselZone = 'GREEN';
  }

  return {
    confidenceLevel,
    totalObservations: N,
    expectedBreaches,
    actualBreaches: x,
    breachRate,
    likelihoodRatioPOF: Math.round(lrPOF * 100) / 100,
    pValuePOF: Math.round(pValuePOF * 1000) / 1000,
    christoffersenLR: Math.round(christoffersenLR * 100) / 100,
    christoffersenPValue: Math.round((1 - Math.min(1, Math.sqrt(christoffersenLR / 2) * 0.79788)) * 1000) / 1000,
    baselZone,
    historicalVaRSeries,
    historicalPnLSeries,
    breachIndices,
  };
}
