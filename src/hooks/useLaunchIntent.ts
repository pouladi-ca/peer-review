import { useEffect } from 'react';
import { useStore } from '../lib/store';

/**
 * Act on how the app was opened: a PDF shared to the installed app (the service worker
 * parks it in a cache and opens `/?shared=…`), or a review created from a phone's share
 * sheet through the inbox (`/?open=<id>`). Runs once the account is loaded.
 */
export function useLaunchIntent(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    const shared = params.get('shared');
    const open = params.get('open');
    if (!shared && !open) return;
    window.history.replaceState(null, '', window.location.pathname);
    void (async () => {
      const s = useStore.getState();
      if (shared && 'caches' in window) {
        const cache = await caches.open('panelist-shared');
        const files: File[] = [];
        for (const key of shared.split(',')) {
          const hit = await cache.match(key);
          if (!hit) continue;
          const name = decodeURIComponent(hit.headers.get('X-File-Name') ?? 'application.pdf');
          files.push(new File([await hit.blob()], name, { type: 'application/pdf' }));
          await cache.delete(key);
        }
        if (files.length) await s.createReview(files, {});
        else s.notify('The shared file could not be found. Try sharing it again.', 'error');
      }
      if (open) await s.openWhenSynced(open);
    })();
  }, [ready]);
}
