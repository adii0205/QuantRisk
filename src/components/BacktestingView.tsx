import React, { useState, useEffect, useRef } from 'react';
import { Portfolio, SimulationModelType } from '../types/risk';
import { runKupiecBacktest } from '../engine/backtest';
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle2, RotateCcw } from 'lucide-react';

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
  const [sampleDays, setSampleDays] = useState<number>(750); // 3 years

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const backtest = runKupiecBacktest(portfolio, selectedModel, confidence, sampleDays);

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
    const padding = { top: 20, right: 30, bottom: 30, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const N = backtest.totalObservations;
    const pnl = backtest.historicalPnLSeries;
    const varThreshold = backtest.historicalVaRSeries;

    const minPnL = Math.min(...pnl, -Math.max(...varThreshold));
    const maxPnL = Math.max(...pnl, Math.max(...varThreshold));
    const range = maxPnL - minPnL || 1;

    const getX = (t: number) => padding.left + (t / (N - 1)) * chartW;
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

    // 1. Draw Predicted Negative VaR Threshold Line (-VaR)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let t = 0; t < N; t++) {
      const x = getX(t);
      const y = getY(-varThreshold[t]);
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 2. Draw Daily PnL Bars or Line
    for (let t = 0; t < N; t++) {
      const x = getX(t);
      const val = pnl[t];
      const y = getY(val);
      const isBreach = val <= -varThreshold[t];

      if (isBreach) {
        // Red breach marker line and dot
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = val >= 0 ? 'rgba(16, 185, 129, 0.45)' : 'rgba(148, 163, 184, 0.35)';
        const barH = Math.abs(y - zeroY);
        const topY = val >= 0 ? y : zeroY;
        ctx.fillRect(x - 0.5, topY, 1.2, Math.max(1, barH));
      }
    }

    // Grid labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'right';
    ctx.fillText(`${currencySymbol}0`, padding.left - 8, zeroY + 3);
    ctx.fillText(
      `-${currencySymbol}${(Math.round(Math.max(...varThreshold) / 1000))}k`,
      padding.left - 8,
      getY(-Math.max(...varThreshold)) + 3
    );

    ctx.textAlign = 'center';
    ctx.fillText('T-0', padding.left, height - 10);
    ctx.fillText(`T-${Math.round(N / 2)}`, padding.left + chartW / 2, height - 10);
    ctx.fillText(`T-${N} Days`, width - padding.right, height - 10);
  }, [backtest, selectedModel, currencySymbol]);

  const baselZoneStyles = {
    GREEN: {
      bg: 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300',
      icon: CheckCircle2,
      badge: 'text-emerald-400',
      msg: 'Supervisory Green Zone (Model fully accepted, no regulatory capital add-on multiplier required).',
    },
    YELLOW: {
      bg: 'bg-amber-950/40 border-amber-800/80 text-amber-300',
      icon: AlertTriangle,
      badge: 'text-amber-400',
      msg: 'Supervisory Yellow Zone (Elevated breach clustering. Supervisory multiplier plus-factor applied).',
    },
    RED: {
      bg: 'bg-rose-950/40 border-rose-800/80 text-rose-300',
      icon: XCircle,
      badge: 'text-rose-400',
      msg: 'Supervisory Red Zone (Model fundamentally fails coverage test. Immediate regulatory rejection).',
    },
  }[backtest.baselZone];

  const ZoneIcon = baselZoneStyles.icon;

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 rounded-xl border border-slate-800 p-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            <span>Kupiec POF & Christoffersen Backtesting Suite</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            "Your model predicts tomorrow's 99% VaR. Then the actual market happens." Run rigorous
            unconditional coverage (Kupiec Likelihood Ratio) and independence tests.
          </p>
        </div>

        {/* Model Selector for Backtesting */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-slate-400">Evaluate Model:</span>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as SimulationModelType)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-cyan-400 font-semibold focus:outline-hidden cursor-pointer"
          >
            <option value="gbm">GBM Benchmark (Gaussian)</option>
            <option value="bootstrap">Historical Bootstrap</option>
            <option value="student_t">Student-t Fat-Tail</option>
            <option value="garch">GARCH(1,1)</option>
            <option value="gjr_garch">GJR-GARCH Asymmetric</option>
            <option value="heston">Heston Stochastic Vol</option>
            <option value="regime_switching">3-State Markov Regime</option>
            <option value="copula">Copula Tail Model</option>
            <option value="bayesian_hybrid">Bayesian Regime 2026</option>
          </select>
        </div>
      </div>

      {/* Basel Traffic Light Status Banner */}
      <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${baselZoneStyles.bg}`}>
        <div className="flex items-center gap-3">
          <ZoneIcon className="w-6 h-6 shrink-0" />
          <div>
            <div className="font-bold text-sm">
              Basel Committee Evaluation: {backtest.baselZone} ZONE
            </div>
            <div className="text-xs font-sans mt-0.5 opacity-90">{baselZoneStyles.msg}</div>
          </div>
        </div>

        <div className="text-right font-mono text-xs shrink-0 hidden sm:block">
          <div>Expected Breaches: <strong>{backtest.expectedBreaches}</strong></div>
          <div>Actual Breaches: <strong className={baselZoneStyles.badge}>{backtest.actualBreaches}</strong></div>
        </div>
      </div>

      {/* Statistical Test KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Total Trading Days (N)</div>
          <div className="text-xl font-bold text-slate-100 mt-1 tabular-nums">
            {backtest.totalObservations} Days
          </div>
          <div className="text-[10px] text-slate-500">~3.0 Years Historical Out-of-Sample</div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Empirical Breach Rate</div>
          <div className="text-xl font-bold text-amber-400 mt-1 tabular-nums">
            {backtest.breachRate}%
          </div>
          <div className="text-[10px] text-slate-500">
            Target: {((1 - confidence) * 100).toFixed(1)}% (1.0% for 99% VaR)
          </div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Kupiec LR Statistic (POF)</div>
          <div className="text-xl font-bold text-cyan-400 mt-1 tabular-nums">
            LR = {backtest.likelihoodRatioPOF}
          </div>
          <div className="text-[10px] text-slate-500">
            p-value = {backtest.pValuePOF} (Critical: 3.84)
          </div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Christoffersen Independence</div>
          <div className="text-xl font-bold text-sky-400 mt-1 tabular-nums">
            LR = {backtest.christoffersenLR}
          </div>
          <div className="text-[10px] text-slate-500">
            Tests breach clustering in time
          </div>
        </div>
      </div>

      {/* Visual Timeline Canvas: Actual Daily P&L vs Predicted VaR Threshold */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-200">
              Daily Out-of-Sample Actual P&L vs 99% VaR Threshold Line
            </span>
            <span className="text-xs text-slate-500">·</span>
            <span className="text-xs text-slate-400 font-mono">
              Red markers designate failure breaches (Loss &gt; VaR)
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 bg-red-500 inline-block"></span>
              <span>Predicted 99% VaR Threshold</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 border border-white inline-block"></span>
              <span>Tail Breach Event ({backtest.actualBreaches} total)</span>
            </div>
          </div>
        </div>

        <div className="w-full h-72 relative">
          <canvas ref={canvasRef} className="w-full h-full block rounded-lg" />
        </div>
      </div>
    </div>
  );
};
