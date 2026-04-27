// ── Default settings on install ────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.sync.set({
      ytransSettings: {
        enabled:      true,
        targetLang:   'vi',
        fontSize:     18,
        bgOpacity:    80,
        voiceEnabled: false,
        voiceRate:    1.0,
        duckAudio:    true,
      },
    });
  }
  checkForUpdate();
});

chrome.runtime.onStartup.addListener(checkForUpdate);

// ── Periodic update check (every 6 h) ──────────────────────────────────────
const UPDATE_ALARM = 'ytrans-update-check';
chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: 6 * 60 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === UPDATE_ALARM) checkForUpdate();
});

// ── GitHub Release checker ─────────────────────────────────────────────────
const GITHUB_REPO = 'binhunicorps/YTrans';

async function checkForUpdate() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { 'Accept': 'application/vnd.github+json' } }
    );
    if (!res.ok) return;
    const data = await res.json();

    const latest  = String(data.tag_name || '').replace(/^v/i, '').trim();
    const current = chrome.runtime.getManifest().version;
    if (!latest) return;

    if (compareVersions(latest, current) > 0) {
      await chrome.storage.local.set({
        updateAvailable: {
          version:    latest,
          url:        data.html_url,
          publishedAt: data.published_at,
          notes:      (data.body || '').slice(0, 500),
          checkedAt:  Date.now(),
        },
      });
      chrome.action.setBadgeText({ text: 'NEW' });
      chrome.action.setBadgeBackgroundColor({ color: '#ff3b30' });
    } else {
      await chrome.storage.local.remove('updateAvailable');
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (_e) {
    // Network failure — silent retry on next alarm
  }
}

// Semantic-version compare. Returns >0 if a > b, 0 if equal, <0 if a < b.
function compareVersions(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

// Allow popup to force a re-check
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'YTRANS_CHECK_UPDATE') {
    checkForUpdate().then(() => sendResponse({ ok: true }));
    return true;   // async response
  }
});
