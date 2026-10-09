import { StudentTCalibrationResult } from './types';
import { logGamma } from '../../utils/math';

/**
 * 1D Golden Section Search for univariate convex optimization
 */
function goldenSectionSearch(
  f: (x: number) => number,
  a: number,
  b: number,
  tol: number = 1e-4,
  maxIter: number = 60
): { xMin: number; fMin: number; converged: boolean } {
  const phi = (1 + Math.sqrt(5)) / 2;
  const resphi = 2 - phi;

  let x1 = a + resphi * (b - a);
  let x2 = b - resphi * (b - a);
  let f1 = f(x1);
  let f2 = f(x2);

  let iter = 0;
  while (Math.abs(b - a) > tol && iter < maxIter) {
    iter++;
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = a + resphi * (b - a);
      f1 = f(x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = b - resphi * (b - a);
      f2 = f(x2);
    }
  }

  const xMin = (a + b) / 2;
  return { xMin, fMin: f(xMin), converged: iter < maxIter };
}

/**
 * Student-t Log-Likelihood for standardized innovations z_t (variance = 1)
 * Density: f(z; \nu) = \frac{\Gamma((\nu+1)/2)}{\Gamma(\nu/2) \sqrt{\pi(\nu-2)}} \left( 1 + \frac{z^2}{\nu-2} \right)^{-(\nu+1)/2}
 */
export function studentTLogLikelihood(nu: number, z: number[]): number {
  if (nu <= 2.05) return -1e9;
  const T = z.length;

  const c =
    logGamma((nu + 1) / 2) -
    logGamma(nu / 2) -
    0.5 * Math.log(Math.PI * (nu - 2));

  let sumLog = 0;
  const factor = (nu + 1) / 2;
  const scale = nu - 2;

  for (let i = 0; i < T; i++) {
    const zi = z[i]!;
    sumLog += Math.log(1 + (zi * zi) / scale);
  }

  return T * c - factor * sumLog;
}

/**
 * Calibrate Student-t degrees of freedom \nu by Maximum Likelihood
 */
export function calibrateStudentTMle(
  standardizedInnovations: number[],
  symbol: string
): StudentTCalibrationResult {
  const T = standardizedInnovations.length;
  if (T < 30) {
    return {
      symbol,
      nu: 6.0,
      logLikelihood: -100,
      converged: false,
    };
  }

  // Minimize negative log-likelihood over nu \in [2.15, 35.0]
  const objective = (nu: number) => -studentTLogLikelihood(nu, standardizedInnovations);

  const opt = goldenSectionSearch(objective, 2.2, 35.0, 1e-4, 50);
  const bestNu = Math.max(2.5, Math.min(30.0, opt.xMin));
  const logLik = -opt.fMin;

  return {
    symbol,
    nu: Math.round(bestNu * 10) / 10,
    logLikelihood: Math.round(logLik * 10) / 10,
    converged: opt.converged,
  };
}
