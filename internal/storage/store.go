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
	Mode              string   `json:"mode"` // "proxy", "tun", "core"
	SocksPort         int      `json:"socksPort"`
	HttpPort          int      `json:"httpPort"`
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
}

type StoreData struct {
	Profiles      []Profile      `json:"profiles"`
	Subscriptions []Subscription `json:"subscriptions"`
	Settings      Settings       `json:"settings"`
}

type Store struct {
	mu       sync.RWMutex
	filePath string
	data     StoreData
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
				AutoConnect:     false,
				AutoStart:       true,
				DnsProvider:     "cloudflare",
				PrimaryDNS:      "1.1.1.1",
				SecondaryDNS:    "1.0.0.1",
				SplitTunnelMode: "all",
				SplitTunnelApps: []string{},
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
	return os.WriteFile(s.filePath, bytes, 0644)
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
		return s.save()
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
	return s.save()
}
