/**
 * High-performance mathematical and statistical utilities for quantitative finance.
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

  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const q = Math.min(p, 1 - p);
  let r: number;

  if (q > 0.02425) {
    // Rational approximation for central region
    const u = q - 0.5;
    const r2 = u * u;
    r = (u * (((((a[0] * r2 + a[1]) * r2 + a[2]) * r2 + a[3]) * r2 + a[4]) * r2 + a[5])) /
        (((((b[0] * r2 + b[1]) * r2 + b[2]) * r2 + b[3]) * r2 + b[4]) * r2 + 1.0);
  } else {
    // Rational approximation for tails
    const v = Math.sqrt(-2.0 * Math.log(q));
    r = (((((c[0] * v + c[1]) * v + c[2]) * v + c[3]) * v + c[4]) * v + c[5]) /
        ((((d[0] * v + d[1]) * v + d[2]) * v + d[3]) * v + 1.0);
  }

  return p < 0.5 ? -r : r;
}

// Box-Muller transform for standard normal random variables
export function sampleStandardNormal(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Gamma distributed random variable via Marsaglia and Tsang method (shape k > 0)
export function sampleGamma(shape: number): number {
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let z = sampleStandardNormal();
    let v = 1 + c * z;
    if (v <= 0) continue;
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * z * z * z * z) return d * v;
    if (Math.log(u) < 0.5 * z * z + d * (1 - v + Math.log(v))) return d * v;
  }
}

// Chi-squared distribution random sample
export function sampleChiSquared(dof: number): number {
  return 2 * sampleGamma(dof / 2);
}

// Student-t random sample with ν degrees of freedom (leptokurtic, fat tails)
export function sampleStudentT(dof: number): number {
  if (dof <= 2) dof = 3;
  const z = sampleStandardNormal();
  const w = sampleChiSquared(dof);
  // Scale so variance = 1 when dof > 2 for comparability
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
        // Apply jitter for numerical positive definiteness if needed
        L[i][j] = Math.sqrt(Math.max(val, 1e-6));
      } else {
        L[i][j] = (matrix[i][j] - sum) / L[j][j];
      }
    }
  }
  return L;
}

// Correlate independent standard normal shocks using Cholesky factor L
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

// Sobol 1D / 2D low-discrepancy sequence approximation (Van der Corput)
export function vanDerCorput(n: number, base: number = 2): number {
  let q = 0;
  let bk = 1 / base;
  while (n > 0) {
    q += (n % base) * bk;
    n = Math.floor(n / base);
    bk /= base;
  }
  return q;
}

// Calculate mean, standard deviation, skewness, and kurtosis
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

  let m2 = 0, m3 = 0, m4 = 0;
  for (let i = 0; i < n; i++) {
    const diff = data[i] - mean;
    const diff2 = diff * diff;
    m2 += diff2;
    m3 += diff2 * diff;
    m4 += diff2 * diff2;
  }

  const variance = m2 / (n - 1);
  const std = Math.sqrt(variance);
  const skewness = std > 0 ? (m3 / n) / Math.pow(variance, 1.5) : 0;
  const kurtosis = std > 0 ? (m4 / n) / Math.pow(variance, 2) - 3 : 0; // excess kurtosis

  return { mean, variance, std, skewness, kurtosis };
}

// Percentile computation on sorted array (0 to 1)
export function percentile(sortedData: number[], p: number): number {
  if (sortedData.length === 0) return 0;
  const index = (sortedData.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sortedData[lower] * (1 - weight) + sortedData[upper] * weight;
}

// Expected Shortfall (CVaR) computation: E[Loss | Loss >= VaR]
export function calculateExpectedShortfall(sortedLosses: number[], confidenceLevel: number): {
  varValue: number;
  esValue: number;
} {
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

// Kernel Density Estimate (Gaussian kernel) for smooth histogram overlays
export function computeKDE(
  data: number[],
  points: number = 60,
  minVal?: number,
  maxVal?: number
): { x: number; y: number }[] {
  const n = data.length;
  if (n === 0) return [];

  const min = minVal ?? Math.min(...data);
  const max = maxVal ?? Math.max(...data);
  const range = max - min || 1;

  // Silverman's rule of thumb bandwidth
  const moments = calculateMoments(data);
  const h = 1.06 * (moments.std || 1) * Math.pow(n, -0.2);

  const step = range / (points - 1);
  const result: { x: number; y: number }[] = [];

  for (let i = 0; i < points; i++) {
    const x = min + i * step;
    let sum = 0;
    for (let j = 0; j < n; j++) {
      const u = (x - data[j]) / h;
      sum += normalPDF(u);
    }
    const density = sum / (n * h);
    result.push({ x, y: density });
  }

  return result;
}
