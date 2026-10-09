import React, { useRef, useEffect, useState } from 'react';
import { SimulationResult } from '../../types/risk';
import { arrayMax, arrayMin } from '../../utils/math';

interface PathFanChartProps {
  result: SimulationResult;
  currencySymbol?: string;
}

export const PathFanChart: React.FC<PathFanChartProps> = ({
  result,
  currencySymbol = '$',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { percentiles, samplePaths, portfolioValue, timeHorizonDays, paths, config } = result;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI display
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 24, right: 30, bottom: 32, left: 70 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Min and max across percentiles without array spread
    const allValues = [
      ...percentiles.p1,
      ...percentiles.p99,
      portfolioValue,
    ];
    let minY = arrayMin(allValues) * 0.96;
    let maxY = arrayMax(allValues) * 1.04;
    if (minY === maxY) {
      minY *= 0.9;
      maxY *= 1.1;
    }

    const getX = (step: number) => padding.left + (step / timeHorizonDays) * chartW;
    const getY = (val: number) => padding.top + chartH - ((val - minY) / (maxY - minY)) * chartH;

    // Clear background
    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, 0, width, height);

    // Subtle horizontal gridlines
    const gridSteps = 5;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';

    for (let i = 0; i <= gridSteps; i++) {
      const val = minY + (i / gridSteps) * (maxY - minY);
      const y = getY(val);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const label = `${currencySymbol}${(val / 1000).toFixed(val >= 1000000 ? 0 : 1)}k`;
      ctx.fillText(label, padding.left - 10, y + 4);
    }

    // Time horizon vertical gridlines (Days)
    ctx.textAlign = 'center';
    const dayInterval = Math.max(1, Math.round(timeHorizonDays / 5));
    for (let d = 0; d <= timeHorizonDays; d += dayInterval) {
      const x = getX(d);
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.stroke();
      ctx.fillText(`T+${d}d`, x, height - 12);
    }

    // Baseline Initial Capital line
    const baseLineY = getY(portfolioValue);
    ctx.strokeStyle = '#475569';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, baseLineY);
    ctx.lineTo(width - padding.right, baseLineY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 1. Draw P1 - P99 Outer Tail Ribbon (Deep cyan glow / shadow)
    ctx.fillStyle = 'rgba(6, 182, 212, 0.07)';
    ctx.beginPath();
    for (let d = 0; d <= timeHorizonDays; d++) {
      const x = getX(d);
      const y = getY(percentiles.p99[d]);
      if (d === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let d = timeHorizonDays; d >= 0; d--) {
      const x = getX(d);
      const y = getY(percentiles.p1[d]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // 2. Draw P5 - P95 Confidence Band (90% interval)
    ctx.fillStyle = 'rgba(6, 182, 212, 0.14)';
    ctx.beginPath();
    for (let d = 0; d <= timeHorizonDays; d++) {
      const x = getX(d);
      const y = getY(percentiles.p95[d]);
      if (d === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let d = timeHorizonDays; d >= 0; d--) {
      const x = getX(d);
      const y = getY(percentiles.p5[d]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // 3. Draw P25 - P75 Interquartile Core Band (50% probability envelope)
    ctx.fillStyle = 'rgba(14, 165, 233, 0.22)';
    ctx.beginPath();
    for (let d = 0; d <= timeHorizonDays; d++) {
      const x = getX(d);
      const y = getY(percentiles.p75[d]);
      if (d === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let d = timeHorizonDays; d >= 0; d--) {
      const x = getX(d);
      const y = getY(percentiles.p25[d]);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // 4. Sample path trajectories (faint individual paths)
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    samplePaths.slice(0, 18).forEach((path) => {
      ctx.beginPath();
      for (let d = 0; d <= timeHorizonDays && d < path.length; d++) {
        const x = getX(d);
        const y = getY(path[d]);
        if (d === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // 5. Draw Worst-case Tail Path (P1 boundary)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let d = 0; d <= timeHorizonDays; d++) {
      const x = getX(d);
      const y = getY(percentiles.p1[d]);
      if (d === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 6. Draw Median Path (50th percentile)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let d = 0; d <= timeHorizonDays; d++) {
      const x = getX(d);
      const y = getY(percentiles.p50[d]);
      if (d === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw hover vertical hairline if user hovers
    if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex <= timeHorizonDays) {
      const hX = getX(hoverIndex);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hX, padding.top);
      ctx.lineTo(hX, height - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Circle highlights on percentiles
      [
        { val: percentiles.p99[hoverIndex], color: '#06b6d4' },
        { val: percentiles.p50[hoverIndex], color: '#38bdf8' },
        { val: percentiles.p1[hoverIndex], color: '#ef4444' },
      ].forEach(({ val, color }) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(hX, getY(val), 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#080d1a';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }
  }, [result, hoverIndex, currencySymbol, timeHorizonDays, paths, percentiles, portfolioValue, samplePaths]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const paddingLeft = 70;
    const paddingRight = 30;
    const chartW = rect.width - paddingLeft - paddingRight;

    if (x >= paddingLeft && x <= rect.width - paddingRight) {
      const ratio = (x - paddingLeft) / chartW;
      const day = Math.round(ratio * timeHorizonDays);
      setHoverIndex(Math.max(0, Math.min(timeHorizonDays, day)));
    } else {
      setHoverIndex(null);
    }
  };

  const currentHoverDay = hoverIndex ?? timeHorizonDays;

  return (
    <div ref={containerRef} className="flex flex-col bg-slate-900/90 rounded-xl border border-slate-800 p-4 relative">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-100">
            Monte Carlo Simulation Envelope
          </span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            {paths.toLocaleString()} Paths
          </span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-cyan-400 font-mono">
            {config.model.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-sky-400 inline-block"></span>
            <span>Median (P50)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2 bg-sky-500/25 inline-block rounded-xs"></span>
            <span>IQR (P25-P75)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2 bg-cyan-500/15 inline-block rounded-xs"></span>
            <span>90% CI (P05-P95)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-red-500 inline-block"></span>
            <span>Tail P01</span>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="w-full h-80 relative">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
          className="w-full h-full block cursor-crosshair rounded-lg"
        />
      </div>

      {/* Step Metric ribbon at hover/current day */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-xs font-mono">
        <div>
          <div className="text-slate-500 text-[11px]">Horizon Step</div>
          <div className="text-slate-200 font-semibold">T+{currentHoverDay} Days</div>
        </div>
        <div>
          <div className="text-slate-500 text-[11px]">P01 Worst-Case</div>
          <div className="text-red-400 tabular-nums">
            {currencySymbol}{Math.round(percentiles.p1[currentHoverDay] || 0).toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-slate-500 text-[11px]">P05 95% Bound</div>
          <div className="text-amber-400 tabular-nums">
            {currencySymbol}{Math.round(percentiles.p5[currentHoverDay] || 0).toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-slate-500 text-[11px]">P50 Expected Median</div>
          <div className="text-sky-400 tabular-nums">
            {currencySymbol}{Math.round(percentiles.p50[currentHoverDay] || 0).toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-slate-500 text-[11px]">P95 Upside Tail</div>
          <div className="text-emerald-400 tabular-nums">
            {currencySymbol}{Math.round(percentiles.p95[currentHoverDay] || 0).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
};
