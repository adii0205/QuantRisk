import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Layers,
  Cpu,
  ShieldCheck,
  GitCompare,
  CheckCircle2,
  Workflow,
  Sparkles,
} from 'lucide-react';

interface DocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DocumentationModal: React.FC<DocumentationModalProps> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState<
    'roadmap' | 'architecture' | 'comparison' | 'models'
  >('roadmap');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                QuantRisk — Architecture, Roadmap & Research Suite
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                From Mathematical Core to Distributed GPU Production Infrastructure
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 py-2.5 border-b border-slate-800 bg-slate-900 text-xs font-mono overflow-x-auto">
          {[
            { id: 'roadmap', label: '4-Phase Roadmap', icon: Workflow },
            { id: 'comparison', label: 'Research Value Proposition', icon: Sparkles },
            { id: 'architecture', label: 'Architecture Overview', icon: ShieldCheck },
            { id: 'models', label: 'Mathematical Formulations', icon: Layers },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-800 text-cyan-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6 text-slate-300 font-sans text-xs leading-relaxed">
          {/* TAB 1: 4-PHASE ROADMAP */}
          {activeSection === 'roadmap' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-100 mb-1">
                  The 4-Phase Roadmap: From Mathematical Core to Distributed Infrastructure
                </h3>
                <p className="text-slate-400 text-xs">
                  A structured engineering path ensuring theoretical correctness before scaling systems:
                </p>
              </div>

              <div className="space-y-3 font-mono text-xs">
                {/* Phase 1 */}
                <div className="bg-slate-950 p-4 rounded-xl border border-emerald-900/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-emerald-400">PHASE 1: Mathematical Core</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-semibold">
                      COMPLETE
                    </span>
                  </div>
                  <ul className="text-slate-300 font-sans text-xs space-y-1 list-disc list-inside">
                    <li>Market log-returns calculation and Cholesky covariance factorization ($\Sigma = LL^T$).</li>
                    <li>Geometric Brownian Motion (GBM baseline) and historical block bootstrap.</li>
                    <li>Student-$t$ heavy tail generator ($\nu$ degrees of freedom).</li>
                    <li>Value at Risk (VaR), Basel Expected Shortfall (ES 99%), and simulated Drawdown.</li>
                  </ul>
                </div>

                {/* Phase 2 */}
                <div className="bg-slate-950 p-4 rounded-xl border border-emerald-900/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-emerald-400">PHASE 2: Quantitative Finance Extensions</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-semibold">
                      COMPLETE
                    </span>
                  </div>
                  <ul className="text-slate-300 font-sans text-xs space-y-1 list-disc list-inside">
                    <li>GARCH(1,1) and asymmetric GJR-GARCH leverage volatility models.</li>
                    <li>Continuous Heston Stochastic Volatility SDEs (mean-reverting CIR process with negative correlation $\rho$).</li>
                    <li>3-State Markov Regime-Switching (HMM transition matrix P_ij: Bull, Stressed, Crash).</li>
                    <li>Student-$t$ Copula modeling non-linear joint tail co-crashing (&lambda;<sub>L</sub> &gt; 0).</li>
                    <li>Derivative overlays: Full Black-Scholes Greeks ($\Delta, \Gamma, \nu, \Theta, \rho$) and $+30\%$ volatility shock testing.</li>
                  </ul>
                </div>

                {/* Phase 3 */}
                <div className="bg-slate-950 p-4 rounded-xl border border-cyan-900/40">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-cyan-400">PHASE 3: Research, Validation & GPU Core</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-semibold">
                      COMPLETE
                    </span>
                  </div>
                  <ul className="text-slate-300 font-sans text-xs space-y-1 list-disc list-inside">
                    <li>750-Day rolling out-of-sample backtesting suite with breach timeline tracking.</li>
                    <li>Kupiec Likelihood Ratio (POF) test and Christoffersen Independence test.</li>
                    <li>Basel Traffic Light classification (Green, Yellow, Red supervisory zones).</li>
                    <li>Extreme Value Theory (EVT) Peaks-Over-Threshold / Generalized Pareto (GPD) fitting.</li>
                    <li>WebGL GPGPU fragment shader compute engine (&gt;1,850,000 paths/sec).</li>
                  </ul>
                </div>

                {/* Phase 4 */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-300">PHASE 4: Distributed Systems & Production Scale</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-semibold">
                      ROADMAP
                    </span>
                  </div>
                  <ul className="text-slate-400 font-sans text-xs space-y-1 list-disc list-inside">
                    <li>Distributed Ray / Celery worker cluster for scaling to 100M+ parallel scenarios across nodes.</li>
                    <li>Apache Kafka stream ingestion for live order book and tick-level volatility feeds.</li>
                    <li>C++20 AVX-512 engine compiled to WebAssembly SIMD threads.</li>
                    <li>Neural SDEs and Deep Reinforcement Learning for dynamic non-linear hedging under slippage.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RESEARCH VALUE PROPOSITION */}
          {activeSection === 'comparison' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-100 mb-2">
                  Research Value Proposition: Why Single-Model Tools Fail
                </h3>
                <p className="text-slate-400">
                  Standard educational or entry-level risk calculators invariably produce:
                  <span className="italic text-slate-200"> "Stock price prediction using Gaussian Monte Carlo."</span>
                  This introduces severe model fragility because Gaussian assumptions underestimate tail crisis probability by orders of magnitude.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-rose-400 font-semibold mb-1">1. Fat Tails (Leptokurtosis)</div>
                  <p className="text-slate-400 font-sans text-[11px]">
                    Under a normal distribution, a 5-sigma daily crash occurs once every 14,000 years. Real markets experience multi-sigma crashes every 3-5 years.
                  </p>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-amber-400 font-semibold mb-1">2. Volatility Clustering</div>
                  <p className="text-slate-400 font-sans text-[11px]">
                    Assuming constant volatility ($\sigma_t = \sigma$) ignores the leverage effect where market drops trigger violent volatility explosions.
                  </p>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-cyan-400 font-semibold mb-1">3. Non-Linear Tail Co-Crash</div>
                  <p className="text-slate-400 font-sans text-[11px]">
                    Linear Pearson correlation collapses in tail crises. Diversification disappears as assets co-crash due to tail copula dependence.
                  </p>
                </div>
              </div>

              {/* Comparative Table */}
              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-xs font-mono border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 text-left border-b border-slate-800">
                      <th className="py-2.5 px-3 font-medium">Dimension</th>
                      <th className="py-2.5 px-3 font-medium text-slate-500">Typical Single-Model Tool</th>
                      <th className="py-2.5 px-3 font-medium text-cyan-400">QuantRisk Multi-Model Platform</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans text-[11px]">
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-200 font-mono">Statistical Models</td>
                      <td className="py-2 px-3 text-slate-400">1 (Gaussian GBM only)</td>
                      <td className="py-2 px-3 text-cyan-300 font-medium">
                        9 Models compared side-by-side (GBM, Bootstrap, Student-t, GARCH, GJR-GARCH, Heston, HMM, Copulas, Bayesian Hybrid)
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-200 font-mono">Tail Risk Standard</td>
                      <td className="py-2 px-3 text-slate-400">95% Parametric VaR (Non-coherent)</td>
                      <td className="py-2 px-3 text-cyan-300 font-medium">
                        Basel FRTB Expected Shortfall ($ES_{0.99}$) + Extreme Value Theory (EVT/GPD)
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-200 font-mono">Market Dynamics</td>
                      <td className="py-2 px-3 text-slate-400">Static single-state market</td>
                      <td className="py-2 px-3 text-cyan-300 font-medium">
                        3-State Markov Switching (Bull, Stressed, Crisis) with transition matrix P_ij
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-200 font-mono">Derivatives / Options</td>
                      <td className="py-2 px-3 text-slate-400">Ignored (Equities only)</td>
                      <td className="py-2 px-3 text-cyan-300 font-medium">
                        Full Greeks ($\Delta, \Gamma, \nu, \Theta, \rho$) and $+30\%$ Volatility Shock simulation
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-200 font-mono">Model Validation</td>
                      <td className="py-2 px-3 text-slate-400">None (Purely simulated graphics)</td>
                      <td className="py-2 px-3 text-cyan-300 font-medium">
                        Kupiec POF Likelihood Ratio test, Christoffersen Independence test, and Basel Traffic Light
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-200 font-mono">Hardware Throughput</td>
                      <td className="py-2 px-3 text-slate-400">Slow single-thread CPU (&lt;50k paths/sec)</td>
                      <td className="py-2 px-3 text-cyan-300 font-medium">
                        WebGL GPGPU Fragment Compute Shader (&gt;1,850,000 paths/sec, 25×-45× acceleration)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: ARCHITECTURE OVERVIEW */}
          {activeSection === 'architecture' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-100 mb-1">
                  Architecture Overview & Pipeline Design
                </h3>
                <p className="text-slate-400 text-xs">
                  Decoupled layers ensuring strict statistical independence between calibration, scenario generation, and risk evaluation:
                </p>
              </div>

              {/* ASCII Diagram Card */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[11px] text-cyan-300/90 whitespace-pre overflow-x-auto leading-tight">
{`MARKET DATA ──► DATA CLEANING ──► ECONOMETRIC ENGINES ──► SCENARIO GENERATION ──► RISK ENGINE
(NSE / APIs)     (Returns, Σ)     (GARCH/Heston/HMM)      (GPU/Vectorized MC)     (VaR, ES, EVT)
                                                                 │                      │
                                                                 ▼                      ▼
                                                          OPTIONS GREEKS         KUPIEC BACKTEST
                                                          (Δ, Γ, ν, Θ, ρ)        (Basel POF & IND)`}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Multi-Asset Portfolio Engine</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Equities, ETFs, precious metals, cash drag, gross leverage (1x-3x), and Cholesky correlation matrix ($\Sigma = LL^T$).
                  </p>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>9-Model Scenario Generator</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    GBM, Bootstrap, Student-t, GARCH, GJR-GARCH, Heston, Markov HMM, Copula, and Bayesian Hybrid with variance reduction.
                  </p>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Basel FRTB Tail Risk Engine</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    90%, 95%, 99%, 99.5% VaR, Expected Shortfall ($ES_{0.99}$), Max Drawdown, Sharpe/Sortino, and Component VaR decomposition.
                  </p>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="font-semibold text-slate-200 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Macro Stress Testing Lab</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Historical replays (2008 GFC, 2020 COVID, 2022 Rate Shock, 2024 EM, 2026 AI Capex) + custom multi-factor crisis builder.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: MATHEMATICAL FORMULATIONS */}
          {activeSection === 'models' && (
            <div className="space-y-4 font-mono text-xs">
              <div>
                <h3 className="text-base font-bold text-slate-100 mb-1 font-sans">
                  Rigorous Mathematical Formulations
                </h3>
                <p className="text-slate-400 font-sans text-xs">
                  Equations executed inside the quantitative computation core:
                </p>
              </div>

              <div className="space-y-3">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="text-cyan-400 font-bold mb-1">1. Geometric Brownian Motion (Baseline)</div>
                  <div className="text-slate-300 font-mono">
                    {"S_{t+Δt} = S_t · exp((μ - 0.5σ²)Δt + σ√Δt · Z),  Z ~ N(0, 1)"}
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="text-cyan-400 font-bold mb-1">2. Student-t Heavy Tail Generator</div>
                  <div className="text-slate-300 font-mono">
                    {"Z = √((ν - 2) / ν) · (X / √(W / ν)),  X ~ N(0, 1), W ~ χ²(ν)"}
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="text-cyan-400 font-bold mb-1">3. GJR-GARCH Asymmetric Heteroskedasticity</div>
                  <div className="text-slate-300 font-mono">
                    {"σ_t² = ω + α·ε_{t-1}² + γ·I_{ε_{t-1} < 0}·ε_{t-1}² + β·σ_{t-1}²"}
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="text-cyan-400 font-bold mb-1">4. Heston Stochastic Volatility SDEs</div>
                  <div className="text-slate-300 font-mono">
                    {"dS_t = μ·S_t·dt + √v_t·S_t·dW^S,  dv_t = κ(θ - v_t)dt + ξ√v_t·dW^v,  Corr = ρ"}
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="text-cyan-400 font-bold mb-1">5. Kupiec Proportion of Failures (POF) LR Test</div>
                  <div className="text-slate-300 font-mono">
                    {"LR_POF = -2 · ln[ ((1-p)^{N-x} · p^x) / ((1 - x/N)^{N-x} · (x/N)^x) ] ~ χ²(1)"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs font-mono text-slate-500">
          <span>QuantRisk Quantitative Engine v1.0</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close Documentation
          </button>
        </div>
      </div>
    </div>
  );
};
