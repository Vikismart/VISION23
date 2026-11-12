/**
 * VISION 23: AI Object Identification & Vision Engine Subsystem
 * Simulation is OFF by default. Uses real ESP32-CAM / USB webcam feeds.
 * Simulation only runs when explicitly checked ON.
 */

class VisionEngine {
  constructor(state, streamContainerId, overlayCanvasId) {
    this.state = state;
    this.container = document.getElementById(streamContainerId);
    this.canvas = document.getElementById(overlayCanvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    // Stream elements
    this.streamImg = document.getElementById('esp32StreamImg');
    this.liveVideo = document.getElementById('liveWebcamVideo');
    this.simCanvas = document.getElementById('simulatedStreamCanvas');
    this.simCtx = this.simCanvas ? this.simCanvas.getContext('2d') : null;
    this.deviceSelect = document.getElementById('cameraDeviceSelect');

    this.timer = null;
    this.animFrameId = null;
    this.simFrame = 0;
    this.mediaStream = null;

    // Mock dataset for when Simulation Mode is explicitly checked ON
    this.mockDataset = [
      {
        objectClass: 'Wooden Chair',
        objectCategory: 'Furniture / Obstacle',
        icon: '🪑',
        confidenceRange: [92.0, 97.5],
        bearing: 'Center • 1.1m Ahead',
        threatLevel: 'moderate',
        advice: 'Obstacle in travel path. Steer slightly right.',
        box: { x: 0.28, y: 0.35, w: 0.44, h: 0.52 },
        color: '#06b6d4'
      },
      {
        objectClass: 'Pedestrian / Person',
        objectCategory: 'Dynamic Obstacle',
        icon: '🚶',
        confidenceRange: [94.0, 98.6],
        bearing: 'Slight Left • 1.8m Ahead',
        threatLevel: 'high',
        advice: 'Pedestrian detected in path. Slow down or yield.',
        box: { x: 0.20, y: 0.18, w: 0.38, h: 0.72 },
        color: '#ef4444'
      },
      {
        objectClass: 'Doorway (Open)',
        objectCategory: 'Navigation Landmark',
        icon: '🚪',
        confidenceRange: [95.0, 99.1],
        bearing: 'Direct Center • 2.4m',
        threatLevel: 'none',
        advice: 'Clear passage detected through open doorway. Maintain heading.',
        box: { x: 0.30, y: 0.15, w: 0.40, h: 0.78 },
        color: '#10b981'
      },
      {
        objectClass: 'Staircase (Down)',
        objectCategory: 'Terrain Hazard',
        icon: '🪜',
        confidenceRange: [89.5, 95.0],
        bearing: 'Direct Ahead • 1.4m',
        threatLevel: 'high',
        advice: 'CAUTION: Descending steps detected! Halt or proceed with care.',
        box: { x: 0.15, y: 0.50, w: 0.70, h: 0.45 },
        color: '#f59e0b'
      }
    ];

    this.currentIndex = 0;

    // Real-Time Offline AI Object Detection State
    this.model = null;
    this.isModelLoading = false;
    this.isDetecting = false;
    this.liveDetectionTimer = null;

    // Multi-object detection storage
    this.lastPredictions = []; // All detections from latest frame
    this.inferenceMs = 0;
    this._fpsFrameCount = 0;
    this._fpsLastTime = performance.now();
    this.currentFps = 0;

    // ESP32-CAM Auto-Connect & Liveness Watchdog State
    this._espConnected = false;
    this._probeTimer = null;
    this._livenessTimer = null;
    this._frameCheckTimer = null;
    this._streamRetryTimer = null;
    this._consecutiveLivenessFails = 0;
    this._isProbing = false;

    this._initModelWhenReady();
  }

  /**
   * Wait for TF.js backend to be ready, then load the offline COCO-SSD model.
   * Calling tf.ready() first is critical — without it the WebGL backend
   * may not be initialized when loadGraphModel tries to allocate GPU buffers.
   */
  async _initModelWhenReady() {
    if (this.model || this.isModelLoading) return;
    this.isModelLoading = true;

    const pill = document.querySelector('.ai-engine-pill');
    const setStatus = (text, color = null) => {
      if (!pill) return;
      pill.innerText = text;
      pill.style.borderColor = color || '';
      pill.style.color = color || '';
    };

    setStatus('Initializing TF.js...');

    try {
      // ── GPU acceleration: prefer WebGL (phone GPU) over CPU ──────────────
      if (window.tf) {
        try {
          await window.tf.setBackend('webgl');
        } catch (_) {
          // WebGL unavailable (e.g. low-end device) — fall back to cpu
          await window.tf.setBackend('cpu');
        }
        await window.tf.ready();
        console.log(`[Vision 23] TF.js backend: ${window.tf.getBackend()}`);
      } else {
        console.warn('[Vision 23] TensorFlow.js not found on window.tf');
        setStatus('TF.js Missing', '#ef4444');
        return;
      }

      if (!window.cocoSsd) {
        console.warn('[Vision 23] cocoSsd library not found on window.cocoSsd');
        setStatus('COCO-SSD Missing', '#ef4444');
        return;
      }

      setStatus('Loading AI Model...');
      console.log('[Vision 23] Loading offline SSDLite MobileNetV2 model...');

      // Primary: load from bundled offline weights
      try {
        this.model = await window.cocoSsd.load({
          base: 'lite_mobilenet_v2',
          modelUrl: './vendor/models/ssdlite_mobilenet_v2/model.json'
        });
        console.log('[Vision 23] ✅ Offline MobileNetV2 model loaded successfully!');
        setStatus('SSDLite AI ● READY', 'var(--emerald-safe)');
      } catch (offlineErr) {
        // Fallback: download from CDN (requires internet)
        console.warn('[Vision 23] Offline model failed, falling back to CDN:', offlineErr);
        setStatus('Model: CDN Fallback...');
        this.model = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
        console.log('[Vision 23] ✅ CDN MobileNetV2 model loaded.');
        setStatus('SSDLite AI ● CDN', 'var(--amber-caution)');
      }

      // Warm-up pass: run one dummy inference so first real frame is instant
      if (window.tf) {
        const dummy = window.tf.zeros([1, 300, 300, 3]);
        await this.model.detect(dummy.reshape([300, 300, 3]));
        dummy.dispose();
        console.log('[Vision 23] Model warm-up complete.');
      }

    } catch (err) {
      console.error('[Vision 23] Model load failed entirely:', err);
      setStatus('AI Model Error', '#ef4444');
    } finally {
      this.isModelLoading = false;
    }
  }

  async start() {
    this.resizeCanvases();
    window.addEventListener('resize', () => this.resizeCanvases());

    await this.refreshCameraDevices();

    // Simulation is OFF by default
    if (this.state.config.isSimulation) {
      this.setSimulationMode(true);
    } else {
      this.setMode(this.state.config.streamMode || 'esp32');
    }

    this.startLiveDetectionLoop();
    this.renderLoop();
  }

  /**
   * Continuous real-time detection loop for live camera feed
   */
  startLiveDetectionLoop() {
    if (this.liveDetectionTimer) clearInterval(this.liveDetectionTimer);
    this.liveDetectionTimer = setInterval(() => {
      if (!this.state.config.isSimulation) {
        this.runLiveDetection();
      }
    }, 380); // Smooth 2.6Hz inference rate optimized for mobile devices
  }

  /**
   * Runs local on-device inference against live video/image element
   */
  async runLiveDetection() {
    if (!this.model || this.isDetecting || this.state.config.isSimulation) return;

    let targetElement = null;
    if (this.state.config.streamMode === 'esp32' && this.streamImg && this.streamImg.naturalWidth > 0 && this.streamImg.style.display !== 'none') {
      targetElement = this.streamImg;
    } else if (this.state.config.streamMode === 'usb' && this.liveVideo && this.liveVideo.readyState >= 2 && this.liveVideo.style.display !== 'none') {
      targetElement = this.liveVideo;
    }

    if (!targetElement) return;

    this.isDetecting = true;
    const startTime = performance.now();

    try {
      // Run detection: up to 6 objects, min confidence 0.38
      const predictions = await this.model.detect(targetElement, 6, 0.38);
      const elapsed = Math.round(performance.now() - startTime);
      this.inferenceMs = elapsed;

      // Track FPS
      this._fpsFrameCount++;
      const now = performance.now();
      if (now - this._fpsLastTime >= 2000) {
        this.currentFps = Math.round((this._fpsFrameCount * 1000) / (now - this._fpsLastTime));
        this._fpsFrameCount = 0;
        this._fpsLastTime = now;
        this._updateFpsDisplay();
      }

      const elementWidth = targetElement.naturalWidth || targetElement.videoWidth || 640;
      const elementHeight = targetElement.naturalHeight || targetElement.videoHeight || 480;

      if (predictions && predictions.length > 0) {
        // Sort by bounding box area (largest = closest / most prominent)
        predictions.sort((a, b) => (b.bbox[2] * b.bbox[3]) - (a.bbox[2] * a.bbox[3]));

        // Normalize ALL predictions for multi-object overlay
        this.lastPredictions = predictions.map(pred => {
          const normBox = {
            x: Math.max(0, pred.bbox[0] / elementWidth),
            y: Math.max(0, pred.bbox[1] / elementHeight),
            w: Math.min(1, pred.bbox[2] / elementWidth),
            h: Math.min(1, pred.bbox[3] / elementHeight)
          };
          return { ...pred, normBox };
        });

        const primary = this.lastPredictions[0];
        const normBox = primary.normBox;

        const centerX = normBox.x + normBox.w / 2;
        let bearing = 'Front Center';
        if (centerX < 0.38) bearing = 'Slight Left';
        else if (centerX > 0.62) bearing = 'Slight Right';

        // Fuse with physical sensor distances
        const ultrasonic = this.state.telemetry.ultrasonicCm || 0;
        const lidar = this.state.telemetry.lidarCm || 0;
        const sensorDist = Math.min(
          ultrasonic > 0 ? ultrasonic : 9999,
          lidar > 0 ? lidar : 9999
        );

        let distanceM = '--';
        if (sensorDist < 9999) {
          distanceM = (sensorDist / 100).toFixed(1);
        } else {
          // Optical estimate: larger box height → closer object
          distanceM = (Math.max(0.4, 2.8 - (normBox.h * 2.5))).toFixed(1);
        }

        // Threat assessment for primary object
        let threatLevel = 'none';
        let boxColor = '#10b981';
        let advice = 'Path clear. Maintain heading.';

        const warnCm = this.state.config.warningThresholdCm || 35;
        const cautionCm = this.state.config.cautionThresholdCm || 80;

        if (sensorDist <= warnCm || normBox.h > 0.52) {
          threatLevel = 'high';
          boxColor = '#ef4444';
          advice = `CRITICAL: ${primary.class.toUpperCase()} directly ahead! Stop or steer away.`;
        } else if (sensorDist <= cautionCm || normBox.h > 0.32) {
          threatLevel = 'moderate';
          boxColor = '#f59e0b';
          advice = `Approaching ${primary.class}. Slow down and navigate around.`;
        }

        const categoryInfo = this.categorizeObject(primary.class);

        this.state.updateVision({
          objectClass: primary.class.charAt(0).toUpperCase() + primary.class.slice(1),
          objectCategory: categoryInfo.category,
          icon: categoryInfo.icon,
          confidence: Math.round(primary.score * 100),
          bearing: `${bearing} • ${distanceM}m Ahead`,
          distanceEstimateM: distanceM,
          threatLevel,
          advice,
          boundingBox: normBox,
          boxColor,
          inferenceTimeMs: elapsed
        });

        // Log into Path History
        if (window.navApp && window.navApp.pathHistory) {
          window.navApp.pathHistory.logEvent({
            objectClass: primary.class,
            confidence: Math.round(primary.score * 100),
            distanceCm: sensorDist < 9999 ? Math.round(sensorDist) : Math.round(parseFloat(distanceM) * 100),
            lidarCm: lidar > 0 ? Math.round(lidar) : '--',
            bearing,
            threatLevel,
            advice
          });
        }

        // Hands-free voice warning
        if (threatLevel === 'high' && window.navApp && window.navApp.voice) {
          window.navApp.voice.announceProximityWarning(
            primary.class,
            sensorDist < 9999 ? sensorDist : 40,
            'danger'
          );
        }

      } else {
        this.lastPredictions = [];
        this.state.updateVision({
          boundingBox: null,
          inferenceTimeMs: elapsed,
          advice: 'Path clear. Ready for detection.'
        });
      }
    } catch (e) {
      console.warn('[Vision 23] Live detection cycle error:', e);
    } finally {
      this.isDetecting = false;
    }
  }

  /**
   * Update the inference time / FPS readout in the UI
   */
  _updateFpsDisplay() {
    const pill = document.querySelector('.ai-engine-pill');
    if (!pill || this.state.config.isSimulation) return;
    // Only update text if model is loaded and we have a real reading
    if (this.model && this.inferenceMs > 0) {
      pill.innerText = `SSDLite ● ${this.inferenceMs}ms`;
    }
  }

  categorizeObject(className) {
    const c = (className || '').toLowerCase();
    if (['person', 'cat', 'dog', 'horse', 'sheep', 'cow', 'bird'].includes(c)) {
      return { category: 'Living / Moving Obstacle', icon: c === 'person' ? '🚶' : '🐾' };
    }
    if (['chair', 'couch', 'bed', 'dining table', 'toilet'].includes(c)) {
      return { category: 'Furniture / Interior Obstacle', icon: '🪑' };
    }
    if (['bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat'].includes(c)) {
      return { category: 'Vehicle / Traffic Obstacle', icon: '🚗' };
    }
    if (['door', 'stairs', 'stop sign', 'traffic light', 'fire hydrant'].includes(c)) {
      return { category: 'Navigation Landmark / Hazard', icon: '🚪' };
    }
    if (['backpack', 'umbrella', 'handbag', 'suitcase', 'bottle', 'cup', 'book', 'cell phone', 'laptop'].includes(c)) {
      return { category: 'Small Object / Ground Hazard', icon: '📦' };
    }
    return { category: 'Detected Object', icon: '👁️' };
  }

  resizeCanvases() {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const width = rect.width || 360;
    const height = rect.height || 270;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    if (this.simCanvas) {
      this.simCanvas.width = width;
      this.simCanvas.height = height;
    }
  }

  async refreshCameraDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');

      if (this.deviceSelect) {
        this.deviceSelect.innerHTML = '';
        if (videoDevices.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.innerText = 'No USB camera detected';
          this.deviceSelect.appendChild(opt);
        } else {
          videoDevices.forEach((device, idx) => {
            const opt = document.createElement('option');
            opt.value = device.deviceId;
            opt.innerText = device.label || `Camera ${idx + 1} (${device.deviceId.slice(0, 8)})`;
            this.deviceSelect.appendChild(opt);
          });
        }
      }
    } catch (err) {
      console.warn('[Vision 23] Could not enumerate camera devices:', err);
    }
  }

  async setMode(mode, customUrl = null) {
    this.state.config.streamMode = mode;
    this.state.updateVision({ activeSource: mode });
    this.stopMediaStream();
    this.stopEspStream();

    const statusBadge = document.getElementById('streamStatusText');
    const usbControlBar = document.getElementById('usbControlBar');
    const espControlBar = document.getElementById('espControlBar');

    if (this.streamImg) this.streamImg.style.display = 'none';
    if (this.liveVideo) this.liveVideo.style.display = 'none';
    if (this.simCanvas) this.simCanvas.style.display = 'none';

    if (mode === 'esp32') {
      if (usbControlBar) usbControlBar.style.display = 'none';
      if (espControlBar) espControlBar.style.display = 'flex';
      this.startLiveEsp32Stream(customUrl || this.state.config.esp32StreamUrl);
    } else if (mode === 'usb') {
      if (usbControlBar) usbControlBar.style.display = 'flex';
      if (espControlBar) espControlBar.style.display = 'none';
      await this.startUsbCamera(this.state.config.selectedCameraDeviceId);
    } else if (mode === 'simulation') {
      if (usbControlBar) usbControlBar.style.display = 'none';
      if (espControlBar) espControlBar.style.display = 'none';
      this.setSimulationMode(true);
    }
  }

  stopEspStream() {
    if (this._probeTimer) {
      clearInterval(this._probeTimer);
      this._probeTimer = null;
    }
    if (this._livenessTimer) {
      clearInterval(this._livenessTimer);
      this._livenessTimer = null;
    }
    if (this._frameCheckTimer) {
      clearInterval(this._frameCheckTimer);
      this._frameCheckTimer = null;
    }
    if (this._streamRetryTimer) {
      clearTimeout(this._streamRetryTimer);
      this._streamRetryTimer = null;
    }
    this._isProbing = false;
    this._espConnected = false;
    if (this.streamImg) {
      this.streamImg.onload = null;
      this.streamImg.onerror = null;
      this.streamImg.removeAttribute('src');
    }
  }

  /**
   * Fast probe to verify if ESP32-CAM is powered on and answering TCP
   */
  async probeEspCamAvailable(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      const probeUrl = `http://${parsed.hostname}:${parsed.port || '81'}/stream`;
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 700);
      const res = await fetch(probeUrl, {
        method: 'GET',
        mode: 'no-cors',
        signal: ctrl.signal,
        cache: 'no-store'
      });
      clearTimeout(tid);
      try { ctrl.abort(); } catch (_) {}
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Normalize input to standard ESP32-CAM stream URL
   * Automatically maps bare IP or port 80 (http://10.112.87.152/) to http://10.112.87.152:81/stream
   */
  normalizeEspStreamUrl(url) {
    if (!url) return 'http://10.112.87.152:81/stream';
    let cleaned = url.trim();
    if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
      cleaned = 'http://' + cleaned;
    }
    try {
      const parsed = new URL(cleaned);
      // Standard ESP32 CameraWebServer serves web UI on port 80 and stream on port 81 (/stream)
      if ((!parsed.port || parsed.port === '80') && (!parsed.pathname || parsed.pathname === '/' || parsed.pathname === '/stream')) {
        return `http://${parsed.hostname}:81/stream`;
      }
      return cleaned;
    } catch (e) {
      return cleaned;
    }
  }

  /**
   * 1. ESP32-CAM Stream Loader (HTTP / MJPEG)
   * Connects immediately when online, aggressively probes every 800ms when offline
   * so that the camera stream connects instantly the moment the robot is powered on.
   */
  async startLiveEsp32Stream(url) {
    if (!this.streamImg) return;
    const rawUrl = url || this.state.config.esp32StreamUrl;
    const streamUrl = this.normalizeEspStreamUrl(rawUrl);
    this.state.config.esp32StreamUrl = streamUrl;

    try { localStorage.setItem('vision23_stream_url', streamUrl); } catch (e) {}

    // Sync input boxes
    const quickInput = document.getElementById('quickEspUrl');
    if (quickInput && quickInput.value !== streamUrl) quickInput.value = streamUrl;

    const statusBadge = document.getElementById('streamStatusText');
    const _setStreamStatus = (text, connected = false) => {
      if (statusBadge) statusBadge.innerText = text;
      this.state.emit('vision:stream-status', { connected, text });
    };

    this.stopEspStream();
    this.streamImg.style.display = 'block';
    this.streamImg.crossOrigin = 'anonymous';

    _setStreamStatus('Connecting to ESP32-CAM...', false);

    const executeConnect = () => {
      if (this.state.config.isSimulation || this.state.config.streamMode !== 'esp32') return;

      const cacheBuster = `?_t=${Date.now()}`;
      this.streamImg.onload = () => {
        if (!this._espConnected) {
          this._espConnected = true;
          _setStreamStatus('LIVE: ESP32-CAM ● Connected', true);
          this.startLivenessChecker(streamUrl);
        }
      };

      this.streamImg.onerror = () => {
        this._espConnected = false;
        _setStreamStatus('Waiting for ESP32-CAM to power on...', false);
        this.resumeFastProbing(streamUrl);
      };

      this.streamImg.src = streamUrl + cacheBuster;

      // Poll naturalWidth continuously while waiting for stream start
      if (this._frameCheckTimer) clearInterval(this._frameCheckTimer);
      this._frameCheckTimer = setInterval(() => {
        if (this.streamImg && this.streamImg.naturalWidth > 0) {
          if (!this._espConnected) {
            this._espConnected = true;
            _setStreamStatus('LIVE: ESP32-CAM ● Connected', true);
            this.startLivenessChecker(streamUrl);
          }
        }
      }, 250);
    };

    // Fast check if device is already powered on
    const isOnlineNow = await this.probeEspCamAvailable(streamUrl);
    if (isOnlineNow) {
      executeConnect();
    } else {
      _setStreamStatus('Waiting for ESP32-CAM to power on...', false);
      this.resumeFastProbing(streamUrl);
    }
  }

  /**
   * Fast probe loop (runs every 800ms) to detect robot power-on immediately
   */
  resumeFastProbing(streamUrl) {
    if (this._probeTimer || this.state.config.isSimulation || this.state.config.streamMode !== 'esp32') return;

    this._isProbing = true;
    this._probeTimer = setInterval(async () => {
      if (this.state.config.isSimulation || this.state.config.streamMode !== 'esp32' || this._espConnected) {
        clearInterval(this._probeTimer);
        this._probeTimer = null;
        this._isProbing = false;
        return;
      }

      const available = await this.probeEspCamAvailable(streamUrl);
      if (available) {
        console.log('[Vision 23] ESP32-CAM powered on! Instant connecting to:', streamUrl);
        clearInterval(this._probeTimer);
        this._probeTimer = null;
        this._isProbing = false;

        const statusBadge = document.getElementById('streamStatusText');
        if (statusBadge) statusBadge.innerText = 'ESP32-CAM Online! Starting feed...';

        // Connect immediately
        const cacheBuster = `?_t=${Date.now()}`;
        this.streamImg.src = streamUrl + cacheBuster;
      }
    }, 800);
  }

  /**
   * Stream liveness & stall detector
   */
  startLivenessChecker(streamUrl) {
    if (this._livenessTimer) clearInterval(this._livenessTimer);
    this._consecutiveLivenessFails = 0;

    this._livenessTimer = setInterval(async () => {
      if (this.state.config.isSimulation || this.state.config.streamMode !== 'esp32') {
        clearInterval(this._livenessTimer);
        this._livenessTimer = null;
        return;
      }

      // Check if host is still responding
      const alive = await this.probeEspCamAvailable(streamUrl);
      if (!alive) {
        this._consecutiveLivenessFails++;
        if (this._consecutiveLivenessFails >= 2) {
          console.warn('[Vision 23] ESP32-CAM powered off or dropped. Switching to auto-reconnect probe...');
          this._espConnected = false;
          clearInterval(this._livenessTimer);
          this._livenessTimer = null;

          const statusBadge = document.getElementById('streamStatusText');
          if (statusBadge) statusBadge.innerText = 'Waiting for ESP32-CAM to power on...';
          this.state.emit('vision:stream-status', { connected: false, text: 'Waiting for ESP32-CAM to power on...' });

          if (this.streamImg) {
            this.streamImg.removeAttribute('src');
          }
          this.resumeFastProbing(streamUrl);
        }
      } else {
        this._consecutiveLivenessFails = 0;
      }
    }, 1200);
  }

  /**
   * 2. USB Camera / PC Connected Camera (getUserMedia)
   */
  async startUsbCamera(deviceId) {
    const statusBadge = document.getElementById('streamStatusText');
    if (statusBadge) statusBadge.innerText = 'Requesting USB Camera feed...';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (statusBadge) statusBadge.innerText = 'Camera API not available (Need HTTPS or localhost)';
      return;
    }

    const constraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
        : { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' }
    };

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.liveVideo) {
        this.liveVideo.srcObject = this.mediaStream;
        this.liveVideo.style.display = 'block';
        await this.liveVideo.play();
      }

      if (statusBadge) statusBadge.innerText = 'LIVE: Connected Camera Feed';
      await this.refreshCameraDevices();
    } catch (err) {
      console.error('[Vision 23] Could not open camera:', err);
      if (statusBadge) statusBadge.innerText = `Camera Standby (${err.name || 'Denied'})`;
    }
  }

  stopMediaStream() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.liveVideo) {
      this.liveVideo.srcObject = null;
    }
  }

  /**
   * Toggle Simulation Mode for the Camera Feed & Vision
   */
  setSimulationMode(enabled) {
    this.state.config.isSimulation = enabled;
    const statusBadge = document.getElementById('streamStatusText');

    if (enabled) {
      this.stopMediaStream();
      this.stopEspStream();
      if (this.streamImg) this.streamImg.style.display = 'none';
      if (this.liveVideo) this.liveVideo.style.display = 'none';
      if (this.simCanvas) this.simCanvas.style.display = 'block';
      if (statusBadge) statusBadge.innerText = 'AI FEED (Simulated Demo)';

      this.startDetectionCycle();
    } else {
      // Turn simulation OFF
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      if (this.simCanvas) this.simCanvas.style.display = 'none';

      // Clear simulated bounding boxes and labels
      if (this.ctx && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }

      this.state.updateVision({
        objectClass: 'Scanning...',
        objectCategory: 'Live Camera Standby',
        icon: '👁️',
        confidence: 0,
        bearing: 'Front Center',
        distanceEstimateM: '--',
        threatLevel: 'none',
        advice: 'Live camera feed active. Ready for detection.',
        boundingBox: null
      });

      // Restore real feed
      this.setMode(this.state.config.streamMode === 'simulation' ? 'esp32' : this.state.config.streamMode);
    }
  }

  startDetectionCycle() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (!this.state.config.isSimulation) return;

      this.currentIndex = (this.currentIndex + 1) % this.mockDataset.length;
      const item = this.mockDataset[this.currentIndex];

      const minConf = item.confidenceRange[0];
      const maxConf = item.confidenceRange[1];
      const simulatedConfidence = parseFloat((minConf + Math.random() * (maxConf - minConf)).toFixed(1));
      const estDistance = (this.state.telemetry.lidarCm / 100).toFixed(1);

      this.state.updateVision({
        objectClass: item.objectClass,
        objectCategory: item.objectCategory,
        icon: item.icon,
        confidence: simulatedConfidence,
        bearing: item.bearing,
        distanceEstimateM: estDistance,
        threatLevel: item.threatLevel,
        advice: item.advice,
        boundingBox: item.box,
        boxColor: item.color,
        inferenceTimeMs: Math.floor(22 + Math.random() * 12)
      });
    }, this.state.config.visionUpdateInterval);
  }

  renderLoop() {
    this.simFrame++;

    if (this.state.config.isSimulation && this.simCtx && this.simCanvas && this.simCanvas.style.display !== 'none') {
      this.drawSimulatedBackground();
    }

    if (this.ctx && this.canvas) {
      if (this.state.config.isSimulation) {
        this.drawAiOverlay();
      } else {
        // Clear canvas if no bounding box
        if (!this.state.vision.boundingBox) {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
          this.drawAiOverlay();
        }
      }
    }

    this.animFrameId = requestAnimationFrame(() => this.renderLoop());
  }

  drawSimulatedBackground() {
    const ctx = this.simCtx;
    const w = this.simCanvas.width;
    const h = this.simCanvas.height;

    ctx.fillStyle = '#080d1a';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
    ctx.lineWidth = 1;

    const horizonY = h * 0.45;
    const vanishX = w * 0.5;

    for (let x = -w * 0.5; x <= w * 1.5; x += 40) {
      ctx.beginPath();
      ctx.moveTo(vanishX, horizonY);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const speedOffset = (this.simFrame * 1.2) % 30;
    for (let y = horizonY; y < h; y += 18) {
      const actualY = y + speedOffset;
      if (actualY <= h && actualY >= horizonY) {
        const alpha = (actualY - horizonY) / (h - horizonY);
        ctx.strokeStyle = `rgba(6, 182, 212, ${alpha * 0.35})`;
        ctx.beginPath();
        ctx.moveTo(0, actualY);
        ctx.lineTo(w, actualY);
        ctx.stroke();
      }
    }

    const box = this.state.vision.boundingBox;
    if (box) {
      const bx = box.x * w;
      const by = box.y * h;
      const bw = box.w * w;
      const bh = box.h * h;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.fillRect(bx + 6, by + 6, bw, bh);

      ctx.font = `${Math.min(bw, bh) * 0.35}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.state.vision.icon || '📦', bx + bw / 2, by + bh / 2);
    }

    const scanY = (this.simFrame * 2) % h;
    ctx.fillStyle = 'rgba(6, 182, 212, 0.08)';
    ctx.fillRect(0, scanY, w, 4);
  }

  /**
   * Draw bounding boxes for all detected objects (primary + secondary).
   * Primary gets the full corner-bracket HUD treatment; secondary objects
   * get simpler dashed outlines so the display stays readable.
   */
  drawAiOverlay() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const vision = this.state.vision;
    if (!vision.boundingBox) return;

    // --- Helper: determine box color per threat level ---
    const threatColor = (pred, isPrimary) => {
      if (isPrimary) return vision.boxColor || '#06b6d4';
      // Secondary objects always get a muted cyan
      return 'rgba(6, 182, 212, 0.65)';
    };

    // --- Draw secondary detections first (underneath primary) ---
    const preds = this.lastPredictions || [];
    if (preds.length > 1) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.font = 'bold 10px JetBrains Mono, monospace';

      for (let i = 1; i < preds.length; i++) {
        const pred = preds[i];
        const nb = pred.normBox;
        if (!nb) continue;

        const bx = nb.x * w;
        const by = nb.y * h;
        const bw = nb.w * w;
        const bh = nb.h * h;
        const col = 'rgba(6, 182, 212, 0.55)';

        ctx.strokeStyle = col;
        ctx.strokeRect(bx, by, bw, bh);

        // Mini label chip
        const label = `${pred.class} ${Math.round(pred.score * 100)}%`;
        const lw = ctx.measureText(label).width + 8;
        const lh = 16;
        const ly = Math.max(0, by - lh);
        ctx.fillStyle = 'rgba(6, 182, 212, 0.18)';
        ctx.fillRect(bx, ly, lw, lh);
        ctx.fillStyle = 'rgba(6, 182, 212, 0.9)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + 4, ly + lh / 2);
      }
      ctx.restore();
    }

    // --- Draw primary detection with full corner-bracket HUD ---
    const bx = vision.boundingBox.x * w;
    const by = vision.boundingBox.y * h;
    const bw = vision.boundingBox.w * w;
    const bh = vision.boundingBox.h * h;
    const color = vision.boxColor || '#06b6d4';
    const cornerSize = Math.min(bw, bh) * 0.25;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.setLineDash([]);

    // Top-left corner
    ctx.beginPath();
    ctx.moveTo(bx, by + cornerSize);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + cornerSize, by);
    ctx.stroke();
    // Top-right corner
    ctx.beginPath();
    ctx.moveTo(bx + bw - cornerSize, by);
    ctx.lineTo(bx + bw, by);
    ctx.lineTo(bx + bw, by + cornerSize);
    ctx.stroke();
    // Bottom-left corner
    ctx.beginPath();
    ctx.moveTo(bx, by + bh - cornerSize);
    ctx.lineTo(bx, by + bh);
    ctx.lineTo(bx + cornerSize, by + bh);
    ctx.stroke();
    // Bottom-right corner
    ctx.beginPath();
    ctx.moveTo(bx + bw - cornerSize, by + bh);
    ctx.lineTo(bx + bw, by + bh);
    ctx.lineTo(bx + bw, by + bh - cornerSize);
    ctx.stroke();

    // Inner fill tint
    ctx.fillStyle = `${color}0d`; // ~5% opacity of the box color
    ctx.fillRect(bx, by, bw, bh);

    // Primary label chip
    const tagText = `${vision.objectClass.toUpperCase()} • ${vision.confidence > 0 ? vision.confidence + '%' : '?'}`;
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    const textMetrics = ctx.measureText(tagText);
    const tagPadding = 6;
    const tagWidth = textMetrics.width + tagPadding * 2;
    const tagHeight = 20;
    const tagY = Math.max(0, by - tagHeight);

    ctx.fillStyle = color;
    ctx.fillRect(bx, tagY, tagWidth, tagHeight);
    ctx.fillStyle = '#0a0e17';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(tagText, bx + tagPadding, tagY + tagHeight / 2);

    // Inference time badge (bottom-right of primary box)
    if (this.inferenceMs > 0) {
      const msText = `${this.inferenceMs}ms`;
      ctx.font = '9px JetBrains Mono, monospace';
      const mw = ctx.measureText(msText).width + 6;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx + bw - mw, by + bh, mw, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(msText, bx + bw - mw + 3, by + bh + 7);
    }
  }

  stop() {
    this.stopMediaStream();
    if (this.timer) clearInterval(this.timer);
    if (this.liveDetectionTimer) clearInterval(this.liveDetectionTimer);
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
  }
}

window.VisionEngine = VisionEngine;
