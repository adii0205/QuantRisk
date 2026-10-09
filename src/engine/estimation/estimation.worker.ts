import { Portfolio } from '../../types/risk';
import {
  estimatePortfolioParameters,
  EstimationOptions,
  runParameterRecoveryTests,
} from './index';

self.onmessage = (
  event: MessageEvent<{
    type: 'calibrate' | 'recovery_test';
    portfolio?: Portfolio;
    options?: EstimationOptions;
    replications?: number;
    sampleSize?: number;
  }>
) => {
  const { type, portfolio, options, replications, sampleSize } = event.data;

  try {
    if (type === 'recovery_test') {
      const report = runParameterRecoveryTests(replications ?? 50, sampleSize ?? 750);
      self.postMessage({ type: 'recovery_test_result', report });
    } else if (type === 'calibrate' && portfolio) {
      const result = estimatePortfolioParameters(portfolio, options);
      self.postMessage({ type: 'calibrate_result', result });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'error', error: message });
  }
};
