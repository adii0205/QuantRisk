import { PCG32 } from '../utils/rng';

/**
 * Multi-Curve Term Structure & One-Factor Hull-White Interest Rate Engine.
 * Implements:
 * 1. Zero-coupon curve bootstrapping from par yields (log-linear discount factors)
 * 2. Instantaneous forward rate curve f(0, t)
 * 3. 1-Factor Hull-White SDE: dr = (theta(t) - a*r)dt + sigma*dW
 * 4. Analytical Zero-Coupon Bond Pricing: P(t, T) = A(t, T) * exp(-B(t, T) * r_t)
 * 5. Exact transition distribution simulation for r_t
 * 6. Coupon bond repricing along stochastic short rate paths
 * 7. Econometric calibration of a (mean reversion) and sigma (volatility)
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

export interface ZeroCurveNode {
  tenor: string;
  maturityYears: number;
  parYield: number;
  discountFactor: number; // P(0, T)
  zeroRate: number; // r(0, T) continuously compounded
  forwardRate: number; // instantaneous forward rate f(0, T)
}

export interface BootstrappedZeroCurve {
  nodes: ZeroCurveNode[];
  getP0T: (T: number) => number;
  getF0T: (t: number) => number;
  getZeroRate: (T: number) => number;
}

export interface HullWhiteParameters {
  a: number; // speed of mean reversion (e.g. 0.05)
  sigma: number; // short rate volatility (e.g. 0.010 = 100 bps)
}

export interface CouponBondSpecification {
  id: string;
  name: string;
  couponRate: number; // annual coupon e.g. 0.0425 = 4.25%
  maturityYears: number; // e.g. 10.0
  frequency: number; // 2 = semi-annual, 1 = annual
  faceValue: number; // 100.0 or 1000.0
}

export interface BondSimulationResult {
  times: number[]; // observation times along the horizon
  shortRatePaths: number[][]; // [path][step]
  bondPricePaths: number[][]; // [path][step]
  terminalPrices: number[];
  meanTerminalPrice: number;
  initialPrice: number;
  priceStdDev: number;
  analyticalP0T: number;
}

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
        shock = dY * (1.6 - 0.9 * (m.maturityYears / 30));
        break;
      case 'bull_steepening':
        shock = -dY * (1.8 - 1.2 * (m.maturityYears / 30));
        break;
      case 'curve_inversion':
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

/**
 * 1. Bootstrap Zero Curve from Par Yields using standard Log-Linear Discount Factors
 */
export function bootstrapZeroCurve(
  curveMaturities: YieldCurveMaturity[] = generateBaseYieldCurve()
): BootstrappedZeroCurve {
  const sorted = [...curveMaturities].sort((a, b) => a.maturityYears - b.maturityYears);
  const nodes: ZeroCurveNode[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const T = item.maturityYears;
    const y = item.baseYield;

    let df = 0;
    if (T <= 1.0) {
      // Money market simple discount factor
      df = 1.0 / (1.0 + y * T);
    } else {
      // Coupon bond bootstrap: assume annual coupons equal to par yield
      let pvCoupons = 0;
      for (const prior of nodes) {
        if (prior.maturityYears < T) {
          pvCoupons += y * prior.discountFactor;
        }
      }
      df = Math.max(0.001, (1.0 - pvCoupons) / (1.0 + y));
    }

    const zeroRate = -Math.log(df) / T;

    // Instantaneous forward rate f(0, T)
    let fwd = zeroRate;
    if (i > 0) {
      const prev = nodes[i - 1];
      const dT = T - prev.maturityYears;
      fwd = -(Math.log(df) - Math.log(prev.discountFactor)) / dT;
    }

    nodes.push({
      tenor: item.tenor,
      maturityYears: T,
      parYield: y,
      discountFactor: df,
      zeroRate,
      forwardRate: fwd,
    });
  }

  // Interpolator for P(0, T) with log-linear discount factors
  const getP0T = (T: number): number => {
    if (T <= 0) return 1.0;
    if (T <= nodes[0].maturityYears) {
      const z0 = nodes[0].zeroRate;
      return Math.exp(-z0 * T);
    }
    const last = nodes[nodes.length - 1];
    if (T >= last.maturityYears) {
      const zLast = last.zeroRate;
      return Math.exp(-zLast * T);
    }

    // Bracket between node i and i+1
    for (let i = 0; i < nodes.length - 1; i++) {
      if (T >= nodes[i].maturityYears && T <= nodes[i + 1].maturityYears) {
        const t1 = nodes[i].maturityYears;
        const t2 = nodes[i + 1].maturityYears;
        const lnP1 = Math.log(nodes[i].discountFactor);
        const lnP2 = Math.log(nodes[i + 1].discountFactor);
        const theta = (T - t1) / (t2 - t1);
        const lnP = lnP1 + theta * (lnP2 - lnP1);
        return Math.exp(lnP);
      }
    }
    return Math.exp(-nodes[0].zeroRate * T);
  };

  // Interpolator for instantaneous forward rate f(0, t)
  const getF0T = (t: number): number => {
    const dt = 0.005; // 1.8 days
    const tUp = Math.max(0.001, t + dt);
    const tDown = Math.max(0, t - dt);
    const pUp = getP0T(tUp);
    const pDown = getP0T(tDown);
    return -(Math.log(pUp) - Math.log(pDown)) / (tUp - tDown);
  };

  const getZeroRate = (T: number): number => {
    if (T <= 1e-6) return getF0T(0);
    return -Math.log(getP0T(T)) / T;
  };

  return {
    nodes,
    getP0T,
    getF0T,
    getZeroRate,
  };
}

/**
 * 2. Hull-White B(t, T) function:
 * B(t, T) = (1 - exp(-a * (T - t))) / a
 * Limits to (T - t) as a -> 0
 */
export function hwCalculateB(a: number, t: number, T: number): number {
  const tau = Math.max(0, T - t);
  if (Math.abs(a) < 1e-6) {
    return tau;
  }
  return (1.0 - Math.exp(-a * tau)) / a;
}

/**
 * 3. Hull-White ln A(t, T) function:
 * ln A(t, T) = ln(P(0,T) / P(0,t)) + B(t,T) * f(0,t) - (sigma² / (4a)) * (1 - exp(-2at)) * B(t,T)²
 */
export function hwCalculateLnA(
  a: number,
  sigma: number,
  t: number,
  T: number,
  zeroCurve: BootstrappedZeroCurve
): number {
  if (t >= T) return 0;
  const p0t = zeroCurve.getP0T(t);
  const p0T = zeroCurve.getP0T(T);
  const f0t = zeroCurve.getF0T(t);
  const B = hwCalculateB(a, t, T);

  let varTerm = 0;
  if (Math.abs(a) < 1e-6) {
    varTerm = 0.5 * sigma * sigma * t * B * B;
  } else {
    varTerm = ((sigma * sigma) / (4.0 * a)) * (1.0 - Math.exp(-2.0 * a * t)) * (B * B);
  }

  return Math.log(p0T / p0t) + B * f0t - varTerm;
}

/**
 * Analytical Hull-White Zero-Coupon Bond Price P(t, T) given short rate r_t:
 * P(t, T) = A(t, T) * exp(-B(t, T) * r_t)
 */
export function hwBondPrice(
  rt: number,
  t: number,
  T: number,
  params: HullWhiteParameters,
  zeroCurve: BootstrappedZeroCurve
): number {
  if (t >= T) return 1.0;
  const B = hwCalculateB(params.a, t, T);
  const lnA = hwCalculateLnA(params.a, params.sigma, t, T, zeroCurve);
  return Math.exp(lnA - B * rt);
}

/**
 * Hull-White alpha(t) exact shift function:
 * alpha(t) = f(0, t) + (sigma² / (2a²)) * (1 - exp(-at))²
 */
export function hwAlpha(
  t: number,
  params: HullWhiteParameters,
  zeroCurve: BootstrappedZeroCurve
): number {
  const f0t = zeroCurve.getF0T(t);
  if (Math.abs(params.a) < 1e-6 || Math.abs(params.sigma) < 1e-6) {
    return f0t;
  }
  const factor = 1.0 - Math.exp(-params.a * t);
  return f0t + ((params.sigma * params.sigma) / (2.0 * params.a * params.a)) * (factor * factor);
}

/**
 * 4. Exact Transition Distribution Step for r_t:
 * r_t | r_s ~ Normal(mean, variance)
 * mean = r_s * exp(-a(t - s)) + alpha(t) - alpha(s) * exp(-a(t - s))
 * variance = (sigma² / (2a)) * (1 - exp(-2a(t - s)))
 */
export function hwExactTransition(
  rs: number,
  s: number,
  t: number,
  normalShock: number,
  params: HullWhiteParameters,
  zeroCurve: BootstrappedZeroCurve
): number {
  const dt = t - s;
  if (dt <= 0) return rs;

  const exp_adt = Math.exp(-params.a * dt);
  const alphaS = hwAlpha(s, params, zeroCurve);
  const alphaT = hwAlpha(t, params, zeroCurve);

  const mean = rs * exp_adt + alphaT - alphaS * exp_adt;

  let variance = 0;
  if (Math.abs(params.a) < 1e-6) {
    variance = params.sigma * params.sigma * dt;
  } else {
    variance = ((params.sigma * params.sigma) / (2.0 * params.a)) * (1.0 - Math.exp(-2.0 * params.a * dt));
  }

  const std = Math.sqrt(Math.max(1e-12, variance));
  return mean + std * normalShock;
}

/**
 * 5. Reprice Coupon Bond under Hull-White model at time t given short rate r_t:
 * Evaluates sum of discounted cash flows using exact analytical bond prices P(t, Tj)
 */
export function hwRepriceCouponBond(
  rt: number,
  t: number,
  bond: CouponBondSpecification,
  params: HullWhiteParameters,
  zeroCurve: BootstrappedZeroCurve
): number {
  const couponInterval = 1.0 / bond.frequency;
  const couponAmount = (bond.couponRate / bond.frequency) * bond.faceValue;

  let price = 0;
  let paymentTime = couponInterval;
  while (paymentTime <= bond.maturityYears + 1e-6) {
    if (paymentTime > t) {
      const df = hwBondPrice(rt, t, paymentTime, params, zeroCurve);
      price += couponAmount * df;
    }
    paymentTime += couponInterval;
  }

  // Add face value principal repayment at maturity
  const principalDf = hwBondPrice(rt, t, bond.maturityYears, params, zeroCurve);
  price += bond.faceValue * principalDf;

  return price;
}

/**
 * 6. Simulate Monte Carlo Hull-White Paths for Interest Rates & Bonds
 */
export function simulateHullWhiteBondPaths(
  bond: CouponBondSpecification,
  horizonDays: number = 21,
  numPaths: number = 2000,
  params: HullWhiteParameters = { a: 0.05, sigma: 0.01 },
  zeroCurve: BootstrappedZeroCurve = bootstrapZeroCurve(),
  seed: bigint = 4242n
): BondSimulationResult {
  const rng = new PCG32(seed);
  const horizonYears = horizonDays / 252;
  const numSteps = Math.max(5, Math.min(horizonDays, 25));
  const dt = horizonYears / numSteps;

  const times: number[] = [];
  for (let step = 0; step <= numSteps; step++) {
    times.push(step * dt);
  }

  const initialR = zeroCurve.getF0T(0);
  const initialPrice = hwRepriceCouponBond(initialR, 0, bond, params, zeroCurve);

  const shortRatePaths: number[][] = [];
  const bondPricePaths: number[][] = [];
  const terminalPrices: number[] = [];

  const maxRecordedPaths = 20;

  for (let p = 0; p < numPaths; p++) {
    let currentR = initialR;
    const rPath = [currentR];
    const bPath = [initialPrice];

    for (let step = 0; step < numSteps; step++) {
      const s = times[step];
      const t = times[step + 1];
      const z = rng.normal();
      currentR = hwExactTransition(currentR, s, t, z, params, zeroCurve);
      const bPrice = hwRepriceCouponBond(currentR, t, bond, params, zeroCurve);

      if (p < maxRecordedPaths) {
        rPath.push(currentR);
        bPath.push(bPrice);
      }
    }

    if (p < maxRecordedPaths) {
      shortRatePaths.push(rPath);
      bondPricePaths.push(bPath);
    }

    const termPrice = hwRepriceCouponBond(currentR, horizonYears, bond, params, zeroCurve);
    terminalPrices.push(termPrice);
  }

  const meanTerminalPrice =
    terminalPrices.reduce((acc, v) => acc + v, 0) / terminalPrices.length;

  const variance =
    terminalPrices.reduce((acc, v) => acc + Math.pow(v - meanTerminalPrice, 2), 0) /
    terminalPrices.length;

  return {
    times,
    shortRatePaths,
    bondPricePaths,
    terminalPrices,
    meanTerminalPrice: Math.round(meanTerminalPrice * 100) / 100,
    initialPrice: Math.round(initialPrice * 100) / 100,
    priceStdDev: Math.round(Math.sqrt(variance) * 100) / 100,
    analyticalP0T: Math.round(zeroCurve.getP0T(bond.maturityYears) * bond.faceValue * 100) / 100,
  };
}

/**
 * 7. Econometric Calibration of a and sigma from historical short-rate yields:
 * Discrete AR(1) regression: r_{t+1} - r_t = (theta_t - a * r_t) * dt + sigma * sqrt(dt) * eps
 */
export function calibrateHullWhiteFromHistory(
  historicalShortRates: number[],
  dt: number = 1 / 252
): HullWhiteParameters {
  const n = historicalShortRates.length;
  if (n < 20) {
    return { a: 0.05, sigma: 0.01 };
  }

  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dr = historicalShortRates[i + 1] - historicalShortRates[i];
    const rCurrent = historicalShortRates[i];
    x.push(rCurrent);
    y.push(dr);
  }

  const meanX = x.reduce((a, b) => a + b, 0) / x.length;
  const meanY = y.reduce((a, b) => a + b, 0) / y.length;

  let covXY = 0;
  let varX = 0;
  for (let i = 0; i < x.length; i++) {
    covXY += (x[i] - meanX) * (y[i] - meanY);
    varX += Math.pow(x[i] - meanX, 2);
  }

  const slope = varX > 0 ? covXY / varX : -0.05;
  const a = Math.max(0.005, Math.min(0.5, -slope / dt));

  // Residual variance gives sigma
  let sumResSq = 0;
  for (let i = 0; i < x.length; i++) {
    const fitted = slope * (x[i] - meanX) + meanY;
    const res = y[i] - fitted;
    sumResSq += res * res;
  }
  const resVar = sumResSq / Math.max(1, x.length - 2);
  const sigma = Math.max(0.002, Math.min(0.08, Math.sqrt(resVar / dt)));

  return {
    a: Math.round(a * 1000) / 1000,
    sigma: Math.round(sigma * 10000) / 10000,
  };
}
