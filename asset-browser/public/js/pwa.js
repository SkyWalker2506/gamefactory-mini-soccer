// PWA module: Service Worker registration, online/offline detection, and update toast.
import { t } from './i18n.js';
import { toast } from './util.js';

export function registerSW() {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const isSecure = location.protocol === 'https:';
  
  if ('serviceWorker' in navigator && (isLocal || isSecure)) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Soft toast for new version
              const msg = t('status.online') === 'Çevrimiçi' ? 'Yeni sürüm hazır — yenile' : 'New version ready — refresh';
              toast(msg);
            }
          });
        });
      })
      .catch(err => console.error('[PWA] SW registration failed:', err));

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Optional: window.location.reload();
    });
  }
}

export function initOnlineStatus() {
  const banner = document.getElementById('offline-banner');
  const updateStatus = () => {
    const isOffline = !navigator.onLine;
    banner.hidden = !isOffline;
    banner.textContent = isOffline ? t('status.offline') : t('status.online');
    if (isOffline) {
      banner.style.background = '#7a6a1f';
      banner.style.color = '#fff';
      banner.style.padding = '4px 24px';
      banner.style.fontSize = '12px';
      banner.style.textAlign = 'center';
    }
  };

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}
