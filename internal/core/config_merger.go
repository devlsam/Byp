package core

import (
	"encoding/json"
	"fmt"
)

type ConfigMergerOptions struct {
	SocksPort  int
	HttpPort   int
	ApiPort    int
	DnsServers []string
}

// MergeCompleteConfig takes the outbound JSON (either raw single outbound or {"outbounds":[...]})
// and returns a complete, production-ready Xray configuration JSON string.
func MergeCompleteConfig(outboundRaw string, opts ConfigMergerOptions) (string, error) {
	if opts.SocksPort == 0 {
		opts.SocksPort = 10808
	}
	if opts.HttpPort == 0 {
		opts.HttpPort = 10809
	}
	if opts.ApiPort == 0 {
		opts.ApiPort = 10807
	}

	var parsedOutbounds []map[string]any

	// Test if it's already {"outbounds": [...]}
	var container struct {
		Outbounds []map[string]any `json:"outbounds"`
	}
	if err := json.Unmarshal([]byte(outboundRaw), &container); err == nil && len(container.Outbounds) > 0 {
		parsedOutbounds = container.Outbounds
	} else {
		// Try as single outbound map
		var single map[string]any
		if err := json.Unmarshal([]byte(outboundRaw), &single); err == nil {
			parsedOutbounds = []map[string]any{single}
		} else {
			return "", fmt.Errorf("invalid outbound JSON: %w", err)
		}
	}

	// Ensure the first outbound is tagged "proxy"
	parsedOutbounds[0]["tag"] = "proxy"

	// Check if proxy outbound is vless or trojan with security: "none"
	// Xray-core strictly prohibits vless/trojan without TLS/encryption over public IPs/domains.
	// We safely bridge this by setting a dotless host alias ("proxynode") and resolving it
	// via internal dns.hosts + sockopt.domainStrategy: "UseIP".
	dnsConfig := map[string]any{}
	proxyOutbound := parsedOutbounds[0]
	protocol, _ := proxyOutbound["protocol"].(string)

	var targetHost string
	var settingsMap map[string]any
	if s, ok := proxyOutbound["settings"].(map[string]any); ok {
		settingsMap = s
	}

	if settingsMap != nil {
		if addr, ok := settingsMap["address"].(string); ok && addr != "" {
			targetHost = addr
		} else if vnext, ok := settingsMap["vnext"].([]any); ok && len(vnext) > 0 {
			if firstVn, ok := vnext[0].(map[string]any); ok {
				if addr, ok := firstVn["address"].(string); ok {
					targetHost = addr
				}
			}
		} else if servers, ok := settingsMap["servers"].([]any); ok && len(servers) > 0 {
			if firstSrv, ok := servers[0].(map[string]any); ok {
				if addr, ok := firstSrv["address"].(string); ok {
					targetHost = addr
				}
			}
		}
	}

	streamSettings, _ := proxyOutbound["streamSettings"].(map[string]any)
	security, _ := streamSettings["security"].(string)

	if (protocol == "vless" || protocol == "trojan") && (security == "" || security == "none") && targetHost != "" {
		alias := "proxynode"
		if addr, ok := settingsMap["address"].(string); ok && addr != "" {
			settingsMap["address"] = alias
		}
		if vnext, ok := settingsMap["vnext"].([]any); ok && len(vnext) > 0 {
			if firstVn, ok := vnext[0].(map[string]any); ok {
				firstVn["address"] = alias
			}
		}
		if servers, ok := settingsMap["servers"].([]any); ok && len(servers) > 0 {
			if firstSrv, ok := servers[0].(map[string]any); ok {
				firstSrv["address"] = alias
			}
		}

		if streamSettings == nil {
			streamSettings = make(map[string]any)
			proxyOutbound["streamSettings"] = streamSettings
		}
		sockopt, ok := streamSettings["sockopt"].(map[string]any)
		if !ok {
			sockopt = make(map[string]any)
			streamSettings["sockopt"] = sockopt
		}
		sockopt["domainStrategy"] = "UseIP"

		dnsConfig = map[string]any{
			"hosts": map[string]any{
				alias: targetHost,
			},
		}
	}

	if len(opts.DnsServers) > 0 {
		dnsConfig["servers"] = opts.DnsServers
	}

	// Append direct freedom and block blackhole outbounds
	directOutbound := map[string]any{
		"protocol": "freedom",
		"tag":      "direct",
		"settings": map[string]any{},
	}
	blockOutbound := map[string]any{
		"protocol": "blackhole",
		"tag":      "block",
		"settings": map[string]any{
			"response": map[string]any{
				"type": "none",
			},
		},
	}
	allOutbounds := append(parsedOutbounds, directOutbound, blockOutbound)

	inbounds := []map[string]any{
		{
			"tag":      "socks-in",
			"port":     opts.SocksPort,
			"listen":   "127.0.0.1",
			"protocol": "socks",
			"settings": map[string]any{
				"auth": "noauth",
				"udp":  true,
			},
			"sniffing": map[string]any{
				"enabled":      true,
				"destOverride": []string{"http", "tls", "quic"},
				"routeOnly":    false,
			},
		},
		{
			"tag":      "http-in",
			"port":     opts.HttpPort,
			"listen":   "127.0.0.1",
			"protocol": "http",
			"settings": map[string]any{},
		},
		{
			"tag":      "api-in",
			"port":     opts.ApiPort,
			"listen":   "127.0.0.1",
			"protocol": "dokodemo-door",
			"settings": map[string]any{
				"address": "127.0.0.1",
			},
		},
	}

	routing := map[string]any{
		"domainStrategy": "IPIfNonMatch",
		"rules": []map[string]any{
			{
				"type":        "field",
				"inboundTag":  []string{"api-in"},
				"outboundTag": "api",
			},
			{
				"type":        "field",
				"ip":          []string{"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "169.254.0.0/16", "::1/128", "fc00::/7", "fe80::/10"},
				"outboundTag": "direct",
			},
			{
				"type":        "field",
				"network":     "tcp,udp",
				"outboundTag": "proxy",
			},
		},
	}

	policy := map[string]any{
		"levels": map[string]any{
			"0": map[string]any{
				"handshake":         4,
				"connIdle":          30,
				"uplinkOnly":        2,
				"downlinkOnly":      5,
				"bufferSize":        4,
				"statsUserUplink":   true,
				"statsUserDownlink": true,
			},
		},
		"system": map[string]any{
			"statsInboundUplink":    true,
			"statsInboundDownlink":  true,
			"statsOutboundUplink":   true,
			"statsOutboundDownlink": true,
		},
	}

	api := map[string]any{
		"tag": "api",
		"services": []string{
			"StatsService",
		},
	}

	fullConfig := map[string]any{
		"log": map[string]any{
			"loglevel": "warning",
		},
		"api":       api,
		"stats":     map[string]any{},
		"policy":    policy,
		"inbounds":  inbounds,
		"outbounds": allOutbounds,
		"routing":   routing,
	}

	if len(dnsConfig) > 0 {
		fullConfig["dns"] = dnsConfig
	}

	mergedBytes, err := json.MarshalIndent(fullConfig, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to serialize merged config: %w", err)
	}

	return string(mergedBytes), nil
}
