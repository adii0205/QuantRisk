import React, { useState } from 'react';
import { Asset, Portfolio } from '../types/risk';
import { PRESET_PORTFOLIOS } from '../data/mockMarketData';
import { Sliders, Plus, Trash2, RotateCcw, DollarSign } from 'lucide-react';

interface PortfolioBuilderProps {
  portfolio: Portfolio;
  onUpdatePortfolio: (updated: Portfolio) => void;
  currencySymbol?: string;
}

export const PortfolioBuilder: React.FC<PortfolioBuilderProps> = ({
  portfolio,
  onUpdatePortfolio,
  currencySymbol = '$',
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(portfolio.id);

  const handleSelectPreset = (presetId: string) => {
    const found = PRESET_PORTFOLIOS.find((p) => p.id === presetId);
    if (found) {
      setSelectedPresetId(presetId);
      onUpdatePortfolio(JSON.parse(JSON.stringify(found)));
    }
  };

  const handleWeightChange = (index: number, newWeight: number) => {
    const updatedAssets = [...portfolio.assets];
    updatedAssets[index].weight = Math.max(0, Math.min(1, newWeight));
    onUpdatePortfolio({ ...portfolio, assets: updatedAssets });
  };

  const handleCapitalChange = (newCapital: number) => {
    onUpdatePortfolio({ ...portfolio, totalCapital: Math.max(10000, newCapital) });
  };

  const handleCashChange = (newCash: number) => {
    onUpdatePortfolio({ ...portfolio, cashWeight: Math.max(0, Math.min(0.8, newCash)) });
  };

  const handleLeverageChange = (newLev: number) => {
    onUpdatePortfolio({ ...portfolio, leverage: Math.max(1.0, Math.min(3.0, newLev)) });
  };

  const handleNormalizeWeights = () => {
    const total = portfolio.assets.reduce((sum, a) => sum + a.weight, 0);
    if (total <= 0) return;
    const normalized = portfolio.assets.map((a) => ({
      ...a,
      weight: Math.round((a.weight / total) * 100) / 100,
    }));
    onUpdatePortfolio({ ...portfolio, assets: normalized });
  };

  const totalAssetWeight = portfolio.assets.reduce((sum, a) => sum + a.weight, 0);
  const isWeightsOff = Math.abs(totalAssetWeight - 1.0) > 0.01;

  return (
    <div className="flex flex-col bg-slate-900/90 rounded-xl border border-slate-800 p-4">
      {/* Header & Presets */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-100">
            Portfolio Allocation & Capital Engine
          </span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400 font-mono">
            {portfolio.assets.length} Active Positions
          </span>
        </div>

        {/* Presets Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-slate-950/80 rounded-lg border border-slate-800/80">
          {PRESET_PORTFOLIOS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleSelectPreset(preset.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                selectedPresetId === preset.id
                  ? 'bg-slate-800 text-cyan-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {preset.name.split(' ')[0]} {preset.name.split(' ')[1] || ''}
            </button>
          ))}
        </div>
      </div>

      {/* Global Portfolio Parameters: Capital, Cash %, Leverage */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 p-3 bg-slate-950/50 rounded-lg border border-slate-800/60 text-xs font-mono">
        <div>
          <label className="text-slate-400 block mb-1 text-[11px]">Total Portfolio Capital</label>
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-md">
            <span className="text-slate-400 font-semibold">{currencySymbol}</span>
            <input
              type="number"
              value={portfolio.totalCapital}
              step={100000}
              onChange={(e) => handleCapitalChange(Number(e.target.value))}
              className="w-full bg-transparent text-slate-100 focus:outline-hidden tabular-nums font-semibold"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-slate-400 text-[11px]">Cash Buffer Drag</label>
            <span className="text-slate-300 font-semibold tabular-nums">
              {(portfolio.cashWeight * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={portfolio.cashWeight}
            onChange={(e) => handleCashChange(Number(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-slate-400 text-[11px]">Gross Leverage</label>
            <span className="text-cyan-400 font-semibold tabular-nums">
              {portfolio.leverage.toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min={1.0}
            max={2.5}
            step={0.05}
            value={portfolio.leverage}
            onChange={(e) => handleLeverageChange(Number(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer"
          />
        </div>
      </div>

      {/* Asset Weights Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-500 text-left">
              <th className="pb-2 font-medium">Asset</th>
              <th className="pb-2 font-medium">Class</th>
              <th className="pb-2 font-medium text-right">Price</th>
              <th className="pb-2 font-medium text-right">Exp Return μ</th>
              <th className="pb-2 font-medium text-right">Ann Vol σ</th>
              <th className="pb-2 font-medium text-right w-44">Target Weight</th>
              <th className="pb-2 font-medium text-right">Notional</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {portfolio.assets.map((asset, idx) => {
              const notional = portfolio.totalCapital * asset.weight * portfolio.leverage;
              return (
                <tr key={asset.symbol} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 font-semibold text-slate-200">
                    <div>{asset.symbol}</div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[120px] font-sans">
                      {asset.name}
                    </div>
                  </td>
                  <td className="py-2.5 text-slate-400">
                    <span className="text-[11px]">{asset.category}</span>
                  </td>
                  <td className="py-2.5 text-right text-slate-300 tabular-nums">
                    {currencySymbol}{asset.currentPrice.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right text-emerald-400 tabular-nums">
                    +{(asset.expectedAnnualReturn * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 text-right text-slate-300 tabular-nums">
                    {(asset.annualVolatility * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <input
                        type="range"
                        min={0}
                        max={0.6}
                        step={0.01}
                        value={asset.weight}
                        onChange={(e) => handleWeightChange(idx, Number(e.target.value))}
                        className="w-24 accent-cyan-400 cursor-pointer"
                      />
                      <span className="w-10 text-right font-semibold text-cyan-400 tabular-nums">
                        {(asset.weight * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right text-slate-300 font-semibold tabular-nums">
                    {currencySymbol}{Math.round(notional).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Weight sum alert / normalization bar */}
      {isWeightsOff && (
        <div className="mt-3 p-2 bg-amber-950/40 border border-amber-900/60 rounded-lg flex items-center justify-between text-xs font-mono text-amber-200">
          <span>
            Current weight total: {(totalAssetWeight * 100).toFixed(1)}% (Weights do not sum to 100%)
          </span>
          <button
            onClick={handleNormalizeWeights}
            className="flex items-center gap-1.5 px-2 py-1 bg-amber-900/60 hover:bg-amber-800 text-amber-100 rounded-md transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Normalize 100%</span>
          </button>
        </div>
      )}
    </div>
  );
};
