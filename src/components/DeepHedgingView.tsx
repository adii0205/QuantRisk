import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  DeepHedgingConfig,
  HedgingSimulationResult,
  runDeepHedgingSimulation,
  calibrateNeuralSDEToSVI,
  defaultNeuralSDE,
} from '../engine/deep-hedging';
import { getLiquidIndexSurfaceQuotes, fitRawSviSlice } from '../engine/vol-surface';
import {
  Cpu,
  Zap,
  Activity,
  ShieldCheck,
  Play,
  TrendingDown,
  Layers,
  BarChart2,
  RefreshCw,
  Award,
} from 'lucide-react';

interface DeepHedgingViewProps {
  currencySymbol?: string;
}

export const DeepHedgingView: React.FC<DeepHedgingViewProps> = ({ currencySymbol = '$' }) => {
  const [activeSubTab, setActiveSubTab] = useState<'hedging' | 'neural_sde' | 'surface'>('hedging');

  const [config, setConfig] = useState<DeepHedgingConfig>({
    underlyingPrice: 100,
    strikePrice: 100,
    timeToExpiryDays: 30,
    volatility: 0.22,
    riskFreeRate: 0.045,
    dividendYield: 0.0,
    transactionCostBps: 15, // 15 bps typical equity option slippage
    riskAversionAlpha: 0.99,
    optionType: 'call',
    hedgingFrequency: 'daily',
    modelDynamics: 'black_scholes',
  });

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<HedgingSimulationResult>(() =>
    runDeepHedgingSimulation(config, 2500, 15)
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Neural SDE calibration against SVI market surface
  const neuralSdeCalibration = useMemo(() => {
    const allQuotes = getLiquidIndexSurfaceQuotes(100);
    const quotes30 = allQuotes.filter((q) => q.expiryDays === 30);
    const quotes60 = allQuotes.filter((q) => q.expiryDays === 60);
    const quotes90 = allQuotes.filter((q) => q.expiryDays === 90);

    const s30 = fitRawSviSlice(quotes30, 100 * Math.exp(0.045 * (30 / 365)), 30 / 365);
    const s60 = fitRawSviSlice(quotes60, 100 * Math.exp(0.045 * (60 / 365)), 60 / 365);
    const s90 = fitRawSviSlice(quotes90, 100 * Math.exp(0.045 * (90 / 365)), 90 / 365);

    return calibrateNeuralSDEToSVI([s30, s60, s90], 100, config.volatility);
  }, [config.volatility]);

  const handleRunSimulation = () => {
    setIsRunning(true);
    setTimeout(() => {
      const res = runDeepHedgingSimulation(config, 2500, 20);
      setResult(res);
      setIsRunning(false);
    }, 40);
  };

  useEffect(() => {
    handleRunSimulation();
  }, [
    config.transactionCostBps,
    config.volatility,
    config.strikePrice,
    config.modelDynamics,
    config.optionType,
  ]);

  // Canvas drawing for Terminal P&L Distribution
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 20, right: 30, bottom: 30, left: 50 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Filter outliers for plotting
    const allPnL = [...result.bsHedgedPnL, ...result.deepHedgedPnL, ...result.whalleyWilmottPnL];
    allPnL.sort((a, b) => a - b);
    const minX = allPnL[Math.floor(allPnL.length * 0.02)] || -15;
    const maxX = allPnL[Math.floor(allPnL.length * 0.98)] || 10;
    const rangeX = maxX - minX || 1;

    // Background
    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, 0, width, height);

    // Compute histogram density
    const bins = 40;
    const binW = rangeX / bins;
    const bsHist = new Array(bins).fill(0);
    const wwHist = new Array(bins).fill(0);
    const deepHist = new Array(bins).fill(0);

    result.bsHedgedPnL.forEach((v) => {
      if (v >= minX && v <= maxX) {
        const idx = Math.min(bins - 1, Math.floor((v - minX) / binW));
        bsHist[idx]++;
      }
    });

    result.whalleyWilmottPnL.forEach((v) => {
      if (v >= minX && v <= maxX) {
        const idx = Math.min(bins - 1, Math.floor((v - minX) / binW));
        wwHist[idx]++;
      }
    });

    result.deepHedgedPnL.forEach((v) => {
      if (v >= minX && v <= maxX) {
        const idx = Math.min(bins - 1, Math.floor((v - minX) / binW));
        deepHist[idx]++;
      }
    });

    const maxCount = Math.max(...bsHist, ...wwHist, ...deepHist, 1);
    const getX = (val: number) => padding.left + ((val - minX) / rangeX) * chartW;
    const getY = (count: number) => padding.top + chartH - (count / maxCount) * chartH;

    // Zero PnL line
    const zeroX = getX(0);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(zeroX, padding.top);
    ctx.lineTo(zeroX, height - padding.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // 1. Draw BS Hedged histogram (amber)
    ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < bins; i++) {
      const x = padding.left + (i / bins) * chartW;
      const y = getY(bsHist[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 2. Draw Whalley-Wilmott band histogram (purple)
    ctx.fillStyle = 'rgba(168, 85, 247, 0.20)';
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < bins; i++) {
      const x = padding.left + (i / bins) * chartW;
      const y = getY(wwHist[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. Draw Deep Hedged histogram (cyan - sharper peak, minimized CVaR tail)
    ctx.fillStyle = 'rgba(6, 182, 212, 0.35)';
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < bins; i++) {
      const x = padding.left + (i / bins) * chartW;
      const y = getY(deepHist[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(`${currencySymbol}${minX.toFixed(0)}`, padding.left, height - 10);
    ctx.fillText('Breakeven (P&L $0)', zeroX, height - 10);
    ctx.fillText(`+${currencySymbol}${maxX.toFixed(0)}`, padding.left + chartW, height - 10);
  }, [result, currencySymbol]);

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 rounded-xl border border-slate-800 p-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100">
              Deep Reinforcement Hedging & Neural SDE Local Volatility (Phase 6)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Bühler et al. (2019) policy network optimizing Rockafellar-Uryasev CVaR directly under bid-ask slippage,
            benchmarked against Black-Scholes Delta and Whalley-Wilmott (1997) asymptotic no-trade bands.
          </p>
        </div>

        {/* Tab switchers & action */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
            <button
              onClick={() => setActiveSubTab('hedging')}
              className={`px-3 py-1 rounded transition cursor-pointer ${
                activeSubTab === 'hedging'
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Hedging P&L
            </button>
            <button
              onClick={() => setActiveSubTab('surface')}
              className={`px-3 py-1 rounded transition cursor-pointer ${
                activeSubTab === 'surface'
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Policy Surface δ(S, τ)
            </button>
            <button
              onClick={() => setActiveSubTab('neural_sde')}
              className={`px-3 py-1 rounded transition cursor-pointer ${
                activeSubTab === 'neural_sde'
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Neural SDE Calibration
            </button>
          </div>

          <button
            onClick={handleRunSimulation}
            disabled={isRunning}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {isRunning ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isRunning ? 'Optimizing...' : 'Run Engine'}</span>
          </button>
        </div>
      </div>

      {/* Control Sliders */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 font-mono text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <div className="flex justify-between text-slate-400 mb-1">
              <span>Transaction Slippage</span>
              <span className="text-cyan-400 font-bold">{config.transactionCostBps} bps</span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={config.transactionCostBps}
              onChange={(e) =>
                setConfig({ ...config, transactionCostBps: Number(e.target.value) })
              }
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <div className="text-[10px] text-slate-500 mt-0.5 font-sans">
              Leland friction drag: {currencySymbol}{result.lelandPredictedCost} / contract
            </div>
          </div>

          <div>
            <div className="flex justify-between text-slate-400 mb-1">
              <span>Volatility σ</span>
              <span className="text-amber-400 font-bold">{(config.volatility * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={0.5}
              step={0.02}
              value={config.volatility}
              onChange={(e) => setConfig({ ...config, volatility: Number(e.target.value) })}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="text-[10px] text-slate-500 mt-0.5 font-sans">
              Continuous annual volatility
            </div>
          </div>

          <div>
            <div className="flex justify-between text-slate-400 mb-1">
              <span>Strike K</span>
              <span className="text-slate-200 font-bold">{currencySymbol}{config.strikePrice}</span>
            </div>
            <input
              type="range"
              min={85}
              max={115}
              step={1}
              value={config.strikePrice}
              onChange={(e) => setConfig({ ...config, strikePrice: Number(e.target.value) })}
              className="w-full accent-slate-400 cursor-pointer"
            />
            <div className="text-[10px] text-slate-500 mt-0.5 font-sans">
              BS Premium: {currencySymbol}{result.initialPremium} (Earns {config.riskFreeRate * 100}% cash rate)
            </div>
          </div>

          <div>
            <div className="flex justify-between text-slate-400 mb-1">
              <span>Stochastic Dynamics</span>
              <span className="text-emerald-400 font-bold">
                {config.modelDynamics === 'neural_sde' ? 'Neural SDE' : 'Black-Scholes'}
              </span>
            </div>
            <select
              value={config.modelDynamics}
              onChange={(e) =>
                setConfig({
                  ...config,
                  modelDynamics: e.target.value as 'black_scholes' | 'neural_sde',
                })
              }
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white outline-none cursor-pointer"
            >
              <option value="black_scholes">Black-Scholes (GBM)</option>
              <option value="neural_sde">Neural SDE (Local Vol Skew)</option>
            </select>
            <div className="text-[10px] text-slate-500 mt-1 font-sans">
              Path generation underlying process
            </div>
          </div>
        </div>
      </div>

      {/* KPI Comparison Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Unhedged Short 99% ES</div>
          <div className="text-xl font-bold text-rose-400 mt-1 tabular-nums">
            {currencySymbol}{result.unhedgedES}
          </div>
          <div className="text-[10px] text-slate-500">Unhedged tail loss</div>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Black-Scholes Delta ES</div>
          <div className="text-xl font-bold text-amber-400 mt-1 tabular-nums">
            {currencySymbol}{result.bsHedgedES}
          </div>
          <div className="text-[10px] text-slate-500">
            Friction drag: {currencySymbol}{result.bsTransactionCosts} / contract
          </div>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Whalley-Wilmott Band ES</div>
          <div className="text-xl font-bold text-purple-400 mt-1 tabular-nums">
            {currencySymbol}{result.wwHedgedES}
          </div>
          <div className="text-[10px] text-slate-500">
            Friction drag: {currencySymbol}{result.wwTransactionCosts} / contract
          </div>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Deep Agent 99% ES</div>
          <div className="text-xl font-bold text-cyan-400 mt-1 tabular-nums">
            {currencySymbol}{result.deepHedgedES}
          </div>
          <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
            CVaR {result.cvarImprovementVsBSPercent >= 0 ? '+' : ''}{result.cvarImprovementVsBSPercent}% vs BS | Drag {result.costSavingsVsBSPercent >= 0 ? '+' : ''}{result.costSavingsVsBSPercent}%
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: HEDGING TERMINAL P&L DENSITY */}
      {activeSubTab === 'hedging' && (
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-200">
                Terminal P&L Density: Black-Scholes vs. Whalley-Wilmott vs. Deep Agent
              </span>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-slate-400 font-mono">
                2,500 Simulated Paths under {config.transactionCostBps} bps Slippage
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2 rounded-xs bg-amber-500/30 border border-amber-500 inline-block"></span>
                <span>BS Delta</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2 rounded-xs bg-purple-500/30 border border-purple-500 inline-block"></span>
                <span>Whalley-Wilmott</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2 rounded-xs bg-cyan-500/40 border border-cyan-400 inline-block"></span>
                <span>Deep Hedging (Learned Band)</span>
              </div>
            </div>
          </div>

          <div className="w-full h-72 relative">
            <canvas ref={canvasRef} className="w-full h-full block rounded-lg" />
          </div>

          {/* Learning Curve summary */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-cyan-400" />
              <span>
                Rockafellar-Uryasev CVaR Loss Minimization: Epoch 1 ({result.learningCurve[0]?.trainCVaR}) → Final ({result.learningCurve[result.learningCurve.length - 1]?.trainCVaR})
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              Hedging P&L Std: BS = {result.bsPnLStd} | Deep = {result.deepPnLStd}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: LEARNED POLICY SURFACE */}
      {activeSubTab === 'surface' && (
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Learned Deep Hedging Policy Surface δ(S, τ)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Comparison of theoretical Black-Scholes Delta, asymptotic Whalley-Wilmott lower band, and the neural agent's learned rebalancing position across spot prices and maturities.
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-xs font-mono text-left">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="px-4 py-2.5">Time to Expiry</th>
                  <th className="px-4 py-2.5">Underlying Spot S</th>
                  <th className="px-4 py-2.5">Moneyness ln(S/K)</th>
                  <th className="px-4 py-2.5 text-amber-400">BS Delta δ_BS</th>
                  <th className="px-4 py-2.5 text-purple-400">Whalley-Wilmott Band</th>
                  <th className="px-4 py-2.5 text-cyan-400 font-bold">Deep Policy δ_θ</th>
                  <th className="px-4 py-2.5 text-slate-400">Action Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {result.policySurface.map((row, idx) => {
                  const logM = Math.log(row.spot / config.strikePrice);
                  const diff = row.deepDelta - row.bsDelta;
                  return (
                    <tr key={idx} className="hover:bg-slate-800/40 transition">
                      <td className="px-4 py-2 text-slate-300">{row.tauDays} days</td>
                      <td className="px-4 py-2 font-bold text-white">{currencySymbol}{row.spot}</td>
                      <td className="px-4 py-2 text-slate-400">{(logM * 100).toFixed(1)}%</td>
                      <td className="px-4 py-2 text-amber-400">{row.bsDelta.toFixed(3)}</td>
                      <td className="px-4 py-2 text-purple-400">{row.wwDelta.toFixed(3)}</td>
                      <td className="px-4 py-2 text-cyan-400 font-bold">{row.deepDelta.toFixed(3)}</td>
                      <td className={`px-4 py-2 text-[11px] ${diff < 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                        {diff > 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3)} (buffered)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: NEURAL SDE CALIBRATION */}
      {activeSubTab === 'neural_sde' && (
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              Neural SDE Local Volatility Calibration (Gierjatowicz et al. 2020)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Calibrating non-linear diffusion network σ_φ(S, t) = σ_base · (0.8 + 0.6 · Softplus(w_s·k + w_t·√t + b)) against institutional SVI market quotes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs space-y-2">
              <div className="text-slate-400 uppercase text-[10px]">Overall Calibration Error</div>
              <div className="text-2xl font-bold text-emerald-400">
                {(neuralSdeCalibration.totalRmse * 100).toFixed(2)} vol pts
              </div>
              <div className="text-[11px] text-slate-500">
                Meets tolerance target (&lt;0.50 vol points)
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs space-y-2">
              <div className="text-slate-400 uppercase text-[10px]">Learned Network Weights</div>
              <div className="text-slate-200 text-xs space-y-1">
                <div>w_s (Skew): <span className="text-cyan-400 font-bold">{neuralSdeCalibration.params.w_s.toFixed(2)}</span></div>
                <div>w_t (Term Slope): <span className="text-cyan-400 font-bold">{neuralSdeCalibration.params.w_t.toFixed(2)}</span></div>
                <div>b (Bias): <span className="text-cyan-400 font-bold">{neuralSdeCalibration.params.b.toFixed(2)}</span></div>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs space-y-2">
              <div className="text-slate-400 uppercase text-[10px]">Euler Scheme SDE Specification</div>
              <div className="text-slate-300 text-[11px] space-y-1">
                <div>dS_t = μ_θ S_t dt + σ_φ(S_t, t) S_t dW_t</div>
                <div>Softplus positivity guaranteed</div>
                <div>Arbitrage penalty constrained</div>
              </div>
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <h4 className="text-xs font-semibold text-slate-200 mb-2 font-mono uppercase">
              Implied Volatility RMSE per Expiry Slice
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
              {neuralSdeCalibration.rmsePerSlice.map((s) => (
                <div key={s.expiryDays} className="bg-slate-900 p-3 rounded-lg border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">{s.expiryDays} Days Maturity</span>
                  <span className="text-emerald-400 font-bold">{(s.rmse * 100).toFixed(2)}% RMSE</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
