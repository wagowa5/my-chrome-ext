(function initWhisperOverlay() {
  const LOG_PREFIX = '[YTW]';
  const VERSION = '1.3.0';
  function log(...args) { console.log(LOG_PREFIX, ...args); }

  function ensureRoot() {
    let root = document.getElementById('ytw-overlay-root');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'ytw-overlay-root';
    root.setAttribute('data-version', VERSION);
    root.innerHTML = `
      <style id="ytw-inline-style">
        #ytw-overlay-root { all: initial; font-family: Arial, sans-serif; }
        #ytw-subtitle-box, #ytw-status-pill, #ytw-control-panel, #ytw-debug-panel { box-sizing: border-box; }
        #ytw-subtitle-box {
          position: fixed !important; left: 50% !important; bottom: 9vh !important;
          transform: translateX(-50%) !important; z-index: 2147483647 !important;
          width: min(92vw, 1120px) !important; padding: 14px 18px !important;
          border-radius: 14px !important; background: rgba(0, 0, 0, 0.78) !important;
          color: white !important; text-align: center !important; line-height: 1.35 !important;
          box-shadow: 0 8px 30px rgba(0,0,0,.35) !important; pointer-events: none !important;
        }
        #ytw-subtitle-text { font-size: clamp(22px, 3.3vw, 44px) !important; font-weight: 800 !important; }
        #ytw-source-text { margin-top: 8px !important; font-size: clamp(15px, 1.8vw, 24px) !important; color: rgba(255,255,255,.82) !important; }
        #ytw-subtitle-box.ytw-translating #ytw-subtitle-text { font-size: clamp(16px, 2vw, 28px) !important; opacity: .72 !important; }
        #ytw-status-pill {
          position: fixed !important; right: 16px !important; top: 72px !important;
          z-index: 2147483647 !important; max-width: min(620px, calc(100vw - 32px)) !important;
          padding: 10px 12px !important; border-radius: 12px !important;
          background: rgba(0, 0, 0, .84) !important; color: #fff !important;
          font-size: 13px !important; line-height: 1.35 !important;
          box-shadow: 0 6px 20px rgba(0,0,0,.28) !important; white-space: pre-wrap !important;
        }
        #ytw-status-pill.ytw-error { background: rgba(170, 20, 20, .94) !important; }
        #ytw-control-panel {
          position: fixed !important; right: 16px !important; top: 118px !important;
          z-index: 2147483647 !important; display: grid !important; gap: 8px !important;
          grid-template-columns: repeat(3, max-content) !important; align-items: center !important; max-width: min(760px, calc(100vw - 32px)) !important;
          padding: 8px !important; border-radius: 18px !important;
          background: rgba(0,0,0,.72) !important; color: white !important;
          box-shadow: 0 6px 20px rgba(0,0,0,.28) !important;
        }
        #ytw-toggle-button, #ytw-test-button, #ytw-reset-button, #ytw-log-button, #ytw-copy-log-button, #ytw-clear-log-button,
        #ytw-download-txt-button, #ytw-download-json-button, #ytw-clear-transcript-button {
          all: initial !important; font-family: Arial, sans-serif !important; cursor: pointer !important;
          color: #fff !important; background: rgba(255,255,255,.18) !important; border: 1px solid rgba(255,255,255,.35) !important;
          border-radius: 999px !important; padding: 8px 12px !important; font-size: 13px !important; font-weight: 700 !important;
        }
        #ytw-toggle-button:hover, #ytw-test-button:hover, #ytw-reset-button:hover, #ytw-log-button:hover, #ytw-copy-log-button:hover, #ytw-clear-log-button:hover,
        #ytw-download-txt-button:hover, #ytw-download-json-button:hover, #ytw-clear-transcript-button:hover { background: rgba(255,255,255,.28) !important; }
        #ytw-transcript-count { color: rgba(255,255,255,.84) !important; font-size: 12px !important; padding: 0 4px !important; grid-column: 1 / -1 !important; }
        #ytw-debug-panel {
          position: fixed !important; right: 16px !important; top: 238px !important;
          z-index: 2147483647 !important; width: min(680px, calc(100vw - 32px)) !important;
          max-height: min(58vh, 560px) !important; overflow: auto !important; padding: 10px !important;
          border-radius: 14px !important; background: rgba(0,0,0,.90) !important; color: #fff !important;
          box-shadow: 0 6px 20px rgba(0,0,0,.35) !important; font-family: ui-monospace, Menlo, Consolas, monospace !important;
          font-size: 12px !important; line-height: 1.45 !important; white-space: pre-wrap !important;
        }
        #ytw-debug-panel .ytw-debug-actions { display: flex !important; gap: 8px !important; margin-bottom: 8px !important; flex-wrap: wrap !important; }
        #ytw-debug-panel .ytw-debug-title { font-weight: 800 !important; margin-bottom: 6px !important; }
        #ytw-debug-log { user-select: text !important; }
        .ytw-hidden { display: none !important; }
      </style>
      <div id="ytw-subtitle-box" class="ytw-hidden">
        <div id="ytw-subtitle-text"></div>
        <div id="ytw-source-text"></div>
      </div>
      <div id="ytw-status-pill" class="ytw-hidden"></div>
      <div id="ytw-control-panel">
        <button id="ytw-toggle-button" type="button">拡張アイコンで開始</button>
        <button id="ytw-test-button" type="button">Test</button>
        <button id="ytw-download-txt-button" type="button">Download TXT</button>
        <button id="ytw-download-json-button" type="button">Download JSON</button>
        <button id="ytw-clear-transcript-button" type="button">Clear Transcript</button>
        <button id="ytw-reset-button" type="button">Reset Capture</button>
        <button id="ytw-log-button" type="button">Debug Log</button>
        <span id="ytw-transcript-count">0 records</span>
      </div>
      <div id="ytw-debug-panel" class="ytw-hidden">
        <div class="ytw-debug-title">Whisper字幕 Debug Log</div>
        <div class="ytw-debug-actions">
          <button id="ytw-copy-log-button" type="button">Copy</button>
          <button id="ytw-clear-log-button" type="button">Clear</button>
        </div>
        <div id="ytw-debug-log"></div>
      </div>
    `;

    const parent = document.body || document.documentElement;
    parent.appendChild(root);
    log('overlay root created', location.href);
    return root;
  }

  const root = ensureRoot();
  const subtitleBox = root.querySelector('#ytw-subtitle-box');
  const subtitleText = root.querySelector('#ytw-subtitle-text');
  const sourceText = root.querySelector('#ytw-source-text');
  const statusPill = root.querySelector('#ytw-status-pill');
  const toggleButton = root.querySelector('#ytw-toggle-button');
  const testButton = root.querySelector('#ytw-test-button');
  const resetButton = root.querySelector('#ytw-reset-button');
  const logButton = root.querySelector('#ytw-log-button');
  const copyLogButton = root.querySelector('#ytw-copy-log-button');
  const clearLogButton = root.querySelector('#ytw-clear-log-button');
  const downloadTxtButton = root.querySelector('#ytw-download-txt-button');
  const downloadJsonButton = root.querySelector('#ytw-download-json-button');
  const clearTranscriptButton = root.querySelector('#ytw-clear-transcript-button');
  const transcriptCount = root.querySelector('#ytw-transcript-count');
  const debugPanel = root.querySelector('#ytw-debug-panel');
  const debugLog = root.querySelector('#ytw-debug-log');

  let hideSubtitleTimer = null;
  let hideStatusTimer = null;
  let lastWasError = false;
  const debugLines = window.__ytWhisperDebugLines || [];
  window.__ytWhisperDebugLines = debugLines;
  const transcriptRecords = window.__ytWhisperTranscriptRecords || [];
  window.__ytWhisperTranscriptRecords = transcriptRecords;

  function addDebugLine(level, text) {
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${level}: ${text}`;
    debugLines.push(line);
    while (debugLines.length > 200) debugLines.shift();
    if (debugLog) debugLog.textContent = debugLines.join('\n');
    try { console[level === 'ERROR' ? 'error' : 'log']('[YTW]', text); } catch (_) {}
  }

  function updateTranscriptCount() {
    if (transcriptCount) transcriptCount.textContent = `${transcriptRecords.length} records`;
  }

  function showStatus(text, isError = false, keep = false) {
    lastWasError = !!isError;
    addDebugLine(isError ? 'ERROR' : 'INFO', text);
    statusPill.textContent = text;
    statusPill.classList.toggle('ytw-error', isError);
    statusPill.classList.remove('ytw-hidden');
    clearTimeout(hideStatusTimer);
    if (!keep) {
      hideStatusTimer = setTimeout(() => statusPill.classList.add('ytw-hidden'), isError ? 20000 : 6500);
    }
  }

  function showSubtitle(text, englishText = '', translating = false) {
    addDebugLine(translating ? 'SOURCE' : 'SUBTITLE', text + (englishText ? ` / ${englishText}` : ''));
    subtitleText.textContent = text;
    sourceText.textContent = englishText;
    sourceText.style.display = englishText ? 'block' : 'none';
    subtitleBox.classList.toggle('ytw-translating', !!translating);
    subtitleBox.classList.remove('ytw-hidden');
    clearTimeout(hideSubtitleTimer);
    hideSubtitleTimer = setTimeout(() => subtitleBox.classList.add('ytw-hidden'), translating ? 12000 : 10000);
  }

  function setRunning(running) {
    toggleButton.textContent = running ? '■ Stop Whisper字幕' : '▶ Start Whisper字幕';
  }

  function upsertTranscriptSource(record) {
    if (!record || !record.id) return;
    const existing = transcriptRecords.find((item) => item.id === record.id);
    if (existing) {
      existing.english = record.english || existing.english || '';
      existing.startedAt = record.startedAt || existing.startedAt;
      existing.chunkMs = record.chunkMs || existing.chunkMs;
    } else {
      transcriptRecords.push({
        id: record.id,
        startedAt: record.startedAt || new Date().toISOString(),
        chunkMs: record.chunkMs || null,
        english: record.english || '',
        japanese: ''
      });
    }
    updateTranscriptCount();
  }

  function updateTranscriptTranslation(record) {
    if (!record || !record.id) return;
    let existing = transcriptRecords.find((item) => item.id === record.id);
    if (!existing) {
      existing = { id: record.id, startedAt: record.startedAt || new Date().toISOString(), chunkMs: null, english: record.english || '', japanese: '' };
      transcriptRecords.push(existing);
    }
    if (record.english) existing.english = record.english;
    existing.japanese = record.japanese || existing.japanese || '';
    existing.translatedAt = record.translatedAt || new Date().toISOString();
    updateTranscriptCount();
  }

  function safeTitlePart() {
    const raw = (document.title || 'youtube-live').replace(/ - YouTube$/i, '').trim() || 'youtube-live';
    return raw.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').slice(0, 80);
  }

  function filename(ext) {
    const d = new Date();
    const stamp = d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `yt-whisper-${stamp}-${safeTitlePart()}.${ext}`;
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function makeTxtTranscript() {
    const header = [
      `Title: ${document.title || ''}`,
      `URL: ${location.href}`,
      `Exported: ${new Date().toISOString()}`,
      `Records: ${transcriptRecords.length}`,
      ''
    ];
    const body = transcriptRecords.map((record, index) => {
      return [
        `#${index + 1} ${record.startedAt || ''}`,
        `EN: ${record.english || ''}`,
        `JA: ${record.japanese || ''}`
      ].join('\n');
    }).join('\n\n');
    return header.join('\n') + body + '\n';
  }

  function downloadTranscript(format) {
    if (!transcriptRecords.length) {
      showStatus('保存できる文字起こしがまだありません。', true, true);
      return;
    }
    if (format === 'json') {
      const payload = {
        title: document.title || '',
        url: location.href,
        exportedAt: new Date().toISOString(),
        records: transcriptRecords
      };
      downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), filename('json'));
      showStatus(`JSONをダウンロードしました (${transcriptRecords.length} records)`);
      return;
    }
    downloadBlob(new Blob([makeTxtTranscript()], { type: 'text/plain;charset=utf-8' }), filename('txt'));
    showStatus(`TXTをダウンロードしました (${transcriptRecords.length} records)`);
  }

  if (!window.__ytWhisperOverlayListenerInitialized) {
    window.__ytWhisperOverlayListenerInitialized = true;
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      log('message', message);
      if (message?.type === 'YTW_PING') {
        showStatus(`Whisper字幕: content script OK / DOM OK v${VERSION}`);
        sendResponse({ ok: true, version: VERSION, href: location.href });
        return true;
      }
      if (message?.type === 'YTW_SOURCE_SUBTITLE') showSubtitle(message.text || '翻訳中…', message.sourceText || '', true);
      if (message?.type === 'YTW_SUBTITLE') showSubtitle(message.text, message.sourceText || '', false);
      if (message?.type === 'YTW_RECORD_SOURCE') upsertTranscriptSource(message.record);
      if (message?.type === 'YTW_RECORD_TRANSLATED') updateTranscriptTranslation(message.record);
      if (message?.type === 'YTW_STATUS') showStatus(message.status || '', false, message.keep || false);
      if (message?.type === 'YTW_LOG') addDebugLine(message.level || 'INFO', message.text || '');
      if (message?.type === 'YTW_ERROR') showStatus(message.error || 'エラーが発生しました', true, true);
      if (message?.type === 'YTW_SET_RUNNING') {
        setRunning(!!message.running);
        if (!message.silent && !lastWasError) showStatus(message.running ? 'Whisper字幕: ON' : 'Whisper字幕: OFF');
        if (!message.running) subtitleBox.classList.add('ytw-hidden');
      }
      sendResponse({ ok: true });
      return false;
    });
  }

  if (!window.__ytWhisperOverlayButtonsInitialized) {
    window.__ytWhisperOverlayButtonsInitialized = true;
    toggleButton.addEventListener('click', () => {
      showStatus('Chromeの仕様上、ページ内ボタンからはタブ音声を取得できません。\nブラウザ右上の拡張機能アイコンをクリックして開始してください。', false, true);
    });
    testButton.addEventListener('click', () => {
      showSubtitle('これは字幕表示テストです。', 'This is a subtitle overlay test.');
      showStatus(`Whisper字幕: DOM表示テストOK v${VERSION}`);
    });
    downloadTxtButton.addEventListener('click', () => downloadTranscript('txt'));
    downloadJsonButton.addEventListener('click', () => downloadTranscript('json'));
    clearTranscriptButton.addEventListener('click', () => {
      transcriptRecords.length = 0;
      updateTranscriptCount();
      showStatus('保存済み文字起こしをクリアしました。');
    });
    logButton.addEventListener('click', () => {
      debugPanel.classList.toggle('ytw-hidden');
      debugLog.textContent = debugLines.join('\n');
    });
    copyLogButton.addEventListener('click', async () => {
      const text = debugLines.join('\n');
      try {
        await navigator.clipboard.writeText(text);
        showStatus('Debug Logをクリップボードにコピーしました。', false, false);
      } catch (error) {
        showStatus(`Debug Logコピー失敗: ${error.message || String(error)}`, true, true);
      }
    });
    clearLogButton.addEventListener('click', () => {
      debugLines.length = 0;
      debugLog.textContent = '';
      showStatus('Debug Logをクリアしました。');
    });
    resetButton.addEventListener('click', async () => {
      showStatus('既存の音声キャプチャを停止中...', false, true);
      try {
        const response = await chrome.runtime.sendMessage({ type: 'YTW_FORCE_STOP_FROM_PAGE' });
        if (!response?.ok) throw new Error(response?.error || 'reset failed');
        setRunning(false);
        showStatus('既存の音声キャプチャを停止しました。次にブラウザ右上の拡張機能アイコンをクリックしてください。', false, true);
      } catch (error) {
        showStatus(`Reset失敗: ${error.message || String(error)}`, true, true);
      }
    });
  }

  updateTranscriptCount();
  showStatus(`Whisper字幕: ページに読み込み済み v${VERSION}\n開始はブラウザ右上の拡張機能アイコンをクリックしてください。Download TXT/JSONで保存できます。`, false, true);
})();
