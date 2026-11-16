import React from 'react';
import { X, Trash2 } from '../../icons';
import type { Subscription } from '../../../bindings/changeme/internal/storage/models';

interface SubscriptionModalProps {
  show: boolean;
  onClose: () => void;
  subscriptions: Subscription[];
  subName: string;
  setSubName: (val: string) => void;
  subUrl: string;
  setSubUrl: (val: string) => void;
  subLoading: boolean;
  subError: string;
  onAddSubscription: (e: React.FormEvent) => void;
  onDeleteSubscription: (s: Subscription) => void;
}

/**
 * Modal to view, add, sync, and delete subscriptions.
 */
export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  show,
  onClose,
  subscriptions,
  subName,
  setSubName,
  subUrl,
  setSubUrl,
  subLoading,
  subError,
  onAddSubscription,
  onDeleteSubscription,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="modern-surface rounded-3xl w-full max-w-sm p-4 shadow-2xl border border-white/20 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <span className="font-semibold text-xs text-white">
            Subscriptions ({subscriptions.length})
          </span>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar py-3 space-y-3">
          {/* Existing Subscriptions */}
          {subscriptions.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Active Subscriptions
              </span>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                {subscriptions.map((s) => (
                  <div
                    key={s.id}
                    className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between text-xs group hover:border-white/20 transition"
                  >
                    <div className="truncate max-w-[210px]">
                      <span className="text-white font-medium block truncate text-[11px]">{s.name}</span>
                      <span className="text-[9px] text-zinc-400 font-mono truncate block">{s.url}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteSubscription(s)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      title="Delete Subscription"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add New Subscription Form */}
          <form onSubmit={onAddSubscription} className="space-y-2.5 pt-1 border-t border-white/10">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Add New Subscription
            </span>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1">Name</label>
              <input
                type="text"
                placeholder="My Subscription"
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#121317] border border-white/10 rounded-xl text-xs text-white font-normal focus:outline-none focus:border-white/40"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-400 mb-1">URL *</label>
              <input
                type="url"
                required
                placeholder="https://..."
                value={subUrl}
                onChange={(e) => setSubUrl(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#121317] border border-white/10 rounded-xl text-xs text-white font-mono font-normal focus:outline-none focus:border-white/40"
              />
            </div>
            {subError && <div className="text-[10px] font-medium text-rose-400">{subError}</div>}
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 text-white text-xs font-medium hover:bg-white/20 transition"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={subLoading}
                className="px-4 py-1.5 rounded-xl bg-white text-black text-xs font-semibold hover:bg-slate-200 transition disabled:opacity-40"
              >
                {subLoading ? '...' : 'Sync & Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
