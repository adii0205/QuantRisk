import React, { useState } from 'react';
import { ClusterSimulationRun, simulateDistributedClusterRun } from '../engine/distributed-cluster';
import { Network, Server, Cpu, HardDrive, Play, Activity, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';

interface DistributedClusterViewProps {
  currencySymbol?: string;
  totalPortfolioCapital?: number;
}

export const DistributedClusterView: React.FC<DistributedClusterViewProps> = ({
  currencySymbol = '$',
  totalPortfolioCapital = 10000000,
}) => {
  const [requestedPaths, setRequestedPaths] = useState<number>(2000000); // 2 Million paths default
  const [nodeCount, setNodeCount] = useState<number>(8); // 8 worker nodes
  const [isDispatching, setIsDispatching] = useState<boolean>(false);

  const [clusterRun, setClusterRun] = useState<ClusterSimulationRun>(() =>
    simulateDistributedClusterRun(requestedPaths, nodeCount, totalPortfolioCapital)
  );

  const handleDispatchCluster = () => {
    setIsDispatching(true);
    setTimeout(() => {
      const run = simulateDistributedClusterRun(requestedPaths, nodeCount, totalPortfolioCapital);
      setClusterRun(run);
      setIsDispatching(false);
    }, 60);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 rounded-xl border border-slate-800 p-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Network className="w-5 h-5 text-cyan-400" />
            <span>Distributed Ray & Kafka Multi-Node Cluster Engine (Phase 4)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Simulate massive horizontal scalability: partition 1,000,000 to 10,000,000+ portfolio
            scenarios across distributed worker pods with parallel map-reduce risk aggregation.
          </p>
        </div>

        {/* Dispatch Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-950/80 rounded-lg border border-slate-800/80 font-mono text-xs">
            {[1000000, 2000000, 5000000, 10000000].map((p) => (
              <button
                key={p}
                onClick={() => {
                  setRequestedPaths(p);
                  setClusterRun(simulateDistributedClusterRun(p, nodeCount, totalPortfolioCapital));
                }}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  requestedPaths === p
                    ? 'bg-slate-800 text-cyan-400 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {(p / 1000000).toFixed(0)}M Paths
              </button>
            ))}
          </div>

          <button
            onClick={handleDispatchCluster}
            disabled={isDispatching}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {isDispatching ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isDispatching ? 'Streaming...' : 'Dispatch Cluster'}</span>
          </button>
        </div>
      </div>

      {/* Cluster Health & KPI Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Aggregate Cluster Throughput</div>
          <div className="text-xl font-bold text-emerald-400 mt-1 tabular-nums">
            {(clusterRun.clusterThroughputPathsPerSec / 1000000).toFixed(2)}M / sec
          </div>
          <div className="text-[10px] text-slate-500">{clusterRun.workers.length} Active Nodes Online</div>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Map-Reduce Total Latency</div>
          <div className="text-xl font-bold text-cyan-400 mt-1 tabular-nums">
            {clusterRun.clusterLatencyMs} ms
          </div>
          <div className="text-[10px] text-slate-500">
            Speedup factor: <strong>{clusterRun.speedupFactor}×</strong> vs single-core
          </div>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Kafka Streaming Queue Depth</div>
          <div className="text-xl font-bold text-sky-400 mt-1 tabular-nums">
            {clusterRun.kafkaQueueDepth} msgs
          </div>
          <div className="text-[10px] text-slate-500">Zero backpressure detected</div>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
          <div className="text-slate-400 text-[11px]">Distributed 99% VaR</div>
          <div className="text-xl font-bold text-rose-400 mt-1 tabular-nums">
            {currencySymbol}{clusterRun.distributedVaR99.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500">
            ES: {currencySymbol}{clusterRun.distributedES99.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Cluster Node Topology Grid */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-slate-200">
              Active Compute Pods Topology ({clusterRun.workers.length} Nodes)
            </span>
          </div>

          {/* Node count toggle */}
          <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
            <span>Cluster Size:</span>
            <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-md border border-slate-800">
              {[4, 8, 16].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setNodeCount(n);
                    setClusterRun(simulateDistributedClusterRun(requestedPaths, n, totalPortfolioCapital));
                  }}
                  className={`px-2 py-0.5 rounded-xs transition-colors cursor-pointer ${
                    nodeCount === n
                      ? 'bg-slate-800 text-cyan-400 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {n} Nodes
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {clusterRun.workers.map((worker) => {
            const isRecovered = worker.status === 'FAILED_RECOVERED';
            return (
              <div
                key={worker.id}
                className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 font-mono text-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-slate-200 truncate">{worker.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-xs font-bold ${
                        isRecovered
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                          : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                      }`}
                    >
                      {worker.status}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] text-slate-400">
                    <div className="flex justify-between">
                      <span>Partition:</span>
                      <span className="text-slate-200 tabular-nums">
                        {(worker.assignedPaths / 1000).toFixed(0)}k paths
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Throughput:</span>
                      <span className="text-cyan-400 tabular-nums">
                        {(worker.throughputPathsPerSec / 1000).toFixed(0)}k / s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Latency:</span>
                      <span className="text-slate-300 tabular-nums">{worker.latencyMs} ms</span>
                    </div>
                  </div>
                </div>

                {/* Core Load bar */}
                <div className="mt-3 pt-2 border-t border-slate-900">
                  <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                    <span>CPU Core Load</span>
                    <span className="text-slate-300">{worker.cpuUtilizationPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full"
                      style={{ width: `${worker.cpuUtilizationPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
