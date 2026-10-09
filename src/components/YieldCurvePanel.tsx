import React, { useState, useMemo } from 'react';
import {
  applyYieldCurveShock,
  bootstrapZeroCurve,
  CurveShiftType,
  generateBaseYieldCurve,
  simulateHullWhiteBondPaths,
} from '../engine/yield-curve';
import { Activity, ShieldCheck, Zap, BarChart2 } from 'lucide-react';

interface YieldCurvePanelProps {
  currencySymbol?: string;
}

export const YieldCurvePanel: React.FC<YieldCurvePanelProps> = ({ currencySymbol = '$' }) => {
  const [shiftType, setShiftType] = useState<CurveShiftType>('parallel_up');
  const [customBps, setCustomBps] = useState<number>(50);
  const [activeTab, setActiveTab] = useState<'bootstrap' | 'hullwhite' | 'stress'>('bootstrap');

  // Hull-White Model Parameters
  const [hwA, setHwA] = useState<number>(0.05); // Mean-reversion speed
  const [hwSigma, setHwSigma] = useState<number>(0.015); // Volatility
  const [bondMaturityYears, setBondMaturityYears] = useState<number>(10);
  const [couponRate, setCouponRate] = useState<number>(0.045);
  const [hwPaths, setHwPaths] = useState<number>(500);

  // 1. Initial Par Yield Curve
  const baseCurve = useMemo(() => generateBaseYieldCurve(), []);

  // 2. Exact Bootstrapped Zero-Coupon Curve & Forward Rates
  const bootstrapped = useMemo(() => {
    return bootstrapZeroCurve(baseCurve);
  }, [baseCurve]);

  // 3. Shocked Curve
  const shockedCurve = useMemo(() => {
    return applyYieldCurveShock(baseCurve, shiftType, customBps);
  }, [baseCurve, shiftType, customBps]);

  const shockedBootstrapped = useMemo(() => {
    return bootstrapZeroCurve(shockedCurve);
  }, [shockedCurve]);

  // 4. One-Factor Hull-White Simulation & Bond Repricing
  const hwSimulation = useMemo(() => {
    const horizonDays = 252; // 1 year
    const bond = {
      faceValue: 10000,
      couponRate,
      couponFrequency: 2,
      maturityYears: bondMaturityYears,
    };

    const sim = simulateHullWhiteBondPaths(
      bond,
      horizonDays,
      hwPaths,
      { a: hwA, sigma: hwSigma },
      bootstrapped
    );

    const initVal = sim.initialPrice;
    const meanTerminalVal = sim.meanTerminalPrice;
    const sortedPnls = sim.terminalPrices.map(p => p - initVal).sort((a, b) => a - b);
    const var99 = -sortedPnls[Math.max(0, Math.floor(sortedPnls.length * 0.01))];
    const tailPnls = sortedPnls.slice(0, Math.max(1, Math.floor(sortedPnls.length * 0.01)));
    const es99 = -tailPnls.reduce((a, b) => a + b, 0) / tailPnls.length;

    return {
      initVal,
      meanTerminalVal,
      var99,
      es99,
      times: sim.times,
      shortRatePaths: sim.shortRatePaths,
      initialShortRate: (bootstrapped.getF0T(0) * 100).toFixed(2),
    };
  }, [bootstrapped, hwA, hwSigma, bondMaturityYears, couponRate, hwPaths]);

  // SVG dimensions for curves
  const svgWidth = 650;
  const svgHeight = 240;
  const pad = { top: 20, right: 30, bottom: 35, left: 55 };

  // Helper scales for Bootstrapped curves
  const bootstrapSvg = useMemo(() => {
    const nodes = bootstrapped.nodes;
    const allYields = [
      ...nodes.map(n => n.parYield * 100),
      ...nodes.map(n => n.zeroRate * 100),
      ...nodes.map(n => n.forwardRate * 100),
    ];
    const minY = Math.max(0, Math.min(...allYields) - 0.5);
    const maxY = Math.max(...allYields) + 0.5;
    const maxT = 30;

    const scaleX = (t: number) => pad.left + (t / maxT) * (svgWidth - pad.left - pad.right);
    const scaleY = (y: number) =>
      svgHeight - pad.bottom - ((y - minY) / (maxY - minY || 1)) * (svgHeight - pad.top - pad.bottom);

    const makePath = (data: { t: number; y: number }[]) => {
      return data
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.t).toFixed(1)} ${scaleY(p.y).toFixed(1)}`)
        .join(' ');
    };

    const parPath = makePath(nodes.map(n => ({ t: n.maturityYears, y: n.parYield * 100 })));
    const zeroPath = makePath(nodes.map(n => ({ t: n.maturityYears, y: n.zeroRate * 100 })));
    const fwdPath = makePath(nodes.map(n => ({ t: n.maturityYears, y: n.forwardRate * 100 })));

    return { minY, maxY, scaleX, scaleY, parPath, zeroPath, fwdPath };
  }, [bootstrapped, pad.bottom, pad.left, pad.right, pad.top]);

  // Helper scales for Stress curves
  const stressSvg = useMemo(() => {
    const bNodes = bootstrapped.nodes;
    const sNodes = shockedBootstrapped.nodes;
    const allYields = [
      ...bNodes.map(n => n.zeroRate * 100),
      ...sNodes.map(n => n.zeroRate * 100),
    ];
    const minY = Math.max(0, Math.min(...allYields) - 0.5);
    const maxY = Math.max(...allYields) + 0.5;
    const maxT = 30;

    const scaleX = (t: number) => pad.left + (t / maxT) * (svgWidth - pad.left - pad.right);
    const scaleY = (y: number) =>
      svgHeight - pad.bottom - ((y - minY) / (maxY - minY || 1)) * (svgHeight - pad.top - pad.bottom);

    const makePath = (nodes: typeof bNodes) => {
      return nodes
        .map(
          (p, i) =>
            `${i === 0 ? 'M' : 'L'} ${scaleX(p.maturityYears).toFixed(1)} ${scaleY(p.zeroRate * 100).toFixed(1)}`
        )
        .join(' ');
    };

    const basePath = makePath(bNodes);
    const shockedPath = makePath(sNodes);

    return { minY, maxY, scaleX, scaleY, basePath, shockedPath };
  }, [bootstrapped, shockedBootstrapped, pad.bottom, pad.left, pad.right, pad.top]);

  // Helper scales for HW Trajectories
  const hwSvg = useMemo(() => {
    const paths = hwSimulation.shortRatePaths;
    const times = hwSimulation.times;
    if (!paths.length || !times.length) return null;

    let minR = 999;
    let maxR = -999;
    for (const p of paths.slice(0, 10)) {
      for (const r of p) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      }
    }
    minR = Math.min(minR * 100 - 0.5, 0);
    maxR = maxR * 100 + 0.5;
    const maxT = times[times.length - 1] || 1;

    const scaleX = (t: number) => pad.left + (t / maxT) * (svgWidth - pad.left - pad.right);
    const scaleY = (y: number) =>
      svgHeight - pad.bottom - ((y - minR) / (maxR - minR || 1)) * (svgHeight - pad.top - pad.bottom);

    const pathStrings = paths.slice(0, 8).map(p => {
      return p
        .map((r, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(times[i]).toFixed(1)} ${scaleY(r * 100).toFixed(1)}`)
        .join(' ');
    });

    return { minR, maxR, scaleX, scaleY, pathStrings, maxT };
  }, [hwSimulation, pad.bottom, pad.left, pad.right, pad.top]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-700/60 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">
              Hull-White 1-Factor Term Structure & Zero-Curve Bootstrap
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Exact analytical no-arbitrage term structure dr = (θ(t) - a·r)dt + σ dW, bootstrapped log-linear discount factors & full coupon bond repricing.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('bootstrap')}
            className={`px-3 py-1.5 rounded font-medium transition cursor-pointer ${
              activeTab === 'bootstrap'
                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Zero-Curve Bootstrap
          </button>
          <button
            onClick={() => setActiveTab('hullwhite')}
            className={`px-3 py-1.5 rounded font-medium transition cursor-pointer ${
              activeTab === 'hullwhite'
                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Hull-White Simulation
          </button>
          <button
            onClick={() => setActiveTab('stress')}
            className={`px-3 py-1.5 rounded font-medium transition cursor-pointer ${
              activeTab === 'stress'
                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Curve Stress Scenarios
          </button>
        </div>
      </div>

      {/* TAB 1: BOOTSTRAPPED ZERO CURVE */}
      {activeTab === 'bootstrap' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Native SVG Chart */}
            <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-emerald-400" />
                  Bootstrapped Yield, Zero & Instantaneous Forward Curves
                </h3>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="flex items-center gap-1.5 text-sky-400">
                    <span className="w-3 h-0.5 bg-sky-400 inline-block"></span> Par Yield
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-3 h-0.5 bg-emerald-400 inline-block"></span> Bootstrapped Zero
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <span className="w-3 h-0.5 border-t border-dashed border-amber-400 inline-block"></span> Instantaneous Fwd f(0,T)
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-2">
                Comparison of Par Yield y(T), Zero Rate z(T) = -ln(P(0,T))/T, and Instantaneous Forward Rate f(0,T) = -∂ ln P(0,T)/∂T.
              </p>

              <div className="w-full overflow-hidden flex justify-center">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full max-h-72">
                  {/* Grid lines */}
                  {[0, 1, 2, 3, 4].map(idx => {
                    const yVal = bootstrapSvg.minY + (idx / 4) * (bootstrapSvg.maxY - bootstrapSvg.minY);
                    const yPos = bootstrapSvg.scaleY(yVal);
                    return (
                      <g key={idx}>
                        <line
                          x1={pad.left}
                          y1={yPos}
                          x2={svgWidth - pad.right}
                          y2={yPos}
                          stroke="#334155"
                          strokeDasharray="3 3"
                          opacity={0.4}
                        />
                        <text
                          x={pad.left - 8}
                          y={yPos + 4}
                          fill="#94a3b8"
                          fontSize="10"
                          textAnchor="end"
                          fontFamily="monospace"
                        >
                          {yVal.toFixed(1)}%
                        </text>
                      </g>
                    );
                  })}

                  {/* X Axis ticks */}
                  {[1, 2, 5, 10, 20, 30].map(t => {
                    const xPos = bootstrapSvg.scaleX(t);
                    return (
                      <g key={t}>
                        <line x1={xPos} y1={svgHeight - pad.bottom} x2={xPos} y2={svgHeight - pad.bottom + 4} stroke="#64748b" />
                        <text
                          x={xPos}
                          y={svgHeight - pad.bottom + 16}
                          fill="#94a3b8"
                          fontSize="10"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          {t}Y
                        </text>
                      </g>
                    );
                  })}

                  {/* Paths */}
                  <path d={bootstrapSvg.parPath} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
                  <path d={bootstrapSvg.zeroPath} fill="none" stroke="#10b981" strokeWidth="2.5" />
                  <path d={bootstrapSvg.fwdPath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 4" />

                  {/* Data dots for Zero Rate */}
                  {bootstrapped.nodes.map((node, i) => (
                    <circle
                      key={i}
                      cx={bootstrapSvg.scaleX(node.maturityYears)}
                      cy={bootstrapSvg.scaleY(node.zeroRate * 100)}
                      r="3.5"
                      fill="#10b981"
                      stroke="#0f172a"
                      strokeWidth="1.5"
                    />
                  ))}
                </svg>
              </div>
            </div>

            {/* Methodology card */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                No-Arbitrage Zero Bootstrap
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Zero-coupon bond discount factors <span className="font-mono text-emerald-300">P(0,T)</span> are bootstrapped recursively from annual coupon par bonds:
              </p>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300 space-y-1">
                <div>P(0, T_n) = (1 - C ∑ P(0, T_i)) / (1 + C)</div>
                <div>z(T) = -ln(P(0, T)) / T</div>
                <div>f(0, T) = [z(T)·T]' = -d ln P / dT</div>
              </div>
              <div className="pt-2 border-t border-slate-800 text-xs text-slate-400">
                <p className="text-emerald-400 font-medium mb-1">Guarantee:</p>
                Strict no-arbitrage condition <span className="font-mono text-slate-200">P(0, 0) = 1</span> and discount factors strictly monotonically decreasing for positive yields.
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Bootstrapped Term Structure Schedule</h3>
              <span className="text-xs font-mono text-slate-400">Base Currency Risk-Free Reference</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Tenor</th>
                    <th className="px-4 py-3">Maturity (Yrs)</th>
                    <th className="px-4 py-3">Par Yield</th>
                    <th className="px-4 py-3">Bootstrapped Zero Rate</th>
                    <th className="px-4 py-3">Instantaneous Forward f(0,T)</th>
                    <th className="px-4 py-3">Discount Factor P(0,T)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {bootstrapped.nodes.map((pt) => (
                    <tr key={pt.tenor} className="hover:bg-slate-800/40 transition">
                      <td className="px-4 py-2.5 font-bold text-white">{pt.tenor}</td>
                      <td className="px-4 py-2.5 text-slate-300">{pt.maturityYears.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sky-400">{(pt.parYield * 100).toFixed(3)}%</td>
                      <td className="px-4 py-2.5 text-emerald-400 font-semibold">{(pt.zeroRate * 100).toFixed(3)}%</td>
                      <td className="px-4 py-2.5 text-amber-400">{(pt.forwardRate * 100).toFixed(3)}%</td>
                      <td className="px-4 py-2.5 text-slate-300">{pt.discountFactor.toFixed(5)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: HULL-WHITE 1-FACTOR SIMULATION */}
      {activeTab === 'hullwhite' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
              <label className="text-xs font-medium text-slate-400 block mb-1">Mean Reversion a</label>
              <input
                type="number"
                step="0.01"
                min="0.001"
                max="0.5"
                value={hwA}
                onChange={e => setHwA(parseFloat(e.target.value) || 0.05)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white font-mono focus:border-emerald-500 outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Speed of mean reversion</span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
              <label className="text-xs font-medium text-slate-400 block mb-1">Short Rate Volatility σ</label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                max="0.05"
                value={hwSigma}
                onChange={e => setHwSigma(parseFloat(e.target.value) || 0.015)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white font-mono focus:border-emerald-500 outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Basis-point volatility</span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
              <label className="text-xs font-medium text-slate-400 block mb-1">Coupon Bond Maturity (Years)</label>
              <input
                type="number"
                step="1"
                min="1"
                max="30"
                value={bondMaturityYears}
                onChange={e => setBondMaturityYears(parseInt(e.target.value) || 10)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white font-mono focus:border-emerald-500 outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Pricing instrument tenor</span>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
              <label className="text-xs font-medium text-slate-400 block mb-1">Annual Coupon Rate</label>
              <input
                type="number"
                step="0.005"
                min="0.0"
                max="0.2"
                value={couponRate}
                onChange={e => setCouponRate(parseFloat(e.target.value) || 0.045)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white font-mono focus:border-emerald-500 outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Par coupon rate</span>
            </div>
          </div>

          {/* Metrics summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Initial Bond Clean Price</span>
              <span className="text-xl font-bold font-mono text-white">
                {currencySymbol}{hwSimulation.initVal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-slate-500 block mt-1">Face: {currencySymbol}10,000</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-400 uppercase tracking-wider block mb-1">1Y Mean Simulated Price</span>
              <span className="text-xl font-bold font-mono text-emerald-400">
                {currencySymbol}{hwSimulation.meanTerminalVal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-slate-500 block mt-1">E[P(1, {bondMaturityYears})]</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-400 uppercase tracking-wider block mb-1">1Y Bond VaR 99%</span>
              <span className="text-xl font-bold font-mono text-rose-400">
                {currencySymbol}{hwSimulation.var99.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-slate-500 block mt-1">1-year risk horizon</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-400 uppercase tracking-wider block mb-1">1Y Bond ES 99%</span>
              <span className="text-xl font-bold font-mono text-amber-400">
                {currencySymbol}{hwSimulation.es99.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-slate-500 block mt-1">Expected shortfall</span>
            </div>
          </div>

          {/* Simulated Trajectories Chart */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              Hull-White Exact Short-Rate Trajectories r(t)
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Sample 1-year trajectories calibrated exactly to initial zero curve: r(t+Δt) ~ N(r_t e^(-aΔt) + α(t+Δt) - α(t)e^(-aΔt), (σ²/2a)(1 - e^(-2aΔt))).
            </p>

            {hwSvg && (
              <div className="w-full overflow-hidden flex justify-center">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full max-h-72">
                  {/* Grid lines */}
                  {[0, 1, 2, 3, 4].map(idx => {
                    const yVal = hwSvg.minR + (idx / 4) * (hwSvg.maxR - hwSvg.minR);
                    const yPos = hwSvg.scaleY(yVal);
                    return (
                      <g key={idx}>
                        <line
                          x1={pad.left}
                          y1={yPos}
                          x2={svgWidth - pad.right}
                          y2={yPos}
                          stroke="#334155"
                          strokeDasharray="3 3"
                          opacity={0.4}
                        />
                        <text
                          x={pad.left - 8}
                          y={yPos + 4}
                          fill="#94a3b8"
                          fontSize="10"
                          textAnchor="end"
                          fontFamily="monospace"
                        >
                          {yVal.toFixed(1)}%
                        </text>
                      </g>
                    );
                  })}

                  {/* X Axis ticks */}
                  {[0, 0.25, 0.5, 0.75, 1.0].map(t => {
                    const xPos = hwSvg.scaleX(t);
                    return (
                      <g key={t}>
                        <line x1={xPos} y1={svgHeight - pad.bottom} x2={xPos} y2={svgHeight - pad.bottom + 4} stroke="#64748b" />
                        <text
                          x={xPos}
                          y={svgHeight - pad.bottom + 16}
                          fill="#94a3b8"
                          fontSize="10"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          M{Math.round(t * 12)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Trajectory lines */}
                  {hwSvg.pathStrings.map((pathStr, pIdx) => {
                    const colors = ['#38bdf8', '#10b981', '#f59e0b', '#ec4899', '#a855f7', '#6366f1', '#14b8a6', '#f43f5e'];
                    return (
                      <path
                        key={pIdx}
                        d={pathStr}
                        fill="none"
                        stroke={colors[pIdx % colors.length]}
                        strokeWidth="1.5"
                        opacity={0.85}
                      />
                    );
                  })}
                </svg>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CURVE STRESS SCENARIOS */}
      {activeTab === 'stress' && (
        <div className="space-y-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Regulatory & Macro Yield Curve Stress</h3>
                <p className="text-xs text-slate-400">
                  Select classical regulatory shifts (BCBS standard 6-shock framework): Parallel, Steepener, Flattener, Short/Long rate twist.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={shiftType}
                  onChange={e => setShiftType(e.target.value as CurveShiftType)}
                  className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white font-medium focus:border-emerald-500 outline-none cursor-pointer"
                >
                  <option value="parallel_up">Parallel Up (+bps)</option>
                  <option value="parallel_down">Parallel Down (-bps)</option>
                  <option value="steepener">Steepener (Short down, Long up)</option>
                  <option value="flattener">Flattener (Short up, Long down)</option>
                  <option value="short_rate_up">Short Rate Up</option>
                  <option value="long_rate_up">Long Rate Up</option>
                </select>

                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={customBps}
                    onChange={e => setCustomBps(parseInt(e.target.value) || 0)}
                    className="w-20 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono text-center outline-none"
                  />
                  <span className="text-xs text-slate-400">bps</span>
                </div>
              </div>
            </div>

            <div className="w-full overflow-hidden flex justify-center">
              <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full max-h-72">
                {/* Grid lines */}
                {[0, 1, 2, 3, 4].map(idx => {
                  const yVal = stressSvg.minY + (idx / 4) * (stressSvg.maxY - stressSvg.minY);
                  const yPos = stressSvg.scaleY(yVal);
                  return (
                    <g key={idx}>
                      <line
                        x1={pad.left}
                        y1={yPos}
                        x2={svgWidth - pad.right}
                        y2={yPos}
                        stroke="#334155"
                        strokeDasharray="3 3"
                        opacity={0.4}
                      />
                      <text
                        x={pad.left - 8}
                        y={yPos + 4}
                        fill="#94a3b8"
                        fontSize="10"
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        {yVal.toFixed(1)}%
                      </text>
                    </g>
                  );
                })}

                {/* X Axis ticks */}
                {[1, 2, 5, 10, 20, 30].map(t => {
                  const xPos = stressSvg.scaleX(t);
                  return (
                    <g key={t}>
                      <line x1={xPos} y1={svgHeight - pad.bottom} x2={xPos} y2={svgHeight - pad.bottom + 4} stroke="#64748b" />
                      <text
                        x={xPos}
                        y={svgHeight - pad.bottom + 16}
                        fill="#94a3b8"
                        fontSize="10"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        {t}Y
                      </text>
                    </g>
                  );
                })}

                {/* Paths */}
                <path d={stressSvg.basePath} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
                <path d={stressSvg.shockedPath} fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeDasharray="5 5" />
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
