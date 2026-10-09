import { Portfolio, SimulationConfig } from '../types/risk';
import { runPortfolioSimulation } from './models';

// Web Worker for asynchronous Monte Carlo risk simulation
self.onmessage = (event: MessageEvent<{ portfolio: Portfolio; config: SimulationConfig }>) => {
  const { portfolio, config } = event.data;
  try {
    const result = runPortfolioSimulation(portfolio, config);
    self.postMessage({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ success: false, error: message });
  }
};
