import React, { useState } from 'react';
import { Asset } from '../../types/risk';
import { calculateCorrelationMatrix } from '../../data/mockMarketData';

interface CorrelationMatrixProps {
  assets: Asset[];
}

export const CorrelationMatrix: React.FC<CorrelationMatrixProps> = ({ assets }) => {
  const [hoveredCell, setHoveredCell] = useState<{ i: number; j: number } | null>(null);
  const { correlationMatrix } = calculateCorrelationMatrix(assets);
  const n = assets.length;

  const getColor = (val: number) => {
    if (val === 1) return 'bg-cyan-500/80 text-white font-bold';
    if (val > 0.6) return 'bg-sky-600/60 text-sky-100';
    if (val > 0.3) return 'bg-sky-700/40 text-slate-200';
    if (val > 0) return 'bg-slate-800/80 text-slate-300';
    if (val > -0.3) return 'bg-amber-950/40 text-amber-200';
    return 'bg-red-950/60 text-red-200 font-semibold';
  };

  return (
    <div className="flex flex-col bg-slate-900/90 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-100">
            Empirical Asset Correlation Matrix & Cholesky Factor
          </span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-400 font-mono">Σ = L · Lᵀ</span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-cyan-500/80 inline-block"></span> High +
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-slate-800 inline-block"></span> Uncorrelated
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-red-950/80 inline-block"></span> Negative / Hedge
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono border-collapse">
          <thead>
            <tr>
              <th className="p-1.5 text-left text-slate-500 font-medium"></th>
              {assets.map((a) => (
                <th key={a.symbol} className="p-1.5 text-center text-slate-300 font-medium min-w-[64px]">
                  {a.symbol}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assets.map((rowAsset, i) => (
              <tr key={rowAsset.symbol}>
                <td className="p-1.5 text-slate-300 font-medium whitespace-nowrap text-left">
                  {rowAsset.symbol}
                </td>
                {assets.map((colAsset, j) => {
                  const corr = correlationMatrix[i][j];
                  const isHovered =
                    hoveredCell?.i === i || hoveredCell?.j === j || (hoveredCell?.i === i && hoveredCell?.j === j);
                  return (
                    <td
                      key={colAsset.symbol}
                      onMouseEnter={() => setHoveredCell({ i, j })}
                      onMouseLeave={() => setHoveredCell(null)}
                      className={`p-2 text-center transition-all cursor-default border border-slate-900/60 tabular-nums ${getColor(
                        corr
                      )} ${isHovered ? 'ring-1 ring-cyan-400/50' : ''}`}
                    >
                      {corr >= 0 ? `+${corr.toFixed(2)}` : corr.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hoveredCell && (
        <div className="mt-2.5 text-xs font-mono text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 flex items-center justify-between">
          <span>
            Correlation({assets[hoveredCell.i].symbol}, {assets[hoveredCell.j].symbol}):
          </span>
          <span className="text-cyan-400 font-semibold tabular-nums">
            ρ = {correlationMatrix[hoveredCell.i][hoveredCell.j].toFixed(3)}
          </span>
        </div>
      )}
    </div>
  );
};
