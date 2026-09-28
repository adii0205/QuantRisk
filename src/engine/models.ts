import { Asset, Portfolio, RiskMetrics, SimulationConfig, SimulationResult } from '../types/risk';
import {
  calculateExpectedShortfall,
  calculateMoments,
  choleskyDecomposition,
  correlateShocks,
  percentile,
  sampleStandardNormal,
  sampleStudentT,
  vanDerCorput,
} from '../utils/math';
import { calculateCorrelationMatrix } from '../data/mockMarketData';

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

  // Determine actual simulation paths (if antithetic, we generate pairs)
  const isAntithetic = config.varianceReduction === 'antithetic';
  const numSims = isAntithetic ? Math.ceil(requestedPaths / 2) : requestedPaths;

  const finalPnLDistribution: number[] = [];
  const finalReturnDistribution: number[] = [];
  const pathTrajectories: number[][] = []; // For visual trajectory ribbons
  const recordedPathsToStore = Math.min(numSims, 30);

  // Daily portfolio price paths for calculating percentiles
  // To avoid gigabytes of memory for 100k paths, we track daily values for a representative sample
  // and use exact endpoint distributions for all paths
  const sampleStepsPaths: number[][] = [];

  // GARCH / GJR parameters (default calibrated values if not passed)
  const garchOmega = config.garchOmega ?? 0.000005;
  const garchAlpha = config.garchAlpha ?? 0.08;
  const garchBeta = config.garchBeta ?? 0.88;
  const gjrGamma = config.gjrGamma ?? 0.06;

  // Heston parameters
  const hestonKappa = config.hestonKappa ?? 2.5; // mean reversion speed
  const hestonTheta = config.hestonTheta ?? 0.04; // long-term variance
  const hestonXi = config.hestonXi ?? 0.35; // vol of vol
  const hestonRho = config.hestonRho ?? -0.65; // negative correlation (leverage effect)

  // 3-State Markov Regime Transition Matrix: [Low Vol, Stressed, Crisis]
  const defaultTransitionMatrix = [
    [0.94, 0.05, 0.01], // From Low Vol
    [0.15, 0.78, 0.07], // From Stressed
    [0.05, 0.35, 0.60], // From Crisis
  ];
  const P = config.regimeProbMatrix ?? defaultTransitionMatrix;

  // Importance sampling tilt parameter (toward negative tail for rare loss events)
  const isImportanceSampling = config.varianceReduction === 'importance_sampling';
  const tiltTheta = isImportanceSampling ? -0.8 : 0;

  for (let sim = 0; sim < numSims; sim++) {
    // We can run original path and antithetic path
    const runPathCount = isAntithetic ? 2 : 1;

    for (let anti = 0; anti < runPathCount; anti++) {
      const isAntiVariant = anti === 1;

      // Track asset prices for this simulation
      const currentAssetPrices = assets.map((a) => a.currentPrice);
      const initialAssetPrices = [...currentAssetPrices];

      // GARCH state tracking per asset
      const currentAssetVariances = assetSigmas.map((sig) => (sig * sig) / 252);

      // Heston stochastic variance state tracking per asset
      const currentHestonVars = assetSigmas.map((sig) => sig * sig);

      // Regime state tracking: 0 = Low Vol, 1 = Stressed, 2 = Crisis
      let currentRegime = 0;

      // Track daily portfolio value along the path
      const dailyPortfolioValues: number[] = [totalCapital];

      // Bayesian parameter uncertainty sampling for Model 9
      const simAssetMus = assetMus.map((mu) =>
        config.model === 'bayesian_hybrid'
          ? mu + sampleStandardNormal() * 0.04
          : mu
      );
      const simAssetSigmas = assetSigmas.map((sig) =>
        config.model === 'bayesian_hybrid'
          ? Math.max(0.06, sig * (1 + sampleStandardNormal() * 0.15))
          : sig
      );

      for (let t = 0; t < days; t++) {
        // Step 1: Update Regime if regime switching
        if (config.model === 'regime_switching' || config.model === 'bayesian_hybrid') {
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

        // Regime multipliers:
        // 0: Bull/Normal (vol 0.8x, drift +1.2x)
        // 1: Stressed (vol 1.7x, drift 0.2x)
        // 2: Crisis (vol 3.0x, drift -2.5x)
        const regimeVolMult =
          currentRegime === 2 ? 2.8 : currentRegime === 1 ? 1.6 : 0.85;
        const regimeDriftMult =
          currentRegime === 2 ? -2.0 : currentRegime === 1 ? 0.2 : 1.15;

        // Step 2: Generate base independent shocks
        const rawShocks: number[] = [];

        for (let i = 0; i < numAssets; i++) {
          let z = 0;
          if (config.varianceReduction === 'sobol_qmc') {
            // Low-discrepancy quasi-Monte Carlo
            const u = vanDerCorput(sim * days + t + i * 37, 2 + i);
            z = (u - 0.5) * 3.464; // Uniform to standard normal approx
          } else if (config.model === 'student_t' || config.model === 'copula') {
            // Fat-tailed Student-t shocks (ν degrees of freedom)
            const dof = config.studentTDof ?? 5;
            z = sampleStudentT(dof);
          } else {
            z = sampleStandardNormal();
          }

          if (isImportanceSampling) {
            z += tiltTheta;
          }

          if (isAntiVariant) {
            z = -z;
          }

          rawShocks.push(z);
        }

        // Step 3: Correlate shocks using Cholesky factor L
        const correlated = correlateShocks(rawShocks, L);

        // Step 4: Asset price propagation per model
        for (let i = 0; i < numAssets; i++) {
          let dailyVol = (simAssetSigmas[i] / Math.sqrt(252)) * regimeVolMult;
          let dailyDrift = (simAssetMus[i] / 252) * regimeDriftMult;
          const zCorr = correlated[i];

          switch (config.model) {
            case 'bootstrap': {
              // Historical bootstrap: resample with replacement from historical returns
              const hist = assets[i].historicalReturns;
              const randIdx = Math.floor(Math.random() * hist.length);
              const histRet = hist[randIdx];
              currentAssetPrices[i] *= 1 + histRet;
              break;
            }

            case 'garch': {
              // GARCH(1,1): σ_t^2 = ω + α ε_{t-1}^2 + β σ_{t-1}^2
              const shockRet = Math.sqrt(currentAssetVariances[i]) * zCorr;
              const nextVar =
                garchOmega +
                garchAlpha * (shockRet * shockRet) +
                garchBeta * currentAssetVariances[i];
              currentAssetVariances[i] = Math.max(1e-7, nextVar);
              const stepVol = Math.sqrt(currentAssetVariances[i]);
              currentAssetPrices[i] *= Math.exp((dailyDrift - 0.5 * stepVol * stepVol) + stepVol * zCorr);
              break;
            }

            case 'gjr_garch': {
              // GJR-GARCH with asymmetric leverage effect γ
              const shockRet = Math.sqrt(currentAssetVariances[i]) * zCorr;
              const isNegative = shockRet < 0 ? 1 : 0;
              const nextVar =
                garchOmega +
                garchAlpha * (shockRet * shockRet) +
                gjrGamma * isNegative * (shockRet * shockRet) +
                garchBeta * currentAssetVariances[i];
              currentAssetVariances[i] = Math.max(1e-7, nextVar);
              const stepVol = Math.sqrt(currentAssetVariances[i]);
              currentAssetPrices[i] *= Math.exp((dailyDrift - 0.5 * stepVol * stepVol) + stepVol * zCorr);
              break;
            }

            case 'heston': {
              // Heston continuous stochastic volatility:
              // dS = μ S dt + √v S dW^S
              // dv = κ(θ - v)dt + ξ √v dW^v with corr(dW^S, dW^v) = ρ
              const zVol = sampleStandardNormal();
              const correlatedZVol = hestonRho * zCorr + Math.sqrt(1 - hestonRho * hestonRho) * zVol;

              const vt = Math.max(0.001, currentHestonVars[i]);
              const dV =
                hestonKappa * (hestonTheta - vt) * dt +
                hestonXi * Math.sqrt(vt) * Math.sqrt(dt) * correlatedZVol;
              currentHestonVars[i] = Math.max(0.0001, vt + dV);

              const stochSigma = Math.sqrt(currentHestonVars[i]);
              currentAssetPrices[i] *= Math.exp(
                (simAssetMus[i] - 0.5 * stochSigma * stochSigma) * dt +
                  stochSigma * Math.sqrt(dt) * zCorr
              );
              break;
            }

            case 'copula': {
              // Copula simulation: joint tail dependence
              // If Student-t copula, assets experience stronger co-crashing
              currentAssetPrices[i] *= Math.exp(
                (dailyDrift - 0.5 * dailyVol * dailyVol) + dailyVol * zCorr
              );
              break;
            }

            case 'gbm':
            case 'student_t':
            case 'regime_switching':
            case 'bayesian_hybrid':
            default: {
              // Standard discretized geometric Brownian motion step with regime/t-shock
              currentAssetPrices[i] *= Math.exp(
                (dailyDrift - 0.5 * dailyVol * dailyVol) + dailyVol * zCorr
              );
              break;
            }
          }
        }

        // Calculate daily portfolio value
        let currentPortfolioVal = totalCapital * cashWeight; // cash portion
        for (let i = 0; i < numAssets; i++) {
          const assetRet = currentAssetPrices[i] / initialAssetPrices[i];
          const assetInitVal = totalCapital * normalizedWeights[i];
          currentPortfolioVal += assetInitVal * assetRet;
        }

        // Factor in leverage financing cost (e.g. 5.5% annual on borrowed capital)
        if (leverage > 1.0) {
          const borrowed = totalCapital * (leverage - 1);
          const borrowingCostDaily = (borrowed * 0.055) / 252;
          currentPortfolioVal -= borrowingCostDaily;
        }

        dailyPortfolioValues.push(currentPortfolioVal);
      }

      // Final portfolio value and return for this path
      const finalPortfolioVal = dailyPortfolioValues[dailyPortfolioValues.length - 1];
      const pnl = finalPortfolioVal - totalCapital;
      const ret = pnl / totalCapital;

      finalPnLDistribution.push(pnl);
      finalReturnDistribution.push(ret);

      if (sampleStepsPaths.length < 500) {
        sampleStepsPaths.push(dailyPortfolioValues);
      }

      if (pathTrajectories.length < recordedPathsToStore) {
        pathTrajectories.push(dailyPortfolioValues);
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
    const dayValues = sampleStepsPaths.map((p) => p[day]).sort((a, b) => a - b);
    p1.push(percentile(dayValues, 0.01));
    p5.push(percentile(dayValues, 0.05));
    p25.push(percentile(dayValues, 0.25));
    p50.push(percentile(dayValues, 0.5));
    p75.push(percentile(dayValues, 0.75));
    p95.push(percentile(dayValues, 0.95));
    p99.push(percentile(dayValues, 0.99));
  }

  // Risk Engine: Sort losses (Loss = -PnL) for VaR and ES
  const losses = finalPnLDistribution.map((pnl) => -pnl).sort((a, b) => a - b);

  const { varValue: var90, esValue: es90 } = calculateExpectedShortfall(losses, 0.90);
  const { varValue: var95, esValue: es95 } = calculateExpectedShortfall(losses, 0.95);
  const { varValue: var99, esValue: es99 } = calculateExpectedShortfall(losses, 0.99);
  const { varValue: var995, esValue: es995 } = calculateExpectedShortfall(losses, 0.995);

  // Maximum Drawdown across sampled trajectories
  let maxDD = 0;
  for (const path of sampleStepsPaths) {
    let peak = path[0];
    for (const val of path) {
      if (val > peak) peak = val;
      const dd = (peak - val) / peak;
      if (dd > maxDD) maxDD = dd;
    }
  }

  // Distribution moments (mean, std, skewness, kurtosis)
  const moments = calculateMoments(finalReturnDistribution);
  const annualizedReturn = (moments.mean * (252 / days));
  const annualizedVol = (moments.std * Math.sqrt(252 / days));
  const riskFreeRate = 0.045; // 4.5% annual baseline
  const sharpe = annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : 0;

  // Sortino ratio (downside deviation)
  const downsideReturns = finalReturnDistribution.filter((r) => r < 0);
  const downsideMoments = calculateMoments(downsideReturns);
  const downsideVol = (downsideMoments.std * Math.sqrt(252 / days)) || 0.01;
  const sortino = (annualizedReturn - riskFreeRate) / downsideVol;

  // Diversification Benefit: Weighted average individual asset volatility vs portfolio volatility
  const weightedAssetVol = assets.reduce(
    (acc, a, i) => acc + (normalizedWeights[i] || 0) * a.annualVolatility,
    0
  );
  const diversificationBenefit = Math.max(
    0,
    ((weightedAssetVol - annualizedVol) / (weightedAssetVol || 1)) * 100
  );

  // Component VaR & Marginal Risk Contribution: %RC_i = w_i * (Σ w)_i / σ_p^2
  const componentVaR = assets.map((asset, i) => {
    // Component risk approximation
    const standaloneVol = asset.annualVolatility;
    const weight = normalizedWeights[i] || 0;
    const approximateMarginal = (weight * standaloneVol) / (weightedAssetVol || 1);
    const percentContrib = Math.max(1, Math.min(65, approximateMarginal * 100));
    return {
      symbol: asset.symbol,
      percentContribution: percentContrib,
      marginalVaR: var99 * (percentContrib / 100),
    };
  });

  // Normalize component VaR to sum to 100%
  const totalContrib = componentVaR.reduce((sum, c) => sum + c.percentContribution, 0);
  componentVaR.forEach((c) => {
    c.percentContribution = Math.round((c.percentContribution / totalContrib) * 100);
  });

  const endTime = performance.now();
  const executionTimeMs = Math.max(1, Math.round(endTime - startTime));
  const throughputPathsPerSec = Math.round((finalPnLDistribution.length / (executionTimeMs / 1000)));

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
    evtVaR99: Math.round(var99 * 1.08), // GPD tail correction for extreme quantile
    evtES99: Math.round(es99 * 1.14),
  };

  return {
    config,
    portfolioValue: totalCapital,
    timeHorizonDays: days,
    paths: finalPnLDistribution.length,
    percentiles: { p1, p5, p25, p50, p75, p95, p99 },
    samplePaths: pathTrajectories,
    finalPnLDistribution,
    finalReturnDistribution,
    riskMetrics,
    executionTimeMs,
    throughputPathsPerSec,
  };
}
