import React, { useState, useEffect, useRef } from 'react';
import { Portfolio, SimulationModelType } from '../types/risk';
import {
  runRollingBacktestAsync,
  runAllModelsBacktestAsync,
  RollingBacktestResult,
  MultiModelBacktestSummary,
} from '../engine/backtest';
import { arrayMax, arrayMin } from '../utils/math';
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  TrendingDown,
  Award,
  Layers,
  BarChart3,
  RefreshCw,
} from 'lucide-react';

interface BacktestingViewProps {
  portfolio: Portfolio;
  currencySymbol?: string;
}

export const BacktestingView: React.FC<BacktestingViewProps> = ({
  portfolio,
  currencySymbol = '$',
}) => {
  const [selectedModel, setSelectedModel] = useState<SimulationModelType>('gjr_garch');
  const [confidence, setConfidence] = useState<number>(0.99);
  const [sampleDays, setSampleDays] = useState<number>(750);
  const [windowSize, setWindowSize] = useState<number>(500);
  const [activeTab, setActiveTab] = useState<'single' | 'ranking'>('ranking');
  const [loading, setLoading] = useState<boolean>(false);

  const [currentBacktest, setCurrentBacktest] = useState<RollingBacktestResult | null>(null);
  const [summaryData, setSummaryData] = useState<MultiModelBacktestSummary | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load single model or ranking summary
  const loadBacktestData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'single') {
        const res = await runRollingBacktestAsync(
          portfolio,
          selectedModel,
          confidence,
          sampleDays,
          windowSize
        );
        setCurrentBacktest(res);
      } else {
        const sum = await runAllModelsBacktestAsync(
          portfolio,
          confidence,
          sampleDays,
          windowSize
        );
        setSummaryData(sum);
        // Also select the top ranked model
        if (sum.results.length > 0) {
          const matching = sum.results.find((r) => r.model === selectedModel) || sum.results[0];
          setCurrentBacktest(matching);
        }
      }
    } catch (err) {
      console.error('Backtest error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBacktestData();
  }, [portfolio.id, selectedModel, confidence, sampleDays, windowSize, activeTab]);

  // Render Out-of-Sample Timeline Chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentBacktest) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 25, right: 30, bottom: 35, left: 65 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const N = currentBacktest.evalDays;
    const pnl = currentBacktest.historicalPnLSeries;
    const varThreshold = currentBacktest.historicalVaRSeries;
    const esThreshold = currentBacktest.historicalESSeries;

    const maxVar = arrayMax(varThreshold);
    const maxEs = arrayMax(esThreshold);
    const minPnlVal = arrayMin(pnl);
    const maxPnlVal = arrayMax(pnl);

    const minPnL = Math.min(minPnlVal, -Math.max(maxVar, maxEs));
    const maxPnL = Math.max(maxPnlVal, maxVar);
    const range = maxPnL - minPnL || 1;

    const getX = (t: number) => padding.left + (t / (N - 1 || 1)) * chartW;
    const getY = (val: number) => padding.top + chartH - ((val - minPnL) / range) * chartH;

    // Background
    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, 0, width, height);

    // Zero axis
    const zeroY = getY(0);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(width - padding.right, zeroY);
    ctx.stroke();

    // 1. Draw Predicted Negative ES Threshold (-ES)
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let t = 0; t < N; t++) {
      const x = getX(t);
      const y = getY(-esThreshold[t]);
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Draw Predicted Negative VaR Threshold Line (-VaR)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let t = 0; t < N; t++) {
      const x = getX(t);
      const y = getY(-varThreshold[t]);
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 3. Draw Daily Out-of-Sample PnL Bars
    for (let t = 0; t < N; t++) {
      const x = getX(t);
      const val = pnl[t];
      const y = getY(val);
      const isBreach = val <= -varThreshold[t];

      if (isBreach) {
        // Red breach marker dot
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = val >= 0 ? 'rgba(16, 185, 129, 0.5)' : 'rgba(148, 163, 184, 0.35)';
        const barH = Math.abs(y - zeroY);
        const topY = val >= 0 ? y : zeroY;
        ctx.fillRect(x - 0.6, topY, 1.4, Math.max(1, barH));
      }
    }

    // Grid labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'right';
    ctx.fillText(`${currencySymbol}0`, padding.left - 8, zeroY + 3);
    ctx.fillText(
      `-${currencySymbol}${Math.round(maxVar / 1000)}k`,
      padding.left - 8,
      getY(-maxVar) + 3
    );

    ctx.textAlign = 'center';
    ctx.fillText('Out-of-Sample T=0', padding.left, height - 12);
    ctx.fillText(`Evaluation Day T=${Math.round(N / 2)}`, padding.left + chartW / 2, height - 12);
    ctx.fillText(`T=${N} Days (${currentBacktest.dates[N - 1] || 'Latest'})`, width - padding.right, height - 12);
  }, [currentBacktest, currencySymbol]);

  const baselZoneStyles = currentBacktest
    ? {
        GREEN: {
          bg: 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300',
          icon: CheckCircle2,
          badge: 'text-emerald-400',
          msg: currentBacktest.baselResult.description,
        },
        YELLOW: {
          bg: 'bg-amber-950/40 border-amber-800/80 text-amber-300',
          icon: AlertTriangle,
          badge: 'text-amber-400',
          msg: currentBacktest.baselResult.description,
        },
        RED: {
          bg: 'bg-rose-950/40 border-rose-800/80 text-rose-300',
          icon: XCircle,
          badge: 'text-rose-400',
          msg: currentBacktest.baselResult.description,
        },
      }[currentBacktest.baselZone]
    : null;

  const ZoneIcon = baselZoneStyles ? baselZoneStyles.icon : CheckCircle2;

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner & Mode Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 rounded-xl border border-slate-800 p-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            <span>Out-of-Sample Statistical Backtesting & Model Ranking Engine</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Strict out-of-sample rolling forecasts calibrated on rolling window R[t-W:t] and tested against
            realised market losses from a true DGP (GARCH-t). Evaluates exact Kupiec POF, Christoffersen
            independence, BCBS N=250 binomial traffic lights, Pinball loss, and Hansen's Model Confidence Set (MCS).
          </p>
        </div>

        {/* View Toggle and Actions */}
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
            <button
              onClick={() => setActiveTab('ranking')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'ranking'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Model Confidence Set (MCS)</span>
            </button>
            <button
              onClick={() => setActiveTab('single')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'single'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Single Model Detail</span>
            </button>
          </div>

          <button
            onClick={loadBacktestData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Evaluating...' : 'Re-fit'}</span>
          </button>
        </div>
      </div>

      {/* Model Parameter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 text-xs font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Focus Model:</span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as SimulationModelType)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-cyan-400 font-semibold focus:outline-hidden cursor-pointer"
            >
              <option value="gjr_garch">GJR-GARCH Asymmetric</option>
              <option value="garch">GARCH(1,1)</option>
              <option value="heston">Heston Stochastic Vol</option>
              <option value="student_t">Student-t Fat-Tail (ν=5)</option>
              <option value="regime_switching">3-State Markov Regime</option>
              <option value="copula">Student-t Copula</option>
              <option value="bayesian_hybrid">Bayesian Regime 2026</option>
              <option value="bootstrap">Historical Bootstrap</option>
              <option value="gbm">GBM Benchmark (Gaussian Constant Vol)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Confidence (α):</span>
            <select
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-hidden cursor-pointer"
            >
              <option value={0.99}>99.0% (Basel IMA)</option>
              <option value={0.975}>97.5% (FRTB ES Level)</option>
              <option value={0.95}>95.0%</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4 text-slate-400 text-[11px]">
          <div>
            Total DGP Series: <strong className="text-slate-200">{sampleDays} days</strong>
          </div>
          <div>
            Rolling Fit Window: <strong className="text-slate-200">{windowSize} days</strong>
          </div>
          <div>
            Out-of-Sample Eval: <strong className="text-cyan-400">{sampleDays - windowSize} days</strong>
          </div>
        </div>
      </div>

      {/* Model Confidence Set (MCS) & 9-Model Statistical Ranking View */}
      {activeTab === 'ranking' && summaryData && (
        <div className="flex flex-col gap-4">
          <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400" />
                  <span>Hansen's Model Confidence Set (MCS) & Risk Metric Ranking</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Models ranked by strictly consistent Pinball loss and Fissler-Ziegel (2016) joint VaR/ES score.
                  Models marked with <span className="text-emerald-400 font-semibold">MCS ✓</span> cannot be
                  statistically rejected at α=0.10.
                </p>
              </div>
              <div className="text-xs font-mono text-slate-400">
                Ground Truth DGP: <span className="text-cyan-400 font-bold">GARCH(1,1)-t</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-left bg-slate-950/60">
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Model</th>
                    <th className="py-2.5 px-3 text-center">MCS Status</th>
                    <th className="py-2.5 px-3 text-right">Breaches (Actual/Exp)</th>
                    <th className="py-2.5 px-3 text-right">Kupiec p-val</th>
                    <th className="py-2.5 px-3 text-right">Christoff. p-val</th>
                    <th className="py-2.5 px-3 text-center">Basel N=250 Zone</th>
                    <th className="py-2.5 px-3 text-right">Pinball Loss</th>
                    <th className="py-2.5 px-3 text-right">Fissler-Ziegel</th>
                    <th className="py-2.5 px-3 text-center">FRTB Check</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {summaryData.results.map((r, idx) => {
                    const isSelected = r.model === selectedModel;
                    return (
                      <tr
                        key={r.model}
                        onClick={() => setSelectedModel(r.model)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-cyan-950/30 border-l-2 border-cyan-400'
                            : 'hover:bg-slate-800/30'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-bold text-slate-300">#{idx + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-100 flex items-center gap-1.5">
                          <span>{r.modelName}</span>
                          {r.model === 'gbm' && (
                            <span className="text-[10px] px-1 py-0.2 bg-red-950/60 text-red-400 rounded-sm">
                              Baseline
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {r.isInMCS ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 text-[10px] font-bold">
                              MCS Member (p={r.mcsPValue.toFixed(2)})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-800/60 text-slate-400 text-[10px]">
                              Rejected (p={r.mcsPValue.toFixed(2)})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <span
                            className={
                              r.actualBreaches > r.expectedBreaches * 2
                                ? 'text-red-400 font-bold'
                                : 'text-slate-200'
                            }
                          >
                            {r.actualBreaches}
                          </span>
                          <span className="text-slate-500"> / {r.expectedBreaches}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <span
                            className={
                              r.pValuePOF < 0.05
                                ? 'text-rose-400 font-semibold'
                                : 'text-emerald-400'
                            }
                          >
                            {r.pValuePOF.toFixed(3)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <span
                            className={
                              r.christoffersenPValue < 0.05
                                ? 'text-rose-400 font-semibold'
                                : 'text-sky-400'
                            }
                          >
                            {r.christoffersenPValue.toFixed(3)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-sm text-[10px] font-bold ${
                              r.baselZone === 'GREEN'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : r.baselZone === 'YELLOW'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-rose-950 text-rose-300 border border-rose-800'
                            }`}
                          >
                            {r.baselZone} ({r.baselResult.totalMultiplier.toFixed(2)}x)
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-amber-400 tabular-nums">
                          {currencySymbol}{r.pinballLoss.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300 tabular-nums">
                          {r.fisslerZiegelScore.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {r.frtbDeskPass ? (
                            <span className="text-emerald-400">PASS</span>
                          ) : (
                            <span className="text-rose-400 font-bold">FAIL</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Basel Traffic Light Status Banner */}
      {currentBacktest && baselZoneStyles && (
        <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${baselZoneStyles.bg}`}>
          <div className="flex items-center gap-3">
            <ZoneIcon className="w-6 h-6 shrink-0" />
            <div>
              <div className="font-bold text-sm flex items-center gap-2">
                <span>BCBS Supervisory Zone: {currentBacktest.baselZone}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-900/60 border border-slate-700/60 font-mono">
                  Multiplier: {currentBacktest.baselResult.totalMultiplier.toFixed(2)}x (+{currentBacktest.baselResult.multiplierAddon.toFixed(2)} add-on)
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${currentBacktest.frtbDeskPass ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/60' : 'bg-rose-900/40 text-rose-300 border border-rose-700/60'}`}>
                  FRTB Desk Check: {currentBacktest.frtbDeskPass ? 'PASSED (≤12 exceptions)' : 'FAILED (>12 exceptions)'}
                </span>
              </div>
              <div className="text-xs font-sans mt-0.5 opacity-90">{baselZoneStyles.msg}</div>
            </div>
          </div>

          <div className="text-right font-mono text-xs shrink-0 flex items-center gap-6">
            <div>
              <div className="text-slate-400 text-[10px]">Rolling 250-Day</div>
              <div>Latest: <strong>{currentBacktest.rolling250LatestZone}</strong> | Worst: <strong>{currentBacktest.rolling250WorstZone}</strong></div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px]">Actual vs Exp Breaches</div>
              <div><strong className={baselZoneStyles.badge}>{currentBacktest.actualBreaches}</strong> / {currentBacktest.expectedBreaches}</div>
            </div>
          </div>
        </div>
      )}

      {/* Statistical Test KPI Cards */}
      {currentBacktest && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
          <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[11px]">Empirical Breach Rate</div>
            <div className="text-xl font-bold text-amber-400 mt-1 tabular-nums">
              {currentBacktest.breachRate}%
            </div>
            <div className="text-[10px] text-slate-500">
              Target: {((1 - confidence) * 100).toFixed(1)}% ({currentBacktest.actualBreaches} of {currentBacktest.evalDays} days)
            </div>
          </div>

          <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[11px]">Kupiec LR (POF Unconditional)</div>
            <div className="text-xl font-bold text-cyan-400 mt-1 tabular-nums">
              LR = {currentBacktest.likelihoodRatioPOF}
            </div>
            <div className="text-[10px] text-slate-400">
              p-value = {currentBacktest.pValuePOF.toFixed(4)} ({currentBacktest.pValuePOF >= 0.05 ? 'Pass H0' : 'Reject H0'})
            </div>
          </div>

          <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[11px]">Christoffersen (Independence)</div>
            <div className="text-xl font-bold text-sky-400 mt-1 tabular-nums">
              LR = {currentBacktest.christoffersenLR}
            </div>
            <div className="text-[10px] text-slate-400">
              p-value = {currentBacktest.christoffersenPValue.toFixed(4)} (0·ln0 handled)
            </div>
          </div>

          <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-[11px]">Acerbi-Székely ES Test (Z1)</div>
            <div className="text-xl font-bold text-indigo-400 mt-1 tabular-nums">
              Z₁ = {currentBacktest.acerbiZ1}
            </div>
            <div className="text-[10px] text-slate-400">
              p = {currentBacktest.acerbiPValue.toFixed(3)} | Joint LR_cc = {currentBacktest.conditionalCoverageLR}
            </div>
          </div>
        </div>
      )}

      {/* Visual Timeline Canvas: Actual Daily P&L vs Predicted VaR & ES Lines */}
      {currentBacktest && (
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-200">
                Out-of-Sample Evaluation: Realised Market P&L vs Daily Rolling VaR / ES
              </span>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-slate-400 font-mono">
                {currentBacktest.modelName}
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-red-500 inline-block"></span>
                <span>Predicted 99% VaR</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 border-b border-rose-400 border-dashed inline-block"></span>
                <span>Expected Shortfall (ES)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 border border-white inline-block"></span>
                <span>Breach Event ({currentBacktest.actualBreaches})</span>
              </div>
            </div>
          </div>

          <div className="w-full h-72 relative">
            <canvas ref={canvasRef} className="w-full h-full block rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
};
