export type SimulationModelType =
  | 'gbm'
  | 'bootstrap'
  | 'student_t'
  | 'garch'
  | 'gjr_garch'
  | 'heston'
  | 'regime_switching'
  | 'copula'
  | 'bayesian_hybrid';

export type VarianceReduction =
  | 'none'
  | 'antithetic'
  | 'control_variate'
  | 'sobol_qmc'
  | 'importance_sampling';

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'JPY' | 'CHF';

export interface DatasetMetadata {
  name: string;
  source: 'stooq' | 'yahoo' | 'csv_import' | 'bundled_real' | 'synthetic_demo';
  dateRange: string;
  startDate: string;
  endDate: string;
  observationCount: number;
  hash: string;
  licenseNote?: string;
  isRealMarketData: boolean;
}

export type HardwareEngine = 'cpu_single' | 'cpu_worker' | 'gpu_webgl';

export interface Asset {
  symbol: string;
  name: string;
  category: 'Equity' | 'ETF' | 'Commodity' | 'Fixed Income' | 'Crypto';
  weight: number; // percentage (0 - 1)
  currentPrice: number;
  expectedAnnualReturn: number; // mu
  annualVolatility: number; // sigma
  historicalReturns: number[]; // daily historical returns
  currency?: CurrencyCode; // Asset native currency (defaults to USD or portfolio base)
}

export interface Portfolio {
  id: string;
  name: string;
  description: string;
  cashWeight: number; // 0 - 1
  leverage: number; // 1.0 = no leverage, 1.5 = 150% gross
  totalCapital: number;
  baseCurrency?: CurrencyCode; // default base currency e.g. USD, INR
  datasetMetadata?: DatasetMetadata;
  assets: Asset[];
}

export interface SimulationConfig {
  model: SimulationModelType;
  paths: number; // 1,000 to 100,000+
  timeHorizonDays: number; // 1 to 252 days
  varianceReduction: VarianceReduction;
  hardwareEngine: HardwareEngine;
  confidenceLevels: number[]; // [0.90, 0.95, 0.99, 0.995]
  // Model specific parameters
  studentTDof?: number; // e.g. 5
  garchOmega?: number;
  garchAlpha?: number;
  garchBeta?: number;
  gjrGamma?: number;
  hestonKappa?: number;
  hestonTheta?: number;
  hestonXi?: number;
  hestonRho?: number;
  regimeProbMatrix?: number[][];
}

export interface RiskMetrics {
  var90: number;
  var95: number;
  var99: number;
  var995: number;
  es90: number;
  es95: number;
  es99: number;
  es995: number;
  maxDrawdown: number;
  portfolioAnnualVol: number;
  portfolioAnnualReturn: number;
  sharpeRatio: number;
  sortinoRatio: number;
  diversificationBenefit: number; // % reduction vs weighted standalone vols
  skewness: number;
  kurtosis: number;
  componentVaR: { symbol: string; percentContribution: number; marginalVaR: number }[];
  evtVaR99?: number;
  evtES99?: number;
}

export interface SimulationResult {
  config: SimulationConfig;
  portfolioValue: number;
  timeHorizonDays: number;
  paths: number;
  percentiles: {
    p1: number[];
    p5: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p95: number[];
    p99: number[];
  };
  samplePaths: number[][]; // up to 40 representative paths for rendering
  finalPnLDistribution: number[]; // final P&L for every simulated path
  finalReturnDistribution: number[];
  riskMetrics: RiskMetrics;
  executionTimeMs: number;
  throughputPathsPerSec: number;
}

export interface OptionPosition {
  id: string;
  underlying: string;
  type: 'call' | 'put';
  strike: number;
  expiryDays: number;
  impliedVol: number;
  quantity: number; // positive = long, negative = short
  premium: number;
}

export interface OptionGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  theoreticalPrice: number;
}

export interface HistoricalStressScenario {
  id: string;
  name: string;
  period: string;
  description: string;
  shocks: {
    equities: number;
    rates: number; // in bps
    volatility: number; // relative change e.g. +1.20 = +120%
    commodities: number;
    fx: number;
  };
}

export interface KupiecBacktestResult {
  confidenceLevel: number;
  totalObservations: number;
  expectedBreaches: number;
  actualBreaches: number;
  breachRate: number;
  likelihoodRatioPOF: number;
  pValuePOF: number;
  christoffersenLR?: number;
  christoffersenPValue?: number;
  conditionalCoverageLR?: number;
  conditionalCoveragePValue?: number;
  baselZone: 'GREEN' | 'YELLOW' | 'RED';
  historicalVaRSeries: number[];
  historicalPnLSeries: number[];
  breachIndices: number[];
}
