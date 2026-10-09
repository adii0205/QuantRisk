import { Portfolio, SimulationModelType } from '../types/risk';
import { generateGarchTMarketHistory, MultiAssetHistory } from './backtest-dgp';
import { forecastVaRAndES } from './forecast';
import {
  computeAcerbiSzekely,
  computeChristoffersenInd,
  computeDieboldMariano,
  computeFisslerZiegelScore,
  computeKupiecPOF,
  computeModelConfidenceSet,
  computePinballLoss,
  getBaselTrafficLightZone,
  BaselZoneResult,
} from './backtest-statistics';
import { PCG32 } from '../utils/rng';

export interface RollingBacktestResult {
  model: SimulationModelType;
  modelName: string;
  confidenceLevel: number;
  totalDays: number;
  windowSize: number;
  evalDays: number;
  expectedBreaches: number;
  actualBreaches: number;
  breachRate: number; // in %
  // Kupiec POF
  likelihoodRatioPOF: number;
  pValuePOF: number;
  // Christoffersen Independence
  christoffersenLR: number;
  christoffersenPValue: number;
  // Conditional Coverage (Joint)
  conditionalCoverageLR: number;
  conditionalCoveragePValue: number;
  // Basel Traffic Light
  baselZone: 'GREEN' | 'YELLOW' | 'RED';
  baselResult: BaselZoneResult;
  rolling250WorstZone: 'GREEN' | 'YELLOW' | 'RED';
  rolling250LatestZone: 'GREEN' | 'YELLOW' | 'RED';
  frtbDeskPass: boolean;
  // Acerbi-Szekely ES
  acerbiZ1: number;
  acerbiZ2: number;
  acerbiPValue: number;
  // Scoring
  pinballLoss: number;
  fisslerZiegelScore: number;
  // MCS Membership
  isInMCS: boolean;
  mcsPValue: number;
  // Time series for visualization
  dates: string[];
  historicalVaRSeries: number[];
  historicalESSeries: number[];
  historicalPnLSeries: number[];
  breachIndices: number[];
  pinballLossSeries: number[];
}

export interface MultiModelBacktestSummary {
  results: RollingBacktestResult[];
  dataset: MultiAssetHistory;
  pairwiseDM: Record<string, { dmStat: number; pValue: number }>;
}

export const MODEL_DISPLAY_NAMES: Record<SimulationModelType, string> = {
  gbm: 'GBM Benchmark (Gaussian)',
  bootstrap: 'Historical Bootstrap',
  student_t: 'Student-t Fat-Tail (ν=5)',
  garch: 'GARCH(1,1)',
  gjr_garch: 'GJR-GARCH Asymmetric',
  heston: 'Heston Stochastic Vol',
  regime_switching: '3-State Markov Regime',
  copula: 'Student-t Copula',
  bayesian_hybrid: 'Bayesian Regime 2026',
};

/**
 * Runs a rolling out-of-sample backtest across the requested model (or all models).
 * Rolling window: W (typically 500 days).
 * Out-of-sample evaluation: for each t from W to totalDays, fits on [t-W : t],
 * predicts 1-day ahead VaR and ES, and tests against realised loss at day t.
 */
export function runRollingBacktest(
  portfolio: Portfolio,
  model: SimulationModelType,
  confidenceLevel: number = 0.99,
  sampleDays: number = 750,
  windowSize: number = 500,
  precomputedDgp?: MultiAssetHistory
): RollingBacktestResult {
  const dgp = precomputedDgp || generateGarchTMarketHistory(portfolio, sampleDays, 101);
  const totalDays = dgp.dates.length;
  const W = Math.min(windowSize, Math.floor(totalDays * 0.7));
  const evalDays = totalDays - W;

  const weights = portfolio.assets.map((a) => a.weight);
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const normWeights = weights.map((w) => w / sumW);
  const capital = portfolio.totalCapital;

  const dates: string[] = [];
  const historicalVaRSeries: number[] = [];
  const historicalESSeries: number[] = [];
  const historicalPnLSeries: number[] = [];
  const breachIndices: number[] = [];
  const breachIndicators: number[] = [];
  const realisedLosses: number[] = [];
  const pinballLossSeries: number[] = [];

  const rng = new PCG32(42, 17);

  // Cache or re-calibrate parameters every 20 days, update daily forecasts
  let cachedForecast: { varFrac: number; esFrac: number } | null = null;
  const refitFrequency = 20;

  for (let t = W; t < totalDays; t++) {
    const evalIdx = t - W;
    dates.push(dgp.dates[t]);

    // Extract window R[t-W : t] for all assets
    const windowAssetReturns: number[][] = dgp.returns.map((assetSeries) =>
      assetSeries.slice(t - W, t)
    );

    // Refit when needed
    if (evalIdx % refitFrequency === 0 || !cachedForecast) {
      const forecast = forecastVaRAndES(
        model,
        {
          assetReturns: windowAssetReturns,
          weights: normWeights,
          capital,
        },
        confidenceLevel,
        rng,
        4000
      );
      cachedForecast = {
        varFrac: forecast.varValue / capital,
        esFrac: forecast.esValue / capital,
      };
    }

    // Daily predicted VaR and ES in currency
    const predictedVaR = Math.round(capital * cachedForecast.varFrac);
    const predictedES = Math.round(capital * cachedForecast.esFrac);
    historicalVaRSeries.push(predictedVaR);
    historicalESSeries.push(predictedES);

    // Actual realised market PnL on day t
    const actualPnL = dgp.portfolioPnL[t];
    historicalPnLSeries.push(actualPnL);

    // Realised Loss = -ActualPnL
    const realisedLoss = -actualPnL;
    realisedLosses.push(realisedLoss);

    // VaR Exception occurs if actual loss exceeds predicted VaR
    const isBreach = realisedLoss > predictedVaR;
    if (isBreach) {
      breachIndices.push(evalIdx);
      breachIndicators.push(1);
    } else {
      breachIndicators.push(0);
    }

    // Daily pinball loss
    const diff = realisedLoss - predictedVaR;
    const pinball = diff * (confidenceLevel - (realisedLoss < predictedVaR ? 1 : 0));
    pinballLossSeries.push(pinball);
  }

  const p = 1 - confidenceLevel;
  const actualBreaches = breachIndices.length;
  const expectedBreaches = Math.round(evalDays * p * 10) / 10;
  const breachRate = Math.round((actualBreaches / evalDays) * 1000) / 10;

  // 1. Kupiec POF
  const { lr: lrPOF, pValue: pValuePOF } = computeKupiecPOF(actualBreaches, evalDays, p);

  // 2. Christoffersen Independence
  const { lr: christoffersenLR, pValue: christoffersenPValue } = computeChristoffersenInd(breachIndicators);

  // 3. Conditional Coverage
  const lrCC = Math.round((lrPOF + christoffersenLR) * 100) / 100;
  const pValueCC = Math.round(Math.exp(-lrCC / 2) * 10000) / 10000;

  // 4. Basel Traffic Light Evaluation
  const baselResult = getBaselTrafficLightZone(actualBreaches, evalDays, p);

  // Rolling 250-day windows check (worst and latest)
  let rolling250WorstZone: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';
  let rolling250LatestZone: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';

  if (evalDays >= 250) {
    const windowCount = evalDays - 250 + 1;
    let maxBreachesIn250 = 0;

    for (let i = 0; i < windowCount; i++) {
      let bCount = 0;
      for (let j = i; j < i + 250; j++) {
        if (breachIndicators[j] === 1) bCount++;
      }
      if (bCount > maxBreachesIn250) {
        maxBreachesIn250 = bCount;
      }
      if (i === windowCount - 1) {
        rolling250LatestZone = getBaselTrafficLightZone(bCount, 250, p).zone;
      }
    }
    rolling250WorstZone = getBaselTrafficLightZone(maxBreachesIn250, 250, p).zone;
  } else {
    rolling250WorstZone = baselResult.zone;
    rolling250LatestZone = baselResult.zone;
  }

  // FRTB desk-level check: no more than 12 exceptions at 99% in last 250 days
  const last250Breaches = breachIndicators.slice(-250).reduce((a, b) => a + b, 0);
  const frtbDeskPass = last250Breaches <= 12;

  // 5. Acerbi-Szekely ES Backtest
  const { z1: acerbiZ1, z2: acerbiZ2, pValue: acerbiPValue } = computeAcerbiSzekely(
    realisedLosses,
    historicalVaRSeries,
    historicalESSeries
  );

  // 6. Loss Scoring
  const pinballLoss = Math.round(computePinballLoss(realisedLosses, historicalVaRSeries, confidenceLevel));
  const fisslerZiegelScore = Math.round(
    computeFisslerZiegelScore(realisedLosses, historicalVaRSeries, historicalESSeries, confidenceLevel) * 1000
  ) / 1000;

  return {
    model,
    modelName: MODEL_DISPLAY_NAMES[model],
    confidenceLevel,
    totalDays,
    windowSize: W,
    evalDays,
    expectedBreaches,
    actualBreaches,
    breachRate,
    likelihoodRatioPOF: lrPOF,
    pValuePOF,
    christoffersenLR,
    christoffersenPValue,
    conditionalCoverageLR: lrCC,
    conditionalCoveragePValue: pValueCC,
    baselZone: baselResult.zone,
    baselResult,
    rolling250WorstZone,
    rolling250LatestZone,
    frtbDeskPass,
    acerbiZ1,
    acerbiZ2,
    acerbiPValue,
    pinballLoss,
    fisslerZiegelScore,
    isInMCS: true,
    mcsPValue: 1.0,
    dates,
    historicalVaRSeries,
    historicalESSeries,
    historicalPnLSeries,
    breachIndices,
    pinballLossSeries,
  };
}

/**
 * Runs the complete multi-model backtesting suite across all 9 frameworks on the identical dataset,
 * ranking models by pinball loss, Fissler-Ziegel score, and computing Hansen's Model Confidence Set (MCS).
 */
export function runAllModelsBacktest(
  portfolio: Portfolio,
  confidenceLevel: number = 0.99,
  sampleDays: number = 750,
  windowSize: number = 500
): MultiModelBacktestSummary {
  const dgp = generateGarchTMarketHistory(portfolio, sampleDays, 101);

  const modelKeys: SimulationModelType[] = [
    'gbm',
    'bootstrap',
    'student_t',
    'garch',
    'gjr_garch',
    'heston',
    'regime_switching',
    'copula',
    'bayesian_hybrid',
  ];

  const results: RollingBacktestResult[] = [];
  for (const m of modelKeys) {
    results.push(runRollingBacktest(portfolio, m, confidenceLevel, sampleDays, windowSize, dgp));
  }

  // Compute Hansen's Model Confidence Set (MCS) using Pinball Loss series
  const lossSeriesForMCS = results.map((r) => ({
    id: r.model,
    lossSeries: r.pinballLossSeries,
  }));
  const { includedModelIds, pValues: mcsPValues } = computeModelConfidenceSet(lossSeriesForMCS, 0.10);

  // Compute pairwise Diebold-Mariano tests against the baseline (GBM)
  const gbmLoss = results.find((r) => r.model === 'gbm')?.pinballLossSeries || [];
  const pairwiseDM: Record<string, { dmStat: number; pValue: number }> = {};

  for (const r of results) {
    r.isInMCS = includedModelIds.has(r.model);
    r.mcsPValue = mcsPValues[r.model] ?? 1.0;
    if (r.model !== 'gbm' && gbmLoss.length > 0) {
      pairwiseDM[r.model] = computeDieboldMariano(r.pinballLossSeries, gbmLoss);
    }
  }

  // Sort results by Pinball loss (best/lowest first)
  results.sort((a, b) => a.pinballLoss - b.pinballLoss);

  return {
    results,
    dataset: dgp,
    pairwiseDM,
  };
}
