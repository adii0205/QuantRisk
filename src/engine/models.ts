import { Asset, Portfolio, RiskMetrics, SimulationConfig, SimulationResult } from '../types/risk';
import {
  calculateExpectedShortfall,
  calculateMoments,
  calculateWeightedExpectedShortfall,
  choleskyDecomposition,
  correlateShocks,
  fitEVTGeneralizedPareto,
  inverseNormalCDF,
  percentile,
  sampleChiSquared,
  sampleStandardNormal,
  sampleStudentT,
  SobolSequenceGenerator,
} from '../utils/math';
import { calculateCorrelationMatrix } from '../data/mockMarketData';
import { gpuEngine } from './gpu-engine';
import {
  calculateBlackScholes,
  revalueOptionFull,
  revalueOptionTaylor,
} from './options';

export function runPortfolioSimulation(
  portfolio: Portfolio,
  config: SimulationConfig
): SimulationResult {
  const startTime = performance.now();
  const { assets, totalCapital, leverage, cashWeight } = portfolio;
  const numAssets = assets.length;
  const days = config.timeHorizonDays;
  const requestedPaths = config.paths;
  const dt = 1 / 252; // daily time step

  // Options overlay configuration inside Monte Carlo
  const hasOptions = Boolean(portfolio.options && portfolio.options.length > 0);
  const assetSymbolToIndex = new Map<string, number>();
  assets.forEach((a, idx) => assetSymbolToIndex.set(a.symbol, idx));

  const precalculatedOptionGreeks = hasOptions
    ? (portfolio.options || []).map((opt) => {
        const assetIdx = assetSymbolToIndex.get(opt.underlying) ?? 0;
        const spot0 = assets[assetIdx]?.currentPrice ?? 100;
        const T0 = opt.expiryDays / 365;
        const q = opt.dividendYield ?? 0;
        return calculateBlackScholes(spot0, opt.strike, T0, 0.045, opt.impliedVol, opt.type, q);
      })
    : [];

  // Effective invested weights (scaled by leverage and non-cash)
  const investedWeight = Math.max(0, 1 - cashWeight) * leverage;
  const sumWeights = assets.reduce((acc, a) => acc + a.weight, 0) || 1;
  const normalizedWeights = assets.map((a) => (a.weight / sumWeights) * investedWeight);

  // Correlation & Cholesky decomposition
  const { correlationMatrix } = calculateCorrelationMatrix(assets);
  const L = choleskyDecomposition(correlationMatrix);

  // Precompute asset baseline parameters
  const assetMus = assets.map((a) => a.expectedAnnualReturn);
  const assetSigmas = assets.map((a) => a.annualVolatility);

  // Check if WebGL GPGPU shader hardware simulation is requested for GBM (CPU fallback if options overlay active)
  const isGpuEligible =
    config.hardwareEngine === 'gpu_webgl' &&
    gpuEngine.isSupported &&
    config.model === 'gbm' &&
    !hasOptions;

  // Determine actual simulation paths (if antithetic, we generate pairs)
  const isAntithetic = config.varianceReduction === 'antithetic';
  const numSims = isAntithetic ? Math.ceil(requestedPaths / 2) : requestedPaths;

  const finalPnLDistribution: number[] = [];
  const finalReturnDistribution: number[] = [];
  const finalWeights: number[] = [];
  const pathAssetLosses: number[][] = []; // For Euler Component VaR allocation
  const sampleStepsPaths: number[][] = [];
  const recordedPathsToStore = 24;

  // GARCH / GJR parameters
  const garchOmega = config.garchOmega ?? 0.000005;
  const garchAlpha = config.garchAlpha ?? 0.08;
  const garchBeta = config.garchBeta ?? 0.88;
  const gjrGamma = config.gjrGamma ?? 0.06;

  // Heston parameters
  const hestonKappa = config.hestonKappa ?? 2.5; // mean reversion speed
  const hestonXi = config.hestonXi ?? 0.35; // vol of vol
  const hestonRho = config.hestonRho ?? -0.65; // negative correlation (leverage effect)

  // 3-State Markov Regime Transition Matrix: [Low Vol, Stressed, Crisis]
  const defaultTransitionMatrix = [
    [0.94, 0.05, 0.01],
    [0.15, 0.78, 0.07],
    [0.05, 0.35, 0.60],
  ];
  const P = config.regimeProbMatrix ?? defaultTransitionMatrix;

  // Multipliers strictly apply ONLY to regime models
  const isRegimeModel = config.model === 'regime_switching' || config.model === 'bayesian_hybrid';

  // Importance sampling tilt parameter (scaled per asset to prevent path weight underflow)
  const isImportanceSampling = config.varianceReduction === 'importance_sampling';
  const tiltTheta = isImportanceSampling ? -0.8 / Math.sqrt(Math.max(1, numAssets)) : 0;

  // Sobol sequence generator (multi-dimensional: days * numAssets)
  const isSobol = config.varianceReduction === 'sobol_qmc';
  const sobolGen = isSobol ? new SobolSequenceGenerator(numAssets) : null;

  // History length for synchronized bootstrap
  let historyLength = 252;
  for (let i = 0; i < assets.length; i++) {
    if (assets[i].historicalReturns.length < historyLength) {
      historyLength = assets[i].historicalReturns.length;
    }
  }

  // If GPU acceleration is active for GBM, execute on GPU compute shader
  if (isGpuEligible) {
    const portDrift = assets.reduce(
      (acc, a, i) => acc + normalizedWeights[i] * a.expectedAnnualReturn,
      0
    );
    const portVol = Math.sqrt(
      assets.reduce(
        (acc, a, i) => acc + Math.pow(normalizedWeights[i] * a.annualVolatility, 2),
        0
      )
    );

    const gpuResult = gpuEngine.runGpuTerminalDistribution(
      requestedPaths,
      days,
      portDrift,
      portVol,
      totalCapital
    );

    for (let p = 0; p < requestedPaths; p++) {
      const pnl = gpuResult.finalPnL[p];
      finalPnLDistribution.push(pnl);
      finalReturnDistribution.push(pnl / totalCapital);
      finalWeights.push(1.0);
    }
  } else {
    // CPU Monte Carlo Simulation Loop
    for (let sim = 0; sim < numSims; sim++) {
      // Buffer to store exact shocks for Antithetic Variates
      const storedRawShocks: number[][] = [];
      const storedUnshiftedShocks: number[][] = [];
      const storedNormalZVol: number[][] = [];
      const storedSharedChiW: number[] = [];
      const storedBootstrapDates: number[] = [];

      const runPathCount = isAntithetic ? 2 : 1;

      for (let anti = 0; anti < runPathCount; anti++) {
        const isAntiVariant = anti === 1;

        // Track asset prices for this simulation
        const currentAssetPrices = assets.map((a) => a.currentPrice);
        const initialAssetPrices = [...currentAssetPrices];

        // GARCH state tracking per asset (initial conditional variance = daily sigma^2)
        const currentAssetVariances = assetSigmas.map((sig) => (sig * sig) / 252);

        // Heston stochastic variance state tracking per asset (theta_i = sigma_i^2)
        const currentHestonVars = assetSigmas.map((sig) => sig * sig);

        // Regime state tracking: 0 = Low Vol, 1 = Stressed, 2 = Crisis
        let currentRegime = 0;

        // Track daily portfolio value along the path
        const dailyPortfolioValues: number[] = [totalCapital];

        // Bayesian parameter uncertainty sampling for Model 9
        const simAssetMus = assetMus.map((mu) =>
          config.model === 'bayesian_hybrid' ? mu + sampleStandardNormal() * 0.03 : mu
        );
        const simAssetSigmas = assetSigmas.map((sig) =>
          config.model === 'bayesian_hybrid'
            ? Math.max(0.05, sig * (1 + sampleStandardNormal() * 0.12))
            : sig
        );

        // Path Likelihood Ratio weight for Importance Sampling
        let pathLogWeight = 0.0;

        for (let t = 0; t < days; t++) {
          // Step 1: Update Regime (ONLY for regime models)
          if (isRegimeModel) {
            const uRegime = Math.random();
            const probs = P[currentRegime];
            if (uRegime < probs[0]) {
              currentRegime = 0;
            } else if (uRegime < probs[0] + probs[1]) {
              currentRegime = 1;
            } else {
              currentRegime = 2;
            }
          }

          // Multipliers strictly 1.0 for non-regime models
          let regimeVolMult = 1.0;
          let regimeDriftMult = 1.0;
          if (isRegimeModel) {
            regimeVolMult = currentRegime === 2 ? 2.8 : currentRegime === 1 ? 1.6 : 0.85;
            regimeDriftMult = currentRegime === 2 ? -2.0 : currentRegime === 1 ? 0.2 : 1.15;
          }

          // Step 2: Generate base independent shocks
          const rawShocks: number[] = [];
          let sharedChiScale = 1.0;

          if (config.model === 'copula') {
            // t-Copula uses a single shared Chi-Square mixing variable per step across all assets
            const dof = config.studentTDof ?? 5;
            let chiW: number;
            if (!isAntiVariant) {
              chiW = sampleChiSquared(dof);
              storedSharedChiW[t] = chiW;
            } else {
              chiW = storedSharedChiW[t];
            }
            sharedChiScale = Math.sqrt(dof / Math.max(1e-6, chiW));
          }

          // Synchronized Historical Bootstrap date index across all assets
          let bootstrapDateIdx = 0;
          if (config.model === 'bootstrap') {
            if (!isAntiVariant) {
              bootstrapDateIdx = Math.floor(Math.random() * historyLength);
              storedBootstrapDates[t] = bootstrapDateIdx;
            } else {
              bootstrapDateIdx = storedBootstrapDates[t];
            }
          }

          let sobolVec: number[] | null = null;
          if (isSobol && sobolGen && !isAntiVariant) {
            sobolVec = sobolGen.nextVector();
          }

          if (!isAntiVariant) {
            storedRawShocks[t] = [];
            storedUnshiftedShocks[t] = [];
            storedNormalZVol[t] = [];
          }

          for (let i = 0; i < numAssets; i++) {
            let z = 0;
            if (!isAntiVariant) {
              if (isSobol && sobolVec) {
                // Sobol sequence passed through inverseNormalCDF
                z = inverseNormalCDF(sobolVec[i]);
              } else if (config.model === 'student_t') {
                const dof = config.studentTDof ?? 5;
                z = sampleStudentT(dof);
              } else {
                z = sampleStandardNormal();
              }

              storedUnshiftedShocks[t][i] = z;

              if (isImportanceSampling) {
                z += tiltTheta;
                const logStepWeight = -tiltTheta * z + 0.5 * tiltTheta * tiltTheta;
                pathLogWeight += logStepWeight;
              }

              storedRawShocks[t][i] = z;
              storedNormalZVol[t][i] = sampleStandardNormal();
            } else {
              // Antithetic pair: exactly negate unshifted shocks
              if (isImportanceSampling) {
                const antiZ0 = -storedUnshiftedShocks[t][i];
                z = antiZ0 + tiltTheta;
                const logStepWeight = -tiltTheta * z + 0.5 * tiltTheta * tiltTheta;
                pathLogWeight += logStepWeight;
              } else {
                z = -storedRawShocks[t][i];
              }
            }

            rawShocks.push(z);
          }

          // Step 3: Correlate shocks using Cholesky factor L
          const correlated = correlateShocks(rawShocks, L);

          // Step 4: Asset price propagation
          for (let i = 0; i < numAssets; i++) {
            const dailyVol = (simAssetSigmas[i] / Math.sqrt(252)) * regimeVolMult;
            const dailyDrift = (simAssetMus[i] / 252) * regimeDriftMult;
            let zCorr = correlated[i];

            switch (config.model) {
              case 'bootstrap': {
                // Synchronized empirical bootstrap across all assets
                const histRet = assets[i].historicalReturns[bootstrapDateIdx];
                const effectiveRet = isAntiVariant ? -histRet : histRet;
                currentAssetPrices[i] *= 1 + effectiveRet;
                break;
              }

              case 'copula': {
                // Multiplied by shared t-copula mixing scale
                zCorr *= sharedChiScale;
                currentAssetPrices[i] *= Math.exp(
                  dailyDrift - 0.5 * dailyVol * dailyVol + dailyVol * zCorr
                );
                break;
              }

              case 'garch': {
                // GARCH(1,1): Step uses current conditional vol, then updates for next step
                const currentVol = Math.sqrt(currentAssetVariances[i]);
                currentAssetPrices[i] *= Math.exp(
                  dailyDrift - 0.5 * currentVol * currentVol + currentVol * zCorr
                );
                const innovation = currentVol * zCorr;
                const nextVar =
                  garchOmega +
                  garchAlpha * (innovation * innovation) +
                  garchBeta * currentAssetVariances[i];
                currentAssetVariances[i] = Math.max(1e-7, nextVar);
                break;
              }

              case 'gjr_garch': {
                // GJR-GARCH: Asymmetric leverage update for step t+1
                const currentVol = Math.sqrt(currentAssetVariances[i]);
                currentAssetPrices[i] *= Math.exp(
                  dailyDrift - 0.5 * currentVol * currentVol + currentVol * zCorr
                );
                const innovation = currentVol * zCorr;
                const isNegative = innovation < 0 ? 1 : 0;
                const nextVar =
                  garchOmega +
                  garchAlpha * (innovation * innovation) +
                  gjrGamma * isNegative * (innovation * innovation) +
                  garchBeta * currentAssetVariances[i];
                currentAssetVariances[i] = Math.max(1e-7, nextVar);
                break;
              }

              case 'heston': {
                // Heston SDE: theta_i = asset-specific annualized variance sigma_i^2
                const assetTheta = simAssetSigmas[i] * simAssetSigmas[i];
                const zVol = isAntiVariant ? -storedNormalZVol[t][i] : storedNormalZVol[t][i];
                const correlatedZVol =
                  hestonRho * zCorr + Math.sqrt(1 - hestonRho * hestonRho) * zVol;

                const vt = Math.max(0.0001, currentHestonVars[i]);
                const stochSigma = Math.sqrt(vt);

                currentAssetPrices[i] *= Math.exp(
                  (simAssetMus[i] - 0.5 * vt) * dt + stochSigma * Math.sqrt(dt) * zCorr
                );

                const dV =
                  hestonKappa * (assetTheta - vt) * dt +
                  hestonXi * stochSigma * Math.sqrt(dt) * correlatedZVol;
                currentHestonVars[i] = Math.max(0.00005, vt + dV);
                break;
              }

              case 'gbm':
              case 'student_t':
              case 'regime_switching':
              case 'bayesian_hybrid':
              default: {
                currentAssetPrices[i] *= Math.exp(
                  dailyDrift - 0.5 * dailyVol * dailyVol + dailyVol * zCorr
                );
                break;
              }
            }
          }

          // Calculate daily portfolio value
          let currentPortfolioVal = totalCapital * cashWeight;
          for (let i = 0; i < numAssets; i++) {
            const assetRet = currentAssetPrices[i] / initialAssetPrices[i];
            const assetInitVal = totalCapital * normalizedWeights[i];
            currentPortfolioVal += assetInitVal * assetRet;
          }

          // Leverage financing cost accumulates across the horizon (t + 1 days accrued)
          if (leverage > 1.0) {
            const borrowed = totalCapital * (leverage - 1);
            const borrowingCostDaily = (borrowed * 0.055) / 252;
            currentPortfolioVal -= (t + 1) * borrowingCostDaily;
          }

          dailyPortfolioValues.push(currentPortfolioVal);
        }

        // Final portfolio value and return for this path including options revaluation
        let optionsPathPnl = 0;
        if (hasOptions && portfolio.options) {
          for (let o = 0; o < portfolio.options.length; o++) {
            const opt = portfolio.options[o];
            const assetIdx = assetSymbolToIndex.get(opt.underlying) ?? 0;
            const spot0 = initialAssetPrices[assetIdx];
            const spotH = currentAssetPrices[assetIdx];
            const volH = opt.impliedVol;

            if (config.optionsPricingMode === 'delta_gamma_vega') {
              const greeks = precalculatedOptionGreeks[o];
              const taylorRes = revalueOptionTaylor(opt, spot0, spotH, greeks, volH);
              optionsPathPnl += taylorRes.totalTaylorPnl;
            } else {
              // Full revaluation
              const fullRes = revalueOptionFull(opt, spot0, spotH, days, volH);
              optionsPathPnl += fullRes.pnl;
            }
          }
        }

        const finalPortfolioVal =
          dailyPortfolioValues[dailyPortfolioValues.length - 1] + optionsPathPnl;
        const pnl = finalPortfolioVal - totalCapital;
        const ret = pnl / totalCapital;

        finalPnLDistribution.push(pnl);
        finalReturnDistribution.push(ret);
        finalWeights.push(isImportanceSampling ? Math.exp(pathLogWeight) : 1.0);

        // Record dollar loss per asset for Euler risk decomposition
        const assetDollarLosses = assets.map((_, i) => {
          const initialAssetNotional = totalCapital * normalizedWeights[i];
          const finalAssetNotional =
            initialAssetNotional * (currentAssetPrices[i] / initialAssetPrices[i]);
          return initialAssetNotional - finalAssetNotional;
        });
        pathAssetLosses.push(assetDollarLosses);

        if (sampleStepsPaths.length < 500) {
          if (optionsPathPnl !== 0) {
            const adjustedDaily = dailyPortfolioValues.map((v, stepIdx) => {
              const frac = stepIdx / Math.max(1, dailyPortfolioValues.length - 1);
              return v + frac * optionsPathPnl;
            });
            sampleStepsPaths.push(adjustedDaily);
          } else {
            sampleStepsPaths.push(dailyPortfolioValues);
          }
        }
      }
    }
  }

  // Calculate fan chart percentiles across days
  const p1: number[] = [];
  const p5: number[] = [];
  const p25: number[] = [];
  const p50: number[] = [];
  const p75: number[] = [];
  const p95: number[] = [];
  const p99: number[] = [];

  for (let day = 0; day <= days; day++) {
    const dayValues: number[] = [];
    if (sampleStepsPaths.length > 0) {
      for (let s = 0; s < sampleStepsPaths.length; s++) {
        dayValues.push(sampleStepsPaths[s][day] ?? totalCapital);
      }
      dayValues.sort((a, b) => a - b);
    } else {
      dayValues.push(totalCapital);
    }

    p1.push(percentile(dayValues, 0.01));
    p5.push(percentile(dayValues, 0.05));
    p25.push(percentile(dayValues, 0.25));
    p50.push(percentile(dayValues, 0.5));
    p75.push(percentile(dayValues, 0.75));
    p95.push(percentile(dayValues, 0.95));
    p99.push(percentile(dayValues, 0.99));
  }

  // Risk Engine: Sort losses (Loss = -PnL) for VaR and ES
  let var90: number, var95: number, var99: number, var995: number;
  let es90: number, es95: number, es99: number, es995: number;

  const rawLosses = finalPnLDistribution.map((pnl) => -pnl);

  if (isImportanceSampling) {
    // Importance Sampling Weighted Quantiles
    const lossItems = rawLosses
      .map((loss, idx) => ({ value: loss, weight: finalWeights[idx] }))
      .sort((a, b) => a.value - b.value);

    const r90 = calculateWeightedExpectedShortfall(lossItems, 0.9);
    const r95 = calculateWeightedExpectedShortfall(lossItems, 0.95);
    const r99 = calculateWeightedExpectedShortfall(lossItems, 0.99);
    const r995 = calculateWeightedExpectedShortfall(lossItems, 0.995);

    var90 = r90.varValue;
    es90 = r90.esValue;
    var95 = r95.varValue;
    es95 = r95.esValue;
    var99 = r99.varValue;
    es99 = r99.esValue;
    var995 = r995.varValue;
    es995 = r995.esValue;
  } else {
    const sortedLosses = [...rawLosses].sort((a, b) => a - b);
    const r90 = calculateExpectedShortfall(sortedLosses, 0.9);
    const r95 = calculateExpectedShortfall(sortedLosses, 0.95);
    const r99 = calculateExpectedShortfall(sortedLosses, 0.99);
    const r995 = calculateExpectedShortfall(sortedLosses, 0.995);

    var90 = r90.varValue;
    es90 = r90.esValue;
    var95 = r95.varValue;
    es95 = r95.esValue;
    var99 = r99.varValue;
    es99 = r99.esValue;
    var995 = r995.varValue;
    es995 = r995.esValue;
  }

  // Real Extreme Value Theory (EVT) GPD Fit
  const evtFit = fitEVTGeneralizedPareto(rawLosses, 0.9, 0.99);

  // Maximum Drawdown across sampled trajectories
  let maxDD = 0;
  for (let p = 0; p < sampleStepsPaths.length; p++) {
    const path = sampleStepsPaths[p];
    let peak = path[0];
    for (let d = 0; d < path.length; d++) {
      const val = path[d];
      if (val > peak) peak = val;
      const dd = (peak - val) / peak;
      if (dd > maxDD) maxDD = dd;
    }
  }

  // Moments
  const moments = calculateMoments(finalReturnDistribution);
  const annualizedReturn = moments.mean * (252 / days);
  const annualizedVol = moments.std * Math.sqrt(252 / days);
  const riskFreeRate = 0.045;
  const sharpe = annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : 0;

  const downsideReturns = finalReturnDistribution.filter((r) => r < 0);
  const downsideMoments = calculateMoments(downsideReturns);
  const downsideVol = downsideMoments.std * Math.sqrt(252 / days) || 0.01;
  const sortino = (annualizedReturn - riskFreeRate) / downsideVol;

  const weightedAssetVol = assets.reduce(
    (acc, a, i) => acc + (normalizedWeights[i] || 0) * a.annualVolatility,
    0
  );
  const diversificationBenefit = Math.max(
    0,
    ((weightedAssetVol - annualizedVol) / (weightedAssetVol || 1)) * 100
  );

  // Real Euler Component VaR Allocation: Average loss of asset i when portfolio loss >= VaR99
  const tailIndices: number[] = [];
  for (let k = 0; k < rawLosses.length; k++) {
    if (rawLosses[k] >= var99) {
      tailIndices.push(k);
    }
  }

  const tailCount = tailIndices.length || 1;
  const assetAverageTailLosses = new Array(numAssets).fill(0);

  if (pathAssetLosses.length > 0) {
    for (const idx of tailIndices) {
      const assetLosses = pathAssetLosses[idx];
      if (assetLosses) {
        for (let i = 0; i < numAssets; i++) {
          assetAverageTailLosses[i] += assetLosses[i] / tailCount;
        }
      }
    }
  }

  const totalTailLoss =
    assetAverageTailLosses.reduce((sum, loss) => sum + Math.max(0, loss), 0) || 1;

  const componentVaR = assets.map((asset, i) => {
    const rawContribution = Math.max(0, assetAverageTailLosses[i]);
    const percentContrib = Math.round((rawContribution / totalTailLoss) * 100);
    return {
      symbol: asset.symbol,
      percentContribution: percentContrib,
      marginalVaR: Math.round(var99 * (percentContrib / 100)),
    };
  });

  const sumContrib = componentVaR.reduce((sum, c) => sum + c.percentContribution, 0) || 1;
  componentVaR.forEach((c) => {
    c.percentContribution = Math.round((c.percentContribution / sumContrib) * 100);
  });

  const endTime = performance.now();
  const executionTimeMs = Math.max(1, Math.round(endTime - startTime));
  const throughputPathsPerSec = Math.round(
    finalPnLDistribution.length / (executionTimeMs / 1000)
  );

  const riskMetrics: RiskMetrics = {
    var90: Math.round(var90),
    var95: Math.round(var95),
    var99: Math.round(var99),
    var995: Math.round(var995),
    es90: Math.round(es90),
    es95: Math.round(es95),
    es99: Math.round(es99),
    es995: Math.round(es995),
    maxDrawdown: Math.min(1.0, maxDD),
    portfolioAnnualVol: annualizedVol,
    portfolioAnnualReturn: annualizedReturn,
    sharpeRatio: Math.round(sharpe * 100) / 100,
    sortinoRatio: Math.round(sortino * 100) / 100,
    diversificationBenefit: Math.round(diversificationBenefit * 10) / 10,
    skewness: Math.round(moments.skewness * 100) / 100,
    kurtosis: Math.round(moments.kurtosis * 100) / 100,
    componentVaR,
    evtVaR99: evtFit.evtVaR,
    evtES99: evtFit.evtES,
  };

  return {
    config,
    portfolioValue: totalCapital,
    timeHorizonDays: days,
    paths: finalPnLDistribution.length,
    percentiles: { p1, p5, p25, p50, p75, p95, p99 },
    samplePaths: sampleStepsPaths.slice(0, recordedPathsToStore),
    finalPnLDistribution,
    finalReturnDistribution,
    riskMetrics,
    executionTimeMs,
    throughputPathsPerSec,
  };
}
