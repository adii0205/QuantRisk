import { Portfolio } from '../../types/risk';
import {
  PortfolioCalibrationResult,
  RecoveryTestReport,
  EstimationOptions,
  estimatePortfolioParameters,
  runParameterRecoveryTests,
} from './index';

/**
 * Execute portfolio econometric calibration asynchronously in a Web Worker
 */
export async function runPortfolioCalibrationAsync(
  portfolio: Portfolio,
  options?: EstimationOptions
): Promise<PortfolioCalibrationResult> {
  if (typeof Worker !== 'undefined') {
    return new Promise((resolve) => {
      try {
        const worker = new Worker(
          new URL('./estimation.worker.ts', import.meta.url),
          { type: 'module' }
        );

        worker.onmessage = (e) => {
          if (e.data.type === 'calibrate_result') {
            resolve(e.data.result);
          } else {
            // fallback
            resolve(estimatePortfolioParameters(portfolio, options));
          }
          worker.terminate();
        };

        worker.onerror = () => {
          resolve(estimatePortfolioParameters(portfolio, options));
          worker.terminate();
        };

        worker.postMessage({ type: 'calibrate', portfolio, options });
      } catch {
        resolve(estimatePortfolioParameters(portfolio, options));
      }
    });
  }

  return estimatePortfolioParameters(portfolio, options);
}

/**
 * Execute 50-replication parameter recovery verification in a Web Worker
 */
export async function runParameterRecoveryTestsAsync(
  replications: number = 50,
  sampleSize: number = 750
): Promise<RecoveryTestReport> {
  if (typeof Worker !== 'undefined') {
    return new Promise((resolve) => {
      try {
        const worker = new Worker(
          new URL('./estimation.worker.ts', import.meta.url),
          { type: 'module' }
        );

        worker.onmessage = (e) => {
          if (e.data.type === 'recovery_test_result') {
            resolve(e.data.report);
          } else {
            resolve(runParameterRecoveryTests(replications, sampleSize));
          }
          worker.terminate();
        };

        worker.onerror = () => {
          resolve(runParameterRecoveryTests(replications, sampleSize));
          worker.terminate();
        };

        worker.postMessage({ type: 'recovery_test', replications, sampleSize });
      } catch {
        resolve(runParameterRecoveryTests(replications, sampleSize));
      }
    });
  }

  return runParameterRecoveryTests(replications, sampleSize);
}
