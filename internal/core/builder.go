package core

import (
	"fmt"
)

// BuildOutboundFromParams constructs a valid Xray outbound JSON object from structured parameters.
func BuildOutboundFromParams(p CustomOutboundParams) (map[string]any, error) {
	tag := p.Name
	if tag == "" {
		tag = fmt.Sprintf("%s-node", p.Protocol)
	}

	netType := p.Network
	if netType == "" {
		netType = "tcp"
	}
	sec := p.Security
	if sec == "" {
		if p.Protocol == "trojan" {
			sec = "tls"
		} else {
			sec = "none"
		}
	}

	streamSettings := map[string]any{
		"network":  netType,
		"security": sec,
	}

	sni := p.ServerName
	if sni == "" && (sec == "tls" || sec == "reality") {
		sni = p.Server
	}

	if sec == "tls" {
		tlsMap := map[string]any{
			"serverName": sni,
		}
		if p.Fingerprint != "" {
			tlsMap["fingerprint"] = p.Fingerprint
		}
		streamSettings["tlsSettings"] = tlsMap
	} else if sec == "reality" {
		fp := p.Fingerprint
		if fp == "" {
			fp = "chrome"
		}
		streamSettings["realitySettings"] = map[string]any{
			"serverName":  sni,
			"fingerprint": fp,
			"publicKey":   p.PublicKey,
			"shortId":     p.ShortID,
			"spiderX":     p.SpiderX,
		}
	}

	if netType == "ws" {
		wsPath := p.Path
		if wsPath == "" {
			wsPath = "/"
		}
		wsHost := p.HostHeader
		if wsHost == "" {
			wsHost = sni
		}
		streamSettings["wsSettings"] = map[string]any{
			"path": wsPath,
			"headers": map[string]any{
				"Host": wsHost,
			},
		}
	} else if netType == "grpc" {
		streamSettings["grpcSettings"] = map[string]any{
			"serviceName": p.Path,
			"multiMode":   false,
		}
	}

	ob := map[string]any{
		"protocol":       p.Protocol,
		"tag":            tag,
		"streamSettings": streamSettings,
	}

	switch p.Protocol {
	case "vless":
		users := []map[string]any{
			{
				"id":         p.UUID,
				"encryption": "none",
			},
		}
		if p.Flow != "" && p.Flow != "none" {
			users[0]["flow"] = p.Flow
		}
		ob["settings"] = map[string]any{
			"vnext": []map[string]any{
				{
					"address": p.Server,
					"port":    p.Port,
					"users":   users,
				},
			},
		}

	case "vmess":
		ob["settings"] = map[string]any{
			"vnext": []map[string]any{
				{
					"address": p.Server,
					"port":    p.Port,
					"users": []map[string]any{
						{
							"id":       p.UUID,
							"security": "auto",
						},
					},
				},
			},
		}

	case "trojan":
		ob["settings"] = map[string]any{
			"servers": []map[string]any{
				{
					"address":  p.Server,
					"port":     p.Port,
					"password": p.Password,
				},
			},
		}

	case "shadowsocks":
		m := p.Method
		if m == "" {
			m = "aes-256-gcm"
		}
		ob["settings"] = map[string]any{
			"servers": []map[string]any{
				{
					"address":  p.Server,
					"port":     p.Port,
					"method":   m,
					"password": p.Password,
					"uot":      true,
				},
			},
		}

	default:
		return nil, fmt.Errorf("unsupported protocol: %s", p.Protocol)
	}

	return ob, nil
}
