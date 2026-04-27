'use strict';

const DEFAULT = {
  enabled: true, targetLang: 'vi', fontSize: 18, bgOpacity: 80,
  voiceEnabled: false, voiceRate: 1.0, duckAudio: true,
};

// ── DOM refs ───────────────────────────────────────────────────────────────────────────
const enabledToggle  = document.getElementById('enabledToggle');
const statusBar      = document.getElementById('statusBar');
const statusText     = document.getElementById('statusText');
const targetLangSel  = document.getElementById('targetLang');
const fontSizeRange  = document.getElementById('fontSize');
const fontSizeVal    = document.getElementById('fontSizeVal');
const bgOpacityRange = document.getElementById('bgOpacity');
const bgOpacityVal   = document.getElementById('bgOpacityVal');
const voiceToggle    = document.getElementById('voiceToggle');
const voiceRateRange = document.getElementById('voiceRate');
const voiceRateVal   = document.getElementById('voiceRateVal');
const voiceRateField = document.getElementById('voiceRateField');
const duckToggle     = document.getElementById('duckToggle');
const duckAudioField = document.getElementById('duckAudioField');

// ── Load ──────────────────────────────────────────────────────────────────────
chrome.storage.sync.get('ytransSettings', (data) => {
  const s = { ...DEFAULT, ...data.ytransSettings };

  enabledToggle.checked  = s.enabled;
  targetLangSel.value    = s.targetLang;
  fontSizeRange.value    = s.fontSize;
  fontSizeVal.textContent = `${s.fontSize}px`;
  bgOpacityRange.value   = s.bgOpacity;
  bgOpacityVal.textContent = `${s.bgOpacity}%`;

  voiceToggle.checked    = !!s.voiceEnabled;
  voiceRateRange.value   = s.voiceRate;
  voiceRateVal.textContent = `${Number(s.voiceRate).toFixed(1)}×`;
  duckToggle.checked     = !!s.duckAudio;
  updateVoiceDependents(s.voiceEnabled);

  updateStatus(s.enabled);
});

function updateVoiceDependents(on) {
  voiceRateField.classList.toggle('voice-disabled', !on);
  duckAudioField.classList.toggle('voice-disabled', !on);
}

// ── Save ──────────────────────────────────────────────────────────────────────
function save() {
  const s = {
    enabled:      enabledToggle.checked,
    targetLang:   targetLangSel.value,
    fontSize:     parseInt(fontSizeRange.value, 10),
    bgOpacity:    parseInt(bgOpacityRange.value, 10),
    voiceEnabled: voiceToggle.checked,
    voiceRate:    parseFloat(voiceRateRange.value),
    duckAudio:    duckToggle.checked,
  };
  chrome.storage.sync.set({ ytransSettings: s });
  updateStatus(s.enabled);
  updateVoiceDependents(s.voiceEnabled);
}

// ── Status ────────────────────────────────────────────────────────────────────
function updateStatus(enabled) {
  if (enabled) {
    statusBar.className    = 'status-bar active';
    statusText.textContent = '✓ Đang bật – mở YouTube và bấm nút "Dịch video"';
  } else {
    statusBar.className    = 'status-bar off';
    statusText.textContent = '✗ Đã tắt';
  }
}

// ── Version + update banner ───────────────────────────────────────────────────
(function initVersionAndUpdate() {
  const manifest     = chrome.runtime.getManifest();
  const verEl        = document.getElementById('currentVersion');
  if (verEl) verEl.textContent = manifest.version;

  const banner       = document.getElementById('updateBanner');
  const verBadge     = document.getElementById('updateVersion');
  const dlBtn        = document.getElementById('updateDownloadBtn');
  const detailsLink  = document.getElementById('updateDetailsLink');

  function applyUpdate(updateAvailable) {
    if (!updateAvailable || !banner) return;
    banner.classList.remove('hidden');
    if (verBadge) verBadge.textContent = `v${updateAvailable.version}`;
    if (detailsLink) detailsLink.href = updateAvailable.url || '#';
  }

  chrome.storage.local.get('updateAvailable', ({ updateAvailable }) => applyUpdate(updateAvailable));

  // Re-check on popup open
  chrome.runtime.sendMessage({ type: 'YTRANS_CHECK_UPDATE' }, () => {
    chrome.storage.local.get('updateAvailable', ({ updateAvailable }) => applyUpdate(updateAvailable));
  });

  // "Tải về & Cập nhật" → ask background to download zip + open extensions page
  if (dlBtn) {
    dlBtn.addEventListener('click', () => {
      dlBtn.textContent = '⏳ Đang tải…';
      dlBtn.disabled = true;
      chrome.runtime.sendMessage({ type: 'YTRANS_DO_UPDATE' }, (res) => {
        if (res?.ok) {
          dlBtn.textContent = '✓ Đã tải — reload extension';
        } else {
          dlBtn.textContent = '⬇ Tải về & Cập nhật';
          dlBtn.disabled = false;
        }
      });
    });
  }
})();

// ── Event Listeners ───────────────────────────────────────────────────────────
enabledToggle.addEventListener('change', save);
targetLangSel.addEventListener('change', save);

fontSizeRange.addEventListener('input', () => {
  fontSizeVal.textContent = `${fontSizeRange.value}px`;
  save();
});

bgOpacityRange.addEventListener('input', () => {
  bgOpacityVal.textContent = `${bgOpacityRange.value}%`;
  save();
});

voiceToggle.addEventListener('change', save);
duckToggle.addEventListener('change', save);
voiceRateRange.addEventListener('input', () => {
  voiceRateVal.textContent = `${Number(voiceRateRange.value).toFixed(1)}×`;
  save();
});
