package core

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/xtls/libxray/share"

	"changeme/internal/storage"
)

// ParseShareLinks parses one or multiple share links (vless, vmess, trojan, ss, etc.) or base64 subscription text into Profile models.
func (m *XrayManager) ParseShareLinks(raw string) ([]storage.Profile, error) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return nil, fmt.Errorf("input text is empty")
	}

	// 1. Decode base64 if input has no URI scheme or JSON delimiters
	if !strings.Contains(text, "://") && !strings.HasPrefix(text, "{") && !strings.HasPrefix(text, "[") {
		if decoded, err := base64.StdEncoding.DecodeString(text); err == nil && len(decoded) > 0 {
			text = strings.TrimSpace(string(decoded))
		}
	}

	var parsedOutbounds []map[string]any

	// 1b. Direct Raw JSON input
	if strings.HasPrefix(text, "{") || strings.HasPrefix(text, "[") {
		var singleOb map[string]any
		if err := json.Unmarshal([]byte(text), &singleOb); err == nil {
			if _, ok := singleOb["protocol"]; ok {
				parsedOutbounds = append(parsedOutbounds, singleOb)
			} else if obs, ok := singleOb["outbounds"].([]any); ok && len(obs) > 0 {
				for _, o := range obs {
					if om, ok := o.(map[string]any); ok {
						if _, hasProto := om["protocol"]; hasProto {
							parsedOutbounds = append(parsedOutbounds, om)
						}
					}
				}
			}
		} else {
			var listObs []map[string]any
			if err := json.Unmarshal([]byte(text), &listObs); err == nil && len(listObs) > 0 {
				for _, om := range listObs {
					if _, hasProto := om["protocol"]; hasProto {
						parsedOutbounds = append(parsedOutbounds, om)
					}
				}
			}
		}
	}

	originalLines := strings.Split(text, "\n")
	lineRemarks := make(map[string]string)
	for _, l := range originalLines {
		trimmed := strings.TrimSpace(l)
		if u, err := url.Parse(trimmed); err == nil && u.Fragment != "" {
			decodedRemark, _ := url.QueryUnescape(u.Fragment)
			lineRemarks[u.Host] = decodedRemark
			lineRemarks[u.Hostname()] = decodedRemark
		}
	}

	linkCount := 0
	for _, l := range originalLines {
		trimmed := strings.TrimSpace(l)
		if strings.Contains(trimmed, "://") {
			linkCount++
		}
	}
	if linkCount == 0 {
		linkCount = 1
	}

	// 2. Official libxray converter
	if len(parsedOutbounds) == 0 {
		convBytes, err := share.ConvertShareLinksToXrayJson(text, "")
		if err == nil {
			var doc struct {
				Outbounds []map[string]any `json:"outbounds"`
			}
			if json.Unmarshal(convBytes, &doc) == nil && len(doc.Outbounds) > 0 {
				parsedOutbounds = doc.Outbounds
			}
		}
	}

	// 3. Address unencrypted dotless host placeholders if libxray dropped any outbounds
	if len(parsedOutbounds) < linkCount {
		var modifiedLines []string
		hostMap := make(map[string]string)

		for i, line := range originalLines {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "vless://") || strings.HasPrefix(trimmed, "trojan://") {
				if u, err := url.Parse(trimmed); err == nil && u.Hostname() != "" {
					ph := fmt.Sprintf("proxynode%d", i)
					origHostname := u.Hostname()
					port := u.Port()
					if port != "" {
						u.Host = ph + ":" + port
					} else {
						u.Host = ph
					}
					hostMap[ph] = origHostname
					modifiedLines = append(modifiedLines, u.String())
					continue
				}
			}
			modifiedLines = append(modifiedLines, line)
		}

		modRaw := strings.Join(modifiedLines, "\n")
		if modBytes, err2 := share.ConvertShareLinksToXrayJson(modRaw, ""); err2 == nil {
			var doc struct {
				Outbounds []map[string]any `json:"outbounds"`
			}
			if json.Unmarshal(modBytes, &doc) == nil && len(doc.Outbounds) > 0 {
				for _, ob := range doc.Outbounds {
					if settings, ok := ob["settings"].(map[string]any); ok {
						if addr, ok := settings["address"].(string); ok {
							if realH, exists := hostMap[addr]; exists {
								settings["address"] = realH
							}
						}
						if vnext, ok := settings["vnext"].([]any); ok && len(vnext) > 0 {
							if firstVnext, ok := vnext[0].(map[string]any); ok {
								if addr, ok := firstVnext["address"].(string); ok {
									if realH, exists := hostMap[addr]; exists {
										firstVnext["address"] = realH
									}
								}
							}
						}
					}
				}
				parsedOutbounds = doc.Outbounds
			}
		}
	}

	// 4. Pure Go parser fallback
	if len(parsedOutbounds) < linkCount {
		for i, line := range originalLines {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" {
				continue
			}

			alreadyParsed := false
			for _, ob := range parsedOutbounds {
				if tag, _ := ob["tag"].(string); tag == lineRemarks[trimmed] && tag != "" {
					alreadyParsed = true
					break
				}
			}
			if alreadyParsed && len(parsedOutbounds) >= linkCount {
				continue
			}

			// Raw JSON outbound
			if strings.HasPrefix(trimmed, "{") {
				var jsonDoc map[string]any
				if err := json.Unmarshal([]byte(trimmed), &jsonDoc); err == nil {
					if _, ok := jsonDoc["protocol"]; ok {
						parsedOutbounds = append(parsedOutbounds, jsonDoc)
						continue
					}
					if obs, ok := jsonDoc["outbounds"].([]any); ok {
						for _, o := range obs {
							if om, ok := o.(map[string]any); ok {
								parsedOutbounds = append(parsedOutbounds, om)
							}
						}
						continue
					}
				}
			}

			// Shadowsocks ss:// parser
			if strings.HasPrefix(trimmed, "ss://") {
				if ob, err := parseShadowsocks(trimmed, i); err == nil {
					parsedOutbounds = append(parsedOutbounds, ob)
					continue
				}
			}

			// VLESS parser
			if strings.HasPrefix(trimmed, "vless://") {
				if u, err := url.Parse(trimmed); err == nil {
					port, _ := strconv.Atoi(u.Port())
					tag := u.Fragment
					if tag == "" {
						tag = fmt.Sprintf("vless-%d", i+1)
					} else {
						tag, _ = url.QueryUnescape(tag)
					}
					q := u.Query()
					sec := q.Get("security")
					if sec == "" {
						sec = "none"
					}
					netType := q.Get("type")
					if netType == "" {
						netType = "tcp"
					}

					streamSettings := map[string]any{
						"network":  netType,
						"security": sec,
					}

					sni := q.Get("sni")
					if sni == "" {
						sni = u.Hostname()
					}

					if sec == "reality" {
						fp := q.Get("fp")
						if fp == "" {
							fp = "chrome"
						}
						streamSettings["realitySettings"] = map[string]any{
							"serverName":  sni,
							"fingerprint": fp,
							"publicKey":   q.Get("pbk"),
							"shortId":     q.Get("sid"),
							"spiderX":     q.Get("spx"),
						}
					} else if sec == "tls" {
						tlsMap := map[string]any{
							"serverName":    sni,
							"allowInsecure": q.Get("allowInsecure") == "1" || q.Get("insecure") == "1",
						}
						if fp := q.Get("fp"); fp != "" {
							tlsMap["fingerprint"] = fp
						}
						if alpn := q.Get("alpn"); alpn != "" {
							tlsMap["alpn"] = strings.Split(alpn, ",")
						}
						streamSettings["tlsSettings"] = tlsMap
					}

					if netType == "ws" {
						wsPath := q.Get("path")
						if wsPath == "" {
							wsPath = "/"
						}
						wsHost := q.Get("host")
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
						svc := q.Get("serviceName")
						if svc == "" {
							svc = q.Get("service")
						}
						streamSettings["grpcSettings"] = map[string]any{
							"serviceName": svc,
							"multiMode":   q.Get("mode") == "multi",
						}
					}

					ob := map[string]any{
						"protocol": "vless",
						"tag":      tag,
						"settings": map[string]any{
							"vnext": []map[string]any{
								{
									"address": u.Hostname(),
									"port":    port,
									"users": []map[string]any{
										{
											"id":         u.User.Username(),
											"encryption": "none",
											"flow":       q.Get("flow"),
										},
									},
								},
							},
						},
						"streamSettings": streamSettings,
					}
					parsedOutbounds = append(parsedOutbounds, ob)
					continue
				}
			}

			// VMess parser
			if strings.HasPrefix(trimmed, "vmess://") {
				rawB64 := strings.TrimPrefix(trimmed, "vmess://")
				if decoded, err := decodeBase64Safe(rawB64); err == nil {
					var v struct {
						Ps   string `json:"ps"`
						Add  string `json:"add"`
						Port any    `json:"port"`
						Id   string `json:"id"`
						Aid  any    `json:"aid"`
						Net  string `json:"net"`
						Type string `json:"type"`
						Host string `json:"host"`
						Path string `json:"path"`
						Tls  string `json:"tls"`
						Sni  string `json:"sni"`
					}
					if json.Unmarshal(decoded, &v) == nil && v.Add != "" {
						port := 443
						switch p := v.Port.(type) {
						case float64:
							port = int(p)
						case string:
							port, _ = strconv.Atoi(p)
						}
						sec := "none"
						if v.Tls == "tls" {
							sec = "tls"
						}
						netType := "tcp"
						if v.Net != "" {
							netType = v.Net
						}
						tag := v.Ps
						if tag == "" {
							tag = fmt.Sprintf("vmess-%d", i+1)
						}

						streamSettings := map[string]any{
							"network":  netType,
							"security": sec,
						}
						sni := v.Sni
						if sni == "" {
							sni = v.Host
						}
						if sni == "" {
							sni = v.Add
						}
						if sec == "tls" {
							streamSettings["tlsSettings"] = map[string]any{
								"serverName": sni,
							}
						}
						if netType == "ws" {
							wsPath := v.Path
							if wsPath == "" {
								wsPath = "/"
							}
							streamSettings["wsSettings"] = map[string]any{
								"path": wsPath,
								"headers": map[string]any{
									"Host": sni,
								},
							}
						}

						ob := map[string]any{
							"protocol": "vmess",
							"tag":      tag,
							"settings": map[string]any{
								"vnext": []map[string]any{
									{
										"address": v.Add,
										"port":    port,
										"users": []map[string]any{
											{
												"id":       v.Id,
												"security": "auto",
											},
										},
									},
								},
							},
							"streamSettings": streamSettings,
						}
						parsedOutbounds = append(parsedOutbounds, ob)
						continue
					}
				}
			}

			// Trojan parser
			if strings.HasPrefix(trimmed, "trojan://") {
				if u, err := url.Parse(trimmed); err == nil {
					port, _ := strconv.Atoi(u.Port())
					tag := u.Fragment
					if tag == "" {
						tag = fmt.Sprintf("trojan-%d", i+1)
					} else {
						tag, _ = url.QueryUnescape(tag)
					}
					q := u.Query()
					sec := q.Get("security")
					if sec == "" {
						sec = "tls"
					}
					netType := q.Get("type")
					if netType == "" {
						netType = "tcp"
					}

					streamSettings := map[string]any{
						"network":  netType,
						"security": sec,
					}

					sni := q.Get("sni")
					if sni == "" {
						sni = q.Get("peer")
					}
					if sni == "" && (sec == "tls" || sec == "reality") {
						sni = u.Hostname()
					}

					if sec == "tls" {
						tlsMap := map[string]any{
							"serverName":    sni,
							"allowInsecure": q.Get("allowInsecure") == "1" || q.Get("insecure") == "1",
						}
						if fp := q.Get("fp"); fp != "" {
							tlsMap["fingerprint"] = fp
						}
						if alpn := q.Get("alpn"); alpn != "" {
							tlsMap["alpn"] = strings.Split(alpn, ",")
						}
						streamSettings["tlsSettings"] = tlsMap
					} else if sec == "reality" {
						realityMap := map[string]any{
							"serverName":  sni,
							"fingerprint": q.Get("fp"),
							"publicKey":   q.Get("pbk"),
							"shortId":     q.Get("sid"),
							"spiderX":     q.Get("spx"),
						}
						if realityMap["fingerprint"] == "" {
							realityMap["fingerprint"] = "chrome"
						}
						streamSettings["realitySettings"] = realityMap
					}

					if netType == "ws" {
						wsPath := q.Get("path")
						if wsPath == "" {
							wsPath = "/"
						}
						wsHost := q.Get("host")
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
						svcName := q.Get("serviceName")
						if svcName == "" {
							svcName = q.Get("service")
						}
						streamSettings["grpcSettings"] = map[string]any{
							"serviceName": svcName,
							"multiMode":   q.Get("mode") == "multi",
						}
					}

					ob := map[string]any{
						"protocol": "trojan",
						"tag":      tag,
						"settings": map[string]any{
							"servers": []map[string]any{
								{
									"address":  u.Hostname(),
									"port":     port,
									"password": u.User.Username(),
								},
							},
						},
						"streamSettings": streamSettings,
					}
					parsedOutbounds = append(parsedOutbounds, ob)
					continue
				}
			}
		}
	}

	if len(parsedOutbounds) == 0 {
		return nil, fmt.Errorf("no valid outbound found in provided share link(s)")
	}

	profiles := make([]storage.Profile, 0, len(parsedOutbounds))
	now := time.Now()

	for i, outbound := range parsedOutbounds {
		protocol, _ := outbound["protocol"].(string)
		tag, _ := outbound["tag"].(string)
		if tag == "" {
			tag = fmt.Sprintf("%s-node-%d", protocol, i+1)
		}

		serverHost := ""
		serverPort := 0

		if settings, ok := outbound["settings"].(map[string]any); ok {
			if addr, ok := settings["address"].(string); ok && addr != "" {
				serverHost = addr
			}
			if p, ok := settings["port"].(float64); ok && p > 0 {
				serverPort = int(p)
			}
			if p, ok := settings["port"].(int); ok && p > 0 {
				serverPort = p
			}

			if serverHost == "" {
				if vnext, ok := settings["vnext"].([]any); ok && len(vnext) > 0 {
					if firstVnext, ok := vnext[0].(map[string]any); ok {
						if addr, ok := firstVnext["address"].(string); ok {
							serverHost = addr
						}
						if p, ok := firstVnext["port"].(float64); ok {
							serverPort = int(p)
						}
						if p, ok := firstVnext["port"].(int); ok {
							serverPort = p
						}
					}
				} else if vnext, ok := settings["vnext"].([]map[string]any); ok && len(vnext) > 0 {
					firstVnext := vnext[0]
					if addr, ok := firstVnext["address"].(string); ok {
						serverHost = addr
					}
					if p, ok := firstVnext["port"].(float64); ok {
						serverPort = int(p)
					}
					if p, ok := firstVnext["port"].(int); ok {
						serverPort = p
					}
				} else if servers, ok := settings["servers"].([]any); ok && len(servers) > 0 {
					if firstServer, ok := servers[0].(map[string]any); ok {
						if addr, ok := firstServer["address"].(string); ok {
							serverHost = addr
						}
						if p, ok := firstServer["port"].(float64); ok {
							serverPort = int(p)
						}
						if p, ok := firstServer["port"].(int); ok {
							serverPort = p
						}
					}
				} else if servers, ok := settings["servers"].([]map[string]any); ok && len(servers) > 0 {
					firstServer := servers[0]
					if addr, ok := firstServer["address"].(string); ok {
						serverHost = addr
					}
					if p, ok := firstServer["port"].(float64); ok {
						serverPort = int(p)
					}
					if p, ok := firstServer["port"].(int); ok {
						serverPort = p
					}
				}
			}
		}

		if tag == "" || strings.HasPrefix(tag, "-") || strings.Contains(tag, "node-") {
			if r, ok := lineRemarks[serverHost]; ok && r != "" {
				tag = r
			}
		}
		tag = strings.TrimPrefix(tag, "-")
		if tag == "" {
			tag = fmt.Sprintf("%s-node-%d", protocol, i+1)
		}

		singleOutboundBytes, _ := json.Marshal(outbound)

		p := storage.Profile{
			ID:           fmt.Sprintf("prof-%d-%d", now.UnixNano(), i),
			Name:         tag,
			Protocol:     protocol,
			Server:       serverHost,
			Port:         serverPort,
			RawLink:      "",
			OutboundJSON: string(singleOutboundBytes),
			Ping:         -1,
			CreatedAt:    now,
		}

		if len(originalLines) == 1 && strings.Contains(originalLines[0], "://") {
			p.RawLink = originalLines[0]
		}

		profiles = append(profiles, p)
	}

	return profiles, nil
}
