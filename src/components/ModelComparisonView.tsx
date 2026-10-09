import React, { useState, useEffect } from 'react';
import { Portfolio, SimulationModelType } from '../types/risk';
import { runPortfolioSimulation } from '../engine/models';
import { runSimulationAsync } from '../engine/simulation-runner';
import { GitCompare, Play, CheckCircle2, TrendingDown } from 'lucide-react';

interface ModelComparisonViewProps {
  portfolio: Portfolio;
  currencySymbol?: string;
}

interface ModelEvalRow {
  id: SimulationModelType;
  name: string;
  category: string;
  var99: number;
  es99: number;
  maxDrawdown: number;
  kurtosis: number;
  skewness: number;
  runtimeMs: number;
  keyAssumption: string;
}

export const ModelComparisonView: React.FC<ModelComparisonViewProps> = ({
  portfolio,
  currencySymbol = '$',
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [comparisonResults, setComparisonResults] = useState<ModelEvalRow[]>([]);

  const modelsToCompare: {
    id: SimulationModelType;
    name: string;
    category: string;
    keyAssumption: string;
  }[] = [
    {
      id: 'gbm',
      name: 'Geometric Brownian Motion (GBM)',
      category: 'Parametric Normal',
      keyAssumption: 'Constant volatility σ, log-normal independent increments (Underestimates tail risk)',
    },
    {
      id: 'bootstrap',
      name: 'Historical Bootstrap',
      category: 'Non-Parametric Empirical',
      keyAssumption: 'Resamples empirical historical return distribution, preserving empirical fat tails',
    },
    {
      id: 'student_t',
      name: 'Student-t Monte Carlo (ν=5)',
      category: 'Fat-Tail Leptokurtic',
      keyAssumption: 'Power-law fat tails; extreme multi-sigma crashes occur far more frequently than normal',
    },
    {
      id: 'garch',
      name: 'GARCH(1,1)',
      category: 'Time-Varying Volatility',
      keyAssumption: 'Volatility clusters dynamically; quiet periods followed by clustered high-vol regimes',
    },
    {
      id: 'gjr_garch',
      name: 'GJR-GARCH Asymmetric',
      category: 'Leverage Asymmetry',
      keyAssumption: 'Captures leverage effect: negative market drops trigger larger volatility explosions than rallies',
    },
    {
      id: 'heston',
      name: 'Heston Stochastic Volatility',
      category: 'Continuous Stoch Vol',
      keyAssumption: 'Volatility itself follows a CIR square-root stochastic differential equation with negative spot-vol correlation',
    },
    {
      id: 'regime_switching',
      name: '3-State Markov Regime Switching',
      category: 'Hidden Markov Model',
      keyAssumption: 'Market shifts between Bull, Stressed, and Crisis statistical states with transition matrix P_ij',
    },
    {
      id: 'copula',
      name: 'Student-t Copula Simulation',
      category: 'Non-Linear Tail Dependence',
      keyAssumption: 'Models joint tail co-movements; assets crash together in crisis beyond linear Pearson correlation',
    },
    {
      id: 'bayesian_hybrid',
      name: 'Bayesian Regime-Switching 2026',
      category: 'State-of-the-Art Research',
      keyAssumption: 'Integrates Bayesian parameter uncertainty (posterior sampling of μ, σ) with Markov regime jumps',
    },
  ];

  const runAllComparisons = async () => {
    setLoading(true);
    const rows: ModelEvalRow[] = [];

    for (const m of modelsToCompare) {
      try {
        const res = await runSimulationAsync(portfolio, {
          model: m.id,
          paths: 10000,
          timeHorizonDays: 21,
          varianceReduction: 'antithetic',
          hardwareEngine: 'cpu_worker',
          confidenceLevels: [0.95, 0.99],
        });

        rows.push({
          id: m.id,
          name: m.name,
          category: m.category,
          var99: res.riskMetrics.var99,
          es99: res.riskMetrics.es99,
          maxDrawdown: res.riskMetrics.maxDrawdown,
          kurtosis: res.riskMetrics.kurtosis,
          skewness: res.riskMetrics.skewness,
          runtimeMs: res.executionTimeMs,
          keyAssumption: m.keyAssumption,
        });
      } catch {
        const res = runPortfolioSimulation(portfolio, {
          model: m.id,
          paths: 10000,
          timeHorizonDays: 21,
          varianceReduction: 'antithetic',
          hardwareEngine: 'cpu_worker',
          confidenceLevels: [0.95, 0.99],
        });
        rows.push({
          id: m.id,
          name: m.name,
          category: m.category,
          var99: res.riskMetrics.var99,
          es99: res.riskMetrics.es99,
          maxDrawdown: res.riskMetrics.maxDrawdown,
          kurtosis: res.riskMetrics.kurtosis,
          skewness: res.riskMetrics.skewness,
          runtimeMs: res.executionTimeMs,
          keyAssumption: m.keyAssumption,
        });
      }
    }

    setComparisonResults(rows);
    setLoading(false);
  };

  useEffect(() => {
    runAllComparisons();
  }, [portfolio.id, portfolio.totalCapital]);

  const maxVaR = Math.max(...comparisonResults.map((r) => r.var99), 1);

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner & Control */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 rounded-xl border border-slate-800 p-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-cyan-400" />
            <span>Multi-Model Quantitative Comparison Matrix</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            "How do different statistical assumptions affect estimated portfolio risk?" Compare 9
            benchmark, fat-tailed, volatility-clustering, regime-switching, and copula models on an
            identical portfolio.
          </p>
        </div>

        <button
          onClick={runAllComparisons}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{loading ? 'Evaluating 9 Models...' : 'Re-run Comparison'}</span>
        </button>
      </div>

      {/* Visual Relative VaR Comparison Bar Chart */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4">
        <div className="text-xs font-semibold text-slate-200 mb-3 flex items-center justify-between">
          <span>99% Value at Risk (1-Month / 21-Day Horizon) Across Models</span>
          <span className="text-slate-400 font-mono text-[11px]">
            Baseline GBM vs Fat-Tailed & Regime Models
          </span>
        </div>

        <div className="space-y-2.5">
          {comparisonResults.map((row) => {
            const pct = (row.var99 / maxVaR) * 100;
            const isBenchmark = row.id === 'gbm';
            const isAdvanced = row.id === 'bayesian_hybrid' || row.id === 'regime_switching';

            return (
              <div key={row.id} className="font-mono text-xs">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-200">{row.name}</span>
                    <span className="text-[10px] text-slate-500 font-sans">({row.category})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-[11px]">
                      ES: {currencySymbol}{row.es99.toLocaleString()}
                    </span>
                    <span
                      className={`font-bold tabular-nums ${
                        isBenchmark
                          ? 'text-slate-300'
                          : isAdvanced
                          ? 'text-cyan-400'
                          : 'text-amber-400'
                      }`}
                    >
                      VaR: {currencySymbol}{row.var99.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800/80">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isBenchmark
                        ? 'bg-slate-500'
                        : isAdvanced
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-500'
                        : 'bg-gradient-to-r from-amber-500 to-rose-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Comprehensive Academic Table */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 overflow-x-auto">
        <table className="w-full text-xs font-mono border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-left bg-slate-950/60">
              <th className="py-2.5 px-3 font-medium">Model</th>
              <th className="py-2.5 px-3 font-medium">Framework</th>
              <th className="py-2.5 px-3 font-medium text-right">99% VaR</th>
              <th className="py-2.5 px-3 font-medium text-right">99% ES</th>
              <th className="py-2.5 px-3 font-medium text-right">Max Drawdown</th>
              <th className="py-2.5 px-3 font-medium text-right">Excess Kurtosis</th>
              <th className="py-2.5 px-3 font-medium text-right">Runtime</th>
              <th className="py-2.5 px-3 font-medium text-left">Key Structural Hypothesis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {comparisonResults.map((row) => (
              <tr key={row.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-2.5 px-3 font-semibold text-slate-200 whitespace-nowrap">
                  {row.name}
                </td>
                <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                  <span className="text-[11px] px-1.5 py-0.5 rounded-sm bg-slate-800 text-slate-300">
                    {row.category}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right text-red-400 font-bold tabular-nums">
                  {currencySymbol}{row.var99.toLocaleString()}
                </td>
                <td className="py-2.5 px-3 text-right text-rose-300 font-semibold tabular-nums">
                  {currencySymbol}{row.es99.toLocaleString()}
                </td>
                <td className="py-2.5 px-3 text-right text-amber-300 tabular-nums">
                  {(row.maxDrawdown * 100).toFixed(1)}%
                </td>
                <td className="py-2.5 px-3 text-right text-cyan-400 tabular-nums">
                  +{row.kurtosis.toFixed(2)}
                </td>
                <td className="py-2.5 px-3 text-right text-slate-400 tabular-nums">
                  {row.runtimeMs}ms
                </td>
                <td className="py-2.5 px-3 text-slate-400 font-sans text-[11px] max-w-sm">
                  {row.keyAssumption}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
