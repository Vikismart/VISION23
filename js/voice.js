/**
 * VISION 23: Voice Interaction & Direct Earbud Navigation Subsystem
 * Captures real-time user speech directly from microphone, streams live transcripts,
 * answers spoken navigation queries using live LiDAR, Ultrasonic, and Camera telemetry,
 * and speaks responses through connected earbuds or phone audio without intrusive modals.
 */

class VoiceAssistant {
  constructor(state) {
    this.state = state;
    this.recognition = null;
    this.synth = window.speechSynthesis || null;
    this.audioCtx = null;
    this.analyser = null;
    this.micStream = null;
    this.micSource = null;
    this.selectedVoice = null;
    this.isRecognizing = false;
    this.restartTimeout = null;
    this._unlocked = false;
    this._lastWarningTime = 0;

    this.initAudioContext();
    this.initSpeechRecognition();
    this.initSpeechSynthesis();
    this.detectConnectedAudioDevices();
    this.setupAudioUnlock();
  }

  /**
   * Initializes Web Audio API for custom feedback chimes and mic waveform analyser
   */
  initAudioContext() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    } catch (e) {
      console.warn('[Vision 23 Voice] Web Audio API not supported:', e);
    }
  }

  /**
   * Connects live microphone input to Web Audio AnalyserNode for real-time visualization
   */
  connectMicrophoneStream(stream) {
    try {
      if (!this.audioCtx) this.initAudioContext();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      this.micStream = stream;
      if (!this.micSource) {
        this.micSource = this.audioCtx.createMediaStreamSource(stream);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 64;
        this.micSource.connect(this.analyser);
      }
    } catch (e) {
      console.warn('[Vision 23 Voice] Could not link microphone to analyser:', e);
    }
  }

  /**
   * Unlocks mobile audio and TTS engine on first user touch/tap
   */
  setupAudioUnlock() {
    const unlock = () => {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      if (this.synth && !this._unlocked) {
        // Silent utterance to unlock mobile Safari and Chrome audio hardware
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0.01;
        this.synth.speak(u);
        this._unlocked = true;
      }
    };
    document.addEventListener('touchstart', unlock, { once: true, passive: true });
    document.addEventListener('click', unlock, { once: true });
  }

  /**
   * Initialize Web Speech API SpeechRecognition with live interim feedback
   */
  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        this.recognition.maxAlternatives = 3;

        this.recognition.onstart = () => {
          this.isRecognizing = true;
          this.state.updateVoice({ isListening: true });
          this.playChime('listen');

          const statusLbl = document.getElementById('voiceStatusLabel');
          if (statusLbl) {
            statusLbl.innerText = 'Listening... Speak your navigation question now!';
            statusLbl.style.color = 'var(--cyan-primary)';
          }
        };

        this.recognition.onresult = (event) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          // Live interim preview as user speaks into mic
          if (interimTranscript) {
            const statusLbl = document.getElementById('voiceStatusLabel');
            if (statusLbl) {
              statusLbl.innerText = `Hearing: "${interimTranscript}..."`;
              statusLbl.style.color = 'var(--cyan-primary)';
            }
            const userBubble = document.getElementById('userSpeechBubble');
            const userText = document.getElementById('userSpeechText');
            if (userBubble && userText) {
              userBubble.style.display = 'block';
              userText.innerText = `"${interimTranscript}..."`;
            }
          }

          // Complete finalized user sentence
          if (finalTranscript.trim()) {
            console.log('[Vision 23 Voice] Direct Speech captured:', finalTranscript.trim());
            this.processQuery(finalTranscript.trim());
          }
        };

        this.recognition.onerror = (event) => {
          console.warn('[Vision 23 Voice] SpeechRecognition error:', event.error);
          this.isRecognizing = false;
          this.state.updateVoice({ isListening: false });

          const statusLbl = document.getElementById('voiceStatusLabel');
          if (statusLbl) {
            if (event.error === 'no-speech') {
              statusLbl.innerText = 'No speech detected. Tap mic to speak again.';
              statusLbl.style.color = 'var(--amber-warning)';
            } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
              statusLbl.innerText = 'Microphone permission blocked. Enable mic in browser or type question below.';
              statusLbl.style.color = 'var(--rose-danger)';
            } else if (event.error === 'network') {
              statusLbl.innerText = 'Speech network error. You can type your question below.';
              statusLbl.style.color = 'var(--amber-warning)';
            } else {
              statusLbl.innerText = `Voice status: ${event.error}. Tap mic to ask.`;
              statusLbl.style.color = 'var(--text-muted)';
            }
          }

          if (this.state.config.handsFreeMode && event.error !== 'not-allowed' && event.error !== 'service-not-allowed') {
            this.scheduleHandsFreeRestart();
          }
        };

        this.recognition.onend = () => {
          this.isRecognizing = false;
          this.state.updateVoice({ isListening: false });

          if (this.state.config.handsFreeMode && !this.state.voice.isSpeaking) {
            this.scheduleHandsFreeRestart();
          }
        };

        this.state.updateVoice({ speechApiSupported: true });
      } catch (err) {
        console.warn('[Vision 23 Voice] SpeechRecognition initialization failed:', err);
        this.state.updateVoice({ speechApiSupported: false });
      }
    } else {
      console.log('[Vision 23 Voice] SpeechRecognition not natively available on this browser/origin.');
      this.state.updateVoice({ speechApiSupported: false });
    }
  }

  /**
   * Initialize TTS voices with high-quality English preferences
   */
  initSpeechSynthesis() {
    if (!this.synth) return;

    const loadVoices = () => {
      const voices = this.synth.getVoices();
      if (!voices || voices.length === 0) return;

      this.selectedVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Karen')))
        || voices.find(v => v.lang.startsWith('en'))
        || voices[0];
    };

    loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = loadVoices;
    }
  }

  async detectConnectedAudioDevices() {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasHeadphones = devices.some(d =>
          d.kind === 'audiooutput' &&
          (d.label.toLowerCase().includes('headphone') ||
           d.label.toLowerCase().includes('earbud') ||
           d.label.toLowerCase().includes('bluetooth') ||
           d.label.toLowerCase().includes('airpods'))
        );
        this.state.updateVoice({ earbudsDetected: hasHeadphones });

        navigator.mediaDevices.ondevicechange = () => {
          this.detectConnectedAudioDevices();
        };
      } catch (e) {
        this.state.updateVoice({ earbudsDetected: false });
      }
    }
  }

  /**
   * Start recording user speech directly from microphone
   */
  async startListening() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try { await this.audioCtx.resume(); } catch (e) {}
    }

    // Warm up microphone permission proactively via getUserMedia if available
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.connectMicrophoneStream(stream);
      } catch (err) {
        console.warn('[Vision 23 Voice] getUserMedia notice:', err.name, err.message);
      }
    }

    if (this.recognition) {
      try {
        if (!this.isRecognizing) {
          this.recognition.start();
        }
      } catch (err) {
        console.warn('[Vision 23 Voice] recognition.start error, resetting:', err);
        try {
          this.recognition.stop();
          setTimeout(() => {
            if (!this.isRecognizing) {
              try { this.recognition.start(); } catch (e) {}
            }
          }, 200);
        } catch (e) {}
      }
    } else {
      const statusLbl = document.getElementById('voiceStatusLabel');
      if (statusLbl) {
        statusLbl.innerText = 'Voice recognition not supported on this origin. Type question below.';
        statusLbl.style.color = 'var(--amber-warning)';
      }
      const directInput = document.getElementById('directVoiceQueryInput');
      if (directInput) {
        directInput.focus();
      }
    }
  }

  stopListening() {
    if (this.recognition && this.isRecognizing) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    this.isRecognizing = false;
    this.state.updateVoice({ isListening: false });
  }

  toggleListening() {
    if (this.isRecognizing || this.state.voice.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  scheduleHandsFreeRestart() {
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    this.restartTimeout = setTimeout(() => {
      if (this.state.config.handsFreeMode && !this.state.voice.isSpeaking && !this.isRecognizing) {
        this.startListening();
      }
    }, 1600);
  }

  /**
   * Helper that checks whether an object is currently detected by vision engine
   */
  hasDetectedObject() {
    const vision = this.state.vision;
    if (!vision) return false;
    const name = (vision.objectClass || '').trim().toLowerCase();

    if (!name || name === 'scanning...' || name === 'none detected' || name === 'no object' || name === 'standby' || name === 'none') {
      return false;
    }

    if (!this.state.config.isSimulation) {
      return (vision.confidence > 0) || (vision.boundingBox !== null);
    }

    return true;
  }

  /**
   * Natural Language Processing Engine for Navigation Queries
   * Dynamically interprets user questions and answers aloud using live LiDAR, Ultrasonic, and Camera telemetry.
   */
  processQuery(rawQuery) {
    if (!rawQuery || !rawQuery.trim()) return;

    const q = rawQuery.toLowerCase().trim();
    this.state.updateVoice({ lastUserQuery: rawQuery });
    this.playChime('recognized');

    let reply = '';
    const ultrasonic = this.state.telemetry.ultrasonicCm || 0;
    const lidar = this.state.telemetry.lidarCm || 0;
    const lidarM = lidar > 0 ? (lidar / 100).toFixed(1) : '0';
    const vision = this.state.vision || {};
    const isObjectPresent = this.hasDetectedObject();
    const objectName = (vision.objectClass || '').toLowerCase();
    const safety = this.state.telemetry.safetyState || 'safe';

    // 1. EMERGENCY / STOP COMMANDS
    if (q === 'stop' || q === 'halt' || q.includes('stop moving') || q.includes('freeze') || q.includes('emergency')) {
      reply = `Navigation halted. Nearest obstacle is ${Math.round(ultrasonic || lidar)} centimeters away. Standing by.`;
    }
    // 2. SPECIFIC OBJECT QUERIES ("Do you see a person?", "Is there a chair?", "Do you see a bottle/door/car?")
    else if (
      (q.includes('do you see') || q.includes('is there a') || q.includes('can you see')) &&
      !q.includes('anything') && !q.includes('object')
    ) {
      const commonObjects = ['person', 'human', 'man', 'woman', 'chair', 'table', 'bottle', 'cup', 'car', 'door', 'wall', 'backpack', 'laptop', 'cell phone', 'phone', 'obstacle'];
      const targetObj = commonObjects.find(obj => q.includes(obj));

      if (targetObj && isObjectPresent && objectName.includes(targetObj)) {
        reply = `Yes! I detect a ${vision.objectClass} located ${vision.bearing} with ${Math.round(vision.confidence)} percent confidence at approximately ${lidarM} meters ahead.`;
      } else if (targetObj) {
        if (isObjectPresent) {
          reply = `No ${targetObj} detected. However, I currently detect a ${vision.objectClass} located ${vision.bearing} about ${lidarM} meters away.`;
        } else {
          reply = `No ${targetObj} detected. The path ahead is clear with no objects present.`;
        }
      } else if (isObjectPresent) {
        reply = `I see a ${vision.objectClass} located ${vision.bearing} at ${lidarM} meters.`;
      } else {
        reply = `There is no available object detected ahead. The path is clear.`;
      }
    }
    // 3. OBJECT IDENTIFICATION ("What do you see?", "What is ahead?", "What's in front of me?", "What is the next object?")
    else if (
      q.includes('what do you see') ||
      q.includes('what is ahead') ||
      q.includes("what's ahead") ||
      q.includes('what is in front') ||
      q.includes("what's in front") ||
      q.includes('next object') ||
      q.includes('look ahead') ||
      q.includes('what object') ||
      q.includes('identify') ||
      q.includes('see anything') ||
      q.includes('is there anything') ||
      q.includes('is there an object') ||
      q.includes('what is that') ||
      q.includes('tell me what you see')
    ) {
      if (!isObjectPresent) {
        reply = "There is no available object detected ahead. The camera view and path in front of you are completely clear.";
      } else {
        const confText = vision.confidence > 0 ? ` with ${Math.round(vision.confidence)} percent confidence` : '';
        reply = `Next detected object is a ${vision.objectClass}, categorized as ${vision.objectCategory}${confText}. It is located ${vision.bearing} at approximately ${lidarM} meters.`;
      }
    }
    // 4. DISTANCE & PROXIMITY QUERIES ("How far is the object?", "What is the distance?", "How close am I?")
    else if (
      q.includes('distance') ||
      q.includes('how far') ||
      q.includes('how close') ||
      q.includes('range') ||
      q.includes('proximity') ||
      q.includes('meters') ||
      q.includes('centimeters')
    ) {
      if (!isObjectPresent && ultrasonic === 0 && lidar === 0) {
        reply = "There is no available object within sensor range. Distance sensors read clear ahead.";
      } else if (ultrasonic > 0 && ultrasonic <= 80) {
        const objDesc = isObjectPresent ? vision.objectClass : "obstacle";
        reply = `Nearest ${objDesc} is ${Math.round(ultrasonic)} centimeters ahead via ultrasonic sensor. LiDAR confirms ${lidarM} meters.`;
      } else if (lidar > 0) {
        const objDesc = isObjectPresent ? vision.objectClass : "object";
        reply = `Nearest ${objDesc} is approximately ${lidarM} meters ahead, confirmed by LiDAR at ${Math.round(lidar)} centimeters. Ultrasonic reads ${Math.round(ultrasonic)} centimeters.`;
      } else {
        reply = "There is no available object detected within close range. Path is clear.";
      }
    }
    // 5. SPECIFIC SENSOR QUERIES ("LiDAR reading", "Ultrasonic reading")
    else if (q.includes('lidar') || q.includes('laser')) {
      reply = lidar > 0
        ? `LiDAR sensor reads ${Math.round(lidar)} centimeters, which is approximately ${lidarM} meters.`
        : "LiDAR sensor currently reads no target in range.";
    }
    else if (q.includes('ultrasonic') || q.includes('sonar')) {
      reply = ultrasonic > 0
        ? `Ultrasonic sensor reads ${Math.round(ultrasonic)} centimeters.`
        : "Ultrasonic sensor currently reads clear ahead.";
    }
    // 6. STEERING & DIRECTION GUIDANCE ("Which way should I go?", "Should I turn left or right?", "Where should I walk?")
    else if (
      q.includes('which way') ||
      q.includes('which direction') ||
      q.includes('where should i go') ||
      q.includes('where to go') ||
      q.includes('where can i walk') ||
      q.includes('turn left') ||
      q.includes('turn right') ||
      q.includes('steering') ||
      q.includes('how to avoid')
    ) {
      if (!isObjectPresent && safety === 'safe') {
        reply = "The path straight ahead is completely clear. You can continue forward safely.";
      } else {
        const bearing = (vision.bearing || '').toLowerCase();
        if (bearing.includes('left')) {
          reply = `The ${vision.objectClass || 'obstacle'} is on your left side. Steer slightly to the right to maintain clear passage.`;
        } else if (bearing.includes('right')) {
          reply = `The ${vision.objectClass || 'obstacle'} is on your right side. Steer slightly to the left to maintain clear passage.`;
        } else {
          reply = `Obstacle is centered directly in your path at ${lidarM} meters. Steer either left or right to bypass safely.`;
        }
      }
    }
    // 7. PATH CLEARANCE & WALKING SAFETY ("Can I walk?", "Is it safe?", "Can I move forward?", "Is the path clear?")
    else if (
      q.includes('clear') ||
      q.includes('path') ||
      q.includes('safe') ||
      q.includes('can i walk') ||
      q.includes('can i step') ||
      q.includes('can i go') ||
      q.includes('can i move') ||
      q.includes('proceed') ||
      q.includes('am i going to hit')
    ) {
      if (safety === 'danger' || (ultrasonic > 0 && ultrasonic <= (this.state.config.warningThresholdCm || 35))) {
        reply = `Warning: Path is blocked! Critical obstacle detected ${Math.round(ultrasonic || lidar)} centimeters ahead. Stop immediately.`;
      } else if (safety === 'caution') {
        const objDesc = isObjectPresent ? vision.objectClass : "obstacle";
        reply = `Caution: Approaching a ${objDesc} at ${lidarM} meters. ${vision.advice || 'Proceed carefully.'}`;
      } else if (!isObjectPresent) {
        reply = "Yes, the path is completely clear. There is no available object obstructing your way. Safe to walk.";
      } else {
        reply = `Path is safe for now. Tracking a ${vision.objectClass} in the distance at ${lidarM} meters. Safe to proceed.`;
      }
    }
    // 8. ROUTE & TRAVEL LOG QUERIES ("How many obstacles?", "Path history", "Route details")
    else if (
      q.includes('history') ||
      q.includes('log') ||
      q.includes('obstacles avoided') ||
      q.includes('how many obstacles') ||
      q.includes('route')
    ) {
      if (window.PathHistoryTracker && window.PathHistoryTracker.getStats) {
        const stats = window.PathHistoryTracker.getStats();
        reply = `Path log records ${stats.count} events, with ${stats.obstacles} obstacles logged and estimated ${stats.totalDistanceM} meters navigated.`;
      } else {
        reply = `Travel path tracker is active and logging sensor checkpoints.`;
      }
    }
    // 9. STATUS & DIAGNOSTICS REPORT ("Full status report", "System check", "Battery status")
    else if (
      q.includes('status') ||
      q.includes('report') ||
      q.includes('battery') ||
      q.includes('check') ||
      q.includes('system') ||
      q.includes('diagnostics')
    ) {
      const objStatus = isObjectPresent ? `tracking a ${vision.objectClass} at ${lidarM} meters` : "no available object detected";
      reply = `Vision 23 operational. Camera feed is active with ${objStatus}. Ultrasonic reads ${Math.round(ultrasonic)} centimeters. LiDAR reads ${lidarM} meters. System state is ${safety.toUpperCase()}. All systems normal.`;
    }
    // 10. HELP & CAPABILITIES
    else if (q.includes('help') || q.includes('options') || q.includes('what can i ask') || q.includes('commands')) {
      reply = `You can ask: What is in front of me? How far is the obstacle? Is it safe to walk? Which way should I steer? Or request LiDAR and ultrasonic readings.`;
    }
    // 11. GENERAL / CONVERSATIONAL FALLBACK
    else {
      if (!isObjectPresent) {
        reply = `I heard: "${rawQuery}". Currently, there is no available object detected ahead. Ultrasonic and LiDAR indicate the path is clear.`;
      } else {
        reply = `I heard: "${rawQuery}". Currently detecting a ${vision.objectClass} ${vision.bearing} approximately ${lidarM} meters ahead. Ultrasonic reads ${Math.round(ultrasonic)} centimeters.`;
      }
    }

    this.state.updateVoice({ lastAiReply: reply });
    this.speak(reply);
  }

  /**
   * Reads responses directly through connected headphones / earbuds via TTS
   */
  speak(text) {
    if (!this.synth) {
      console.warn('[Vision 23 Voice] SpeechSynthesis unavailable');
      return;
    }

    this.synth.cancel();

    setTimeout(() => {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        if (!this.selectedVoice) {
          this.initSpeechSynthesis();
        }
        if (this.selectedVoice) {
          utterance.voice = this.selectedVoice;
        }
        utterance.rate = this.state.config.audioRate || 1.05;
        utterance.pitch = this.state.config.audioPitch || 1.0;
        utterance.volume = 1.0;

        utterance.onstart = () => {
          this.state.updateVoice({ isSpeaking: true });
        };

        utterance.onend = () => {
          this.state.updateVoice({ isSpeaking: false });
          if (this.state.config.handsFreeMode) {
            this.scheduleHandsFreeRestart();
          }
        };

        utterance.onerror = (e) => {
          console.warn('[Vision 23 Voice] TTS error:', e);
          this.state.updateVoice({ isSpeaking: false });
        };

        this.synth.speak(utterance);
      } catch (err) {
        console.warn('[Vision 23 Voice] Speak execution error:', err);
      }
    }, 50);
  }

  playChime(type) {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'listen') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'recognized') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1174, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'danger') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      }
    } catch (err) {
      console.warn('[Vision 23 Voice] Error playing chime:', err);
    }
  }

  /**
   * Proactively announce proximity warnings via TTS when in hands-free mode
   */
  announceProximityWarning(obstacleName, distanceCm, threatLevel = 'danger') {
    if (!this.state.config.handsFreeMode) return;
    const now = Date.now();
    if (this._lastWarningTime && (now - this._lastWarningTime < 4000)) {
      return;
    }

    this._lastWarningTime = now;
    this.playChime('danger');

    let text = '';
    const distM = (distanceCm / 100).toFixed(1);
    if (threatLevel === 'danger' || distanceCm <= (this.state.config.warningThresholdCm || 35)) {
      text = `Warning! ${obstacleName || 'Obstacle'} ${Math.round(distanceCm)} centimeters ahead!`;
    } else {
      text = `Caution: ${obstacleName || 'Obstacle'} detected ${distM} meters ahead.`;
    }

    this.speak(text);
  }

  setHandsFreeMode(enabled) {
    this.state.config.handsFreeMode = enabled;
    this.state.updateVoice({ handsFreeActive: enabled });

    if (enabled) {
      this.playChime('recognized');
      this.speak("Vision 23 hands-free earbud mode engaged. You can ask navigation questions anytime.");
      this.startListening();
    } else {
      this.stopListening();
    }
  }
}

window.VoiceAssistant = VoiceAssistant;
