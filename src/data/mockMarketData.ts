import { Asset, Portfolio } from '../types/risk';
import { REAL_ETF_PORTFOLIO } from './realMarketData';
import { generateSyntheticFactorPortfolio } from './synthetic-factor-dgp';

const RAW_INDIA_PORTFOLIO: Portfolio = {
  id: 'india_bluechip',
  name: 'India Bluechip Alpha & Metals',
  description: 'Equities & Precious Metals portfolio (Reliance, HDFC Bank, TCS, Infosys, Gold, Silver) denominated in INR.',
  cashWeight: 0.05,
  leverage: 1.0,
  totalCapital: 10000000, // ₹10,000,000 baseline
  baseCurrency: 'INR',
  assets: [
    {
      symbol: 'RELIANCE',
      name: 'Reliance Industries Ltd',
      category: 'Equity',
      weight: 0.20,
      currentPrice: 2950.0,
      expectedAnnualReturn: 0.145,
      annualVolatility: 0.22,
      historicalReturns: [],
      currency: 'INR',
    },
    {
      symbol: 'HDFCBANK',
      name: 'HDFC Bank Ltd',
      category: 'Equity',
      weight: 0.20,
      currentPrice: 1680.0,
      expectedAnnualReturn: 0.138,
      annualVolatility: 0.21,
      historicalReturns: [],
      currency: 'INR',
    },
    {
      symbol: 'TCS',
      name: 'Tata Consultancy Services',
      category: 'Equity',
      weight: 0.20,
      currentPrice: 3890.0,
      expectedAnnualReturn: 0.125,
      annualVolatility: 0.18,
      historicalReturns: [],
      currency: 'INR',
    },
    {
      symbol: 'INFY',
      name: 'Infosys Ltd',
      category: 'Equity',
      weight: 0.15,
      currentPrice: 1540.0,
      expectedAnnualReturn: 0.132,
      annualVolatility: 0.23,
      historicalReturns: [],
      currency: 'INR',
    },
    {
      symbol: 'GOLDBEES',
      name: 'Nippon India ETF Gold BeES',
      category: 'Commodity',
      weight: 0.15,
      currentPrice: 62.5,
      expectedAnnualReturn: 0.095,
      annualVolatility: 0.14,
      historicalReturns: [],
      currency: 'INR',
    },
    {
      symbol: 'SILVERBEES',
      name: 'Nippon India Silver ETF',
      category: 'Commodity',
      weight: 0.10,
      currentPrice: 84.0,
      expectedAnnualReturn: 0.115,
      annualVolatility: 0.26,
      historicalReturns: [],
      currency: 'INR',
    },
  ],
};

const INDIA_BLUECHIP_PORTFOLIO = generateSyntheticFactorPortfolio(RAW_INDIA_PORTFOLIO, {
  seed: 424242n,
  length: 750,
  marketVolAnnual: 0.17,
});

const RAW_US_TECH_PORTFOLIO: Portfolio = {
  id: 'us_tech_macro',
  name: 'US Tech Mega-Cap & Treasury Hedge',
  description: 'High-beta tech growth paired with physical gold and 20+ year US Treasury bonds',
  cashWeight: 0.05,
  leverage: 1.0,
  totalCapital: 1000000,
  baseCurrency: 'USD',
  assets: [
    {
      symbol: 'NVDA',
      name: 'NVIDIA Corp',
      category: 'Equity',
      weight: 0.25,
      currentPrice: 130.0,
      expectedAnnualReturn: 0.28,
      annualVolatility: 0.44,
      historicalReturns: [],
      currency: 'USD',
    },
    {
      symbol: 'MSFT',
      name: 'Microsoft Corp',
      category: 'Equity',
      weight: 0.20,
      currentPrice: 440.0,
      expectedAnnualReturn: 0.15,
      annualVolatility: 0.22,
      historicalReturns: [],
      currency: 'USD',
    },
    {
      symbol: 'AAPL',
      name: 'Apple Inc',
      category: 'Equity',
      weight: 0.20,
      currentPrice: 228.0,
      expectedAnnualReturn: 0.14,
      annualVolatility: 0.20,
      historicalReturns: [],
      currency: 'USD',
    },
    {
      symbol: 'AMZN',
      name: 'Amazon.com Inc',
      category: 'Equity',
      weight: 0.15,
      currentPrice: 195.0,
      expectedAnnualReturn: 0.18,
      annualVolatility: 0.28,
      historicalReturns: [],
      currency: 'USD',
    },
    {
      symbol: 'GLD',
      name: 'SPDR Gold Shares',
      category: 'Commodity',
      weight: 0.10,
      currentPrice: 242.0,
      expectedAnnualReturn: 0.08,
      annualVolatility: 0.14,
      historicalReturns: [],
      currency: 'USD',
    },
    {
      symbol: 'TLT',
      name: 'iShares 20+ Year Treasury Bond ETF',
      category: 'Fixed Income',
      weight: 0.10,
      currentPrice: 94.0,
      expectedAnnualReturn: 0.045,
      annualVolatility: 0.17,
      historicalReturns: [],
      currency: 'USD',
    },
  ],
};

const US_TECH_PORTFOLIO = generateSyntheticFactorPortfolio(RAW_US_TECH_PORTFOLIO, {
  seed: 981273n,
  length: 750,
  marketVolAnnual: 0.19,
});

const RAW_ALL_WEATHER_PORTFOLIO: Portfolio = {
  id: 'global_all_weather',
  name: 'Ray Dalio All-Weather Global Multi-Asset',
  description: 'Equities, long bonds, intermediate bonds, commodities and gold for macro resilience',
  cashWeight: 0.05,
  leverage: 1.0,
  totalCapital: 5000000,
  baseCurrency: 'USD',
  assets: [
    {
      symbol: 'SPY',
      name: 'SPDR S&P 500 ETF Trust',
      category: 'ETF',
      weight: 0.30,
      currentPrice: 570.0,
      expectedAnnualReturn: 0.10,
      annualVolatility: 0.16,
      historicalReturns: [],
      currency: 'USD',
    },
    {
      symbol: 'TLT',
      name: 'iShares 20+ Year Treasury',
      category: 'Fixed Income',
      weight: 0.30,
      currentPrice: 94.0,
      expectedAnnualReturn: 0.045,
      annualVolatility: 0.17,
      historicalReturns: [],
      currency: 'USD',
    },
    {
      symbol: 'IEF',
      name: 'iShares 7-10 Year Treasury',
      category: 'Fixed Income',
      weight: 0.15,
      currentPrice: 96.0,
      expectedAnnualReturn: 0.04,
      annualVolatility: 0.08,
      historicalReturns: [],
      currency: 'USD',
    },
    {
      symbol: 'GLD',
      name: 'SPDR Gold Shares',
      category: 'Commodity',
      weight: 0.15,
      currentPrice: 242.0,
      expectedAnnualReturn: 0.08,
      annualVolatility: 0.14,
      historicalReturns: [],
      currency: 'USD',
    },
    {
      symbol: 'DBC',
      name: 'Invesco DB Commodity Index Tracking',
      category: 'Commodity',
      weight: 0.10,
      currentPrice: 22.5,
      expectedAnnualReturn: 0.07,
      annualVolatility: 0.20,
      historicalReturns: [],
      currency: 'USD',
    },
  ],
};

const ALL_WEATHER_PORTFOLIO = generateSyntheticFactorPortfolio(RAW_ALL_WEATHER_PORTFOLIO, {
  seed: 739182n,
  length: 750,
  marketVolAnnual: 0.13,
});

export const PRESET_PORTFOLIOS: Portfolio[] = [
  REAL_ETF_PORTFOLIO,
  INDIA_BLUECHIP_PORTFOLIO,
  US_TECH_PORTFOLIO,
  ALL_WEATHER_PORTFOLIO,
];

// Calculate historical correlation matrix from asset returns
export function calculateCorrelationMatrix(assets: Asset[]): {
  correlationMatrix: number[][];
  covarianceMatrix: number[][];
} {
  const n = assets.length;
  const correlationMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(1));
  const covarianceMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  // Compute variances & covariances
  const means = assets.map((a) => {
    const sum = a.historicalReturns.reduce((acc, v) => acc + v, 0);
    return sum / a.historicalReturns.length;
  });

  const variances = assets.map((a, i) => {
    const mean = means[i];
    const sumSq = a.historicalReturns.reduce((acc, v) => acc + (v - mean) ** 2, 0);
    return sumSq / (a.historicalReturns.length - 1);
  });

  const stds = variances.map((v) => Math.sqrt(v));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        correlationMatrix[i][j] = 1.0;
        covarianceMatrix[i][j] = variances[i];
      } else {
        const retI = assets[i].historicalReturns;
        const retJ = assets[j].historicalReturns;
        const len = Math.min(retI.length, retJ.length);
        let cov = 0;
        for (let k = 0; k < len; k++) {
          cov += (retI[k] - means[i]) * (retJ[k] - means[j]);
        }
        cov /= len - 1;
        covarianceMatrix[i][j] = cov;
        const corr = cov / (stds[i] * stds[j] || 1);
        correlationMatrix[i][j] = Math.max(-0.99, Math.min(0.99, corr));
      }
    }
  }

  return { correlationMatrix, covarianceMatrix };
}
