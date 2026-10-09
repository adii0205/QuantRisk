import { Asset, Portfolio, DatasetMetadata } from '../types/risk';
import { PCG32 } from '../utils/rng';
import { computeDatasetHash } from '../utils/hash';

export interface FactorDgpOptions {
  seed?: bigint;
  length?: number; // e.g. 500 or 750 observations
  marketVolAnnual?: number;
}

/**
 * Seeded Synthetic Multi-Factor Generator ("Demo Mode").
 * Unlike naive independent noise, this is driven by a shared systematic market factor M_t:
 * R_{i,t} = \mu_i \Delta t + \beta_i \sigma_M Z_{M,t} + \sqrt{\sigma_i^2 - \beta_i^2 \sigma_M^2} Z_{i,t}
 * This guarantees realistic, economically sound cross-asset correlation structure.
 */
export function generateSyntheticFactorPortfolio(
  basePortfolio: Portfolio,
  options: FactorDgpOptions = {}
): Portfolio {
  const seed = options.seed ?? 982451653n;
  const length = options.length ?? 750;
  const mktVolAnnual = options.marketVolAnnual ?? 0.16;

  const rng = new PCG32(seed, 101n);
  const dailyMktVol = mktVolAnnual / Math.sqrt(252);

  // Generate synthetic trading calendar dates
  const dates: string[] = [];
  const curr = new Date(Date.UTC(2021, 0, 4));
  while (dates.length < length) {
    const day = curr.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(curr.toISOString().slice(0, 10));
    }
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  // Pre-generate market factor shocks
  const mktShocks: number[] = [];
  for (let t = 0; t < length; t++) {
    mktShocks.push(rng.normal());
  }

  // Generate asset returns
  const updatedAssets: Asset[] = basePortfolio.assets.map((asset, aIdx) => {
    const muDaily = (asset.expectedAnnualReturn - 0.5 * asset.annualVolatility * asset.annualVolatility) / 252;
    const sigmaDaily = asset.annualVolatility / Math.sqrt(252);

    // Asset beta relative to market (differentiated by category)
    let beta = 1.0;
    if (asset.category === 'Equity') {
      beta = 0.8 + (aIdx % 5) * 0.15;
    } else if (asset.category === 'Commodity') {
      beta = 0.25;
    } else if (asset.category === 'Fixed Income') {
      beta = -0.20;
    }

    const systematicVol = beta * dailyMktVol;
    const idioVol = Math.sqrt(Math.max(0.000001, sigmaDaily * sigmaDaily - systematicVol * systematicVol));

    const returns: number[] = [];
    for (let t = 0; t < length; t++) {
      const zMkt = mktShocks[t]!;
      const zIdio = rng.normal();
      const r = muDaily + systematicVol * zMkt + idioVol * zIdio;
      returns.push(r);
    }

    return {
      ...asset,
      historicalReturns: returns,
    };
  });

  const matrixForHash: number[][] = [];
  for (let t = 0; t < length; t++) {
    matrixForHash.push(updatedAssets.map((a) => a.historicalReturns[t]!));
  }

  const hash = computeDatasetHash(
    updatedAssets.map((a) => a.symbol),
    dates,
    matrixForHash
  );

  const datasetMetadata: DatasetMetadata = {
    name: `${basePortfolio.name} (Synthetic Factor Generator)`,
    source: 'synthetic_demo',
    dateRange: `${dates[0]} to ${dates[dates.length - 1]} (${length} trading days)`,
    startDate: dates[0]!,
    endDate: dates[dates.length - 1]!,
    observationCount: length,
    hash,
    licenseNote: 'Synthetic econometric factor model with common market driver (Demo Mode).',
    isRealMarketData: false,
  };

  return {
    ...basePortfolio,
    datasetMetadata,
    assets: updatedAssets,
  };
}
