package tun

import (
	"testing"
	"unsafe"
)

func TestZeltunStatsStructLayoutAndDefaults(t *testing.T) {
	if got := unsafe.Sizeof(ZeltunStats{}); got != 56 {
		t.Fatalf("ZeltunStats ABI size mismatch: got %d bytes, want 56", got)
	}

	def := DefaultZeltunOptions()
	if def.Bitmask() != 57 {
		t.Fatalf("DefaultZeltunOptions bitmask mismatch: got %d, want 57", def.Bitmask())
	}

	strict := def
	strict.StrictAntiLeak = true
	if strict.Bitmask() != 121 {
		t.Fatalf("StrictAntiLeak bitmask mismatch: got %d, want 121", strict.Bitmask())
	}
}

func TestZeltunSplitModeMappingAndNormalize(t *testing.T) {
	cases := map[string]uint8{
		"all":       0,
		"global":    0,
		"whitelist": 1,
		"include":   1,
		"blacklist": 2,
		"exclude":   2,
		"":          0,
	}
	for in, want := range cases {
		if got := zeltunSplitModeByte(in); got != want {
			t.Errorf("zeltunSplitModeByte(%q) = %d, want %d", in, got, want)
		}
	}

	bad := ZeltunOptions{Engine: "invalid", MTU: 100, TcpMss: 9000, UdpTimeoutSec: 1, RingMB: 99}
	norm := bad.Normalize()
	if norm.Engine != EngineZeltun || norm.MTU != 1500 || norm.TcpMss != 1360 || norm.UdpTimeoutSec != 120 || norm.RingMB != 4 {
		t.Fatalf("unexpected Normalize output: %+v", norm)
	}
}

