import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { runPortfolioSimulation } from './models';
import { Portfolio, SimulationConfig } from '../types/risk';

describe('Phase 0.2: Fast-Check Property-Based Invariant Tests', () => {
  it('Property: VaR is monotone in confidence level (VaR99 >= VaR95 >= VaR90)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 0.4, noNaN: true }), // volatility
        fc.double({ min: -0.05, max: 0.15, noNaN: true }), // expected return
        (vol, ret) => {
          const portfolio: Portfolio = {
            id: 'test_port',
            name: 'Test Portfolio',
            description: 'Property test portfolio',
            cashWeight: 0,
            leverage: 1.0,
            totalCapital: 100000,
            assets: [
              {
                symbol: 'A1',
                name: 'Asset 1',
                category: 'Equity',
                weight: 1.0,
                currentPrice: 100,
                expectedAnnualReturn: ret,
                annualVolatility: vol,
                historicalReturns: new Array(252).fill(0),
              },
            ],
          };

          const config: SimulationConfig = {
            model: 'gbm',
            paths: 4000,
            timeHorizonDays: 21,
            varianceReduction: 'sobol_qmc',
            hardwareEngine: 'cpu_single',
            confidenceLevels: [0.90, 0.95, 0.99, 0.995],
          };

          const res = runPortfolioSimulation(portfolio, config);
          const rm = res.riskMetrics;

          // Monotonicity property: VaR995 >= VaR99 >= VaR95 >= VaR90
          expect(rm.var95).toBeGreaterThanOrEqual(rm.var90);
          expect(rm.var99).toBeGreaterThanOrEqual(rm.var95);
          expect(rm.var995).toBeGreaterThanOrEqual(rm.var99);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Property: Expected Shortfall is strictly greater than or equal to VaR (ES >= VaR)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 0.35, noNaN: true }),
        (vol) => {
          const portfolio: Portfolio = {
            id: 'test_port',
            name: 'Test Portfolio',
            description: 'Property test portfolio',
            cashWeight: 0,
            leverage: 1.0,
            totalCapital: 100000,
            assets: [
              {
                symbol: 'A1',
                name: 'Asset 1',
                category: 'Equity',
                weight: 1.0,
                currentPrice: 100,
                expectedAnnualReturn: 0.05,
                annualVolatility: vol,
                historicalReturns: new Array(252).fill(0),
              },
            ],
          };

          const config: SimulationConfig = {
            model: 'student_t',
            paths: 4000,
            timeHorizonDays: 21,
            varianceReduction: 'antithetic',
            hardwareEngine: 'cpu_single',
            confidenceLevels: [0.90, 0.95, 0.99],
            studentTDof: 5,
          };

          const res = runPortfolioSimulation(portfolio, config);
          const rm = res.riskMetrics;

          // ES >= VaR at every confidence level
          expect(rm.es90).toBeGreaterThanOrEqual(rm.var90);
          expect(rm.es95).toBeGreaterThanOrEqual(rm.var95);
          expect(rm.es99).toBeGreaterThanOrEqual(rm.var99);
        }
      ),
      { numRuns: 10 }
    );
  });

  it('Property: Doubling capital doubles dollar VaR linearly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 50000, max: 500000 }),
        (capital) => {
          const createPort = (cap: number): Portfolio => ({
            id: 'cap_test',
            name: 'Capital Scale Test',
            description: 'Scale test',
            cashWeight: 0,
            leverage: 1.0,
            totalCapital: cap,
            assets: [
              {
                symbol: 'A1',
                name: 'Asset 1',
                category: 'Equity',
                weight: 1.0,
                currentPrice: 100,
                expectedAnnualReturn: 0.08,
                annualVolatility: 0.20,
                historicalReturns: new Array(252).fill(0),
              },
            ],
          });

          const config: SimulationConfig = {
            model: 'gbm',
            paths: 4000,
            timeHorizonDays: 21,
            varianceReduction: 'sobol_qmc',
            hardwareEngine: 'cpu_single',
            confidenceLevels: [0.95, 0.99],
          };

          const res1 = runPortfolioSimulation(createPort(capital), config);
          const res2 = runPortfolioSimulation(createPort(capital * 2), config);

          // VaR scales linearly with capital: VaR(2 * C) ≈ 2 * VaR(C)
          const ratio = res2.riskMetrics.var99 / res1.riskMetrics.var99;
          expect(Math.abs(ratio - 2.0)).toBeLessThan(0.01);
        }
      ),
      { numRuns: 8 }
    );
  });

  it('Property: Zero volatility gives deterministic VaR = -drift', () => {
    const capital = 100000;
    const mu = 0.12; // 12% annual return
    const days = 21;
    const dt = days / 252;
    const expectedDriftDollar = capital * (Math.exp(mu * dt) - 1);

    const portfolio: Portfolio = {
      id: 'zero_vol',
      name: 'Zero Vol Portfolio',
      description: 'Zero volatility test',
      cashWeight: 0,
      leverage: 1.0,
      totalCapital: capital,
      assets: [
        {
          symbol: 'A1',
          name: 'Zero Vol Asset',
          category: 'Fixed Income',
          weight: 1.0,
          currentPrice: 100,
          expectedAnnualReturn: mu,
          annualVolatility: 0.00001, // ~0 vol
          historicalReturns: new Array(252).fill(0),
        },
      ],
    };

    const config: SimulationConfig = {
      model: 'gbm',
      paths: 2000,
      timeHorizonDays: days,
      varianceReduction: 'sobol_qmc',
      hardwareEngine: 'cpu_single',
      confidenceLevels: [0.95, 0.99],
    };

    const res = runPortfolioSimulation(portfolio, config);
    // When drift > 0 and vol = 0, VaR is negative (a gain): VaR ≈ -expectedDrift
    const expectedVaR = -expectedDriftDollar;
    expect(Math.abs(res.riskMetrics.var99 - expectedVaR)).toBeLessThan(50);
  });
});
