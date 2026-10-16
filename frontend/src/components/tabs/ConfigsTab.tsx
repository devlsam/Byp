import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Server,
  Globe,
  Edit,
  Trash2,
  RefreshCw,
  Plus,
  Wifi,
  Search,
  ChevronRight,
} from '../../icons';
import type { Profile, Subscription } from '../../../bindings/changeme/internal/storage/models';

interface ConfigsTabProps {
  configViewMode: 'all' | 'subs' | 'manual';
  setConfigViewMode: (mode: 'all' | 'subs' | 'manual') => void;
  profiles: Profile[];
  subscriptions: Subscription[];
  manualProfiles: Profile[];
  filteredProfiles: Profile[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  updatingSubs: boolean;
  updatingSubId: string | null;
  pingingMap: Record<string, boolean>;
  pingingAll: boolean;
  connected: boolean;
  activeProfileId: string;
  selectedProfileId: string;
  setSelectedProfileId: (id: string) => void;
  onPing: (id: string, e: React.MouseEvent) => void;
  onPingAll: () => void;
  onDeleteProfile: (id: string, e: React.MouseEvent) => void;
  onClearAllProfiles: () => void;
  onOpenEditModal: (p: Profile, e?: React.MouseEvent) => void;
  onImportClipboardDirect: () => void;
  onOpenCreateCustom: () => void;
  onOpenSubModal: () => void;
  onUpdateSingleSubscription: (s: Subscription, e: React.MouseEvent) => void;
  onDeleteSubscriptionWithConfirm: (s: Subscription, e: React.MouseEvent) => void;
  onUpdateAllSubscriptions: () => void;
}

/**
 * Configurations and subscriptions manager tab.
 */
export const ConfigsTab: React.FC<ConfigsTabProps> = ({
  configViewMode,
  setConfigViewMode,
  profiles,
  subscriptions,
  manualProfiles,
  filteredProfiles,
  searchQuery,
  setSearchQuery,
  updatingSubs,
  updatingSubId,
  pingingMap,
  pingingAll,
  connected,
  activeProfileId,
  selectedProfileId,
  setSelectedProfileId,
  onPing,
  onPingAll,
  onDeleteProfile,
  onClearAllProfiles,
  onOpenEditModal,
  onImportClipboardDirect,
  onOpenCreateCustom,
  onOpenSubModal,
  onUpdateSingleSubscription,
  onDeleteSubscriptionWithConfirm,
  onUpdateAllSubscriptions,
}) => {
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>({});

  const subNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    subscriptions.forEach((s) => {
      map[s.id] = s.name;
    });
    return map;
  }, [subscriptions]);

  return (
    <motion.div
      key="configs"
      initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="flex-1 flex flex-col p-5 space-y-3.5 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-sm font-semibold text-white tracking-tight whitespace-nowrap shrink-0">
          {configViewMode === 'subs'
            ? `Subscriptions (${subscriptions.length})`
            : configViewMode === 'manual'
            ? `Custom (${manualProfiles.length})`
            : `Configs (${profiles.length})`}
        </span>
        <div className="flex items-center space-x-1.5 shrink-0">
          {configViewMode === 'subs' ? (
            <>
              <button
                onClick={onUpdateAllSubscriptions}
                disabled={updatingSubs || subscriptions.length === 0}
                title="Update All Subscriptions"
                className="px-2.5 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white text-[11px] font-medium border border-white/10 transition flex items-center space-x-1"
              >
                <RefreshCw className={`w-3 h-3 ${updatingSubs ? 'animate-spin text-white' : ''}`} />
                <span>{updatingSubs ? 'Syncing...' : 'Update Subs'}</span>
              </button>
              <button
                onClick={onOpenSubModal}
                title="Add Subscription"
                className="px-3 py-1 rounded-xl bg-white hover:bg-slate-200 text-black text-[11px] font-semibold transition flex items-center space-x-1 shadow-md"
              >
                <Plus className="w-3 h-3" />
                <span>Add Sub</span>
              </button>
            </>
          ) : (
            <>
              {profiles.length > 0 && (
                <button
                  onClick={onClearAllProfiles}
                  title="Delete All Configurations"
                  className="px-2.5 py-1 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[11px] font-medium border border-rose-500/25 transition flex items-center space-x-1"
                >
                  <Trash2 className="w-3 h-3 text-rose-400" />
                  <span>Clear</span>
                </button>
              )}
              <button
                onClick={onPingAll}
                disabled={pingingAll || profiles.length === 0}
                title="Ping All Nodes"
                className="px-2.5 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white text-[11px] font-medium border border-white/10 transition flex items-center space-x-1"
              >
                <Wifi className={`w-3 h-3 ${pingingAll ? 'animate-pulse text-indigo-400' : ''}`} />
                <span>Ping</span>
              </button>
              <button
                onClick={onImportClipboardDirect}
                title="Import Configuration"
                className="px-3 py-1 rounded-xl bg-white hover:bg-slate-200 text-black text-[11px] font-semibold transition flex items-center space-x-1 shadow-md"
              >
                <Plus className="w-3 h-3" />
                <span>Add</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* View Mode Segment Switcher: [ All ] [ Subs ] [ Custom ] */}
      <div className="flex bg-[#121317] p-1 rounded-2xl border border-white/10 shrink-0">
        <button
          type="button"
          onClick={() => setConfigViewMode('all')}
          className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-medium transition flex items-center justify-center space-x-1.5 whitespace-nowrap ${
            configViewMode === 'all'
              ? 'bg-white text-black font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Server className="w-3 h-3 shrink-0" />
          <span>All ({profiles.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setConfigViewMode('subs')}
          className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-medium transition flex items-center justify-center space-x-1.5 whitespace-nowrap ${
            configViewMode === 'subs'
              ? 'bg-white text-black font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Globe className="w-3 h-3 shrink-0" />
          <span>Subs ({subscriptions.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setConfigViewMode('manual')}
          className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-medium transition flex items-center justify-center space-x-1.5 whitespace-nowrap ${
            configViewMode === 'manual'
              ? 'bg-white text-black font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Edit className="w-3 h-3 shrink-0" />
          <span>Custom ({manualProfiles.length})</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          placeholder={configViewMode === 'subs' ? 'Search subscriptions or nodes...' : 'Search configs...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full modern-surface rounded-2xl pl-9 pr-3.5 py-2 text-xs text-white font-normal placeholder-zinc-500 focus:outline-none focus:border-white/30 transition"
        />
      </div>

      {/* Content List Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-0.5">
        {/* VIEW 1: Subscriptions View */}
        {configViewMode === 'subs' &&
          (subscriptions.length === 0 ? (
            <div className="py-14 flex flex-col items-center justify-center text-center modern-surface rounded-2xl">
              <Globe className="w-7 h-7 text-zinc-500 mb-2" />
              <p className="text-xs font-semibold text-white">No Subscriptions Added</p>
              <p className="text-[10px] text-zinc-400 font-normal mt-0.5 max-w-xs mb-3">
                Add a subscription link to automatically sync and keep nodes updated.
              </p>
              <button
                onClick={onOpenSubModal}
                className="px-3.5 py-1.5 rounded-xl bg-white text-black text-xs font-semibold hover:bg-slate-200 transition flex items-center space-x-1"
              >
                <Plus className="w-3 h-3" />
                <span>Add Subscription</span>
              </button>
            </div>
          ) : (
            subscriptions
              .filter((s) => {
                if (!searchQuery) return true;
                const q = searchQuery.toLowerCase();
                return (
                  s.name.toLowerCase().includes(q) ||
                  profiles.some((p) => p.subscriptionId === s.id && p.name.toLowerCase().includes(q))
                );
              })
              .map((sub) => {
                const subNodes = filteredProfiles.filter((p) => p.subscriptionId === sub.id);
                const isExpanded = expandedSubs[sub.id] !== false;

                return (
                  <div
                    key={sub.id}
                    className="modern-surface rounded-2xl overflow-hidden border border-white/10 transition"
                  >
                    {/* Subscription Card Header */}
                    <div
                      onClick={() => setExpandedSubs((prev) => ({ ...prev, [sub.id]: !isExpanded }))}
                      className="p-3 bg-white/[0.02] hover:bg-white/[0.05] flex items-center justify-between cursor-pointer transition select-none"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                        <Globe className="w-4 h-4 text-zinc-300 shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold text-white truncate max-w-[170px]">
                              {sub.name}
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-zinc-300 font-medium border border-white/10 shrink-0">
                              {subNodes.length} nodes
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate mt-0.5 max-w-[210px]">
                            {sub.url}
                          </div>
                        </div>
                      </div>

                      {/* Sub Actions */}
                      <div className="flex items-center space-x-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => onUpdateSingleSubscription(sub, e)}
                          disabled={updatingSubId === sub.id}
                          title="Update this subscription"
                          className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${updatingSubId === sub.id ? 'animate-spin text-white' : ''}`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => onDeleteSubscriptionWithConfirm(sub, e)}
                          title="Delete subscription"
                          className="p-1.5 rounded-lg hover:bg-rose-950/30 text-zinc-400 hover:text-rose-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedSubs((prev) => ({ ...prev, [sub.id]: !isExpanded }))}
                          className="p-1.5 text-zinc-400 hover:text-white transition"
                        >
                          <ChevronRight
                            className={`w-3.5 h-3.5 transform transition-transform duration-200 ${
                              isExpanded ? 'rotate-90' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Subscription Nodes */}
                    {isExpanded && (
                      <div className="p-2 space-y-1.5 border-t border-white/5 bg-black/20">
                        {subNodes.length === 0 ? (
                          <div className="text-center py-3 text-[11px] text-zinc-500">
                            No nodes found in this subscription. Click Refresh above.
                          </div>
                        ) : (
                          subNodes.map((p) => {
                            const isSelected = selectedProfileId === p.id;
                            const isActiveRunning = connected && activeProfileId === p.id;

                            return (
                              <div
                                key={p.id}
                                onClick={() => setSelectedProfileId(p.id)}
                                className={`p-2.5 rounded-xl transition cursor-pointer flex items-center justify-between group ${
                                  isActiveRunning
                                    ? 'modern-surface-active border-white/45 shadow-[0_0_20px_rgba(255,255,255,0.08)]'
                                    : isSelected
                                    ? 'modern-surface-active'
                                    : 'bg-white/[0.03] hover:bg-white/[0.06] border border-white/5'
                                }`}
                              >
                                <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-2">
                                  <div
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                      isActiveRunning
                                        ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]'
                                        : isSelected
                                        ? 'bg-white'
                                        : 'bg-white/20'
                                    }`}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div
                                      className="text-xs font-semibold text-white truncate leading-snug"
                                      title={p.name}
                                      dir="auto"
                                    >
                                      {p.name}
                                    </div>
                                    <div className="flex items-center space-x-1.5 text-[10px] text-zinc-400 font-mono mt-0.5 min-w-0">
                                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-white/10 text-zinc-300 font-semibold border border-white/10 shrink-0">
                                        {p.protocol}
                                      </span>
                                      <span className="truncate text-zinc-400 font-mono text-[10px]">
                                        {p.server}:{p.port}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-1 shrink-0">
                                  <button
                                    onClick={(e) => onPing(p.id, e)}
                                    className={`text-[9px] font-mono font-medium px-2 py-0.5 rounded-lg border transition ${
                                      pingingMap[p.id]
                                        ? 'bg-black/20 text-white/40 animate-pulse'
                                        : p.ping > 0
                                        ? 'bg-black/60 border-white/20 text-white'
                                        : 'bg-black/40 border-white/10 text-white/40 hover:text-white'
                                    }`}
                                  >
                                    {pingingMap[p.id] ? '...' : p.ping > 0 ? `${p.ping}ms` : 'Ping'}
                                  </button>
                                  <button
                                    onClick={(e) => onOpenEditModal(p, e)}
                                    title="Edit Configuration / View JSON"
                                    className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => onDeleteProfile(p.id, e)}
                                    title="Delete"
                                    className="p-1 rounded-lg hover:bg-rose-950/30 text-zinc-400 hover:text-rose-400 transition"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
          ))}

        {/* VIEW 2: Custom / Manual Configs View */}
        {configViewMode === 'manual' &&
          (manualProfiles.length === 0 ? (
            <div className="py-14 flex flex-col items-center justify-center text-center modern-surface rounded-2xl">
              <Server className="w-7 h-7 text-zinc-500 mb-2" />
              <p className="text-xs font-semibold text-white">No Custom Configs</p>
              <p className="text-[10px] text-zinc-400 font-normal mt-0.5 max-w-xs mb-3">
                Import single share links or build custom configs manually.
              </p>
              <button
                onClick={onOpenCreateCustom}
                className="px-3.5 py-1.5 rounded-xl bg-white text-black text-xs font-semibold hover:bg-slate-200 transition flex items-center space-x-1"
              >
                <Plus className="w-3 h-3" />
                <span>Custom Builder</span>
              </button>
            </div>
          ) : (
            manualProfiles.map((p) => {
              const isSelected = selectedProfileId === p.id;
              const isActiveRunning = connected && activeProfileId === p.id;

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProfileId(p.id)}
                  className={`p-3 rounded-2xl transition cursor-pointer flex items-center justify-between group ${
                    isActiveRunning
                      ? 'modern-surface-active border-white/45 shadow-[0_0_20px_rgba(255,255,255,0.08)]'
                      : isSelected
                      ? 'modern-surface-active'
                      : 'modern-surface'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-2">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isActiveRunning
                          ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]'
                          : isSelected
                          ? 'bg-white'
                          : 'bg-white/20'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-white truncate leading-snug" title={p.name} dir="auto">
                        {p.name}
                      </div>
                      <div className="flex items-center space-x-1.5 text-[10px] text-zinc-400 font-mono mt-0.5 min-w-0">
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-white/10 text-zinc-300 font-semibold border border-white/10 shrink-0">
                          {p.protocol}
                        </span>
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-white/5 text-zinc-500 border border-white/5 shrink-0">
                          manual
                        </span>
                        <span className="truncate text-zinc-400 font-mono text-[10px]">
                          {p.server}:{p.port}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      onClick={(e) => onPing(p.id, e)}
                      className={`text-[9px] font-mono font-medium px-2 py-0.5 rounded-lg border transition ${
                        pingingMap[p.id]
                          ? 'bg-black/20 text-white/40 animate-pulse'
                          : p.ping > 0
                          ? 'bg-black/60 border-white/20 text-white'
                          : 'bg-black/40 border-white/10 text-white/40 hover:text-white'
                      }`}
                    >
                      {pingingMap[p.id] ? '...' : p.ping > 0 ? `${p.ping}ms` : 'Ping'}
                    </button>
                    <button
                      onClick={(e) => onOpenEditModal(p, e)}
                      title="Edit Configuration / View JSON"
                      className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => onDeleteProfile(p.id, e)}
                      title="Delete"
                      className="p-1.5 rounded-lg hover:bg-rose-950/30 text-zinc-400 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          ))}

        {/* VIEW 3: All Nodes View */}
        {configViewMode === 'all' &&
          (filteredProfiles.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center modern-surface rounded-2xl">
              <Server className="w-7 h-7 text-zinc-500 mb-2" />
              <p className="text-xs font-semibold text-white">No Configs</p>
              <p className="text-[10px] text-zinc-400 font-normal mt-0.5 max-w-xs">
                Click "Add" above to import vless, vmess, trojan, or ss nodes.
              </p>
            </div>
          ) : (
            filteredProfiles.map((p) => {
              const isSelected = selectedProfileId === p.id;
              const isActiveRunning = connected && activeProfileId === p.id;
              const subName = p.subscriptionId ? subNameMap[p.subscriptionId] : null;

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProfileId(p.id)}
                  className={`p-3 rounded-2xl transition cursor-pointer flex items-center justify-between group ${
                    isActiveRunning
                      ? 'modern-surface-active border-white/45 shadow-[0_0_20px_rgba(255,255,255,0.08)]'
                      : isSelected
                      ? 'modern-surface-active'
                      : 'modern-surface'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-2">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isActiveRunning
                          ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]'
                          : isSelected
                          ? 'bg-white'
                          : 'bg-white/20'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-white truncate leading-snug" title={p.name} dir="auto">
                        {p.name}
                      </div>
                      <div className="flex items-center space-x-1.5 text-[10px] text-zinc-400 font-mono mt-0.5 min-w-0">
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-white/10 text-zinc-300 font-semibold border border-white/10 shrink-0">
                          {p.protocol}
                        </span>
                        {subName ? (
                          <span
                            className="text-[9px] font-sans font-medium px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-white/10 truncate max-w-[95px] shrink-0"
                            title={`Subscription: ${subName}`}
                          >
                            {subName}
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-white/5 text-zinc-500 border border-white/5 shrink-0">
                            manual
                          </span>
                        )}
                        <span className="truncate text-zinc-400 font-mono text-[10px]">
                          {p.server}:{p.port}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      onClick={(e) => onPing(p.id, e)}
                      className={`text-[9px] font-mono font-medium px-2 py-0.5 rounded-lg border transition ${
                        pingingMap[p.id]
                          ? 'bg-black/20 text-white/40 animate-pulse'
                          : p.ping > 0
                          ? 'bg-black/60 border-white/20 text-white'
                          : 'bg-black/40 border-white/10 text-white/40 hover:text-white'
                      }`}
                    >
                      {pingingMap[p.id] ? '...' : p.ping > 0 ? `${p.ping}ms` : 'Ping'}
                    </button>
                    <button
                      onClick={(e) => onOpenEditModal(p, e)}
                      title="Edit Configuration / View JSON"
                      className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => onDeleteProfile(p.id, e)}
                      title="Delete"
                      className="p-1.5 rounded-lg hover:bg-rose-950/30 text-zinc-400 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          ))}
      </div>
    </motion.div>
  );
};
