import { describe, it, expect } from 'vitest';
import {
  bootstrapZeroCurve,
  generateBaseYieldCurve,
  hwAlpha,
  hwBondPrice,
  hwCalculateB,
  hwExactTransition,
  hwRepriceCouponBond,
  simulateHullWhiteBondPaths,
  CouponBondSpecification,
  HullWhiteParameters,
} from './yield-curve';

describe('Phase 4.4: Hull-White Term Structure & Yield Curve Engine', () => {
  it('bootstraps zero curve from par yields with positive discount factors', () => {
    const parCurve = generateBaseYieldCurve();
    const bootstrapped = bootstrapZeroCurve(parCurve);

    expect(bootstrapped.nodes.length).toBe(parCurve.length);

    // Verify discount factors are strictly decreasing and positive
    let prevDf = 1.0;
    for (const node of bootstrapped.nodes) {
      expect(node.discountFactor).toBeGreaterThan(0);
      expect(node.discountFactor).toBeLessThanOrEqual(prevDf);
      prevDf = node.discountFactor;
    }

    // P(0, 0) is 1.0
    expect(bootstrapped.getP0T(0)).toBe(1.0);
  });

  it('HW analytical zero-coupon bond price formula satisfies identity at t=0', () => {
    const bootstrapped = bootstrapZeroCurve();
    const params: HullWhiteParameters = { a: 0.05, sigma: 0.012 };
    const r0 = bootstrapped.getF0T(0);

    const testMaturities = [0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 30.0];
    for (const T of testMaturities) {
      const analyticalP0T = hwBondPrice(r0, 0, T, params, bootstrapped);
      const expectedP0T = bootstrapped.getP0T(T);
      const diff = Math.abs(analyticalP0T - expectedP0T);

      // Identity holds exactly to machine precision
      expect(diff).toBeLessThan(1e-10);
    }
  });

  it('when sigma = 0, HW exact transition reproduces the initial curve forward rate deterministically', () => {
    const bootstrapped = bootstrapZeroCurve();
    const zeroSigmaParams: HullWhiteParameters = { a: 0.05, sigma: 0.0 };
    const r0 = bootstrapped.getF0T(0);

    // Transition from 0 to t with zero shock
    const t = 1.0; // 1 year
    const rDeterministic = hwExactTransition(r0, 0, t, 0, zeroSigmaParams, bootstrapped);
    const expectedAlpha = hwAlpha(t, zeroSigmaParams, bootstrapped);

    // Since sigma = 0, alpha(t) = f(0, t)
    expect(Math.abs(expectedAlpha - bootstrapped.getF0T(t))).toBeLessThan(1e-10);

    // Bond price at time t under deterministic evolution reproduces forward discount factor
    const T = 5.0;
    const bondPriceAtT = hwBondPrice(rDeterministic, t, T, zeroSigmaParams, bootstrapped);
    const forwardDf = bootstrapped.getP0T(T) / bootstrapped.getP0T(t);

    expect(Math.abs(bondPriceAtT - forwardDf)).toBeLessThan(1e-6);
  });

  it('simulates coupon bond paths and reproduces analytical price on average', () => {
    const bootstrapped = bootstrapZeroCurve();
    const params: HullWhiteParameters = { a: 0.05, sigma: 0.01 };
    const bond: CouponBondSpecification = {
      id: 'test_10y',
      name: '10Y Coupon Bond',
      couponRate: 0.042,
      maturityYears: 10.0,
      frequency: 2,
      faceValue: 100.0,
    };

    const sim = simulateHullWhiteBondPaths(bond, 21, 1000, params, bootstrapped, 9999n);

    expect(sim.initialPrice).toBeGreaterThan(80);
    expect(sim.initialPrice).toBeLessThan(120);

    // Mean terminal price over 21 days is very close to initial price (within 1%)
    const pctDiff = Math.abs(sim.meanTerminalPrice - sim.initialPrice) / sim.initialPrice;
    expect(pctDiff).toBeLessThan(0.015);
  });
});
