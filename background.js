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
const NOTIF_ID    = 'ytrans-update';

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
      // Find zip asset in release assets; fall back to source zip
      const zipAsset = (data.assets || []).find((a) =>
        a.name.endsWith('.zip') && a.browser_download_url
      );
      const zipUrl = zipAsset
        ? zipAsset.browser_download_url
        : `https://github.com/${GITHUB_REPO}/archive/refs/tags/v${latest}.zip`;

      const info = {
        version:     latest,
        url:         data.html_url,
        zipUrl,
        publishedAt: data.published_at,
        notes:       (data.body || '').slice(0, 500),
        checkedAt:   Date.now(),
      };

      await chrome.storage.local.set({ updateAvailable: info });
      chrome.action.setBadgeText({ text: 'NEW' });
      chrome.action.setBadgeBackgroundColor({ color: '#ff3b30' });

      // Show desktop notification (only once per version)
      const { lastNotifiedVersion } = await chrome.storage.local.get('lastNotifiedVersion');
      if (lastNotifiedVersion !== latest) {
        showUpdateNotification(info);
        chrome.storage.local.set({ lastNotifiedVersion: latest });
      }
    } else {
      await chrome.storage.local.remove('updateAvailable');
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (_e) {
    // Network failure — silent retry on next alarm
  }
}

// ── Desktop notification ──────────────────────────────────────────────────
function showUpdateNotification(info) {
  chrome.notifications.create(NOTIF_ID, {
    type:     'basic',
    iconUrl:  'icons/icon-128.png',
    title:    `YTrans v${info.version} đã sẵn sàng`,
    message:  'Nhấn "Tải về" để tải bản mới về máy, sau đó reload extension.',
    buttons:  [{ title: '⬇ Tải về (.zip)' }, { title: '📋 Xem chi tiết' }],
    priority: 1,
  });
}

// ── Notification button clicks ────────────────────────────────────────────
chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  if (notifId !== NOTIF_ID) return;
  const { updateAvailable } = await chrome.storage.local.get('updateAvailable');
  if (!updateAvailable) return;

  if (btnIdx === 0) {
    // Download zip to Downloads folder
    chrome.downloads.download({
      url:      updateAvailable.zipUrl,
      filename: `YTrans-v${updateAvailable.version}.zip`,
      saveAs:   false,
    }, () => {
      // After download starts, open extensions page so user can reload
      chrome.tabs.create({ url: 'chrome://extensions' });
      chrome.notifications.create('ytrans-update-done', {
        type:    'basic',
        iconUrl: 'icons/icon-128.png',
        title:   'YTrans – Đã tải về',
        message: 'Giải nén zip vào thư mục extension, rồi nhấn ↺ Reload trên chrome://extensions.',
        priority: 2,
      });
    });
  } else {
    // Open GitHub release page
    chrome.tabs.create({ url: updateAvailable.url });
  }
  chrome.notifications.clear(NOTIF_ID);
});

// Notification body click → open popup area / extensions page
chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId === NOTIF_ID) chrome.action.openPopup?.();
});

// ── Semantic-version compare ──────────────────────────────────────────────
// Returns >0 if a > b, 0 if equal, <0 if a < b.
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

// ── Message listener ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'YTRANS_CHECK_UPDATE') {
    checkForUpdate().then(() => sendResponse({ ok: true }));
    return true;   // async response
  }
  if (msg?.type === 'YTRANS_DO_UPDATE') {
    chrome.storage.local.get('updateAvailable', ({ updateAvailable }) => {
      if (!updateAvailable) { sendResponse({ ok: false }); return; }
      chrome.downloads.download({
        url:      updateAvailable.zipUrl,
        filename: `YTrans-v${updateAvailable.version}.zip`,
        saveAs:   false,
      }, (dlId) => {
        chrome.tabs.create({ url: 'chrome://extensions' });
        sendResponse({ ok: true, dlId });
      });
    });
    return true;
  }
});
