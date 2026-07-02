'use strict';
// 使い方: node scripts/generate_diff_enemies.js
// 難易度ステージ（かんたん／ふつう／むずかしい）の敵3体を生成する。
// 参考写真の特徴（赤いモコモコ／白黒しましま／ハサミの手）を
// ゲームのちびキャラ風にアレンジしたオリジナルデザイン。

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

const OUT_DIR = path.join(__dirname, '..', 'src', 'img');

const STYLE = 'solid flat cel shading, thick crisp clean outlines, no smoke, no fog, no aura, ' +
  'front view full body centered, plain pure white background, anime RPG game character, kawaii';

const CHARS = [
  {
    file: 'enemy_easy.png', // かんたん: 赤いキャラ
    prompt: 'cute chibi kaiju monster, round body completely covered in fluffy red spiky coral-like bumps, ' +
      'small purple-pink friendly face with droopy sleepy eyes and wide flat mouth, ' +
      'white striped chubby legs, tiny white claw hands held in front of chest, ' + STYLE,
  },
  {
    file: 'enemy_normal.png', // ふつう: 白黒のキャラ
    prompt: 'cute chibi alien monster, slim body covered in bold black and white geometric maze stripe pattern, ' +
      'flat pale mask-like face with small dots, big oval pink eyes, black gloved hands raised up, ' +
      STYLE + ' but mysterious',
  },
  {
    file: 'enemy_hard.png', // むずかしい: ハサミを持ったキャラ
    prompt: 'cute chibi space alien monster with two giant silver scissor pincer claws for hands, ' +
      'grey blue armored insect body, large round golden compound eyes, V-shaped head crest, ' +
      'confident grin, ' + STYLE,
  },
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

async function getRembgVersion() {
  const res = await fetch('https://api.replicate.com/v1/models/cjwbw/rembg', {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  if (!res.ok) return 'fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003';
  const data = await res.json();
  return data.latest_version?.id
    || 'fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003';
}

async function processChar(char, rembgVersion) {
  const out1 = await waitForResult(await fetchWithRetry(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    { method: 'POST', headers: HEADERS, body: JSON.stringify({ input: {
      prompt: char.prompt, num_outputs: 1, aspect_ratio: '1:1',
      output_format: 'png', output_quality: 100,
    } }) }
  ));
  const imageUrl = Array.isArray(out1) ? out1[0] : String(out1);

  const out2 = await waitForResult(await fetchWithRetry(
    'https://api.replicate.com/v1/predictions',
    { method: 'POST', headers: HEADERS, body: JSON.stringify({
      version: rembgVersion, input: { image: imageUrl }
    }) }
  ));
  const bgUrl = Array.isArray(out2) ? out2[0] : String(out2);

  const res = await fetch(bgUrl);
  if (!res.ok) throw new Error(`ダウンロード失敗: ${res.status}`);
  fs.writeFileSync(path.join(OUT_DIR, char.file), Buffer.from(await res.arrayBuffer()));
}

async function main() {
  console.log(`🔑  APIキー: ${API_KEY.slice(0, 6)}...${API_KEY.slice(-4)}`);
  process.stdout.write('rembg バージョン取得中... ');
  const rembgVersion = await getRembgVersion();
  console.log('OK\n');

  for (let i = 0; i < CHARS.length; i++) {
    process.stdout.write(`[${i + 1}/${CHARS.length}] ${CHARS[i].file.padEnd(18)} 生成中... `);
    try {
      await processChar(CHARS[i], rembgVersion);
      console.log('✅ 完了');
    } catch (e) {
      console.log(`❌ エラー: ${e.message}`);
    }
    if (i < CHARS.length - 1) await new Promise(r => setTimeout(r, 13000));
  }
  console.log('\n🎉  難易度ステージの敵 生成完了！');
}

main().catch(e => { console.error('致命的エラー:', e.message); process.exit(1); });
