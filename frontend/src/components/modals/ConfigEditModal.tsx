import React from 'react';
import { Edit, X, FileCode, Copy } from '../../icons';
import { toast } from '../../Toaster';
import { buildOutboundFromForm, parseProfileToForm } from '../../utils/profileParser';
import type { ConfigFormState } from '../../types';
import type { Profile } from '../../../bindings/changeme/internal/storage/models';

interface ConfigEditModalProps {
  show: boolean;
  onClose: () => void;
  isNewConfig: boolean;
  editTab: 'form' | 'json';
  setEditTab: (tab: 'form' | 'json') => void;
  editForm: ConfigFormState;
  setEditForm: React.Dispatch<React.SetStateAction<ConfigFormState>>;
  updateEditField: (field: keyof ConfigFormState, value: any) => void;
  editSaving: boolean;
  editError: string;
  formatEditJson: () => void;
  onSaveProfile: () => void;
}

/**
 * Modal to edit existing profiles or create custom VLESS/VMess/Trojan/Shadowsocks nodes.
 */
export const ConfigEditModal: React.FC<ConfigEditModalProps> = ({
  show,
  onClose,
  isNewConfig,
  editTab,
  setEditTab,
  editForm,
  setEditForm,
  updateEditField,
  editSaving,
  editError,
  formatEditJson,
  onSaveProfile,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="modern-surface rounded-3xl w-full max-w-xl p-5 shadow-2xl border border-white/20 max-h-[90vh] flex flex-col">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-white/10 shrink-0">
          <div className="flex items-center space-x-2.5">
            <Edit className="w-4 h-4 text-white" />
            <span className="font-semibold text-sm text-white">
              {isNewConfig ? 'Create Custom Configuration' : 'Edit Configuration'}
            </span>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-white/10 text-white font-semibold border border-white/15">
              {editForm.protocol}
            </span>
          </div>

          {/* Tab switcher: Form View vs Raw JSON */}
          <div className="flex items-center space-x-2">
            <div className="flex bg-[#121317] p-0.5 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => {
                  try {
                    const parsed = JSON.parse(editForm.rawJson);
                    const pLike: Profile = {
                      id: editForm.id,
                      name: parsed.tag || editForm.name,
                      protocol: parsed.protocol || editForm.protocol,
                      server: editForm.server,
                      port: editForm.port,
                      rawLink: '',
                      outboundJson: editForm.rawJson,
                      ping: -1,
                      createdAt: '',
                    };
                    const f = parseProfileToForm(pLike);
                    setEditForm((prev) => ({ ...prev, ...f }));
                  } catch (_) {}
                  setEditTab('form');
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                  editTab === 'form'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Form
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    const ob = buildOutboundFromForm(editForm);
                    setEditForm((prev) => ({ ...prev, rawJson: JSON.stringify(ob, null, 2) }));
                  } catch (_) {}
                  setEditTab('json');
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                  editTab === 'json'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                JSON
              </button>
            </div>

            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar py-4 space-y-4">
          {editTab === 'form' ? (
            <div className="space-y-4">
              {/* 1. Basic Info */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block px-0.5">
                  General Node Settings
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">Node Name / Remark</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => updateEditField('name', e.target.value)}
                      placeholder="e.g. My Fast Node"
                      className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-xs font-normal text-white focus:outline-none focus:border-white/40"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">Protocol</label>
                    <select
                      value={editForm.protocol}
                      onChange={(e) => updateEditField('protocol', e.target.value as any)}
                      className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-white/40"
                    >
                      <option value="vless">VLESS</option>
                      <option value="vmess">VMess</option>
                      <option value="trojan">Trojan</option>
                      <option value="shadowsocks">Shadowsocks (SS)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-2">
                    <label className="text-[10px] text-zinc-400 block mb-1">Server Address (Domain / IP)</label>
                    <input
                      type="text"
                      value={editForm.server}
                      onChange={(e) => updateEditField('server', e.target.value)}
                      placeholder="example.com or 1.2.3.4"
                      className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-white/40"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">Port</label>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={editForm.port}
                      onChange={(e) => updateEditField('port', parseInt(e.target.value) || 0)}
                      placeholder="443"
                      className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-white/40"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Authentication & Credentials */}
              <div className="space-y-2.5 pt-2 border-t border-white/5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block px-0.5">
                  Credentials & Auth
                </span>

                {editForm.protocol === 'vless' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-zinc-400">User UUID / ID</label>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                                updateEditField('uuid', crypto.randomUUID());
                              }
                            } catch (_) {}
                          }}
                          className="text-[9px] text-zinc-400 hover:text-white transition underline"
                        >
                          + Generate UUID
                        </button>
                      </div>
                      <input
                        type="text"
                        value={editForm.uuid}
                        onChange={(e) => updateEditField('uuid', e.target.value)}
                        placeholder="e.g. b831381d-6324-4d53-ad4f-8cda48b30811"
                        className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-[11px] font-mono text-white focus:outline-none focus:border-white/40"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">Flow</label>
                      <select
                        value={editForm.flow}
                        onChange={(e) => updateEditField('flow', e.target.value)}
                        className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-white/40"
                      >
                        <option value="none">none</option>
                        <option value="xtls-rprx-vision">xtls-rprx-vision</option>
                      </select>
                    </div>
                  </div>
                )}

                {editForm.protocol === 'vmess' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-zinc-400">User UUID / ID</label>
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                              updateEditField('uuid', crypto.randomUUID());
                            }
                          } catch (_) {}
                        }}
                        className="text-[9px] text-zinc-400 hover:text-white transition underline"
                      >
                        + Generate UUID
                      </button>
                    </div>
                    <input
                      type="text"
                      value={editForm.uuid}
                      onChange={(e) => updateEditField('uuid', e.target.value)}
                      placeholder="e.g. b831381d-6324-4d53-ad4f-8cda48b30811"
                      className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-[11px] font-mono text-white focus:outline-none focus:border-white/40"
                    />
                  </div>
                )}

                {editForm.protocol === 'trojan' && (
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">Password / UUID</label>
                    <input
                      type="text"
                      value={editForm.password || editForm.uuid}
                      onChange={(e) => {
                        updateEditField('password', e.target.value);
                        updateEditField('uuid', e.target.value);
                      }}
                      placeholder="Enter Trojan password or UUID"
                      className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-[11px] font-mono text-white focus:outline-none focus:border-white/40"
                    />
                  </div>
                )}

                {editForm.protocol === 'shadowsocks' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">Encryption Method</label>
                      <select
                        value={editForm.method}
                        onChange={(e) => updateEditField('method', e.target.value)}
                        className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-white/40"
                      >
                        <option value="aes-256-gcm">aes-256-gcm</option>
                        <option value="chacha20-ietf-poly1305">chacha20-ietf-poly1305</option>
                        <option value="2022-blake3-aes-128-gcm">2022-blake3-aes-128-gcm</option>
                        <option value="2022-blake3-aes-256-gcm">2022-blake3-aes-256-gcm</option>
                        <option value="aes-128-gcm">aes-128-gcm</option>
                        <option value="rc4-md5">rc4-md5</option>
                        <option value="chacha20">chacha20</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">Password</label>
                      <input
                        type="text"
                        value={editForm.password}
                        onChange={(e) => updateEditField('password', e.target.value)}
                        placeholder="Enter Shadowsocks password"
                        className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-[11px] font-mono text-white focus:outline-none focus:border-white/40"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Transport & Security */}
              <div className="space-y-2.5 pt-2 border-t border-white/5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block px-0.5">
                  Transport & Security
                </span>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">Network Type</label>
                    <select
                      value={editForm.network}
                      onChange={(e) => updateEditField('network', e.target.value as any)}
                      className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-white/40"
                    >
                      <option value="tcp">TCP</option>
                      <option value="ws">WebSocket (WS)</option>
                      <option value="grpc">gRPC</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">Security / Encryption</label>
                    <select
                      value={editForm.security}
                      onChange={(e) => updateEditField('security', e.target.value as any)}
                      className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-white/40"
                    >
                      <option value="none">none</option>
                      <option value="tls">TLS</option>
                      <option value="reality">REALITY</option>
                    </select>
                  </div>
                </div>

                {/* Dynamic details for TLS / Reality */}
                {(editForm.security === 'tls' || editForm.security === 'reality') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">Server Name (SNI)</label>
                      <input
                        type="text"
                        value={editForm.serverName}
                        onChange={(e) => updateEditField('serverName', e.target.value)}
                        placeholder="e.g. www.cloudflare.com"
                        className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-white/40"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">uTLS Fingerprint</label>
                      <select
                        value={editForm.fingerprint}
                        onChange={(e) => updateEditField('fingerprint', e.target.value)}
                        className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-white/40"
                      >
                        <option value="chrome">chrome (Recommended)</option>
                        <option value="firefox">firefox</option>
                        <option value="safari">safari</option>
                        <option value="ios">ios</option>
                        <option value="edge">edge</option>
                        <option value="randomized">randomized</option>
                      </select>
                    </div>

                    {editForm.security === 'reality' && (
                      <>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] text-zinc-400 block mb-1">Reality Public Key (pbk)</label>
                          <input
                            type="text"
                            value={editForm.publicKey}
                            onChange={(e) => updateEditField('publicKey', e.target.value)}
                            placeholder="e.g. 5xX... (Base64 public key)"
                            className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-[11px] font-mono text-white focus:outline-none focus:border-white/40"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-400 block mb-1">Short ID (sid)</label>
                          <input
                            type="text"
                            value={editForm.shortId}
                            onChange={(e) => updateEditField('shortId', e.target.value)}
                            placeholder="e.g. 1a2b3c4d"
                            className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-[11px] font-mono text-white focus:outline-none focus:border-white/40"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-400 block mb-1">SpiderX</label>
                          <input
                            type="text"
                            value={editForm.spiderX}
                            onChange={(e) => updateEditField('spiderX', e.target.value)}
                            placeholder="e.g. /"
                            className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-[11px] font-mono text-white focus:outline-none focus:border-white/40"
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Dynamic details for WS */}
                {editForm.network === 'ws' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">WebSocket Path</label>
                      <input
                        type="text"
                        value={editForm.path}
                        onChange={(e) => updateEditField('path', e.target.value)}
                        placeholder="e.g. /ws or /"
                        className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-white/40"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">Host Header (Optional)</label>
                      <input
                        type="text"
                        value={editForm.hostHeader}
                        onChange={(e) => updateEditField('hostHeader', e.target.value)}
                        placeholder="e.g. host.example.com"
                        className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-white/40"
                      />
                    </div>
                  </div>
                )}

                {editForm.network === 'grpc' && (
                  <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <label className="text-[10px] text-zinc-400 block mb-1">gRPC Service Name</label>
                    <input
                      type="text"
                      value={editForm.path}
                      onChange={(e) => updateEditField('path', e.target.value)}
                      placeholder="e.g. grpc-service"
                      className="w-full px-3 py-2 bg-[#121317] border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-white/40"
                    />
                  </div>
                )}
              </div>

              {/* 4. Complete Outbound JSON Preview */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <div className="flex items-center justify-between px-0.5">
                  <div className="flex items-center space-x-1.5">
                    <FileCode className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Complete Outbound JSON Preview
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          let jsonToCopy = editForm.rawJson;
                          if (!jsonToCopy || jsonToCopy.trim() === '') {
                            const ob = buildOutboundFromForm(editForm);
                            jsonToCopy = JSON.stringify(ob, null, 2);
                          }
                          navigator.clipboard.writeText(jsonToCopy);
                          toast.success('Copied Outbound', 'Complete outbound JSON copied to clipboard.');
                        } catch (_) {}
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-medium transition flex items-center space-x-1"
                      title="Copy Full Outbound JSON"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy Outbound</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const ob = buildOutboundFromForm(editForm);
                          setEditForm((prev) => ({ ...prev, rawJson: JSON.stringify(ob, null, 2) }));
                        } catch (_) {}
                        setEditTab('json');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/10 text-zinc-300 hover:text-white text-[10px] font-medium transition flex items-center space-x-1"
                    >
                      <span>Direct JSON Editor</span>
                    </button>
                  </div>
                </div>
                <div className="p-3 bg-[#0d0e12] rounded-2xl border border-white/10 max-h-48 overflow-y-auto no-scrollbar font-mono text-[10px] text-zinc-300 select-text leading-relaxed">
                  <pre className="whitespace-pre-wrap break-all">
                    {(() => {
                      try {
                        const ob = buildOutboundFromForm(editForm);
                        return JSON.stringify(ob, null, 2);
                      } catch (_) {
                        return editForm.rawJson || '{}';
                      }
                    })()}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            /* JSON Editor View */
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
                <span>Direct Outbound Object (Xray-core syntax)</span>
                <button
                  type="button"
                  onClick={formatEditJson}
                  className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-mono transition"
                >
                  Prettify JSON
                </button>
              </div>
              <textarea
                rows={16}
                value={editForm.rawJson}
                onChange={(e) => setEditForm((prev) => ({ ...prev, rawJson: e.target.value }))}
                className="w-full p-3 bg-[#121317] border border-white/10 rounded-2xl text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-white/40 leading-relaxed select-text"
                spellCheck={false}
              />
            </div>
          )}

          {editError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              {editError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-3 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onSaveProfile}
            disabled={editSaving}
            className="px-5 py-2 rounded-xl bg-white hover:bg-slate-200 text-black text-xs font-semibold transition disabled:opacity-40 shadow-md"
          >
            {editSaving ? 'Saving...' : 'Save & Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};
