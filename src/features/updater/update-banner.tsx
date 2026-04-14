import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Loader2 } from 'lucide-react';
import type { Update } from '@tauri-apps/plugin-updater';
import { cn } from '@/lib/utils';

const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type UpdateInfo = {
  version: string;
  notes?: string;
};

type Status = 'idle' | 'downloading' | 'installing' | 'error';

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const updaterRef = useRef<Update | null>(null);

  useEffect(() => {
    if (!isTauri) return;

    let cancelled = false;
    void (async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const result = await check();
        if (cancelled || !result) return;
        updaterRef.current = result;
        setUpdate({ version: result.version, notes: result.body });
      } catch (err) {
        console.warn('Update check failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleInstall() {
    if (!updaterRef.current || !isTauri) return;
    setStatus('downloading');
    setProgress(0);
    setError(null);

    let total = 0;
    let downloaded = 0;

    try {
      await updaterRef.current.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (total > 0) setProgress(Math.min(100, (downloaded / total) * 100));
        } else if (event.event === 'Finished') {
          setStatus('installing');
        }
      });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const visible = update !== null && !dismissed;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="glass-elevated pointer-events-auto fixed right-4 bottom-4 z-[60] flex max-w-[360px] min-w-[280px] items-center gap-3 rounded-lg px-3.5 py-2.5 shadow-xl"
        >
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            style={{ background: 'var(--accent-gradient)' }}
          >
            {status === 'downloading' || status === 'installing' ? (
              <Loader2
                size={14}
                strokeWidth={2}
                className="animate-spin text-white"
              />
            ) : (
              <Download size={14} strokeWidth={2} className="text-white" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-zinc-200">
              {status === 'idle' && `Update available — v${update?.version}`}
              {status === 'downloading' &&
                `Downloading v${update?.version}… ${Math.round(progress)}%`}
              {status === 'installing' && 'Installing — app will restart'}
              {status === 'error' && 'Update failed'}
            </div>
            {status === 'idle' && (
              <div className="truncate text-[10px] text-zinc-500">
                Click install to download and restart
              </div>
            )}
            {status === 'error' && error && (
              <div className="truncate text-[10px] text-red-400" title={error}>
                {error}
              </div>
            )}
            {status === 'downloading' && (
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full transition-[width] duration-150"
                  style={{
                    width: `${progress}%`,
                    background: 'var(--accent-gradient)',
                  }}
                />
              </div>
            )}
          </div>

          {status === 'idle' && (
            <>
              <button
                onClick={() => void handleInstall()}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[10px] font-semibold text-white',
                  'transition-opacity duration-100 hover:opacity-90',
                )}
                style={{ background: 'var(--accent-gradient)' }}
              >
                Install
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors duration-100 hover:bg-white/[0.04] hover:text-zinc-300"
                title="Dismiss"
                aria-label="Dismiss update notification"
              >
                <X size={12} strokeWidth={1.75} />
              </button>
            </>
          )}
          {status === 'error' && (
            <button
              onClick={() => setDismissed(true)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors duration-100 hover:bg-white/[0.04] hover:text-zinc-300"
              title="Dismiss"
              aria-label="Dismiss update notification"
            >
              <X size={12} strokeWidth={1.75} />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
