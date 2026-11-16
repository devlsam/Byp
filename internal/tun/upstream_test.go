package tun

import (
	"net"
	"testing"
)

func TestResolveUpstreamTarget(t *testing.T) {
	ip, target, isPublic, err := ResolveUpstreamTarget("", 2080)
	if err != nil || ip != "127.0.0.1" || target != "127.0.0.1:2080" || isPublic {
		t.Fatalf("unexpected default resolve: ip=%q target=%q public=%v err=%v", ip, target, isPublic, err)
	}

	ip, target, isPublic, err = ResolveUpstreamTarget("localhost", 10808)
	if err != nil || ip != "127.0.0.1" || target != "127.0.0.1:10808" || isPublic {
		t.Fatalf("unexpected localhost resolve: ip=%q target=%q public=%v err=%v", ip, target, isPublic, err)
	}

	_, _, isPublic, err = ResolveUpstreamTarget("192.168.1.50", 10808)
	if err != nil || isPublic {
		t.Fatalf("expected private LAN IP to have isPublic=false, err=%v", err)
	}

	_, _, isPublic, err = ResolveUpstreamTarget("8.8.8.8", 1080)
	if err != nil || !isPublic {
		t.Fatalf("expected public IP to have isPublic=true, err=%v", err)
	}

	if _, _, _, err := ResolveUpstreamTarget("0.0.0.0", 10808); err == nil {
		t.Fatal("expected 0.0.0.0 target to return error")
	}
	if _, _, _, err := ResolveUpstreamTarget("127.0.0.1", 0); err == nil {
		t.Fatal("expected port 0 to return error")
	}
}

func TestTestUpstreamProxyHandshake(t *testing.T) {
	// 1. Valid SOCKS5 no-auth listener
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen error: %v", err)
	}
	defer ln.Close()
	port := ln.Addr().(*net.TCPAddr).Port

	done := make(chan struct{})
	go func() {
		defer close(done)
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		var buf [3]byte
		_, _ = conn.Read(buf[:])
		if buf[0] == 0x05 {
			_, _ = conn.Write([]byte{0x05, 0x00})
		}
	}()

	res := TestUpstreamProxy("127.0.0.1", port)
	<-done
	if !res.Reachable || !res.SocksReady || res.LatencyMs < 1 {
		t.Fatalf("expected valid SOCKS5 probe, got %+v", res)
	}

	// 2. Non-SOCKS5 listener (e.g. HTTP server)
	httpLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen error: %v", err)
	}
	defer httpLn.Close()
	httpPort := httpLn.Addr().(*net.TCPAddr).Port
	go func() {
		conn, err := httpLn.Accept()
		if err == nil {
			_, _ = conn.Write([]byte("HTTP/1.1 400 Bad Request\r\n\r\n"))
			_ = conn.Close()
		}
	}()

	httpRes := TestUpstreamProxy("127.0.0.1", httpPort)
	if !httpRes.Reachable || httpRes.SocksReady {
		t.Fatalf("expected Reachable=true, SocksReady=false for non-SOCKS5 port, got %+v", httpRes)
	}

	// 3. Closed port
	_ = ln.Close()
	closedRes := TestUpstreamProxy("127.0.0.1", port)
	if closedRes.Reachable || closedRes.SocksReady {
		t.Fatalf("expected closed port to fail probe, got %+v", closedRes)
	}
}
