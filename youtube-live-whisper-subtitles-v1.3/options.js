const fields = {
  openaiApiKey: document.querySelector('#openaiApiKey'),
  chunkMs: document.querySelector('#chunkMs'),
  transcriptionModel: document.querySelector('#transcriptionModel'),
  translationModel: document.querySelector('#translationModel'),
  showSourceText: document.querySelector('#showSourceText')
};
const status = document.querySelector('#status');
const savedState = document.querySelector('#savedState');
const reveal = document.querySelector('#reveal');

function maskKey(key) {
  if (!key) return '未保存';
  if (key.length <= 12) return '保存済み: ********';
  return `保存済み: ${key.slice(0, 7)}...${key.slice(-4)}`;
}

async function load() {
  const settings = await chrome.storage.local.get({
    openaiApiKey: '',
    chunkMs: 3000,
    transcriptionModel: 'whisper-1',
    translationModel: 'gpt-4o-mini',
    showSourceText: false
  });

  fields.openaiApiKey.value = settings.openaiApiKey || '';
  fields.chunkMs.value = String(settings.chunkMs || 3000);
  fields.transcriptionModel.value = settings.transcriptionModel || 'whisper-1';
  fields.translationModel.value = settings.translationModel || 'gpt-4o-mini';
  fields.showSourceText.checked = Boolean(settings.showSourceText);
  savedState.textContent = maskKey(settings.openaiApiKey || '');
}

async function save() {
  const key = fields.openaiApiKey.value.trim();
  if (!key) {
    status.textContent = 'APIキーが空です';
    status.style.color = '#b00020';
    return;
  }
  await chrome.storage.local.set({
    openaiApiKey: key,
    chunkMs: Number(fields.chunkMs.value) || 3000,
    transcriptionModel: fields.transcriptionModel.value.trim() || 'whisper-1',
    translationModel: fields.translationModel.value.trim() || 'gpt-4o-mini',
    showSourceText: fields.showSourceText.checked
  });
  const check = await chrome.storage.local.get({ openaiApiKey: '' });
  savedState.textContent = maskKey(check.openaiApiKey || '');
  status.style.color = '#097a38';
  status.textContent = check.openaiApiKey ? '保存しました。YouTubeタブで拡張アイコンをクリックしてください。' : '保存確認に失敗しました';
}

reveal.addEventListener('change', () => {
  fields.openaiApiKey.type = reveal.checked ? 'text' : 'password';
});
document.querySelector('#save').addEventListener('click', save);
load().catch((error) => {
  status.style.color = '#b00020';
  status.textContent = `設定読み込み失敗: ${error.message || String(error)}`;
});
