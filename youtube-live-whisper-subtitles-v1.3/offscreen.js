const sessions = new Map();

async function notify(tabId, type, payload = {}) {
  await chrome.runtime.sendMessage({ type, tabId, ...payload });
}

async function debug(tabId, text, level = 'INFO') {
  await notify(tabId, 'YTW_LOG', { text, level }).catch(() => {});
}

function summarizeApiBody(body) {
  if (!body) return '';
  try {
    const json = JSON.parse(body);
    return json?.error?.message || json?.message || body.slice(0, 1000);
  } catch (_) {
    return body.slice(0, 1000);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeAudioFile(blob) {
  const mime = blob.type || 'audio/webm';
  const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm';
  return new File([blob], `chunk-${Date.now()}.${ext}`, { type: mime });
}

async function transcribeWithWhisper(blob, settings) {
  const formData = new FormData();
  formData.append('model', settings.transcriptionModel || 'whisper-1');
  formData.append('language', 'en');
  formData.append('response_format', 'json');
  formData.append('file', makeAudioFile(blob));

  if (settings.tabIdForDebug) await debug(settings.tabIdForDebug, `Whisper request: blob=${Math.round(blob.size / 1024)}KB model=${settings.transcriptionModel || 'whisper-1'}`);
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.openaiApiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Whisper API error: ${response.status}: ${summarizeApiBody(body)}`);
  }

  const json = await response.json();
  return (json.text || '').trim();
}

async function translateToJapanese(text, settings) {
  if (settings.tabIdForDebug) await debug(settings.tabIdForDebug, `Translation request: chars=${text.length} model=${settings.translationModel || 'gpt-4o-mini'}`);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: settings.translationModel || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: [
            'You translate live English speech transcripts into natural Japanese subtitles.',
            'Return only Japanese subtitle text.',
            'Keep it concise, readable, and suitable for a video overlay.',
            'Do not add explanations, speaker labels, quotation marks, or markdown.',
            'If the input is empty, noise, or not meaningful speech, return an empty string.'
          ].join(' ')
        },
        { role: 'user', content: text }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Translation API error: ${response.status}: ${summarizeApiBody(body)}`);
  }

  const json = await response.json();
  return (json.choices?.[0]?.message?.content || '').trim();
}

async function translateAndSend(session, record) {
  const settings = session.settings || {};
  settings.tabIdForDebug = session.tabId;
  const translated = await translateToJapanese(record.english, settings);
  await debug(session.tabId, `Translation result: ${translated ? translated.slice(0, 160) : '(empty)'}`);
  record.japanese = translated || '';
  record.translatedAt = new Date().toISOString();
  await notify(session.tabId, 'YTW_RECORD_TRANSLATED', { record });
  if (translated && !session.stopped) {
    await notify(session.tabId, 'YTW_SUBTITLE', {
      text: translated,
      sourceText: record.english
    });
    await notify(session.tabId, 'YTW_STATUS', { status: '日本語字幕を表示しました' });
  }
}

function isProbablyUsefulTranscript(text) {
  if (!text) return false;
  if (text.length < 3) return false;
  const lower = text.toLowerCase().trim();
  const junk = ['thank you for watching', 'subscribe', '[music]', 'music'];
  return !junk.includes(lower);
}

async function processQueue(session) {
  if (session.processing) return;
  session.processing = true;

  while (session.queue.length > 0 && !session.stopped) {
    const item = session.queue.shift();
    const blob = item.blob;
    try {
      const settings = session.settings || {};
      settings.tabIdForDebug = session.tabId;
      if (!settings.openaiApiKey) {
        throw new Error('OpenAI APIキーが未設定です。拡張機能のOptionsで設定してください。');
      }

      await notify(session.tabId, 'YTW_STATUS', { status: `文字起こし中... (${Math.round(blob.size / 1024)}KB)` });
      const sourceText = await transcribeWithWhisper(blob, settings);
      await debug(session.tabId, `Whisper result: ${sourceText ? sourceText.slice(0, 160) : '(empty)'}`);
      if (!isProbablyUsefulTranscript(sourceText)) {
        await notify(session.tabId, 'YTW_STATUS', { status: '音声待機中...' });
        continue;
      }

      const record = {
        id: `${session.sessionId}-${++session.recordCounter}`,
        sessionId: session.sessionId,
        startedAt: item.startedAt,
        endedAt: new Date().toISOString(),
        chunkMs: item.chunkMs,
        english: sourceText,
        japanese: ''
      };
      session.records.push(record);

      await notify(session.tabId, 'YTW_RECORD_SOURCE', { record });
      await notify(session.tabId, 'YTW_SOURCE_SUBTITLE', {
        sourceText,
        text: '翻訳中…'
      });
      await notify(session.tabId, 'YTW_STATUS', { status: `英語表示済み / 翻訳中: ${sourceText.slice(0, 32)}...` });
      translateAndSend(session, record).catch(async (error) => {
        await debug(session.tabId, error.stack || error.message || String(error), 'ERROR');
        await notify(session.tabId, 'YTW_ERROR', { error: error.message || String(error) });
      });
    } catch (error) {
      await debug(session.tabId, error.stack || error.message || String(error), 'ERROR');
      await notify(session.tabId, 'YTW_ERROR', { error: error.message || String(error) });
      session.stopped = true;
      break;
    }

    await sleep(100);
  }

  session.processing = false;
}

function getMimeType() {
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  return '';
}

function recordOneChunk(session, chunkMs) {
  if (session.stopped) return;
  const chunks = [];
  const startedAt = new Date().toISOString();
  const options = session.mimeType ? { mimeType: session.mimeType } : undefined;
  const recorder = new MediaRecorder(session.stream, options);
  session.mediaRecorder = recorder;

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  recorder.onerror = async (event) => {
    session.stopped = true;
    await debug(session.tabId, event.error?.message || 'MediaRecorder error', 'ERROR');
    await notify(session.tabId, 'YTW_ERROR', { error: event.error?.message || 'MediaRecorder error' });
  };

  recorder.onstop = () => {
    if (chunks.length && !session.stopped) {
      const blob = new Blob(chunks, { type: session.mimeType || 'audio/webm' });
      if (blob.size > 1500) {
        debug(session.tabId, `Recorded chunk: ${Math.round(blob.size / 1024)}KB type=${blob.type || 'unknown'}`).catch(() => {});
        session.queue.push({ blob, startedAt, chunkMs });
        processQueue(session);
      }
    }
    if (!session.stopped) {
      setTimeout(() => recordOneChunk(session, chunkMs), 0);
    }
  };

  recorder.start();
  setTimeout(() => {
    if (!session.stopped && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, chunkMs);
}

async function startCapture(tabId, streamId, settings) {
  if (sessions.has(tabId)) {
    await stopCapture(tabId);
  }

  settings = settings || {};
  if (!settings.openaiApiKey) {
    throw new Error('OpenAI APIキーが未設定です。拡張機能のOptionsで設定してください。');
  }

  await debug(tabId, 'Calling getUserMedia with tab stream id');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(audioContext.destination);

  const session = {
    tabId,
    stream,
    audioContext,
    mediaRecorder: null,
    mimeType: getMimeType(),
    queue: [],
    processing: false,
    stopped: false,
    settings,
    sessionId: `session-${Date.now()}`,
    recordCounter: 0,
    records: []
  };

  sessions.set(tabId, session);
  const chunkMs = Math.max(2000, Number(settings.chunkMs) || 3000);
  await debug(tabId, `Capture started. mimeType=${session.mimeType || 'browser-default'} chunkMs=${chunkMs}`);
  recordOneChunk(session, chunkMs);
  await notify(tabId, 'YTW_STATUS', { status: `英語先行表示 + ローカル保存モードで開始しました (${chunkMs / 1000}秒ごと)` });
}

async function stopCapture(tabId) {
  const session = sessions.get(tabId);
  if (!session) return;

  session.stopped = true;
  if (session.mediaRecorder && session.mediaRecorder.state !== 'inactive') {
    session.mediaRecorder.stop();
  }
  session.stream?.getTracks().forEach((track) => track.stop());
  session.audioContext?.close().catch(() => {});
  sessions.delete(tabId);
  await notify(tabId, 'YTW_STATUS', { status: `停止しました。Download TXT/JSONで保存できます (${session.records.length} records)` });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'YTW_START_CAPTURE') {
      await startCapture(message.tabId, message.streamId, message.settings || {});
    }
    if (message?.type === 'YTW_STOP_CAPTURE') {
      await stopCapture(message.tabId);
    }
    sendResponse({ ok: true });
  })().catch(async (error) => {
    if (message?.tabId) {
      await notify(message.tabId, 'YTW_ERROR', { error: error.message || String(error) });
    }
    sendResponse({ ok: false, error: error.message || String(error) });
  });
  return true;
});
