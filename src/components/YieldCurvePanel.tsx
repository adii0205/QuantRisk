import React, { useState } from 'react';
import {
  applyYieldCurveShock,
  CurveShiftType,
  generateBaseYieldCurve,
  repriceBondUnderTermStructure,
  YieldCurveMaturity,
} from '../engine/yield-curve';
import { TrendingUp, Activity, BarChart2 } from 'lucide-react';

export const YieldCurvePanel: React.FC = () => {
  const [shiftType, setShiftType] = useState<CurveShiftType>('curve_inversion');
  const [magnitudeBps, setMagnitudeBps] = useState<number>(125);

  const baseCurve = generateBaseYieldCurve();
  const shockedCurve = applyYieldCurveShock(baseCurve, shiftType, magnitudeBps);

  // Reprice benchmark 10Y Bond (TLT / IEF proxy)
  const bond10Y = repriceBondUnderTermStructure(
    100.0,
    7.8, // 7.8 years modified duration
    72.0, // convexity
    magnitudeBps
  );

  const shiftLabels: { id: CurveShiftType; label: string }[] = [
    { id: 'curve_inversion', label: '2Y-10Y Inversion' },
    { id: 'bear_flattening', label: 'Bear Flattening' },
    { id: 'bull_steepening', label: 'Bull Steepening' },
    { id: 'parallel_up', label: 'Parallel +Shift' },
    { id: 'parallel_down', label: 'Parallel -Shift' },
  ];

  return (
    <div className="flex flex-col bg-slate-900/90 rounded-xl border border-slate-800 p-4 font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-2.5 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-100 font-sans">
            Multi-Curve Term Structure & Sovereign Yield Curve
          </span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400">Hull-White Dynamic Repricing</span>
        </div>

        {/* Shift Presets */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          {shiftLabels.map((s) => (
            <button
              key={s.id}
              onClick={() => setShiftType(s.id)}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                shiftType === s.id
                  ? 'bg-slate-800 text-cyan-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Yield Curve Tenors Table & Repricing KPI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Table of Tenors */}
        <div className="lg:col-span-2 overflow-x-auto">
          <table className="w-full text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-left bg-slate-950/60">
                <th className="py-2 px-2.5">Tenor</th>
                <th className="py-2 px-2.5 text-right">Base Yield</th>
                <th className="py-2 px-2.5 text-right">Shocked Yield</th>
                <th className="py-2 px-2.5 text-right">Delta Shift</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {shockedCurve.map((m) => {
                const diffBps = Math.round((m.shockedYield - m.baseYield) * 10000);
                return (
                  <tr key={m.tenor} className="hover:bg-slate-800/30">
                    <td className="py-2 px-2.5 font-semibold text-slate-200">{m.tenor}</td>
                    <td className="py-2 px-2.5 text-right text-slate-400 tabular-nums">
                      {(m.baseYield * 100).toFixed(2)}%
                    </td>
                    <td className="py-2 px-2.5 text-right text-cyan-300 font-bold tabular-nums">
                      {(m.shockedYield * 100).toFixed(2)}%
                    </td>
                    <td
                      className={`py-2 px-2.5 text-right font-semibold tabular-nums ${
                        diffBps >= 0 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {diffBps >= 0 ? `+${diffBps}` : diffBps} bps
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bond Repricing Impact Card */}
        <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800/80 flex flex-col justify-between">
          <div>
            <div className="font-semibold text-slate-200 mb-2">10Y Benchmark Treasury Impact</div>
            <div className="space-y-1.5 text-[11px] text-slate-400">
              <div className="flex justify-between">
                <span>Duration Impact:</span>
                <span className="text-rose-400 font-semibold">{bond10Y.durationImpact}%</span>
              </div>
              <div className="flex justify-between">
                <span>Convexity Buffer:</span>
                <span className="text-emerald-400 font-semibold">+{bond10Y.convexityImpact}%</span>
              </div>
              <div className="flex justify-between border-t border-slate-800/80 pt-1 font-bold">
                <span className="text-slate-200">Net Price Change:</span>
                <span className={bond10Y.percentageChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {bond10Y.percentageChange >= 0 ? '+' : ''}{bond10Y.percentageChange}%
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-800/80">
            <div className="text-[10px] text-slate-500 font-sans leading-tight">
              Calculates non-linear modified duration and convexity adjustments under non-parallel yield curve shifts.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
