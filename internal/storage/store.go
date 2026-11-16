package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Profile struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Protocol       string    `json:"protocol"`
	Server         string    `json:"server"`
	Port           int       `json:"port"`
	RawLink        string    `json:"rawLink"`
	OutboundJSON   string    `json:"outboundJson"`
	Ping           int64     `json:"ping"` // -1 = untested/timeout
	SubscriptionID string    `json:"subscriptionId,omitempty"`
	CreatedAt      time.Time `json:"createdAt"`
}

type Subscription struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	URL          string    `json:"url"`
	ProfileCount int       `json:"profileCount"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type Settings struct {
	Mode              string   `json:"mode"` // "proxy", "tun", "core", "upstream"
	SocksPort         int      `json:"socksPort"`
	HttpPort          int      `json:"httpPort"`
	UpstreamHost      string   `json:"upstreamHost"` // External SOCKS5 upstream host/IP for upstream mode
	UpstreamPort      int      `json:"upstreamPort"` // External SOCKS5 upstream port for upstream mode
	SelectedProfileID string   `json:"selectedProfileId"`
	AutoConnect       bool     `json:"autoConnect"`
	AutoStart         bool     `json:"autoStart"`         // Launch on Windows Startup (default: true)
	DnsProvider       string   `json:"dnsProvider"`       // "cloudflare", "google", "quad9", "shecan", "electro", "custom"
	PrimaryDNS        string   `json:"primaryDns"`        // e.g. "1.1.1.1"
	SecondaryDNS      string   `json:"secondaryDns"`      // e.g. "1.0.0.1"
	SplitTunnelMode    string   `json:"splitTunnelMode"`   // "all", "whitelist", "blacklist"
	SplitTunnelApps    []string `json:"splitTunnelApps"`   // all configured applications for UI
	SplitDriverApps    []string `json:"splitDriverApps,omitempty"`    // active filtered rules for TUN driver
	SplitSystemGateway string   `json:"splitSystemGateway,omitempty"` // "vpn" | "direct"
	SplitAppRoutes     string   `json:"splitAppRoutes,omitempty"`     // JSON string of { [app]: "vpn" | "direct" }

	// TUN Engine & Zeltun Core Options
	TunConfigured       bool   `json:"tunConfigured"`                 // marks initialized defaults for legacy migration
	TunConfigVersion    int    `json:"tunConfigVersion"`              // tracks TUN default migrations
	TunEngine           string `json:"tunEngine"`                     // "zeltun" | "tun2socks"
	TunMTU              int    `json:"tunMtu"`                        // 576..9000
	ZeltunBlockQuic     bool   `json:"zeltunBlockQuic"`               // Force HTTP/3 QUIC UDP:443 to TCP TLS
	ZeltunMssClamp      bool   `json:"zeltunMssClamp"`                // Clamp TCP SYN MSS ceiling
	ZeltunTcpMss        int    `json:"zeltunTcpMss"`                  // MSS ceiling in bytes (default 1360)
	ZeltunSniSniff      bool   `json:"zeltunSniSniff"`                // Peek TLS ClientHello SNI
	ZeltunBypassLan     bool   `json:"zeltunBypassLan"`               // Keep LAN/private subnets direct
	ZeltunGamingQos     bool   `json:"zeltunGamingQos"`               // Large low-latency UDP buffers for Discord/gaming
	ZeltunCleanDns      bool   `json:"zeltunCleanDns"`                // Intercept UDP:53 DNS inside tunnel
	ZeltunStrictLeak    bool   `json:"zeltunStrictLeak"`              // Never fall back DNS/proxy flows to ISP direct
	ZeltunEnableNrpt    bool   `json:"zeltunEnableNrpt"`              // Enforce NRPT & DisableSmartNameResolution
	ZeltunBlockIpv6     bool   `json:"zeltunBlockIpv6"`               // Blackhole ::/1 IPv6 routes to prevent leaks
	ZeltunUdpTimeoutSec int    `json:"zeltunUdpTimeoutSec"`           // UDP NAT session idle timeout in seconds
	ZeltunRingMB        int    `json:"zeltunRingMb"`                  // Wintun ring buffer capacity in MB (2, 4, 8)
}

const currentTunConfigVersion = 2

func applyTunSettingsDefaults(st *Settings) {
	if st.TunEngine != "tun2socks" && st.TunEngine != "zeltun" {
		st.TunEngine = "zeltun"
	}
	if !st.TunConfigured {
		st.TunConfigured = true
		st.TunConfigVersion = currentTunConfigVersion
		if st.TunMTU == 0 {
			if st.TunEngine == "tun2socks" {
				st.TunMTU = 9000
			} else {
				st.TunMTU = 1500
			}
		}
		st.ZeltunBlockQuic = true
		st.ZeltunMssClamp = false
		st.ZeltunTcpMss = 1360
		st.ZeltunSniSniff = false
		st.ZeltunBypassLan = true
		st.ZeltunGamingQos = true
		st.ZeltunCleanDns = true
		st.ZeltunEnableNrpt = true
		st.ZeltunBlockIpv6 = true
		st.ZeltunStrictLeak = false
		st.ZeltunUdpTimeoutSec = 120
		st.ZeltunRingMB = 4
		return
	}
	if st.TunConfigVersion < currentTunConfigVersion {
		// v2 migration: turn off double-sniffing/local MSS clamp that caused browser/Discord stalls
		st.ZeltunSniSniff = false
		st.ZeltunMssClamp = false
		if st.ZeltunUdpTimeoutSec == 0 || st.ZeltunUdpTimeoutSec == 60 {
			st.ZeltunUdpTimeoutSec = 120
		}
		if st.TunEngine == "zeltun" && st.TunMTU == 9000 {
			st.TunMTU = 1500
		}
		st.TunConfigVersion = currentTunConfigVersion
	}
	if st.TunMTU < 576 || st.TunMTU > 9000 {
		st.TunMTU = 1500
	}
	if st.ZeltunTcpMss < 536 || st.ZeltunTcpMss > 1460 {
		st.ZeltunTcpMss = 1360
	}
	if st.ZeltunUdpTimeoutSec < 10 || st.ZeltunUdpTimeoutSec > 600 {
		st.ZeltunUdpTimeoutSec = 120
	}
	if st.ZeltunRingMB < 1 || st.ZeltunRingMB > 16 {
		st.ZeltunRingMB = 4
	}
}

type StoreData struct {
	Profiles      []Profile      `json:"profiles"`
	Subscriptions []Subscription `json:"subscriptions"`
	Settings      Settings       `json:"settings"`
}

type Store struct {
	mu        sync.RWMutex
	filePath  string
	data      StoreData
	saveMu    sync.Mutex
	saveTimer *time.Timer
	dirty     bool
}

func NewStore() (*Store, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = "."
	}
	appDir := filepath.Join(configDir, "StarClient")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		appDir = "."
	}
	filePath := filepath.Join(appDir, "config.json")

	s := &Store{
		filePath: filePath,
		data: StoreData{
			Profiles:      []Profile{},
			Subscriptions: []Subscription{},
			Settings: Settings{
				Mode:            "tun",
				SocksPort:       10808,
				HttpPort:        10809,
				UpstreamHost:    "127.0.0.1",
				UpstreamPort:    10808,
				AutoConnect:     false,
				AutoStart:       true,
				DnsProvider:     "cloudflare",
				PrimaryDNS:          "1.1.1.1",
				SecondaryDNS:        "1.0.0.1",
				SplitTunnelMode:     "all",
				SplitTunnelApps:     []string{},
				TunConfigured:       true,
				TunConfigVersion:    currentTunConfigVersion,
				TunEngine:           "zeltun",
				TunMTU:              1500,
				ZeltunBlockQuic:     true,
				ZeltunMssClamp:      false,
				ZeltunTcpMss:        1360,
				ZeltunSniSniff:      false,
				ZeltunBypassLan:     true,
				ZeltunGamingQos:     true,
				ZeltunCleanDns:      true,
				ZeltunEnableNrpt:    true,
				ZeltunBlockIpv6:     true,
				ZeltunUdpTimeoutSec: 120,
				ZeltunRingMB:        4,
			},
		},
	}

	if err := s.load(); err != nil {
		// Save initial default store
		_ = s.save()
	}

	return s, nil
}

func (s *Store) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	bytes, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}

	var data StoreData
	if err := json.Unmarshal(bytes, &data); err != nil {
		return err
	}

	if data.Settings.SocksPort == 0 {
		data.Settings.SocksPort = 10808
	}
	if data.Settings.HttpPort == 0 {
		data.Settings.HttpPort = 10809
	}
	if data.Settings.UpstreamHost == "" {
		data.Settings.UpstreamHost = "127.0.0.1"
	}
	if data.Settings.UpstreamPort <= 0 || data.Settings.UpstreamPort > 65535 {
		data.Settings.UpstreamPort = 10808
	}
	if data.Settings.Mode == "" {
		data.Settings.Mode = "proxy"
	}
	if data.Settings.DnsProvider == "" {
		data.Settings.DnsProvider = "cloudflare"
	}
	if data.Settings.PrimaryDNS == "" {
		data.Settings.PrimaryDNS = "1.1.1.1"
	}
	if data.Settings.SecondaryDNS == "" {
		data.Settings.SecondaryDNS = "1.0.0.1"
	}
	if data.Settings.SplitTunnelMode == "" {
		data.Settings.SplitTunnelMode = "all"
	}
	if data.Settings.SplitTunnelApps == nil {
		data.Settings.SplitTunnelApps = []string{}
	}
	applyTunSettingsDefaults(&data.Settings)
	if data.Profiles == nil {
		data.Profiles = []Profile{}
	}
	if data.Subscriptions == nil {
		data.Subscriptions = []Subscription{}
	}

	s.data = data
	return nil
}

func (s *Store) save() error {
	bytes, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(s.filePath, bytes, 0644); err != nil {
		return err
	}
	s.saveMu.Lock()
	if s.saveTimer != nil {
		s.saveTimer.Stop()
		s.saveTimer = nil
	}
	s.dirty = false
	s.saveMu.Unlock()
	return nil
}

// scheduleSaveLocked marks the store dirty and coalesces rapid successive mutations
// into a single deferred disk write (250ms debounce) while keeping in-memory reads fresh.
func (s *Store) scheduleSaveLocked() {
	s.saveMu.Lock()
	s.dirty = true
	if s.saveTimer != nil {
		s.saveTimer.Stop()
	}
	s.saveTimer = time.AfterFunc(250*time.Millisecond, func() {
		_ = s.Flush()
	})
	s.saveMu.Unlock()
}

// Flush immediately persists any pending coalesced store writes to disk.
func (s *Store) Flush() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.saveMu.Lock()
	dirty := s.dirty
	if s.saveTimer != nil {
		s.saveTimer.Stop()
		s.saveTimer = nil
	}
	s.saveMu.Unlock()

	if !dirty {
		return nil
	}
	return s.save()
}

func (s *Store) GetProfiles() []Profile {
	s.mu.RLock()
	defer s.mu.RUnlock()
	res := make([]Profile, len(s.data.Profiles))
	copy(res, s.data.Profiles)
	return res
}

func (s *Store) GetProfile(id string) *Profile {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, p := range s.data.Profiles {
		if p.ID == id {
			clone := p
			return &clone
		}
	}
	return nil
}

func (s *Store) AddProfiles(profiles []Profile) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var toPrepend []Profile
	for _, p := range profiles {
		found := false
		for i, existing := range s.data.Profiles {
			if existing.RawLink != "" && existing.RawLink == p.RawLink {
				s.data.Profiles[i].Name = p.Name
				s.data.Profiles[i].OutboundJSON = p.OutboundJSON
				s.data.Profiles[i].Server = p.Server
				s.data.Profiles[i].Port = p.Port
				found = true
				break
			}
		}
		if !found {
			toPrepend = append(toPrepend, p)
		}
	}
	if len(toPrepend) > 0 {
		// Prepend new profiles so recently added configurations always appear first
		s.data.Profiles = append(toPrepend, s.data.Profiles...)
	}
	return s.save()
}

func (s *Store) UpdateProfilePing(id string, ping int64, persist bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.data.Profiles {
		if s.data.Profiles[i].ID == id {
			s.data.Profiles[i].Ping = ping
			break
		}
	}
	if persist {
		s.scheduleSaveLocked()
	}
	return nil
}

func (s *Store) SaveProfile(profile Profile) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	found := false
	for i, existing := range s.data.Profiles {
		if existing.ID == profile.ID {
			s.data.Profiles[i] = profile
			found = true
			break
		}
	}
	if !found {
		// Prepend new profile so it appears at the top
		s.data.Profiles = append([]Profile{profile}, s.data.Profiles...)
	}
	return s.save()
}

func (s *Store) UpdateProfile(profile Profile) error {
	return s.SaveProfile(profile)
}

func (s *Store) Save() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.save()
}

func (s *Store) DeleteProfile(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	newProfiles := make([]Profile, 0, len(s.data.Profiles))
	for _, p := range s.data.Profiles {
		if p.ID != id {
			newProfiles = append(newProfiles, p)
		}
	}
	s.data.Profiles = newProfiles
	if s.data.Settings.SelectedProfileID == id {
		s.data.Settings.SelectedProfileID = ""
	}
	return s.save()
}

func (s *Store) DeleteProfilesBySubscription(subID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	newProfiles := make([]Profile, 0, len(s.data.Profiles))
	for _, p := range s.data.Profiles {
		if p.SubscriptionID != subID {
			newProfiles = append(newProfiles, p)
		}
	}
	s.data.Profiles = newProfiles
	return s.save()
}

func (s *Store) GetSubscriptions() []Subscription {
	s.mu.RLock()
	defer s.mu.RUnlock()
	res := make([]Subscription, len(s.data.Subscriptions))
	copy(res, s.data.Subscriptions)
	return res
}

func (s *Store) SaveSubscription(sub Subscription) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	found := false
	for i, existing := range s.data.Subscriptions {
		if existing.ID == sub.ID {
			s.data.Subscriptions[i] = sub
			found = true
			break
		}
	}
	if !found {
		s.data.Subscriptions = append(s.data.Subscriptions, sub)
	}
	return s.save()
}

func (s *Store) DeleteSubscription(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	newSubs := make([]Subscription, 0, len(s.data.Subscriptions))
	for _, sub := range s.data.Subscriptions {
		if sub.ID != id {
			newSubs = append(newSubs, sub)
		}
	}
	s.data.Subscriptions = newSubs
	return s.save()
}

func (s *Store) GetSettings() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.data.Settings
}

func (s *Store) UpdateSettings(st Settings) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Settings = st
	s.scheduleSaveLocked()
	return nil
}
