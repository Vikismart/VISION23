/**
 * VISION 23: Real-Time Sensor Telemetry Subsystem
 * Connects immediately and automatically to the ESP32 Telemetry Hub via WebSocket.
 * Features aggressive auto-reconnect and watchdog for instantaneous pickup on device power-on.
 */

class TelemetryEngine {
  constructor(state) {
    this.state = state;
    this.timer = null;
    this.ws = null;
    this.reconnectTimer = null;
    this.watchdogTimer = null;
    this.lastPacketTime = 0;
    this._lastUltraTime = 0;
    this._connectingStart = null;

    // Simulation physics state
    this.simUltrasonic = 65.0;
    this.simLidar = 240.0;
    this.velocity = -1.5;

    // Web Serial Hardware state
    this.serialPort = null;
    this.serialReader = null;
    this.isSerialConnected = false;
  }

  start() {
    if (this.state.config.isSimulation) {
      this.startSimulation();
    } else {
      this.connectHardware();
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopWatchdog();
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    if (this.serialReader) {
      try { this.serialReader.cancel(); } catch (e) {}
      this.serialReader = null;
    }
    if (this.serialPort) {
      try { this.serialPort.close(); } catch (e) {}
      this.serialPort = null;
    }
    this.isSerialConnected = false;
  }

  stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * Continuous sensor simulation (ONLY runs when Simulation Mode is checked ON)
   */
  startSimulation() {
    this.stop();

    // Seed realistic initial readings immediately so the UI is active in 0 ms
    this.simUltrasonic = 65.0;
    this.simLidar = 240.0;
    this.velocity = -1.5;
    this.state.updateTelemetry({
      ultrasonicCm: this.simUltrasonic,
      lidarCm: this.simLidar,
      lidarSignalQuality: 96,
      isOnline: true
    });

    this.timer = setInterval(() => {
      // Physical obstacle approach and retreat cycle
      this.simUltrasonic += this.velocity + (Math.random() * 2 - 1);
      this.simLidar += this.velocity * 1.8 + (Math.random() * 4 - 2);

      if (this.simUltrasonic < 18.0) {
        this.simUltrasonic = 18.0;
        this.velocity = 2.2;
      } else if (this.simUltrasonic > 140.0) {
        this.velocity = -1.8;
      }

      if (this.simLidar < 35.0) {
        this.simLidar = 35.0;
      } else if (this.simLidar > 450.0) {
        this.simLidar = 450.0;
      }

      const signalQuality = Math.min(99, Math.max(75, Math.round(98 - (this.simLidar / 12))));
      const ultrasonicValue = parseFloat(this.simUltrasonic.toFixed(1));
      const lidarValue = parseFloat(this.simLidar.toFixed(1));

      this.state.updateTelemetry({
        ultrasonicCm: ultrasonicValue,
        lidarCm: lidarValue,
        lidarSignalQuality: signalQuality,
        isOnline: true
      });

      // Mobile haptic vibration if entering critical danger zone
      if (ultrasonicValue <= this.state.config.warningThresholdCm && 'vibrate' in navigator) {
        try {
          navigator.vibrate(80);
        } catch (e) {}
      }
    }, this.state.config.sensorUpdateInterval);
  }

  /**
   * Normalize WebSocket URL
   * Automatically formats bare IP or http:// to ws:// and ensures port 81 default
   */
  normalizeWsUrl(url) {
    if (!url) return this.state.config.telemetryWsUrl || 'ws://10.112.87.74:81';
    let cleaned = url.trim();
    if (cleaned.startsWith('http://')) {
      cleaned = 'ws://' + cleaned.slice(7);
    } else if (cleaned.startsWith('https://')) {
      cleaned = 'wss://' + cleaned.slice(8);
    } else if (!cleaned.startsWith('ws://') && !cleaned.startsWith('wss://')) {
      cleaned = 'ws://' + cleaned;
    }

    try {
      const urlObj = new URL(cleaned);
      if (!urlObj.port) {
        return `ws://${urlObj.hostname}:81`;
      }
      return cleaned;
    } catch (e) {
      if (!cleaned.includes(':') || cleaned.split(':').length === 2) {
        return cleaned + ':81';
      }
      return cleaned;
    }
  }

  /**
   * Universal Telemetry Payload Parser
   * Parses JSON objects, tagged payloads, and CSV telemetry from WebSocket, Web Serial, or REST.
   */
  parseIncomingTelemetry(rawInput) {
    if (!rawInput) return;
    this.lastPacketTime = Date.now();
    try {
      const raw = rawInput.trim();
      if (raw.startsWith('{')) {
        const data = JSON.parse(raw);
        const updates = { isOnline: true };

        // Format A: Direct aggregated properties {"ultrasonic": 45, "lidar": 166, ...}
        if (data.ultrasonic !== undefined) {
          updates.ultrasonicCm = parseFloat(data.ultrasonic);
          this._lastUltraTime = Date.now();
        }
        if (data.lidar !== undefined) updates.lidarCm = parseFloat(data.lidar);
        if (data.signal !== undefined) updates.lidarSignalQuality = parseInt(data.signal);

        // Format B: Tagged sensor payloads {"sensor":"LiDAR", "distance":165}
        const sensorType = (data.sensor || data.type || data.name || '').toLowerCase();
        const dist = data.distance !== undefined ? parseFloat(data.distance) : 
                     (data.dist !== undefined ? parseFloat(data.dist) : 
                     (data.val !== undefined ? parseFloat(data.val) : 
                     (data.value !== undefined ? parseFloat(data.value) : null)));

        if (dist !== null && !isNaN(dist)) {
          if (sensorType.includes('lidar') || sensorType.includes('laser') || sensorType.includes('tfluna') || sensorType.includes('vl53')) {
            updates.lidarCm = dist;
            if (data.signal !== undefined || data.quality !== undefined) {
              updates.lidarSignalQuality = parseInt(data.signal || data.quality);
            } else if (!this.state.telemetry.lidarSignalQuality) {
              updates.lidarSignalQuality = 94;
            }
          } else if (sensorType.includes('ultra') || sensorType.includes('sonar') || sensorType.includes('hcsr04')) {
            updates.ultrasonicCm = dist;
            this._lastUltraTime = Date.now();
          } else if (!sensorType) {
            updates.lidarCm = dist;
          }
        }

        // If Ultrasonic hasn't reported in > 3.5s while LiDAR is actively updating,
        // range > 400cm (path clear ahead).
        if (Date.now() - this._lastUltraTime > 3500 && this.state.telemetry.ultrasonicCm > 0) {
          updates.ultrasonicCm = 999.0;
        }

        this.state.updateTelemetry(updates);
      } else if (raw.includes(',')) {
        // CSV format: "45.2,180.5" or "45.2,180.5,95"
        const parts = raw.split(',');
        this.state.updateTelemetry({
          ultrasonicCm: parseFloat(parts[0]) || this.state.telemetry.ultrasonicCm,
          lidarCm: parseFloat(parts[1]) || this.state.telemetry.lidarCm,
          lidarSignalQuality: parts[2] ? parseInt(parts[2]) : 90,
          isOnline: true
        });
        this._lastUltraTime = Date.now();
      }
    } catch (err) {
      console.warn('[Telemetry] Error parsing hardware payload:', err);
    }
  }

  /**
   * Connect to real ESP32 / Arduino hardware via WebSocket with auto-reconnect & watchdog
   */
  connectHardware() {
    if (this.state.config.isSimulation) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const wsUrl = this.normalizeWsUrl(this.state.config.telemetryWsUrl);
    this.state.config.telemetryWsUrl = wsUrl;

    // Check for HTTPS Mixed Content Blocking on GitHub Pages
    if (window.location.protocol === 'https:' && wsUrl.startsWith('ws://')) {
      console.warn('[Telemetry] Insecure WebSocket (ws://) blocked on HTTPS page (GitHub Pages).');
      this.state.emit('telemetry:status', {
        status: 'blocked-https',
        message: 'BLOCKED (HTTPS) - Use Localhost or USB Serial'
      });
      return;
    }

    // If socket is already active to this URL, don't reopen
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // Sync input box in UI
    const quickInput = document.getElementById('quickTelemetryUrl');
    if (quickInput && quickInput.value !== wsUrl) quickInput.value = wsUrl;

    console.log(`[Telemetry] Auto-connecting to hardware: ${wsUrl}`);
    this.state.emit('telemetry:status', { status: 'connecting', message: 'AUTO-CONNECTING...' });

    try {
      this._connectingStart = Date.now();
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[Telemetry] Connected to physical sensor hardware at', wsUrl);
        this._connectingStart = null;
        this.lastPacketTime = Date.now();
        this._lastUltraTime = Date.now();
        this.state.updateTelemetry({ isOnline: true });
        this.state.emit('telemetry:status', { status: 'connected', message: 'WS CONNECTED' });

        try { localStorage.setItem('vision23_telemetry_url', wsUrl); } catch (e) {}

        try {
          this.ws.send('get');
        } catch (e) {}
      };

      this.ws.onmessage = (event) => {
        this.parseIncomingTelemetry(event.data);
      };

      this.ws.onerror = () => {
        // Handled in onclose
      };

      this.ws.onclose = () => {
        this.state.updateTelemetry({ isOnline: false });
        this.ws = null;
        this.state.emit('telemetry:status', { status: 'reconnecting', message: 'WAITING FOR ESP...' });
        this.scheduleAutoReconnect(800);
      };
    } catch (e) {
      if (window.location.protocol === 'https:' && wsUrl.startsWith('ws://')) {
        this.state.emit('telemetry:status', { status: 'blocked-https', message: 'BLOCKED (HTTPS) - Use Localhost or USB Serial' });
      } else {
        this.scheduleAutoReconnect(800);
      }
    }

    this.startWatchdog();
  }

  /**
   * Connect ESP32 directly via USB cable (Web Serial API)
   * Fully supported on Chrome & Edge over HTTPS (including GitHub Pages!)
   */
  async connectWebSerial() {
    if (!('serial' in navigator)) {
      alert('The Web Serial API is supported in Chrome, Edge, and Opera desktop browsers.\nTo use wireless ESP32, host the app locally on XAMPP (http://localhost/robot-nav/).');
      return;
    }

    try {
      this.stop();
      this.serialPort = await navigator.serial.requestPort();
      await this.serialPort.open({ baudRate: 115200 });
      this.isSerialConnected = true;

      console.log('[Telemetry] Connected via USB Serial port.');
      this.state.emit('telemetry:status', { status: 'connected', message: 'USB SERIAL CONNECTED' });
      this.state.updateTelemetry({ isOnline: true });

      const textDecoder = new TextDecoderStream();
      this.serialReadableClosed = this.serialPort.readable.pipeTo(textDecoder.writable);
      this.serialReader = textDecoder.readable.getReader();

      let lineBuffer = '';
      while (true) {
        const { value, done } = await this.serialReader.read();
        if (done) break;
        lineBuffer += value;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop(); // Retain incomplete line fragment
        for (const line of lines) {
          if (line.trim()) {
            this.parseIncomingTelemetry(line);
          }
        }
      }
    } catch (err) {
      console.warn('[Telemetry] Web Serial connection ended or error:', err);
      this.isSerialConnected = false;
      this.state.updateTelemetry({ isOnline: false });
      this.state.emit('telemetry:status', { status: 'reconnecting', message: 'SERIAL DISCONNECTED' });
    }
  }

  /**
   * Schedule next reconnect attempt with backoff protection
   */
  scheduleAutoReconnect(delayMs = 800) {
    if (this.state.config.isSimulation) return;
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.state.config.isSimulation && (!this.ws || this.ws.readyState === WebSocket.CLOSED)) {
        this.connectHardware();
      }
    }, delayMs);
  }

  /**
   * Watchdog timer: Automatically detects when ESP boots up, powers off, or drops packets
   */
  startWatchdog() {
    if (this.watchdogTimer) return;

    this.watchdogTimer = setInterval(() => {
      if (this.state.config.isSimulation) {
        this.stopWatchdog();
        return;
      }

      const now = Date.now();

      // 1. Not connected -> retry aggressively
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.scheduleAutoReconnect(800);
        return;
      }

      // 2. Hanging in CONNECTING state for > 1.5s -> abort and retry (prevents stuck SYN)
      if (this.ws.readyState === WebSocket.CONNECTING) {
        if (!this._connectingStart) this._connectingStart = now;
        if (now - this._connectingStart > 1500) {
          try { this.ws.close(); } catch (e) {}
          this.ws = null;
          this._connectingStart = null;
          this.scheduleAutoReconnect(500);
        }
        return;
      } else {
        this._connectingStart = null;
      }

      // 3. Socket OPEN, but no packets for > 3.0s (ESP power-cycled, rebooted, or power lost)
      if (this.ws.readyState === WebSocket.OPEN && this.lastPacketTime > 0) {
        if (now - this.lastPacketTime > 3000) {
          console.warn('[Telemetry] Sensor ESP silent for > 3s (device rebooted or power lost). Reconnecting...');
          this.state.updateTelemetry({ isOnline: false });
          this.state.emit('telemetry:status', { status: 'reconnecting', message: 'WAITING FOR ESP...' });
          try { this.ws.close(); } catch (e) {}
          this.ws = null;
          this.scheduleAutoReconnect(500);
        }
      }
    }, 1000);
  }

  /**
   * Toggle Simulation on/off
   */
  setSimulationMode(enabled) {
    this.state.config.isSimulation = enabled;
    if (enabled) {
      this.startSimulation();
    } else {
      this.stop();
      // Reset telemetry to 0 / standby
      this.state.updateTelemetry({
        ultrasonicCm: 0.0,
        lidarCm: 0.0,
        lidarSignalQuality: 0,
        isOnline: false
      });
      this.connectHardware();
    }
  }
}

window.TelemetryEngine = TelemetryEngine;
