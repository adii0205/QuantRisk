import { SimulationModelType } from '../../types/risk';

export type CovarianceMethod = 'sample' | 'ledoit_wolf' | 'ewma';

export interface GarchCalibrationResult {
  symbol: string;
  omega: number;
  alpha: number;
  beta: number;
  gamma: number; // GJR asymmetry parameter
  persistence: number; // alpha + beta + 0.5 * gamma
  longRunAnnualVol: number;
  logLikelihood: number;
  converged: boolean;
  iterations: number;
  standardizedResiduals: number[];
}

export interface StudentTCalibrationResult {
  symbol: string;
  nu: number; // degrees of freedom
  logLikelihood: number;
  converged: boolean;
}

export interface HmmRegimeState {
  stateIndex: number;
  name: string;
  meanDaily: number;
  volDaily: number;
  volAnnual: number;
  stationaryProb: number;
}

export interface HmmCalibrationResult {
  states: HmmRegimeState[];
  transitionMatrix: number[][]; // P_ij
  currentProbabilities: number[]; // P(S_T = k)
  logLikelihood: number;
  iterations: number;
  converged: boolean;
}

export interface HestonCalibrationResult {
  symbol: string;
  kappa: number; // rate of mean reversion
  theta: number; // long-term variance
  xi: number;    // vol of vol
  rho: number;   // correlation with price shock
  v0: number;    // current variance
  fellerConditionSatisfied: boolean; // 2 * kappa * theta > xi^2
}

export interface DiagnosticMetrics {
  symbol: string;
  sampleSize: number;
  ljungBoxQ: number;
  ljungBoxPValue: number;
  hasArchEffectsRemaining: boolean; // p < 0.05
  jarqueBeraStat: number;
  jarqueBeraPValue: number;
  isNormallyDistributed: boolean; // p > 0.05
  aic: number;
  bic: number;
}

export interface AssetCalibrationSummary {
  symbol: string;
  name: string;
  garch: GarchCalibrationResult;
  studentT: StudentTCalibrationResult;
  heston: HestonCalibrationResult;
  diagnostics: DiagnosticMetrics;
}

export interface CovarianceEstimationResult {
  method: CovarianceMethod;
  symbols: string[];
  covarianceMatrix: number[][];
  correlationMatrix: number[][];
  shrinkageIntensity?: number; // delta in [0, 1] for Ledoit-Wolf
  ewmaLambda?: number;         // lambda for EWMA
  conditionNumber: number;
}

export interface PortfolioCalibrationResult {
  timestamp: string;
  covariance: CovarianceEstimationResult;
  assets: AssetCalibrationSummary[];
  hmmRegimes: HmmCalibrationResult;
  recommendedModel: SimulationModelType;
}

export interface RecoveryTestMetric {
  parameter: string;
  trueValue: number;
  meanEstimated: number;
  stdEstimated: number;
  bias: number;
  relativeErrorPercent: number;
  recoveryPassed: boolean;
}

export interface RecoveryTestReport {
  timestamp: string;
  replications: number;
  sampleSize: number;
  metrics: RecoveryTestMetric[];
  allPassed: boolean;
}
