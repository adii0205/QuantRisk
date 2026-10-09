import React, { useState, useEffect } from 'react';
import { Portfolio, CurrencyCode } from '../types/risk';
import { parseAndValidateMarketCsv, CsvValidationResult } from '../data/csv-importer';
import {
  saveMarketSeries,
  listMarketSeries,
  getMarketSeries,
  CachedSeriesSummary,
  deleteMarketSeries,
} from '../data/market-data-cache';
import { REAL_ETF_PORTFOLIO, BUNDLED_REAL_DATASET_METADATA } from '../data/realMarketData';
import { PRESET_PORTFOLIOS } from '../data/mockMarketData';
import {
  Database,
  Upload,
  Globe,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  Trash2,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface MarketDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPortfolio: Portfolio;
  onSelectPortfolio: (p: Portfolio) => void;
}

export const MarketDataModal: React.FC<MarketDataModalProps> = ({
  isOpen,
  onClose,
  currentPortfolio,
  onSelectPortfolio,
}) => {
  const [activeTab, setActiveTab] = useState<'bundled' | 'csv' | 'proxy' | 'cached'>('bundled');

  // CSV import state
  const [csvText, setCsvText] = useState<string>('');
  const [csvFileName, setCsvFileName] = useState<string>('custom_portfolio.csv');
  const [csvResult, setCsvResult] = useState<CsvValidationResult | null>(null);

  // Stooq fetch state
  const [proxyTicker, setProxyTicker] = useState<string>('SPY');
  const [isFetchingProxy, setIsFetchingProxy] = useState<boolean>(false);
  const [proxyError, setProxyError] = useState<string | null>(null);

  // IndexedDB cache state
  const [cachedList, setCachedList] = useState<CachedSeriesSummary[]>([]);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      listMarketSeries().then(setCachedList).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result || '');
      setCsvText(text);
      const res = parseAndValidateMarketCsv(text, file.name, {
        baseCurrency: currentPortfolio.baseCurrency || 'USD',
        minObservations: 500,
      });
      setCsvResult(res);
    };
    reader.readAsText(file);
  };

  const handleCsvTextChange = (text: string) => {
    setCsvText(text);
    if (text.trim().length > 50) {
      const res = parseAndValidateMarketCsv(text, csvFileName, {
        baseCurrency: currentPortfolio.baseCurrency || 'USD',
        minObservations: 500,
      });
      setCsvResult(res);
    } else {
      setCsvResult(null);
    }
  };

  const handleApplyCsv = async () => {
    if (!csvResult || !csvResult.isValid || !csvResult.assets || !csvResult.datasetMetadata) return;

    const newPortfolio: Portfolio = {
      id: `imported_${Date.now()}`,
      name: csvResult.datasetMetadata.name,
      description: `User-imported market data: ${csvResult.datasetMetadata.dateRange}`,
      cashWeight: 0.05,
      leverage: 1.0,
      totalCapital: currentPortfolio.totalCapital,
      baseCurrency: currentPortfolio.baseCurrency || 'USD',
      datasetMetadata: csvResult.datasetMetadata,
      assets: csvResult.assets,
    };

    // Save to IndexedDB
    await saveMarketSeries({
      id: newPortfolio.id,
      name: newPortfolio.name,
      savedAt: new Date().toISOString(),
      metadata: csvResult.datasetMetadata,
      assets: csvResult.assets,
      dates: csvResult.dates || [],
    });

    onSelectPortfolio(newPortfolio);
    onClose();
  };

  const handleFetchStooq = async () => {
    setIsFetchingProxy(true);
    setProxyError(null);

    try {
      const res = await fetch(`/api/market-data?symbol=${encodeURIComponent(proxyTicker)}&source=stooq`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch from proxy');
      }

      const csvData = data.data;
      setCsvFileName(`${proxyTicker.toUpperCase()}.csv`);
      setCsvText(csvData);
      const val = parseAndValidateMarketCsv(csvData, `${proxyTicker.toUpperCase()}.csv`, {
        baseCurrency: 'USD',
        minObservations: 500,
      });
      setCsvResult(val);
      setActiveTab('csv');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setProxyError(msg);
    } finally {
      setIsFetchingProxy(false);
    }
  };

  const handleLoadCached = async (id: string) => {
    const item = await getMarketSeries(id);
    if (!item) return;

    const p: Portfolio = {
      id: item.id,
      name: item.name,
      description: `Loaded from local IndexedDB cache: ${item.metadata.dateRange}`,
      cashWeight: 0.05,
      leverage: 1.0,
      totalCapital: currentPortfolio.totalCapital,
      baseCurrency: currentPortfolio.baseCurrency || 'USD',
      datasetMetadata: item.metadata,
      assets: item.assets,
    };

    onSelectPortfolio(p);
    onClose();
  };

  const handleDeleteCached = async (id: string) => {
    await deleteMarketSeries(id);
    const updated = await listMarketSeries();
    setCachedList(updated);
    setCacheNotice('Dataset deleted from local IndexedDB storage');
    setTimeout(() => setCacheNotice(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">Market Data Management & Feeds</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 gap-2 pt-2">
          {[
            { id: 'bundled', label: '10-Year Real Benchmark', icon: HardDrive },
            { id: 'csv', label: 'CSV Import & Validation', icon: Upload },
            { id: 'proxy', label: 'Stooq Server Proxy', icon: Globe },
            { id: 'cached', label: `Saved Datasets (${cachedList.length})`, icon: Database },
          ].map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-all cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-cyan-400 border-t-2 border-cyan-400 border-x border-slate-800'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: BUNDLED REAL DATASET */}
          {activeTab === 'bundled' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                    {BUNDLED_REAL_DATASET_METADATA.name}
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-bold border border-emerald-800">
                    REAL MARKET DATA
                  </span>
                </div>

                <p className="text-xs text-slate-400">
                  {BUNDLED_REAL_DATASET_METADATA.licenseNote}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono pt-2 border-t border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block text-[10px]">OBSERVATIONS</span>
                    <span className="text-white font-bold">2,516 Days (10 Years)</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">ASSETS</span>
                    <span className="text-white font-bold">8 Institutional ETFs</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">DATE RANGE</span>
                    <span className="text-white font-bold">2014-01-02 to 2024-01-05</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">CRYPTOGRAPHIC HASH</span>
                    <span className="text-cyan-400 font-bold truncate block">
                      {BUNDLED_REAL_DATASET_METADATA.hash}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    onClick={() => {
                      onSelectPortfolio(REAL_ETF_PORTFOLIO);
                      onClose();
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer"
                  >
                    Load Bundled Real Benchmark
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Other presets (including Demo Mode) */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Other Presets:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {PRESET_PORTFOLIOS.slice(1).map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{p.name}</span>
                          <span className="text-[9px] font-mono px-1 rounded bg-slate-800 text-purple-300">
                            DEMO MODE
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                          {p.description}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          onSelectPortfolio(p);
                          onClose();
                        }}
                        className="w-full mt-2 py-1 text-[11px] font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                      >
                        Select
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CSV IMPORT & VALIDATION */}
          {activeTab === 'csv' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-dashed border-slate-700 text-center space-y-2">
                <Upload className="w-8 h-8 text-cyan-400 mx-auto opacity-80" />
                <div className="text-xs text-white font-medium">
                  Upload CSV File (Single Asset OHLCV or Wide Multi-Asset Prices)
                </div>
                <p className="text-[11px] text-slate-400">
                  Must contain Date and Price columns with at least 500 trading days.
                </p>
                <label className="inline-block px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer">
                  Browse Files
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Paste CSV text area */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Or Paste Raw CSV Data:
                </label>
                <textarea
                  rows={4}
                  value={csvText}
                  onChange={(e) => handleCsvTextChange(e.target.value)}
                  placeholder="Date,SPY,QQQ,GLD,TLT&#10;2021-01-04,370.1,310.2,182.4,152.1&#10;..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-300 font-mono resize-none focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Validation Feedback */}
              {csvResult && (
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    csvResult.isValid
                      ? 'bg-emerald-950/40 border-emerald-700/60'
                      : 'bg-rose-950/40 border-rose-700/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {csvResult.isValid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                      )}
                      <span className="text-xs font-bold text-white">
                        {csvResult.isValid
                          ? 'CSV Validation Passed (Ready for Import)'
                          : 'Validation Errors Detected'}
                      </span>
                    </div>
                    {csvResult.datasetMetadata && (
                      <span className="text-[10px] font-mono text-cyan-300">
                        Hash: {csvResult.datasetMetadata.hash.slice(0, 16)}...
                      </span>
                    )}
                  </div>

                  {csvResult.errors.length > 0 && (
                    <ul className="text-xs text-rose-300 list-disc list-inside space-y-1">
                      {csvResult.errors.map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  )}

                  {csvResult.warnings.length > 0 && (
                    <div className="text-[11px] text-amber-300 space-y-1">
                      <span className="font-semibold block">Audit Warnings:</span>
                      <ul className="list-disc list-inside space-y-0.5 text-amber-200/80">
                        {csvResult.warnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {csvResult.isValid && (
                    <div className="flex items-center justify-between pt-2 border-t border-emerald-800/50">
                      <span className="text-xs text-emerald-300 font-mono">
                        {csvResult.assets?.length} Assets Aligned · {csvResult.dates?.length} Observations
                      </span>
                      <button
                        onClick={handleApplyCsv}
                        className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                      >
                        Apply & Import to Risk Engine
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: STOOQ PROXY */}
          {activeTab === 'proxy' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  Direct Server-Side Market Proxy (Stooq EOD)
                </h4>
                <p className="text-xs text-slate-400">
                  Fetches verified historical prices via the local Express server proxy (`/api/market-data`).
                  No API keys are exposed to the client bundle.
                </p>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="text"
                    value={proxyTicker}
                    onChange={(e) => setProxyTicker(e.target.value.toUpperCase())}
                    placeholder="e.g. SPY, QQQ, AAPL"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono uppercase focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleFetchStooq}
                    disabled={isFetchingProxy}
                    className="px-4 py-1.5 text-xs font-bold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isFetchingProxy ? 'Fetching...' : 'Fetch EOD History'}
                  </button>
                </div>

                {proxyError && (
                  <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                    {proxyError}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: INDEXEDDB SAVED DATASETS */}
          {activeTab === 'cached' && (
            <div className="space-y-4">
              {cacheNotice && (
                <div className="p-2.5 rounded bg-slate-800 text-slate-200 text-xs">
                  {cacheNotice}
                </div>
              )}

              {cachedList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No datasets currently saved in local IndexedDB storage.
                  Import a CSV or fetch via Stooq to persist series locally.
                </div>
              ) : (
                <div className="divide-y divide-slate-800 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
                  {cachedList.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 flex items-center justify-between gap-4 hover:bg-slate-900/60 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{item.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300">
                            {item.assetCount} Assets
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 font-mono">
                          {item.dateRange} · Hash: {item.hash.slice(0, 16)}...
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleLoadCached(item.id)}
                          className="px-3 py-1 text-xs font-semibold rounded bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => handleDeleteCached(item.id)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                          title="Delete from cache"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
