'use strict';
// 使い方: node scripts/generate_characters.js
// ※ プロジェクトルートの .env に REPLICATE_API_TOKEN=r8_xxx を書いておく

const fs   = require('fs');
const path = require('path');

// .env 読み込み（dotenv 不要の軽量版）
function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.trim().match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}
loadEnv(path.join(__dirname, '..', '.env'));

// REPLICATE_API_TOKEN / REPLICATE_API_KEY どちらでも可
const API_KEY = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
if (!API_KEY) {
  console.error('❌  .env に REPLICATE_API_TOKEN=r8_xxx を設定してください');
  process.exit(1);
}

const OUT_DIR = path.join(__dirname, '..', 'src', 'img');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ──────────────────────────────────────────────────
// キャラクター定義（Flux Schnell 用プロンプト）
// ──────────────────────────────────────────────────
const CHARS = [
  {
    file: 'hero.png',
    prompt: 'tokusatsu ultraman superhero, silver metallic armor with bold red V stripe on chest, glowing orange compound eyes, blue crystal gem on chest, powerful standing pose front view full body centered, pure white background, clean anime illustration, children game character',
  },
  {
    file: 'enemy_1.png',
    prompt: 'cute chibi green slime monster, round jelly blob body, big adorable eyes, tiny horns, cheerful smiling, front view full body centered, pure white background, anime RPG game character, kawaii style',
  },
  {
    file: 'enemy_2.png',
    prompt: 'cute chibi purple vampire bat monster, large spreading wings, glowing yellow eyes, small fangs, pointed ears, sinister smile, front view full body centered, pure white background, anime RPG game character, kawaii',
  },
  {
    file: 'enemy_3.png',
    prompt: 'cute chibi orange spider monster, round fuzzy body, eight eyes, eight legs, orange and brown colors, front view full body centered, pure white background, anime RPG game character, kawaii creepy cute',
  },
  {
    file: 'enemy_4.png',
    prompt: 'cute chibi skeleton warrior, white glowing bones, glowing blue eye sockets, gap tooth grin, holding small sword, front view full body centered, pure white background, anime RPG game character, kawaii spooky',
  },
  {
    file: 'enemy_5.png',
    prompt: 'cute chibi red dragon, crimson scales, small bat wings, two horns, breathing small orange flame, fierce but cute, front view full body centered, pure white background, anime RPG game character, kawaii dragon',
  },
  {
    file: 'enemy_6.png',
    prompt: 'cute chibi robot monster, boxy blue metallic body, glowing red LED eyes, antennas, cyan circular chest reactor, robotic limbs, front view full body centered, pure white background, anime RPG game character, cyberpunk kawaii',
  },
  {
    file: 'enemy_7.png',
    prompt: 'cute chibi dark wizard, flowing purple robe, tall pointy hat, magical staff with glowing orb, sinister smile, sparkles, front view full body centered, pure white background, anime RPG game character, kawaii warlock',
  },
  {
    file: 'enemy_8.png',
    prompt: 'cute chibi stone golem, massive cracked boulder body, glowing red eyes, giant rock fists, cracks with orange inner glow, front view full body centered, pure white background, anime RPG game character, kawaii golem',
  },
  {
    file: 'enemy_9.png',
    prompt: 'powerful demon lord boss, large dark wings spread wide, multiple curved black horns, burning golden eyes, dark obsidian armor with gold trim, surrounded by hellfire aura, epic menacing pose front view full body, pure white background, anime RPG boss art',
  },
];

const HEADERS = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'wait=60',
};

// ──────────────────────────────────────────────────
// Replicate API ヘルパー
// ──────────────────────────────────────────────────

// 429 対応: 指数バックオフ付き fetch
async function fetchWithRetry(url, options, maxRetries = 6) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    const wait = (i + 1) * 12000; // 12s → 24s → 36s ...
    process.stdout.write(`\n    ⏳ レート制限中 ${wait / 1000}秒待機... `);
    await new Promise(r => setTimeout(r, wait));
  }
  throw new Error('レート制限リトライ超過');
}

// 公式モデルエンドポイント（flux-schnell など）
async function runOfficialModel(modelPath, input) {
  const res = await fetchWithRetry(
    `https://api.replicate.com/v1/models/${modelPath}/predictions`,
    { method: 'POST', headers: HEADERS, body: JSON.stringify({ input }) }
  );
  return waitForResult(res);
}

// バージョン指定エンドポイント（rembg など）
async function runVersionedModel(version, input) {
  const res = await fetchWithRetry(
    'https://api.replicate.com/v1/predictions',
    { method: 'POST', headers: HEADERS, body: JSON.stringify({ version, input }) }
  );
  return waitForResult(res);
}

async function waitForResult(res) {
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  let data = await res.json();

  // Prefer: wait=60 で返ってきた場合
  if (data.status === 'succeeded') return data.output;
  if (data.status === 'failed')    throw new Error(data.error || '不明なエラー');

  // タイムアウトした場合はポーリング
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

async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ダウンロード失敗: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ──────────────────────────────────────────────────
// rembg の最新バージョンを取得
// ──────────────────────────────────────────────────
async function getRembgVersion() {
  const res = await fetch('https://api.replicate.com/v1/models/cjwbw/rembg', {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  if (!res.ok) {
    // フォールバック: 既知の安定バージョン
    return 'fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003';
  }
  const data = await res.json();
  return data.latest_version?.id
    || 'fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003';
}

// ──────────────────────────────────────────────────
// 1キャラクター処理
// ──────────────────────────────────────────────────
async function processChar(char, rembgVersion) {
  // Step 1: Flux Schnell で画像生成
  const output1 = await runOfficialModel('black-forest-labs/flux-schnell', {
    prompt:         char.prompt,
    num_outputs:    1,
    aspect_ratio:   '1:1',
    output_format:  'png',
    output_quality: 100,
  });
  const imageUrl = Array.isArray(output1) ? output1[0] : String(output1);

  // Step 2: 背景除去
  const output2 = await runVersionedModel(rembgVersion, { image: imageUrl });
  const bgUrl   = Array.isArray(output2) ? output2[0] : String(output2);

  // Step 3: 保存
  const buffer = await downloadFile(bgUrl);
  fs.writeFileSync(path.join(OUT_DIR, char.file), buffer);
}

// ──────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────
async function main() {
  // ── 起動前チェック ──
  const envPath = path.join(__dirname, '..', '.env');
  console.log(`\n📄  .env 読込: ${envPath}`);
  console.log(`🔑  APIキー  : ${API_KEY.slice(0, 6)}...${API_KEY.slice(-4)}`);

  // アカウント情報を確認
  process.stdout.write('👤  アカウント確認中... ');
  const acctRes = await fetch('https://api.replicate.com/v1/account', {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  if (!acctRes.ok) {
    console.log(`❌ 認証失敗 (${acctRes.status}) — APIキーが正しいか確認してください`);
    process.exit(1);
  }
  const acct = await acctRes.json();
  console.log(`✅ ユーザー名: ${acct.username} / タイプ: ${acct.type}`);

  console.log(`\n🎨  ${CHARS.length} 体のキャラクター画像を生成します`);
  console.log(`    出力先: ${OUT_DIR}\n`);

  process.stdout.write('  rembg バージョン取得中... ');
  const rembgVersion = await getRembgVersion();
  console.log(`OK (${rembgVersion.slice(0, 8)}...)\n`);

  for (let i = 0; i < CHARS.length; i++) {
    const char = CHARS[i];
    process.stdout.write(`[${i + 1}/${CHARS.length}] ${char.file.padEnd(14)} 生成中... `);

    try {
      await processChar(char, rembgVersion);
      console.log('✅ 完了');
    } catch (e) {
      console.log(`❌ エラー: ${e.message}`);
    }

    // レート制限対策（6req/min = 10秒/req、2req×12秒 = 24秒余裕を持って待機）
    if (i < CHARS.length - 1) await new Promise(r => setTimeout(r, 13000));
  }

  console.log('\n🎉  全キャラクター生成完了！');
  console.log('    ブラウザでゲームを開くと自動的に AI 画像が使用されます。\n');
}

main().catch(e => { console.error('致命的エラー:', e.message); process.exit(1); });
