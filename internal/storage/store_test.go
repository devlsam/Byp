package storage

import "testing"

func TestApplyTunSettingsDefaultsMigrationAndPreservation(t *testing.T) {
	// 1. Existing v1 TUN user config migrates to v2 balanced defaults without losing user preferences.
	v1 := Settings{
		PrimaryDNS:          "8.8.8.8",
		SplitTunnelMode:     "whitelist",
		TunConfigured:       true,
		TunConfigVersion:    0,
		TunEngine:           "zeltun",
		TunMTU:              9000,
		ZeltunBlockQuic:     true,
		ZeltunMssClamp:      true,
		ZeltunTcpMss:        1360,
		ZeltunSniSniff:      true,
		ZeltunBypassLan:     true,
		ZeltunGamingQos:     true,
		ZeltunCleanDns:      true,
		ZeltunEnableNrpt:    true,
		ZeltunBlockIpv6:     true,
		ZeltunUdpTimeoutSec: 60,
		ZeltunRingMB:        8,
	}
	applyTunSettingsDefaults(&v1)
	if v1.TunConfigVersion != currentTunConfigVersion {
		t.Fatalf("expected version %d, got %d", currentTunConfigVersion, v1.TunConfigVersion)
	}
	if v1.ZeltunSniSniff || v1.ZeltunMssClamp {
		t.Fatalf("expected v2 migration to disable sni/mss by default, got sni=%v mss=%v", v1.ZeltunSniSniff, v1.ZeltunMssClamp)
	}
	if v1.TunMTU != 1500 || v1.ZeltunUdpTimeoutSec != 120 {
		t.Fatalf("expected MTU=1500 UdpTimeout=120, got MTU=%d UdpTimeout=%d", v1.TunMTU, v1.ZeltunUdpTimeoutSec)
	}
	if v1.PrimaryDNS != "8.8.8.8" || v1.SplitTunnelMode != "whitelist" || v1.ZeltunRingMB != 8 {
		t.Fatalf("user preferences were not preserved: %+v", v1)
	}

	// 2. User already on v2 who explicitly re-enabled SniSniff/MssClamp retains their choice.
	v2Custom := Settings{
		TunConfigured:       true,
		TunConfigVersion:    currentTunConfigVersion,
		TunEngine:           "tun2socks",
		TunMTU:              9000,
		ZeltunMssClamp:      true,
		ZeltunSniSniff:      true,
		ZeltunUdpTimeoutSec: 300,
		ZeltunRingMB:        4,
		ZeltunTcpMss:        1360,
	}
	applyTunSettingsDefaults(&v2Custom)
	if !v2Custom.ZeltunSniSniff || !v2Custom.ZeltunMssClamp || v2Custom.TunMTU != 9000 || v2Custom.ZeltunUdpTimeoutSec != 300 {
		t.Fatalf("explicit v2 settings should be preserved, got %+v", v2Custom)
	}

	// 3. Unconfigured legacy store initializes v2 defaults cleanly.
	fresh := Settings{PrimaryDNS: "9.9.9.9"}
	applyTunSettingsDefaults(&fresh)
	if !fresh.TunConfigured || fresh.TunConfigVersion != currentTunConfigVersion || fresh.TunEngine != "zeltun" || fresh.TunMTU != 1500 {
		t.Fatalf("unexpected fresh defaults: %+v", fresh)
	}
	if fresh.ZeltunSniSniff || fresh.ZeltunMssClamp || fresh.PrimaryDNS != "9.9.9.9" {
		t.Fatalf("unexpected fresh flags or DNS overwrite: %+v", fresh)
	}
}

func TestApplyUpdateSettingsDefaultsMigrationAndPreservation(t *testing.T) {
	// 1. Legacy config missing autoCheckUpdatesConfigured migrates once to default ON (true) and 4h.
	legacy := Settings{}
	applyUpdateSettingsDefaults(&legacy)
	if !legacy.AutoCheckUpdatesConfigured || !legacy.AutoCheckUpdates || legacy.AutoCheckUpdateHours != 4 {
		t.Fatalf("expected legacy config to default AutoCheckUpdates=true and 4h, got %+v", legacy)
	}

	// 2. User who explicitly disabled periodic auto-check retains false and custom 1..24h interval.
	disabled := Settings{
		AutoCheckUpdatesConfigured: true,
		AutoCheckUpdates:           false,
		AutoCheckUpdateHours:       12,
	}
	applyUpdateSettingsDefaults(&disabled)
	if disabled.AutoCheckUpdates || !disabled.AutoCheckUpdatesConfigured || disabled.AutoCheckUpdateHours != 12 {
		t.Fatalf("expected explicit AutoCheckUpdates=false and 12h to be preserved, got %+v", disabled)
	}

	// 3. Out-of-range hour values clamp cleanly to 1..24 (0 -> 4, >24 -> 24).
	if got := NormalizeUpdateCheckHours(0); got != 4 {
		t.Fatalf("expected 0h -> 4h default, got %d", got)
	}
	if got := NormalizeUpdateCheckHours(48); got != 24 {
		t.Fatalf("expected 48h -> 24h clamp, got %d", got)
	}
	if got := NormalizeUpdateCheckHours(1); got != 1 {
		t.Fatalf("expected 1h preserved, got %d", got)
	}
}

func TestEnsureUniqueProfileIDs(t *testing.T) {
	profiles := []Profile{
		{ID: "prof-1", Name: "First"},
		{ID: "prof-1", Name: "Duplicate"},
		{ID: "", Name: "Empty"},
		{ID: "prof-2", Name: "Unique"},
	}
	if !ensureUniqueProfileIDs(profiles) {
		t.Fatalf("expected ensureUniqueProfileIDs to report changes")
	}
	if profiles[0].ID != "prof-1" || profiles[3].ID != "prof-2" {
		t.Fatalf("existing unique IDs should be preserved, got %+v", profiles)
	}
	seen := make(map[string]struct{}, len(profiles))
	for _, p := range profiles {
		if p.ID == "" {
			t.Fatalf("expected non-empty profile ID, got %+v", p)
		}
		if _, exists := seen[p.ID]; exists {
			t.Fatalf("expected unique IDs after repair, duplicate %q in %+v", p.ID, profiles)
		}
		seen[p.ID] = struct{}{}
	}
	if ensureUniqueProfileIDs(profiles) {
		t.Fatalf("expected second pass to report no changes")
	}
}

