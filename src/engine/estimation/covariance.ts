import { CovarianceEstimationResult, CovarianceMethod } from './types';

/**
 * Estimate sample covariance and correlation matrices
 */
export function estimateSampleCovariance(
  returnsMatrix: number[][], // [T][N]
  symbols: string[]
): CovarianceEstimationResult {
  const T = returnsMatrix.length;
  const N = symbols.length;

  // Means
  const means: number[] = new Array(N).fill(0);
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < N; i++) {
      means[i] += returnsMatrix[t]![i]!;
    }
  }
  for (let i = 0; i < N; i++) means[i] /= T;

  // Sample covariance S
  const S: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < N; i++) {
      const devI = returnsMatrix[t]![i]! - means[i]!;
      for (let j = 0; j < N; j++) {
        const devJ = returnsMatrix[t]![j]! - means[j]!;
        S[i]![j] += devI * devJ;
      }
    }
  }
  const denom = Math.max(1, T - 1);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      S[i]![j] /= denom;
    }
  }

  // Correlation matrix
  const corr: number[][] = Array.from({ length: N }, () => new Array(N).fill(1));
  const stds = S.map((row, i) => Math.sqrt(Math.max(1e-8, row[i]!)));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === j) corr[i]![j] = 1.0;
      else {
        const r = S[i]![j]! / (stds[i]! * stds[j]! || 1);
        corr[i]![j] = Math.max(-0.999, Math.min(0.999, r));
      }
    }
  }

  const cond = estimateConditionNumber(S);

  return {
    method: 'sample',
    symbols,
    covarianceMatrix: S,
    correlationMatrix: corr,
    conditionNumber: cond,
  };
}

/**
 * Ledoit-Wolf Analytical Shrinkage Estimator (Ledoit & Wolf 2004)
 * Shrinks sample covariance matrix S towards a structured target F:
 * \Sigma_{LW} = \hat{\delta}^* F + (1 - \hat{\delta}^*) S
 * Target F is the constant-correlation model.
 * Guaranteed strictly positive-definite and well-conditioned.
 */
export function estimateLedoitWolfCovariance(
  returnsMatrix: number[][],
  symbols: string[]
): CovarianceEstimationResult {
  const sample = estimateSampleCovariance(returnsMatrix, symbols);
  const S = sample.covarianceMatrix;
  const T = returnsMatrix.length;
  const N = symbols.length;

  if (N <= 1) {
    return {
      ...sample,
      method: 'ledoit_wolf',
      shrinkageIntensity: 0,
    };
  }

  // Demeaned returns
  const means: number[] = new Array(N).fill(0);
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < N; i++) means[i] += returnsMatrix[t]![i]!;
  }
  for (let i = 0; i < N; i++) means[i] /= T;

  const demeaned: number[][] = returnsMatrix.map((row) =>
    row.map((val, i) => val - means[i]!)
  );

  // Variances & average correlation r_bar
  const sampleVar = S.map((row, i) => row[i]!);
  const sampleStd = sampleVar.map((v) => Math.sqrt(Math.max(1e-8, v)));

  let sumCorr = 0;
  let countCorr = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      sumCorr += sample.correlationMatrix[i]![j]!;
      countCorr++;
    }
  }
  const rBar = countCorr > 0 ? sumCorr / countCorr : 0;

  // Prior shrinkage target F (constant correlation target)
  const F: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === j) F[i]![j] = S[i]![j]!;
      else F[i]![j] = rBar * sampleStd[i]! * sampleStd[j]!;
    }
  }

  // Estimate pi-hat (sum of asymptotic variances of sample covariance elements)
  let piHat = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      let sumT = 0;
      for (let t = 0; t < T; t++) {
        const prod = demeaned[t]![i]! * demeaned[t]![j]! - S[i]![j]!;
        sumT += prod * prod;
      }
      piHat += sumT / T;
    }
  }

  // Estimate gamma-hat (Frobenius distance ||S - F||^2)
  let gammaHat = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const diff = S[i]![j]! - F[i]![j]!;
      gammaHat += diff * diff;
    }
  }

  // Estimate rho-hat
  let rhoHat = 0;
  for (let i = 0; i < N; i++) {
    let sumDiag = 0;
    for (let t = 0; t < T; t++) {
      const term = demeaned[t]![i]! * demeaned[t]![i]! - S[i]![i]!;
      sumDiag += term * term;
    }
    rhoHat += sumDiag / T;
  }

  // Optimal shrinkage intensity delta-hat in [0, 1]
  const kappaHat = (piHat - rhoHat) / Math.max(1e-9, gammaHat);
  const deltaHat = Math.max(0, Math.min(1, kappaHat / T));

  // Shrunk covariance matrix: Sigma = delta * F + (1 - delta) * S
  const Sigma: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      Sigma[i]![j] = deltaHat * F[i]![j]! + (1 - deltaHat) * S[i]![j]!;
    }
  }

  // Shrunk correlation matrix
  const corr: number[][] = Array.from({ length: N }, () => new Array(N).fill(1));
  const newStds = Sigma.map((row, i) => Math.sqrt(Math.max(1e-8, row[i]!)));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === j) corr[i]![j] = 1.0;
      else {
        const r = Sigma[i]![j]! / (newStds[i]! * newStds[j]! || 1);
        corr[i]![j] = Math.max(-0.999, Math.min(0.999, r));
      }
    }
  }

  const cond = estimateConditionNumber(Sigma);

  return {
    method: 'ledoit_wolf',
    symbols,
    covarianceMatrix: Sigma,
    correlationMatrix: corr,
    shrinkageIntensity: Math.round(deltaHat * 1000) / 1000,
    conditionNumber: cond,
  };
}

/**
 * Exponentially Weighted Moving Average (EWMA RiskMetrics \lambda = 0.94)
 */
export function estimateEwmaCovariance(
  returnsMatrix: number[][],
  symbols: string[],
  lambda: number = 0.94
): CovarianceEstimationResult {
  const T = returnsMatrix.length;
  const N = symbols.length;

  const Sigma: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));

  // Initialize with first 30 days sample covariance
  const initWindow = Math.min(30, T);
  for (let t = 0; t < initWindow; t++) {
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        Sigma[i]![j] += (returnsMatrix[t]![i]! * returnsMatrix[t]![j]!) / initWindow;
      }
    }
  }

  // EWMA recursion: Sigma_t = lambda * Sigma_{t-1} + (1 - lambda) * r_{t-1} r_{t-1}^T
  for (let t = initWindow; t < T; t++) {
    for (let i = 0; i < N; i++) {
      const ri = returnsMatrix[t]![i]!;
      for (let j = 0; j < N; j++) {
        const rj = returnsMatrix[t]![j]!;
        Sigma[i]![j] = lambda * Sigma[i]![j]! + (1 - lambda) * (ri * rj);
      }
    }
  }

  // Build correlation
  const corr: number[][] = Array.from({ length: N }, () => new Array(N).fill(1));
  const stds = Sigma.map((row, i) => Math.sqrt(Math.max(1e-8, row[i]!)));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === j) corr[i]![j] = 1.0;
      else {
        const r = Sigma[i]![j]! / (stds[i]! * stds[j]! || 1);
        corr[i]![j] = Math.max(-0.999, Math.min(0.999, r));
      }
    }
  }

  const cond = estimateConditionNumber(Sigma);

  return {
    method: 'ewma',
    symbols,
    covarianceMatrix: Sigma,
    correlationMatrix: corr,
    ewmaLambda: lambda,
    conditionNumber: cond,
  };
}

/**
 * Approximate matrix condition number (Ratio of largest to smallest eigenvalue estimate)
 */
function estimateConditionNumber(matrix: number[][]): number {
  const n = matrix.length;
  if (n <= 1) return 1.0;

  // Power iteration for largest eigenvalue
  let v = new Array(n).fill(1 / Math.sqrt(n));
  let lambdaMax = 1.0;
  for (let iter = 0; iter < 15; iter++) {
    const Av: number[] = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        Av[i] += matrix[i]![j]! * v[j]!;
      }
    }
    const norm = Math.sqrt(Av.reduce((s, x) => s + x * x, 0)) || 1e-8;
    lambdaMax = norm;
    v = Av.map((x) => x / norm);
  }

  // Smallest eigenvalue estimated via Gershgorin / diagonal minimum
  const minDiag = Math.min(...matrix.map((row, i) => Math.abs(row[i]!)));
  const lambdaMin = Math.max(1e-7, minDiag * 0.15);

  return Math.round((lambdaMax / lambdaMin) * 10) / 10;
}
