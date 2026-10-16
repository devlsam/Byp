import React from 'react';
import {
  Cpu,
  X,
  Search,
  RefreshCw,
  Headphones,
  Gamepad,
  Globe,
  Radio,
  FileCode,
  Layers,
  Check,
  Plus,
} from '../../icons';
import { getAppVisual } from '../../utils/formatters';
import type { ProcessAppInfo } from '../../../bindings/changeme/internal/tun/models';
import type { Settings } from '../../../bindings/changeme/internal/storage/models';

interface RunningAppsModalProps {
  show: boolean;
  onClose: () => void;
  runningApps: ProcessAppInfo[];
  runningAppsLoading: boolean;
  filteredRunningApps: ProcessAppInfo[];
  appSearchQuery: string;
  setAppSearchQuery: (query: string) => void;
  settings: Settings;
  onAddRunningApp: (app: ProcessAppInfo) => void;
}

/**
 * Modal displaying currently running Windows processes for quick split-tunnel rule assignment.
 */
export const RunningAppsModal: React.FC<RunningAppsModalProps> = ({
  show,
  onClose,
  runningApps,
  runningAppsLoading,
  filteredRunningApps,
  appSearchQuery,
  setAppSearchQuery,
  settings,
  onAddRunningApp,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="modern-surface rounded-3xl w-full max-w-sm p-4 shadow-2xl border border-white/20 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-zinc-300" />
            <span className="font-semibold text-xs text-white">
              Running Applications ({runningApps.length})
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Box */}
        <div className="py-3 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Filter processes (e.g. discord, chrome)..."
              value={appSearchQuery}
              onChange={(e) => setAppSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#121317] border border-white/10 rounded-xl text-white text-xs placeholder:text-zinc-600 focus:outline-none focus:border-white/40"
              autoFocus
            />
          </div>
        </div>

        {/* Process List */}
        <div className="flex-1 overflow-y-auto no-scrollbar py-1 space-y-1.5 min-h-[220px]">
          {runningAppsLoading ? (
            <div className="p-8 text-center text-xs text-zinc-400 flex flex-col items-center justify-center space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin text-zinc-400" />
              <span>Scanning active Windows processes...</span>
            </div>
          ) : filteredRunningApps.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">
              No matching processes found.
            </div>
          ) : (
            filteredRunningApps.map((app) => {
              const currentApps = settings.splitTunnelApps || [];
              const isAdded = currentApps.some(
                (a) =>
                  a.toLowerCase() === app.name.toLowerCase() ||
                  a.toLowerCase() === app.path.toLowerCase()
              );

              const visual = getAppVisual(app.name);
              return (
                <div
                  key={`${app.pid}-${app.name}`}
                  className="p-2.5 rounded-xl bg-[#121317] border border-white/10 flex items-center justify-between text-xs hover:border-white/20 transition group"
                >
                  <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                    <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      {visual.iconType === 'chat' && <Headphones className="w-3.5 h-3.5 text-zinc-300" />}
                      {visual.iconType === 'game' && <Gamepad className="w-3.5 h-3.5 text-zinc-300" />}
                      {visual.iconType === 'browser' && <Globe className="w-3.5 h-3.5 text-zinc-300" />}
                      {visual.iconType === 'music' && <Radio className="w-3.5 h-3.5 text-zinc-300" />}
                      {visual.iconType === 'code' && <FileCode className="w-3.5 h-3.5 text-zinc-300" />}
                      {visual.iconType === 'default' && <Layers className="w-3.5 h-3.5 text-zinc-300" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-semibold text-white truncate max-w-[130px]">
                          {app.name}
                        </span>
                        <span className="text-[8px] font-mono text-zinc-400 px-1 py-0.2 rounded bg-white/5 border border-white/10">
                          {app.pid}
                        </span>
                      </div>
                      <div
                        className="text-[9px] text-zinc-400 font-mono truncate max-w-[150px] mt-0.5"
                        title={app.path}
                      >
                        {app.path}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isAdded}
                    onClick={() => onAddRunningApp(app)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition flex items-center space-x-1 shrink-0 ${
                      isAdded
                        ? 'bg-white/10 text-zinc-300 border border-white/15 cursor-default'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/15 cursor-pointer'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Added</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="pt-3 border-t border-white/10 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white text-black text-xs font-semibold hover:bg-slate-200 transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
