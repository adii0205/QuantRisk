import React, { useState, useEffect, useRef } from 'react';
import { DeepHedgingConfig, HedgingSimulationResult, runDeepHedgingSimulation } from '../engine/deep-hedging';
import { Cpu, Zap, Activity, ShieldCheck, Play, ArrowDownRight, RefreshCw } from 'lucide-react';

interface DeepHedgingViewProps {
  currencySymbol?: string;
}

export const DeepHedgingView: React.FC<DeepHedgingViewProps> = ({ currencySymbol = '$' }) => {
  const [config, setConfig] = useState<DeepHedgingConfig>({
    underlyingPrice: 100,
    strikePrice: 100,
    timeToExpiryDays: 30,
    volatility: 0.22,
    transactionCostBps: 15, // 15 bps typical equity option slippage
    riskAversionAlpha: 0.99,
    hedgingFrequency: 'daily',
  });

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<HedgingSimulationResult>(() =>
    runDeepHedgingSimulation(config, 2500)
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleRunSimulation = () => {
    setIsRunning(true);
    setTimeout(() => {
      const res = runDeepHedgingSimulation(config, 2500);
      setResult(res);
      setIsRunning(false);
    }, 40);
  };

  useEffect(() => {
    handleRunSimulation();
  }, [config.transactionCostBps, config.volatility, config.strikePrice]);

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
    const allPnL = [...result.deltaHedgedPnL, ...result.deepHedgedPnL];
    allPnL.sort((a, b) => a - b);
    const minX = allPnL[Math.floor(allPnL.length * 0.02)] || -25;
    const maxX = allPnL[Math.floor(allPnL.length * 0.98)] || 10;
    const rangeX = maxX - minX || 1;

    // Background
    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, 0, width, height);

    // Compute histogram density
    const bins = 40;
    const binW = rangeX / bins;
    const deltaHist = new Array(bins).fill(0);
    const deepHist = new Array(bins).fill(0);

    result.deltaHedgedPnL.forEach((v) => {
      if (v >= minX && v <= maxX) {
        const idx = Math.min(bins - 1, Math.floor((v - minX) / binW));
        deltaHist[idx]++;
      }
    });

    result.deepHedgedPnL.forEach((v) => {
      if (v >= minX && v <= maxX) {
        const idx = Math.min(bins - 1, Math.floor((v - minX) / binW));
        deepHist[idx]++;
      }
    });

    const maxCount = Math.max(...deltaHist, ...deepHist, 1);
    const getX = (val: number) => padding.left + ((val - minX) / rangeX) * chartW;
    const getY = (count: number) => padding.top + chartH - (count / maxCount) * chartH;

    // Draw zero PnL line
    const zeroX = getX(0);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(zeroX, padding.top);
    ctx.lineTo(zeroX, height - padding.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Delta Hedged histogram outline (amber)
    ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < bins; i++) {
      const x = padding.left + (i / bins) * chartW;
      const y = getY(deltaHist[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw Deep Hedged histogram outline (cyan - sharper peak, less negative tail)
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
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <span>Neural SDE & Deep Reinforcement Hedging Engine (Phase 4)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Compare classic Black-Scholes Delta Hedging with a Deep Hedging agent trained to optimize
            Expected Shortfall ($CVaR_{0.99}$) directly under market friction and bid-ask slippage.
          </p>
        </div>

        <button
          onClick={handleRunSimulation}
          disabled={isRunning}
          className="flex items-center gap-2 px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
        >
          {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          <span>{isRunning ? 'Optimizing Policy...' : 'Run Deep Hedge'}</span>
        </button>
      </div>

      {/* Control Sliders */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 font-mono text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="flex justify-between text-slate-400 mb-1">
              <span>Transaction Cost Slippage</span>
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
              Bid-ask friction per rebalance trade
            </div>
          </div>

          <div>
            <div className="flex justify-between text-slate-400 mb-1">
              <span>Neural SDE Base Volatility</span>
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
              Non-linear volatility skew dynamics
            </div>
          </div>

          <div>
            <div className="flex justify-between text-slate-400 mb-1">
              <span>Strike Moneyness</span>
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
              Spot price = {currencySymbol}{config.underlyingPrice}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Comparison Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Unhedged Short 99% ES</div>
          <div className="text-xl font-bold text-rose-400 mt-1 tabular-nums">
            {currencySymbol}{result.unhedgedES99}
          </div>
          <div className="text-[10px] text-slate-500">Unbounded naked call tail risk</div>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Black-Scholes Delta Hedged ES</div>
          <div className="text-xl font-bold text-amber-400 mt-1 tabular-nums">
            {currencySymbol}{result.deltaHedgedES99}
          </div>
          <div className="text-[10px] text-slate-500">
            Friction drag: {currencySymbol}{result.deltaTransactionCosts} / contract
          </div>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Deep Hedging Agent ES</div>
          <div className="text-xl font-bold text-cyan-400 mt-1 tabular-nums">
            {currencySymbol}{result.deepHedgedES99}
          </div>
          <div className="text-[10px] text-slate-500">
            Cost savings: +{result.costSavingsPercent}% lower drag
          </div>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Tail Risk CVaR Improvement</div>
          <div className="text-xl font-bold text-emerald-400 mt-1 tabular-nums">
            +{result.cvarReductionPercent}%
          </div>
          <div className="text-[10px] text-slate-500">Direct Expected Shortfall optimization</div>
        </div>
      </div>

      {/* Visual Canvas Comparison */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-200">
              Terminal P&L Density: Delta Hedging vs. Deep Reinforcement Hedging
            </span>
            <span className="text-xs text-slate-500">·</span>
            <span className="text-xs text-slate-400 font-mono">
              2,500 Neural SDE Simulated Paths Under {config.transactionCostBps} bps Slippage
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2 rounded-xs bg-amber-500/30 border border-amber-500 inline-block"></span>
              <span>Delta Hedging (High Turnover Drag)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2 rounded-xs bg-cyan-500/40 border border-cyan-400 inline-block"></span>
              <span>Deep Hedging (Learned No-Trade Band)</span>
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
