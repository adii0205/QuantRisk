import React from 'react';
import {
  HardwareEngine,
  SimulationConfig,
  SimulationModelType,
  VarianceReduction,
} from '../types/risk';
import { Cpu, Zap, Settings, BarChart2 } from 'lucide-react';

interface SimulationControlsProps {
  config: SimulationConfig;
  onChangeConfig: (newConfig: SimulationConfig) => void;
  onRunSimulation: () => void;
  isSimulating: boolean;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  config,
  onChangeConfig,
  onRunSimulation,
  isSimulating,
}) => {
  const models: { id: SimulationModelType; label: string; desc: string }[] = [
    { id: 'gbm', label: 'GBM Benchmark', desc: 'Discretized Geometric Brownian Motion baseline' },
    { id: 'bootstrap', label: 'Historical Bootstrap', desc: 'Empirical resampling preserving non-normal tails' },
    { id: 'student_t', label: 'Student-t (Fat-Tail)', desc: 'Heavy leptokurtic tails with ν degrees of freedom' },
    { id: 'garch', label: 'GARCH(1,1)', desc: 'Time-varying autoregressive volatility clustering' },
    { id: 'gjr_garch', label: 'GJR-GARCH', desc: 'Asymmetric leverage response to negative market shocks' },
    { id: 'heston', label: 'Heston Stoch Vol', desc: 'Continuous coupled price & variance stochastic diff equations' },
    { id: 'regime_switching', label: 'Markov HMM Regime', desc: '3-State Markov switching: Bull, Stressed, Crash regimes' },
    { id: 'copula', label: 'Copula Monte Carlo', desc: 'Nonlinear joint tail dependence & co-crashing' },
    { id: 'bayesian_hybrid', label: 'Bayesian Regime 2026', desc: 'Posterior parameter uncertainty + regime switching' },
  ];

  const pathsOptions = [10000, 25000, 50000, 100000];
  const horizonOptions = [
    { days: 1, label: '1 Day (Basel Daily)' },
    { days: 10, label: '10 Days (FRTB Reg)' },
    { days: 21, label: '21 Days (1-Month)' },
    { days: 63, label: '63 Days (Quarter)' },
    { days: 252, label: '252 Days (1-Year)' },
  ];

  const varianceMethods: { id: VarianceReduction; label: string }[] = [
    { id: 'none', label: 'Standard Pseudo-Random' },
    { id: 'antithetic', label: 'Antithetic Variates (Z, -Z)' },
    { id: 'sobol_qmc', label: 'Sobol Quasi-MC (Low Discrepancy)' },
    { id: 'importance_sampling', label: 'Importance Sampling (Tail Tilt)' },
  ];

  const hardwareEngines: { id: HardwareEngine; label: string; tag: string }[] = [
    { id: 'cpu_single', label: 'CPU Single-Core', tag: 'Standard' },
    { id: 'cpu_worker', label: 'CPU Vectorized', tag: 'Optimized' },
    { id: 'gpu_webgl', label: 'WebGL GPU Shader', tag: 'High-Throughput' },
  ];

  return (
    <div className="flex flex-col bg-slate-900/90 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-100">
            Scenario Generator & Hardware Architecture
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span>Target Confidence: 99.0% Basel III</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
        {/* Model Selection */}
        <div className="lg:col-span-2">
          <label className="text-slate-400 block mb-1.5 text-[11px] font-sans font-medium">
            Simulation Mathematical Model
          </label>
          <select
            value={config.model}
            onChange={(e) =>
              onChangeConfig({ ...config, model: e.target.value as SimulationModelType })
            }
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-hidden focus:border-cyan-500 font-mono text-xs cursor-pointer"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.desc}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500 font-sans">
            {models.find((m) => m.id === config.model)?.desc}
          </p>
        </div>

        {/* Path Count */}
        <div>
          <label className="text-slate-400 block mb-1.5 text-[11px] font-sans font-medium">
            Simulated Path Scenarios
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {pathsOptions.map((p) => (
              <button
                key={p}
                onClick={() => onChangeConfig({ ...config, paths: p })}
                className={`px-2 py-1.5 rounded-md border text-center transition-colors cursor-pointer ${
                  config.paths === p
                    ? 'bg-slate-800 border-cyan-500 text-cyan-400 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {(p / 1000).toFixed(0)}k Paths
              </button>
            ))}
          </div>
        </div>

        {/* Horizon Days */}
        <div>
          <label className="text-slate-400 block mb-1.5 text-[11px] font-sans font-medium">
            Forecast Time Horizon
          </label>
          <select
            value={config.timeHorizonDays}
            onChange={(e) =>
              onChangeConfig({ ...config, timeHorizonDays: Number(e.target.value) })
            }
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-hidden focus:border-cyan-500 font-mono text-xs cursor-pointer"
          >
            {horizonOptions.map((h) => (
              <option key={h.days} value={h.days}>
                {h.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Advanced Variance Reduction & Hardware acceleration selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-3 border-t border-slate-800/80 text-xs font-mono">
        <div>
          <label className="text-slate-400 block mb-1.5 text-[11px] font-sans font-medium">
            Computational Variance Reduction
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {varianceMethods.map((v) => (
              <button
                key={v.id}
                onClick={() => onChangeConfig({ ...config, varianceReduction: v.id })}
                className={`px-2.5 py-1.5 rounded-md border text-left transition-colors cursor-pointer truncate ${
                  config.varianceReduction === v.id
                    ? 'bg-slate-800 border-cyan-500 text-cyan-300 font-medium'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-slate-400 block mb-1.5 text-[11px] font-sans font-medium">
            Compute Hardware Acceleration Engine
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {hardwareEngines.map((h) => (
              <button
                key={h.id}
                onClick={() => onChangeConfig({ ...config, hardwareEngine: h.id })}
                className={`px-2 py-1.5 rounded-md border text-center transition-colors cursor-pointer ${
                  config.hardwareEngine === h.id
                    ? 'bg-slate-800 border-cyan-500 text-cyan-300 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="truncate">{h.label}</div>
                <div className="text-[10px] text-slate-500">{h.tag}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
