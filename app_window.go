package main

// GetState returns the current application state.
func (a *AppService) GetState() AppState {
	a.mu.RLock()
	defer a.mu.RUnlock()

	return AppState{
		Connected:       a.connected,
		ActiveProfileID: a.activeProfileID,
		ActiveMode:      a.activeMode,
		CoreVersion:     a.xrayMgr.Version(),
		Settings:        a.store.GetSettings(),
	}
}

// Quit terminates the desktop application cleanly.
func (a *AppService) Quit() {
	if a.store != nil {
		_ = a.store.Flush()
	}
	if a.app != nil {
		a.app.Quit()
	}
}

// HideWindow hides the main window to the system tray (WindowHide triggers async memory trim).
func (a *AppService) HideWindow() {
	if a.app != nil {
		if w, ok := a.app.Window.GetByName("main"); ok {
			w.Hide()
		}
	}
}

// ShowWindow restores and focuses the main window.
func (a *AppService) ShowWindow() {
	if a.app != nil {
		if w, ok := a.app.Window.GetByName("main"); ok {
			w.Show()
			w.Focus()
		}
	}
}
