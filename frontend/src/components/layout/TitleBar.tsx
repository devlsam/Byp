import React from 'react';
import { Window } from '@wailsio/runtime';
import { Minus, X } from '../../icons';

/**
 * Top draggable window header with custom window minimize and close-to-tray controls.
 */
export const TitleBar: React.FC = () => {
  return (
    <header
      onMouseDown={(e) => {
        if (e.button === 0 && !(e.target as HTMLElement).closest('button, .wails-no-drag')) {
          try {
            if ((window as any).chrome?.webview?.postMessage) {
              (window as any).chrome.webview.postMessage('wails:drag');
            }
          } catch (_) {}
        }
      }}
      style={{
        ['--wails-draggable' as any]: 'drag',
        ['--wails-non-client-region' as any]: 'caption',
        ['-webkit-app-region' as any]: 'drag',
      } as React.CSSProperties}
      className="h-10 shrink-0 bg-[#111216] flex items-center justify-end px-3 z-50 select-none wails-drag cursor-default"
    >
      {/* Window controls (Minimise & Close) */}
      <div className="flex items-center space-x-1.5 wails-no-drag pointer-events-auto">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            Window.Minimise();
          }}
          title="Minimize"
          className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            Window.Hide();
          }}
          title="Close to Tray"
          className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-rose-500/20 hover:border hover:border-rose-500/30 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
