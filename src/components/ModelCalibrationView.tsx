import React, { useState, useEffect } from 'react';
import { Portfolio, SimulationConfig } from '../types/risk';
import {
  PortfolioCalibrationResult,
  RecoveryTestReport,
  runPortfolioCalibrationAsync,
  runParameterRecoveryTestsAsync,
  CovarianceMethod,
  AssetCalibrationSummary,
} from '../engine/estimation';
import {
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  Info,
  ShieldCheck,
  TrendingUp,
  GitBranch,
} from 'lucide-react';

interface ModelCalibrationViewProps {
  portfolio: Portfolio;
  config: SimulationConfig;
  onApplyConfig: (newConfig: Partial<SimulationConfig>) => void;
}

export const ModelCalibrationView: React.FC<ModelCalibrationViewProps> = ({
  portfolio,
  config,
  onApplyConfig,
}) => {
  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState<string>(
    portfolio.assets[0]?.symbol || ''
  );
  const [covMethod, setCovMethod] = useState<CovarianceMethod>('ledoit_wolf');
  const [calibration, setCalibration] = useState<PortfolioCalibrationResult | null>(null);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [recoveryReport, setRecoveryReport] = useState<RecoveryTestReport | null>(null);
  const [isRunningRecovery, setIsRunningRecovery] = useState<boolean>(false);
  const [overrideNotice, setOverrideNotice] = useState<string | null>(null);

  // Editable parameters for selected asset
  const [customParams, setCustomParams] = useState<{
    alpha: number;
    beta: number;
    gamma: number;
    nu: number;
    kappa: number;
    theta: number;
    xi: number;
    rho: number;
  }>({
    alpha: config.garchAlpha ?? 0.08,
    beta: config.garchBeta ?? 0.88,
    gamma: config.gjrGamma ?? 0.06,
    nu: config.studentTDof ?? 5,
    kappa: config.hestonKappa ?? 2.5,
    theta: config.hestonTheta ?? 0.04,
    xi: config.hestonXi ?? 0.35,
    rho: config.hestonRho ?? -0.65,
  });

  const runCalibration = async (method = covMethod) => {
    setIsCalibrating(true);
    try {
      const res = await runPortfolioCalibrationAsync(portfolio, {
        covarianceMethod: method,
        numRegimes: 3,
      });
      setCalibration(res);

      // sync custom params to selected asset
      const selected = res.assets.find((a: AssetCalibrationSummary) => a.symbol === selectedAssetSymbol) || res.assets[0];
      if (selected) {
        setCustomParams({
          alpha: selected.garch.alpha,
          beta: selected.garch.beta,
          gamma: selected.garch.gamma,
          nu: selected.studentT.nu,
          kappa: selected.heston.kappa,
          theta: selected.heston.theta,
          xi: selected.heston.xi,
          rho: selected.heston.rho,
        });
      }
    } finally {
      setIsCalibrating(false);
    }
  };

  useEffect(() => {
    runCalibration(covMethod);
  }, [portfolio.id, covMethod]);

  useEffect(() => {
    if (calibration) {
      const selected = calibration.assets.find((a) => a.symbol === selectedAssetSymbol);
      if (selected) {
        setCustomParams({
          alpha: selected.garch.alpha,
          beta: selected.garch.beta,
          gamma: selected.garch.gamma,
          nu: selected.studentT.nu,
          kappa: selected.heston.kappa,
          theta: selected.heston.theta,
          xi: selected.heston.xi,
          rho: selected.heston.rho,
        });
      }
    }
  }, [selectedAssetSymbol]);

  const handleApplyToSimulation = () => {
    onApplyConfig({
      garchAlpha: customParams.alpha,
      garchBeta: customParams.beta,
      gjrGamma: customParams.gamma,
      studentTDof: Math.round(customParams.nu),
      hestonKappa: customParams.kappa,
      hestonTheta: customParams.theta,
      hestonXi: customParams.xi,
      hestonRho: customParams.rho,
    });
    setOverrideNotice('Calibrated parameters successfully dispatched to Risk Simulation Engine!');
    setTimeout(() => setOverrideNotice(null), 4000);
  };

  const handleRunRecoveryTest = async () => {
    setIsRunningRecovery(true);
    try {
      const rep = await runParameterRecoveryTestsAsync(50, 750);
      setRecoveryReport(rep);
    } finally {
      setIsRunningRecovery(false);
    }
  };

  const selectedAssetCalibration = calibration?.assets.find(
    (a) => a.symbol === selectedAssetSymbol
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
        <div>
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              Econometric Parameter Estimation & Diagnostics Suite
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Maximum Likelihood Estimation (MLE) of GJR-GARCH and Student-$t$ innovations,
            Ledoit–Wolf analytical covariance shrinkage, Baum-Welch HMM regime clustering,
            and Heston GMM calibration executed in dedicated Web Workers.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => runCalibration(covMethod)}
            disabled={isCalibrating}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isCalibrating ? 'animate-spin' : ''}`} />
            {isCalibrating ? 'Calibrating...' : 'Re-Estimate Portfolio'}
          </button>

          <button
            onClick={handleRunRecoveryTest}
            disabled={isRunningRecovery}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${isRunningRecovery ? 'animate-pulse' : ''}`} />
            {isRunningRecovery ? 'Running 50 Reps...' : 'Verify Recovery (50 Reps)'}
          </button>
        </div>
      </div>

      {overrideNotice && (
        <div className="p-3.5 rounded-lg bg-emerald-950/70 border border-emerald-700/60 text-emerald-200 text-xs flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{overrideNotice}</span>
        </div>
      )}

      {/* Covariance Estimation Method & Matrix Conditioning */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              Covariance Estimator (Σ)
            </h3>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-300">
              {calibration?.covariance.symbols.length} Assets
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'ledoit_wolf', label: 'Ledoit-Wolf', desc: 'Analytical Shrinkage' },
              { id: 'sample', label: 'Sample (S)', desc: 'Standard Unbiased' },
              { id: 'ewma', label: 'EWMA λ=0.94', desc: 'RiskMetrics Vol' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setCovMethod(m.id as CovarianceMethod)}
                className={`p-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                  covMethod === m.id
                    ? 'bg-cyan-950/60 border-cyan-500/80 text-cyan-300 shadow-sm'
                    : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="font-semibold text-white">{m.label}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400">Selected Method:</span>
              <span className="text-white font-bold">{covMethod.toUpperCase()}</span>
            </div>
            {calibration?.covariance.shrinkageIntensity !== undefined && (
              <div className="flex justify-between">
                <span className="text-slate-400">Shrinkage Intensity (δ*):</span>
                <span className="text-cyan-400 font-bold">
                  {(calibration.covariance.shrinkageIntensity * 100).toFixed(1)}%
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-400">Condition Number κ(Σ):</span>
              <span className="text-amber-400 font-bold">
                {calibration?.covariance.conditionNumber.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Recommended Model:</span>
              <span className="text-emerald-400 font-bold uppercase">
                {calibration?.recommendedModel || 'GJR_GARCH'}
              </span>
            </div>
          </div>
        </div>

        {/* 3-State Markov Regime Switching */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-purple-400" />
              Markov Regime Switching Model (Baum-Welch EM)
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              Log-Likelihood: {calibration?.hmmRegimes.logLikelihood}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {calibration?.hmmRegimes.states.map((st) => (
              <div
                key={st.stateIndex}
                className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">{st.name}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-purple-300">
                    State {st.stateIndex + 1}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex justify-between">
                  <span>Annual Vol (σ):</span>
                  <span className="text-slate-200 font-mono font-bold">
                    {(st.volAnnual * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex justify-between">
                  <span>Daily Mean (μ):</span>
                  <span className="text-slate-200 font-mono">
                    {(st.meanDaily * 100).toFixed(3)}%
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex justify-between">
                  <span>Stationary Prob (π):</span>
                  <span className="text-purple-400 font-mono font-bold">
                    {(st.stationaryProb * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] text-slate-400">
              Current Posterior Filtered Regime Probabilities (P(S_T = k)):
            </span>
            <div className="flex items-center gap-4 mt-1.5 text-xs font-mono">
              {calibration?.hmmRegimes.currentProbabilities.map((prob, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="text-slate-500">Regime {idx + 1}:</span>
                  <span className="text-cyan-400 font-bold">{(prob * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Asset-Specific Econometric Calibration & Diagnostics */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Asset Parameter Calibration & Diagnostic Tests
            </h3>
            <p className="text-xs text-slate-400">
              Select an asset to inspect estimated parameters, goodness-of-fit tests, and manual overrides.
            </p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {portfolio.assets.map((asset) => (
              <button
                key={asset.symbol}
                onClick={() => setSelectedAssetSymbol(asset.symbol)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  selectedAssetSymbol === asset.symbol
                    ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {asset.symbol}
              </button>
            ))}
          </div>
        </div>

        {selectedAssetCalibration && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* GJR-GARCH & Student-t MLE */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center justify-between">
                <span>GJR-GARCH(1,1) & Student-t</span>
                <span className="text-[10px] text-emerald-400 font-mono">MLE Converged</span>
              </h4>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">GARCH Alpha (α):</span>
                  <span className="text-white font-bold">{selectedAssetCalibration.garch.alpha}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">GARCH Beta (β):</span>
                  <span className="text-white font-bold">{selectedAssetCalibration.garch.beta}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">GJR Asymmetry (γ):</span>
                  <span className="text-cyan-400 font-bold">{selectedAssetCalibration.garch.gamma}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Persistence (α+β+½γ):</span>
                  <span className="text-amber-400 font-bold">{selectedAssetCalibration.garch.persistence}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Student-t Dof (ν):</span>
                  <span className="text-purple-400 font-bold">{selectedAssetCalibration.studentT.nu}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Unconditional Vol (σ_L):</span>
                  <span className="text-emerald-400 font-bold">
                    {(selectedAssetCalibration.garch.longRunAnnualVol * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Heston Stochastic Volatility */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                <span>Heston Volatility Calibration</span>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {selectedAssetCalibration.heston.fellerConditionSatisfied ? 'Feller Valid' : 'Regularized'}
                </span>
              </h4>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Mean Reversion (κ):</span>
                  <span className="text-white font-bold">{selectedAssetCalibration.heston.kappa}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Long-Term Var (θ):</span>
                  <span className="text-white font-bold">{selectedAssetCalibration.heston.theta}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Vol of Vol (ξ):</span>
                  <span className="text-amber-400 font-bold">{selectedAssetCalibration.heston.xi}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Leverage Corr (ρ):</span>
                  <span className="text-cyan-400 font-bold">{selectedAssetCalibration.heston.rho}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Spot Variance (v_0):</span>
                  <span className="text-emerald-400 font-bold">{selectedAssetCalibration.heston.v0}</span>
                </div>
              </div>
            </div>

            {/* Goodness-of-fit Diagnostics */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Econometric Goodness-of-Fit
              </h4>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Ljung-Box Q(10):</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-bold">
                      {selectedAssetCalibration.diagnostics.ljungBoxQ}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded ${
                        selectedAssetCalibration.diagnostics.hasArchEffectsRemaining
                          ? 'bg-amber-950 text-amber-300'
                          : 'bg-emerald-950 text-emerald-300'
                      }`}
                    >
                      p={selectedAssetCalibration.diagnostics.ljungBoxPValue}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Jarque-Bera Stat:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-bold">
                      {selectedAssetCalibration.diagnostics.jarqueBeraStat}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950 text-purple-300">
                      p={selectedAssetCalibration.diagnostics.jarqueBeraPValue}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Akaike Criterion (AIC):</span>
                  <span className="text-cyan-400 font-bold">
                    {selectedAssetCalibration.diagnostics.aic}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Bayesian Criterion (BIC):</span>
                  <span className="text-cyan-400 font-bold">
                    {selectedAssetCalibration.diagnostics.bic}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Interactive Parameter Overrides */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              Manual Parameter Overrides & Live Engine Synchronization
            </h4>
            <button
              onClick={handleApplyToSimulation}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Apply to Simulation Engine
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div>
              <label className="text-[10px] text-slate-400 block font-mono">GARCH α</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="0.4"
                value={customParams.alpha}
                onChange={(e) => setCustomParams({ ...customParams, alpha: parseFloat(e.target.value) || 0.08 })}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block font-mono">GARCH β</label>
              <input
                type="number"
                step="0.01"
                min="0.5"
                max="0.98"
                value={customParams.beta}
                onChange={(e) => setCustomParams({ ...customParams, beta: parseFloat(e.target.value) || 0.88 })}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block font-mono">GJR γ</label>
              <input
                type="number"
                step="0.01"
                min="0.0"
                max="0.25"
                value={customParams.gamma}
                onChange={(e) => setCustomParams({ ...customParams, gamma: parseFloat(e.target.value) || 0.06 })}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block font-mono">Student-t ν</label>
              <input
                type="number"
                step="0.5"
                min="3.0"
                max="30.0"
                value={customParams.nu}
                onChange={(e) => setCustomParams({ ...customParams, nu: parseFloat(e.target.value) || 5.0 })}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block font-mono">Heston κ</label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="8.0"
                value={customParams.kappa}
                onChange={(e) => setCustomParams({ ...customParams, kappa: parseFloat(e.target.value) || 2.5 })}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block font-mono">Heston θ</label>
              <input
                type="number"
                step="0.005"
                min="0.005"
                max="0.2"
                value={customParams.theta}
                onChange={(e) => setCustomParams({ ...customParams, theta: parseFloat(e.target.value) || 0.04 })}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block font-mono">Heston ξ</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="1.2"
                value={customParams.xi}
                onChange={(e) => setCustomParams({ ...customParams, xi: parseFloat(e.target.value) || 0.35 })}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block font-mono">Heston ρ</label>
              <input
                type="number"
                step="0.05"
                min="-0.95"
                max="0.2"
                value={customParams.rho}
                onChange={(e) => setCustomParams({ ...customParams, rho: parseFloat(e.target.value) || -0.65 })}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Parameter Recovery Verification Modal / Panel */}
      {recoveryReport && (
        <div className="p-5 rounded-xl bg-slate-900 border border-purple-800/60 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-400" />
              <h3 className="text-sm font-bold text-white">
                50-Replication Monte Carlo Parameter Recovery Verification Report
              </h3>
            </div>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                recoveryReport.allPassed
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-600'
                  : 'bg-amber-950 text-amber-300 border border-amber-600'
              }`}
            >
              {recoveryReport.allPassed ? 'ALL RECOVERY TESTS PASSED' : 'CHECK BOUNDS'}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            Simulated 50 independent Monte Carlo time series (T = {recoveryReport.sampleSize}) from true
            known econometrics to verify asymptotic consistency and parameter recovery power.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                  <th className="py-2">Parameter</th>
                  <th className="py-2">True Value</th>
                  <th className="py-2">Mean Recovered</th>
                  <th className="py-2">Standard Error</th>
                  <th className="py-2">Bias</th>
                  <th className="py-2">Relative Error %</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {recoveryReport.metrics.map((m, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40">
                    <td className="py-2.5 font-bold text-white">{m.parameter}</td>
                    <td className="py-2.5 text-cyan-300">{m.trueValue}</td>
                    <td className="py-2.5 text-emerald-300">{m.meanEstimated}</td>
                    <td className="py-2.5 text-slate-400">{m.stdEstimated}</td>
                    <td className="py-2.5 text-slate-300">{m.bias > 0 ? `+${m.bias}` : m.bias}</td>
                    <td className="py-2.5 text-amber-300">{m.relativeErrorPercent.toFixed(1)}%</td>
                    <td className="py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.recoveryPassed
                            ? 'bg-emerald-900/60 text-emerald-200'
                            : 'bg-rose-900/60 text-rose-200'
                        }`}
                      >
                        {m.recoveryPassed ? 'RECOVERED' : 'EXCEEDED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
