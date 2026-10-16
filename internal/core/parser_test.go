package core

import (
	"strings"
	"testing"

	"github.com/xtls/libxray/xray"
	xcore "github.com/xtls/xray-core/core"
	_ "github.com/xtls/xray-core/main/distro/all"
)

func TestParseShareLinksAndMerge(t *testing.T) {
	mgr := NewXrayManager()
	link := "vless://cd7eae9d-c486-4df5-b0f6-6b375faf4361@63.177.179.170:8888?encryption=none&security=none&type=tcp#-parsa"

	profiles, err := mgr.ParseShareLinks(link)
	if err != nil {
		t.Fatalf("ParseShareLinks failed: %v", err)
	}

	if len(profiles) != 1 {
		t.Fatalf("Expected 1 profile, got %d", len(profiles))
	}

	p := profiles[0]
	if p.Name != "parsa" {
		t.Errorf("Expected profile name 'parsa', got '%s'", p.Name)
	}
	if p.Protocol != "vless" {
		t.Errorf("Expected protocol 'vless', got '%s'", p.Protocol)
	}
	if p.Server != "63.177.179.170" {
		t.Errorf("Expected server '63.177.179.170', got '%s'", p.Server)
	}
	if p.Port != 8888 {
		t.Errorf("Expected port 8888, got %d", p.Port)
	}

	// Test MergeCompleteConfig with dedicated test ports to avoid collisions
	merged, err := MergeCompleteConfig(p.OutboundJSON, ConfigMergerOptions{
		SocksPort: 39808,
		HttpPort:  39809,
		ApiPort:   39807,
	})
	if err != nil {
		t.Fatalf("MergeCompleteConfig failed: %v", err)
	}

	// Verify Xray core loads config without error
	cfg, err := xcore.LoadConfig("json", strings.NewReader(merged))
	if err != nil {
		t.Fatalf("xray-core LoadConfig failed on merged config: %v", err)
	}

	inst, err := xcore.New(cfg)
	if err != nil {
		t.Fatalf("xray-core New failed: %v", err)
	}
	_ = inst.Close()

	// Verify libxray RunXray and StopXray
	if err := xray.RunXray(merged); err != nil {
		t.Fatalf("xray.RunXray failed: %v", err)
	}
	if !xray.GetXrayState() {
		t.Fatalf("Expected Xray state to be true after RunXray")
	}
	if err := xray.StopXray(); err != nil {
		t.Fatalf("xray.StopXray failed: %v", err)
	}
}

func TestParseMultipleProtocols(t *testing.T) {
	mgr := NewXrayManager()
	links := `vless://cd7eae9d-c486-4df5-b0f6-6b375faf4361@63.177.179.170:8888?encryption=none&security=none&type=tcp#-parsa
trojan://secretpass@1.2.3.4:443?security=tls&type=tcp#Fast-Trojan`

	profiles, err := mgr.ParseShareLinks(links)
	if err != nil {
		t.Fatalf("ParseShareLinks multi failed: %v", err)
	}

	if len(profiles) != 2 {
		t.Fatalf("Expected 2 profiles, got %d", len(profiles))
	}

	if profiles[0].Name != "parsa" || profiles[0].Protocol != "vless" {
		t.Errorf("Unexpected profile 0: %+v", profiles[0])
	}
	if profiles[1].Name != "Fast-Trojan" || profiles[1].Protocol != "trojan" {
		t.Errorf("Unexpected profile 1: %+v", profiles[1])
	}
}
