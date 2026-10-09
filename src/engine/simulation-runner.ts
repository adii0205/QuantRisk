import { Portfolio, SimulationConfig, SimulationResult } from '../types/risk';
import { runPortfolioSimulation } from './models';

let activeWorker: Worker | null = null;

function getWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (!activeWorker) {
    try {
      activeWorker = new Worker(
        new URL('./simulation.worker.ts', import.meta.url),
        { type: 'module' }
      );
    } catch {
      activeWorker = null;
    }
  }
  return activeWorker;
}

export function runSimulationAsync(
  portfolio: Portfolio,
  config: SimulationConfig
): Promise<SimulationResult> {
  return new Promise((resolve) => {
    const worker = getWorker();

    if (worker) {
      let isSettled = false;

      const handleMessage = (e: MessageEvent) => {
        if (isSettled) return;
        isSettled = true;
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);

        if (e.data?.success && e.data?.result) {
          resolve(e.data.result);
        } else {
          // Fallback to synchronous execution if worker returned an error
          try {
            resolve(runPortfolioSimulation(portfolio, config));
          } catch {
            // Guarantee resolution
            resolve(runPortfolioSimulation(portfolio, config));
          }
        }
      };

      const handleError = () => {
        if (isSettled) return;
        isSettled = true;
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        // Fallback to main thread execution
        setTimeout(() => {
          resolve(runPortfolioSimulation(portfolio, config));
        }, 10);
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);

      worker.postMessage({ portfolio, config });
    } else {
      // Chunked or deferred async execution on main thread to keep UI interactive
      setTimeout(() => {
        const result = runPortfolioSimulation(portfolio, config);
        resolve(result);
      }, 10);
    }
  });
}
