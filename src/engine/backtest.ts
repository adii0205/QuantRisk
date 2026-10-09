import { KupiecBacktestResult, Portfolio, SimulationModelType } from '../types/risk';
import { runRollingBacktest, RollingBacktestResult, runAllModelsBacktest, MultiModelBacktestSummary } from './backtest-runner';

export type { RollingBacktestResult, MultiModelBacktestSummary };
export { runAllModelsBacktest };

let activeBacktestWorker: Worker | null = null;

function getBacktestWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (!activeBacktestWorker) {
    try {
      activeBacktestWorker = new Worker(
        new URL('./backtest.worker.ts', import.meta.url),
        { type: 'module' }
      );
    } catch {
      activeBacktestWorker = null;
    }
  }
  return activeBacktestWorker;
}

/**
 * Asynchronously runs a rolling out-of-sample backtest using Web Worker.
 */
export function runRollingBacktestAsync(
  portfolio: Portfolio,
  model: SimulationModelType,
  confidenceLevel: number = 0.99,
  sampleDays: number = 750,
  windowSize: number = 500
): Promise<RollingBacktestResult> {
  return new Promise((resolve) => {
    const worker = getBacktestWorker();
    if (worker) {
      let settled = false;
      const handleMessage = (e: MessageEvent) => {
        if (settled) return;
        settled = true;
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        if (e.data?.success && e.data?.result) {
          resolve(e.data.result);
        } else {
          resolve(runRollingBacktest(portfolio, model, confidenceLevel, sampleDays, windowSize));
        }
      };

      const handleError = () => {
        if (settled) return;
        settled = true;
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        resolve(runRollingBacktest(portfolio, model, confidenceLevel, sampleDays, windowSize));
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);

      worker.postMessage({
        type: 'single',
        portfolio,
        model,
        confidence: confidenceLevel,
        sampleDays,
        windowSize,
      });
    } else {
      setTimeout(() => {
        resolve(runRollingBacktest(portfolio, model, confidenceLevel, sampleDays, windowSize));
      }, 10);
    }
  });
}

/**
 * Asynchronously runs backtests for all 9 models and ranks them via MCS.
 */
export function runAllModelsBacktestAsync(
  portfolio: Portfolio,
  confidenceLevel: number = 0.99,
  sampleDays: number = 750,
  windowSize: number = 500
): Promise<MultiModelBacktestSummary> {
  return new Promise((resolve) => {
    const worker = getBacktestWorker();
    if (worker) {
      let settled = false;
      const handleMessage = (e: MessageEvent) => {
        if (settled) return;
        settled = true;
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        if (e.data?.success && e.data?.summary) {
          resolve(e.data.summary);
        } else {
          resolve(runAllModelsBacktest(portfolio, confidenceLevel, sampleDays, windowSize));
        }
      };

      const handleError = () => {
        if (settled) return;
        settled = true;
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        resolve(runAllModelsBacktest(portfolio, confidenceLevel, sampleDays, windowSize));
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);

      worker.postMessage({
        type: 'all',
        portfolio,
        confidence: confidenceLevel,
        sampleDays,
        windowSize,
      });
    } else {
      setTimeout(() => {
        resolve(runAllModelsBacktest(portfolio, confidenceLevel, sampleDays, windowSize));
      }, 10);
    }
  });
}

/**
 * Backward compatibility wrapper for synchronous callers.
 * Adapts RollingBacktestResult into KupiecBacktestResult interface.
 */
export function runKupiecBacktest(
  portfolio: Portfolio,
  model: SimulationModelType,
  confidenceLevel: number = 0.99,
  sampleDays: number = 750
): KupiecBacktestResult {
  const res = runRollingBacktest(portfolio, model, confidenceLevel, sampleDays, Math.min(500, Math.floor(sampleDays * 0.67)));
  return {
    confidenceLevel: res.confidenceLevel,
    totalObservations: res.evalDays,
    expectedBreaches: res.expectedBreaches,
    actualBreaches: res.actualBreaches,
    breachRate: res.breachRate,
    likelihoodRatioPOF: res.likelihoodRatioPOF,
    pValuePOF: res.pValuePOF,
    christoffersenLR: res.christoffersenLR,
    christoffersenPValue: res.christoffersenPValue,
    conditionalCoverageLR: res.conditionalCoverageLR,
    conditionalCoveragePValue: res.conditionalCoveragePValue,
    baselZone: res.baselZone,
    historicalVaRSeries: res.historicalVaRSeries,
    historicalPnLSeries: res.historicalPnLSeries,
    breachIndices: res.breachIndices,
  };
}
