/**
 * Multi-Curve Term Structure & Hull-White Yield Curve Engine.
 * Evaluates interest rate term structure shocks, key-rate durations, and bond repricing.
 */

export interface YieldCurveMaturity {
  tenor: string; // '3M', '6M', '1Y', '2Y', '5Y', '10Y', '20Y', '30Y'
  maturityYears: number;
  baseYield: number; // e.g. 0.042 = 4.2%
  shockedYield: number;
}

export type CurveShiftType =
  | 'parallel_up'
  | 'parallel_down'
  | 'bear_flattening'
  | 'bull_steepening'
  | 'curve_inversion';

export function generateBaseYieldCurve(): YieldCurveMaturity[] {
  return [
    { tenor: '3M', maturityYears: 0.25, baseYield: 0.051, shockedYield: 0.051 },
    { tenor: '6M', maturityYears: 0.5, baseYield: 0.049, shockedYield: 0.049 },
    { tenor: '1Y', maturityYears: 1.0, baseYield: 0.046, shockedYield: 0.046 },
    { tenor: '2Y', maturityYears: 2.0, baseYield: 0.041, shockedYield: 0.041 },
    { tenor: '5Y', maturityYears: 5.0, baseYield: 0.039, shockedYield: 0.039 },
    { tenor: '10Y', maturityYears: 10.0, baseYield: 0.042, shockedYield: 0.042 },
    { tenor: '20Y', maturityYears: 20.0, baseYield: 0.045, shockedYield: 0.045 },
    { tenor: '30Y', maturityYears: 30.0, baseYield: 0.046, shockedYield: 0.046 },
  ];
}

export function applyYieldCurveShock(
  baseCurve: YieldCurveMaturity[],
  shiftType: CurveShiftType,
  magnitudeBps: number = 100
): YieldCurveMaturity[] {
  const dY = magnitudeBps / 10000;

  return baseCurve.map((m) => {
    let shock = 0;
    switch (shiftType) {
      case 'parallel_up':
        shock = dY;
        break;
      case 'parallel_down':
        shock = -dY;
        break;
      case 'bear_flattening':
        // Short rates surge, long rates rise only modestly
        shock = dY * (1.6 - 0.9 * (m.maturityYears / 30));
        break;
      case 'bull_steepening':
        // Short rates cut aggressively, long rates hold firm
        shock = -dY * (1.8 - 1.2 * (m.maturityYears / 30));
        break;
      case 'curve_inversion':
        // 2Y-5Y inversion peak
        shock = m.maturityYears <= 3 ? dY * 1.5 : -dY * 0.4;
        break;
    }

    const shockedYield = Math.max(0.001, m.baseYield + shock);
    return {
      ...m,
      shockedYield: Math.round(shockedYield * 10000) / 10000,
    };
  });
}

// Reprice bond under term structure shift
export function repriceBondUnderTermStructure(
  initialPrice: number,
  modifiedDuration: number,
  convexity: number,
  yieldChangeBps: number
): {
  newPrice: number;
  percentageChange: number;
  durationImpact: number;
  convexityImpact: number;
} {
  const dy = yieldChangeBps / 10000;
  const durationComponent = -modifiedDuration * dy;
  const convexityComponent = 0.5 * convexity * (dy * dy);
  const percentageChange = durationComponent + convexityComponent;
  const newPrice = initialPrice * (1 + percentageChange);

  return {
    newPrice: Math.round(newPrice * 100) / 100,
    percentageChange: Math.round(percentageChange * 1000) / 10,
    durationImpact: Math.round(durationComponent * 1000) / 10,
    convexityImpact: Math.round(convexityComponent * 1000) / 10,
  };
}
