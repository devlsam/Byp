package core

import (
	"encoding/base64"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
)

// decodeBase64Safe safely decodes standard, URL-safe, or unpadded base64 strings.
func decodeBase64Safe(s string) ([]byte, error) {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "-", "+")
	s = strings.ReplaceAll(s, "_", "/")
	switch len(s) % 4 {
	case 2:
		s += "=="
	case 3:
		s += "="
	}
	return base64.StdEncoding.DecodeString(s)
}

// parseShadowsocks parses Shadowsocks ss:// links into Xray outbound structures.
func parseShadowsocks(trimmed string, index int) (map[string]any, error) {
	withoutPrefix := strings.TrimPrefix(trimmed, "ss://")
	tag := fmt.Sprintf("ss-node-%d", index+1)

	if hashIdx := strings.Index(withoutPrefix, "#"); hashIdx != -1 {
		rawTag := withoutPrefix[hashIdx+1:]
		if unescaped, err := url.QueryUnescape(rawTag); err == nil {
			tag = unescaped
		} else {
			tag = rawTag
		}
		withoutPrefix = withoutPrefix[:hashIdx]
	}

	if qIdx := strings.Index(withoutPrefix, "?"); qIdx != -1 {
		withoutPrefix = withoutPrefix[:qIdx]
	}

	var method, password, host string
	var port int

	if atIdx := strings.Index(withoutPrefix, "@"); atIdx != -1 {
		credsPart := withoutPrefix[:atIdx]
		hostPart := withoutPrefix[atIdx+1:]

		decodedCreds, err := decodeBase64Safe(credsPart)
		credsStr := credsPart
		if err == nil && strings.Contains(string(decodedCreds), ":") {
			credsStr = string(decodedCreds)
		}
		parts := strings.SplitN(credsStr, ":", 2)
		if len(parts) == 2 {
			method = parts[0]
			password = parts[1]
		}

		if h, pStr, err := net.SplitHostPort(hostPart); err == nil {
			host = h
			port, _ = strconv.Atoi(pStr)
		} else {
			host = hostPart
			port = 8388
		}
	} else {
		decoded, err := decodeBase64Safe(withoutPrefix)
		if err != nil {
			return nil, fmt.Errorf("invalid shadowsocks base64: %w", err)
		}
		decodedStr := string(decoded)
		atIdx := strings.Index(decodedStr, "@")
		if atIdx == -1 {
			return nil, fmt.Errorf("invalid shadowsocks format: missing @")
		}
		credsPart := decodedStr[:atIdx]
		hostPart := decodedStr[atIdx+1:]

		parts := strings.SplitN(credsPart, ":", 2)
		if len(parts) == 2 {
			method = parts[0]
			password = parts[1]
		}
		if h, pStr, err := net.SplitHostPort(hostPart); err == nil {
			host = h
			port, _ = strconv.Atoi(pStr)
		} else {
			host = hostPart
			port = 8388
		}
	}

	if method == "" {
		method = "aes-256-gcm"
	}

	return map[string]any{
		"protocol": "shadowsocks",
		"tag":      tag,
		"settings": map[string]any{
			"servers": []map[string]any{
				{
					"address":  host,
					"port":     port,
					"method":   method,
					"password": password,
					"uot":      true,
				},
			},
		},
		"streamSettings": map[string]any{
			"network": "tcp",
		},
	}, nil
}
