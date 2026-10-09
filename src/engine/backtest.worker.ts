import { Portfolio, SimulationModelType } from '../types/risk';
import { runAllModelsBacktest, runRollingBacktest } from './backtest-runner';

self.onmessage = (
  event: MessageEvent<{
    type: 'single' | 'all';
    portfolio: Portfolio;
    model?: SimulationModelType;
    confidence?: number;
    sampleDays?: number;
    windowSize?: number;
  }>
) => {
  const { type, portfolio, model = 'gjr_garch', confidence = 0.99, sampleDays = 750, windowSize = 500 } = event.data;

  try {
    if (type === 'all') {
      const summary = runAllModelsBacktest(portfolio, confidence, sampleDays, windowSize);
      self.postMessage({ success: true, type: 'all', summary });
    } else {
      const result = runRollingBacktest(portfolio, model, confidence, sampleDays, windowSize);
      self.postMessage({ success: true, type: 'single', result });
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    self.postMessage({ success: false, error });
  }
};
