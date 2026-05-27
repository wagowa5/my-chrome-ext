# YouTube Live Whisper JP Subtitles v1.1

Local-only Chrome extension MVP.

## v1.1 changes

- Shows the English Whisper transcript immediately after transcription returns.
- Shows `翻訳中…` while Japanese translation is pending.
- Updates the Japanese line when translation finishes, while keeping the English line visible.
- Translation is now fired asynchronously so it does not block the next transcription chunk as much.
- Added 2-second chunk option for lower-latency English display.

## Usage

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Load this folder as an unpacked extension.
4. Open extension Options and save your OpenAI API key.
5. Set audio chunk interval to 2 or 3 seconds if you want faster English display.
6. Open or reload a YouTube page.
7. Click the browser extension icon to start. Chrome tab audio capture must start from the extension icon.

## Debug

- Press `Test` to confirm the overlay DOM works.
- Press `Debug Log` to view/copy logs.
- If Chrome shows `Cannot capture a tab with an active stream`, click `Reset Capture`, then click the browser extension icon again.

## API calls

- `POST https://api.openai.com/v1/audio/transcriptions`
- `POST https://api.openai.com/v1/chat/completions`

## v1.3: transcript export

YouTube画面右上のコントロールに `Download TXT` と `Download JSON` が追加されています。
ライブ中または停止後に押すと、これまでに文字起こしした英語と翻訳済みの日本語をローカルに保存できます。

- TXT: 読みやすいテキスト形式
- JSON: `records` 配列に `startedAt`, `english`, `japanese` などを含む機械処理しやすい形式

字幕の履歴は現在のYouTubeタブ内メモリに保持されます。ページをリロードすると消えるので、ライブ終了後はリロード前に保存してください。


## v1.3 changes

- The control panel buttons now wrap in rows of three buttons.
- Core transcription, translation, and download behavior is unchanged from v1.2.
