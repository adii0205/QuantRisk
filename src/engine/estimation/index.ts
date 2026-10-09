import { Portfolio, SimulationModelType } from '../../types/risk';
import {
  AssetCalibrationSummary,
  CovarianceMethod,
  PortfolioCalibrationResult,
} from './types';
import {
  estimateLedoitWolfCovariance,
  estimateSampleCovariance,
  estimateEwmaCovariance,
} from './covariance';
import { calibrateGarchMle } from './garch-mle';
import { calibrateStudentTMle } from './student-t-mle';
import { calibrateHestonGmm } from './heston-calibration';
import { calibrateHmmEm } from './hmm-em';
import { computeModelDiagnostics } from './diagnostics';

export * from './types';
export * from './covariance';
export * from './garch-mle';
export * from './student-t-mle';
export * from './hmm-em';
export * from './heston-calibration';
export * from './diagnostics';
export * from './recovery-tests';
export * from './estimation-runner';

export interface EstimationOptions {
  covarianceMethod?: CovarianceMethod;
  numRegimes?: number;
  ewmaLambda?: number;
}

/**
 * End-to-end econometric parameter estimation module for multi-asset portfolios.
 * Fits GJR-GARCH, Student-t MLE, HMM EM, and Heston GMM with goodness-of-fit diagnostics.
 */
export function estimatePortfolioParameters(
  portfolio: Portfolio,
  options: EstimationOptions = {}
): PortfolioCalibrationResult {
  const method = options.covarianceMethod ?? 'ledoit_wolf';
  const numRegimes = options.numRegimes ?? 3;
  const symbols = portfolio.assets.map((a) => a.symbol);

  // 1. Build aligned returns matrix [T][N]
  const minLen = Math.min(...portfolio.assets.map((a) => a.historicalReturns.length));
  const effectiveLen = Math.max(minLen, 50);

  const returnsMatrix: number[][] = [];
  for (let t = 0; t < effectiveLen; t++) {
    const row = portfolio.assets.map((a) => a.historicalReturns[t] || 0);
    returnsMatrix.push(row);
  }

  // 2. Covariance estimation
  let covResult;
  if (method === 'ledoit_wolf') {
    covResult = estimateLedoitWolfCovariance(returnsMatrix, symbols);
  } else if (method === 'ewma') {
    covResult = estimateEwmaCovariance(returnsMatrix, symbols, options.ewmaLambda ?? 0.94);
  } else {
    covResult = estimateSampleCovariance(returnsMatrix, symbols);
  }

  // 3. Asset-level calibrations
  const assetSummaries: AssetCalibrationSummary[] = portfolio.assets.map((asset) => {
    const returns = asset.historicalReturns.slice(0, effectiveLen);

    // GJR-GARCH
    const garch = calibrateGarchMle(returns, asset.symbol, true);

    // Student-t degrees of freedom on standardized residuals
    const studentT = calibrateStudentTMle(garch.standardizedResiduals, asset.symbol);

    // Heston parameters
    const heston = calibrateHestonGmm(returns, asset.symbol);

    // Diagnostics (Ljung-Box on z^2, Jarque-Bera on z, AIC, BIC)
    const diagnostics = computeModelDiagnostics(
      garch.standardizedResiduals,
      asset.symbol,
      garch.logLikelihood,
      4
    );

    return {
      symbol: asset.symbol,
      name: asset.name,
      garch,
      studentT,
      heston,
      diagnostics,
    };
  });

  // 4. Portfolio aggregate return series for HMM regime switching
  const portfolioWeights = portfolio.assets.map((a) => a.weight);
  const totalWeight = portfolioWeights.reduce((s, w) => s + w, 0) || 1;
  const normWeights = portfolioWeights.map((w) => w / totalWeight);

  const portDailyReturns: number[] = [];
  for (let t = 0; t < effectiveLen; t++) {
    let pr = 0;
    for (let i = 0; i < portfolio.assets.length; i++) {
      pr += normWeights[i]! * returnsMatrix[t]![i]!;
    }
    portDailyReturns.push(pr);
  }

  const hmmRegimes = calibrateHmmEm(portDailyReturns, numRegimes, 40);

  // 5. Select recommended risk model based on econometric criteria
  let recommendedModel: SimulationModelType = 'gjr_garch';
  const avgNu = assetSummaries.reduce((s, a) => s + a.studentT.nu, 0) / assetSummaries.length;
  const avgGamma = assetSummaries.reduce((s, a) => s + a.garch.gamma, 0) / assetSummaries.length;
  const highVolCrisisProb = hmmRegimes.states[hmmRegimes.states.length - 1]?.stationaryProb ?? 0;

  if (avgGamma > 0.05) {
    recommendedModel = 'gjr_garch';
  } else if (avgNu < 5.5) {
    recommendedModel = 'student_t';
  } else if (highVolCrisisProb > 0.15) {
    recommendedModel = 'regime_switching';
  } else {
    recommendedModel = 'copula';
  }

  return {
    timestamp: new Date().toISOString(),
    covariance: covResult,
    assets: assetSummaries,
    hmmRegimes,
    recommendedModel,
  };
}
