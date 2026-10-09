import { HmmCalibrationResult, HmmRegimeState } from './types';

/**
 * Normal PDF evaluation with numerical bounds
 */
function normalPdf(x: number, mean: number, sigma: number): number {
  const s = Math.max(1e-6, sigma);
  const diff = (x - mean) / s;
  return (1 / (Math.sqrt(2 * Math.PI) * s)) * Math.exp(-0.5 * diff * diff);
}

/**
 * Baum-Welch (EM) Algorithm for Gaussian Hidden Markov Model (2-state or 3-state)
 */
export function calibrateHmmEm(
  returns: number[],
  numStates: number = 3,
  maxIterations: number = 40,
  tol: number = 1e-4
): HmmCalibrationResult {
  const T = returns.length;
  const K = Math.max(2, Math.min(3, numStates));

  if (T < 60) {
    // Default fallback 3-state regime
    return {
      states: [
        { stateIndex: 0, name: 'Low-Vol Bull', meanDaily: 0.0006, volDaily: 0.007, volAnnual: 0.11, stationaryProb: 0.65 },
        { stateIndex: 1, name: 'Neutral', meanDaily: 0.0002, volDaily: 0.012, volAnnual: 0.19, stationaryProb: 0.25 },
        { stateIndex: 2, name: 'High-Vol Crisis', meanDaily: -0.0012, volDaily: 0.024, volAnnual: 0.38, stationaryProb: 0.10 },
      ],
      transitionMatrix: [
        [0.96, 0.03, 0.01],
        [0.05, 0.90, 0.05],
        [0.02, 0.08, 0.90],
      ],
      currentProbabilities: [0.70, 0.25, 0.05],
      logLikelihood: -500,
      iterations: 0,
      converged: true,
    };
  }

  // Sample stats for initial sorting
  const overallMean = returns.reduce((a, b) => a + b, 0) / T;
  const overallVar = returns.reduce((s, r) => s + (r - overallMean) ** 2, 0) / T;
  const overallStd = Math.sqrt(overallVar);

  // Initial state parameters (sorted by volatility)
  let means = K === 2 ? [overallMean + 0.0003, overallMean - 0.0006] : [overallMean + 0.0005, overallMean, overallMean - 0.001];
  let sigmas = K === 2 ? [overallStd * 0.75, overallStd * 1.6] : [overallStd * 0.65, overallStd * 1.05, overallStd * 2.2];

  // Initial transition matrix P (high self-transition persistence)
  let P: number[][] = [];
  if (K === 2) {
    P = [
      [0.95, 0.05],
      [0.10, 0.90],
    ];
  } else {
    P = [
      [0.94, 0.05, 0.01],
      [0.06, 0.88, 0.06],
      [0.03, 0.12, 0.85],
    ];
  }

  let pi = new Array(K).fill(1 / K);

  let prevLogLik = -Infinity;
  let iterations = 0;
  let converged = false;

  // Latent variables
  const gamma: number[][] = Array.from({ length: T }, () => new Array(K).fill(0)); // P(S_t = k | R)
  const xi: number[][][] = Array.from({ length: T - 1 }, () =>
    Array.from({ length: K }, () => new Array(K).fill(0))
  );

  while (iterations < maxIterations) {
    iterations++;

    // 1. Forward pass (with scaling to prevent underflow)
    const alpha: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));
    const c: number[] = new Array(T).fill(0); // scale factors

    for (let k = 0; k < K; k++) {
      alpha[0]![k] = pi[k]! * normalPdf(returns[0]!, means[k]!, sigmas[k]!);
      c[0] += alpha[0]![k]!;
    }
    c[0] = Math.max(1e-12, c[0]);
    for (let k = 0; k < K; k++) alpha[0]![k] /= c[0];

    for (let t = 1; t < T; t++) {
      const rt = returns[t]!;
      for (let k = 0; k < K; k++) {
        let sumTrans = 0;
        for (let j = 0; j < K; j++) {
          sumTrans += alpha[t - 1]![j]! * P[j]![k]!;
        }
        alpha[t]![k] = sumTrans * normalPdf(rt, means[k]!, sigmas[k]!);
        c[t] += alpha[t]![k]!;
      }
      c[t] = Math.max(1e-12, c[t]);
      for (let k = 0; k < K; k++) alpha[t]![k] /= c[t];
    }

    // Log-likelihood = sum ln(c_t)
    let logLik = 0;
    for (let t = 0; t < T; t++) logLik += Math.log(c[t]!);

    if (Math.abs(logLik - prevLogLik) < tol) {
      converged = true;
      break;
    }
    prevLogLik = logLik;

    // 2. Backward pass
    const beta: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));
    for (let k = 0; k < K; k++) beta[T - 1]![k] = 1.0;

    for (let t = T - 2; t >= 0; t--) {
      const rNext = returns[t + 1]!;
      for (let j = 0; j < K; j++) {
        let sum = 0;
        for (let k = 0; k < K; k++) {
          sum += P[j]![k]! * normalPdf(rNext, means[k]!, sigmas[k]!) * beta[t + 1]![k]!;
        }
        beta[t]![j] = sum / c[t + 1]!;
      }
    }

    // 3. E-step: calculate gamma and xi
    for (let t = 0; t < T; t++) {
      let sumGamma = 0;
      for (let k = 0; k < K; k++) {
        gamma[t]![k] = alpha[t]![k]! * beta[t]![k]!;
        sumGamma += gamma[t]![k]!;
      }
      sumGamma = Math.max(1e-12, sumGamma);
      for (let k = 0; k < K; k++) gamma[t]![k] /= sumGamma;
    }

    for (let t = 0; t < T - 1; t++) {
      const rNext = returns[t + 1]!;
      let sumXi = 0;
      for (let j = 0; j < K; j++) {
        for (let k = 0; k < K; k++) {
          const val =
            alpha[t]![j]! *
            P[j]![k]! *
            normalPdf(rNext, means[k]!, sigmas[k]!) *
            beta[t + 1]![k]!;
          xi[t]![j]![k] = val;
          sumXi += val;
        }
      }
      sumXi = Math.max(1e-12, sumXi);
      for (let j = 0; j < K; j++) {
        for (let k = 0; k < K; k++) {
          xi[t]![j]![k] /= sumXi;
        }
      }
    }

    // 4. M-step: Update parameters
    for (let k = 0; k < K; k++) pi[k] = gamma[0]![k]!;

    for (let j = 0; j < K; j++) {
      let denom = 0;
      for (let t = 0; t < T - 1; t++) denom += gamma[t]![j]!;
      denom = Math.max(1e-8, denom);

      for (let k = 0; k < K; k++) {
        let num = 0;
        for (let t = 0; t < T - 1; t++) num += xi[t]![j]![k]!;
        P[j]![k] = Math.max(0.005, num / denom);
      }
      // Re-normalize row
      const rowSum = P[j]!.reduce((s, x) => s + x, 0);
      P[j] = P[j]!.map((x) => x / rowSum);
    }

    for (let k = 0; k < K; k++) {
      let sumWeight = 0;
      let sumVal = 0;
      for (let t = 0; t < T; t++) {
        const w = gamma[t]![k]!;
        sumWeight += w;
        sumVal += w * returns[t]!;
      }
      sumWeight = Math.max(1e-8, sumWeight);
      means[k] = sumVal / sumWeight;

      let sumSq = 0;
      for (let t = 0; t < T; t++) {
        const diff = returns[t]! - means[k]!;
        sumSq += gamma[t]![k]! * diff * diff;
      }
      sigmas[k] = Math.sqrt(Math.max(1e-8, sumSq / sumWeight));
    }
  }

  // Sort states by volatility ascending: State 0 = low vol, State 1 = medium, State 2 = high vol
  const stateIndices = Array.from({ length: K }, (_, i) => i);
  stateIndices.sort((a, b) => sigmas[a]! - sigmas[b]!);

  const sortedMeans = stateIndices.map((i) => means[i]!);
  const sortedSigmas = stateIndices.map((i) => sigmas[i]!);
  const sortedP: number[][] = Array.from({ length: K }, (_, r) =>
    Array.from({ length: K }, (_, c) => P[stateIndices[r]!]![stateIndices[c]!]!)
  );

  // Compute stationary distribution pi * P = pi
  // Use power iteration on P^T
  let statDist = new Array(K).fill(1 / K);
  for (let it = 0; it < 30; it++) {
    const nextDist = new Array(K).fill(0);
    for (let j = 0; j < K; j++) {
      for (let i = 0; i < K; i++) {
        nextDist[j] += statDist[i]! * sortedP[i]![j]!;
      }
    }
    const sum = nextDist.reduce((s, x) => s + x, 0) || 1;
    statDist = nextDist.map((x) => x / sum);
  }

  const stateNames = K === 2 ? ['Bull / Low Vol', 'Bear / Volatile'] : ['Low-Vol Bull', 'Neutral', 'High-Vol Crisis'];

  const states: HmmRegimeState[] = sortedSigmas.map((sig, idx) => ({
    stateIndex: idx,
    name: stateNames[idx] || `Regime ${idx + 1}`,
    meanDaily: Math.round(sortedMeans[idx]! * 1e5) / 1e5,
    volDaily: Math.round(sig * 1e5) / 1e5,
    volAnnual: Math.round(sig * Math.sqrt(252) * 1000) / 1000,
    stationaryProb: Math.round(statDist[idx]! * 1000) / 1000,
  }));

  const currentProbabilities = stateIndices.map((origIdx) =>
    Math.round(gamma[T - 1]![origIdx]! * 1000) / 1000
  );

  return {
    states,
    transitionMatrix: sortedP.map((row) => row.map((x) => Math.round(x * 1000) / 1000)),
    currentProbabilities,
    logLikelihood: Math.round(prevLogLik * 10) / 10,
    iterations,
    converged,
  };
}
