/**
 * VISION 23: Main Application Orchestrator
 * Connects reactive State to DOM components, manages live camera feeds (ESP32-CAM / USB webcam),
 * simulation toggle controls, audio waveform visualizer, and settings dialogs.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Subsystems (Simulation is OFF by default)
  const state = window.NavState;
  const pathHistory = new window.PathHistoryManager(state);
  const telemetry = new window.TelemetryEngine(state);
  const vision = new window.VisionEngine(state, 'streamViewport', 'aiOverlayCanvas');
  const voice = new window.VoiceAssistant(state);

  window.navApp = { state, pathHistory, telemetry, vision, voice };

  // 2. Cache DOM Elements
  // Header & Status
  const systemStatusPill = document.getElementById('systemStatusPill');
  const systemStatusText = document.getElementById('systemStatusText');
  const dangerBanner = document.getElementById('dangerAlertBanner');
  const dangerBannerText = document.getElementById('dangerAlertText');
  const btnClearCacheQuick = document.getElementById('btnClearCacheQuick');
  const btnClearCacheModal = document.getElementById('btnClearCacheModal');
  const appToast = document.getElementById('appToast');

  // Section 5: Path History
  const btnExportPathLogs = document.getElementById('btnExportPathLogs');
  const btnClearPathLogs = document.getElementById('btnClearPathLogs');
  const pathLogEmpty = document.getElementById('pathLogEmpty');
  const pathLogList = document.getElementById('pathLogList');

  // Simulation Controls (Both Camera and Sensors)
  const mainSimToggle = document.getElementById('mainSimToggle');
  const simStatusTag = document.getElementById('simStatusTag');
  const ultrasonicModeText = document.getElementById('ultrasonicModeText');
  const lidarModeText = document.getElementById('lidarModeText');

  // Section 1: Stream & Source Tabs
  const btnTabEsp32 = document.getElementById('btnTabEsp32');
  const btnTabUsb = document.getElementById('btnTabUsb');
  const btnTabSim = document.getElementById('btnTabSim');
  const sourceTabs = [btnTabEsp32, btnTabUsb, btnTabSim];

  const quickEspUrl = document.getElementById('quickEspUrl');
  const btnQuickConnectEsp = document.getElementById('btnQuickConnectEsp');
  const cameraDeviceSelect = document.getElementById('cameraDeviceSelect');
  const btnRefreshCameras = document.getElementById('btnRefreshCameras');

  const btnSnapshot = document.getElementById('btnSnapshot');
  const btnFullscreen = document.getElementById('btnFullscreen');
  const streamViewport = document.getElementById('streamViewport');

  // Section 2: Telemetry
  const quickTelemetryUrl = document.getElementById('quickTelemetryUrl');
  const btnQuickConnectTelemetry = document.getElementById('btnQuickConnectTelemetry');
  const telemetryStatusTag = document.getElementById('telemetryStatusTag');
  const ultrasonicCard = document.getElementById('ultrasonicCard');
  const ultrasonicVal = document.getElementById('ultrasonicVal');
  const ultrasonicBar = document.getElementById('ultrasonicBar');
  const ultrasonicBadge = document.getElementById('ultrasonicBadge');

  const lidarCard = document.getElementById('lidarCard');
  const lidarVal = document.getElementById('lidarVal');
  const lidarMetersVal = document.getElementById('lidarMetersVal');
  const lidarBar = document.getElementById('lidarBar');
  const lidarSignalVal = document.getElementById('lidarSignalVal');

  // Section 3: Vision
  const aiObjectIcon = document.getElementById('aiObjectIcon');
  const aiObjectName = document.getElementById('aiObjectName');
  const aiConfidenceVal = document.getElementById('aiConfidenceVal');
  const aiConfidenceFill = document.getElementById('aiConfidenceFill');
  const aiPositionVal = document.getElementById('aiPositionVal');
  const aiAdviceText = document.getElementById('aiAdviceText');

  // Section 4: Voice
  const micActionBox = document.getElementById('micActionBox');
  const btnMic = document.getElementById('btnMicMain');
  const voiceStatusLabel = document.getElementById('voiceStatusLabel');
  const userSpeechBubble = document.getElementById('userSpeechBubble');
  const userSpeechText = document.getElementById('userSpeechText');
  const aiReplyBubble = document.getElementById('aiReplyBubble');
  const aiReplyText = document.getElementById('aiReplyText');
  const earbudToggle = document.getElementById('earbudHandsFreeToggle');
  const earbudStatusIcon = document.getElementById('earbudStatusIcon');
  const earbudStatusText = document.getElementById('earbudStatusText');

  // Settings Modal
  const settingsModal = document.getElementById('settingsModal');
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const inputEsp32Stream = document.getElementById('inputEsp32Stream');
  const inputTelemetryWs = document.getElementById('inputTelemetryWs');
  const checkSimMode = document.getElementById('checkSimMode');

  // Synchronize inputs with reactive state config
  if (quickEspUrl && state.config.esp32StreamUrl) {
    quickEspUrl.value = state.config.esp32StreamUrl;
  }
  if (quickTelemetryUrl && state.config.telemetryWsUrl) {
    quickTelemetryUrl.value = state.config.telemetryWsUrl;
  }

  // 3. Central Simulation Mode Switcher (Controls BOTH Camera Feed and Sensors)
  function applySimulationMode(enabled) {
    state.config.isSimulation = enabled;

    if (mainSimToggle) mainSimToggle.checked = enabled;
    if (checkSimMode) checkSimMode.checked = enabled;

    if (enabled) {
      // Simulation is ON
      if (simStatusTag) {
        simStatusTag.innerText = 'ON';
        simStatusTag.classList.add('active');
      }
      if (systemStatusPill) {
        systemStatusPill.className = 'status-pill simulated';
        systemStatusText.innerText = 'SIMULATION ON';
      }
      if (ultrasonicModeText) ultrasonicModeText.innerText = 'Simulated Data';
      if (lidarModeText) lidarModeText.innerText = 'Simulated Data';

      // Turn on simulation for both telemetry and camera feed
      telemetry.setSimulationMode(true);
      vision.setSimulationMode(true);
      setActiveTab(btnTabSim);
    } else {
      // Simulation is OFF (Default)
      if (simStatusTag) {
        simStatusTag.innerText = 'OFF';
        simStatusTag.classList.remove('active');
      }
      if (systemStatusPill) {
        systemStatusPill.className = 'status-pill';
        systemStatusText.innerText = 'LIVE FEED';
      }
      if (ultrasonicModeText) ultrasonicModeText.innerText = 'Hardware Mode';
      if (lidarModeText) lidarModeText.innerText = 'Hardware Mode';

      // Turn off simulation for both telemetry and camera feed
      telemetry.setSimulationMode(false);
      vision.setSimulationMode(false);

      if (state.config.streamMode === 'usb') {
        setActiveTab(btnTabUsb);
      } else {
        setActiveTab(btnTabEsp32);
      }
    }
  }

  // Bind Main Simulation Switch
  if (mainSimToggle) {
    mainSimToggle.addEventListener('change', (e) => {
      applySimulationMode(e.target.checked);
    });
  }

  // 4. Stream Source Tab Switching
  function setActiveTab(activeBtn) {
    sourceTabs.forEach(b => { if (b) b.classList.remove('active'); });
    if (activeBtn) activeBtn.classList.add('active');
  }

  if (btnTabEsp32) {
    btnTabEsp32.addEventListener('click', () => {
      setActiveTab(btnTabEsp32);
      if (state.config.isSimulation) {
        applySimulationMode(false);
      }
      vision.setMode('esp32', quickEspUrl ? quickEspUrl.value.trim() : null);
    });
  }

  if (btnTabUsb) {
    btnTabUsb.addEventListener('click', async () => {
      setActiveTab(btnTabUsb);
      if (state.config.isSimulation) {
        applySimulationMode(false);
      }
      await vision.setMode('usb');
    });
  }

  if (btnTabSim) {
    btnTabSim.addEventListener('click', () => {
      applySimulationMode(true);
    });
  }

  // Quick connect button for ESP32 URL
  if (btnQuickConnectEsp && quickEspUrl) {
    const handleQuickConnect = () => {
      const rawUrl = quickEspUrl.value.trim();
      if (rawUrl) {
        const streamUrl = vision.normalizeEspStreamUrl ? vision.normalizeEspStreamUrl(rawUrl) : rawUrl;
        quickEspUrl.value = streamUrl;
        state.config.esp32StreamUrl = streamUrl;
        if (state.config.isSimulation) {
          applySimulationMode(false);
        }
        setActiveTab(btnTabEsp32);
        vision.setMode('esp32', streamUrl);
      }
    };

    btnQuickConnectEsp.addEventListener('click', handleQuickConnect);
    quickEspUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleQuickConnect();
    });
  }

  // Device dropdown change for USB / PC Camera
  if (cameraDeviceSelect) {
    cameraDeviceSelect.addEventListener('change', (e) => {
      state.config.selectedCameraDeviceId = e.target.value;
      vision.startUsbCamera(e.target.value);
    });
  }

  if (btnRefreshCameras) {
    btnRefreshCameras.addEventListener('click', () => {
      vision.refreshCameraDevices();
    });
  }

  // Quick connect button for Telemetry WebSocket URL
  if (btnQuickConnectTelemetry && quickTelemetryUrl) {
    const handleTelemetryConnect = () => {
      const rawUrl = quickTelemetryUrl.value.trim();
      if (rawUrl) {
        const wsUrl = telemetry.normalizeWsUrl ? telemetry.normalizeWsUrl(rawUrl) : rawUrl;
        quickTelemetryUrl.value = wsUrl;
        state.config.telemetryWsUrl = wsUrl;
        if (state.config.isSimulation) {
          applySimulationMode(false);
        }
        if (telemetryStatusTag) {
          telemetryStatusTag.innerText = 'CONNECTING...';
          telemetryStatusTag.style.color = 'var(--cyan-primary)';
        }
        telemetry.connectHardware();
      }
    };

    btnQuickConnectTelemetry.addEventListener('click', handleTelemetryConnect);
    quickTelemetryUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleTelemetryConnect();
    });
  }

  // 5. Telemetry Status & Event Listeners
  state.on('telemetry:status', (s) => {
    if (telemetryStatusTag && !state.config.isSimulation) {
      if (s.status === 'connected') {
        telemetryStatusTag.innerText = 'WS CONNECTED';
        telemetryStatusTag.style.color = 'var(--emerald-safe)';
      } else if (s.status === 'connecting' || s.status === 'reconnecting') {
        telemetryStatusTag.innerText = 'WAITING FOR ESP...';
        telemetryStatusTag.style.color = 'var(--amber-warning)';
      }
    }
  });

  // Auto-connect HUD dot: pulse green when ESP32-CAM connects, amber while waiting
  const streamStatusDot = document.querySelector('.stream-hud-top .status-dot');
  let _espCamEverConnected = false;
  state.on('vision:stream-status', (s) => {
    if (s.connected) {
      if (!_espCamEverConnected) {
        _espCamEverConnected = true;
        showToast('✅ ESP32-CAM connected! Live feed active.');
      }
      if (streamStatusDot) {
        streamStatusDot.style.background = 'var(--emerald-safe)';
        streamStatusDot.style.boxShadow = '0 0 6px var(--emerald-safe)';
      }
      if (systemStatusPill) {
        systemStatusPill.className = 'status-pill live';
        systemStatusText.innerText = 'LIVE FEED';
      }
    } else {
      if (streamStatusDot) {
        streamStatusDot.style.background = 'var(--amber-warning)';
        streamStatusDot.style.boxShadow = '0 0 4px var(--amber-warning)';
      }
    }
  });

  // First-connect toast for Telemetry (sensor ESP)
  let _telemetryEverConnected = false;
  state.on('telemetry:updated', (data) => {
    if (data.isOnline && !_telemetryEverConnected && !state.config.isSimulation) {
      _telemetryEverConnected = true;
      showToast('✅ Sensor ESP connected! Telemetry live.');
    }
  });

  state.on('telemetry:updated', (data) => {
    if (telemetryStatusTag) {
      if (data.isOnline) {
        telemetryStatusTag.innerText = 'WS CONNECTED';
        telemetryStatusTag.style.color = 'var(--emerald-safe)';
      } else {
        telemetryStatusTag.innerText = state.config.isSimulation ? 'SIMULATED' : 'STANDBY';
        telemetryStatusTag.style.color = 'var(--text-dim)';
      }
    }

    // Ultrasonic UI Update
    if (data.ultrasonicCm > 0) {
      if (data.ultrasonicCm > 400) {
        ultrasonicVal.innerText = '> 400';
        ultrasonicBadge.innerText = 'CLEAR';
        ultrasonicBadge.className = 'sensor-badge';
        ultrasonicBar.style.width = '100%';
        ultrasonicBar.style.backgroundColor = 'var(--cyan-primary)';
      } else {
        ultrasonicVal.innerText = data.ultrasonicCm.toFixed(1);
        const ultrasonicPct = Math.min(100, Math.max(0, (data.ultrasonicCm / 200) * 100));
        ultrasonicBar.style.width = `${ultrasonicPct}%`;
        ultrasonicBadge.innerText = data.ultrasonicCm <= state.config.warningThresholdCm ? 'OBSTACLE' :
                                    (data.ultrasonicCm <= state.config.cautionThresholdCm ? 'CAUTION' : 'CLEAR');
        ultrasonicBadge.className = `sensor-badge ${data.ultrasonicCm <= state.config.warningThresholdCm ? 'danger' : (data.ultrasonicCm <= state.config.cautionThresholdCm ? 'warning' : '')}`;
        ultrasonicBar.style.backgroundColor = data.ultrasonicCm <= state.config.warningThresholdCm ? 'var(--rose-danger)' :
                                              (data.ultrasonicCm <= state.config.cautionThresholdCm ? 'var(--amber-warning)' : 'var(--cyan-primary)');
      }
    } else if (!state.config.isSimulation) {
      ultrasonicVal.innerText = '--';
      ultrasonicBadge.className = 'sensor-badge';
      ultrasonicBadge.innerText = 'STANDBY';
      ultrasonicBar.style.width = '0%';
    }

    // LiDAR UI Update
    if (data.lidarCm > 0) {
      lidarVal.innerText = Math.round(data.lidarCm);
      lidarMetersVal.innerText = `${(data.lidarCm / 100).toFixed(2)} m`;
      const lidarPct = Math.min(100, Math.max(0, (data.lidarCm / 600) * 100));
      lidarBar.style.width = `${lidarPct}%`;
      lidarSignalVal.innerText = `${data.lidarSignalQuality || 94}%`;
    } else if (!state.config.isSimulation) {
      lidarVal.innerText = '--';
      lidarMetersVal.innerText = '-- m';
      lidarBar.style.width = '0%';
      lidarSignalVal.innerText = '0%';
    }

    // Alert & Card warning styling based on active readings
    ultrasonicCard.classList.remove('danger-state', 'warning-state');
    lidarCard.classList.remove('danger-state', 'warning-state');

    const activeMinDist = Math.min(
      data.ultrasonicCm > 0 ? data.ultrasonicCm : 9999,
      data.lidarCm > 0 ? data.lidarCm : 9999
    );

    if (activeMinDist < 9999) {
      if (data.safetyState === 'danger') {
        if (data.ultrasonicCm > 0 && data.ultrasonicCm <= state.config.warningThresholdCm) {
          ultrasonicCard.classList.add('danger-state');
        }
        if (data.lidarCm > 0 && data.lidarCm <= state.config.warningThresholdCm) {
          lidarCard.classList.add('danger-state');
        }
        dangerBanner.classList.add('active');
        dangerBannerText.innerText = `CRITICAL PROXIMITY: ${activeMinDist.toFixed(0)} CM OBSTACLE!`;
      } else if (data.safetyState === 'caution') {
        if (data.ultrasonicCm > 0 && data.ultrasonicCm <= state.config.cautionThresholdCm) {
          ultrasonicCard.classList.add('warning-state');
        }
        if (data.lidarCm > 0 && data.lidarCm <= state.config.cautionThresholdCm) {
          lidarCard.classList.add('warning-state');
        }
        dangerBanner.classList.remove('active');
      } else {
        dangerBanner.classList.remove('active');
      }
    } else {
      dangerBanner.classList.remove('active');
    }
  });

  // 6. Vision Event Listener
  state.on('vision:updated', (v) => {
    aiObjectName.innerText = v.objectClass;
    aiObjectIcon.innerText = v.icon || '👁️';
    aiConfidenceVal.innerText = `${v.confidence}%`;
    aiConfidenceFill.style.width = `${v.confidence}%`;
    aiPositionVal.innerText = v.distanceEstimateM !== '--' ? `${v.bearing} (${v.distanceEstimateM}m)` : v.bearing;
    aiAdviceText.innerText = v.advice;
  });

  // 7. Voice Event Listener
  state.on('voice:updated', (vo) => {
    micActionBox.classList.remove('listening', 'speaking');

    if (vo.isListening) {
      micActionBox.classList.add('listening');
      voiceStatusLabel.innerText = 'Listening to your command...';
      voiceStatusLabel.style.color = 'var(--cyan-primary)';
    } else if (vo.isSpeaking) {
      micActionBox.classList.add('speaking');
      voiceStatusLabel.innerText = 'Vision 23 reading via Earbuds...';
      voiceStatusLabel.style.color = 'var(--emerald-safe)';
    } else {
      voiceStatusLabel.innerText = state.config.handsFreeMode
        ? 'Hands-Free Earbud Active'
        : 'Tap Mic or Question Chip below';
      voiceStatusLabel.style.color = 'var(--text-muted)';
    }

    if (vo.lastUserQuery) {
      userSpeechBubble.style.display = 'block';
      userSpeechText.innerText = `"${vo.lastUserQuery}"`;
    }

    if (vo.lastAiReply) {
      aiReplyBubble.style.display = 'block';
      aiReplyText.innerText = vo.lastAiReply;
    }

    if (vo.earbudsDetected || state.config.handsFreeMode) {
      earbudStatusIcon.style.color = 'var(--cyan-primary)';
      earbudStatusText.innerText = 'Vision 23 Connected Earbuds Active';
    }
  });

  // 8. Microphone & Direct Voice Controls
  const directVoiceQueryInput = document.getElementById('directVoiceQueryInput');
  const btnAskVoiceDirect = document.getElementById('btnAskVoiceDirect');

  btnMic.addEventListener('click', () => {
    // Tapping mic directly toggles speech recognition and microphone audio capture
    voice.toggleListening();
  });

  if (btnAskVoiceDirect && directVoiceQueryInput) {
    const handleDirectAsk = () => {
      const q = directVoiceQueryInput.value.trim();
      if (q) {
        voice.processQuery(q);
        directVoiceQueryInput.value = '';
      }
    };
    btnAskVoiceDirect.addEventListener('click', handleDirectAsk);
    directVoiceQueryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleDirectAsk();
    });
  }

  earbudToggle.addEventListener('change', (e) => {
    voice.setHandsFreeMode(e.target.checked);
  });

  const queryChips = document.querySelectorAll('.btn-query-chip');
  queryChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const query = chip.getAttribute('data-query');
      if (query) {
        voice.processQuery(query);
      }
    });
  });

  // 9. Camera Controls
  if (btnSnapshot) {
    btnSnapshot.addEventListener('click', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0a0e17';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`VISION 23 SNAPSHOT: ${new Date().toLocaleTimeString()}`, 20, 40);
      ctx.fillText(`Ultrasonic: ${state.telemetry.ultrasonicCm} cm`, 20, 80);
      ctx.fillText(`LiDAR: ${state.telemetry.lidarCm} cm`, 20, 110);
      ctx.fillText(`Vision: ${state.vision.objectClass} (${state.vision.confidence}%)`, 20, 140);

      const link = document.createElement('a');
      link.download = `vision23_snapshot_${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
    });
  }

  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        streamViewport.requestFullscreen().catch(err => {
          alert(`Error attempting to enable fullscreen: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    });
  }

  // 10. Settings Modal Handlers
  btnOpenSettings.addEventListener('click', () => {
    inputEsp32Stream.value = state.config.esp32StreamUrl;
    inputTelemetryWs.value = state.config.telemetryWsUrl;
    if (checkSimMode) checkSimMode.checked = state.config.isSimulation;
    settingsModal.classList.add('active');
  });

  btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.remove('active');
  });

  btnSaveSettings.addEventListener('click', () => {
    const streamUrl = inputEsp32Stream.value.trim();
    const wsUrl = inputTelemetryWs.value.trim();

    if (streamUrl) {
      state.config.esp32StreamUrl = vision.normalizeEspStreamUrl ? vision.normalizeEspStreamUrl(streamUrl) : streamUrl;
      if (quickEspUrl) quickEspUrl.value = state.config.esp32StreamUrl;
      if (state.config.streamMode === 'esp32' && !state.config.isSimulation) {
        vision.setMode('esp32', state.config.esp32StreamUrl);
      }
    }

    if (wsUrl) {
      state.config.telemetryWsUrl = telemetry.normalizeWsUrl ? telemetry.normalizeWsUrl(wsUrl) : wsUrl;
      if (!state.config.isSimulation) {
        telemetry.connectHardware();
      }
    }

    if (checkSimMode) {
      applySimulationMode(checkSimMode.checked);
    }

    settingsModal.classList.remove('active');
  });

  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.remove('active');
    }
  });

  // 11. Audio Waveform Visualizer
  const waveCanvas = document.getElementById('audioWaveCanvas');
  const waveCtx = waveCanvas ? waveCanvas.getContext('2d') : null;
  let waveAngle = 0;

  function renderWaveform() {
    if (!waveCtx || !waveCanvas) return;
    const w = waveCanvas.width;
    const h = waveCanvas.height;
    waveCtx.clearRect(0, 0, w, h);

    const isListening = state.voice.isListening;
    const isSpeaking = state.voice.isSpeaking;

    if (isListening || isSpeaking) {
      waveAngle += 0.12;
      const bars = 22;
      const barWidth = 4;
      const spacing = (w - (bars * barWidth)) / (bars - 1);

      // Check if real microphone frequency data is available from Web Audio analyser
      let freqData = null;
      if (isListening && voice && voice.analyser) {
        try {
          freqData = new Uint8Array(voice.analyser.frequencyBinCount);
          voice.analyser.getByteFrequencyData(freqData);
        } catch (e) {}
      }

      for (let i = 0; i < bars; i++) {
        let heightMultiplier;
        if (freqData && freqData.length > 0) {
          const sampleIndex = Math.min(freqData.length - 1, Math.floor((i / bars) * freqData.length));
          const val = freqData[sampleIndex] / 255;
          heightMultiplier = Math.max(0.12, Math.min(1.0, val * 1.5));
        } else {
          heightMultiplier = Math.sin(waveAngle + (i * 0.35)) * 0.45 + 0.55;
        }

        const barHeight = Math.max(3, heightMultiplier * (h - 4));
        const x = i * (barWidth + spacing);
        const y = (h - barHeight) / 2;

        waveCtx.fillStyle = isSpeaking ? '#10b981' : '#06b6d4';
        waveCtx.beginPath();
        if (waveCtx.roundRect) {
          waveCtx.roundRect(x, y, barWidth, barHeight, 2);
        } else {
          waveCtx.rect(x, y, barWidth, barHeight);
        }
        waveCtx.fill();
      }
    } else {
      waveCtx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      waveCtx.fillRect(0, h / 2 - 1, w, 2);
    }

    requestAnimationFrame(renderWaveform);
  }

  if (waveCanvas) {
    waveCanvas.width = 240;
    waveCanvas.height = 24;
    renderWaveform();
  }

  // 12. Mobile Double Tap to Query
  let lastTouchTime = 0;
  document.addEventListener('touchend', (e) => {
    if (['BUTTON', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;
    const now = Date.now();
    if (now - lastTouchTime < 350) {
      voice.processQuery('What is the distance from the next object?');
    }
    lastTouchTime = now;
  });

  // 13. Toast Notification Helper
  function showToast(message) {
    if (!appToast) return;
    appToast.innerText = message;
    appToast.classList.add('show');
    setTimeout(() => {
      appToast.classList.remove('show');
    }, 2800);
  }

  // 14. Path History & Obstacle Event Renderer
  function renderPathLogs(logs) {
    if (!pathLogList || !pathLogEmpty) return;
    if (!logs || logs.length === 0) {
      pathLogEmpty.style.display = 'block';
      pathLogList.style.display = 'none';
      pathLogList.innerHTML = '';
      return;
    }

    pathLogEmpty.style.display = 'none';
    pathLogList.style.display = 'flex';
    pathLogList.innerHTML = '';

    logs.forEach((item) => {
      const el = document.createElement('div');
      el.className = `path-log-item ${item.threatLevel || 'none'}`;
      const distText = item.distanceCm !== '--' ? `${item.distanceCm} cm` : (item.lidarCm !== '--' ? `${item.lidarCm} cm` : '');
      el.innerHTML = `
        <span class="path-log-time">${item.time}</span>
        <span class="path-log-desc">${item.objectClass} ${item.confidence > 0 ? `(${item.confidence}%)` : ''} • ${item.bearing}</span>
        <span class="path-log-dist">${distText}</span>
      `;
      pathLogList.appendChild(el);
    });
  }

  // Initial render of saved route events
  if (pathHistory) {
    renderPathLogs(pathHistory.getLogs());
  }

  state.on('path:updated', (logs) => {
    renderPathLogs(logs);
  });

  // 15. Cache Purge & Path Export Handlers
  const handleClearCache = async () => {
    if (confirm('Clear offline app cache, temporary model weights, and route history?')) {
      await pathHistory.clearAllAppCache();
      showToast('Cache and path logs cleared successfully!');
    }
  };

  if (btnClearCacheQuick) btnClearCacheQuick.addEventListener('click', handleClearCache);
  if (btnClearCacheModal) btnClearCacheModal.addEventListener('click', handleClearCache);

  if (btnExportPathLogs) {
    btnExportPathLogs.addEventListener('click', () => {
      pathHistory.exportLogs();
      showToast('Path history exported as JSON');
    });
  }

  if (btnClearPathLogs) {
    btnClearPathLogs.addEventListener('click', () => {
      pathHistory.clearLogs();
      showToast('Path history cleared');
    });
  }

  // 16. Register PWA Service Worker for Offline Mobile Support
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('[Vision 23] PWA Service Worker active:', reg.scope);
      }).catch((err) => {
        console.warn('[Vision 23] SW registration failed:', err);
      });
    });
  }

  // 17. Initialize in REAL mode (Simulation OFF by default)
  applySimulationMode(false);
  telemetry.start();
  vision.start();

  // 17b. Auto-discovery of active network endpoints
  state.on('config:discovered', (endpoints) => {
    if (quickEspUrl && endpoints.camUrl) quickEspUrl.value = endpoints.camUrl;
    if (quickTelemetryUrl && endpoints.telWsUrl) quickTelemetryUrl.value = endpoints.telWsUrl;
    if (!state.config.isSimulation) {
      if (state.config.streamMode === 'esp32' && !vision._espConnected) {
        vision.startLiveEsp32Stream(endpoints.camUrl);
      }
      if (!state.telemetry.isOnline) {
        telemetry.connectHardware();
      }
    }
  });

  // Run dynamic hardware discovery
  state.discoverEndpoints();

  // 18. HTTP REST telemetry fallback
  // When the WebSocket can't be established from the mobile browser
  // (e.g. some Android browsers block ws:// to local IPs on non-HTTPS pages),
  // poll the ESP32 /telemetry HTTP endpoint instead as a silent fallback.
  (() => {
    let _restFallbackTimer = null;
    let _restActive = false;

    function startRestFallback() {
      if (_restFallbackTimer || state.config.isSimulation) return;
      _restFallbackTimer = setInterval(async () => {
        if (state.config.isSimulation || state.telemetry.isOnline) {
          // WS connected — REST not needed
          if (_restActive) {
            _restActive = false;
            console.log('[Vision 23] REST fallback paused (WS active).');
          }
          return;
        }
        // Derive the HTTP telemetry URL from the WS URL
        const wsUrl = state.config.telemetryWsUrl || '';
        const httpBase = wsUrl.replace(/^wss?:\/\//i, 'http://').replace(/:81/, ':80').replace(/\/$/, '');
        const telUrl = httpBase.includes('/telemetry') ? httpBase : `${httpBase}/telemetry`;
        try {
          const res = await fetch(telUrl, { signal: AbortSignal.timeout(2000) });
          if (res.ok) {
            const data = await res.json();
            if (!_restActive) {
              _restActive = true;
              console.log('[Vision 23] REST fallback telemetry active:', telUrl);
            }
            state.updateTelemetry({
              ultrasonicCm: parseFloat(data.ultrasonic || 0),
              lidarCm: parseFloat(data.lidar || 0),
              lidarSignalQuality: parseInt(data.signal || 94),
              isOnline: true
            });
          }
        } catch (e) { /* ESP offline - silent */ }
      }, 600); // 600 ms polling — roughly same rate as WS
    }

    // Start REST fallback after 4 s if WS hasn't connected yet
    setTimeout(startRestFallback, 4000);

    state.on('telemetry:status', (s) => {
      if (s.status === 'connected') {
        // WS came up — stop REST fallback immediately
        if (_restFallbackTimer) {
          clearInterval(_restFallbackTimer);
          _restFallbackTimer = null;
          _restActive = false;
        }
      }
    });
  })();

  // 19. Resume auto-connect when phone screen is unlocked / app foregrounded
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !state.config.isSimulation) {
      // Re-kick telemetry watchdog
      if (!state.telemetry.isOnline) {
        telemetry.connectHardware();
      }
      // Re-kick ESP32-CAM stream if it was dropped
      if (state.config.streamMode === 'esp32') {
        const img = document.getElementById('esp32StreamImg');
        if (img && (!img.src || img.naturalWidth === 0)) {
          vision.startLiveEsp32Stream();
        }
      }
    }
  });

  console.log('[VISION 23] Initialized. Waiting for ESP32-CAM and sensor ESP to power on...');
});
