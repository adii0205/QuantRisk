import React, { useState, useMemo } from 'react';
import { OptionPosition, Portfolio } from '../types/risk';
import {
  calculateBlackScholes,
  calculateFrtbCurvatureCharge,
  calculateOptionsVolatilityShock,
  OPTION_STRATEGIES,
  priceAmericanCRR,
  revalueOptionFull,
  revalueOptionTaylor,
  solveImpliedVolatility,
  StrategyTemplate,
} from '../engine/options';
import {
  applyVolSurfaceShock,
  calibrateVolSurface,
  getLiquidIndexSurfaceQuotes,
  interpolateVolSurface,
  OptionMarketQuote,
  VolSurfaceCalibration,
  VolSurfaceShock,
} from '../engine/vol-surface';
import {
  Layers,
  Activity,
  TrendingUp,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sliders,
  Table,
  Grid3X3,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface OptionsModuleViewProps {
  portfolio: Portfolio;
  onUpdatePortfolioOptions?: (options: OptionPosition[]) => void;
  currencySymbol?: string;
}

export const OptionsModuleView: React.FC<OptionsModuleViewProps> = ({
  portfolio,
  onUpdatePortfolioOptions,
  currencySymbol = '$',
}) => {
  const primaryAsset = portfolio.assets[0];
  const spotPrice = primaryAsset?.currentPrice ?? 100;

  const [activeSubTab, setActiveSubTab] = useState<'positions' | 'surface' | 'frtb'>('positions');
  const [exerciseStyle, setExerciseStyle] = useState<'european' | 'american'>('european');
  const [dividendYield, setDividendYield] = useState<number>(0.015); // 1.5% continuous dividend
  const [riskFreeRate, setRiskFreeRate] = useState<number>(0.045); // 4.5% risk free

  // Active option positions book
  const [positions, setPositions] = useState<OptionPosition[]>(() => {
    if (portfolio.options && portfolio.options.length > 0) {
      return portfolio.options;
    }
    return [
      {
        id: 'opt_1',
        underlying: primaryAsset?.symbol ?? 'SPY',
        type: 'put',
        style: 'european',
        strike: Math.round(spotPrice * 0.95),
        expiryDays: 30,
        impliedVol: 0.22,
        quantity: 10, // Long 10 puts (downside floor hedge)
        premium: 0,
        dividendYield: 0.015,
      },
      {
        id: 'opt_2',
        underlying: primaryAsset?.symbol ?? 'SPY',
        type: 'call',
        style: 'european',
        strike: Math.round(spotPrice * 1.05),
        expiryDays: 30,
        impliedVol: 0.19,
        quantity: -10, // Short 10 calls (covered collar)
        premium: 0,
        dividendYield: 0.015,
      },
    ];
  });

  // Volatility Surface Shocks
  const [surfaceShock, setSurfaceShock] = useState<VolSurfaceShock>({
    levelBps: 0,
    skewTilt: 0,
    curvature: 0,
    termStructureSlope: 0,
    dynamics: 'sticky_strike',
  });

  // Base institutional liquid quotes
  const baseQuotes = useMemo(() => getLiquidIndexSurfaceQuotes(spotPrice), [spotPrice]);

  // Calibrated SVI Volatility Surface
  const baseSurface = useMemo(() => {
    return calibrateVolSurface(baseQuotes, spotPrice, riskFreeRate, dividendYield);
  }, [baseQuotes, spotPrice, riskFreeRate, dividendYield]);

  // Shocked surface
  const shockedSurface = useMemo(() => {
    return applyVolSurfaceShock(baseSurface, surfaceShock);
  }, [baseSurface, surfaceShock]);

  // Synchronize options with main Portfolio Monte Carlo simulation
  const handleSyncToPortfolio = () => {
    if (onUpdatePortfolioOptions) {
      onUpdatePortfolioOptions(positions);
    }
  };

  const handleApplyStrategy = (strat: StrategyTemplate) => {
    const newPositions: OptionPosition[] = strat.legs.map((leg, i) => {
      const strike = Math.round(spotPrice * (1 + leg.strikeOffsetPercent));
      const iv = interpolateVolSurface(
        shockedSurface,
        strike,
        leg.expiryDays,
        spotPrice,
        surfaceShock.dynamics
      );
      return {
        id: `opt_${Date.now()}_${i}`,
        underlying: primaryAsset?.symbol ?? 'ASSET',
        type: leg.type,
        style: exerciseStyle,
        strike,
        expiryDays: leg.expiryDays,
        impliedVol: Math.round(iv * 1000) / 1000,
        quantity: leg.quantity * 10,
        premium: 0,
        dividendYield,
      };
    });
    setPositions(newPositions);
    if (onUpdatePortfolioOptions) {
      onUpdatePortfolioOptions(newPositions);
    }
  };

  const handleAddCustomLeg = () => {
    const newLeg: OptionPosition = {
      id: `opt_${Date.now()}`,
      underlying: primaryAsset?.symbol ?? 'ASSET',
      type: 'call',
      style: exerciseStyle,
      strike: Math.round(spotPrice),
      expiryDays: 30,
      impliedVol: 0.20,
      quantity: 5,
      premium: 0,
      dividendYield,
    };
    const updated = [...positions, newLeg];
    setPositions(updated);
    if (onUpdatePortfolioOptions) {
      onUpdatePortfolioOptions(updated);
    }
  };

  const handleRemoveLeg = (id: string) => {
    const updated = positions.filter((p) => p.id !== id);
    setPositions(updated);
    if (onUpdatePortfolioOptions) {
      onUpdatePortfolioOptions(updated);
    }
  };

  // Portfolio volatility shock calculations
  const volShockResult = useMemo(() => {
    return calculateOptionsVolatilityShock(positions, spotPrice, surfaceShock.levelBps / 10000);
  }, [positions, spotPrice, surfaceShock.levelBps]);

  // FRTB Curvature Charge calculation
  const frtbResult = useMemo(() => {
    return calculateFrtbCurvatureCharge(positions, spotPrice, 0.30, riskFreeRate);
  }, [positions, spotPrice, riskFreeRate]);

  // Aggregate Greeks across all positions including 2nd-order Greeks
  const aggregateGreeks = useMemo(() => {
    let delta = 0;
    let gamma = 0;
    let vega = 0;
    let theta = 0;
    let rho = 0;
    let vanna = 0;
    let volga = 0;
    let charm = 0;
    let totalValue = 0;

    for (const p of positions) {
      const greeks = calculateBlackScholes(
        spotPrice,
        p.strike,
        p.expiryDays / 365,
        riskFreeRate,
        p.impliedVol,
        p.type,
        dividendYield
      );
      const mult = p.quantity * 100;
      delta += greeks.delta * mult;
      gamma += greeks.gamma * mult;
      vega += greeks.vega * mult;
      theta += greeks.theta * mult;
      rho += greeks.rho * mult;
      vanna += greeks.vanna * mult;
      volga += greeks.volga * mult;
      charm += greeks.charm * mult;

      const price =
        p.style === 'american'
          ? priceAmericanCRR(
              spotPrice,
              p.strike,
              p.expiryDays / 365,
              riskFreeRate,
              dividendYield,
              p.impliedVol,
              p.type,
              60
            )
          : greeks.theoreticalPrice;
      totalValue += price * mult;
    }

    return {
      delta: Math.round(delta * 100) / 100,
      gamma: Math.round(gamma * 1000) / 1000,
      vega: Math.round(vega),
      theta: Math.round(theta * 10) / 10,
      rho: Math.round(rho * 10) / 10,
      vanna: Math.round(vanna * 10) / 10,
      volga: Math.round(volga * 10) / 10,
      charm: Math.round(charm * 100) / 100,
      totalValue: Math.round(totalValue),
    };
  }, [positions, spotPrice, riskFreeRate, dividendYield]);

  // Revaluation Taylor vs Full check on a hypothetical -10% spot crash
  const taylorVsFullShockCheck = useMemo(() => {
    const crashSpot = spotPrice * 0.90; // -10% crash
    let fullPnl = 0;
    let taylorPnl = 0;

    for (const p of positions) {
      const g = calculateBlackScholes(
        spotPrice,
        p.strike,
        p.expiryDays / 365,
        riskFreeRate,
        p.impliedVol,
        p.type,
        dividendYield
      );
      const full = revalueOptionFull(p, spotPrice, crashSpot, 21, p.impliedVol, riskFreeRate);
      const taylor = revalueOptionTaylor(p, spotPrice, crashSpot, g, p.impliedVol);
      fullPnl += full.pnl;
      taylorPnl += taylor.totalTaylorPnl;
    }

    const absDiff = Math.abs(fullPnl - taylorPnl);
    const relDiff = Math.abs(fullPnl) > 1e-4 ? (absDiff / Math.abs(fullPnl)) * 100 : 0;

    return {
      fullPnl: Math.round(fullPnl),
      taylorPnl: Math.round(taylorPnl),
      absDiff: Math.round(absDiff),
      relDiff: Math.round(relDiff * 10) / 10,
    };
  }, [positions, spotPrice, riskFreeRate, dividendYield]);

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 rounded-xl border border-slate-800 p-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100 font-sans">
              Derivatives, Options Greeks & SVI Volatility Surface Engine
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-semibold">
              PHASE 4
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Non-linear options pricing with continuous dividend yield (BSM / Garman-Kohlhagen), American
            early exercise (CRR), raw SVI surface calibration with Durrleman butterfly arbitrage
            guards, and FRTB SA Curvature Risk charges.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncToPortfolio}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-sm"
            title="Integrate active options book into primary Monte Carlo simulation"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Sync with Monte Carlo</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveSubTab('positions')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeSubTab === 'positions'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Table className="w-3.5 h-3.5" />
          <span>Option Positions & Greeks Book</span>
        </button>
        <button
          onClick={() => setActiveSubTab('surface')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeSubTab === 'surface'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Grid3X3 className="w-3.5 h-3.5" />
          <span>SVI Volatility Surface Matrix</span>
        </button>
        <button
          onClick={() => setActiveSubTab('frtb')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeSubTab === 'frtb'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>FRTB Curvature Capital Charge</span>
        </button>
      </div>

      {/* Strategy Templates Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <span>Presets:</span>
          {OPTION_STRATEGIES.map((strat) => (
            <button
              key={strat.type}
              onClick={() => handleApplyStrategy(strat)}
              className="px-2 py-1 text-xs font-medium text-slate-300 hover:text-cyan-300 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              {strat.name.split(' (')[0]}
            </button>
          ))}
        </div>

        {/* Exercise Style & Parameters */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded border border-slate-800">
            <span className="text-slate-500">Style:</span>
            <button
              onClick={() => setExerciseStyle('european')}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${
                exerciseStyle === 'european' ? 'bg-cyan-950 text-cyan-300 font-bold' : 'text-slate-400'
              }`}
            >
              European (BSM)
            </button>
            <button
              onClick={() => setExerciseStyle('american')}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${
                exerciseStyle === 'american' ? 'bg-cyan-950 text-cyan-300 font-bold' : 'text-slate-400'
              }`}
            >
              American (CRR)
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded border border-slate-800">
            <span className="text-slate-500">Div Yield q:</span>
            <span className="text-cyan-400 font-bold">{(dividendYield * 100).toFixed(1)}%</span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded border border-slate-800">
            <span className="text-slate-500">Rate r:</span>
            <span className="text-cyan-400 font-bold">{(riskFreeRate * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Aggregate Greeks & Risk KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 font-mono text-xs">
        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Net Delta (Δ)</div>
          <div className="text-base font-bold text-cyan-400 mt-0.5 tabular-nums">
            {aggregateGreeks.delta > 0 ? '+' : ''}{aggregateGreeks.delta}
          </div>
          <div className="text-[10px] text-slate-500">Share equivalent</div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Net Gamma (Γ)</div>
          <div className="text-base font-bold text-sky-400 mt-0.5 tabular-nums">
            {aggregateGreeks.gamma > 0 ? '+' : ''}{aggregateGreeks.gamma}
          </div>
          <div className="text-[10px] text-slate-500">Curvature dΔ/dS</div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Net Vega (ν)</div>
          <div className="text-base font-bold text-amber-400 mt-0.5 tabular-nums">
            {currencySymbol}{aggregateGreeks.vega}
          </div>
          <div className="text-[10px] text-slate-500">Per 1% IV shift</div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Net Theta (θ)</div>
          <div className="text-base font-bold text-rose-400 mt-0.5 tabular-nums">
            {currencySymbol}{aggregateGreeks.theta}/d
          </div>
          <div className="text-[10px] text-slate-500">Daily decay</div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Vanna (dΔ/dσ)</div>
          <div className="text-base font-bold text-purple-400 mt-0.5 tabular-nums">
            {aggregateGreeks.vanna > 0 ? '+' : ''}{aggregateGreeks.vanna}
          </div>
          <div className="text-[10px] text-slate-500">Cross Delta-Vol</div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Volga (dν/dσ)</div>
          <div className="text-base font-bold text-indigo-400 mt-0.5 tabular-nums">
            {currencySymbol}{aggregateGreeks.volga}
          </div>
          <div className="text-[10px] text-slate-500">Vega convexity</div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Charm (-dΔ/dt)</div>
          <div className="text-base font-bold text-teal-400 mt-0.5 tabular-nums">
            {aggregateGreeks.charm}
          </div>
          <div className="text-[10px] text-slate-500">Delta decay rate</div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Book Value</div>
          <div className="text-base font-bold text-slate-100 mt-0.5 tabular-nums">
            {currencySymbol}{aggregateGreeks.totalValue.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500">{positions.length} active legs</div>
        </div>
      </div>

      {/* Tab 1: Positions Table */}
      {activeSubTab === 'positions' && (
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-200">
                Derivative Overlay Book ({positions.length} Active Positions)
              </span>
              <span className="text-xs text-slate-500 ml-2">
                Underlying {primaryAsset.symbol} @ {currencySymbol}{spotPrice}
              </span>
            </div>
            <button
              onClick={handleAddCustomLeg}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-mono rounded-md transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Contract</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-left bg-slate-950/60">
                  <th className="py-2.5 px-3">Underlying</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Style</th>
                  <th className="py-2.5 px-3 text-right">Strike</th>
                  <th className="py-2.5 px-3 text-right">Expiry</th>
                  <th className="py-2.5 px-3 text-right">Implied Vol</th>
                  <th className="py-2.5 px-3 text-right">Contracts</th>
                  <th className="py-2.5 px-3 text-right">Theo Price</th>
                  <th className="py-2.5 px-3 text-right">Delta (Δ)</th>
                  <th className="py-2.5 px-3 text-right">Gamma (Γ)</th>
                  <th className="py-2.5 px-3 text-right">Vega (ν)</th>
                  <th className="py-2.5 px-3 text-right">Vanna</th>
                  <th className="py-2.5 px-3 text-right">Volga</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {positions.map((pos) => {
                  const g = calculateBlackScholes(
                    spotPrice,
                    pos.strike,
                    pos.expiryDays / 365,
                    riskFreeRate,
                    pos.impliedVol,
                    pos.type,
                    dividendYield
                  );
                  const theoPrice =
                    pos.style === 'american'
                      ? priceAmericanCRR(
                          spotPrice,
                          pos.strike,
                          pos.expiryDays / 365,
                          riskFreeRate,
                          dividendYield,
                          pos.impliedVol,
                          pos.type,
                          60
                        )
                      : g.theoreticalPrice;

                  return (
                    <tr key={pos.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-slate-200">{pos.underlying}</td>
                      <td className="py-2.5 px-3 uppercase font-semibold">
                        <span
                          className={
                            pos.type === 'call'
                              ? 'text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded-sm'
                              : 'text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded-sm'
                          }
                        >
                          {pos.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 capitalize">{pos.style ?? 'european'}</td>
                      <td className="py-2.5 px-3 text-right text-slate-200 tabular-nums font-semibold">
                        {currencySymbol}{pos.strike}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300 tabular-nums">
                        {pos.expiryDays}d
                      </td>
                      <td className="py-2.5 px-3 text-right text-cyan-400 tabular-nums">
                        {(pos.impliedVol * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold">
                        <span className={pos.quantity >= 0 ? 'text-cyan-400' : 'text-rose-400'}>
                          {pos.quantity >= 0 ? `+${pos.quantity}` : pos.quantity}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300 tabular-nums">
                        {currencySymbol}{theoPrice.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-sky-400 tabular-nums">{g.delta}</td>
                      <td className="py-2.5 px-3 text-right text-slate-300 tabular-nums">{g.gamma}</td>
                      <td className="py-2.5 px-3 text-right text-amber-400 tabular-nums">{currencySymbol}{g.vega}</td>
                      <td className="py-2.5 px-3 text-right text-purple-400 tabular-nums">{g.vanna}</td>
                      <td className="py-2.5 px-3 text-right text-indigo-400 tabular-nums">{g.volga}</td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => handleRemoveLeg(pos.id)}
                          className="p-1 hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Taylor vs Full Revaluation Verification Card */}
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-slate-200">
                Taylor 2nd-Order Expansion vs Full Revaluation Benchmark (-10% Stress Crash):
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-slate-400">
                Full Revaluation P&L: <strong className="text-cyan-300">{currencySymbol}{taylorVsFullShockCheck.fullPnl.toLocaleString()}</strong>
              </span>
              <span className="text-slate-400">
                Taylor (Δ-Γ-ν) P&L: <strong className="text-amber-300">{currencySymbol}{taylorVsFullShockCheck.taylorPnl.toLocaleString()}</strong>
              </span>
              <span className="text-slate-400">
                Discrepancy: <strong className="text-emerald-400">{taylorVsFullShockCheck.relDiff}%</strong>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: SVI Volatility Surface Matrix */}
      {activeSubTab === 'surface' && (
        <div className="flex flex-col gap-4">
          {/* Surface Scenario Sliders */}
          <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 font-mono text-xs">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-slate-200 font-sans">
                  Raw SVI Parameter Shocks: w(k) = a + b(ρ(k-m) + √((k-m)² + σ²))
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Dynamics:</span>
                <button
                  onClick={() =>
                    setSurfaceShock((prev) => ({
                      ...prev,
                      dynamics: prev.dynamics === 'sticky_strike' ? 'sticky_moneyness' : 'sticky_strike',
                    }))
                  }
                  className="px-2 py-0.5 bg-slate-800 text-cyan-300 rounded border border-slate-700 cursor-pointer"
                >
                  {surfaceShock.dynamics === 'sticky_strike' ? 'Sticky Strike' : 'Sticky Moneyness'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Level Shift:</span>
                  <span className="text-cyan-300 font-bold">{surfaceShock.levelBps} bps</span>
                </div>
                <input
                  type="range"
                  min={-500}
                  max={1500}
                  step={50}
                  value={surfaceShock.levelBps}
                  onChange={(e) =>
                    setSurfaceShock((prev) => ({ ...prev, levelBps: Number(e.target.value) }))
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Skew Tilt (Δρ):</span>
                  <span className="text-amber-300 font-bold">{surfaceShock.skewTilt.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={-0.3}
                  max={0.3}
                  step={0.02}
                  value={surfaceShock.skewTilt}
                  onChange={(e) =>
                    setSurfaceShock((prev) => ({ ...prev, skewTilt: Number(e.target.value) }))
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Wing Curvature (Δb):</span>
                  <span className="text-purple-300 font-bold">+{(surfaceShock.curvature * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={-0.4}
                  max={1.0}
                  step={0.05}
                  value={surfaceShock.curvature}
                  onChange={(e) =>
                    setSurfaceShock((prev) => ({ ...prev, curvature: Number(e.target.value) }))
                  }
                  className="w-full accent-purple-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Term Structure Slope:</span>
                  <span className="text-sky-300 font-bold">{surfaceShock.termStructureSlope.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={-0.1}
                  max={0.1}
                  step={0.01}
                  value={surfaceShock.termStructureSlope}
                  onChange={(e) =>
                    setSurfaceShock((prev) => ({ ...prev, termStructureSlope: Number(e.target.value) }))
                  }
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* SVI Slices Fit Diagnostics Table */}
          <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4">
            <h3 className="text-xs font-semibold text-slate-200 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>SVI Calibrated Slices & No-Arbitrage Verification</span>
              <span className="text-xs text-slate-500 font-mono font-normal">
                (Calendar Spread Free: {shockedSurface.calendarArbitrageFree ? 'YES' : 'FLAGGED'} | Durrleman Butterfly Free: {shockedSurface.butterflyArbitrageFree ? 'YES' : 'FLAGGED'})
              </span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-left bg-slate-950/60">
                    <th className="py-2 px-3">Expiry (Days)</th>
                    <th className="py-2 px-3 text-right">T (Years)</th>
                    <th className="py-2 px-3 text-right">Fwd Price</th>
                    <th className="py-2 px-3 text-right">a</th>
                    <th className="py-2 px-3 text-right">b</th>
                    <th className="py-2 px-3 text-right">ρ (Skew)</th>
                    <th className="py-2 px-3 text-right">m</th>
                    <th className="py-2 px-3 text-right">σ</th>
                    <th className="py-2 px-3 text-right">Durrleman min g(k)</th>
                    <th className="py-2 px-3 text-right">RMSE</th>
                    <th className="py-2 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {shockedSurface.slices.map((slice) => (
                    <tr key={slice.expiryDays} className="hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-semibold text-cyan-300">{slice.expiryDays}d</td>
                      <td className="py-2 px-3 text-right text-slate-400">{slice.T.toFixed(3)}</td>
                      <td className="py-2 px-3 text-right text-slate-200">{currencySymbol}{slice.forwardPrice.toFixed(1)}</td>
                      <td className="py-2 px-3 text-right text-slate-300">{slice.params.a.toFixed(4)}</td>
                      <td className="py-2 px-3 text-right text-slate-300">{slice.params.b.toFixed(4)}</td>
                      <td className="py-2 px-3 text-right text-amber-400">{slice.params.rho.toFixed(3)}</td>
                      <td className="py-2 px-3 text-right text-slate-300">{slice.params.m.toFixed(3)}</td>
                      <td className="py-2 px-3 text-right text-slate-300">{slice.params.sigma.toFixed(3)}</td>
                      <td className="py-2 px-3 text-right font-bold text-emerald-400">
                        {slice.minDurrlemanG >= 0 ? `+${slice.minDurrlemanG}` : slice.minDurrlemanG}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-400">{(slice.rmse * 100).toFixed(2)}%</td>
                      <td className="py-2 px-3 text-center">
                        {slice.butterflyArbitrageFree ? (
                          <span className="text-[10px] bg-emerald-950/60 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-800/40">
                            Arbitrage-Free
                          </span>
                        ) : (
                          <span className="text-[10px] bg-amber-950/60 text-amber-400 px-1.5 py-0.5 rounded border border-amber-800/40">
                            Butterfly Breach
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2D Heatmap Grid of Implied Volatilities across Strikes and Expiries */}
          <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4">
            <h3 className="text-xs font-semibold text-slate-200 mb-3">
              Volatility Surface Matrix (Strike Moneyness vs Tenor)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse text-center">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                    <th className="py-2 px-3 text-left">Tenor</th>
                    {shockedSurface.strikes.map((k) => (
                      <th key={k} className="py-2 px-3 font-medium">
                        {currencySymbol}{k} ({((k / spotPrice) * 100).toFixed(0)}%)
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {shockedSurface.slices.map((slice, rowIdx) => (
                    <tr key={slice.expiryDays} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 text-left font-semibold text-cyan-300">
                        {slice.expiryDays} Days
                      </td>
                      {shockedSurface.ivGrid[rowIdx]?.map((iv, colIdx) => {
                        const intensity = Math.min(1.0, Math.max(0, (iv - 0.12) / 0.25));
                        return (
                          <td
                            key={colIdx}
                            className="py-2.5 px-3 font-semibold"
                            style={{
                              backgroundColor: `rgba(6, 182, 212, ${0.08 + intensity * 0.4})`,
                              color: intensity > 0.6 ? '#67e8f9' : '#e2e8f0',
                            }}
                          >
                            {(iv * 100).toFixed(1)}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: FRTB SA Curvature Risk Charge */}
      {activeSubTab === 'frtb' && (
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 font-mono text-xs flex flex-col gap-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-100 font-sans flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>FRTB Standardized Approach (SA) Curvature Risk Capital (BCBS d457)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-sans">
              Measures incremental capital required for severe directional shocks (+30% / -30%) that
              exceed first-order linear delta hedging.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="text-slate-400">Upward Shock (+30%) Net CVR:</div>
              <div className="text-lg font-bold text-cyan-400 mt-1 tabular-nums">
                {currencySymbol}{frtbResult.cvrUp.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Non-linear convexity cushion</div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="text-slate-400">Downward Shock (-30%) Net CVR:</div>
              <div className="text-lg font-bold text-amber-400 mt-1 tabular-nums">
                {currencySymbol}{frtbResult.cvrDown.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Protective floor benefit</div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="text-slate-400">FRTB Curvature Capital Requirement:</div>
              <div className="text-lg font-bold text-emerald-400 mt-1 tabular-nums">
                {currencySymbol}{frtbResult.curvatureCharge.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Regulatory minimum reserve</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
