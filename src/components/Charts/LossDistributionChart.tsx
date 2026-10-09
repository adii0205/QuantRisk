import React, { useRef, useEffect } from 'react';
import { SimulationResult } from '../../types/risk';
import { arrayMax, arrayMin, computeKDE } from '../../utils/math';

interface LossDistributionChartProps {
  result: SimulationResult;
  currencySymbol?: string;
}

export const LossDistributionChart: React.FC<LossDistributionChartProps> = ({
  result,
  currencySymbol = '$',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { finalPnLDistribution, riskMetrics, portfolioValue } = result;

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
    const padding = { top: 20, right: 30, bottom: 32, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Convert PnL to Loss (Loss = -PnL, so positive Loss is bad)
    const losses = finalPnLDistribution.map((pnl) => -pnl);
    const minLoss = arrayMin(losses);
    const maxLoss = arrayMax(losses);

    // Filter extreme 0.1% outliers for plotting clarity
    const sorted = [...losses].sort((a, b) => a - b);
    const plotMin = sorted[Math.floor(sorted.length * 0.005)];
    const plotMax = sorted[Math.floor(sorted.length * 0.995)];
    const lossRange = plotMax - plotMin || 1;

    // Build histogram bins
    const numBins = 48;
    const binWidth = lossRange / numBins;
    const bins = new Array(numBins).fill(0);

    losses.forEach((l) => {
      if (l >= plotMin && l <= plotMax) {
        const idx = Math.min(numBins - 1, Math.floor((l - plotMin) / binWidth));
        bins[idx]++;
      }
    });

    const maxBinCount = arrayMax(bins) || 1;

    const getX = (lossVal: number) =>
      padding.left + ((lossVal - plotMin) / lossRange) * chartW;
    const getY = (count: number) =>
      padding.top + chartH - (count / maxBinCount) * chartH;

    // Background
    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, 0, width, height);

    // Gridlines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (i / 4) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // Zero Loss (Breakeven) vertical line
    const zeroX = getX(0);
    if (zeroX >= padding.left && zeroX <= width - padding.right) {
      ctx.strokeStyle = '#475569';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(zeroX, padding.top);
      ctx.lineTo(zeroX, height - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px JetBrains Mono';
      ctx.fillText('Breakeven (P&L=0)', zeroX + 4, padding.top + 12);
    }

    // Draw Histogram Bars
    const barW = Math.max(1, chartW / numBins - 1.5);
    for (let i = 0; i < numBins; i++) {
      const binCenterLoss = plotMin + (i + 0.5) * binWidth;
      const x = getX(plotMin + i * binWidth);
      const h = (bins[i] / maxBinCount) * chartH;
      const y = padding.top + chartH - h;

      // Color coding: green for profits (loss < 0), amber for small loss, crimson for tail loss >= VaR99
      if (binCenterLoss >= riskMetrics.var99) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.75)'; // VaR99 tail breach
      } else if (binCenterLoss >= riskMetrics.var95) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.7)'; // VaR95 zone
      } else if (binCenterLoss > 0) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.45)'; // Mild loss
      } else {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.55)'; // Positive return
      }

      ctx.fillRect(x, y, barW, h);
    }

    // Draw Smooth KDE Density Line
    const kde = computeKDE(losses.slice(0, 1500), 70, plotMin, plotMax);
    const maxKdeY = Math.max(...kde.map((p) => p.y), 0.000001);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    kde.forEach((pt, idx) => {
      const kX = getX(pt.x);
      const kY = padding.top + chartH - (pt.y / maxKdeY) * chartH * 0.95;
      if (idx === 0) ctx.moveTo(kX, kY);
      else ctx.lineTo(kX, kY);
    });
    ctx.stroke();

    // Draw 95% VaR Line
    const var95X = getX(riskMetrics.var95);
    if (var95X >= padding.left && var95X <= width - padding.right) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(var95X, padding.top);
      ctx.lineTo(var95X, height - padding.bottom);
      ctx.stroke();
    }

    // Draw 99% VaR Line
    const var99X = getX(riskMetrics.var99);
    if (var99X >= padding.left && var99X <= width - padding.right) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(var99X, padding.top);
      ctx.lineTo(var99X, height - padding.bottom);
      ctx.stroke();
    }

    // Draw 99% Expected Shortfall (CVaR) Line
    const es99X = getX(riskMetrics.es99);
    if (es99X >= padding.left && es99X <= width - padding.right) {
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(es99X, padding.top);
      ctx.lineTo(es99X, height - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // X-Axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'center';
    const xTicks = 5;
    for (let i = 0; i <= xTicks; i++) {
      const lossVal = plotMin + (i / xTicks) * lossRange;
      const x = getX(lossVal);
      const label = `${currencySymbol}${(lossVal / 1000).toFixed(0)}k`;
      ctx.fillText(label, x, height - 12);
    }
  }, [result, currencySymbol, finalPnLDistribution, riskMetrics, portfolioValue]);

  return (
    <div className="flex flex-col bg-slate-900/90 rounded-xl border border-slate-800 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-100">
            P&L / Loss Distribution & Tail Quantiles
          </span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400 font-mono">
            Fat-Tail Density & Expected Shortfall
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-amber-400 inline-block"></span>
            <span>95% VaR</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-red-500 inline-block"></span>
            <span>99% VaR</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 border-t border-dashed border-rose-400 inline-block"></span>
            <span>99% ES (CVaR)</span>
          </div>
        </div>
      </div>

      <div className="w-full h-72 relative">
        <canvas ref={canvasRef} className="w-full h-full block rounded-lg" />
      </div>

      {/* Basel tail statistics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-slate-800/80 text-xs font-mono">
        <div>
          <div className="text-slate-500 text-[11px]">95% Value at Risk</div>
          <div className="text-amber-400 font-semibold tabular-nums">
            {currencySymbol}{riskMetrics.var95.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500">
            {((riskMetrics.var95 / portfolioValue) * 100).toFixed(2)}% of capital
          </div>
        </div>

        <div>
          <div className="text-slate-500 text-[11px]">99% Value at Risk</div>
          <div className="text-red-400 font-semibold tabular-nums">
            {currencySymbol}{riskMetrics.var99.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500">
            {((riskMetrics.var99 / portfolioValue) * 100).toFixed(2)}% of capital
          </div>
        </div>

        <div>
          <div className="text-slate-500 text-[11px]">99% Expected Shortfall</div>
          <div className="text-rose-400 font-semibold tabular-nums">
            {currencySymbol}{riskMetrics.es99.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500">
            E[L | L ≥ VaR99]
          </div>
        </div>

        <div>
          <div className="text-slate-500 text-[11px]">Distribution Shape</div>
          <div className="text-slate-200 tabular-nums">
            Skew: <span className={riskMetrics.skewness < 0 ? 'text-rose-400' : 'text-slate-300'}>{riskMetrics.skewness}</span> · Kurt: <span className="text-cyan-400">+{riskMetrics.kurtosis}</span>
          </div>
          <div className="text-[10px] text-slate-500">
            {riskMetrics.kurtosis > 0 ? 'Leptokurtic (Fat Tails)' : 'Mesokurtic'}
          </div>
        </div>
      </div>
    </div>
  );
};
