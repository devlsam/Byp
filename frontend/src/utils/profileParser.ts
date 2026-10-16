import type { Profile } from '../../bindings/changeme/internal/storage/models';
import type { ConfigFormState } from '../types';

/**
 * Extracts form field values from a storage Profile, with deep inspection of outboundJson
 * and fallback parsing for raw share links.
 */
export function parseProfileToForm(profile: Profile): ConfigFormState {
  let outbound: any = {};
  try {
    if (profile.outboundJson) {
      outbound = JSON.parse(profile.outboundJson);
    }
  } catch (_) {}

  // 1. Unwrap if wrapped in { outbounds: [...] } or an array
  if (Array.isArray(outbound) && outbound.length > 0) {
    outbound = outbound[0];
  } else if (outbound && outbound.outbounds && Array.isArray(outbound.outbounds) && outbound.outbounds.length > 0) {
    outbound = outbound.outbounds[0];
  }

  let rawProto = (outbound?.protocol || profile.protocol || 'vless').toLowerCase();
  if (rawProto === 'ss') rawProto = 'shadowsocks';
  const proto = (['vless', 'vmess', 'trojan', 'shadowsocks'].includes(rawProto)
    ? rawProto
    : 'vless') as ConfigFormState['protocol'];

  const stream = outbound?.streamSettings || {};
  const settings = outbound?.settings || {};

  let uuid = '';
  let password = '';
  let method = 'aes-256-gcm';
  let flow = 'none';
  let server = profile.server || '';
  let port = profile.port || 443;

  // Extract from settings.vnext
  if (settings.vnext && Array.isArray(settings.vnext) && settings.vnext[0]) {
    const vn = settings.vnext[0];
    if (vn.address) server = vn.address;
    if (vn.port) port = Number(vn.port);
    const users = vn.users || vn.user;
    if (Array.isArray(users) && users[0]) {
      uuid = users[0].id || users[0].uuid || '';
      flow = users[0].flow || 'none';
    } else if (users && typeof users === 'object') {
      uuid = users.id || users.uuid || '';
      flow = users.flow || 'none';
    }
  } else if (settings.servers && Array.isArray(settings.servers) && settings.servers[0]) {
    const s = settings.servers[0];
    if (s.address) server = s.address;
    if (s.port) port = Number(s.port);
    password = s.password || '';
    if (s.id) uuid = s.id;
    if (s.uuid) uuid = s.uuid;
    if (s.method) method = s.method;
    const users = s.users || s.user;
    if (Array.isArray(users) && users[0]) {
      if (!password && users[0].password) password = users[0].password;
      if (!uuid && users[0].id) uuid = users[0].id;
      if (!uuid && users[0].uuid) uuid = users[0].uuid;
    }
  }

  if (!uuid && settings.id) uuid = settings.id;
  if (!uuid && settings.uuid) uuid = settings.uuid;
  if (!password && settings.password) password = settings.password;

  // Deep fallback for UUID from JSON string regex if still empty
  if (!uuid && outbound) {
    try {
      const s = JSON.stringify(outbound);
      const m = s.match(/"(?:id|uuid)"\s*:\s*"([0-9a-fA-F-]{32,36})"/i);
      if (m) uuid = m[1];
    } catch (_) {}
  }

  if (!uuid && profile.outboundJson) {
    const m = profile.outboundJson.match(/"(?:id|uuid)"\s*:\s*"([0-9a-fA-F-]{32,36})"/i);
    if (m) uuid = m[1];
  }

  // Universal fallback for standard 36-char RFC UUID pattern in outboundJson or rawLink
  if (!uuid) {
    const uuidRegex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
    const mJson = profile.outboundJson?.match(uuidRegex);
    if (mJson) {
      uuid = mJson[0];
    }
  }

  // Fallback: extract credentials directly from profile.rawLink
  if (profile.rawLink) {
    try {
      const rl = profile.rawLink.trim();
      if (rl.startsWith('vless://') || rl.startsWith('trojan://')) {
        const uMatch = rl.match(/^[a-z0-9]+:\/\/([^@/?#]+)@/i);
        if (uMatch) {
          const cred = decodeURIComponent(uMatch[1]);
          if (rl.startsWith('vless://')) {
            if (!uuid) uuid = cred;
          } else {
            if (!password) password = cred;
            if (!uuid && /[0-9a-fA-F-]{32,36}/.test(cred)) uuid = cred;
          }
        }
        const flowMatch = rl.match(/[?&]flow=([^&#]+)/i);
        if (flowMatch && flow === 'none') {
          flow = decodeURIComponent(flowMatch[1]);
        }
      } else if (rl.startsWith('vmess://')) {
        const b64 = rl.slice(8).split('#')[0].split('?')[0];
        try {
          const jsonText = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
          const v = JSON.parse(jsonText);
          if (v.id && !uuid) uuid = v.id;
        } catch (_) {}
      } else if (rl.startsWith('ss://')) {
        const withoutPrefix = rl.slice(5).split('#')[0];
        if (withoutPrefix.includes('@')) {
          const userinfo = withoutPrefix.split('@')[0];
          try {
            const dec = atob(userinfo.replace(/-/g, '+').replace(/_/g, '/'));
            const parts = dec.split(':');
            if (parts.length >= 2 && !password) password = parts.slice(1).join(':');
          } catch (_) {
            const parts = userinfo.split(':');
            if (parts.length >= 2 && !password) password = parts.slice(1).join(':');
          }
        }
      }
    } catch (_) {}
  }

  // Sync trojan password and uuid if one is present and other is empty
  if (proto === 'trojan') {
    if (!password && uuid) password = uuid;
    if (!uuid && password) uuid = password;
  }

  const rawNet = (stream.network || 'tcp').toLowerCase();
  const network = (['tcp', 'ws', 'grpc'].includes(rawNet) ? rawNet : 'tcp') as ConfigFormState['network'];

  const rawSec = (stream.security || 'none').toLowerCase();
  const security = (['none', 'tls', 'reality'].includes(rawSec) ? rawSec : 'none') as ConfigFormState['security'];

  const tls = stream.tlsSettings || {};
  const reality = stream.realitySettings || {};
  const ws = stream.wsSettings || {};
  const grpc = stream.grpcSettings || {};

  const serverName = reality.serverName || tls.serverName || '';
  const fingerprint = reality.fingerprint || tls.fingerprint || 'chrome';
  const publicKey = reality.publicKey || '';
  const shortId = reality.shortId || '';
  const spiderX = reality.spiderX || '';

  const path = ws.path || grpc.serviceName || '';
  const hostHeader = ws.headers?.Host || ws.headers?.host || '';

  let rawJson = '';
  try {
    if (profile.outboundJson && profile.outboundJson.trim().startsWith('{')) {
      rawJson = JSON.stringify(JSON.parse(profile.outboundJson), null, 2);
    } else {
      rawJson = JSON.stringify(outbound, null, 2);
    }
  } catch (_) {
    rawJson = JSON.stringify(outbound, null, 2);
  }

  return {
    id: profile.id,
    name: profile.name,
    protocol: proto,
    server,
    port,
    uuid,
    password,
    method,
    flow,
    network,
    security,
    serverName,
    path,
    hostHeader,
    fingerprint,
    publicKey,
    shortId,
    spiderX,
    rawJson,
  };
}

/**
 * Builds an Xray/V2Ray outbound object structure from form state.
 */
export function buildOutboundFromForm(form: ConfigFormState): any {
  const streamSettings: any = {
    network: form.network,
    security: form.security,
  };

  const sni = form.serverName || form.server;

  if (form.security === 'tls') {
    streamSettings.tlsSettings = {
      serverName: sni,
      ...(form.fingerprint ? { fingerprint: form.fingerprint } : {}),
    };
  } else if (form.security === 'reality') {
    streamSettings.realitySettings = {
      serverName: sni,
      fingerprint: form.fingerprint || 'chrome',
      publicKey: form.publicKey,
      shortId: form.shortId,
      spiderX: form.spiderX,
    };
  }

  if (form.network === 'ws') {
    streamSettings.wsSettings = {
      path: form.path || '/',
      headers: {
        Host: form.hostHeader || sni,
      },
    };
  } else if (form.network === 'grpc') {
    streamSettings.grpcSettings = {
      serviceName: form.path || '',
      multiMode: false,
    };
  }

  const outbound: any = {
    protocol: form.protocol,
    tag: form.name || `${form.protocol}-node`,
    streamSettings,
  };

  if (form.protocol === 'vless') {
    outbound.settings = {
      vnext: [
        {
          address: form.server,
          port: Number(form.port),
          users: [
            {
              id: form.uuid,
              encryption: 'none',
              ...(form.flow && form.flow !== 'none' ? { flow: form.flow } : {}),
            },
          ],
        },
      ],
    };
  } else if (form.protocol === 'vmess') {
    outbound.settings = {
      vnext: [
        {
          address: form.server,
          port: Number(form.port),
          users: [
            {
              id: form.uuid,
              security: 'auto',
            },
          ],
        },
      ],
    };
  } else if (form.protocol === 'trojan') {
    outbound.settings = {
      servers: [
        {
          address: form.server,
          port: Number(form.port),
          password: form.password || form.uuid,
        },
      ],
    };
  } else if (form.protocol === 'shadowsocks') {
    outbound.settings = {
      servers: [
        {
          address: form.server,
          port: Number(form.port),
          method: form.method || 'aes-256-gcm',
          password: form.password,
          uot: true,
        },
      ],
    };
  }

  return outbound;
}
