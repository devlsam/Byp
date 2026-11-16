package main

import (
	"context"
	"testing"
)

func TestSyncPeriodicUpdateCheckerLifecycle(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	svc := &AppService{ctx: ctx}

	// Enabling with 0 clamps to default 4h and starts background ticker goroutine.
	svc.syncPeriodicUpdateChecker(true, 0)
	svc.updaterMu.Lock()
	firstCancel := svc.updaterCancel
	firstHours := svc.updaterHours
	svc.updaterMu.Unlock()
	if firstCancel == nil || firstHours != 4 {
		t.Fatalf("expected updaterCancel non-nil and 4h default, got cancel=%v hours=%d", firstCancel != nil, firstHours)
	}

	// Idempotent call with identical hours leaves loop untouched.
	svc.syncPeriodicUpdateChecker(true, 4)
	svc.updaterMu.Lock()
	if svc.updaterCancel == nil || svc.updaterHours != 4 {
		svc.updaterMu.Unlock()
		t.Fatalf("expected ticker preserved at 4h, got cancel=%v hours=%d", svc.updaterCancel != nil, svc.updaterHours)
	}
	svc.updaterMu.Unlock()

	// Updating interval from 4h to 12h swaps to the new interval cleanly.
	svc.syncPeriodicUpdateChecker(true, 12)
	svc.updaterMu.Lock()
	if svc.updaterCancel == nil || svc.updaterHours != 12 {
		svc.updaterMu.Unlock()
		t.Fatalf("expected ticker interval updated to 12h, got cancel=%v hours=%d", svc.updaterCancel != nil, svc.updaterHours)
	}
	svc.updaterMu.Unlock()

	// Disabling cancels and clears ticker loop cleanly.
	svc.syncPeriodicUpdateChecker(false, 12)
	svc.updaterMu.Lock()
	if svc.updaterCancel != nil || svc.updaterHours != 0 {
		svc.updaterMu.Unlock()
		t.Fatalf("expected updaterCancel cleared when disabled, got cancel=%v hours=%d", svc.updaterCancel != nil, svc.updaterHours)
	}
	svc.updaterMu.Unlock()

	// Re-enabling starts fresh loop at chosen hours without restarting app.
	svc.syncPeriodicUpdateChecker(true, 1)
	svc.updaterMu.Lock()
	if svc.updaterCancel == nil || svc.updaterHours != 1 {
		svc.updaterMu.Unlock()
		t.Fatalf("expected ticker restarted at 1h, got cancel=%v hours=%d", svc.updaterCancel != nil, svc.updaterHours)
	}
	svc.updaterMu.Unlock()

	svc.syncPeriodicUpdateChecker(false, 0)
}
