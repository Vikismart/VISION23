/**
 * VISION 23: Robotics Navigation & Perception State Store
 * Manages global reactive state across Telemetry, Vision, and Voice subsystems.
 */

const NavState = {
  appName: 'Vision 23',

  // Configuration - Simulation is OFF by default
  config: {
    streamMode: 'esp32', // 'esp32' | 'usb' | 'simulation'
    isSimulation: false, // Default is OFF
    esp32StreamUrl: 'http://10.112.87.152:81/stream',
    telemetryWsUrl: 'ws://10.112.87.74:81',
    selectedCameraDeviceId: '',
    sensorUpdateInterval: 400, // ms
    visionUpdateInterval: 3000, // ms
    handsFreeMode: false,
    audioRate: 1.05,
    audioPitch: 1.0,
    warningThresholdCm: 35, // Distance threshold for urgent obstacle alert
    cautionThresholdCm: 80,
  },

  // Real-time Telemetry Data (Standby until hardware connects or simulation is checked ON)
  telemetry: {
    ultrasonicCm: 0.0,
    lidarCm: 0.0,
    lidarSignalQuality: 0, // %
    timestamp: Date.now(),
    safetyState: 'safe', // 'safe' | 'caution' | 'danger'
    isOnline: false
  },

  // AI Vision Engine Data (Awaiting live detection by default)
  vision: {
    activeSource: 'esp32',
    objectClass: 'Scanning...',
    objectCategory: 'Live Camera Standby',
    icon: '👁️',
    confidence: 0,
    bearing: 'Front Center',
    distanceEstimateM: '--',
    threatLevel: 'none',
    advice: 'Live camera feed active. Ready for detection.',
    boundingBox: null,
    modelName: 'Vision 23 AI Engine',
    inferenceTimeMs: 0,
  },

  // Voice & Audio System Data
  voice: {
    isListening: false,
    isSpeaking: false,
    handsFreeActive: false,
    lastUserQuery: '',
    lastAiReply: '',
    speechApiSupported: false,
    earbudsDetected: false
  },

  // Listeners
  _listeners: new Map(),

  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(callback);
  },

  emit(event, data) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).forEach(cb => {
        try { cb(data); } catch (e) { console.error(`[NavState] Event ${event} error:`, e); }
      });
    }
  },

  updateTelemetry(newData) {
    this.telemetry = { ...this.telemetry, ...newData, timestamp: Date.now() };

    // Determine overall safety state based on distance if values are available
    if (this.telemetry.ultrasonicCm > 0 || this.telemetry.lidarCm > 0) {
      const minDistance = Math.min(
        this.telemetry.ultrasonicCm > 0 ? this.telemetry.ultrasonicCm : 9999,
        this.telemetry.lidarCm > 0 ? this.telemetry.lidarCm : 9999
      );
      if (minDistance <= this.config.warningThresholdCm) {
        this.telemetry.safetyState = 'danger';
      } else if (minDistance <= this.config.cautionThresholdCm) {
        this.telemetry.safetyState = 'caution';
      } else {
        this.telemetry.safetyState = 'safe';
      }
    } else {
      this.telemetry.safetyState = 'safe';
    }

    this.emit('telemetry:updated', this.telemetry);
  },

  updateVision(newData) {
    this.vision = { ...this.vision, ...newData };
    this.emit('vision:updated', this.vision);
  },

  updateVoice(newData) {
    this.voice = { ...this.voice, ...newData };
    this.emit('voice:updated', this.voice);
  },

  /**
   * Automatically discovers ESP nodes via backend ARP helper (when running on local server)
   */
  async discoverEndpoints() {
    // Skip backend ARP scan if on GitHub Pages or static host without backend
    if (window.location.protocol === 'https:' && !window.location.hostname.match(/^[0-9.]+$/) && window.location.hostname !== 'localhost') {
      return null;
    }
    try {
      const res = await fetch('./api/discover.php', { signal: AbortSignal.timeout(2000), cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          let changed = false;
          if (data.camUrl && data.camUrl !== this.config.esp32StreamUrl) {
            this.config.esp32StreamUrl = data.camUrl;
            try { localStorage.setItem('vision23_stream_url', data.camUrl); } catch (e) {}
            changed = true;
          }
          if (data.telWsUrl && data.telWsUrl !== this.config.telemetryWsUrl) {
            this.config.telemetryWsUrl = data.telWsUrl;
            try { localStorage.setItem('vision23_telemetry_url', data.telWsUrl); } catch (e) {}
            changed = true;
          }
          if (changed) {
            console.log('[NavState] Auto-discovered endpoints updated:', data);
            this.emit('config:discovered', { camUrl: this.config.esp32StreamUrl, telWsUrl: this.config.telemetryWsUrl });
          }
          return data;
        }
      }
    } catch (e) {
      // Backend discovery not reachable or offline; keep fallback
    }
    return null;
  }
};

window.NavState = NavState;

// Initialize endpoints from localStorage or client subnet alignment
(() => {
  try {
    const savedStream = localStorage.getItem('vision23_stream_url');
    if (savedStream && savedStream.includes('http')) {
      NavState.config.esp32StreamUrl = savedStream;
    }
    const savedWs = localStorage.getItem('vision23_telemetry_url');
    if (savedWs && (savedWs.includes('ws://') || savedWs.includes('wss://'))) {
      NavState.config.telemetryWsUrl = savedWs;
    }

    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1' && /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const parts = host.split('.');
      const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
      if (!savedStream) NavState.config.esp32StreamUrl = `http://${subnet}.152:81/stream`;
      if (!savedWs) NavState.config.telemetryWsUrl = `ws://${subnet}.74:81`;
    }
  } catch (e) {}
})();
