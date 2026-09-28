import { HistoricalStressScenario, Portfolio } from '../types/risk';

export const PREDEFINED_STRESS_SCENARIOS: HistoricalStressScenario[] = [
  {
    id: 'gfc_2008',
    name: '2008 Global Financial Crisis (Subprime / Lehman)',
    period: 'Sep 2008 – Mar 2009',
    description: 'Systemic liquidity collapse, severe equity crash, corporate credit freeze, gold rallied late.',
    shocks: {
      equities: -0.42,
      rates: -175, // Flight to safety
      volatility: 1.65, // VIX spiked to 80+ (+165%)
      commodities: -0.38,
      fx: 0.12, // USD flight
    },
  },
  {
    id: 'covid_2020',
    name: '2020 COVID-19 Flash Liquidity Shock',
    period: 'Feb 2020 – Mar 2020',
    description: 'Fastest 30% drop in market history, crude oil backwardation collapse, extreme volatility spike.',
    shocks: {
      equities: -0.34,
      rates: -125,
      volatility: 2.10, // VIX +210%
      commodities: -0.45,
      fx: 0.08,
    },
  },
  {
    id: 'rate_shock_2022',
    name: '2022 Fed Aggressive Rate Shock & Stagflation',
    period: 'Jan 2022 – Oct 2022',
    description: 'Fastest global rate hike cycle in 40 years (+450 bps), simultaneous stock and bond drawdown.',
    shocks: {
      equities: -0.25,
      rates: 380, // +380 bps
      volatility: 0.65,
      commodities: 0.28, // Commodity squeeze
      fx: 0.14,
    },
  },
  {
    id: 'election_em_2024',
    name: '2024 Emerging Market Election & Currency Shock',
    period: 'May 2024 – Jun 2024',
    description: 'Sharp domestic policy uncertainty shock, INR/USD currency pressure, bank index plunge.',
    shocks: {
      equities: -0.16,
      rates: 40,
      volatility: 0.85,
      commodities: 0.06,
      fx: 0.05,
    },
  },
  {
    id: 'geopolitical_ai_2026',
    name: '2026 AI Infrastructure Capex & Energy Squeeze',
    period: 'Jan 2026 – Present',
    description: 'Severe semiconductor supply bottleneck, tech multiple compression, fossil/nuclear fuel spike.',
    shocks: {
      equities: -0.22,
      rates: 75,
      volatility: 0.95,
      commodities: 0.35,
      fx: 0.07,
    },
  },
];

export interface StressEvaluationResult {
  scenarioName: string;
  portfolioLossAmount: number;
  portfolioLossPercent: number;
  shockedPortfolioValue: number;
  shockedVaR99: number;
  shockedES99: number;
  assetLossBreakdown: {
    symbol: string;
    assetLossAmount: number;
    assetLossPercent: number;
    contributionToLoss: number;
  }[];
}

export function evaluateStressScenario(
  portfolio: Portfolio,
  shocks: {
    equities: number; // e.g. -0.20 (-20%)
    rates: number; // bps e.g. +100 bps
    volatility: number; // e.g. +0.80 (+80%)
    commodities: number; // e.g. +0.15 (+15%)
    fx: number; // e.g. +0.05 (+5%)
  },
  scenarioName: string = 'Custom Scenario'
): StressEvaluationResult {
  const { assets, totalCapital, cashWeight, leverage } = portfolio;
  const investedCapital = totalCapital * Math.max(0, 1 - cashWeight) * leverage;
  const sumWeights = assets.reduce((sum, a) => sum + a.weight, 0) || 1;

  let totalLossAmount = 0;
  const assetLossBreakdown = assets.map((asset) => {
    const assetInvested = investedCapital * (asset.weight / sumWeights);
    let assetShock = 0;

    if (asset.category === 'Equity') {
      assetShock = shocks.equities;
    } else if (asset.category === 'Commodity') {
      assetShock = shocks.commodities;
    } else if (asset.category === 'Fixed Income') {
      // Duration impact: approx -Duration * dY where Duration ~ 7.5 years
      assetShock = - (shocks.rates / 10000) * 7.5;
    } else {
      assetShock = shocks.equities * 0.7;
    }

    const loss = assetInvested * assetShock;
    totalLossAmount += loss;

    return {
      symbol: asset.symbol,
      assetLossAmount: Math.round(loss),
      assetLossPercent: Math.round(assetShock * 1000) / 10,
      contributionToLoss: 0,
    };
  });

  // Calculate percentage contribution to overall portfolio loss
  assetLossBreakdown.forEach((item) => {
    item.contributionToLoss =
      totalLossAmount !== 0
        ? Math.round((item.assetLossAmount / totalLossAmount) * 100)
        : 0;
  });

  const shockedPortfolioValue = Math.max(0, totalCapital + totalLossAmount);
  const portfolioLossPercent = Math.round((totalLossAmount / totalCapital) * 1000) / 10;

  // Stressed VaR and ES scale with volatility shock
  const volMultiplier = 1 + Math.max(0, shocks.volatility);
  const shockedVaR99 = Math.round(Math.abs(totalLossAmount) * 0.75 + totalCapital * 0.05 * volMultiplier);
  const shockedES99 = Math.round(shockedVaR99 * 1.32);

  return {
    scenarioName,
    portfolioLossAmount: Math.round(totalLossAmount),
    portfolioLossPercent,
    shockedPortfolioValue: Math.round(shockedPortfolioValue),
    shockedVaR99,
    shockedES99,
    assetLossBreakdown,
  };
}
