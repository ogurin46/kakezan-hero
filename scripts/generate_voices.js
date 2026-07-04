'use strict';
// 使い方: node scripts/generate_voices.js
// モンスターの登場セリフ音声を MiniMax speech-02-turbo (Replicate) で生成する。
// 端末内蔵の合成音声（ロボ声）の代わりに、人間らしい声の音声ファイルを事前生成して使う。
// ザコ: Japanese_KindLady（女性）／ ボス: Japanese_IntellectualSenior（男性・低め）

const fs   = require('fs');
const path = require('path');

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.trim().match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}
loadEnv(path.join(__dirname, '..', '.env'));

const API_KEY = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
if (!API_KEY) {
  console.error('❌  .env に REPLICATE_API_TOKEN=r8_xxx を設定してください');
  process.exit(1);
}

const OUT_DIR = path.join(__dirname, '..', 'src', 'audio');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ※ text は game.js の ENTRY_LINES / BOSS_LINES と同じ順番
const LINES = [
  { file:'serif_e0.mp3', voice:'Japanese_KindLady', speed:1.0, text:'ほんとうに できているか かくにんするぞ！' },
  { file:'serif_e1.mp3', voice:'Japanese_KindLady', speed:1.0, text:'この もんだい できるかな？' },
  { file:'serif_e2.mp3', voice:'Japanese_KindLady', speed:1.0, text:'おれに かてるかなあ？' },
  { file:'serif_e3.mp3', voice:'Japanese_KindLady', speed:1.0, text:'けいさん しょうぶだ！' },
  { file:'serif_e4.mp3', voice:'Japanese_KindLady', speed:1.0, text:'まちがえたら こうげき しちゃうぞ！' },
  { file:'serif_e5.mp3', voice:'Japanese_KindLady', speed:1.0, text:'ちからだめしだ！ いくぞ！' },
  { file:'serif_e6.mp3', voice:'Japanese_KindLady', speed:1.0, text:'ぜんぶ こたえられるかな？' },
  { file:'serif_e7.mp3', voice:'Japanese_KindLady', speed:1.0, text:'ふっふっふ、 やってみろ！' },
  { file:'serif_b0.mp3', voice:'Japanese_IntellectualSenior',  speed:0.9, text:'おれさまが ボスだ！ かくごしろ！' },
  { file:'serif_b1.mp3', voice:'Japanese_IntellectualSenior',  speed:0.9, text:'ここからが ほんばんだぞ！' },
  { file:'serif_b2.mp3', voice:'Japanese_IntellectualSenior',  speed:0.9, text:'さいごの あいてだ！ かかってこい！' },
];

const HEADERS = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'wait=60',
};

async function fetchWithRetry(url, options, maxRetries = 6) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    const wait = (i + 1) * 12000;
    process.stdout.write(`\n    ⏳ レート制限中 ${wait / 1000}秒待機... `);
    await new Promise(r => setTimeout(r, wait));
  }
  throw new Error('レート制限リトライ超過');
}

async function waitForResult(res) {
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  let data = await res.json();
  if (data.status === 'succeeded') return data.output;
  if (data.status === 'failed')    throw new Error(data.error || '不明なエラー');
  const pollUrl = data.urls?.get;
  if (!pollUrl) throw new Error('ポーリングURLが取得できません');
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pr = await fetch(pollUrl, { headers: { 'Authorization': `Bearer ${API_KEY}` } });
    data = await pr.json();
    if (data.status === 'succeeded') return data.output;
    if (data.status === 'failed')    throw new Error(data.error || '生成失敗');
  }
  throw new Error('タイムアウト');
}


async function main() {
  console.log(`🔑  APIキー: ${API_KEY.slice(0, 6)}...${API_KEY.slice(-4)}\n`);

  for (let i = 0; i < LINES.length; i++) {
    const l = LINES[i];
    process.stdout.write(`[${i + 1}/${LINES.length}] ${l.file.padEnd(14)} 「${l.text.slice(0, 14)}…」 `);
    try {
      const out = await waitForResult(await fetchWithRetry(
        'https://api.replicate.com/v1/models/minimax/speech-02-turbo/predictions',
        { method: 'POST', headers: HEADERS, body: JSON.stringify({
          input: { text: l.text, voice_id: l.voice, speed: l.speed,
                   language_boost: 'Japanese', audio_format: 'mp3' }
        }) }
      ));
      const url = Array.isArray(out) ? out[0] : String(out);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`ダウンロード失敗: ${res.status}`);
      fs.writeFileSync(path.join(OUT_DIR, l.file), Buffer.from(await res.arrayBuffer()));
      console.log('✅');
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }
    if (i < LINES.length - 1) await new Promise(r => setTimeout(r, 13000));
  }
  console.log('\n🎉  セリフ音声 生成完了！');
}

main().catch(e => { console.error('致命的エラー:', e.message); process.exit(1); });
