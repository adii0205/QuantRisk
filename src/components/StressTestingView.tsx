import React, { useState } from 'react';
import { Portfolio } from '../types/risk';
import {
  evaluateStressScenario,
  PREDEFINED_STRESS_SCENARIOS,
  StressEvaluationResult,
} from '../engine/stress';
import { ShieldAlert, Zap, AlertTriangle, ArrowDownRight, Layers } from 'lucide-react';

interface StressTestingViewProps {
  portfolio: Portfolio;
  currencySymbol?: string;
}

export const StressTestingView: React.FC<StressTestingViewProps> = ({
  portfolio,
  currencySymbol = '$',
}) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('gfc_2008');
  const [customShocks, setCustomShocks] = useState({
    equities: -0.25,
    rates: 150,
    volatility: 0.85,
    commodities: -0.15,
    fx: 0.08,
  });

  const isCustom = selectedScenarioId === 'custom';

  const activeScenario = PREDEFINED_STRESS_SCENARIOS.find((s) => s.id === selectedScenarioId);

  const evaluationResult: StressEvaluationResult = evaluateStressScenario(
    portfolio,
    isCustom
      ? customShocks
      : activeScenario?.shocks ?? {
          equities: -0.2,
          rates: 0,
          volatility: 0.5,
          commodities: 0,
          fx: 0,
        },
    isCustom ? 'Custom Stressed Portfolio' : activeScenario?.name ?? 'Historical Replay'
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 rounded-xl border border-slate-800 p-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <span>Macro Stress Testing & Historical Crisis Replay Engine</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Replay historical systemic shocks against your current portfolio or dial in custom
            asymmetric multi-factor crisis conditions to evaluate tail capital destruction.
          </p>
        </div>

        {/* Scenario Selector Pills */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950/80 rounded-lg border border-slate-800/80">
          {PREDEFINED_STRESS_SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedScenarioId(s.id)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                selectedScenarioId === s.id
                  ? 'bg-rose-950 text-rose-300 border border-rose-800/60 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s.name.split(' ')[0]} {s.name.split(' ')[1]}
            </button>
          ))}
          <button
            onClick={() => setSelectedScenarioId('custom')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              isCustom
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Custom Stress Lab
          </button>
        </div>
      </div>

      {/* Scenario Overview / Custom Controls */}
      {isCustom ? (
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4">
          <div className="text-xs font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <span>Custom Stress Sliders</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4 font-mono text-xs">
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Equity Shock</span>
                <span className="text-rose-400 font-bold">
                  {(customShocks.equities * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={-0.5}
                max={0.2}
                step={0.01}
                value={customShocks.equities}
                onChange={(e) =>
                  setCustomShocks({ ...customShocks, equities: Number(e.target.value) })
                }
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Interest Rates</span>
                <span className="text-amber-400 font-bold">
                  {customShocks.rates > 0 ? `+${customShocks.rates}` : customShocks.rates} bps
                </span>
              </div>
              <input
                type="range"
                min={-200}
                max={450}
                step={25}
                value={customShocks.rates}
                onChange={(e) =>
                  setCustomShocks({ ...customShocks, rates: Number(e.target.value) })
                }
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Volatility Spike</span>
                <span className="text-cyan-400 font-bold">
                  +{(customShocks.volatility * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2.5}
                step={0.05}
                value={customShocks.volatility}
                onChange={(e) =>
                  setCustomShocks({ ...customShocks, volatility: Number(e.target.value) })
                }
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Commodities Shock</span>
                <span className="text-amber-400 font-bold">
                  {customShocks.commodities >= 0 ? '+' : ''}
                  {(customShocks.commodities * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={-0.5}
                max={0.5}
                step={0.02}
                value={customShocks.commodities}
                onChange={(e) =>
                  setCustomShocks({ ...customShocks, commodities: Number(e.target.value) })
                }
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>FX / USD Devaluation</span>
                <span className="text-slate-200 font-bold">
                  {customShocks.fx >= 0 ? '+' : ''}
                  {(customShocks.fx * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={-0.2}
                max={0.3}
                step={0.01}
                value={customShocks.fx}
                onChange={(e) => setCustomShocks({ ...customShocks, fx: Number(e.target.value) })}
                className="w-full accent-slate-400 cursor-pointer"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 font-mono text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-slate-100 font-semibold text-sm">{activeScenario?.name}</span>
              <span className="text-slate-500 mx-2">·</span>
              <span className="text-slate-400">{activeScenario?.period}</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <span>Equities: <strong className="text-rose-400">{((activeScenario?.shocks.equities ?? 0) * 100).toFixed(0)}%</strong></span>
              <span>·</span>
              <span>Vol: <strong className="text-cyan-400">+{(Math.round((activeScenario?.shocks.volatility ?? 0) * 100))}%</strong></span>
              <span>·</span>
              <span>Rates: <strong className="text-amber-400">{activeScenario?.shocks.rates} bps</strong></span>
            </div>
          </div>
          <p className="mt-2 text-slate-400 font-sans text-xs">{activeScenario?.description}</p>
        </div>
      )}

      {/* Stress Impact KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-xs font-mono">Immediate Stressed Loss</div>
          <div className="text-2xl font-bold font-mono text-rose-400 mt-1 tabular-nums">
            {currencySymbol}{Math.abs(evaluationResult.portfolioLossAmount).toLocaleString()}
          </div>
          <div className="text-xs font-mono text-rose-300 mt-0.5">
            {evaluationResult.portfolioLossPercent}% total drawdown
          </div>
        </div>

        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-xs font-mono">Post-Shock Portfolio Value</div>
          <div className="text-2xl font-bold font-mono text-slate-100 mt-1 tabular-nums">
            {currencySymbol}{evaluationResult.shockedPortfolioValue.toLocaleString()}
          </div>
          <div className="text-xs font-mono text-slate-500 mt-0.5">
            Pre-shock: {currencySymbol}{portfolio.totalCapital.toLocaleString()}
          </div>
        </div>

        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-xs font-mono">Stressed 99% VaR</div>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1 tabular-nums">
            {currencySymbol}{evaluationResult.shockedVaR99.toLocaleString()}
          </div>
          <div className="text-xs font-mono text-amber-300/80 mt-0.5">
            Post-shock ongoing daily risk
          </div>
        </div>

        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-xs font-mono">Stressed Expected Shortfall</div>
          <div className="text-2xl font-bold font-mono text-red-400 mt-1 tabular-nums">
            {currencySymbol}{evaluationResult.shockedES99.toLocaleString()}
          </div>
          <div className="text-xs font-mono text-red-300/80 mt-0.5">
            Worst-case tail expectation
          </div>
        </div>
      </div>

      {/* Asset Loss Waterfall & Breakdown Table */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4">
        <div className="text-xs font-semibold text-slate-200 mb-3 flex items-center justify-between">
          <span>Component Asset P&L Destruction in this Stress Regime</span>
          <span className="text-slate-400 font-mono text-[11px]">
            Ranked by Vulnerability Contribution
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-left bg-slate-950/60">
                <th className="py-2.5 px-3 font-medium">Position</th>
                <th className="py-2.5 px-3 font-medium text-right">Asset Stress Return</th>
                <th className="py-2.5 px-3 font-medium text-right">Dollar P&L Impact</th>
                <th className="py-2.5 px-3 font-medium text-right w-44">Share of Total Portfolio Loss</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {evaluationResult.assetLossBreakdown.map((row) => (
                <tr key={row.symbol} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-slate-200">{row.symbol}</td>
                  <td className="py-2.5 px-3 text-right text-rose-400 font-semibold tabular-nums">
                    {row.assetLossPercent}%
                  </td>
                  <td className="py-2.5 px-3 text-right text-rose-400 font-bold tabular-nums">
                    {currencySymbol}{Math.abs(row.assetLossAmount).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-24 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-rose-500 h-full rounded-full"
                          style={{ width: `${Math.max(2, Math.abs(row.contributionToLoss))}%` }}
                        />
                      </div>
                      <span className="text-slate-300 w-10 text-right tabular-nums">
                        {Math.abs(row.contributionToLoss)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
