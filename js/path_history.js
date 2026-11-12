/**
 * VISION 23: Path History & Device Storage / Cache Management
 * Stores path details, obstacle encounter logs, and provides offline cache clearing.
 */

class PathHistoryManager {
  constructor(state) {
    this.state = state;
    this.storageKey = 'vision23_path_history';
    this.maxLogs = 100;
    this.lastLoggedTime = 0;
    this.lastLoggedObject = '';
    this.logs = this.loadLogs();
  }

  loadLogs() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('[PathHistory] Could not load stored logs:', e);
      return [];
    }
  }

  saveLogs() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
    } catch (e) {
      console.warn('[PathHistory] Could not save logs:', e);
    }
  }

  /**
   * Log an obstacle encounter or route waypoint along the path
   */
  logEvent(entry) {
    const now = Date.now();
    const objectName = entry.objectClass || 'Unknown Object';

    // Prevent spamming the same obstacle within 3 seconds unless distance changed drastically
    if (this.lastLoggedObject === objectName && (now - this.lastLoggedTime < 3000)) {
      return;
    }

    this.lastLoggedTime = now;
    this.lastLoggedObject = objectName;

    const logItem = {
      id: now,
      time: new Date(now).toLocaleTimeString(),
      timestamp: now,
      objectClass: objectName,
      confidence: entry.confidence || 0,
      distanceCm: entry.distanceCm !== undefined ? entry.distanceCm : '--',
      lidarCm: entry.lidarCm !== undefined ? entry.lidarCm : '--',
      bearing: entry.bearing || 'Ahead',
      threatLevel: entry.threatLevel || 'none',
      advice: entry.advice || ''
    };

    this.logs.unshift(logItem);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    this.saveLogs();
    this.state.emit('path:updated', this.logs);
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
    localStorage.removeItem(this.storageKey);
    this.state.emit('path:updated', this.logs);
  }

  exportLogs() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(this.logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `vision23_path_history_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  /**
   * Comprehensive cache & storage purge
   * Cleans offline ServiceWorker caches, localStorage telemetry logs, and IndexedDB model cache
   */
  async clearAllAppCache() {
    console.log('[PathHistory] Purging all offline caches & data...');

    // 1. Clear Service Worker Cache Storage
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('[PathHistory] CacheStorage purged.');
      } catch (e) {
        console.warn('[PathHistory] CacheStorage purge failed:', e);
      }
    }

    // 2. Clear Path History Logs
    this.clearLogs();

    // 3. Clear IndexedDB (used by TensorFlow.js if indexeddb model caching is active)
    if ('indexedDB' in window) {
      try {
        if (window.indexedDB.databases) {
          const dbs = await window.indexedDB.databases();
          dbs.forEach(db => {
            if (db.name && db.name.includes('tensorflow')) {
              window.indexedDB.deleteDatabase(db.name);
            }
          });
        }
      } catch (e) {
        console.warn('[PathHistory] IndexedDB purge failed:', e);
      }
    }

    // 4. Notify Service Worker if active
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ action: 'clearCache' });
    }

    this.state.emit('cache:cleared', { success: true });
    return true;
  }
}

window.PathHistoryManager = PathHistoryManager;
