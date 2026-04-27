(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────────────
  const CACHE_MAX     = 300;
  const POLL_INTERVAL = 800;   // poll for caption container (ms)
  const OVERLAY_ID    = 'ytrans-overlay';

  // ── State ─────────────────────────────────────────────────────────────────
  let settings      = { enabled: true, targetLang: 'vi', fontSize: 18, bgOpacity: 80 };
  let cache         = new Map();
  let abortCtrl     = null;
  let overlayEl     = null;
  let buttonEl      = null;
  let isTranslating = false;
  let runVersion    = 0;        // increments to invalidate stale starts

  // CC observer
  let ccObserver  = null;
  let ccPollTimer = null;
  let ccDebounce  = null;
  let lastCCText  = '';

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    settings = await loadSettings();
    createOverlay();

    if (settings.enabled) ensureButton();

    chrome.storage.onChanged.addListener((changes) => {
      if (!changes.ytransSettings) return;
      const wasEnabled = settings.enabled;
      const wasVoice   = settings.voiceEnabled;
      const oldLang    = settings.targetLang;
      settings = changes.ytransSettings.newValue;
      applyStyle();

      if (wasEnabled && !settings.enabled) {
        // Extension disabled → tear everything down
        stopTranslation();
        removeButton();
      } else if (!wasEnabled && settings.enabled) {
        // Extension enabled → bring back the button
        ensureButton();
      } else if (settings.enabled && isTranslating && oldLang !== settings.targetLang) {
        // Language changed mid-translation → restart with new language
        stopTranslation();
        startTranslation();
      }

      // React to voice toggle changes while translation is running
      if (isTranslating) {
        if (!wasVoice && settings.voiceEnabled) muteVideoForVoice();
        else if (wasVoice && !settings.voiceEnabled) cancelSpeech();
      }
    });

    document.addEventListener('yt-navigate-finish', () => {
      const wasTranslating = isTranslating;
      stopTranslation();
      removeButton();
      setTimeout(() => {
        if (!settings.enabled) return;
        ensureButton();
        if (wasTranslating) startTranslation();   // continue across video changes
      }, 1500);
    });
  }

  // ── Toggle Button ─────────────────────────────────────────────────────────
  function ensureButton() {
    if (buttonEl && document.body.contains(buttonEl)) return;
    const player = document.querySelector('#movie_player') ||
                   document.querySelector('.html5-video-player');
    if (!player) { setTimeout(ensureButton, 800); return; }

    buttonEl = document.createElement('button');
    buttonEl.id   = 'ytrans-button';
    buttonEl.type = 'button';
    buttonEl.addEventListener('click', toggleTranslation);
    player.appendChild(buttonEl);
    updateButton();
  }

  function removeButton() {
    if (buttonEl) { buttonEl.remove(); buttonEl = null; }
  }

  function updateButton(loading) {
    if (!buttonEl) return;
    buttonEl.classList.toggle('ytrans-button-active',  isTranslating && !loading);
    buttonEl.classList.toggle('ytrans-button-loading', !!loading);
    if (loading) {
      buttonEl.innerHTML = '<span class="ytrans-btn-icon"></span> Đang tải…';
      buttonEl.title = 'YTrans – Đang tải phụ đề';
    } else if (isTranslating) {
      buttonEl.innerHTML = '<span class="ytrans-btn-icon">✕</span> Dừng dịch';
      buttonEl.title = 'YTrans – Click để dừng';
    } else {
      buttonEl.innerHTML = '<span class="ytrans-btn-icon">🌐</span> Dịch video';
      buttonEl.title = 'YTrans – Click để dịch phụ đề';
    }
  }

  function toggleTranslation() {
    if (isTranslating) stopTranslation();
    else               startTranslation();
  }

  let originalCCState = null;   // remembers user's CC setting before YTrans toggled it

  function startTranslation() {
    isTranslating = true;
    updateButton(true);   // loading state
    runVersion++;

    document.body.classList.add('ytrans-active');   // CSS hides native captions

    // YouTube blocks direct /api/timedtext fetches without PoToken,
    // so we always force-enable native CC and read it via MutationObserver.
    forceEnableCC();
    muteVideoForVoice();
    startCCMode();

    updateButton(false);
  }

  function stopTranslation() {
    runVersion++;          // invalidate any pending startTranslation
    isTranslating = false;
    document.body.classList.remove('ytrans-active');
    restoreCCState();
    cancelSpeech();
    cleanup();
    updateButton(false);
  }

  // ── YouTube CC control ────────────────────────────────────────────────────
  function getCCButton() {
    return document.querySelector('.ytp-subtitles-button');
  }

  function isCCOn(btn) {
    return btn?.getAttribute('aria-pressed') === 'true';
  }

  function forceEnableCC() {
    const btn = getCCButton();
    if (!btn) { console.warn('[YTrans] CC button not found on player'); return; }

    if (originalCCState === null) originalCCState = isCCOn(btn);

    if (!isCCOn(btn)) {
      btn.click();
      console.log('[YTrans] Auto-enabled YouTube CC for translation');
    }
  }

  function restoreCCState() {
    if (originalCCState === false) {
      const btn = getCCButton();
      if (btn && isCCOn(btn)) btn.click();   // user originally had CC off → turn back off
    }
    originalCCState = null;
  }

  function cleanup() {
    hideOverlay();
    cache.clear();
    lastCCText = '';
    abortInflight();
    clearInterval(ccPollTimer);
    clearTimeout(ccDebounce);
    if (ccObserver) { ccObserver.disconnect(); ccObserver = null; }
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  const SETTINGS_DEFAULTS = {
    enabled: true, targetLang: 'vi', fontSize: 18, bgOpacity: 80,
    voiceEnabled: false, voiceRate: 1.0, duckAudio: true,
  };
  function loadSettings() {
    return new Promise((resolve) =>
      chrome.storage.sync.get('ytransSettings', (d) =>
        resolve({ ...SETTINGS_DEFAULTS, ...(d.ytransSettings || {}) })
      )
    );
  }

  // ── Voice (Text-to-Speech) ──────────────────────────────────────────────────────
  const synth = window.speechSynthesis;
  let savedVideoMuted = null;

  // Cache voices – browsers fire voiceschanged asynchronously on first load
  let cachedVoices = [];
  function loadVoiceCache() { cachedVoices = synth ? synth.getVoices() : []; }
  if (synth) { loadVoiceCache(); synth.addEventListener('voiceschanged', loadVoiceCache); }

  const LANG_BCP47 = {
    vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR',
    'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', fr: 'fr-FR', de: 'de-DE',
    es: 'es-ES', pt: 'pt-BR', ru: 'ru-RU', ar: 'ar-SA', th: 'th-TH', id: 'id-ID',
  };

  function pickVoice(bcp47) {
    if (!cachedVoices.length) loadVoiceCache();
    const exact = cachedVoices.find((v) => v.lang === bcp47);
    if (exact) return exact;
    const primary = bcp47.split('-')[0];
    return cachedVoices.find((v) => v.lang.startsWith(primary)) || null;
  }

  // Mute video for the entire duration voice mode is active
  function muteVideoForVoice() {
    if (!settings.voiceEnabled || !settings.duckAudio) return;
    const video = document.querySelector('video');
    if (!video || savedVideoMuted !== null) return;
    savedVideoMuted = video.muted;
    video.muted = true;
  }

  function unmuteVideoForVoice() {
    const video = document.querySelector('video');
    if (video && savedVideoMuted !== null) {
      video.muted = savedVideoMuted;
      savedVideoMuted = null;
    }
  }

  function speakTranslation(text) {
    if (!synth || !settings.voiceEnabled || !text) return;

    synth.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG_BCP47[settings.targetLang] || settings.targetLang || 'en-US';

    // Match voice speed to current video playback rate so they stay in sync
    const video = document.querySelector('video');
    const videoRate = video ? (video.playbackRate || 1.0) : 1.0;
    u.rate   = Math.max(0.5, Math.min(4, Number(settings.voiceRate || 1.0) * videoRate));
    u.volume = 1.0;

    const v = pickVoice(u.lang);
    if (v) u.voice = v;

    synth.speak(u);
  }

  function cancelSpeech() {
    if (synth) synth.cancel();
    unmuteVideoForVoice();
  }

  // ── Overlay ───────────────────────────────────────────────────────────────
  function createOverlay() {
    overlayEl = document.getElementById(OVERLAY_ID);
    if (overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.id = OVERLAY_ID;
    overlayEl.setAttribute('aria-live', 'polite');
    overlayEl.setAttribute('aria-atomic', 'true');
    document.body.appendChild(overlayEl);
    applyStyle();
  }

  function applyStyle() {
    if (!overlayEl) return;
    overlayEl.style.fontSize   = `${settings.fontSize}px`;
    overlayEl.style.background = `rgba(8,8,8,${(settings.bgOpacity ?? 80) / 100})`;
    overlayEl.setAttribute('data-lang', (settings.targetLang || 'vi').toUpperCase());
  }

  function repositionOverlay() {
    // Anchor to YouTube's caption window so our overlay tracks its position
    const captionWin = document.querySelector('.ytp-caption-window-container');
    if (captionWin) {
      const r   = captionWin.getBoundingClientRect();
      let   top = r.bottom + 8;
      if (top + 64 > window.innerHeight) top = Math.max(r.top - 64, 4);
      overlayEl.style.top    = `${top}px`;
      overlayEl.style.left   = `${r.left + r.width / 2}px`;
      overlayEl.style.bottom = 'auto';
    }
  }

  function showTranslation(text) {
    if (!overlayEl || !text) return;
    repositionOverlay();
    overlayEl.textContent = text;
    overlayEl.setAttribute('data-lang', (settings.targetLang || 'vi').toUpperCase());
    overlayEl.classList.add('ytrans-visible');
    speakTranslation(text);
  }

  function hideOverlay() {
    overlayEl?.classList.remove('ytrans-visible');
    cancelSpeech();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CC MODE  –  MutationObserver on YouTube's native caption DOM
  // ══════════════════════════════════════════════════════════════════════════
  function startCCMode() {
    ccPollTimer = setInterval(() => {
      const container = document.querySelector('.ytp-caption-window-container');
      if (container) {
        clearInterval(ccPollTimer);
        attachCCObserver(container);
      }
    }, POLL_INTERVAL);
  }

  function attachCCObserver(container) {
    if (ccObserver) ccObserver.disconnect();
    ccObserver = new MutationObserver(onCCMutation);
    ccObserver.observe(container, { childList: true, subtree: true, characterData: true });
  }

  function abortInflight() {
    if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; }
  }

  function onCCMutation() {
    if (!settings.enabled) return hideOverlay();

    const text = getCCText();
    if (!text) return hideOverlay();
    if (text === lastCCText) return;
    lastCCText = text;

    const key = `${settings.targetLang}:${text}`;
    if (cache.has(key)) {
      clearTimeout(ccDebounce);
      abortInflight();
      return showTranslation(cache.get(key));
    }

    abortInflight();
    clearTimeout(ccDebounce);
    ccDebounce = setTimeout(() => translateAndShow(text), 50);
  }

  function getCCText() {
    const segs = document.querySelectorAll('.ytp-caption-segment');
    if (!segs.length) return '';
    return Array.from(segs).map((s) => s.textContent).join(' ').trim();
  }

  // ── Translation (shared by both modes) ───────────────────────────────────
  async function translateAndShow(text) {
    const key = `${settings.targetLang}:${text}`;
    if (cache.has(key)) return showTranslation(cache.get(key));

    abortCtrl = new AbortController();
    const { signal } = abortCtrl;

    try {
      const result = await fetchTranslation(text, settings.targetLang, signal);
      abortCtrl = null;

      if (!result) return;
      if (result.trim().toLowerCase() === text.trim().toLowerCase()) return;

      cache.set(key, result);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);

      // Only display if this text is still the current CC line
      if (lastCCText === text) showTranslation(result);
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('[YTrans] Lỗi dịch:', err.message);
    }
  }

  async function fetchTranslation(text, tl, signal) {
    const url =
      'https://translate.googleapis.com/translate_a/single' +
      `?client=gtx&sl=auto&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data?.[0]?.map((p) => p?.[0]).filter(Boolean).join('') ?? '';
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  init();
})();
