import React from 'react';
import { Play, Download, Cpu, ShieldAlert, Layers, Activity, GitCompare, RefreshCw, BookOpen, Network, Zap, Sliders, Database } from 'lucide-react';

interface TopBarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onRunSimulation: () => void;
  isSimulating: boolean;
  onExportReport: () => void;
  onOpenDocs: () => void;
  onOpenMarketData: () => void;
  isRealData: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  onRunSimulation,
  isSimulating,
  onExportReport,
  onOpenDocs,
  onOpenMarketData,
  isRealData,
}) => {
  const navItems = [
    { id: 'risk_engine', label: 'Risk Engine', icon: Activity },
    { id: 'model_calibration', label: 'Calibration', icon: Sliders },
    { id: 'model_comparison', label: 'Model Matrix', icon: GitCompare },
    { id: 'stress_lab', label: 'Stress Lab', icon: ShieldAlert },
    { id: 'options_greeks', label: 'Options Greeks', icon: Layers },
    { id: 'deep_hedging', label: 'Deep Hedging', icon: Zap },
    { id: 'backtesting', label: 'Kupiec Backtest', icon: ShieldAlert },
    { id: 'gpu_benchmark', label: 'GPU Engine', icon: Cpu },
    { id: 'distributed_cluster', label: 'Ray Cluster', icon: Network },
  ];

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-6 py-3.5 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3">
        <a href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-mono font-bold text-white shadow-sm shadow-cyan-500/20 group-hover:scale-105 transition-transform">
            QR
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-white group-hover:text-cyan-400 transition-colors">
              QuantRisk
            </span>
          </div>
        </a>
      </div>

      {/* Zone 2: Navigation Links (4-6 single-line links) */}
      <nav className="hidden lg:flex items-center gap-1.5 p-1 bg-slate-900/80 rounded-lg border border-slate-800/80">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-slate-800 text-cyan-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Primary Actions */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onOpenMarketData}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
            isRealData
              ? 'bg-emerald-950/60 hover:bg-emerald-900/60 border-emerald-700/80 text-emerald-300'
              : 'bg-purple-950/60 hover:bg-purple-900/60 border-purple-700/80 text-purple-300'
          }`}
          title="Open Market Data Feeds & CSV Importer"
        >
          <Database className="w-3.5 h-3.5" />
          <span>{isRealData ? 'Real Market Data' : 'Demo Factor Mode'}</span>
        </button>

        <button
          onClick={onOpenDocs}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/80 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          title="Open Architecture & Research Documentation"
        >
          <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
          <span>Docs & Roadmap</span>
        </button>

        <button
          onClick={onExportReport}
          className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          title="Export Quantitative Risk Audit Report"
        >
          <Download className="w-3.5 h-3.5 text-slate-400" />
          <span>Audit Report</span>
        </button>

        <button
          onClick={onRunSimulation}
          disabled={isSimulating}
          className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-cyan-300 hover:from-cyan-300 hover:to-cyan-200 active:scale-[0.98] rounded-lg transition-all shadow-sm shadow-cyan-500/25 whitespace-nowrap cursor-pointer disabled:opacity-50"
        >
          {isSimulating ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          <span>{isSimulating ? 'Simulating...' : 'Run Engine'}</span>
        </button>
      </div>
    </header>
  );
};
