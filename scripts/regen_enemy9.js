'use strict';
// 使い方: node scripts/regen_enemy9.js
// enemy_9.png（魔王）だけを再生成する。
// 旧プロンプトの「hellfire aura」で輪郭が煙状になり rembg が本体まで
// 透過してしまったため、エフェクトなし・輪郭くっきりのプロンプトに変更。

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

const OUT_FILE = path.join(__dirname, '..', 'src', 'img', 'enemy_9.png');

const PROMPT =
  'chibi demon king final boss monster, dark crimson red body, large black curved horns, ' +
  'dark purple bat wings folded behind, glowing golden eyes, black obsidian armor with gold trim, ' +
  'fierce toothy grin, solid flat cel shading, thick crisp clean outlines, ' +
  'no smoke, no fog, no aura, no glow effects, no particles, ' +
  'front view full body centered, plain pure white background, anime RPG game character, kawaii but menacing';

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

async function getRembgVersion() {
  const res = await fetch('https://api.replicate.com/v1/models/cjwbw/rembg', {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  if (!res.ok) return 'fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003';
  const data = await res.json();
  return data.latest_version?.id
    || 'fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003';
}

async function main() {
  console.log(`🔑  APIキー: ${API_KEY.slice(0, 6)}...${API_KEY.slice(-4)}`);

  // バックアップ
  if (fs.existsSync(OUT_FILE)) {
    fs.copyFileSync(OUT_FILE, OUT_FILE + '.bak');
    console.log('💾  旧 enemy_9.png を enemy_9.png.bak にバックアップ');
  }

  process.stdout.write('🎨  Flux Schnell で生成中... ');
  const out1 = await waitForResult(await fetchWithRetry(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    { method: 'POST', headers: HEADERS, body: JSON.stringify({ input: {
      prompt: PROMPT, num_outputs: 1, aspect_ratio: '1:1',
      output_format: 'png', output_quality: 100,
    } }) }
  ));
  const imageUrl = Array.isArray(out1) ? out1[0] : String(out1);
  console.log('✅');

  process.stdout.write('✂️   rembg で背景除去中... ');
  const rembgVersion = await getRembgVersion();
  const out2 = await waitForResult(await fetchWithRetry(
    'https://api.replicate.com/v1/predictions',
    { method: 'POST', headers: HEADERS, body: JSON.stringify({
      version: rembgVersion, input: { image: imageUrl }
    }) }
  ));
  const bgUrl = Array.isArray(out2) ? out2[0] : String(out2);
  console.log('✅');

  const res = await fetch(bgUrl);
  if (!res.ok) throw new Error(`ダウンロード失敗: ${res.status}`);
  fs.writeFileSync(OUT_FILE, Buffer.from(await res.arrayBuffer()));
  console.log(`🎉  保存完了: ${OUT_FILE}`);
}

main().catch(e => { console.error('致命的エラー:', e.message); process.exit(1); });
