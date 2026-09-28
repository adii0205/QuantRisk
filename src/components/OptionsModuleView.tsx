import React, { useState } from 'react';
import { OptionPosition, Portfolio } from '../types/risk';
import {
  calculateBlackScholes,
  calculateOptionsVolatilityShock,
  OPTION_STRATEGIES,
  StrategyTemplate,
} from '../engine/options';
import { Layers, Activity, TrendingUp, AlertCircle, Plus, Trash2 } from 'lucide-react';

interface OptionsModuleViewProps {
  portfolio: Portfolio;
  currencySymbol?: string;
}

export const OptionsModuleView: React.FC<OptionsModuleViewProps> = ({
  portfolio,
  currencySymbol = '$',
}) => {
  // Use first equity asset as primary underlying e.g. Reliance or NVDA
  const primaryAsset = portfolio.assets[0];
  const spotPrice = primaryAsset?.currentPrice ?? 100;

  const [positions, setPositions] = useState<OptionPosition[]>([
    {
      id: 'opt_1',
      underlying: primaryAsset?.symbol ?? 'RELIANCE',
      type: 'put',
      strike: Math.round(spotPrice * 0.95),
      expiryDays: 30,
      impliedVol: 0.24,
      quantity: 10, // Long 10 puts
      premium: 0,
    },
    {
      id: 'opt_2',
      underlying: primaryAsset?.symbol ?? 'RELIANCE',
      type: 'call',
      strike: Math.round(spotPrice * 1.05),
      expiryDays: 30,
      impliedVol: 0.22,
      quantity: -10, // Short 10 calls (collar / covered)
      premium: 0,
    },
  ]);

  const [volShockPercent, setVolShockPercent] = useState<number>(0.3); // +30% shock

  const handleApplyStrategy = (strat: StrategyTemplate) => {
    const newPositions: OptionPosition[] = strat.legs.map((leg, i) => ({
      id: `opt_${Date.now()}_${i}`,
      underlying: primaryAsset?.symbol ?? 'ASSET',
      type: leg.type,
      strike: Math.round(spotPrice * (1 + leg.strikeOffsetPercent)),
      expiryDays: leg.expiryDays,
      impliedVol: 0.22,
      quantity: leg.quantity * 10,
      premium: 0,
    }));
    setPositions(newPositions);
  };

  const handleAddCustomLeg = () => {
    const newLeg: OptionPosition = {
      id: `opt_${Date.now()}`,
      underlying: primaryAsset?.symbol ?? 'ASSET',
      type: 'call',
      strike: Math.round(spotPrice),
      expiryDays: 30,
      impliedVol: 0.22,
      quantity: 5,
      premium: 0,
    };
    setPositions([...positions, newLeg]);
  };

  const handleRemoveLeg = (id: string) => {
    setPositions(positions.filter((p) => p.id !== id));
  };

  const volShockResult = calculateOptionsVolatilityShock(positions, spotPrice, volShockPercent);

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 rounded-xl border border-slate-800 p-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <span>Options Greeks & Volatility Surface Risk Engine</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Basel III & FRTB mandate modeling non-linear curvature risks: Delta, Gamma, Vega, Theta,
            and Rho. Simulate sudden implied volatility expansions on option structures.
          </p>
        </div>

        {/* Strategy Templates */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950/80 rounded-lg border border-slate-800/80">
          {OPTION_STRATEGIES.map((strat) => (
            <button
              key={strat.type}
              onClick={() => handleApplyStrategy(strat)}
              className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-cyan-300 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              {strat.name.split(' ')[0]} {strat.name.split(' ')[1]}
            </button>
          ))}
        </div>
      </div>

      {/* Aggregate Portfolio Greeks Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs">
        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Net Delta (Δ)</div>
          <div className="text-lg font-bold text-cyan-400 mt-0.5 tabular-nums">
            {volShockResult.totalDelta > 0 ? '+' : ''}{volShockResult.totalDelta}
          </div>
          <div className="text-[10px] text-slate-500">Directional share equiv</div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Net Gamma (Γ)</div>
          <div className="text-lg font-bold text-sky-400 mt-0.5 tabular-nums">
            {volShockResult.totalGamma > 0 ? '+' : ''}{volShockResult.totalGamma}
          </div>
          <div className="text-[10px] text-slate-500">Curvature acceleration</div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Net Vega (ν)</div>
          <div className="text-lg font-bold text-amber-400 mt-0.5 tabular-nums">
            {currencySymbol}{volShockResult.totalVega}
          </div>
          <div className="text-[10px] text-slate-500">Per 1% IV shift</div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Vol Shock P&L (+{(volShockPercent * 100).toFixed(0)}%)</div>
          <div
            className={`text-lg font-bold mt-0.5 tabular-nums ${
              volShockResult.valueChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {volShockResult.valueChange >= 0 ? '+' : ''}
            {currencySymbol}{volShockResult.valueChange.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500">Non-linear jump impact</div>
        </div>

        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Underlying Spot Price</div>
          <div className="text-lg font-bold text-slate-200 mt-0.5 tabular-nums">
            {currencySymbol}{spotPrice}
          </div>
          <div className="text-[10px] text-slate-500">{primaryAsset.symbol}</div>
        </div>
      </div>

      {/* Volatility Shock Slider */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 font-mono text-xs">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-200 font-semibold font-sans">
              "What happens if volatility suddenly expands +{(volShockPercent * 100).toFixed(0)}%?"
            </span>
          </div>
          <span className="text-cyan-400 font-bold tabular-nums">
            +{(volShockPercent * 100).toFixed(0)}% Volatility Spike
          </span>
        </div>
        <input
          type="range"
          min={-0.3}
          max={1.5}
          step={0.05}
          value={volShockPercent}
          onChange={(e) => setVolShockPercent(Number(e.target.value))}
          className="w-full accent-cyan-400 cursor-pointer"
        />
        <div className="flex justify-between text-[11px] text-slate-500 mt-1">
          <span>-30% IV Crush (Post-Earnings)</span>
          <span>Baseline (0%)</span>
          <span>+30% Flash Spike</span>
          <span>+80% Crisis Shock</span>
          <span>+150% Systemic Panic</span>
        </div>
      </div>

      {/* Active Options Table */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-200">
            Derivative Overlay Book ({positions.length} Legs)
          </span>
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
                <th className="py-2.5 px-3 font-medium">Underlying</th>
                <th className="py-2.5 px-3 font-medium">Type</th>
                <th className="py-2.5 px-3 font-medium text-right">Strike</th>
                <th className="py-2.5 px-3 font-medium text-right">Expiry (Days)</th>
                <th className="py-2.5 px-3 font-medium text-right">Implied Vol</th>
                <th className="py-2.5 px-3 font-medium text-right">Contracts</th>
                <th className="py-2.5 px-3 font-medium text-right">Theo Price</th>
                <th className="py-2.5 px-3 font-medium text-right">Delta (Δ)</th>
                <th className="py-2.5 px-3 font-medium text-right">Vega (ν)</th>
                <th className="py-2.5 px-3 font-medium text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {positions.map((pos) => {
                const greeks = calculateBlackScholes(
                  spotPrice,
                  pos.strike,
                  pos.expiryDays / 365,
                  0.045,
                  pos.impliedVol,
                  pos.type
                );
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
                    <td className="py-2.5 px-3 text-right text-slate-200 tabular-nums font-semibold">
                      {currencySymbol}{pos.strike}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300 tabular-nums">
                      {pos.expiryDays}d
                    </td>
                    <td className="py-2.5 px-3 text-right text-cyan-400 tabular-nums">
                      {(pos.impliedVol * 100).toFixed(0)}%
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-bold">
                      <span className={pos.quantity >= 0 ? 'text-cyan-400' : 'text-rose-400'}>
                        {pos.quantity >= 0 ? `+${pos.quantity}` : pos.quantity}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300 tabular-nums">
                      {currencySymbol}{greeks.theoreticalPrice}
                    </td>
                    <td className="py-2.5 px-3 text-right text-sky-400 tabular-nums">
                      {greeks.delta}
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-400 tabular-nums">
                      {currencySymbol}{greeks.vega}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => handleRemoveLeg(pos.id)}
                        className="p-1 hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 rounded-md transition-colors cursor-pointer"
                        title="Remove option leg"
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
      </div>
    </div>
  );
};
