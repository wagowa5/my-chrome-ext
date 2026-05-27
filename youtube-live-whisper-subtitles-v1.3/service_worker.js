const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const runningTabs = new Set();

async function getSettings() {
  const defaults = {
    openaiApiKey: '',
    chunkMs: 3000,
    transcriptionModel: 'whisper-1',
    translationModel: 'gpt-4o-mini',
    showSourceText: false
  };
  return chrome.storage.local.get(defaults);
}

function sanitizeSettingsForOffscreen(settings) {
  return {
    openaiApiKey: settings.openaiApiKey || settings.apiKey || settings.OPENAI_API_KEY || '',
    chunkMs: Math.max(2000, Number(settings.chunkMs) || 3000),
    transcriptionModel: settings.transcriptionModel || 'whisper-1',
    translationModel: settings.translationModel || 'gpt-4o-mini',
    showSourceText: true
  };
}

function isYouTubeUrl(url = '') {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'youtube.com' || u.hostname.endsWith('.youtube.com'));
  } catch (_) {
    return false;
  }
}

async function hasOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['USER_MEDIA'],
    justification: 'Capture tab audio, send audio chunks to Whisper, and return translated subtitles.'
  });
}

async function ensureOverlayInjected(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  // Ping confirms the content script listener is alive and also makes a visible debug pill.
  const reply = await chrome.tabs.sendMessage(tabId, { type: 'YTW_PING' });
  return reply;
}

async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.warn('Could not send message to content script:', error);
  }
}

async function forceStopExistingCapture(tabId) {
  runningTabs.delete(tabId);
  try {
    if (await hasOffscreenDocument()) {
      await chrome.runtime.sendMessage({ type: 'YTW_STOP_CAPTURE', tabId });
    }
  } catch (error) {
    console.warn('[YTW] force stop message failed:', error);
  }
  await sendToTab(tabId, { type: 'YTW_SET_RUNNING', running: false });
  await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
}

async function start(tab, streamIdPromise) {
  console.log('[YTW] start requested', tab?.id, tab?.url);
  if (!tab?.id) return;

  if (!isYouTubeUrl(tab.url)) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => alert('YouTubeページで使用してください。')
    }).catch(() => {});
    return;
  }

  await chrome.action.setBadgeText({ tabId: tab.id, text: '...' });
  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#666666' });

  let ping;
  try {
    ping = await ensureOverlayInjected(tab.id);
  } catch (error) {
    throw new Error(`Content Script注入に失敗: ${error.message || String(error)}`);
  }

  await sendToTab(tab.id, { type: 'YTW_STATUS', status: `開始準備中... (${ping?.version || 'no-version'} / settings OK)`, keep: true });
  await sendToTab(tab.id, { type: 'YTW_STATUS', status: 'Offscreen documentを準備中...', keep: true });
  await ensureOffscreenDocument();
  await sendToTab(tab.id, { type: 'YTW_STATUS', status: 'タブ音声IDを確認中...', keep: true });

  let streamId;
  try {
    // Important: chrome.tabCapture.getMediaStreamId() must be invoked synchronously
    // from chrome.action.onClicked. The promise is created there and awaited here.
    streamId = await streamIdPromise;
    await sendToTab(tab.id, { type: 'YTW_STATUS', status: 'タブ音声ID取得OK。録音を開始します...', keep: true });
  } catch (error) {
    const message = error.message || String(error);
    if (message.includes('active stream')) {
      await sendToTab(tab.id, { type: 'YTW_STATUS', status: '既存のタブ音声キャプチャが残っています。停止処理を実行しました。もう一度、ブラウザ右上の拡張機能アイコンをクリックしてください。', keep: true });
      await forceStopExistingCapture(tab.id);
      throw new Error('既存の音声キャプチャを停止しました。もう一度、拡張機能アイコンをクリックしてください。');
    }
    throw new Error(`タブ音声の取得に失敗: ${message}`);
  }

  const settings = sanitizeSettingsForOffscreen(await getSettings());
  if (!settings.openaiApiKey) {
    await chrome.runtime.openOptionsPage().catch(() => {});
    throw new Error('OpenAI APIキーが未設定です。Options画面を開きました。APIキーを入力して「保存」を押してから、YouTubeタブで拡張アイコンを再度クリックしてください。');
  }

  runningTabs.add(tab.id);

  const response = await chrome.runtime.sendMessage({
    type: 'YTW_START_CAPTURE',
    tabId: tab.id,
    streamId,
    settings
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'Offscreen capture failed');
  }

  await chrome.action.setBadgeText({ tabId: tab.id, text: 'ON' });
  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#108a00' });
  await sendToTab(tab.id, { type: 'YTW_SET_RUNNING', running: true });
}

async function stop(tabId) {
  runningTabs.delete(tabId);
  await chrome.runtime.sendMessage({ type: 'YTW_STOP_CAPTURE', tabId }).catch(() => {});
  await sendToTab(tabId, { type: 'YTW_SET_RUNNING', running: false });
  await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  let streamIdPromise = null;
  try {
    if (runningTabs.has(tab.id)) {
      await stop(tab.id);
    } else {
      if (!isYouTubeUrl(tab.url)) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => alert('YouTubeページで使用してください。')
        }).catch(() => {});
        return;
      }
      // This call must happen immediately in direct response to clicking the extension action.
      // Do not move it below any await, content-script injection, or offscreen setup.
      streamIdPromise = chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      await start(tab, streamIdPromise);
    }
  } catch (error) {
    console.error('[YTW]', error);
    await chrome.action.setBadgeText({ tabId: tab.id, text: 'ERR' }).catch(() => {});
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#aa1414' }).catch(() => {});
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {});
    await sendToTab(tab.id, { type: 'YTW_ERROR', error: error.message || String(error) });
    runningTabs.delete(tab.id);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (runningTabs.has(tabId)) {
    runningTabs.delete(tabId);
    chrome.runtime.sendMessage({ type: 'YTW_STOP_CAPTURE', tabId }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'YTW_TOGGLE_FROM_PAGE') {
      sendResponse({ ok: false, error: 'Chromeの仕様上、ページ内ボタンからはタブ音声を取得できません。ブラウザ右上の拡張機能アイコンをクリックしてください。' });
      return;
    }
    if (message?.type === 'YTW_FORCE_STOP_FROM_PAGE') {
      const tabId = sender?.tab?.id;
      if (!tabId) {
        sendResponse({ ok: false, error: 'タブIDを取得できませんでした。YouTubeページで実行してください。' });
        return;
      }
      await forceStopExistingCapture(tabId);
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === 'YTW_SOURCE_SUBTITLE') {
      await sendToTab(message.tabId, { type: 'YTW_SOURCE_SUBTITLE', text: message.text || '翻訳中…', sourceText: message.sourceText || '' });
    }
    if (message?.type === 'YTW_SUBTITLE') {
      await sendToTab(message.tabId, { type: 'YTW_SUBTITLE', text: message.text, sourceText: message.sourceText || '' });
    }

    if (message?.type === 'YTW_RECORD_SOURCE') {
      await sendToTab(message.tabId, { type: 'YTW_RECORD_SOURCE', record: message.record });
    }
    if (message?.type === 'YTW_RECORD_TRANSLATED') {
      await sendToTab(message.tabId, { type: 'YTW_RECORD_TRANSLATED', record: message.record });
    }
    if (message?.type === 'YTW_STATUS') {
      await sendToTab(message.tabId, { type: 'YTW_STATUS', status: message.status, keep: message.keep || false });
    }
    if (message?.type === 'YTW_LOG') {
      await sendToTab(message.tabId, { type: 'YTW_LOG', level: message.level || 'INFO', text: message.text || '' });
    }
    if (message?.type === 'YTW_ERROR') {
      await sendToTab(message.tabId, { type: 'YTW_ERROR', error: message.error });
      runningTabs.delete(message.tabId);
      await sendToTab(message.tabId, { type: 'YTW_SET_RUNNING', running: false, silent: true });
      await chrome.action.setBadgeText({ tabId: message.tabId, text: 'ERR' }).catch(() => {});
      await chrome.action.setBadgeBackgroundColor({ tabId: message.tabId, color: '#aa1414' }).catch(() => {});
    }
    sendResponse({ ok: true });
  })().catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});
