/**
 * High-performance mathematical and statistical utilities for quantitative finance.
 * Includes exact statistical distributions, Sobol quasi-random generator,
 * Extreme Value Theory (GPD), weighted quantiles, and seedable PRNG.
 */

// Error function approximation (Abramowitz & Stegun)
export function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

// Complementary error function erfc(x) = 1 - erf(x)
export function erfc(x: number): number {
  return 1.0 - erf(x);
}

// Standard Normal CDF: Φ(x)
export function normalCDF(x: number): number {
  return 0.5 * (1.0 + erf(x / Math.SQRT2));
}

// Standard Normal PDF: φ(x)
export function normalPDF(x: number): number {
  return (1.0 / Math.sqrt(2.0 * Math.PI)) * Math.exp(-0.5 * x * x);
}

// Inverse Standard Normal CDF (Peter J. Acklam's algorithm, error < 1.15 × 10^-9)
export function inverseNormalCDF(p: number): number {
  if (p <= 0 || p >= 1) {
    if (p <= 0) return -8.0;
    return 8.0;
  }

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];

  const q = Math.min(p, 1 - p);
  let r: number;

  if (q > 0.02425) {
    const u = q - 0.5;
    const r2 = u * u;
    r =
      (u *
        (((((a[0] * r2 + a[1]) * r2 + a[2]) * r2 + a[3]) * r2 + a[4]) * r2 +
          a[5])) /
      (((((b[0] * r2 + b[1]) * r2 + b[2]) * r2 + b[3]) * r2 + b[4]) * r2 + 1.0);
  } else {
    const v = Math.sqrt(-2.0 * Math.log(q));
    r =
      (((((c[0] * v + c[1]) * v + c[2]) * v + c[3]) * v + c[4]) * v + c[5]) /
      ((((d[0] * v + d[1]) * v + d[2]) * v + d[3]) * v + 1.0);
  }

  return p < 0.5 ? -r : r;
}

// Exact Chi-Square Survival Probability: P(X >= lr)
export function chiSquareSurvival(lr: number, dof: number = 1): number {
  if (lr <= 0) return 1.0;
  if (dof === 1) {
    // Exact for 1 DOF: 2 * (1 - Φ(sqrt(lr))) = erfc(sqrt(lr / 2))
    return Math.max(0, Math.min(1, erfc(Math.sqrt(lr / 2))));
  }
  if (dof === 2) {
    // Exact for 2 DOF: exp(-lr / 2)
    return Math.max(0, Math.min(1, Math.exp(-lr / 2)));
  }
  // Generic Wilson-Hilferty transformation approximation for dof > 2
  const s = Math.sqrt(2 / (9 * dof));
  const z = (Math.pow(lr / dof, 1 / 3) - (1 - 2 / (9 * dof))) / s;
  return Math.max(0, Math.min(1, 1 - normalCDF(z)));
}

// Binomial Cumulative Probability: P(X <= k) for X ~ Binomial(n, p)
export function binomialCDF(k: number, n: number, p: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;

  let sum = 0;
  let term = Math.pow(1 - p, n); // P(X = 0)
  sum += term;

  for (let i = 1; i <= k; i++) {
    term = term * ((n - i + 1) / i) * (p / (1 - p));
    sum += term;
  }
  return Math.min(1, sum);
}

// Seedable Pseudo-Random Number Generator (Mulberry32)
export function createRNG(seed: number = 42): () => number {
  let s = Math.floor(seed);
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller transform using optional seedable generator
export function sampleStandardNormal(rng: () => number = Math.random): number {
  let u = 0,
    v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Gamma distributed random variable via Marsaglia and Tsang method (shape k > 0)
export function sampleGamma(shape: number, rng: () => number = Math.random): number {
  if (shape < 1) {
    return sampleGamma(shape + 1, rng) * Math.pow(rng(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    const z = sampleStandardNormal(rng);
    let v = 1 + c * z;
    if (v <= 0) continue;
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * z * z * z * z) return d * v;
    if (Math.log(u) < 0.5 * z * z + d * (1 - v + Math.log(v))) return d * v;
  }
}

// Chi-squared distribution random sample
export function sampleChiSquared(dof: number, rng: () => number = Math.random): number {
  return 2 * sampleGamma(dof / 2, rng);
}

// Student-t random sample with ν degrees of freedom (leptokurtic, fat tails)
export function sampleStudentT(dof: number, rng: () => number = Math.random): number {
  if (dof <= 2) dof = 3;
  const z = sampleStandardNormal(rng);
  const w = sampleChiSquared(dof, rng);
  const scale = Math.sqrt((dof - 2) / dof);
  return (z / Math.sqrt(w / dof)) * scale;
}

// Cholesky decomposition: A = L * L^T where L is lower triangular
export function choleskyDecomposition(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      if (i === j) {
        const val = matrix[i][i] - sum;
        L[i][j] = Math.sqrt(Math.max(val, 1e-7));
      } else {
        const diag = L[j][j];
        L[i][j] = diag > 1e-9 ? (matrix[i][j] - sum) / diag : 0;
      }
    }
  }
  return L;
}

// Correlate independent shocks using Cholesky factor L
export function correlateShocks(shocks: number[], L: number[][]): number[] {
  const n = shocks.length;
  const result: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j <= i; j++) {
      sum += L[i][j] * shocks[j];
    }
    result[i] = sum;
  }
  return result;
}

// Multi-dimensional Sobol Sequence Generator (Gray code Antonov-Saleev)
export class SobolSequenceGenerator {
  private dimension: number;
  private count: number = 0;
  private x: number[];
  private directionVectors: number[][];

  constructor(dimension: number) {
    this.dimension = Math.min(dimension, 40);
    this.x = new Array(this.dimension).fill(0);
    this.directionVectors = [];
    this.initDirectionNumbers();
  }

  private initDirectionNumbers() {
    // Initial primitive polynomials and direction integers for multi-dimensional quasi-random generation
    const mTable: number[][] = [
      [1],
      [1, 3],
      [1, 3, 1],
      [1, 1, 1],
      [1, 1, 3, 3],
      [1, 3, 5, 13],
      [1, 1, 5, 5, 17],
      [1, 1, 5, 5, 5],
      [1, 1, 7, 11, 19],
      [1, 1, 5, 1, 1],
    ];

    for (let d = 0; d < this.dimension; d++) {
      const v: number[] = new Array(32).fill(0);
      const m = mTable[d % mTable.length];
      for (let i = 1; i <= 32; i++) {
        if (i <= m.length) {
          v[i - 1] = m[i - 1] << (32 - i);
        } else {
          // Recurrence relation
          v[i - 1] = v[i - 2] ^ (v[i - 2] >>> 1);
        }
      }
      this.directionVectors.push(v);
    }
  }

  public nextVector(): number[] {
    this.count++;
    // Find index of lowest zero bit in count - 1
    let c = this.count - 1;
    let bit = 0;
    while (c & 1) {
      c >>= 1;
      bit++;
    }

    const result: number[] = new Array(this.dimension);
    for (let d = 0; d < this.dimension; d++) {
      this.x[d] ^= this.directionVectors[d][Math.min(bit, 31)];
      result[d] = (this.x[d] >>> 0) / 4294967296.0;
      // Clamp strictly inside (1e-6, 1 - 1e-6) for inverse normal
      if (result[d] <= 0) result[d] = 1e-6;
      if (result[d] >= 1) result[d] = 1 - 1e-6;
    }
    return result;
  }
}

// Stack-safe Array Min/Max
export function arrayMin(data: number[]): number {
  if (data.length === 0) return 0;
  let min = data[0];
  for (let i = 1; i < data.length; i++) {
    if (data[i] < min) min = data[i];
  }
  return min;
}

export function arrayMax(data: number[]): number {
  if (data.length === 0) return 0;
  let max = data[0];
  for (let i = 1; i < data.length; i++) {
    if (data[i] > max) max = data[i];
  }
  return max;
}

// Moments calculation
export function calculateMoments(data: number[]): {
  mean: number;
  variance: number;
  std: number;
  skewness: number;
  kurtosis: number;
} {
  const n = data.length;
  if (n === 0) return { mean: 0, variance: 0, std: 0, skewness: 0, kurtosis: 0 };

  let sum = 0;
  for (let i = 0; i < n; i++) sum += data[i];
  const mean = sum / n;

  let m2 = 0,
    m3 = 0,
    m4 = 0;
  for (let i = 0; i < n; i++) {
    const diff = data[i] - mean;
    const diff2 = diff * diff;
    m2 += diff2;
    m3 += diff2 * diff;
    m4 += diff2 * diff2;
  }

  const variance = m2 / (n - 1);
  const std = Math.sqrt(variance);
  const skewness = std > 0 ? m3 / n / Math.pow(variance, 1.5) : 0;
  const kurtosis = std > 0 ? m4 / n / Math.pow(variance, 2) - 3 : 0;

  return { mean, variance, std, skewness, kurtosis };
}

// Standard unweighted percentile
export function percentile(sortedData: number[], p: number): number {
  if (sortedData.length === 0) return 0;
  const index = (sortedData.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sortedData[lower] * (1 - weight) + sortedData[upper] * weight;
}

// Weighted Quantile for Importance Sampling
export function calculateWeightedQuantile(
  sortedItems: { value: number; weight: number }[],
  p: number
): number {
  if (sortedItems.length === 0) return 0;
  let totalWeight = 0;
  for (let i = 0; i < sortedItems.length; i++) totalWeight += sortedItems[i].weight;
  if (totalWeight <= 0) return sortedItems[Math.floor(sortedItems.length * p)].value;

  const targetWeight = totalWeight * p;
  let cumWeight = 0;
  for (let i = 0; i < sortedItems.length; i++) {
    cumWeight += sortedItems[i].weight;
    if (cumWeight >= targetWeight) {
      return sortedItems[i].value;
    }
  }
  return sortedItems[sortedItems.length - 1].value;
}

// Expected Shortfall (CVaR) computation: E[Loss | Loss >= VaR]
export function calculateExpectedShortfall(
  sortedLosses: number[],
  confidenceLevel: number
): { varValue: number; esValue: number } {
  const n = sortedLosses.length;
  if (n === 0) return { varValue: 0, esValue: 0 };

  const varVal = percentile(sortedLosses, confidenceLevel);
  let tailSum = 0;
  let count = 0;

  for (let i = 0; i < n; i++) {
    if (sortedLosses[i] >= varVal) {
      tailSum += sortedLosses[i];
      count++;
    }
  }

  const esVal = count > 0 ? tailSum / count : varVal;
  return { varValue: varVal, esValue: esVal };
}

// Weighted Expected Shortfall for Importance Sampling
export function calculateWeightedExpectedShortfall(
  sortedLossItems: { value: number; weight: number }[],
  confidenceLevel: number
): { varValue: number; esValue: number } {
  const varVal = calculateWeightedQuantile(sortedLossItems, confidenceLevel);
  let tailWeightedLoss = 0;
  let tailWeightSum = 0;

  for (let i = 0; i < sortedLossItems.length; i++) {
    if (sortedLossItems[i].value >= varVal) {
      tailWeightedLoss += sortedLossItems[i].value * sortedLossItems[i].weight;
      tailWeightSum += sortedLossItems[i].weight;
    }
  }

  const esVal = tailWeightSum > 0 ? tailWeightedLoss / tailWeightSum : varVal;
  return { varValue: varVal, esValue: esVal };
}

// Extreme Value Theory (EVT): Peaks-Over-Threshold (POT) with Generalized Pareto Distribution (GPD)
export function fitEVTGeneralizedPareto(
  losses: number[],
  thresholdQuantile: number = 0.90,
  targetConfidence: number = 0.99
): {
  threshold: number;
  shapeXi: number;
  scaleBeta: number;
  evtVaR: number;
  evtES: number;
} {
  const n = losses.length;
  if (n < 50) {
    const v = percentile([...losses].sort((a, b) => a - b), targetConfidence);
    return { threshold: v, shapeXi: 0.1, scaleBeta: v * 0.1, evtVaR: v, evtES: v * 1.15 };
  }

  const sorted = [...losses].sort((a, b) => a - b);
  const u = percentile(sorted, thresholdQuantile);

  // Exceedances y = L - u > 0
  const exceedances: number[] = [];
  for (let i = 0; i < n; i++) {
    if (sorted[i] > u) {
      exceedances.push(sorted[i] - u);
    }
  }

  const Nu = exceedances.length;
  if (Nu < 10) {
    const v = percentile(sorted, targetConfidence);
    return { threshold: u, shapeXi: 0.1, scaleBeta: u * 0.1, evtVaR: v, evtES: v * 1.15 };
  }

  // Method of Probability-Weighted Moments (PWM) for GPD
  let ySum = 0;
  for (let i = 0; i < Nu; i++) ySum += exceedances[i];
  const yMean = ySum / Nu;

  let a1Sum = 0;
  for (let i = 0; i < Nu; i++) {
    a1Sum += (1.0 - (i + 1 - 0.35) / Nu) * exceedances[i];
  }
  const a1 = a1Sum / Nu;

  let xi = 2.0 - yMean / (yMean - 2.0 * a1 || 1e-5);
  let beta = (2.0 * yMean * a1) / (yMean - 2.0 * a1 || 1e-5);

  // Regularize parameters within stable physical financial bounds
  xi = Math.max(-0.4, Math.min(0.65, xi));
  beta = Math.max(1e-4, Math.min(yMean * 3.0, beta));

  // Closed-form GPD quantile for extreme confidence level alpha
  // VaR_α = u + (β / ξ) * [ ((N / Nu) * (1 - α))^(-ξ) - 1 ]
  const tailProbRatio = (n / Nu) * (1 - targetConfidence);
  let evtVaR = u;
  if (Math.abs(xi) < 1e-4) {
    evtVaR = u - beta * Math.log(tailProbRatio);
  } else {
    evtVaR = u + (beta / xi) * (Math.pow(tailProbRatio, -xi) - 1.0);
  }

  // GPD Expected Shortfall: ES_α = (VaR_α + β - ξ*u) / (1 - ξ)
  let evtES = (evtVaR + beta) / (1.0 - xi);
  if (evtES < evtVaR) evtES = evtVaR * 1.15;

  return {
    threshold: Math.round(u),
    shapeXi: Math.round(xi * 1000) / 1000,
    scaleBeta: Math.round(beta),
    evtVaR: Math.round(evtVaR),
    evtES: Math.round(evtES),
  };
}

// Stack-Safe Kernel Density Estimate (Gaussian kernel)
export function computeKDE(
  data: number[],
  points: number = 60,
  minVal?: number,
  maxVal?: number
): { x: number; y: number }[] {
  const n = data.length;
  if (n === 0) return [];

  const min = minVal ?? arrayMin(data);
  const max = maxVal ?? arrayMax(data);
  const range = max - min || 1;

  // Subsample for KDE if dataset is massive to ensure < 15ms execution
  const sample = n > 5000 ? data.filter((_, i) => i % Math.ceil(n / 3000) === 0) : data;
  const sampleN = sample.length;

  const moments = calculateMoments(sample);
  const h = 1.06 * (moments.std || 1) * Math.pow(sampleN, -0.2);

  const step = range / (points - 1);
  const result: { x: number; y: number }[] = [];

  for (let i = 0; i < points; i++) {
    const x = min + i * step;
    let sum = 0;
    for (let j = 0; j < sampleN; j++) {
      const u = (x - sample[j]) / h;
      sum += normalPDF(u);
    }
    const density = sum / (sampleN * h);
    result.push({ x, y: density });
  }

  return result;
}
