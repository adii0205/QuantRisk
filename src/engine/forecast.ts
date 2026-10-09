/**
 * Statistical Forecaster for rolling out-of-sample 1-day ahead VaR and Expected Shortfall.
 * Calibrates parameters on rolling window R[t-W : t] and simulates or computes 1-day ahead forecast.
 * Supports all 9 risk frameworks:
 * - gbm
 * - bootstrap
 * - student_t
 * - garch
 * - gjr_garch
 * - heston
 * - regime_switching
 * - copula
 * - bayesian_hybrid
 */
import { SimulationModelType } from '../types/risk';
import { PCG32 } from '../utils/rng';
import {
  choleskyDecomposition,
  correlateShocks,
  inverseNormalCDF,
  percentile,
} from '../utils/math';

export interface OneDayForecast {
  varValue: number; // Daily loss in currency e.g. capital * loss_fraction
  esValue: number;  // Daily expected shortfall in currency
  dailyVol: number; // Estimated 1-day volatility
}

export interface ModelFittingWindow {
  // Asset returns in window W: [assetIndex][dayInWindow]
  assetReturns: number[][];
  // Portfolio weights
  weights: number[];
  // Total portfolio capital
  capital: number;
}

/**
 * Fits GARCH(1,1) using sample moments and variance targeting.
 * sigma_{t+1}^2 = omega + alpha * eps_t^2 + beta * sigma_t^2
 */
function fitAndForecastGarch(
  returns: number[],
  isGJR: boolean = false
): { nextVariance: number; dailyMu: number } {
  const n = returns.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += returns[i];
  mean /= n;

  // Compute unconditional sample variance
  let sampleVar = 0;
  for (let i = 0; i < n; i++) {
    const diff = returns[i] - mean;
    sampleVar += diff * diff;
  }
  sampleVar /= n - 1;

  // Typical financial daily parameters
  const alpha = isGJR ? 0.05 : 0.08;
  const beta = isGJR ? 0.86 : 0.88;
  const gamma = isGJR ? 0.07 : 0.0;
  const omega = sampleVar * (1 - alpha - beta - gamma * 0.5);

  // Filter variance path through the window
  let sigma2 = sampleVar;
  for (let t = 0; t < n; t++) {
    const eps = returns[t] - mean;
    const eps2 = eps * eps;
    const isNeg = isGJR && eps < 0 ? 1 : 0;
    sigma2 = omega + (alpha + gamma * isNeg) * eps2 + beta * sigma2;
  }

  return { nextVariance: Math.max(1e-8, sigma2), dailyMu: mean };
}

/**
 * Generates 1-day ahead VaR and ES forecasts for any of the 9 models
 * on rolling historical data of length W.
 */
export function forecastVaRAndES(
  model: SimulationModelType,
  windowData: ModelFittingWindow,
  alpha: number = 0.99,
  rng: PCG32,
  nPaths: number = 10000
): OneDayForecast {
  const { assetReturns, weights, capital } = windowData;
  const numAssets = weights.length;
  const windowLen = assetReturns[0]?.length || 250;

  // 1. Calculate portfolio historical returns over the window
  const portHistory: number[] = new Array(windowLen).fill(0);
  for (let t = 0; t < windowLen; t++) {
    let r = 0;
    for (let i = 0; i < numAssets; i++) {
      r += weights[i] * assetReturns[i][t];
    }
    portHistory[t] = r;
  }

  // Sample mean and variance of portfolio
  let portMean = 0;
  for (let t = 0; t < windowLen; t++) portMean += portHistory[t];
  portMean /= windowLen;

  let portVar = 0;
  for (let t = 0; t < windowLen; t++) {
    const diff = portHistory[t] - portMean;
    portVar += diff * diff;
  }
  portVar /= windowLen - 1;
  const portVol = Math.sqrt(Math.max(1e-8, portVar));

  // Compute correlation matrix of assets in window for multivariate models
  const corr: number[][] = Array.from({ length: numAssets }, () => new Array(numAssets).fill(0));
  const assetMeans = assetReturns.map((arr) => arr.reduce((a, b) => a + b, 0) / windowLen);
  const assetVars = assetReturns.map((arr, i) => {
    const m = assetMeans[i];
    return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (windowLen - 1);
  });
  const assetStds = assetVars.map((v) => Math.sqrt(Math.max(1e-8, v)));

  for (let i = 0; i < numAssets; i++) {
    for (let j = 0; j < numAssets; j++) {
      if (i === j) {
        corr[i][j] = 1.0;
      } else {
        let cov = 0;
        for (let t = 0; t < windowLen; t++) {
          cov += (assetReturns[i][t] - assetMeans[i]) * (assetReturns[j][t] - assetMeans[j]);
        }
        cov /= windowLen - 1;
        const c = cov / (assetStds[i] * assetStds[j] || 1);
        corr[i][j] = Math.max(-0.99, Math.min(0.99, c));
      }
    }
  }

  const L = choleskyDecomposition(corr);

  // Model-specific daily forecast simulation / analytic derivation
  switch (model) {
    case 'gbm': {
      // Standard Gaussian: VaR = capital * (z_alpha * sigma - mu)
      const z = inverseNormalCDF(alpha);
      const varFrac = z * portVol - portMean;
      // ES under normal distribution: mu - sigma * phi(z) / (1 - alpha)
      const phiZ = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
      const esFrac = (phiZ / (1 - alpha)) * portVol - portMean;
      return {
        varValue: capital * Math.max(0, varFrac),
        esValue: capital * Math.max(0, esFrac),
        dailyVol: portVol,
      };
    }

    case 'bootstrap': {
      // Historical empirical distribution of portfolio returns
      // Loss = -Return
      const losses = portHistory.map((r) => -r).sort((a, b) => a - b);
      const varFrac = percentile(losses, alpha);
      const tailLosses = losses.filter((l) => l >= varFrac);
      const esFrac = tailLosses.length > 0 ? tailLosses.reduce((a, b) => a + b, 0) / tailLosses.length : varFrac;
      return {
        varValue: capital * Math.max(0, varFrac),
        esValue: capital * Math.max(0, esFrac),
        dailyVol: portVol,
      };
    }

    case 'student_t': {
      // Student-t with nu=5 degrees of freedom
      const nu = 5.0;
      // Simulate nPaths
      const simulatedLosses: number[] = new Array(nPaths);
      for (let p = 0; p < nPaths; p++) {
        const chi = rng.chiSquared(nu);
        const scale = Math.sqrt((nu - 2) / Math.max(0.1, chi));
        const z = rng.normal();
        const r = portMean + portVol * (z * scale);
        simulatedLosses[p] = -r;
      }
      simulatedLosses.sort((a, b) => a - b);
      const varFrac = percentile(simulatedLosses, alpha);
      const tail = simulatedLosses.filter((l) => l >= varFrac);
      const esFrac = tail.length > 0 ? tail.reduce((a, b) => a + b, 0) / tail.length : varFrac;
      return {
        varValue: capital * Math.max(0, varFrac),
        esValue: capital * Math.max(0, esFrac),
        dailyVol: portVol,
      };
    }

    case 'garch':
    case 'gjr_garch': {
      const isGJR = model === 'gjr_garch';
      const fit = fitAndForecastGarch(portHistory, isGJR);
      const forecastSigma = Math.sqrt(fit.nextVariance);

      // Simulate from Student-t innovations conditional on next day's forecast variance
      const nu = 5.5;
      const simulatedLosses: number[] = new Array(nPaths);
      for (let p = 0; p < nPaths; p++) {
        const chi = rng.chiSquared(nu);
        const scale = Math.sqrt((nu - 2) / Math.max(0.1, chi));
        const z = rng.normal();
        const r = fit.dailyMu + forecastSigma * (z * scale);
        simulatedLosses[p] = -r;
      }
      simulatedLosses.sort((a, b) => a - b);
      const varFrac = percentile(simulatedLosses, alpha);
      const tail = simulatedLosses.filter((l) => l >= varFrac);
      const esFrac = tail.length > 0 ? tail.reduce((a, b) => a + b, 0) / tail.length : varFrac;
      return {
        varValue: capital * Math.max(0, varFrac),
        esValue: capital * Math.max(0, esFrac),
        dailyVol: forecastSigma,
      };
    }

    case 'heston': {
      // Heston stochastic volatility: 1-day variance step with mean-reverting CIR
      const kappa = 2.5;
      const theta = portVar;
      const xi = 0.35 * portVol; // vol of vol
      const rho = -0.65;
      const dt = 1 / 252;

      const simulatedLosses: number[] = new Array(nPaths);
      for (let p = 0; p < nPaths; p++) {
        let v = portVar;
        const z1 = rng.normal();
        const z2 = rho * z1 + Math.sqrt(Math.max(0, 1 - rho * rho)) * rng.normal();
        // Full truncation CIR step
        const vPos = Math.max(0, v);
        const dv = kappa * (theta - vPos) * dt + xi * Math.sqrt(vPos) * Math.sqrt(dt) * z2;
        v = Math.max(1e-8, v + dv);
        const r = portMean + Math.sqrt(v) * z1;
        simulatedLosses[p] = -r;
      }
      simulatedLosses.sort((a, b) => a - b);
      const varFrac = percentile(simulatedLosses, alpha);
      const tail = simulatedLosses.filter((l) => l >= varFrac);
      const esFrac = tail.length > 0 ? tail.reduce((a, b) => a + b, 0) / tail.length : varFrac;
      return {
        varValue: capital * Math.max(0, varFrac),
        esValue: capital * Math.max(0, esFrac),
        dailyVol: portVol,
      };
    }

    case 'regime_switching':
    case 'bayesian_hybrid': {
      // 3-state regime switching: Low-vol (0.75), Stressed (1.4x), Crisis (2.2x)
      // Estimate current regime based on recent 20-day realized volatility
      const recentLen = Math.min(20, windowLen);
      let recentVar = 0;
      for (let t = windowLen - recentLen; t < windowLen; t++) {
        recentVar += (portHistory[t] - portMean) ** 2;
      }
      recentVar /= recentLen - 1;
      const volRatio = Math.sqrt(recentVar) / portVol;

      let pRegime = [0.85, 0.12, 0.03]; // [Bull, Stressed, Crisis]
      if (volRatio > 1.4) {
        pRegime = [0.20, 0.50, 0.30];
      } else if (volRatio > 1.1) {
        pRegime = [0.45, 0.45, 0.10];
      }

      const simulatedLosses: number[] = new Array(nPaths);
      for (let p = 0; p < nPaths; p++) {
        const u = rng.uniform();
        let volMult = 0.85;
        let driftMult = 1.15;
        if (u < pRegime[0]) {
          volMult = 0.85;
          driftMult = 1.15;
        } else if (u < pRegime[0] + pRegime[1]) {
          volMult = 1.45;
          driftMult = 0.5;
        } else {
          volMult = 2.40;
          driftMult = -1.5;
        }

        // Bayesian hybrid adds parameter jitter
        if (model === 'bayesian_hybrid') {
          volMult *= 1 + 0.05 * rng.normal();
        }

        const z = rng.normal();
        const r = portMean * driftMult + (portVol * volMult) * z;
        simulatedLosses[p] = -r;
      }

      simulatedLosses.sort((a, b) => a - b);
      const varFrac = percentile(simulatedLosses, alpha);
      const tail = simulatedLosses.filter((l) => l >= varFrac);
      const esFrac = tail.length > 0 ? tail.reduce((a, b) => a + b, 0) / tail.length : varFrac;
      return {
        varValue: capital * Math.max(0, varFrac),
        esValue: capital * Math.max(0, esFrac),
        dailyVol: portVol,
      };
    }

    case 'copula': {
      // Student-t copula across assets with shared chi-square tail mixer
      const nu = 4.0;
      const simulatedLosses: number[] = new Array(nPaths);

      for (let p = 0; p < nPaths; p++) {
        const zShocks: number[] = [];
        for (let i = 0; i < numAssets; i++) {
          zShocks.push(rng.normal());
        }
        const corrZ = correlateShocks(zShocks, L);
        const chi = rng.chiSquared(nu);
        const tScale = Math.sqrt((nu - 2) / Math.max(0.1, chi));

        let portR = 0;
        for (let i = 0; i < numAssets; i++) {
          const ret_i = assetMeans[i] + assetStds[i] * (corrZ[i] * tScale);
          portR += weights[i] * ret_i;
        }
        simulatedLosses[p] = -portR;
      }

      simulatedLosses.sort((a, b) => a - b);
      const varFrac = percentile(simulatedLosses, alpha);
      const tail = simulatedLosses.filter((l) => l >= varFrac);
      const esFrac = tail.length > 0 ? tail.reduce((a, b) => a + b, 0) / tail.length : varFrac;
      return {
        varValue: capital * Math.max(0, varFrac),
        esValue: capital * Math.max(0, esFrac),
        dailyVol: portVol,
      };
    }

    default: {
      const z = inverseNormalCDF(alpha);
      const varFrac = z * portVol - portMean;
      return {
        varValue: capital * Math.max(0, varFrac),
        esValue: capital * Math.max(0, varFrac * 1.15),
        dailyVol: portVol,
      };
    }
  }
}
