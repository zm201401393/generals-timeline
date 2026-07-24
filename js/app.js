/* 近现代国共将领交互式历史年表 — 应用逻辑 v4 */
(() => {
'use strict';

// ---------- 数据装载 ----------
const PUBLIC_GENERALS = window.DATA_GENERALS || [];   // 公共库（所有人可见，写死）
const BATTLES  = window.DATA_BATTLES  || [];
const EVENTS   = window.DATA_EVENTS   || [];
const BATTLE_MAP = Object.fromEntries(BATTLES.map(b => [b.id, b]));
const EVENT_MAP  = Object.fromEntries(EVENTS.map(e => [e.id, e]));
const NODE_MAP   = { ...BATTLE_MAP, ...EVENT_MAP };

// 合并公共库 + 本地用户自建将领（localStorage）
const LS_KEY = 'userGenerals.v1';
let USER_GENERALS = [];      // 用户自建（本地）
let GENERALS = [];           // 合并后的全部
let GEN_MAP = {};

function loadUserGenerals() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    USER_GENERALS = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(USER_GENERALS)) USER_GENERALS = [];
  } catch (e) { USER_GENERALS = []; }
  USER_GENERALS.forEach(g => { g._user = true; });
}
function saveUserGenerals() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(USER_GENERALS)); } catch (e) {}
}
function rebuildData() {
  GENERALS = [...PUBLIC_GENERALS, ...USER_GENERALS];
  GEN_MAP = Object.fromEntries(GENERALS.map(g => [g.id, g]));
  recomputeAxis();
}

const CAMP_LABEL = { kmt: '国民党', ccp: '共产党' };
const CAMP_COLOR = { kmt: '#1d4ed8', ccp: '#b91c1c' };
const CAMP_DEEP  = { kmt: '#1e3a8a', ccp: '#7f1d1d' };

// 军衔准入门槛（少将及以上）——按阵营分别定义可选军衔
const RANK_OPTIONS = {
  kmt: ['少将', '中将', '二级上将', '一级上将', '特级上将'],
  ccp: ['少将', '中将', '上将', '大将', '元帅']
};

// 历史阶段（用于时期按钮 + 背景色带）
const ERAS = [
  { key: 'all',  name: '全部时期', start: null, end: null, color: '#57534e' },
  { key: 'e1',   name: '国共合作·北伐', start: 1924, end: 1927, color: '#9333ea', band: 'rgba(147,51,234,.07)' },
  { key: 'e2',   name: '土地革命战争',   start: 1927, end: 1937, color: '#ea580c', band: 'rgba(234,88,12,.07)' },
  { key: 'e3',   name: '抗日战争',       start: 1937, end: 1945, color: '#16a34a', band: 'rgba(22,163,74,.09)' },
  { key: 'e4',   name: '解放战争',       start: 1945, end: 1950, color: '#b91c1c', band: 'rgba(185,28,28,.07)' }
];
const ERA_HINTS = {
  all: '显示全部将领',
  e1: '高亮 1924–1927 年间活跃的将领（第一次国共合作与北伐）',
  e2: '高亮 1927–1937 年间活跃的将领（土地革命 / 十年内战）',
  e3: '高亮 1937–1945 年间活跃的将领（全民族抗日战争）',
  e4: '高亮 1945–1950 年间活跃的将领（解放战争）'
};

// ---------- 时间工具 ----------
function toYear(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}
function midDate(a, b) {
  const ya = toYear(a), yb = toYear(b);
  if (ya == null && yb == null) return null;
  if (ya == null) return yb; if (yb == null) return ya;
  return (ya + yb) / 2;
}

// 时间轴范围（合并用户数据后需重算）
let AXIS_MIN = 1882, AXIS_MAX = 2001, AXIS_W = 0;
const PX_PER_YEAR = 9;
const LABEL_W = 96;                       // 左侧姓名固定列宽
const ROW_H = 34;
function recomputeAxis() {
  const ys = GENERALS.flatMap(g => [toYear(g.lifeSpan?.start), toYear(g.lifeSpan?.end)]).filter(Boolean);
  AXIS_MIN = Math.min(...ys, 1882);
  AXIS_MAX = Math.max(...ys, 2001);
  AXIS_W = LABEL_W + (AXIS_MAX - AXIS_MIN) * PX_PER_YEAR + 30;
}
const xOf = y => LABEL_W + (y - AXIS_MIN) * PX_PER_YEAR;


// ---------- 状态 ----------
const state = {
  filters: { camp: new Set(), province: new Set(), academy: new Set(), battle: new Set(), rank: new Set() },
  era: 'all',
  mode: 'timeline',        // timeline | war
  warNode: null,           // 战争模式当前选中的战役/事件 id
  docTab: 'life',          // 档案面板视角: life | battle | promotion
  docGid: null,            // 当前档案将领 id
  selected: new Set(),
  highlightBattle: null
};

// ---------- 派生 ----------
function academyTags(g) {
  const tags = new Set();
  (g.academy || []).forEach(a => {
    if (/黄埔/.test(a)) tags.add('黄埔军校');
    else if (/保定/.test(a)) tags.add('保定军校');
    else if (/讲武堂/.test(a)) tags.add('讲武堂');
    else if (/伏龙芝|苏联|莫斯科|红军学校/.test(a)) tags.add('苏联军校');
    else if (/日本|士官|振武/.test(a)) tags.add('日本军校');
    else if (/弗吉尼亚|普渡|清华|美国/.test(a)) tags.add('欧美院校');
    else tags.add('行伍/其他');
  });
  return [...tags];
}
function rankTag(g) {
  const r = g.rank || '';
  if (/元帅/.test(r)) return '元帅';
  if (/大将/.test(r)) return '大将';
  if (/特级上将|一级上将/.test(r)) return '一级上将';
  if (/二级上将/.test(r)) return '二级上将';
  if (/上将/.test(r)) return '上将';
  if (/中将/.test(r)) return '中将';
  return '其他';
}

// ---------- 筛选 ----------
function passFilters(g) {
  const f = state.filters;
  if (f.camp.size && !f.camp.has(g.camp)) return false;
  if (f.province.size && !f.province.has(g.birthplace.province)) return false;
  if (f.academy.size && !academyTags(g).some(t => f.academy.has(t))) return false;
  if (f.battle.size && !([...(g.battles||[]), ...(g.relatedEvents||[])]).some(b => f.battle.has(b))) return false;
  if (f.rank.size && !f.rank.has(rankTag(g))) return false;
  return true;
}
function inEra(g) {
  const era = ERAS.find(e => e.key === state.era);
  if (!era || era.start == null) return true;
  const s = toYear(g.activeSpan.start), e = toYear(g.activeSpan.end);
  return e >= era.start && s <= era.end;
}

// =========================================================
//  时间轴刻度 + 时期按钮
// =========================================================
function renderAxis() {
  const axis = document.getElementById('axis');
  axis.style.width = AXIS_W + 'px';
  let html = `<div class="absolute left-0 top-0 h-full flex items-center pl-3 text-[10px] font-hei text-ink-faint bg-parchment-card/95" style="width:${LABEL_W}px; z-index:2; border-right:1px solid #e3d9c4">将领 \\ 年份</div>`;
  for (let y = Math.ceil(AXIS_MIN / 5) * 5; y <= AXIS_MAX; y += 5) {
    const x = xOf(y);
    const major = y % 10 === 0;
    html += `<div class="absolute top-0 h-full ${major ? 'border-l border-stone-300' : 'border-l border-stone-200/70'}" style="left:${x}px">
      <span class="absolute top-1 left-1 text-[10px] font-hei ${major ? 'text-ink-soft font-medium' : 'text-ink-faint'}">${y}</span></div>`;
  }
  axis.innerHTML = html;
}

function renderEraTabs() {
  const box = document.getElementById('era-tabs');
  box.innerHTML = ERAS.map(e => {
    const active = state.era === e.key;
    const style = active ? `background:${e.color};border-color:${e.color}` : `border-color:${e.color}55;color:${e.color}`;
    return `<button class="era-btn text-xs px-3 py-1 rounded-full border font-medium ${active ? 'active' : 'bg-parchment-card/60 hover:bg-white'}"
      style="${style}" data-era="${e.key}">${e.name}</button>`;
  }).join('');
  document.getElementById('era-hint').textContent = ERA_HINTS[state.era] || '';
}

function renderEraBands(container) {
  ERAS.filter(e => e.start != null).forEach(e => {
    const div = document.createElement('div');
    div.className = 'era-band';
    div.style.left = xOf(e.start) + 'px';
    div.style.width = (e.end - e.start) * PX_PER_YEAR + 'px';
    div.style.background = e.band;
    div.style.borderLeft = `1px dashed ${e.color}66`;
    const lbl = document.createElement('div');
    lbl.className = 'absolute top-0.5 text-[9px] font-hei px-1 rounded';
    lbl.style.cssText = `left:${xOf(e.start)+2}px; color:${e.color}; opacity:.75`;
    lbl.textContent = e.name;
    container.appendChild(div);
    container.appendChild(lbl);
  });
}

// =========================================================
//  将领轨迹条
// =========================================================
function renderTracks() {
  const tracks = document.getElementById('tracks');
  tracks.innerHTML = '';
  tracks.style.width = AXIS_W + 'px';

  const visible = GENERALS.filter(passFilters)
    .sort((a, b) => {
      if (a.camp !== b.camp) return a.camp === 'kmt' ? -1 : 1;  // 先国后共，分组更清晰
      return toYear(a.lifeSpan.start) - toYear(b.lifeSpan.start);
    });

  tracks.style.height = (visible.length * ROW_H + 24) + 'px';
  renderEraBands(tracks);

  let activeCount = 0;
  visible.forEach((g, i) => {
    const top = i * ROW_H + 16;
    const dimmed = !inEra(g);
    if (!dimmed) activeCount++;

    const ls = toYear(g.lifeSpan.start), le = toYear(g.lifeSpan.end);
    const as = toYear(g.activeSpan.start), ae = toYear(g.activeSpan.end);
    const color = CAMP_COLOR[g.camp], deep = CAMP_DEEP[g.camp];

    // 姓名（固定左列）
    const name = document.createElement('div');
    name.className = `track-name absolute font-hei text-xs font-semibold whitespace-nowrap cursor-pointer flex items-center ${dimmed ? 'name-dim' : ''}`;
    name.style.cssText = `left:0; width:${LABEL_W}px; top:${top}px; height:16px; padding-left:12px; color:${deep}`;
    name.innerHTML = `${g.name}${g._user ? '<span class="ml-0.5 text-[8px] align-top text-emerald-600">✎</span>' : ''}<span class="ml-1 text-[9px] font-normal opacity-60">${(g.rank||'').replace('中华人民共和国','').replace('中国人民解放军','')}</span>`;
    name.dataset.gid = g.id;
    tracks.appendChild(name);

    // 生卒底条
    const life = document.createElement('div');
    life.className = `life-bar absolute rounded-full cursor-pointer ${dimmed ? 'dim' : ''} ${state.selected.has(g.id) ? 'selected' : ''}`;
    life.style.cssText = `left:${xOf(ls)}px; top:${top}px; width:${(le - ls) * PX_PER_YEAR}px; height:15px; background:${color}1f; border:1px solid ${color}55;`;
    life.dataset.gid = g.id;
    tracks.appendChild(life);

    // 活跃期
    if (as && ae) {
      const act = document.createElement('div');
      act.className = `act-bar absolute rounded-full pointer-events-none ${dimmed ? 'dim' : ''}`;
      act.style.cssText = `left:${xOf(as)}px; top:${top + 2}px; width:${(ae - as) * PX_PER_YEAR}px; height:11px; background:linear-gradient(90deg, ${color}, ${deep});`;
      tracks.appendChild(act);
    }

    // 标记点
    const nodes = [...(g.battles || []).map(id => BATTLE_MAP[id]), ...(g.relatedEvents || []).map(id => EVENT_MAP[id])].filter(Boolean);
    nodes.forEach(n => {
      const yr = midDate(n.start, n.end);
      if (yr == null) return;
      const mk = document.createElement('div');
      const isEvent = n.type === 'event';
      mk.className = `marker absolute rounded-full cursor-pointer ${dimmed ? 'dim' : ''}`;
      mk.style.cssText = `left:${xOf(yr)}px; top:${top + 7.5}px; width:10px; height:10px; transform:translate(-50%,-50%); background:${isEvent ? '#f59e0b' : '#fff'}; border:2px solid ${isEvent ? '#b45309' : color};`;
      mk.dataset.node = n.id;
      mk.dataset.gid = g.id;
      tracks.appendChild(mk);
    });
  });

  document.getElementById('count-hint').innerHTML =
    `共 <b class="text-ink">${visible.length}</b> 位将领` +
    (state.era !== 'all' ? ` · <span style="color:${ERAS.find(e=>e.key===state.era).color}">${activeCount} 位在此时期活跃</span>` : '');
}

// =========================================================
//  人物档案面板（含成长轨迹时间线）
// =========================================================
const FIELD_ROWS = [
  ['军衔', g => g.rank],
  ['阵营', g => CAMP_LABEL[g.camp]],
  ['性别', g => g.gender === 'male' ? '男' : '女'],
  ['出生地', g => g.birthplace.text],
  ['出生日期', g => fmtDate(g.birthDate, g.datePrecision?.birth)],
  ['逝世日期', g => fmtDate(g.deathDate, g.datePrecision?.death)],
  ['安葬地点', g => g.burialPlace],
  ['毕业院校', g => (g.academy || []).join('、')],
];
function fmtDate(d, prec) {
  if (!d) return '—';
  if (prec === 'year') return toYear(d) + '年';
  if (prec === 'approx') return '约 ' + toYear(d) + '年';
  return d;
}
function eraColor(eraName) {
  const map = { '清末':'#78716c','民国初年':'#78716c','国共合作':'#9333ea','土地革命战争':'#ea580c','抗日战争':'#16a34a','解放战争':'#b91c1c','新中国':'#0891b2' };
  return map[eraName] || '#a8a29e';
}

function renderJourney(g, color) {
  if (!g.journey || !g.journey.length) return '<p class="text-ink-faint">—</p>';
  const seq = [...g.journey].sort((a, b) => (parseInt(a.year) || 0) - (parseInt(b.year) || 0));
  return `<div class="journey-line relative pl-9 space-y-4">` + seq.map(j => {
    const c = eraColor(j.era);
    return `
      <div class="relative">
        <span class="jnode-dot absolute rounded-full" style="left:-31px; top:3px; width:12px; height:12px; background:${c}"></span>
        <div class="flex items-baseline gap-2 flex-wrap">
          <span class="font-hei text-xs font-bold px-1.5 py-0.5 rounded text-white" style="background:${c}">${j.year}${j.age!=null?` · ${j.age}岁`:''}</span>
          <span class="text-[11px] font-hei text-ink-faint px-1.5 py-0.5 rounded border" style="border-color:${c}55;color:${c}">${j.era}</span>
          <span class="font-semibold text-ink">${j.title}</span>
        </div>
        <p class="text-ink-soft leading-relaxed mt-1 text-[13px] font-hei">${j.detail}</p>
      </div>`;
  }).join('') + `</div>`;
}

// 视角二：战役脉络 —— 按时序展开该将领参与的战役/事件，附各自角色
function renderBattleTrack(g, color) {
  const nodes = [
    ...(g.battles || []).map(id => ({ n: BATTLE_MAP[id], isEvent: false })),
    ...(g.relatedEvents || []).map(id => ({ n: EVENT_MAP[id], isEvent: true }))
  ].filter(x => x.n).sort((a, b) => (toYear(a.n.start) || 0) - (toYear(b.n.start) || 0));
  if (!nodes.length) return '<p class="text-ink-faint">该将领暂无关联战役 / 事件记录</p>';
  return `<div class="space-y-2.5">` + nodes.map(({ n, isEvent }) => {
    const p = (n.participants || []).find(pp => pp.generalId === g.id);
    const c = eraColor(n.category === '解放战争' ? '解放战争' : n.category === '抗日战争' ? '抗日战争' : n.category === '土地革命战争' ? '土地革命战争' : '国共合作');
    const dot = isEvent ? '#f59e0b' : color;
    return `<button class="node-link chip block w-full text-left card rounded-lg p-3 hover:bg-amber-50" data-node="${n.id}">
      <div class="flex items-baseline gap-2 flex-wrap">
        <span class="font-hei text-xs font-bold px-1.5 py-0.5 rounded text-white tabular-nums" style="background:${dot}">${toYear(n.start)}</span>
        <span class="font-hei font-bold text-ink">${n.name}</span>
        <span class="text-[11px] text-ink-faint">${n.category}</span>
      </div>
      <div class="text-[13px] text-ink-soft mt-1.5 font-hei"><b style="color:${CAMP_DEEP[g.camp]}">担任</b>：${p ? p.role : '—'}</div>
      <div class="text-[12px] text-ink-faint mt-0.5 font-hei">战果：${n.outcome || '—'}</div>
    </button>`;
  }).join('') + `</div>`;
}

// 视角三：职务升迁 —— keyPositions 阶梯图
function renderPromotion(g, color) {
  const pos = [...(g.keyPositions || [])].sort((a, b) => (toYear(a.start) || 0) - (toYear(b.start) || 0));
  if (!pos.length) return '<p class="text-ink-faint">—</p>';
  const minY = toYear(pos[0].start);
  const maxY = Math.max(...pos.map(p => toYear(p.end) || toYear(p.start) || minY), toYear(g.lifeSpan.end) || minY);
  const span = Math.max(maxY - minY, 1);
  return `<div class="space-y-2">` + pos.map((p, i) => {
    const s = toYear(p.start), e = toYear(p.end) || s;
    const left = ((s - minY) / span) * 100;
    const width = Math.max(((e - s) / span) * 100, 4);
    return `<div class="flex items-center gap-3">
      <span class="text-xs font-hei text-ink-faint tabular-nums w-24 shrink-0 text-right">${p.start}–${p.end || '今'}</span>
      <div class="flex-1 relative h-7 bg-stone-100 rounded">
        <div class="absolute h-full rounded flex items-center px-2 text-[11px] text-white font-hei whitespace-nowrap overflow-hidden"
          style="left:${left}%; width:${width}%; min-width:max-content; background:linear-gradient(90deg,${color},${CAMP_DEEP[g.camp]})">${p.title}</div>
      </div>
    </div>`;
  }).join('') + `</div>`;
}

function openGeneral(id) {
  const g = GEN_MAP[id]; if (!g) return;
  state.highlightBattle = null; clearHighlight();
  if (state.docGid !== id) state.docTab = 'life';   // 切换到新将领时重置为生平视角
  state.docGid = id;
  const color = CAMP_COLOR[g.camp], deep = CAMP_DEEP[g.camp];
  document.getElementById('panel-title').innerHTML =
    `${g.name} <span class="text-xs font-normal px-2 py-0.5 rounded ml-1 text-white align-middle" style="background:${deep}">${CAMP_LABEL[g.camp]} · ${g.rank}</span>` +
    (g._user ? `<span class="text-xs font-normal px-2 py-0.5 rounded ml-1 bg-emerald-100 text-emerald-700 align-middle">✎ 自建（本地）</span>` : '') +
    (g.aliases?.length ? `<span class="text-xs text-ink-faint ml-2 font-normal">${g.aliases.join(' · ')}</span>` : '');

  const posList = (g.keyPositions || []).map(p =>
    `<li class="flex gap-2"><span class="text-ink-faint font-hei text-xs shrink-0 w-24 tabular-nums">${p.start}–${p.end || '今'}</span><span>${p.title}</span></li>`).join('');
  const H = (t) => `<h3 class="font-hei font-bold text-ink-soft border-l-4 pl-2.5 mb-2 text-sm" style="border-color:${color}">${t}</h3>`;

  // 左栏（固定：基本信息 + 结局 + 评价）
  const leftCol = `
    <div class="lg:col-span-1 space-y-5">
      <div class="card rounded-lg p-4">
        ${FIELD_ROWS.map(([k, fn]) => `<div class="flex text-[13px] py-1 border-b border-dashed hairline last:border-0"><span class="w-20 text-ink-faint shrink-0 font-hei">${k}</span><span class="flex-1 font-hei">${fn(g) || '—'}</span></div>`).join('')}
      </div>
      <section>${H('重大历史行动')}<ul class="list-disc list-inside text-[13px] text-ink-soft space-y-1 font-hei">${(g.majorActions || []).map(a => `<li>${a}</li>`).join('') || '—'}</ul></section>
      <section>${H('最终历史结局')}<p class="text-[13px] text-ink-soft leading-relaxed font-hei">${g.finalOutcome || '—'}</p></section>
      <section class="bg-stone-50 rounded-lg p-4 border-l-4" style="border-color:${color}">
        <h3 class="font-hei font-bold text-ink-soft mb-1.5 text-sm">历史简要评价</h3>
        <p class="text-[13px] text-ink-soft leading-relaxed italic font-serif">${g.evaluation || '—'}</p>
      </section>
      <section class="text-[11px] text-ink-faint pt-2 border-t hairline font-hei">史料出处：${(g.sources || []).join('；')}</section>
    </div>`;

  // 右栏（三视角 tab）
  const TABS = [
    { key: 'life', label: '📜 生平阶段' },
    { key: 'battle', label: '⚔ 战役脉络' },
    { key: 'promotion', label: '📈 职务升迁' }
  ];
  const tabBar = `<div class="flex items-center gap-5 border-b hairline mb-4">
    ${TABS.map(t => `<button class="doc-tab pb-2 text-sm font-hei ${state.docTab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}</div>`;

  let tabContent = '';
  if (state.docTab === 'life') {
    tabContent = `<p class="text-[13px] text-ink-soft font-hei leading-relaxed mb-4 pb-3 border-b border-dashed hairline">${g.earlyExperience || ''}</p>${renderJourney(g, color)}`;
  } else if (state.docTab === 'battle') {
    tabContent = `<p class="text-xs text-ink-faint font-hei mb-3">按时间顺序展开该将领亲历的战役与历史事件，点击可查看该战全部参战将领。</p>${renderBattleTrack(g, color)}`;
  } else {
    tabContent = `<p class="text-xs text-ink-faint font-hei mb-3">历任核心职务的时间跨度对比（横条越长表示任职时间越久）。</p>${renderPromotion(g, color)}
      <div class="mt-4 pt-3 border-t border-dashed hairline"><ul class="space-y-1 text-[13px] font-hei text-ink-soft">${posList || '—'}</ul></div>`;
  }

  document.getElementById('panel-body').innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
      ${leftCol}
      <div class="lg:col-span-2">
        <section class="card rounded-lg p-5">
          ${tabBar}
          <div id="doc-tab-content">${tabContent}</div>
        </section>
      </div>
    </div>`;
  showPanel();
}

// =========================================================
//  战役/事件花名册
// =========================================================
function openNode(id) {
  const n = NODE_MAP[id]; if (!n) return;
  state.highlightBattle = id;
  highlightMarkers(id);

  const byCamp = { kmt: [], ccp: [] };
  (n.participants || []).forEach(p => { if (byCamp[p.camp]) byCamp[p.camp].push(p); });
  const col = (camp) => `
    <div class="flex-1 min-w-0">
      <h4 class="font-hei font-bold mb-2.5 flex items-center gap-2" style="color:${CAMP_COLOR[camp]}">
        <span class="w-3 h-3 rounded-sm" style="background:${CAMP_COLOR[camp]}"></span>${CAMP_LABEL[camp]}
        <span class="text-xs font-normal text-ink-faint">${byCamp[camp].length} 人</span></h4>
      <ul class="space-y-1.5">${byCamp[camp].map(p => {
        const g = GEN_MAP[p.generalId];
        return `<li class="text-[13px] font-hei"><button class="gen-link font-semibold hover:underline ${g?'':'cursor-default'}" data-gid="${p.generalId}" style="color:${CAMP_DEEP[camp]}">${g ? g.name : p.generalId}</button>
          <span class="text-ink-faint">— ${p.role}</span></li>`;
      }).join('') || '<li class="text-ink-faint text-sm">—</li>'}</ul>
    </div>`;

  const yrLabel = toYear(n.start) + (toYear(n.end) !== toYear(n.start) ? '–' + toYear(n.end) : '');
  document.getElementById('panel-title').innerHTML =
    `${n.name} <span class="text-xs font-normal text-white px-2 py-0.5 rounded ml-2 align-middle" style="background:#b45309">${n.category} · ${yrLabel}</span>`;
  document.getElementById('panel-body').innerHTML = `
    <div class="space-y-4 max-w-4xl mx-auto">
      <div class="card rounded-lg p-4 space-y-2 font-hei">
        <div class="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-ink-soft">
          <span>📍 <b class="text-ink">地点</b>：${n.location?.text || '—'}</span>
          <span>🏁 <b class="text-ink">结果</b>：${n.outcome || '—'}</span>
        </div>
        <p class="text-[13px] text-ink-soft leading-relaxed pt-2 border-t border-dashed hairline">${n.summary || ''}</p>
      </div>
      <div class="flex flex-col sm:flex-row gap-6 card rounded-lg p-4">${col('kmt')}${col('ccp')}</div>
      <div class="text-[11px] text-ink-faint font-hei">史料出处：${(n.sources || []).join('；')}</div>
    </div>`;
  showPanel();
}

// =========================================================
//  交集计算
// =========================================================
function computeIntersection(ids) {
  const gs = ids.map(id => GEN_MAP[id]).filter(Boolean);
  if (gs.length < 2) return null;
  const setsB = gs.map(g => new Set(g.battles || []));
  const setsE = gs.map(g => new Set(g.relatedEvents || []));
  const sharedBattles = [...setsB[0]].filter(b => setsB.every(s => s.has(b)));
  const sharedEvents  = [...setsE[0]].filter(e => setsE.every(s => s.has(e)));
  const ovStart = Math.max(...gs.map(g => toYear(g.activeSpan.start)));
  const ovEnd   = Math.min(...gs.map(g => toYear(g.activeSpan.end)));
  const timeOverlap = ovStart <= ovEnd ? { start: ovStart, end: ovEnd } : null;
  const relation = new Set(gs.map(g => g.camp)).size === 1 ? '同阵营' : '跨阵营';
  return { gs, sharedBattles, sharedEvents, timeOverlap, relation };
}

function openIntersection() {
  const r = computeIntersection([...state.selected]);
  if (!r) return;
  state.highlightBattle = null;

  const names = r.gs.map(g => `<b style="color:${CAMP_DEEP[g.camp]}">${g.name}</b>`).join(' <span class="text-ink-faint">×</span> ');
  const nodeChip = (id) => {
    const n = NODE_MAP[id];
    const rolesByGen = r.gs.map(g => {
      const p = (n.participants || []).find(pp => pp.generalId === g.id);
      return `<div class="flex gap-2"><span class="shrink-0 font-semibold" style="color:${CAMP_DEEP[g.camp]}">${g.name}</span><span class="text-ink-faint">${p ? p.role : '—'}</span></div>`;
    }).join('');
    const camps = new Set((n.participants || []).filter(p => r.gs.some(g => g.id === p.generalId)).map(p => p.camp));
    const sameCamp = camps.size === 1;
    return `<button class="node-link chip block w-full text-left card rounded-lg p-3 mb-2.5 hover:bg-amber-50" data-node="${id}">
      <div class="font-hei font-bold flex items-center gap-2 flex-wrap">${n.name}
        <span class="text-[11px] font-normal text-ink-faint">${n.category} · ${toYear(n.start)}</span>
        <span class="text-[11px] px-2 py-0.5 rounded-full font-medium ${sameCamp ? 'bg-stone-200 text-ink-soft' : 'bg-rose-100 text-rose-700'}">${sameCamp ? '同盟 / 同阵营' : '敌对 / 跨阵营'}</span></div>
      <div class="text-xs text-ink-soft mt-2 space-y-0.5 font-hei">${rolesByGen}</div>
    </button>`;
  };

  const shared = [...r.sharedBattles, ...r.sharedEvents];
  document.getElementById('panel-title').innerHTML = '人物交集分析 <span class="text-xs font-normal text-ink-faint ml-1">同一历史时空的交汇</span>';
  document.getElementById('panel-body').innerHTML = `
    <div class="space-y-4 max-w-4xl mx-auto font-hei">
      <div class="card rounded-lg p-4 flex items-center gap-3 flex-wrap">
        <span class="text-base">${names}</span>
        <span class="text-xs px-2.5 py-1 rounded-full ${r.relation==='跨阵营'?'bg-rose-100 text-rose-700':'bg-stone-200 text-ink-soft'}">关系：${r.relation}</span>
      </div>
      <div class="grid md:grid-cols-2 gap-5">
        <section>
          <h3 class="font-bold text-ink-soft mb-2.5 text-sm border-l-4 border-amber-500 pl-2.5">① 共同战役 / 事件（${shared.length}）</h3>
          ${shared.length ? shared.map(nodeChip).join('') : '<p class="text-ink-faint text-sm card rounded-lg p-3">无直接共同战役 / 事件记录</p>'}
        </section>
        <section class="space-y-4">
          <div>
            <h3 class="font-bold text-ink-soft mb-2.5 text-sm border-l-4 border-amber-500 pl-2.5">② 活跃时间交集</h3>
            ${r.timeOverlap
              ? `<div class="card rounded-lg p-3 text-[13px] text-ink-soft">活跃期重叠：<b class="tabular-nums text-ink">${r.timeOverlap.start} – ${r.timeOverlap.end}</b>（约 ${r.timeOverlap.end - r.timeOverlap.start} 年）</div>`
              : '<p class="text-ink-faint text-sm card rounded-lg p-3">活跃期无重叠</p>'}
          </div>
          <div>
            <h3 class="font-bold text-ink-soft mb-2.5 text-sm border-l-4 border-amber-500 pl-2.5">③ 各自出身对照</h3>
            <div class="card rounded-lg p-3 space-y-1.5 text-[13px]">
              ${r.gs.map(g => `<div class="flex gap-2 items-baseline"><span class="font-semibold shrink-0" style="color:${CAMP_DEEP[g.camp]}">${g.name}</span>
                <span class="text-ink-faint text-xs">${g.rank} · ${g.birthplace.province} · ${(g.academy||[])[0]||'—'}</span></div>`).join('')}
            </div>
          </div>
        </section>
      </div>
    </div>`;
  if (r.sharedBattles.length) highlightMarkers(r.sharedBattles[0]);
  showPanel();
}

// =========================================================
//  高亮 / 面板 / tooltip
// =========================================================
function highlightMarkers(nodeId) {
  document.querySelectorAll('.marker').forEach(m => m.classList.toggle('hl', m.dataset.node === nodeId));
}
function clearHighlight() { document.querySelectorAll('.marker.hl').forEach(m => m.classList.remove('hl')); }
function showPanel() { document.getElementById('panel').classList.remove('hidden-panel'); }
function hidePanel() { document.getElementById('panel').classList.add('hidden-panel'); clearHighlight(); }

const tooltip = document.getElementById('tooltip');
function showTip(html, x, y) {
  tooltip.innerHTML = html;
  const tw = 240;
  tooltip.style.left = Math.min(x + 14, window.innerWidth - tw) + 'px';
  tooltip.style.top = (y + 14) + 'px';
  tooltip.classList.remove('hidden');
}
function hideTip() { tooltip.classList.add('hidden'); }

// =========================================================
//  筛选面板
// =========================================================
function uniq(arr) { return [...new Set(arr)]; }
function buildFilters() {
  const provinces = uniq(GENERALS.map(g => g.birthplace.province)).sort();
  const academies = ['黄埔军校','保定军校','讲武堂','苏联军校','日本军校','欧美院校','行伍/其他'].filter(a => GENERALS.some(g => academyTags(g).includes(a)));
  const ranks = ['元帅','大将','特级上将','一级上将','二级上将','中将'].filter(r => GENERALS.some(g => rankTag(g) === r || (r==='特级上将'&&/特级/.test(g.rank))));
  const rankList = uniq(GENERALS.map(rankTag));

  const groups = [
    { key: 'camp', title: '阵营', items: [['kmt', '国民党'], ['ccp', '共产党']] },
    { key: 'rank', title: '军衔', items: ['元帅','大将','一级上将','二级上将','中将','其他'].filter(r=>rankList.includes(r)).map(r => [r, r]) },
    { key: 'academy', title: '毕业军校', items: academies.map(a => [a, a]) },
    { key: 'province', title: '籍贯（省）', items: provinces.map(p => [p, p]) },
    { key: 'battle', title: '参与战役 / 事件', items: [...BATTLES.filter(b=>!b.belongsTo), ...EVENTS].map(b => [b.id, b.name]) }
  ];

  document.getElementById('filters').innerHTML = groups.map(grp => `
    <div>
      <div class="font-bold text-ink-soft mb-2 text-xs tracking-widest flex items-center gap-2">
        <span class="w-1 h-3.5 bg-amber-600 rounded-full"></span>${grp.title}</div>
      <div class="space-y-0.5 max-h-40 overflow-y-auto pr-1">
        ${grp.items.map(([val, label]) => `
          <label class="flex items-center gap-2 cursor-pointer hover:bg-parchment-dark rounded px-1.5 py-1 transition">
            <input type="checkbox" class="filter-cb accent-amber-600 w-3.5 h-3.5" data-group="${grp.key}" value="${val}">
            <span class="text-ink-soft text-[13px]">${label}</span>
          </label>`).join('')}
      </div>
    </div>`).join('');
}

// =========================================================
//  事件绑定
// =========================================================
function bindTrackEvents() {
  const tracks = document.getElementById('tracks');
  tracks.querySelectorAll('[data-gid]').forEach(el => {
    if (el.classList.contains('act-bar')) return;
    el.onclick = (e) => {
      const gid = el.dataset.gid;
      if (e.shiftKey) toggleSelect(gid);
      else openGeneral(gid);
    };
  });
  tracks.querySelectorAll('.marker').forEach(m => {
    m.onclick = (e) => { e.stopPropagation(); openNode(m.dataset.node); };
    m.onmousemove = (e) => {
      const n = NODE_MAP[m.dataset.node], g = GEN_MAP[m.dataset.gid];
      const p = (n.participants || []).find(pp => pp.generalId === m.dataset.gid);
      showTip(`<b class="text-amber-300">${n.name}</b>（${toYear(n.start)}）<br><span style="color:${CAMP_COLOR[g.camp]==='#1d4ed8'?'#93c5fd':'#fca5a5'}">${g.name}</span>：${p ? p.role : ''}<br>📍 ${n.location?.text || ''}`, e.clientX, e.clientY);
    };
    m.onmouseleave = hideTip;
  });
}

function toggleSelect(gid) {
  if (state.selected.has(gid)) state.selected.delete(gid);
  else state.selected.add(gid);
  const btn = document.getElementById('compareBtn');
  btn.textContent = `对比交集 (${state.selected.size})`;
  btn.disabled = state.selected.size < 2;
  renderTracks(); bindTrackEvents();
}

function bindGlobalEvents() {
  document.getElementById('filters').addEventListener('change', (e) => {
    if (!e.target.classList.contains('filter-cb')) return;
    const set = state.filters[e.target.dataset.group];
    e.target.checked ? set.add(e.target.value) : set.delete(e.target.value);
    renderTracks(); bindTrackEvents();
  });

  document.getElementById('era-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.era-btn'); if (!btn) return;
    state.era = btn.dataset.era;
    renderEraTabs(); renderTracks(); bindTrackEvents();
  });

  document.getElementById('panel-body').addEventListener('click', (e) => {
    const tab = e.target.closest('.doc-tab');
    if (tab) { state.docTab = tab.dataset.tab; if (state.docGid) openGeneral(state.docGid); return; }
    const nl = e.target.closest('.node-link'); if (nl) { openNode(nl.dataset.node); return; }
    const gl = e.target.closest('.gen-link'); if (gl && GEN_MAP[gl.dataset.gid]) { openGeneral(gl.dataset.gid); return; }
  });

  // 模式切换：时间轴 ↔ 战争
  document.getElementById('mode-switch').addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-btn'); if (!btn) return;
    setMode(btn.dataset.mode);
  });
  // 战役选择器
  document.getElementById('war-select').addEventListener('change', (e) => {
    state.warNode = e.target.value;
    renderWarView();
  });

  document.getElementById('panel-close').onclick = hidePanel;
  document.getElementById('compareBtn').onclick = openIntersection;
  document.getElementById('resetBtn').onclick = resetAll;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePanel(); });

  document.getElementById('search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim(); if (!q) return;
    const g = GENERALS.find(x => x.name.includes(q) || (x.aliases || []).some(a => a.includes(q)));
    if (g) { openGeneral(g.id); return; }
    const n = [...BATTLES, ...EVENTS].find(x => x.name.includes(q));
    if (n) openNode(n.id);
  });
}

function resetAll() {
  Object.values(state.filters).forEach(s => s.clear());
  state.selected.clear();
  state.era = 'all';
  state.highlightBattle = null;
  document.querySelectorAll('.filter-cb').forEach(cb => cb.checked = false);
  document.getElementById('compareBtn').textContent = '对比交集 (0)';
  document.getElementById('compareBtn').disabled = true;
  hidePanel();
  setMode('timeline');
  renderEraTabs(); renderTracks(); bindTrackEvents();
}

// =========================================================
//  新增将领 / 我的将领（本地 localStorage）
// =========================================================
function toast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-lg text-sm font-hei shadow-xl ' +
    (type === 'error' ? 'bg-rose-600 text-white' : 'bg-emerald-700 text-white');
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}
function showModal() { document.getElementById('modal-mask').classList.remove('hidden'); }
function hideModal() { document.getElementById('modal-mask').classList.add('hidden'); }

// 刷新全部视图（新增/删除后调用）
function refreshAll() {
  rebuildData();
  buildFilters();
  renderAxis();
  renderTracks(); bindTrackEvents();
  if (state.mode === 'war') { document.getElementById('war-select').removeAttribute('data-built'); buildWarSelect(); renderWarView(); }
  updateMyCount();
}
function updateMyCount() {
  document.getElementById('myCount').textContent = USER_GENERALS.length;
}

function bindAddGeneral() {
  updateMyCount();
  document.getElementById('addBtn').onclick = openAddModal;
  document.getElementById('myBtn').onclick = openMyModal;
  document.getElementById('modal-close').onclick = hideModal;
  document.getElementById('modal-mask').addEventListener('click', (e) => {
    if (e.target.id === 'modal-mask') hideModal();
  });
}

// 战役/事件多选清单
function battleCheckList() {
  const nodes = [...BATTLES.filter(b => !b.belongsTo), ...EVENTS].sort((a, b) => (toYear(a.start) || 0) - (toYear(b.start) || 0));
  return nodes.map(n =>
    `<label class="flex items-center gap-1.5 cursor-pointer hover:bg-parchment-dark rounded px-1.5 py-0.5 text-[12px]">
      <input type="checkbox" class="f-battle accent-amber-600 w-3.5 h-3.5" value="${n.id}">
      <span>${n.name}<span class="text-ink-faint text-[10px]">·${toYear(n.start)}</span></span>
    </label>`).join('');
}

function rankSelectHtml(camp) {
  return RANK_OPTIONS[camp].map(r => `<option value="${r}">${r}</option>`).join('');
}

function openAddModal() {
  document.getElementById('modal-title').textContent = '＋ 新增将领（本地保存）';
  const L = (label, inner, hint) => `<div class="mb-3"><label class="block text-xs font-bold text-ink-soft mb-1">${label}${hint?`<span class="font-normal text-ink-faint ml-1">${hint}</span>`:''}</label>${inner}</div>`;
  const ipt = (id, ph, req) => `<input id="f-${id}" placeholder="${ph||''}" class="w-full border hairline rounded px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-amber-400 outline-none ${req?'':''}">`;
  const ta = (id, ph) => `<textarea id="f-${id}" placeholder="${ph||''}" rows="2" class="w-full border hairline rounded px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-amber-400 outline-none"></textarea>`;

  document.getElementById('modal-body').innerHTML = `
    <div class="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-800 leading-relaxed">
      ⚠ <b>准入限制</b>：仅支持录入<b>少将及以上</b>军衔的国共将领；军衔从下拉选择，不在范围内无法保存。<br>
      💾 <b>数据说明</b>：新增将领仅保存在<b>你当前浏览器</b>，刷新/重开仍在，但换设备或清缓存会丢失，也不会同步给他人。公共的 30 位将领所有人可见。
    </div>
    <div class="grid grid-cols-2 gap-x-4">
      ${L('阵营 *', `<select id="f-camp" class="w-full border hairline rounded px-2.5 py-1.5 text-sm outline-none"><option value="kmt">国民党</option><option value="ccp">共产党</option></select>`)}
      ${L('军衔 *', `<select id="f-rank" class="w-full border hairline rounded px-2.5 py-1.5 text-sm outline-none">${rankSelectHtml('kmt')}</select>`, '少将及以上')}
      ${L('姓名 *', ipt('name', '如：孙立人'))}
      ${L('字 / 别名', ipt('aliases', '多个用、分隔'))}
      ${L('性别', `<select id="f-gender" class="w-full border hairline rounded px-2.5 py-1.5 text-sm outline-none"><option value="male">男</option><option value="female">女</option></select>`)}
      ${L('籍贯省份', ipt('province', '如：安徽'))}
      ${L('出生地', ipt('birthplace', '如：安徽庐江'))}
      ${L('毕业院校', ipt('academy', '多个用、分隔'))}
      ${L('出生日期 *', ipt('birthDate', 'YYYY-MM-DD 或 YYYY'), '至少填年份')}
      ${L('逝世日期', ipt('deathDate', 'YYYY-MM-DD 或 YYYY'))}
      ${L('活跃起始年 *', ipt('activeStart', '如：1924'), '轨迹条起点')}
      ${L('活跃结束年 *', ipt('activeEnd', '如：1949'), '轨迹条终点')}
    </div>
    ${L('安葬地点', ipt('burial'))}
    ${L('早期经历', ta('early'))}
    ${L('重大历史行动', ta('actions', '多条用；分隔'))}
    ${L('最终历史结局', ta('outcome'))}
    ${L('历史简要评价', ta('evaluation'))}
    ${L('史料出处', ipt('sources', '多个用；分隔，建议填写权威史料'))}
    ${L('参与战役 / 事件', `<div class="grid grid-cols-3 gap-x-2 max-h-32 overflow-y-auto border hairline rounded p-2">${battleCheckList()}</div>`)}
    <div class="mt-4 mb-1">
      <label class="block text-xs font-bold text-ink-soft mb-1">历任核心职务 <span class="font-normal text-ink-faint">（成长轨迹将据此生成）</span></label>
      <div id="pos-rows" class="space-y-2"></div>
      <button id="add-pos" class="mt-2 text-xs text-emerald-700 hover:underline">＋ 添加一条职务</button>
    </div>
    <div class="flex gap-3 mt-5 pt-4 border-t hairline">
      <button id="save-gen" class="flex-1 bg-emerald-700 text-white py-2.5 rounded-lg hover:bg-emerald-600 font-medium">保存将领</button>
      <button id="cancel-gen" class="px-5 py-2.5 rounded-lg border hairline hover:bg-stone-50">取消</button>
    </div>`;

  // 阵营切换 → 军衔选项联动
  document.getElementById('f-camp').onchange = (e) => {
    document.getElementById('f-rank').innerHTML = rankSelectHtml(e.target.value);
  };
  // 职务动态行
  const posRows = document.getElementById('pos-rows');
  const addPosRow = (t = '', s = '', en = '') => {
    const row = document.createElement('div');
    row.className = 'pos-row flex gap-2 items-center';
    row.innerHTML = `
      <input class="p-title flex-1 border hairline rounded px-2 py-1 text-xs" placeholder="职务名称" value="${t}">
      <input class="p-start w-16 border hairline rounded px-2 py-1 text-xs" placeholder="起年" value="${s}">
      <input class="p-end w-16 border hairline rounded px-2 py-1 text-xs" placeholder="止年" value="${en}">
      <button class="p-del text-rose-500 hover:text-rose-700 px-1 text-lg leading-none">&times;</button>`;
    row.querySelector('.p-del').onclick = () => row.remove();
    posRows.appendChild(row);
  };
  addPosRow();
  document.getElementById('add-pos').onclick = () => addPosRow();

  document.getElementById('cancel-gen').onclick = hideModal;
  document.getElementById('save-gen').onclick = collectAndSaveGeneral;
  showModal();
}

function collectAndSaveGeneral() {
  const val = id => (document.getElementById('f-' + id)?.value || '').trim();
  const camp = val('camp');
  const rank = val('rank');
  const name = val('name');

  // 校验：必填
  if (!name) return toast('请填写姓名', 'error');
  if (!val('birthDate')) return toast('请填写出生日期（至少年份）', 'error');
  if (!val('activeStart') || !val('activeEnd')) return toast('请填写活跃起止年（时间轴轨迹所需）', 'error');

  // 校验：军衔门槛（双保险，虽然下拉已限制）
  if (!RANK_OPTIONS[camp] || !RANK_OPTIONS[camp].includes(rank)) {
    return toast('军衔不符合准入要求：仅限少将及以上', 'error');
  }
  // 校验：重名
  const nm = name;
  if (GENERALS.some(g => g.name === nm)) return toast('已存在同名将领：' + nm, 'error');

  // 收集战役勾选
  const battles = [...document.querySelectorAll('.f-battle:checked')].map(c => c.value)
    .filter(id => BATTLE_MAP[id]);
  const relatedEvents = [...document.querySelectorAll('.f-battle:checked')].map(c => c.value)
    .filter(id => EVENT_MAP[id]);

  // 收集职务 → 同时生成 journey
  const positions = [...document.querySelectorAll('.pos-row')].map(r => ({
    title: r.querySelector('.p-title').value.trim(),
    start: r.querySelector('.p-start').value.trim(),
    end: r.querySelector('.p-end').value.trim()
  })).filter(p => p.title);
  const journey = positions
    .filter(p => p.start)
    .sort((a, b) => (parseInt(a.start) || 0) - (parseInt(b.start) || 0))
    .map(p => ({ year: p.start, age: null, era: '自建', title: p.title, detail: `任${p.title}。` }));

  const splitList = s => s ? s.split(/[、,；;]/).map(x => x.trim()).filter(Boolean) : [];
  const bd = val('birthDate'), dd = val('deathDate');
  const as = val('activeStart'), ae = val('activeEnd');

  const g = {
    id: 'user-' + Date.now().toString(36) + '-' + Math.floor(performance.now()).toString(36),
    name: nm,
    aliases: splitList(val('aliases')),
    camp, rank,
    _user: true,
    gender: val('gender') || 'male',
    birthplace: { text: val('birthplace') || val('province') || '—', province: val('province') || '未知' },
    birthDate: bd,
    deathDate: dd || '',
    datePrecision: { birth: bd.length > 4 ? 'day' : 'year', death: dd.length > 4 ? 'day' : (dd ? 'year' : 'year') },
    burialPlace: val('burial') || '—',
    academy: splitList(val('academy')),
    earlyExperience: val('early') || '',
    keyPositions: positions,
    journey,
    battles, relatedEvents,
    majorActions: splitList(val('actions')),
    finalOutcome: val('outcome') || '',
    evaluation: val('evaluation') || '',
    lifeSpan: { start: bd, end: dd || (as ? String(parseInt(as) + 1) : bd) },
    activeSpan: { start: as, end: ae },
    era: ['自建'],
    sources: splitList(val('sources'))
  };

  USER_GENERALS.push(g);
  saveUserGenerals();
  refreshAll();
  hideModal();
  toast('已新增：' + nm + '（保存在本地浏览器）');
  setTimeout(() => openGeneral(g.id), 150);
}

function openMyModal() {
  document.getElementById('modal-title').textContent = '我的将领（本地自建）';
  if (!USER_GENERALS.length) {
    document.getElementById('modal-body').innerHTML = `
      <div class="text-center py-10 text-ink-faint">
        <p class="mb-3">你还没有自建将领。</p>
        <button id="goadd" class="bg-emerald-700 text-white px-4 py-2 rounded-lg hover:bg-emerald-600">＋ 立即新增</button>
      </div>`;
    document.getElementById('goadd').onclick = openAddModal;
    showModal(); return;
  }
  document.getElementById('modal-body').innerHTML = `
    <div class="mb-3 text-[12px] text-ink-faint">共 ${USER_GENERALS.length} 位自建将领，仅保存在本浏览器。</div>
    <div class="space-y-2">
      ${USER_GENERALS.map(g => `
        <div class="flex items-center gap-3 card rounded-lg p-3">
          <span class="w-3 h-3 rounded-sm shrink-0" style="background:${CAMP_COLOR[g.camp]}"></span>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-ink">${g.name} <span class="text-xs font-normal text-ink-faint">${CAMP_LABEL[g.camp]} · ${g.rank}</span></div>
            <div class="text-[11px] text-ink-faint truncate">${g.activeSpan.start}–${g.activeSpan.end} · ${(g.academy||[]).join('、')||'—'}</div>
          </div>
          <button class="view-my text-xs text-blue-700 hover:underline shrink-0" data-gid="${g.id}">查看</button>
          <button class="del-my text-xs text-rose-600 hover:underline shrink-0" data-gid="${g.id}">删除</button>
        </div>`).join('')}
    </div>
    <button id="goadd2" class="mt-4 w-full bg-emerald-700 text-white py-2 rounded-lg hover:bg-emerald-600">＋ 继续新增</button>`;
  document.getElementById('goadd2').onclick = openAddModal;
  document.getElementById('modal-body').querySelectorAll('.view-my').forEach(b => {
    b.onclick = () => { hideModal(); openGeneral(b.dataset.gid); };
  });
  document.getElementById('modal-body').querySelectorAll('.del-my').forEach(b => {
    b.onclick = () => deleteUserGeneral(b.dataset.gid);
  });
  showModal();
}

function deleteUserGeneral(id) {
  const g = GEN_MAP[id];
  if (!g || !g._user) return;
  if (!confirm(`确定删除自建将领「${g.name}」？此操作不可撤销。`)) return;
  USER_GENERALS = USER_GENERALS.filter(x => x.id !== id);
  saveUserGenerals();
  refreshAll();
  state.selected.delete(id);
  openMyModal();
  toast('已删除：' + g.name);
}

function setMode(mode) {
  state.mode = mode;
  const isWar = mode === 'war';
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('era-controls').classList.toggle('hidden', isWar);
  document.getElementById('war-controls').classList.toggle('hidden', !isWar);
  document.getElementById('war-controls').classList.toggle('flex', isWar);
  document.getElementById('view-timeline').classList.toggle('hidden', isWar);
  document.getElementById('view-war').classList.toggle('hidden', !isWar);
  document.getElementById('side-filters').classList.toggle('hidden', isWar);  // 战争模式隐藏左筛选
  document.getElementById('compareBtn').classList.toggle('hidden', isWar);
  if (isWar) { buildWarSelect(); renderWarView(); }
}

function buildWarSelect() {
  const sel = document.getElementById('war-select');
  if (sel.dataset.built) return;
  const nodes = [...BATTLES.filter(b => !b.belongsTo), ...EVENTS]
    .sort((a, b) => (toYear(a.start) || 0) - (toYear(b.start) || 0));
  sel.innerHTML = nodes.map(n =>
    `<option value="${n.id}">${toYear(n.start)}　${n.name}（${n.category}）</option>`).join('');
  sel.dataset.built = '1';
  if (!state.warNode) state.warNode = nodes[0]?.id || null;
  sel.value = state.warNode;
}

function renderWarView() {
  const box = document.getElementById('view-war');
  const n = NODE_MAP[state.warNode];
  if (!n) { box.innerHTML = '<p class="text-ink-faint font-hei">请选择一场战役 / 事件</p>'; return; }
  document.getElementById('war-hint').textContent = `${n.location?.text || ''} · ${toYear(n.start)}${toYear(n.end) !== toYear(n.start) ? '–' + toYear(n.end) : ''}`;

  const byCamp = { kmt: [], ccp: [] };
  (n.participants || []).forEach(p => { if (byCamp[p.camp]) byCamp[p.camp].push(p); });

  // 战役内时间线（若有子战役/归属，展示同期相关节点）
  const related = BATTLES.filter(b => b.belongsTo === n.id);
  const timelineHtml = related.length ? `
    <div class="mt-2 pt-3 border-t border-dashed hairline">
      <div class="text-xs font-hei text-ink-faint mb-2">下辖 / 相关战斗</div>
      <div class="flex flex-wrap gap-2">${related.map(r =>
        `<button class="node-link chip text-xs px-2.5 py-1 rounded-md border bg-stone-100 hover:bg-amber-50 font-hei" data-warnode="${r.id}">${toYear(r.start)} ${r.name}</button>`).join('')}</div>
    </div>` : '';

  const camp = (c) => {
    const list = byCamp[c];
    return `<div class="flex-1 min-w-0">
      <h3 class="font-hei font-bold text-base mb-3 flex items-center gap-2 pb-2 border-b-2" style="color:${CAMP_DEEP[c]};border-color:${CAMP_COLOR[c]}">
        <span class="w-4 h-4 rounded" style="background:${CAMP_COLOR[c]}"></span>${CAMP_LABEL[c]}
        <span class="text-sm font-normal text-ink-faint">参战 ${list.length} 位</span></h3>
      <div class="space-y-2">${list.length ? list.map(p => {
        const g = GEN_MAP[p.generalId];
        return `<button class="gen-link chip block w-full text-left card rounded-lg p-3 hover:bg-amber-50 ${g ? '' : 'cursor-default'}" data-gid="${p.generalId}">
          <div class="flex items-baseline gap-2 flex-wrap">
            <span class="font-hei font-bold" style="color:${CAMP_DEEP[c]}">${g ? g.name : p.generalId}</span>
            ${g ? `<span class="text-[11px] text-ink-faint">${g.rank}</span>` : ''}
          </div>
          <div class="text-[13px] text-ink-soft mt-1 font-hei">${p.role}</div>
        </button>`;
      }).join('') : '<p class="text-ink-faint text-sm font-hei card rounded-lg p-3">该阵营无收录将领参战</p>'}</div>
    </div>`;
  };

  const bothSides = byCamp.kmt.length && byCamp.ccp.length;
  const relTag = bothSides
    ? `<span class="text-xs px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 font-hei">国共双方交战 / 交汇</span>`
    : `<span class="text-xs px-2.5 py-1 rounded-full bg-stone-200 text-ink-soft font-hei">单方为主</span>`;

  box.innerHTML = `
    <div class="max-w-5xl mx-auto space-y-5 font-hei">
      <div class="card rounded-xl p-5">
        <div class="flex items-center gap-3 flex-wrap mb-3">
          <h2 class="font-serif font-bold text-xl text-ink">${n.name}</h2>
          <span class="text-xs text-white px-2 py-0.5 rounded" style="background:#b45309">${n.category}</span>
          ${relTag}
        </div>
        <div class="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] text-ink-soft">
          <div>📅 <b class="text-ink">时间</b>：${n.start}${n.end && n.end !== n.start ? ' 至 ' + n.end : ''}</div>
          <div>📍 <b class="text-ink">地点</b>：${n.location?.text || '—'}</div>
          <div class="sm:col-span-2">🏁 <b class="text-ink">结果</b>：${n.outcome || '—'}</div>
        </div>
        <p class="text-[13px] text-ink-soft leading-relaxed mt-3 pt-3 border-t border-dashed hairline">${n.summary || ''}</p>
        ${timelineHtml}
        <div class="text-[11px] text-ink-faint mt-3">史料出处：${(n.sources || []).join('；')}</div>
      </div>
      <div class="flex flex-col md:flex-row gap-6">${camp('kmt')}${camp('ccp')}</div>
      <p class="text-center text-xs text-ink-faint">点击任一将领卡片可跳转其完整档案</p>
    </div>`;
}

// ---------- 启动 ----------
function init() {
  loadUserGenerals();
  rebuildData();
  if (!GENERALS.length) { document.getElementById('tracks').innerHTML = '<p class="p-4 text-red-600 font-hei">数据加载失败</p>'; return; }
  renderAxis();
  renderEraTabs();
  buildFilters();
  renderTracks();
  bindTrackEvents();
  bindGlobalEvents();
  bindAddGeneral();

  // 战争视图内的点击委托（将领跳档案 / 相关战斗切换）
  document.getElementById('view-war').addEventListener('click', (e) => {
    const wn = e.target.closest('[data-warnode]');
    if (wn) { state.warNode = wn.dataset.warnode; document.getElementById('war-select').value = wn.dataset.warnode; renderWarView(); return; }
    const gl = e.target.closest('.gen-link');
    if (gl && GEN_MAP[gl.dataset.gid]) { openGeneral(gl.dataset.gid); return; }
  });

  setMode('timeline');   // 初始化模式按钮激活态
}
document.addEventListener('DOMContentLoaded', init);
})();
