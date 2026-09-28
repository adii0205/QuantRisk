import React from 'react';
import { RiskMetrics } from '../types/risk';
import { ShieldCheck, TrendingDown, Percent, PieChart, Activity } from 'lucide-react';

interface RiskMetricsCardProps {
  metrics: RiskMetrics;
  portfolioCapital: number;
  currencySymbol?: string;
  executionTimeMs: number;
  throughput: number;
}

export const RiskMetricsCard: React.FC<RiskMetricsCardProps> = ({
  metrics,
  portfolioCapital,
  currencySymbol = '$',
  executionTimeMs,
  throughput,
}) => {
  return (
    <div className="flex flex-col bg-slate-900/90 rounded-xl border border-slate-800 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-100">
            Basel FRTB Tail Risk & Expected Shortfall Engine
          </span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400 font-mono">Internal Model Approach (IMA)</span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
          <span>Latency: <strong className="text-cyan-400 font-semibold">{executionTimeMs}ms</strong></span>
          <span>·</span>
          <span>Throughput: <strong className="text-slate-200">{throughput.toLocaleString()}</strong> paths/sec</span>
        </div>
      </div>

      {/* Primary 4 Core Risk Metric Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {/* 99% VaR */}
        <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
          <div className="text-[11px] text-slate-400 font-medium">99% Value at Risk (1-Day)</div>
          <div className="text-xl font-bold font-mono text-red-400 mt-1 tabular-nums">
            {currencySymbol}{metrics.var99.toLocaleString()}
          </div>
          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
            {((metrics.var99 / portfolioCapital) * 100).toFixed(2)}% of capital
          </div>
        </div>

        {/* 99% Expected Shortfall */}
        <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
          <div className="text-[11px] text-slate-400 font-medium">99% Expected Shortfall (ES)</div>
          <div className="text-xl font-bold font-mono text-rose-400 mt-1 tabular-nums">
            {currencySymbol}{metrics.es99.toLocaleString()}
          </div>
          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
            {((metrics.es99 / portfolioCapital) * 100).toFixed(2)}% conditional loss
          </div>
        </div>

        {/* Max Drawdown */}
        <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
          <div className="text-[11px] text-slate-400 font-medium">Simulated Max Drawdown</div>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1 tabular-nums">
            {(metrics.maxDrawdown * 100).toFixed(2)}%
          </div>
          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
            Peak-to-trough path loss
          </div>
        </div>

        {/* Sharpe & Vol */}
        <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
          <div className="text-[11px] text-slate-400 font-medium">Sharpe / Sortino Ratio</div>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1 tabular-nums">
            {metrics.sharpeRatio} <span className="text-xs font-normal text-slate-400">/ {metrics.sortinoRatio}</span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
            Ann Vol: {(metrics.portfolioAnnualVol * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Multi-Confidence VaR & ES Table */}
      <div className="mb-4 overflow-x-auto">
        <table className="w-full text-xs font-mono border-collapse bg-slate-950/40 rounded-lg overflow-hidden border border-slate-800/60">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/60">
              <th className="py-2 px-3 text-left font-medium">Confidence Level α</th>
              <th className="py-2 px-3 text-right font-medium">Value at Risk (VaR)</th>
              <th className="py-2 px-3 text-right font-medium">VaR % Capital</th>
              <th className="py-2 px-3 text-right font-medium">Expected Shortfall (ES)</th>
              <th className="py-2 px-3 text-right font-medium">ES % Capital</th>
              <th className="py-2 px-3 text-right font-medium">EVT Extrapolated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            <tr>
              <td className="py-2 px-3 text-slate-300 font-medium">90.0% (FRTB Baseline)</td>
              <td className="py-2 px-3 text-right text-slate-200 tabular-nums">
                {currencySymbol}{metrics.var90.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right text-slate-400 tabular-nums">
                {((metrics.var90 / portfolioCapital) * 100).toFixed(2)}%
              </td>
              <td className="py-2 px-3 text-right text-slate-300 tabular-nums">
                {currencySymbol}{metrics.es90.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right text-slate-400 tabular-nums">
                {((metrics.es90 / portfolioCapital) * 100).toFixed(2)}%
              </td>
              <td className="py-2 px-3 text-right text-slate-500">—</td>
            </tr>
            <tr>
              <td className="py-2 px-3 text-slate-300 font-medium">95.0% Standard</td>
              <td className="py-2 px-3 text-right text-amber-300 tabular-nums font-semibold">
                {currencySymbol}{metrics.var95.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right text-amber-400/80 tabular-nums">
                {((metrics.var95 / portfolioCapital) * 100).toFixed(2)}%
              </td>
              <td className="py-2 px-3 text-right text-amber-200 tabular-nums font-semibold">
                {currencySymbol}{metrics.es95.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right text-amber-400/80 tabular-nums">
                {((metrics.es95 / portfolioCapital) * 100).toFixed(2)}%
              </td>
              <td className="py-2 px-3 text-right text-slate-500">—</td>
            </tr>
            <tr className="bg-red-950/20">
              <td className="py-2 px-3 text-red-300 font-medium">99.0% Basel Regulatory</td>
              <td className="py-2 px-3 text-right text-red-400 tabular-nums font-bold">
                {currencySymbol}{metrics.var99.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right text-red-400/80 tabular-nums">
                {((metrics.var99 / portfolioCapital) * 100).toFixed(2)}%
              </td>
              <td className="py-2 px-3 text-right text-rose-400 tabular-nums font-bold">
                {currencySymbol}{metrics.es99.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right text-rose-400/80 tabular-nums">
                {((metrics.es99 / portfolioCapital) * 100).toFixed(2)}%
              </td>
              <td className="py-2 px-3 text-right text-cyan-400 tabular-nums font-semibold">
                {currencySymbol}{metrics.evtVaR99?.toLocaleString()}
              </td>
            </tr>
            <tr>
              <td className="py-2 px-3 text-slate-300 font-medium">99.5% Extreme Tail</td>
              <td className="py-2 px-3 text-right text-red-300 tabular-nums">
                {currencySymbol}{metrics.var995.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right text-slate-400 tabular-nums">
                {((metrics.var995 / portfolioCapital) * 100).toFixed(2)}%
              </td>
              <td className="py-2 px-3 text-right text-rose-300 tabular-nums">
                {currencySymbol}{metrics.es995.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right text-slate-400 tabular-nums">
                {((metrics.es995 / portfolioCapital) * 100).toFixed(2)}%
              </td>
              <td className="py-2 px-3 text-right text-cyan-400 tabular-nums font-semibold">
                {currencySymbol}{metrics.evtES99?.toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Component VaR & Risk Decomposition */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <PieChart className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-semibold text-slate-200">
              Portfolio Risk Decomposition & Component VaR
            </span>
          </div>
          <span className="text-xs font-mono text-emerald-400">
            Diversification Benefit: +{metrics.diversificationBenefit}%
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {metrics.componentVaR.map((item) => (
            <div
              key={item.symbol}
              className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80 font-mono text-xs"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-slate-200">{item.symbol}</span>
                <span className="text-cyan-400 font-bold tabular-nums">
                  {item.percentContribution}% of Total Risk
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-1">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full"
                  style={{ width: `${item.percentContribution}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Marginal VaR contribution:</span>
                <span className="text-slate-300 tabular-nums">
                  {currencySymbol}{Math.round(item.marginalVaR).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
