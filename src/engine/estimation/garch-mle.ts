import { GarchCalibrationResult } from './types';

/**
 * Nelder-Mead Simplex optimization for bounded 2D/3D objective functions
 */
function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  stepSize: number = 0.05,
  maxIter: number = 120,
  tol: number = 1e-5
): { solution: number[]; iterations: number; converged: boolean } {
  const dim = x0.length;
  // Initialize simplex with dim + 1 vertices
  const simplex: { point: number[]; val: number }[] = [];
  simplex.push({ point: [...x0], val: f(x0) });

  for (let i = 0; i < dim; i++) {
    const pt = [...x0];
    pt[i] += stepSize;
    simplex.push({ point: pt, val: f(pt) });
  }

  let iterations = 0;
  let converged = false;

  const alpha = 1.0; // reflection
  const gamma = 2.0; // expansion
  const rho = 0.5;   // contraction
  const sigma = 0.5; // shrink

  while (iterations < maxIter) {
    iterations++;
    simplex.sort((a, b) => a.val - b.val);

    // Convergence check
    const bestVal = simplex[0]!.val;
    const worstVal = simplex[dim]!.val;
    if (Math.abs(worstVal - bestVal) < tol) {
      converged = true;
      break;
    }

    // Centroid of best points (excluding worst)
    const centroid = new Array(dim).fill(0);
    for (let i = 0; i < dim; i++) {
      for (let d = 0; d < dim; d++) {
        centroid[d] += simplex[i]!.point[d]!;
      }
    }
    for (let d = 0; d < dim; d++) centroid[d] /= dim;

    // Reflection
    const xr = centroid.map((c, d) => c + alpha * (c - simplex[dim]!.point[d]!));
    const fxr = f(xr);

    if (fxr < simplex[dim - 1]!.val && fxr >= simplex[0]!.val) {
      simplex[dim] = { point: xr, val: fxr };
      continue;
    }

    // Expansion
    if (fxr < simplex[0]!.val) {
      const xe = centroid.map((c, d) => c + gamma * (xr[d]! - c));
      const fxe = f(xe);
      if (fxe < fxr) {
        simplex[dim] = { point: xe, val: fxe };
      } else {
        simplex[dim] = { point: xr, val: fxr };
      }
      continue;
    }

    // Contraction
    const xc = centroid.map((c, d) => c + rho * (simplex[dim]!.point[d]! - c));
    const fxc = f(xc);
    if (fxc < simplex[dim]!.val) {
      simplex[dim] = { point: xc, val: fxc };
      continue;
    }

    // Shrink
    for (let i = 1; i <= dim; i++) {
      simplex[i]!.point = simplex[i]!.point.map((p, d) => simplex[0]!.point[d]! + sigma * (p - simplex[0]!.point[d]!));
      simplex[i]!.val = f(simplex[i]!.point);
    }
  }

  simplex.sort((a, b) => a.val - b.val);
  return { solution: simplex[0]!.point, iterations, converged };
}

/**
 * Maximum Likelihood Estimation of GJR-GARCH(1,1) / GARCH(1,1) parameters with variance targeting.
 * Model specification:
 *   \sigma_t^2 = \omega + \alpha r_{t-1}^2 + \gamma r_{t-1}^2 \mathbf{1}_{r_{t-1} < 0} + \beta \sigma_{t-1}^2
 * With variance targeting:
 *   \omega = \sigma_L^2 (1 - \alpha - \beta - 0.5 \gamma)
 */
export function calibrateGarchMle(
  returns: number[],
  symbol: string,
  isGjr: boolean = true
): GarchCalibrationResult {
  const T = returns.length;
  if (T < 50) {
    return {
      symbol,
      omega: 0.000005,
      alpha: 0.08,
      beta: 0.88,
      gamma: isGjr ? 0.06 : 0,
      persistence: 0.99,
      longRunAnnualVol: 0.20,
      logLikelihood: -1000,
      converged: false,
      iterations: 0,
      standardizedResiduals: returns.map((r) => r / 0.012),
    };
  }

  // Sample mean and sample variance
  const mean = returns.reduce((a, b) => a + b, 0) / T;
  const demeaned = returns.map((r) => r - mean);
  const sampleVar = demeaned.reduce((s, r) => s + r * r, 0) / (T - 1);
  const sampleVolAnnual = Math.sqrt(sampleVar * 252);

  // Negative log-likelihood objective function with variance targeting
  const nllObjective = (params: number[]): number => {
    let alpha = params[0]!;
    let beta = params[1]!;
    let gamma = isGjr ? params[2]! : 0;

    // Penalty for non-negativity or non-stationarity
    if (alpha < 0.001 || beta < 0.001 || gamma < 0) return 1e8;
    const persistence = alpha + beta + 0.5 * gamma;
    if (persistence >= 0.998) return 1e8 + persistence * 1e5;

    const omega = sampleVar * (1 - persistence);
    if (omega <= 1e-10) return 1e8;

    let nll = 0;
    let sigma2 = sampleVar; // initialize at unconditional variance

    for (let t = 0; t < T; t++) {
      const r = demeaned[t]!;
      if (sigma2 <= 1e-9 || isNaN(sigma2)) return 1e8;

      nll += 0.5 * (Math.log(sigma2) + (r * r) / sigma2);

      // GJR shock recursion
      const isNegative = r < 0 ? 1 : 0;
      sigma2 = omega + alpha * (r * r) + gamma * (r * r) * isNegative + beta * sigma2;
    }

    return isNaN(nll) ? 1e8 : nll;
  };

  // Initial parameter guess
  const x0 = isGjr ? [0.06, 0.88, 0.05] : [0.07, 0.89];
  const opt = nelderMead(nllObjective, x0, 0.04, 150, 1e-5);

  const bestAlpha = Math.max(0.01, opt.solution[0]!);
  const bestBeta = Math.max(0.01, opt.solution[1]!);
  const bestGamma = isGjr ? Math.max(0, opt.solution[2]!) : 0;

  let persistence = bestAlpha + bestBeta + 0.5 * bestGamma;
  if (persistence >= 0.998) {
    const scale = 0.985 / persistence;
    persistence = 0.985;
  }

  const omega = sampleVar * (1 - persistence);

  // Re-run filter with final parameters to extract standardized residuals
  const standardizedResiduals: number[] = [];
  let sigma2 = sampleVar;
  let logLik = 0;

  for (let t = 0; t < T; t++) {
    const r = demeaned[t]!;
    const sigma = Math.sqrt(Math.max(1e-8, sigma2));
    standardizedResiduals.push(r / sigma);
    logLik -= 0.5 * (Math.log(2 * Math.PI) + Math.log(sigma2) + (r * r) / sigma2);

    const isNeg = r < 0 ? 1 : 0;
    sigma2 = omega + bestAlpha * (r * r) + bestGamma * (r * r) * isNeg + bestBeta * sigma2;
  }

  const longRunDailyVar = omega / Math.max(1e-6, 1 - persistence);
  const longRunAnnualVol = Math.sqrt(longRunDailyVar * 252);

  return {
    symbol,
    omega: Math.round(omega * 1e8) / 1e8,
    alpha: Math.round(bestAlpha * 1000) / 1000,
    beta: Math.round(bestBeta * 1000) / 1000,
    gamma: Math.round(bestGamma * 1000) / 1000,
    persistence: Math.round(persistence * 1000) / 1000,
    longRunAnnualVol: Math.round(longRunAnnualVol * 1000) / 1000,
    logLikelihood: Math.round(logLik * 100) / 100,
    converged: opt.converged,
    iterations: opt.iterations,
    standardizedResiduals,
  };
}
