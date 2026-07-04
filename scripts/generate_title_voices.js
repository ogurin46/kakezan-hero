'use strict';
// 使い方: node scripts/generate_title_voices.js
// タイトルタップ時の「けいさんヒーロー！」掛け声を複数の声で生成する。
// 候補ボイスを順に試し、成功した6本を title_v0〜5.mp3 として保存
// （ゲーム側で同時再生して「10人のヒーローがみんなで叫ぶ」演出にする）

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
if (!API_KEY) { console.error('❌ .env に REPLICATE_API_TOKEN を設定'); process.exit(1); }

const OUT_DIR = path.join(__dirname, '..', 'src', 'audio');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const TEXT = 'けいさんヒーロー！';
const WANT = 6;
// 声のバリエーション候補（男性・女性・少年系を混ぜる）
const CANDIDATES = [
  { voice:'Japanese_KindLady',           speed:1.0 },
  { voice:'Japanese_IntellectualSenior', speed:1.0 },
  { voice:'Japanese_DominantMan',        speed:1.0 },
  { voice:'Japanese_GentleButler',       speed:1.0 },
  { voice:'Japanese_SereneWoman',        speed:1.0 },
  { voice:'Japanese_CalmLady',           speed:1.0 },
  { voice:'Japanese_SportyStudent',      speed:1.0 },
  { voice:'Japanese_OptimisticYouth',    speed:1.0 },
  { voice:'Japanese_ReliableMan',        speed:1.0 },
  { voice:'Japanese_KindLady',           speed:1.15 }, // 予備: 同じ声の速度違い
  { voice:'Japanese_IntellectualSenior', speed:1.15 },
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
    process.stdout.write(`⏳${wait / 1000}s… `);
    await new Promise(r => setTimeout(r, wait));
  }
  throw new Error('レート制限リトライ超過');
}

async function waitForResult(res) {
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  let data = await res.json();
  if (data.status === 'succeeded') return data.output;
  if (data.status === 'failed')    throw new Error(data.error || '生成失敗');
  const pollUrl = data.urls?.get;
  if (!pollUrl) throw new Error('ポーリングURL取得失敗');
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pr = await fetch(pollUrl, { headers: { 'Authorization': `Bearer ${API_KEY}` } });
    data = await pr.json();
    if (data.status === 'succeeded') return data.output;
    if (data.status === 'failed')    throw new Error(data.error || '生成失敗');
  }
  throw new Error('タイムアウト');
}

async function main() {
  console.log(`🔑 APIキー: ${API_KEY.slice(0, 6)}...${API_KEY.slice(-4)}\n`);
  let saved = 0;
  for (const c of CANDIDATES) {
    if (saved >= WANT) break;
    process.stdout.write(`title_v${saved}.mp3 ← ${c.voice} (x${c.speed}) ... `);
    try {
      const out = await waitForResult(await fetchWithRetry(
        'https://api.replicate.com/v1/models/minimax/speech-02-turbo/predictions',
        { method: 'POST', headers: HEADERS, body: JSON.stringify({
          input: { text: TEXT, voice_id: c.voice, speed: c.speed,
                   language_boost: 'Japanese', audio_format: 'mp3' }
        }) }
      ));
      const url = Array.isArray(out) ? out[0] : String(out);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`DL失敗: ${res.status}`);
      fs.writeFileSync(path.join(OUT_DIR, `title_v${saved}.mp3`), Buffer.from(await res.arrayBuffer()));
      console.log('✅');
      saved++;
    } catch (e) {
      console.log(`❌ ${String(e.message).slice(0, 80)}`);
    }
    await new Promise(r => setTimeout(r, 13000));
  }
  console.log(`\n🎉 ${saved}本 生成完了`);
  if (saved < WANT) process.exit(2);
}

main().catch(e => { console.error('致命的エラー:', e.message); process.exit(1); });
