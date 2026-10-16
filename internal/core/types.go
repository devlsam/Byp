package core

// TrafficStats holds upload and download metrics for live monitoring.
type TrafficStats struct {
	UploadSpeed   int64 `json:"uploadSpeed"`   // Bytes per second
	DownloadSpeed int64 `json:"downloadSpeed"` // Bytes per second
	TotalUpload   int64 `json:"totalUpload"`   // Total session bytes uploaded
	TotalDownload int64 `json:"totalDownload"` // Total session bytes downloaded
}

// CustomOutboundParams contains structured fields to build or edit an outbound proxy configuration.
type CustomOutboundParams struct {
	Protocol    string `json:"protocol"`    // vless, vmess, trojan, shadowsocks
	Name        string `json:"name"`        // Outbound tag or remark
	Server      string `json:"server"`      // Server host or IP
	Port        int    `json:"port"`        // Server port
	Password    string `json:"password"`    // Password for trojan or shadowsocks
	UUID        string `json:"uuid"`        // User UUID for vless or vmess
	Method      string `json:"method"`      // Encryption method for shadowsocks
	Flow        string `json:"flow"`        // Flow control (e.g. xtls-rprx-vision)
	Network     string `json:"network"`     // tcp, ws, grpc
	Security    string `json:"security"`    // none, tls, reality
	ServerName  string `json:"serverName"`  // SNI
	Path        string `json:"path"`        // WebSocket path or gRPC service name
	HostHeader  string `json:"hostHeader"`  // WebSocket Host header
	Fingerprint string `json:"fingerprint"` // uTLS client fingerprint (chrome, etc.)
	PublicKey   string `json:"publicKey"`   // REALITY public key
	ShortID     string `json:"shortId"`     // REALITY short ID
	SpiderX     string `json:"spiderX"`     // REALITY spiderX path
}
