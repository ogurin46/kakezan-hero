'use strict';

const $ = id => document.getElementById(id);

// ─── ヒーローデータ (10種) ───
const HEROES = [
  { id:0, name:'タイガ',       col:'#f0f0f0', acc:'#ef4444', emoji:'⚡', desc:'スピードタイプ！'   },
  { id:1, name:'ゼット',       col:'#60a5fa', acc:'#c0c0c0', emoji:'💙', desc:'コスモスタイプ！'  },
  { id:2, name:'ジード',       col:'#fbbf24', acc:'#1f2937', emoji:'✨', desc:'ダークネスタイプ！' },
  { id:3, name:'オーブ',       col:'#a78bfa', acc:'#c084fc', emoji:'💜', desc:'マジックタイプ！'  },
  { id:4, name:'グリード',     col:'#34d399', acc:'#e2e8f0', emoji:'💚', desc:'ネイチャータイプ！' },
  { id:5, name:'トリガー',     col:'#f97316', acc:'#fbbf24', emoji:'🔥', desc:'パワータイプ！'    },
  { id:6, name:'デッカー',     col:'#ef4444', acc:'#1f2937', emoji:'🔴', desc:'フレイムタイプ！'  },
  { id:7, name:'ブレーザー',   col:'#38bdf8', acc:'#e2e8f0', emoji:'🌊', desc:'ブレイブタイプ！'  },
  { id:8, name:'アーク',       col:'#f472b6', acc:'#fde68a', emoji:'🌸', desc:'ロゼタイプ！'      },
  { id:9, name:'ウルトラマン', col:'#3b82f6', acc:'#c0c0c0', emoji:'⭐', desc:'アルティメット！'  },
];

// ─── キャラクター画像プリロード ───
const CHAR_IMGS = {};
function preloadImages(onDone) {
  const files = Object.fromEntries(
    Array.from({length:9}, (_,i) => [`enemy_${i+1}`, `img/enemy_${i+1}.png`])
  );
  let rem = Object.keys(files).length;
  Object.entries(files).forEach(([key, src]) => {
    const img = new Image();
    img.src = src;
    const done = () => { if (img.naturalWidth > 0) CHAR_IMGS[key] = img; if (--rem === 0) onDone(); };
    img.onload = done; img.onerror = done;
  });
}

// ─── けいさんモード ───
const MODES = {
  kake:  { tab:'✖️ かけざん', sym: n => `×${n}`, gsym:'×'   },
  tashi: { tab:'➕ たしざん', sym: n => `＋${n}`, gsym:'＋'  },
  hiki:  { tab:'➖ ひきざん', sym: n => `−${n}`, gsym:'−'   },
  mix:   { tab:'🎲 ミックス', sym: () => 'MIX',  gsym:'MIX' },
};
let curMode = 'kake';

// ─── 数字ミックスの難易度ステージ（ステージ番号 9/10/11） ───
const DIFFS = [
  { key:'easy',   label:'かんたん',   maxHp:6,  emoji:'🌱' },
  { key:'normal', label:'ふつう',     maxHp:9,  emoji:'🌟' },
  { key:'hard',   label:'むずかしい', maxHp:13, emoji:'🔥' },
];
const isDiffStage = stage => stage >= 9;

function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }

// 現在のステージの敵（難易度ステージはランダムに選ばれた敵）
function currentEnemy() {
  return isDiffStage(G.stage) ? G.diffEnemy : ENEMIES[G.stage];
}

// ─── XP / レベル ───
const XP_TABLE   = [0, 100, 250, 500, 900, 1400, 2000, 2700, 3500, 4400];
const ATK_UNLOCK = ['beam','punch','slash','bomb','ultra'];
const ATK_NAMES  = { beam:'ビーム！', punch:'ストレート！', slash:'スラッシュ！', bomb:'エネルギー弾！', ultra:'ウルトラ必殺技！', ultra_max:'✨ MAX 必殺技！！' };
// コンボで強い技が出るほど大ダメージ（コンボの意味を持たせる）
const ATK_DMG    = { beam:1, punch:1, slash:2, bomb:2, ultra:3, ultra_max:4 };

function getLevel(xp) {
  let lv = 1;
  XP_TABLE.forEach((v,i) => { if (xp >= v) lv = i + 1; });
  return lv;
}
function xpProgress(xp) {
  const lv = getLevel(xp);
  const lo = XP_TABLE[lv-1] || 0;
  const hi = XP_TABLE[lv] || XP_TABLE[XP_TABLE.length-1] + 500;
  return Math.min(1, (xp - lo) / (hi - lo));
}
function getAvailableAttacks() {
  return ATK_UNLOCK.slice(0, Math.min(getLevel(SAVE.totalXp), 5));
}

// コンボに応じて技が強くなる
function selectHeroAttack() {
  const avail = getAvailableAttacks();
  const cb    = G.combo;

  if (cb >= 7 && avail.includes('ultra')) return 'ultra_max'; // MAX必殺技
  if (cb >= 5 && avail.includes('ultra')) return 'ultra';
  if (cb >= 4 && avail.includes('bomb'))  return 'bomb';
  if (cb >= 3 && avail.includes('bomb') && Math.random() < 0.65) return 'bomb';
  if (cb >= 2 && avail.includes('slash')) return Math.random() < 0.6 ? 'slash' : avail[Math.floor(Math.random()*Math.max(1,avail.indexOf('slash')))];
  if (cb >= 1 && avail.includes('punch')) return Math.random() < 0.5 ? 'punch' : 'beam';
  return 'beam';
}

// ─── セーブデータ（3スロット） ───
const SAVES_KEY = 'kakezan_saves_v2';
let SAVES = [null, null, null];
let SAVE_IDX = 0;
let SAVE = { name:'', heroId:0, totalXp:0, medals:{} };

// 旧メダル形式（ステージ番号→星の数）→ 新形式（"モード+ステージ"→1）へ移行。
// 旧仕様の星3（ノーミス）だけを かけざんメダルとして引き継ぐ
function migrateMedals(s) {
  if (!s || !s.medals) return s;
  for (const k of Object.keys(s.medals)) {
    if (/^\d+$/.test(k)) {
      if (s.medals[k] >= 3) s.medals['kake' + k] = 1;
      delete s.medals[k];
    }
  }
  return s;
}
function medalCount(s) {
  return Object.values((s && s.medals) || {}).filter(Boolean).length;
}

function loadSaves() {
  try {
    return (JSON.parse(localStorage.getItem(SAVES_KEY)) || [null, null, null]).map(migrateMedals);
  }
  catch { return [null, null, null]; }
}
function writeSaves() { localStorage.setItem(SAVES_KEY, JSON.stringify(SAVES)); }
function writeSave() { SAVES[SAVE_IDX] = SAVE; writeSaves(); }
function deleteSaveSlot(idx) {
  SAVES[idx] = null;
  writeSaves();
  renderSaveSlots();
}

function updateXpBar() {
  const lv  = getLevel(SAVE.totalXp);
  const pct = xpProgress(SAVE.totalXp) * 100;
  const bar = $('xp-bar'), lbl = $('lv-label');
  if (bar) bar.style.width = `${pct}%`;
  if (lbl) lbl.textContent = `LV.${lv}`;
}

// ─── 敵データ ───
const ENEMIES = [
  { name:'プチスライム', mult:1, maxHp:5,  color:'#4ade80', emoji:'🟢', atk:'rush',       dmg:1 },
  { name:'バットマン',   mult:2, maxHp:6,  color:'#a78bfa', emoji:'🦇', atk:'projectile', dmg:1 },
  { name:'クモッチ',     mult:3, maxHp:7,  color:'#d97706', emoji:'🕷️', atk:'rush',       dmg:1 },
  { name:'ドクロン',     mult:4, maxHp:8,  color:'#e2e8f0', emoji:'💀', atk:'projectile', dmg:2 },
  { name:'ドラゴニア',   mult:5, maxHp:9,  color:'#f87171', emoji:'🐲', atk:'projectile', dmg:2 },
  { name:'サイバーゴン',  mult:6, maxHp:10, color:'#38bdf8', emoji:'🤖', atk:'projectile', dmg:2 },
  { name:'ダークマジン',  mult:7, maxHp:12, color:'#c084fc', emoji:'🧙', atk:'magic',      dmg:2 },
  { name:'ゴーレマン',    mult:8, maxHp:14, color:'#a8a29e', emoji:'🗿', atk:'rush',       dmg:3 },
  { name:'魔王ザグロス',  mult:9, maxHp:18, color:'#ff4500', emoji:'👹', atk:'magic',      dmg:3 },
];

// ─── ゲーム状態 ───
let G = {
  mode:'kake',
  stage:0, heroHp:5, heroMaxHp:5,
  enemyHp:0, enemyMaxHp:0,
  score:0, combo:0, bestCombo:0,
  totalCorrect:0, totalWrong:0, stageWrong:0,
  question:null,
  animState:'idle', animT:0,
  heroX:0, heroY:0, enemyX:0, enemyY:0,
  locked:false,
  heroAttackType:'beam',
  questionFlash:0,
};

let rafId = null, cv, ctx;

// ─── アニメーション長 ───
function getAnimDur(state) {
  const hd = { beam:22, punch:24, slash:30, bomb:32, ultra:40, ultra_max:55 };
  const ed = { rush:22, projectile:28, magic:32 };
  if (state === 'heroAttack')  return hd[G.heroAttackType] || 22;
  if (state === 'enemyAttack') return ed[currentEnemy()?.atk || 'rush'] || 22;
  if (state === 'enemyHit')  return 20;
  if (state === 'heroHit')   return 18;
  if (state === 'enemyDead') return 42;
  return 999;
}

// ─── 画面管理 ───
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  $(id).classList.remove('hidden');
}

// ─── タイトル ───
function initTitle() {
  SAVES = loadSaves();
  showScreen('screen-title');
  spawnTitleStars('title-stars');
  BGM.play('title');
  const scr = $('screen-title');
  scr.addEventListener('click', showSaveSelect, { once: true });
}

// ─── セーブ選択 ───
function showSaveSelect() {
  SAVES = loadSaves();
  showScreen('screen-save-select');
  spawnTitleStars('save-stars');
  renderSaveSlots();
}

// 名前に < > " 等が入っても表示が壊れないようにエスケープ
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

function renderSaveSlots() {
  const el = $('save-slots');
  el.innerHTML = '';
  SAVES = loadSaves();
  for (let i = 0; i < 3; i++) {
    const s = SAVES[i];
    const div = document.createElement('div');
    if (s) {
      const lv   = getLevel(s.totalXp || 0);
      const hero = HEROES[s.heroId || 0];
      const hid  = s.heroId || 0;
      const col  = hid % 5;
      const row  = Math.floor(hid / 5);
      // hero選択.png スプライト: 5列2行
      const bpx  = col * 25; // 0,25,50,75,100 (%)
      const bpy  = row * 100; // 0 or 100 (%)
      div.className = 'save-slot save-slot--used';
      div.innerHTML = `
        <div class="save-hero-face" onclick="loadSaveSlot(${i})"
             style="background-image:url('${HERO_SEL_URL}');background-position:${bpx}% ${bpy}%"></div>
        <div class="save-slot-info" onclick="loadSaveSlot(${i})">
          <span class="save-slot-num">No.${i+1}</span>
          <span class="save-name">${escapeHtml(s.name)}</span>
          <span class="save-stats">${hero ? hero.emoji + ' ' : ''}LV.${lv} ／ 🏅×${medalCount(s)}</span>
        </div>
        <button class="save-delete-btn" onclick="event.stopPropagation();confirmDeleteSave(${i})">🗑 けす</button>
      `;
    } else {
      div.className = 'save-slot save-slot--empty';
      div.innerHTML = `
        <div class="save-slot-new" onclick="newSaveSlot(${i})">
          <span class="save-slot-num">No.${i+1}</span>
          <span>＋ あたらしくはじめる</span>
        </div>
      `;
    }
    el.appendChild(div);
  }
}

function loadSaveSlot(idx) {
  SAVE_IDX = idx;
  SAVE = SAVES[idx];
  if (!SAVE.medals) SAVE.medals = {};
  showHome();
}

function newSaveSlot(idx) {
  SAVE_IDX = idx;
  SAVE = { name:'', heroId:0, totalXp:0, medals:{} };
  showNameInput();
}

function confirmDeleteSave(idx) {
  if (confirm(`No.${idx+1} のセーブデータを けしますか？`)) {
    deleteSaveSlot(idx);
  }
}

// ─── 名前入力 ───
function showNameInput() {
  showScreen('screen-name-input');
  spawnTitleStars('name-stars');
  const inp = $('player-name-input');
  inp.value = '';
  setTimeout(() => inp.focus(), 100);
}

function confirmName() {
  const name = $('player-name-input').value.trim();
  if (!name) return;
  SAVE.name = name;
  showHeroSelect(true);
}

// ─── ヒーロー選択 ───
let _selectedHeroId = 0;

function showHeroSelect(isNew) {
  _selectedHeroId = SAVE.heroId || 0;
  showScreen('screen-hero-select');
  spawnTitleStars('hero-sel-stars');
  buildHeroSelectOverlay();
  updateHeroSelectName();
}

function buildHeroSelectOverlay() {
  const overlay = $('hero-select-overlay');
  overlay.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const row = Math.floor(i / 5);
    const col = i % 5;
    const div = document.createElement('div');
    div.className = 'hero-cell' + (i === _selectedHeroId ? ' selected' : '');
    div.style.cssText = `left:${col*20}%;top:${row*50}%;width:20%;height:50%;`;
    div.dataset.hero = i;
    div.addEventListener('click', () => selectHeroCell(i));
    overlay.appendChild(div);
  }
}

function selectHeroCell(id) {
  _selectedHeroId = id;
  document.querySelectorAll('.hero-cell').forEach(c =>
    c.classList.toggle('selected', +c.dataset.hero === id)
  );
  updateHeroSelectName();
}

function updateHeroSelectName() {
  const h = HEROES[_selectedHeroId];
  const el = $('hero-select-name');
  if (el && h) el.textContent = `${h.emoji} ${h.desc}`;
}

function confirmHeroSelect() {
  SAVE.heroId = _selectedHeroId;
  writeSave();
  showHome();
}

// ─── ホーム（モード＆ステージ選択） ───
function showHome() {
  showScreen('screen-home');
  spawnTitleStars('home-stars');
  BGM.play('title');
  $('home-player-info').textContent = `${SAVE.name}　LV.${getLevel(SAVE.totalXp)}　🏅×${medalCount(SAVE)}`;
  renderModeTabs();
  renderStageGrid();
}

function renderModeTabs() {
  document.querySelectorAll('.mode-tab').forEach(b =>
    b.classList.toggle('selected', b.dataset.mode === curMode)
  );
}

function renderStageGrid() {
  const grid = $('stage-grid');
  grid.innerHTML = '';
  ENEMIES.forEach((en, i) => {
    const btn = document.createElement('button');
    btn.className = 'stage-btn';
    const medal = SAVE.medals[`${curMode}${i}`] ? '🏅' : '';
    btn.innerHTML = `
      <span class="stage-emoji">${en.emoji}</span>
      <span class="stage-num">ST.${i+1} ${MODES[curMode].sym(en.mult)}</span>
      <span class="stage-medal">${medal}</span>`;
    btn.addEventListener('click', () => startGame(i));
    grid.appendChild(btn);
  });
  // 数字ミックスの難易度ステージ（かんたん／ふつう／むずかしい）
  DIFFS.forEach((d, di) => {
    const i = 9 + di;
    const btn = document.createElement('button');
    btn.className = 'stage-btn stage-btn--diff';
    const medal = SAVE.medals[`${curMode}${i}`] ? '🏅' : '';
    btn.innerHTML = `
      <span class="stage-emoji">${d.emoji}</span>
      <span class="stage-num">${d.label}</span>
      <span class="stage-medal">${medal}</span>`;
    btn.addEventListener('click', () => startGame(i));
    grid.appendChild(btn);
  });
}

function spawnTitleStars(containerId = 'title-stars') {
  const wrap = $(containerId);
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < 60; i++) {
    const d = document.createElement('div');
    const sz = Math.random() * 2.5 + 0.5;
    d.style.cssText = `position:absolute;border-radius:50%;width:${sz}px;height:${sz}px;background:#fff;opacity:${Math.random()*0.7+0.2};left:${Math.random()*100}%;top:${Math.random()*100}%;animation:starTwinkle ${Math.random()*3+2}s ${Math.random()*2}s ease-in-out infinite alternate;`;
    wrap.appendChild(d);
  }
  if (!document.querySelector('#star-style')) {
    const st = document.createElement('style');
    st.id = 'star-style';
    st.textContent = '@keyframes starTwinkle{from{opacity:0.1}to{opacity:0.9}}';
    document.head.appendChild(st);
  }
}

// ─── 敵描画 ───
function drawEnemy(c, x, y, enemy, flash = 0, shakeX = 0, deadProgress = 0, scale = 1) {
  c.save(); c.translate(x + shakeX, y);
  const deathScale = deadProgress > 0 ? (1 + deadProgress * 0.5) : 1;
  if (deadProgress > 0) c.globalAlpha = 1 - deadProgress;
  if (flash > 0) c.globalAlpha = Math.min(1, (1 - flash) * 2);
  c.scale(scale * deathScale, scale * deathScale);

  const img = CHAR_IMGS[`enemy_${enemy.mult}`];
  if (img) {
    const h = cv ? cv.height * (0.40 + enemy.mult * 0.018) : 100;
    c.drawImage(img, -h/2, -h, h, h);
  } else {
    ENEMY_DRAW[enemy.mult](c, enemy, flash);
  }
  c.restore();
  if (deadProgress > 0 && deadProgress < 1) drawExplosion(c, x, y, deadProgress, enemy.color);
}

function drawExplosion(c, x, y, t, color) {
  for (let i = 0; i < 12; i++) {
    const a = (i/12)*Math.PI*2, dist = t*60;
    c.save(); c.globalAlpha = (1-t)*0.9;
    c.fillStyle = t < 0.3 ? '#fff' : (t < 0.6 ? '#fde68a' : color);
    c.shadowColor = color; c.shadowBlur = 15;
    c.beginPath(); c.arc(x+Math.cos(a)*dist, y+Math.sin(a)*dist, (1-t)*8, 0, Math.PI*2); c.fill();
    c.restore();
  }
}

// Canvas fallback 敵描画
const ENEMY_DRAW = {
  1:(c,en,fl)=>{const col=fl>0?'#ff9999':'#4ade80';c.fillStyle=col;c.shadowColor='#4ade80';c.shadowBlur=20;c.beginPath();c.ellipse(0,5,38,32,0,0,Math.PI*2);c.fill();c.shadowBlur=0;c.fillStyle='#052e16';c.beginPath();c.ellipse(-12,-4,8,10,0,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(12,-4,8,10,0,0,Math.PI*2);c.fill();c.fillStyle='#fff';c.beginPath();c.ellipse(-10,-8,3,4,0,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(14,-8,3,4,0,0,Math.PI*2);c.fill();c.strokeStyle='#052e16';c.lineWidth=3;c.beginPath();c.arc(0,8,14,0.2,Math.PI-0.2);c.stroke();c.fillStyle=fl>0?'#ffaaaa':'#22c55e';c.beginPath();c.moveTo(-10,-32);c.lineTo(-16,-20);c.lineTo(-4,-20);c.closePath();c.fill();c.beginPath();c.moveTo(10,-32);c.lineTo(4,-20);c.lineTo(16,-20);c.closePath();c.fill();},
  2:(c,en,fl)=>{const col=fl>0?'#ffaaff':'#a78bfa';c.fillStyle=fl>0?'#ffccff':'#7c3aed';c.beginPath();c.moveTo(0,0);c.bezierCurveTo(-20,-20,-55,-10,-60,10);c.bezierCurveTo(-55,25,-30,20,-10,10);c.closePath();c.fill();c.beginPath();c.moveTo(0,0);c.bezierCurveTo(20,-20,55,-10,60,10);c.bezierCurveTo(55,25,30,20,10,10);c.closePath();c.fill();c.fillStyle=col;c.shadowColor='#a78bfa';c.shadowBlur=15;c.beginPath();c.ellipse(0,8,20,24,0,0,Math.PI*2);c.fill();c.shadowBlur=0;c.fillStyle='#fde68a';c.beginPath();c.ellipse(-7,0,6,7,0,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(7,0,6,7,0,0,Math.PI*2);c.fill();c.fillStyle='#1a0030';c.beginPath();c.ellipse(-7,1,3,4,0,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(7,1,3,4,0,0,Math.PI*2);c.fill();},
  3:(c,en,fl)=>{c.strokeStyle=fl>0?'#ffeeaa':'#92400e';c.lineWidth=4;c.lineCap='round';[-140,-120,-100,-80,80,100,120,140].forEach((a,i)=>{const rad=a*Math.PI/180,mx=Math.cos(rad)*28,my=Math.sin(rad)*20,ex=mx+Math.cos(rad+(i<4?-0.6:0.6))*24,ey=my+Math.sin(rad+(i<4?-0.6:0.6))*24;c.beginPath();c.moveTo(0,0);c.lineTo(mx,my);c.lineTo(ex,ey);c.stroke();});c.fillStyle=fl>0?'#ffddaa':'#78350f';c.shadowColor='#d97706';c.shadowBlur=12;c.beginPath();c.ellipse(0,20,22,26,0,0,Math.PI*2);c.fill();c.fillStyle=fl>0?'#ffcc88':'#d97706';c.beginPath();c.ellipse(0,22,10,12,0,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(0,-8,18,16,0,0,Math.PI*2);c.fill();c.shadowBlur=0;c.fillStyle='#fde68a';[-12,-6,0,6].forEach(ex=>{c.beginPath();c.ellipse(ex,-10,4,4,0,0,Math.PI*2);c.fill();});},
  4:(c,en,fl)=>{c.fillStyle=fl>0?'#ffcccc':'#cbd5e1';c.fillRect(-10,4,20,30);c.fillRect(-22,14,44,8);c.fillRect(-6,34,8,20);c.fillRect(8,34,8,20);c.fillStyle=fl>0?'#ffeeee':'#e2e8f0';c.shadowColor=fl>0?'#ff4444':'#94a3b8';c.shadowBlur=15;c.beginPath();c.ellipse(0,-12,26,28,0,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(0,10,18,10,0,0,Math.PI*2);c.fill();c.shadowBlur=0;c.fillStyle=fl>0?'#ff0000':'#1e293b';c.beginPath();c.ellipse(-10,-12,8,10,0,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(10,-12,8,10,0,0,Math.PI*2);c.fill();c.fillStyle=fl>0?'#ff8888':'#3b82f6';c.beginPath();c.ellipse(-10,-12,4,5,0,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(10,-12,4,5,0,0,Math.PI*2);c.fill();},
  5:(c,en,fl)=>{c.strokeStyle=fl>0?'#ffcccc':'#dc2626';c.lineWidth=12;c.lineCap='round';c.beginPath();c.moveTo(30,20);c.bezierCurveTo(55,30,70,10,60,-10);c.stroke();c.fillStyle=fl>0?'#ff9999':'#b91c1c';c.beginPath();c.moveTo(-10,-15);c.bezierCurveTo(-30,-40,-60,-30,-55,-10);c.bezierCurveTo(-50,5,-20,0,-5,5);c.closePath();c.fill();const col=fl>0?'#ffaaaa':'#f87171';c.fillStyle=col;c.shadowColor='#ef4444';c.shadowBlur=20;c.beginPath();c.ellipse(-5,15,30,22,-0.2,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(-20,-15,14,10,-0.5,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(-32,-30,18,13,-0.3,0,Math.PI*2);c.fill();c.shadowBlur=0;c.fillStyle='#fde68a';c.beginPath();c.ellipse(-28,-34,6,7,-0.3,0,Math.PI*2);c.fill();},
  6:(c,en,fl)=>{const col=fl>0?'#aaddff':'#38bdf8';c.strokeStyle=fl>0?'#aaddff':'#0284c7';c.lineWidth=3;c.beginPath();c.moveTo(-8,-46);c.lineTo(-8,-58);c.stroke();c.beginPath();c.moveTo(8,-46);c.lineTo(8,-58);c.stroke();c.fillStyle='#ef4444';c.beginPath();c.arc(-8,-60,4,0,Math.PI*2);c.fill();c.beginPath();c.arc(8,-60,4,0,Math.PI*2);c.fill();c.fillStyle=col;c.shadowColor=col;c.shadowBlur=15;c.fillRect(-22,-46,44,28);c.shadowColor='#ef4444';c.shadowBlur=10;c.fillStyle=fl>0?'#ff8888':'#ef4444';c.fillRect(-16,-38,10,8);c.fillRect(6,-38,10,8);c.shadowBlur=0;c.fillStyle='#0f172a';c.fillRect(-14,-24,28,6);c.fillStyle='#22d3ee';for(let i=0;i<5;i++)c.fillRect(-12+i*6,-23,4,4);c.fillStyle='#0ea5e9';c.fillRect(-8,-18,16,6);c.fillStyle=col;c.shadowColor=col;c.shadowBlur=8;c.fillRect(-28,-12,56,42);c.shadowBlur=0;c.fillStyle='#fff';c.beginPath();c.arc(0,8,10,0,Math.PI*2);c.fill();c.fillStyle=col;c.beginPath();c.arc(0,8,6,0,Math.PI*2);c.fill();c.fillStyle='#0ea5e9';c.fillRect(-44,-8,14,34);c.fillRect(30,-8,14,34);c.fillStyle=col;c.fillRect(-22,30,16,22);c.fillRect(6,30,16,22);},
  7:(c,en,fl)=>{const col=fl>0?'#e8aaff':'#c084fc';c.fillStyle=fl>0?'#cc88ff':'#581c87';c.beginPath();c.moveTo(-30,-20);c.bezierCurveTo(-50,10,-45,40,-30,50);c.lineTo(30,50);c.bezierCurveTo(45,40,50,10,30,-20);c.closePath();c.fill();c.fillStyle=fl>0?'#dd99ff':'#7e22ce';c.shadowColor='#a855f7';c.shadowBlur=18;c.beginPath();c.ellipse(0,12,20,28,0,0,Math.PI*2);c.fill();c.shadowBlur=0;c.fillStyle=col;c.beginPath();c.ellipse(0,-22,18,20,0,0,Math.PI*2);c.fill();c.fillStyle=fl>0?'#cc88ff':'#4c1d95';c.beginPath();c.moveTo(-24,-32);c.lineTo(24,-32);c.lineTo(10,-32);c.lineTo(4,-62);c.lineTo(-4,-62);c.lineTo(-10,-32);c.closePath();c.fill();c.fillRect(-26,-38,52,8);c.fillStyle='#fde68a';c.shadowColor='#fde68a';c.shadowBlur=8;c.beginPath();c.ellipse(-8,-22,6,7,0,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(8,-22,6,7,0,0,Math.PI*2);c.fill();c.shadowBlur=0;c.fillStyle='#000';c.beginPath();c.ellipse(-8,-22,3,4,0,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(8,-22,3,4,0,0,Math.PI*2);c.fill();c.strokeStyle='#78350f';c.lineWidth=5;c.lineCap='round';c.beginPath();c.moveTo(22,-10);c.lineTo(40,50);c.stroke();c.fillStyle='#fde68a';c.shadowColor='#fde68a';c.shadowBlur=12;c.beginPath();c.arc(20,-14,8,0,Math.PI*2);c.fill();c.shadowBlur=0;},
  8:(c,en,fl)=>{const col=fl>0?'#ddccbb':'#a8a29e';c.fillStyle=fl>0?'#eeddcc':'#78716c';c.shadowColor='#a8a29e';c.shadowBlur=15;c.beginPath();c.moveTo(-35,40);c.lineTo(-40,0);c.lineTo(-32,-20);c.lineTo(0,-28);c.lineTo(32,-20);c.lineTo(40,0);c.lineTo(35,40);c.closePath();c.fill();c.shadowBlur=0;c.fillStyle=col;c.beginPath();c.ellipse(-52,10,18,28,-0.2,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(52,10,18,28,0.2,0,Math.PI*2);c.fill();c.fillStyle=fl>0?'#eeddcc':'#78716c';c.beginPath();c.arc(-52,40,16,0,Math.PI*2);c.fill();c.beginPath();c.arc(52,40,16,0,Math.PI*2);c.fill();c.fillStyle=col;c.beginPath();c.arc(0,-36,26,0,Math.PI*2);c.fill();c.fillStyle=fl>0?'#ff6666':'#ef4444';c.shadowColor='#ef4444';c.shadowBlur=12;c.beginPath();c.arc(-11,-38,8,0,Math.PI*2);c.fill();c.beginPath();c.arc(11,-38,8,0,Math.PI*2);c.fill();c.shadowBlur=0;c.fillStyle='#fff';c.beginPath();c.arc(-11,-38,4,0,Math.PI*2);c.fill();c.beginPath();c.arc(11,-38,4,0,Math.PI*2);c.fill();},
  9:(c,en,fl)=>{const col=fl>0?'#ff8866':'#ff4500';const grd=c.createRadialGradient(0,0,10,0,0,60);grd.addColorStop(0,fl>0?'rgba(255,100,50,0.3)':'rgba(255,50,0,0.25)');grd.addColorStop(1,'transparent');c.fillStyle=grd;c.beginPath();c.arc(0,0,60,0,Math.PI*2);c.fill();c.fillStyle=fl>0?'#ff9966':'#7f1d1d';c.beginPath();c.moveTo(-5,-10);c.bezierCurveTo(-30,-40,-70,-25,-65,5);c.bezierCurveTo(-60,25,-25,20,-5,10);c.closePath();c.fill();c.beginPath();c.moveTo(5,-10);c.bezierCurveTo(30,-40,70,-25,65,5);c.bezierCurveTo(60,25,25,20,5,10);c.closePath();c.fill();c.fillStyle=col;c.shadowColor='#ff4500';c.shadowBlur=22;c.beginPath();c.ellipse(0,18,28,32,0,0,Math.PI*2);c.fill();c.shadowBlur=0;c.fillStyle=fl>0?'#ff9966':'#dc2626';c.beginPath();c.ellipse(0,-18,28,28,0,0,Math.PI*2);c.fill();c.fillStyle='#7f1d1d';c.beginPath();c.moveTo(-18,-34);c.lineTo(-28,-62);c.lineTo(-8,-36);c.closePath();c.fill();c.beginPath();c.moveTo(18,-34);c.lineTo(28,-62);c.lineTo(8,-36);c.closePath();c.fill();c.fillStyle='#fde68a';c.shadowColor='#fde68a';c.shadowBlur=14;c.beginPath();c.ellipse(-11,-18,9,10,0,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(11,-18,9,10,0,0,Math.PI*2);c.fill();c.shadowBlur=0;},
};

// ─── ヒーロー攻撃エフェクト（3D奥行き：手前→奥への遠近法） ───
// perspScale(t): t=0(手前/hero)→1(奥/enemy) で 1.0→0.2 に縮小
function perspScale(t) { return 1 - t * 0.78; }
// 奥行き位置Y: t=0がhero位置、t=1がenemy位置（非線形=加速感）
function perspY(startY, endY, t) { return startY + (endY - startY) * (t * t * 0.4 + t * 0.6); }

function drawHeroAttackEffect(c) {
  const hero  = HEROES[SAVE.heroId || 0];
  const dur   = getAnimDur('heroAttack');
  const prog  = Math.min(1, G.animT / dur);
  const cx    = cv.width / 2;
  const hcol  = hero.col;
  const acol  = hero.acc;
  const startY = cv.height * 1.02;
  const endY   = G.enemyY - cv.height * 0.35;

  switch (G.heroAttackType) {

    // ── beam / punch: 手前(太)→奥(細)のテーパービーム ──
    case 'beam':
    case 'punch': {
      const alpha = prog < 0.8 ? 1 : (1-prog)/0.2;
      const steps = 28;
      c.save(); c.globalAlpha = alpha;
      // テーパー形状: 台形セグメントを積み重ねる
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i+1) / steps;
        if (t1 > prog) break;
        const y0 = perspY(startY, endY, t0);
        const y1 = perspY(startY, endY, t1);
        const w0 = perspScale(t0) * 44;
        const w1 = perspScale(t1) * 44;
        const a  = 0.5 + 0.5 * (1 - t0);
        c.globalAlpha = alpha * a;
        c.shadowColor = hcol; c.shadowBlur = 28 * perspScale(t0);
        c.fillStyle = hcol;
        c.beginPath();
        c.moveTo(cx-w0, y0); c.lineTo(cx+w0, y0);
        c.lineTo(cx+w1, y1); c.lineTo(cx-w1, y1);
        c.closePath(); c.fill();
        // 白コア
        const wc0 = w0 * 0.38, wc1 = w1 * 0.38;
        c.fillStyle = 'rgba(255,255,255,0.85)'; c.shadowBlur = 0;
        c.beginPath();
        c.moveTo(cx-wc0, y0); c.lineTo(cx+wc0, y0);
        c.lineTo(cx+wc1, y1); c.lineTo(cx-wc1, y1);
        c.closePath(); c.fill();
      }
      // 先端グロー（敵位置）
      if (prog > 0.85) {
        const ip = (prog-0.85)/0.15;
        c.globalAlpha = ip * alpha;
        c.fillStyle = '#fff'; c.shadowColor = hcol; c.shadowBlur = 60;
        c.beginPath(); c.arc(cx, endY, 32 * ip, 0, Math.PI*2); c.fill();
      }
      c.restore();
      break;
    }

    // ── slash: 扇状に広がり奥へ収束 ──
    case 'slash': {
      const slashCount = Math.min(3, 1 + Math.floor(G.combo / 2));
      const alpha = prog < 0.85 ? 1 : (1-prog)/0.15;
      const sy  = perspY(startY, endY, prog * 0.92);
      const ps  = perspScale(prog * 0.9);
      c.save();
      for (let s = 0; s < slashCount; s++) {
        const spread = (s - (slashCount-1)/2) * 50 * ps;
        c.globalAlpha = alpha * (1 - s * 0.28);
        c.strokeStyle = s === 0 ? hcol : acol;
        c.lineWidth   = (16 - s * 3) * ps;
        c.shadowColor = hcol; c.shadowBlur = 36 * ps;
        c.beginPath();
        c.ellipse(cx + spread, sy, 80 * ps, 13 * ps, Math.PI/2 + 0.3, 0, Math.PI);
        c.stroke();
        // 残像
        for (let t = 1; t <= 3; t++) {
          const tprog = Math.max(0, prog * 0.9 - t * 0.08);
          const tsy   = perspY(startY, endY, tprog);
          const tps   = perspScale(tprog * 0.9);
          c.globalAlpha = alpha * (1 - s*0.28) * (1 - t*0.28);
          c.lineWidth   = (12 - s*2 - t) * tps;
          c.beginPath();
          c.ellipse(cx + spread * (tps/ps), tsy, 72*tps, 11*tps, Math.PI/2+0.3, 0, Math.PI);
          c.stroke();
        }
      }
      c.restore();
      break;
    }

    // ── bomb: 手前から奥に飛び、遠近縮小 ──
    case 'bomb': {
      if (prog >= 1) break;
      const by = perspY(startY, endY, prog);
      const ps = perspScale(prog);
      const r  = (28 + G.combo * 2.5) * ps;
      c.save();
      // 軌跡
      for (let i = 1; i <= 6; i++) {
        const tp  = Math.max(0, prog - i * 0.05);
        const tby = perspY(startY, endY, tp);
        const tps = perspScale(tp);
        const tr  = (28 + G.combo * 2.5) * tps;
        c.globalAlpha = (1-i*0.15) * 0.45;
        c.fillStyle = hcol;
        c.beginPath(); c.arc(cx, tby, tr, 0, Math.PI*2); c.fill();
      }
      // 本体（手前ほど大きい球）
      c.globalAlpha = 1;
      c.fillStyle = hcol; c.shadowColor = acol; c.shadowBlur = (44 + G.combo*4) * ps;
      c.beginPath(); c.arc(cx, by, r, 0, Math.PI*2); c.fill();
      // ハイライト（立体感）
      c.fillStyle = '#fff'; c.shadowBlur = 0;
      c.beginPath(); c.arc(cx - r*0.3, by - r*0.3, r*0.32, 0, Math.PI*2); c.fill();
      c.restore();
      break;
    }

    // ── ultra: 奥に向かって巨大な光波が収束 ──
    case 'ultra': {
      const phase = prog < 0.3 ? prog/0.3 : prog < 0.7 ? 1 : (1-prog)/0.3;
      c.save();
      // 画面フラッシュ
      c.fillStyle = `rgba(${hexToRgb(hcol)},${phase * 0.38})`; c.fillRect(0, 0, cv.width, cv.height);
      // 奥に向かって収束するリング列
      const ringBase = 6;
      for (let ri = 0; ri < ringBase; ri++) {
        const tRing = ri / ringBase;
        if (tRing > prog) break;
        const rAlpha = (1 - tRing) * phase * 0.9;
        const rScale = perspScale(tRing);
        const ry     = perspY(startY, endY, tRing);
        const rr     = cv.width * 0.45 * rScale;
        c.globalAlpha = rAlpha;
        c.strokeStyle = ri%2===0 ? '#fff' : hcol;
        c.lineWidth = 6 * rScale; c.shadowColor = hcol; c.shadowBlur = 20;
        c.beginPath(); c.ellipse(cx, ry, rr, rr * 0.22, 0, 0, Math.PI*2); c.stroke();
      }
      // 収束点フラッシュ
      if (prog > 0.7) {
        const ip = (prog-0.7)/0.3;
        const grd = c.createRadialGradient(cx, endY, 0, cx, endY, cv.width*0.5*ip);
        grd.addColorStop(0, `rgba(255,255,255,${phase*0.9})`);
        grd.addColorStop(0.3, `rgba(${hexToRgb(hcol)},${phase*0.5})`);
        grd.addColorStop(1, 'transparent');
        c.globalAlpha = 1; c.fillStyle = grd; c.shadowBlur = 0;
        c.fillRect(0, 0, cv.width, cv.height);
      }
      c.restore();
      break;
    }

    // ── ultra_max: 全画面光爆発＋奥行きリング ──
    case 'ultra_max': {
      const phase = prog < 0.2 ? prog/0.2 : prog < 0.75 ? 1 : (1-prog)/0.25;
      c.save();
      c.fillStyle = `rgba(255,255,255,${phase*0.55})`; c.fillRect(0, 0, cv.width, cv.height);
      c.fillStyle = `rgba(${hexToRgb(hcol)},${phase*0.45})`; c.fillRect(0, 0, cv.width, cv.height);
      const ringCount = Math.min(6, 3 + Math.floor(G.combo / 2));
      for (let ri = 0; ri < ringCount; ri++) {
        const delay = ri * 0.07;
        const rProg = Math.max(0, (prog - delay) / (1 - delay));
        const tRing = rProg * 0.85;
        const ry    = perspY(startY, endY, tRing);
        const rps   = perspScale(tRing);
        const rr    = rProg * cv.width * (0.45 + ri * 0.08) * rps;
        const ra    = Math.max(0, (1 - rProg) * 0.9);
        c.globalAlpha = ra;
        c.strokeStyle = ri%2===0 ? `rgba(255,255,255,${ra})` : `rgba(${hexToRgb(acol)},${ra})`;
        c.lineWidth = (5 - ri*0.6) * rps; c.shadowColor = hcol; c.shadowBlur = 18;
        c.beginPath(); c.ellipse(cx, ry, rr, rr * 0.2, 0, 0, Math.PI*2); c.stroke();
      }
      if (prog > 0.15 && prog < 0.7) {
        const ep = (prog-0.15)/0.55, er = ep * cv.width * 0.18;
        c.globalAlpha = (1-ep)*0.85;
        const egrd = c.createRadialGradient(cx, endY, 0, cx, endY, er);
        egrd.addColorStop(0, '#fff'); egrd.addColorStop(1, hcol+'00');
        c.fillStyle = egrd; c.shadowBlur = 0;
        c.beginPath(); c.arc(cx, endY, er, 0, Math.PI*2); c.fill();
      }
      c.restore();
      break;
    }
  }
}

function hexToRgb(hex) {
  const r = parseInt((hex||'#6060ff').slice(1,3),16)||96;
  const g = parseInt((hex||'#6060ff').slice(3,5),16)||96;
  const b = parseInt((hex||'#6060ff').slice(5,7),16)||255;
  return `${r},${g},${b}`;
}

// ─── 敵攻撃エフェクト（縦方向: 上→下） ───
function drawEnemyAttackEffect(c) {
  const enemy  = currentEnemy();
  const dur    = getAnimDur('enemyAttack');
  const prog   = Math.min(1, G.animT / dur);
  const cx     = cv.width / 2;
  const startY = G.enemyY - cv.height * 0.35;
  const endY   = cv.height * 1.02;

  switch (enemy.atk) {
    case 'rush':
      // rush は drawBattle の enemyOffY で敵自体が動く。追加エフェクトなし
      break;

    case 'projectile': {
      if (prog >= 1) break;
      const py = startY + prog * (endY - startY);
      c.save();
      c.fillStyle = enemy.color; c.shadowColor = enemy.color; c.shadowBlur = 22;
      c.beginPath(); c.arc(cx, py, 10, 0, Math.PI*2); c.fill();
      c.fillStyle = '#fff'; c.shadowBlur = 0; c.globalAlpha = 0.7;
      c.beginPath(); c.arc(cx-3, py-3, 4, 0, Math.PI*2); c.fill();
      for (let i = 1; i <= 3; i++) {
        const tp = Math.max(0, prog - i*0.06);
        const tpy = startY + tp * (endY - startY);
        c.globalAlpha = (1-i*0.28)*0.35;
        c.fillStyle = enemy.color;
        c.beginPath(); c.arc(cx, tpy, 7*(1-i*0.2), 0, Math.PI*2); c.fill();
      }
      c.restore();
      break;
    }

    case 'magic': {
      c.save();
      const ph1 = Math.min(1, prog/0.55), ph2 = Math.max(0,(prog-0.5)/0.5);
      const r1 = ph1 * cv.width * 0.22;
      c.strokeStyle = enemy.color; c.lineWidth = 3; c.shadowColor = enemy.color; c.shadowBlur = 18;
      c.globalAlpha = (1-ph1)*0.9;
      c.beginPath(); c.arc(cx, startY, r1, 0, Math.PI*2); c.stroke();
      c.globalAlpha = (1-ph1)*0.45;
      c.beginPath(); c.arc(cx, startY, r1*0.6, 0, Math.PI*2); c.stroke();
      if (ph2 > 0) {
        const r2 = ph2 * cv.width * 0.13;
        c.globalAlpha = Math.sin(ph2*Math.PI)*0.8;
        c.fillStyle = enemy.color; c.shadowBlur = 28;
        c.beginPath(); c.arc(cx, endY, r2, 0, Math.PI*2); c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 2; c.shadowBlur = 12;
        c.globalAlpha = Math.sin(ph2*Math.PI)*0.55;
        c.beginPath(); c.arc(cx, endY, r2*1.4, 0, Math.PI*2); c.stroke();
      }
      c.restore();
      break;
    }
  }
}

// ─── バトルCanvas リサイズ ───
function resizeBattleCanvas() {
  const bf = $('battle-field');
  if (!cv || !bf) return;
  cv.width  = bf.clientWidth;
  cv.height = bf.clientHeight;
  G.heroX  = Math.floor(cv.width * 0.50);
  G.heroY  = Math.floor(cv.height * 0.94);
  G.enemyX = Math.floor(cv.width * 0.50);
  G.enemyY = Math.floor(cv.height * 0.80);
}

// ─── バトル描画 ───
function drawBattle() {
  if (!cv || !ctx) return;
  ctx.clearRect(0, 0, cv.width, cv.height);

  const t   = G.animT;
  const dur = getAnimDur(G.animState);
  const en  = currentEnemy();

  // スポットライト（舞台演出）
  const sl = ctx.createRadialGradient(G.enemyX, G.enemyY * 0.7, 0, G.enemyX, G.enemyY * 0.7, cv.width * 0.75);
  sl.addColorStop(0, `rgba(${hexToRgb(en.color)},0.07)`);
  sl.addColorStop(0.5, 'rgba(255,220,100,0.025)');
  sl.addColorStop(1, 'transparent');
  ctx.fillStyle = sl; ctx.fillRect(0, 0, cv.width, cv.height);

  // 問題発射エフェクト（敵から画面下へ）
  if (G.questionFlash > 0) {
    const fp = 1 - G.questionFlash / 18;
    const fy = G.enemyY + fp * (cv.height * 0.92 - G.enemyY);
    const fr = 14 * (1 - fp * 0.6);
    ctx.save();
    ctx.globalAlpha = (1 - fp) * 0.9;
    ctx.fillStyle = en.color; ctx.shadowColor = en.color; ctx.shadowBlur = 28;
    ctx.beginPath(); ctx.arc(G.enemyX, fy, fr, 0, Math.PI * 2); ctx.fill();
    // 軌跡
    ctx.globalAlpha *= 0.3;
    const tw = 4;
    ctx.beginPath();
    ctx.moveTo(G.enemyX - tw, G.enemyY); ctx.lineTo(G.enemyX + tw, G.enemyY);
    ctx.lineTo(G.enemyX + 1, fy);       ctx.lineTo(G.enemyX - 1, fy);
    ctx.fill();
    ctx.restore();
  }

  // 敵 (縦移動・揺れ)
  let enemyShakeX = 0, enemyFlash = 0, deadProg = 0, enemyOffY = 0;
  if (G.animState === 'enemyHit') { enemyFlash = 1 - t/dur; enemyShakeX = Math.sin(t*Math.PI*3)*12; }
  if (G.animState === 'enemyAttack' && en.atk === 'rush') {
    enemyOffY = Math.sin((t/dur)*Math.PI) * cv.height * 0.20;
  }
  if (G.animState === 'enemyDead') deadProg = Math.min(1, t/40);

  // 敵描画（正面・中央・大きめ）
  if (G.enemyHp > 0 || G.animState === 'enemyDead') {
    drawEnemy(ctx, G.enemyX, G.enemyY + enemyOffY, en, enemyFlash, enemyShakeX, deadProg, 1.7);
  }

  if (G.animState === 'heroAttack')  drawHeroAttackEffect(ctx);
  if (G.animState === 'enemyAttack') drawEnemyAttackEffect(ctx);
}

// ─── アニメーションループ ───
function startBattleLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  function loop() {
    // 次フレームを先に予約しておく。後から予約すると、onAnimEnd 内の
    // stopBattleLoop が効かずループが止まらない（enemyDead が毎フレーム
    // 再発火して showStageClear が連打される）バグになる
    rafId = requestAnimationFrame(loop);
    G.animT++;
    if (G.questionFlash > 0) G.questionFlash--;
    const dur = getAnimDur(G.animState);
    if (G.animState !== 'idle' && G.animState !== 'heroWin' && G.animT > dur) onAnimEnd();
    drawBattle();
  }
  rafId = requestAnimationFrame(loop);
}
function stopBattleLoop() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
function setAnimState(s) { G.animState = s; G.animT = 0; }

// ─── 勝利カットイン（とどめの一撃で選択ヒーローの顔が入る） ───
function showHeroCutin() {
  const el = $('hero-cutin');
  if (!el) return;
  const hid  = SAVE.heroId || 0;
  const face = el.querySelector('.cutin-face');
  face.style.backgroundImage    = `url('${HERO_SEL_URL}')`;
  face.style.backgroundPosition = `${(hid % 5) * 25}% ${Math.floor(hid / 5) * 100}%`;
  el.classList.remove('hidden');
  // アニメーションを再スタート
  el.querySelectorAll('.cutin-band, .cutin-face, .cutin-text').forEach(n => {
    n.style.animation = 'none'; void n.offsetWidth; n.style.animation = '';
  });
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 1250);
}

// ─── アニメーション終了 ───
function onAnimEnd() {
  switch (G.animState) {
    case 'heroAttack':
      $('attack-beam').classList.add('hidden');
      G.enemyHp = Math.max(0, G.enemyHp - (ATK_DMG[G.heroAttackType] || 1));
      updateHpBars();
      if (G.enemyHp <= 0) { showHeroCutin(); setAnimState('enemyDead'); }
      else                 setAnimState('enemyHit');
      break;
    case 'enemyHit':
      setAnimState('idle');
      nextQuestion();
      break;
    case 'enemyDead':
      SFX.enemyDead();
      stopBattleLoop();
      // カットイン（約1.2秒）が見終わってから結果画面へ
      setTimeout(() => showStageClear(), 600);
      break;
    case 'enemyAttack': {
      const dmg = currentEnemy()?.dmg ?? 1;
      G.heroHp = Math.max(0, G.heroHp - dmg);
      updateHearts();
      updateHpBars(); // ← HPバーも即座に更新（バグ修正）
      SFX.damage();
      $('hit-flash').classList.remove('hidden');
      setTimeout(() => $('hit-flash').classList.add('hidden'), 300);
      if (G.heroHp <= 0) {
        setAnimState('idle'); stopBattleLoop();
        setTimeout(() => showGameOver(), 400);
      } else {
        setAnimState('heroHit');
      }
      break;
    }
    case 'heroHit':
      setAnimState('idle');
      nextQuestion();
      break;
  }
}

// ─── ゲーム進行 ───
function startStage(stage) {
  G.stage = stage; G.stageWrong = 0;
  let en, label;
  if (isDiffStage(stage)) {
    // 難易度ステージ: 敵はランダム、HPは難易度で決まる
    const diff = DIFFS[stage - 9];
    const base = ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
    en = { ...base, maxHp: diff.maxHp };
    G.diffEnemy = en;
    label = `${diff.emoji} ${diff.label} ${MODES[G.mode]?.gsym || ''}`;
  } else {
    en = ENEMIES[stage];
    label = `ST.${stage+1}/9 ${MODES[G.mode] ? MODES[G.mode].sym(en.mult) : ''}`;
  }
  G.enemyHp = en.maxHp; G.enemyMaxHp = en.maxHp;
  G.combo = 0; G.locked = false;

  showScreen('screen-battle');
  $('stage-label').textContent = label;
  $('enemy-hp-name').textContent = en.name;
  updateHearts(); updateHpBars(); updateXpBar();
  resizeBattleCanvas();
  setAnimState('idle');
  BGM.play('battle');
  startBattleLoop();
  nextQuestion();
}

let _lastA = 0; // 直前の問題と同じ数を避ける

// モード別に問題を作る（n = ステージの数字 1〜9、段が前にくる形式）
function makeQuestion(mode, n) {
  let a;
  do { a = Math.floor(Math.random()*9)+1; } while (a === _lastA);
  _lastA = a;
  const kind = mode === 'mix' ? ['kake','tashi','hiki'][Math.floor(Math.random()*3)] : mode;
  if (kind === 'kake')  return { kind, n, a, correct: n*a, text: `${n} × ${a} = ?` };
  if (kind === 'tashi') return { kind, n, a, correct: n+a, text: `${n} + ${a} = ?` };
  return { kind, n, a, correct: a, text: `${n+a} − ${n} = ?` }; // ひきざん
}

// 数字ミックスの難易度ステージ用の問題
let _lastText = '';
function makeDiffQuestion(mode, diff) {
  let q, guard = 0;
  do { q = _genDiffQuestion(mode, diff); } while (q.text === _lastText && guard++ < 8);
  _lastText = q.text;
  return q;
}
function _genDiffQuestion(mode, diff) {
  const kind = mode === 'mix' ? ['kake','tashi','hiki'][Math.floor(Math.random()*3)] : mode;
  let a, b;
  if (kind === 'kake') {
    if      (diff === 'easy')   { a = randInt(1,5); b = randInt(1,5); } // 小さい九九
    else if (diff === 'normal') { a = randInt(1,9); b = randInt(1,9); } // 九九ぜんぶ
    else                        { a = randInt(6,9); b = randInt(6,9); } // むずかしい段
    return { kind, n:a, a:b, correct:a*b, text:`${a} × ${b} = ?` };
  }
  if (kind === 'tashi') {
    if      (diff === 'easy')   { a = randInt(1,8); b = randInt(1, Math.min(9, 10-a)); } // 和が10以下
    else if (diff === 'normal') { a = randInt(2,9); b = randInt(2,9); }                  // くり上がりあり
    else                        { a = randInt(11,89); b = randInt(3,9); }                // 2けた＋1けた
    return { kind, n:a, a:b, correct:a+b, text:`${a} + ${b} = ?` };
  }
  // ひきざん
  if      (diff === 'easy')   { a = randInt(3,10); b = randInt(1, a-1); }          // 10までのひきざん
  else if (diff === 'normal') { b = randInt(2,9); a = b + randInt(2,9); }          // くり下がりあり
  else                        { a = randInt(21,99); b = randInt(3,9); }            // 2けた−1けた
  return { kind, n:b, a, correct:a-b, text:`${a} − ${b} = ?` };
}

function makeWrongChoices(q) {
  const wrongs = new Set();
  let guard = 0;
  while (wrongs.size < 3 && guard++ < 60) {
    let w;
    if (q.kind === 'kake') {
      // 同じ段の近い答えを誤答にする（まぎらわしさを出す）
      w = q.correct + (Math.floor(Math.random()*8)-4)*q.n;
      if (w <= 0) w = q.correct + q.n*(Math.floor(Math.random()*4)+1);
    } else {
      w = q.correct + Math.floor(Math.random()*7) - 3; // ±3
    }
    if (w !== q.correct && w > 0) wrongs.add(w);
  }
  let fill = q.correct;
  while (wrongs.size < 3) { fill++; if (fill !== q.correct) wrongs.add(fill); }
  return [...wrongs];
}

function nextQuestion() {
  G.locked = false;
  G.questionFlash = 18; // 敵が問題を「撃ってくる」Canvas演出
  G.question = isDiffStage(G.stage)
    ? makeDiffQuestion(G.mode, DIFFS[G.stage - 9].key)
    : makeQuestion(G.mode, currentEnemy().mult);
  $('question-text').textContent = G.question.text;
  // 問題ボックスの登場アニメーション
  const qbox = $('question-box');
  qbox.classList.remove('question-enter');
  void qbox.offsetWidth;
  qbox.classList.add('question-enter');

  const choices = [G.question.correct, ...makeWrongChoices(G.question)].sort(() => Math.random()-0.5);
  const wrap = $('choices');
  wrap.innerHTML = '';
  choices.forEach(val => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn'; btn.textContent = val;
    btn.addEventListener('click', () => onAnswer(val, btn));
    btn.addEventListener('touchend', e => { e.preventDefault(); onAnswer(val, btn); });
    wrap.appendChild(btn);
  });
}

// ─── 回答 ───
function onAnswer(val, btn) {
  if (G.locked || G.animState !== 'idle') return;
  G.locked = true;
  document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);

  if (val === G.question.correct) {
    btn.classList.add('correct');
    const xpGain = 15 + G.combo * 5;
    G.score += 10 + G.combo * 2;
    G.combo++;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;
    G.totalCorrect++;

    const oldXp = SAVE.totalXp;
    SAVE.totalXp += xpGain;
    writeSave(); updateXpBar();
    checkLevelUp(oldXp, SAVE.totalXp);

    G.heroAttackType = selectHeroAttack();
    if (G.heroAttackType === 'beam') $('attack-beam').classList.remove('hidden');
    const atkDmg = ATK_DMG[G.heroAttackType] || 1;
    showAtkLabel((ATK_NAMES[G.heroAttackType] || '攻撃！') + (atkDmg > 1 ? ` 💥×${atkDmg}` : ''));
    setAnimState('heroAttack');

    SFX.correct();
    setTimeout(() => SFX.heroAttack(G.heroAttackType), 80);
    if (G.combo >= 2) SFX.combo(G.combo);

    const comboMsg = G.combo > 1 ? ` コンボ×${G.combo}！` : '';
    showMsg(`⚡ せいかい！ +${xpGain}XP${comboMsg}`, '#22c55e');
  } else {
    btn.classList.add('wrong');
    document.querySelectorAll('.choice-btn').forEach(b => {
      if (+b.textContent === G.question.correct) b.classList.add('correct');
    });
    G.combo = 0; G.totalWrong++; G.stageWrong++;
    const atkNames = { rush:'つっこんできた！', projectile:'飛び道具！', magic:'魔法攻撃！' };
    showAtkLabel(atkNames[currentEnemy().atk] || '攻撃！');
    setAnimState('enemyAttack');

    SFX.wrong();
    setTimeout(() => SFX.enemyAttack(currentEnemy().atk), 140);

    showMsg(`❌ ざんねん…\n${G.question.text.replace('?', G.question.correct)}`, '#ef4444');
  }
}

function showAtkLabel(text) {
  const el = $('atk-label');
  if (!el) return;
  el.textContent = text; el.classList.remove('hidden');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 1400);
}

// ─── レベルアップ ───
function checkLevelUp(oldXp, newXp) {
  const oldLv = getLevel(oldXp), newLv = getLevel(newXp);
  if (newLv > oldLv) showLevelUpNotification(newLv);
}
function showLevelUpNotification(lv) {
  SFX.levelUp();
  const unlockNames = { punch:'パンチ', slash:'スラッシュ', bomb:'エネルギー弾', ultra:'ウルトラ必殺技', ultra_max:'MAX必殺技' };
  const newAtk = ATK_UNLOCK[lv-1];
  const msg = newAtk && newAtk !== 'beam' ? `<small>「${unlockNames[newAtk]||newAtk}」解放！</small>` : '';
  const el = document.createElement('div');
  el.className = 'levelup-popup';
  el.innerHTML = `⬆️ レベルアップ！<span>LV. ${lv}</span>${msg}`;
  $('app').appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

// ─── 表示更新 ───
function showMsg(text, color='#fff') {
  const el = $('battle-msg');
  el.textContent = text; el.style.color = color; el.classList.remove('hidden');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 1300);
}
function updateHearts() {
  $('hero-hearts').textContent = '❤️'.repeat(Math.max(0,G.heroHp)) + '🖤'.repeat(Math.max(0,G.heroMaxHp-G.heroHp));
}
function updateHpBars() {
  const ep = $('enemy-hp-bar');
  if (ep) ep.style.width = `${(G.enemyHp/G.enemyMaxHp)*100}%`;
}

// ─── ステージクリア ───
function showStageClear() {
  BGM.stop();
  setTimeout(() => SFX.stageClear(), 100);
  stopBattleLoop();
  // ノーミスクリアでメダル獲得（モード×ステージごと）
  const gotMedal = G.stageWrong === 0;
  if (gotMedal) SAVE.medals[`${G.mode}${G.stage}`] = 1;
  writeSave();

  // クリアごとに ❤️1 回復（9連戦の救済）
  let healed = false;
  if (G.heroHp < G.heroMaxHp) { G.heroHp++; healed = true; }

  showScreen('screen-stage-clear');
  const en = currentEnemy();
  $('clear-detail').textContent = `${en.name} をたおした！${healed ? '　❤️+1 かいふく！' : ''}`;
  $('clear-icon').textContent = ['🎉','✨','🌟','💪','🔥','⚡','🏆','🎊','👑','🌱','🌟','🔥'][G.stage] || '🎉';

  const mr = $('medal-result');
  if (mr) {
    mr.className = gotMedal ? 'medal-get' : 'medal-miss';
    mr.textContent = gotMedal ? '🏅 メダル ゲット！' : 'ノーミスクリアで 🏅メダル！';
  }

  $('score-display').textContent = `スコア: ${G.score}`;
  const xpEl = $('xp-gained');
  if (xpEl) xpEl.textContent = `LV.${getLevel(SAVE.totalXp)}  総XP: ${SAVE.totalXp}`;

  $('btn-next-stage').textContent =
    (G.stage === 8 || G.stage >= 11) ? 'ラストクリア！ 🏆'
    : isDiffStage(G.stage)           ? `つぎは ${DIFFS[G.stage - 8].label} ▶`
    :                                  `ステージ ${G.stage+2} へ ▶`;
}

// ─── ゲームオーバー ───
function showGameOver() {
  BGM.stop();
  setTimeout(() => SFX.gameOver(), 100);
  stopBattleLoop(); showScreen('screen-gameover');
  $('go-detail').textContent = `${currentEnemy().name} に やられてしまった…\nスコア: ${G.score}`;
}

// ─── ビクトリー ───
function showVictory() {
  BGM.stop();
  setTimeout(() => SFX.victory(), 200);
  stopBattleLoop(); showScreen('screen-victory');
  $('final-score').textContent = `スコア: ${G.score}点  さいこうコンボ: ${G.bestCombo}\nLV.${getLevel(SAVE.totalXp)}  総XP: ${SAVE.totalXp}`;
  const vic = $('vic-medals');
  if (vic) vic.innerHTML = Array.from({length: 12}, (_, i) =>
    `<span>${SAVE.medals[`${G.mode}${i}`] ? '🏅' : '☆'}</span>`).join('');
  spawnConfetti();
}

function spawnConfetti() {
  const wrap = $('victory-confetti');
  wrap.innerHTML = '';
  const cols = ['#60a5fa','#f472b6','#fde68a','#4ade80','#fb923c','#a78bfa'];
  for (let i = 0; i < 40; i++) {
    const d = document.createElement('div');
    const sz = Math.random()*10+6;
    d.className = 'confetti-dot';
    d.style.cssText = `width:${sz}px;height:${sz}px;background:${cols[i%6]};left:${Math.random()*100}%;top:-20px;animation-duration:${Math.random()*3+2}s;animation-delay:${Math.random()*2}s;`;
    wrap.appendChild(d);
  }
}

// ═══════════════════════════════════════════════════════
// ─── Audio Engine ───────────────────────────────────────
// ═══════════════════════════════════════════════════════

let AC = null;
let _pendingBgm = null;
let MUTED = false;

function getAC() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    AC.addEventListener('statechange', () => {
      if (AC.state === 'running' && _pendingBgm) { BGM._start(_pendingBgm); _pendingBgm = null; }
    });
  }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}

// 汎用トーン：オシレーター + 滑らかなエンベロープ
function tone(freq, dur, vol = 0.25, type = 'sine', delay = 0) {
  if (MUTED || freq <= 0) return;
  const ac = getAC();
  const osc = ac.createOscillator(), g = ac.createGain();
  osc.connect(g); g.connect(ac.destination);
  osc.type = type; osc.frequency.value = freq;
  const t = ac.currentTime + delay;
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(dur * 0.88, 0.05));
  osc.start(t); osc.stop(t + dur + 0.06);
}

// ホワイトノイズ（打撃・爆発に）
function noiseHit(dur, vol = 0.18, bandFreq = 1000, delay = 0) {
  if (MUTED) return;
  const ac = getAC();
  const len = Math.ceil(ac.sampleRate * 0.5);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(), filt = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; filt.type = 'bandpass'; filt.frequency.value = bandFreq; filt.Q.value = 1.5;
  src.connect(filt); filt.connect(g); g.connect(ac.destination);
  const t = ac.currentTime + delay;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.8);
  src.start(t); src.stop(t + dur);
}

// 周波数スイープ（ビーム・敵弾に）
function sweep(f0, f1, dur, vol = 0.20, type = 'sawtooth', delay = 0) {
  if (MUTED) return;
  const ac = getAC();
  const osc = ac.createOscillator(), g = ac.createGain();
  osc.connect(g); g.connect(ac.destination); osc.type = type;
  const t = ac.currentTime + delay;
  osc.frequency.setValueAtTime(f0, t); osc.frequency.linearRampToValueAtTime(f1, t + dur * 0.85);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.92);
  osc.start(t); osc.stop(t + dur + 0.05);
}

// ─── 効果音 (SFX) ─────────────────────────────────────
const SFX = {
  correct() {
    tone(523, 0.10, 0.22, 'triangle', 0.00);
    tone(659, 0.10, 0.22, 'triangle', 0.07);
    tone(784, 0.16, 0.28, 'triangle', 0.14);
  },
  wrong() {
    tone(180, 0.12, 0.30, 'square',   0.00);
    tone(140, 0.18, 0.25, 'sawtooth', 0.06);
  },
  damage() {
    tone(220, 0.06, 0.35, 'square',   0.00);
    tone(110, 0.22, 0.28, 'sawtooth', 0.04);
    noiseHit(0.12, 0.22, 200, 0.01);
  },
  beam() {
    sweep(350, 1400, 0.32, 0.22, 'sawtooth', 0);
    tone(600, 0.18, 0.12, 'sine', 0.05);
  },
  punch() {
    noiseHit(0.08, 0.30, 800);
    tone(160, 0.12, 0.28, 'square', 0.02);
  },
  slash() {
    sweep(1500, 600, 0.14, 0.24, 'sawtooth');
    noiseHit(0.12, 0.20, 3000);
  },
  bomb() {
    tone(55,  0.45, 0.44, 'sine',     0.00);
    tone(110, 0.25, 0.32, 'square',   0.02);
    noiseHit(0.22, 0.28, 300, 0.03);
    sweep(400, 80, 0.28, 0.20, 'sawtooth', 0.05);
  },
  ultra() {
    sweep(180, 900, 0.35, 0.28, 'sawtooth', 0.00);
    sweep(90,  450, 0.35, 0.18, 'sine',     0.05);
    noiseHit(0.20, 0.24, 600, 0.15);
    tone(800, 0.18, 0.26, 'triangle', 0.25);
  },
  ultraMax() {
    [0, 0.06, 0.12, 0.18, 0.25].forEach((d, i) =>
      tone([100,150,200,300,500][i], 0.55, 0.26, 'sawtooth', d));
    noiseHit(0.35, 0.36, 500, 0.08);
    tone(1200, 0.22, 0.35, 'triangle', 0.28);
    sweep(300, 1800, 0.32, 0.20, 'sine', 0.20);
  },
  heroAttack(type) {
    const map = { beam:()=>this.beam(), punch:()=>this.punch(), slash:()=>this.slash(),
                  bomb:()=>this.bomb(), ultra:()=>this.ultra(), ultra_max:()=>this.ultraMax() };
    (map[type] || map.beam)();
  },
  enemyRush() {
    tone(150, 0.14, 0.28, 'square');
    noiseHit(0.10, 0.20, 250, 0.04);
  },
  enemyProjectile() {
    sweep(900, 200, 0.28, 0.22, 'sine');
  },
  enemyMagic() {
    [440, 554, 659, 880].forEach((f, i) => tone(f, 0.28, 0.16, 'sine', i * 0.07));
    sweep(220, 440, 0.40, 0.14, 'triangle', 0.10);
  },
  enemyAttack(atkType) {
    const map = { rush:()=>this.enemyRush(), projectile:()=>this.enemyProjectile(), magic:()=>this.enemyMagic() };
    (map[atkType] || map.rush)();
  },
  enemyDead() {
    tone(55, 0.55, 0.42, 'sine');
    noiseHit(0.35, 0.36, 400, 0.02);
    sweep(500, 80, 0.30, 0.26, 'sawtooth', 0.05);
    [523, 659, 784].forEach((f, i) => tone(f, 0.12, 0.26, 'triangle', 0.25 + i * 0.10));
  },
  stageClear() {
    [[523,0.10],[659,0.10],[784,0.10],[1047,0.30]].forEach(([f,d],i) => tone(f,d,0.28,'triangle',i*0.10));
    [[523,0.08],[659,0.08],[784,0.14]].forEach(([f,d],i) => tone(f,d,0.18,'sine',0.44+i*0.10));
  },
  gameOver() {
    [[440,0.20,0.28],[330,0.20,0.24],[262,0.20,0.22],[196,0.45,0.28]]
      .forEach(([f,d,v], i) => tone(f,d,v,'sine',i*0.22));
  },
  victory() {
    const mel = [[523,0.12],[659,0.12],[784,0.12],[0,0.06],[1047,0.20],[0,0.04],[784,0.08],[1047,0.08],[1319,0.50]];
    let t = 0; mel.forEach(([f,d]) => { tone(f,d*1.1,0.32,'triangle',t); t+=d; });
    const har = [[330,0.12],[415,0.12],[494,0.12],[0,0.06],[659,0.56]];
    t = 0; har.forEach(([f,d]) => { tone(f,d*1.1,0.18,'sine',t); t+=d; });
  },
  levelUp() {
    [262,330,392,523,659].forEach((f, i) => tone(f, 0.10, 0.22, 'triangle', i * 0.07));
  },
  combo(n) {
    const freqs = [392,440,494,523,587,659,740,784,880,988];
    tone(freqs[Math.min(n-1, freqs.length-1)], 0.07, 0.20, 'triangle');
  },
};

// ─── BGM ──────────────────────────────────────────────

function _makeBgmSeq(beatDur, totalBeats, events) {
  const beats = Array.from({length: totalBeats}, () => []);
  for (const [start, f, d, v, t] of events) {
    if (start < totalBeats) beats[start].push({f, d, v, t: t || 'sine'});
  }
  return {beats, beatDur};
}

// events: [startBeat, freq, durationBeats, volume, waveType]
// 8分音符グリッド、C major (title) / A minor (battle)
const BGM_SEQS = {
  title: _makeBgmSeq(60/132/2, 32, [
    // ─ Melody (triangle) ─
    [0,  330,2,0.15,'triangle'],   // E4
    [2,  392,2,0.15,'triangle'],   // G4
    [4,  523,2,0.18,'triangle'],   // C5
    [6,  659,2,0.18,'triangle'],   // E5
    [8,  587,2,0.16,'triangle'],   // D5
    [10, 523,2,0.15,'triangle'],   // C5
    [12, 440,4,0.16,'triangle'],   // A4 (半音符)
    [16, 392,2,0.15,'triangle'],   // G4
    [18, 330,2,0.15,'triangle'],   // E4
    [20, 294,2,0.15,'triangle'],   // D4
    [22, 330,2,0.15,'triangle'],   // E4
    [24, 262,2,0.15,'triangle'],   // C4
    [26, 294,2,0.15,'triangle'],   // D4
    [28, 330,4,0.18,'triangle'],   // E4 (半音符)
    // ─ Bass (sine) ─
    [0,  131,2,0.17,'sine'],  [4,  131,2,0.15,'sine'],
    [8,  110,2,0.17,'sine'],  [12, 110,2,0.15,'sine'],
    [16, 98, 2,0.17,'sine'],  [20, 98, 2,0.15,'sine'],
    [24, 131,2,0.17,'sine'],  [28, 131,2,0.15,'sine'],
    // ─ Chord accent (sine) ─
    [0,  262,1,0.07,'sine'], [8,  220,1,0.07,'sine'],
    [16, 196,1,0.07,'sine'], [24, 262,1,0.07,'sine'],
  ]),

  battle: _makeBgmSeq(60/155/2, 24, [
    // ─ Melody (sawtooth, A minor) ─
    [0,  440,2,0.12,'sawtooth'], [2,  523,1,0.11,'sawtooth'],
    [3,  494,1,0.10,'sawtooth'], [4,  440,2,0.12,'sawtooth'],
    [6,  392,2,0.11,'sawtooth'], [8,  349,2,0.11,'sawtooth'],
    [10, 330,2,0.12,'sawtooth'], [12, 392,1,0.11,'sawtooth'],
    [13, 440,3,0.13,'sawtooth'], [16, 523,2,0.14,'sawtooth'],
    [18, 494,2,0.12,'sawtooth'], [20, 440,4,0.12,'sawtooth'],
    // ─ Bass (sine) ─
    [0,  110,2,0.18,'sine'], [4,  110,2,0.16,'sine'],
    [8,  87, 2,0.18,'sine'], [12, 98, 2,0.16,'sine'],
    [16, 110,2,0.18,'sine'], [20, 98, 4,0.18,'sine'],
    // ─ Rhythm stabs (square) ─
    [0,  220,1,0.09,'square'], [4,  220,1,0.09,'square'],
    [8,  175,1,0.09,'square'], [12, 196,1,0.09,'square'],
    [16, 220,1,0.09,'square'], [20, 196,1,0.09,'square'],
  ]),
};

const BGM = (() => {
  let timerId  = null;
  let nextTime = 0;
  let beat     = 0;
  let seq      = null;
  let curName  = null;
  const LOOK   = 0.12;
  const TICK   = 40;

  function _note(n, startTime) {
    if (MUTED || n.f <= 0) return;
    const ac = getAC();
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.connect(g); g.connect(ac.destination); osc.type = n.t; osc.frequency.value = n.f;
    const dur = n.d * seq.beatDur;
    g.gain.setValueAtTime(0.001, startTime);
    g.gain.linearRampToValueAtTime(n.v, startTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + dur * 0.88);
    osc.start(startTime); osc.stop(startTime + dur + 0.05);
  }

  function tick() {
    if (!seq) return;
    const ac = getAC();
    while (nextTime < ac.currentTime + LOOK) {
      seq.beats[beat % seq.beats.length].forEach(n => _note(n, nextTime));
      nextTime += seq.beatDur; beat++;
    }
  }

  function _start(name) {
    if (timerId) { clearInterval(timerId); timerId = null; }
    seq = BGM_SEQS[name]; if (!seq) return;
    curName = name;
    const ac = getAC();
    nextTime = ac.currentTime + 0.05; beat = 0;
    timerId = setInterval(tick, TICK); tick();
  }

  function play(name) {
    stop();
    const ac = getAC();
    if (ac.state === 'running') _start(name);
    else                        _pendingBgm = name;
  }

  function stop() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    seq = null; beat = 0; _pendingBgm = null; curName = null;
  }

  // バックグラウンドタブでは setInterval が間引かれ BGM が乱れるため、
  // 非表示中は停止して復帰時に再開する
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (timerId) { clearInterval(timerId); timerId = null; }
    } else if (curName) {
      _start(curName);
    }
  });

  return { play, stop, _start };
})();

// ─── イベント登録 ───
function on(id, fn) {
  const el = $(id); if (!el) return;
  el.addEventListener('click', fn);
  el.addEventListener('touchend', e => { e.preventDefault(); fn(); });
}

function initEvents() {
  on('btn-name-confirm', () => confirmName());
  on('btn-hero-confirm', () => confirmHeroSelect());
  on('btn-next-stage',   () => {
    if (G.stage === 8 || G.stage >= 11) showVictory();
    else startStage(G.stage+1);
  });
  on('btn-retry',        () => { G.heroHp = 5; G.heroMaxHp = 5; startStage(G.stage); });
  on('btn-clear-home',   () => showHome());
  on('btn-go-home',      () => showHome());
  on('btn-vic-home',     () => showHome());
  on('btn-quit-battle',  () => { stopBattleLoop(); BGM.stop(); showHome(); });
  document.querySelectorAll('.mode-tab').forEach(b => {
    b.addEventListener('click', () => {
      curMode = b.dataset.mode;
      renderModeTabs();
      renderStageGrid();
    });
  });
  on('btn-mute', () => {
    MUTED = !MUTED;
    const btn = document.getElementById('btn-mute');
    if (btn) btn.textContent = MUTED ? '🔇' : '🔊';
  });

  // Enterキーで名前確定
  const nameInp = $('player-name-input');
  if (nameInp) nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') confirmName(); });

  window.addEventListener('resize', resizeBattleCanvas);
}

function startGame(stage = 0) {
  G = {
    mode:curMode,
    stage:0, heroHp:5, heroMaxHp:5,
    enemyHp:0, enemyMaxHp:0,
    score:0, combo:0, bestCombo:0,
    totalCorrect:0, totalWrong:0, stageWrong:0,
    question:null, animState:'idle', animT:0,
    heroX:0, heroY:0, enemyX:0, enemyY:0,
    locked:false, heroAttackType:'beam',
    questionFlash:0,
  };
  startStage(stage);
}

// ─── ヒーロー顔画像URL（透過済みPNGを直接使用） ───
const HERO_SEL_URL = 'img/hero選択_transparent.png';

// ─── 起動 ───
window.addEventListener('DOMContentLoaded', () => {
  cv  = $('battle-canvas');
  ctx = cv.getContext('2d');
  SAVES = loadSaves();
  initEvents();
  initTitle();
  preloadImages(() => {});
  // 最初のタップで AudioContext を解放（これが無いとBGM/効果音が再生されない）。
  // スマホ(特にiOS Safari)は touchend でしか解放されないことがあるため
  // 複数のイベントで解放を試みる。さらに無音バッファを1つ鳴らして確実にする
  const unlockAudio = () => {
    try {
      // iOS 17+: マナーモード(サイレントスイッチ)でも音を出す
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) {}
    const ac = getAC();
    try {
      const buf = ac.createBuffer(1, 1, 22050);
      const src = ac.createBufferSource();
      src.buffer = buf; src.connect(ac.destination); src.start(0);
    } catch (e) {}
  };
  ['pointerdown', 'touchend', 'keydown'].forEach(ev =>
    document.addEventListener(ev, unlockAudio, { once: true, passive: true }));
});
