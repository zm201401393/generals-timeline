/* 近现代国共将领交互式历史年表 — 应用逻辑 v2 */
(() => {
'use strict';

// ---------- 数据装载 ----------
const GENERALS = window.DATA_GENERALS || [];
const BATTLES  = window.DATA_BATTLES  || [];
const EVENTS   = window.DATA_EVENTS   || [];
const BATTLE_MAP = Object.fromEntries(BATTLES.map(b => [b.id, b]));
const EVENT_MAP  = Object.fromEntries(EVENTS.map(e => [e.id, e]));
const GEN_MAP    = Object.fromEntries(GENERALS.map(g => [g.id, g]));
const NODE_MAP   = { ...BATTLE_MAP, ...EVENT_MAP };

const CAMP_LABEL = { kmt: '国民党', ccp: '共产党' };
const CAMP_COLOR = { kmt: '#1d4ed8', ccp: '#b91c1c' };
const CAMP_DEEP  = { kmt: '#1e3a8a', ccp: '#7f1d1d' };

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

const ALL_YEARS = GENERALS.flatMap(g => [toYear(g.lifeSpan.start), toYear(g.lifeSpan.end)]).filter(Boolean);
const AXIS_MIN = Math.min(...ALL_YEARS, 1882);
const AXIS_MAX = Math.max(...ALL_YEARS, 2001);
const PX_PER_YEAR = 9;
const LABEL_W = 96;                       // 左侧姓名固定列宽
const AXIS_W = LABEL_W + (AXIS_MAX - AXIS_MIN) * PX_PER_YEAR + 30;
const ROW_H = 34;
const xOf = y => LABEL_W + (y - AXIS_MIN) * PX_PER_YEAR;

// ---------- 状态 ----------
const state = {
  filters: { camp: new Set(), province: new Set(), academy: new Set(), battle: new Set(), rank: new Set() },
  era: 'all',
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
    name.innerHTML = `${g.name}<span class="ml-1 text-[9px] font-normal opacity-60">${(g.rank||'').replace('中华人民共和国','').replace('中国人民解放军','')}</span>`;
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
  return `<div class="journey-line relative pl-9 space-y-4">` + g.journey.map(j => {
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

function openGeneral(id) {
  const g = GEN_MAP[id]; if (!g) return;
  state.highlightBattle = null; clearHighlight();
  const color = CAMP_COLOR[g.camp], deep = CAMP_DEEP[g.camp];
  document.getElementById('panel-title').innerHTML =
    `${g.name} <span class="text-xs font-normal px-2 py-0.5 rounded ml-1 text-white align-middle" style="background:${deep}">${CAMP_LABEL[g.camp]} · ${g.rank}</span>` +
    (g.aliases?.length ? `<span class="text-xs text-ink-faint ml-2 font-normal">${g.aliases.join(' · ')}</span>` : '');

  const posList = (g.keyPositions || []).map(p =>
    `<li class="flex gap-2"><span class="text-ink-faint font-hei text-xs shrink-0 w-24 tabular-nums">${p.start}–${p.end || '今'}</span><span>${p.title}</span></li>`).join('');
  const chip = (id, isEvent) => {
    const n = NODE_MAP[id]; if (!n) return '';
    const bg = isEvent ? 'bg-amber-50 border-amber-300 hover:bg-amber-100' : 'bg-stone-100 border-stone-300 hover:bg-amber-50';
    return `<button class="node-link chip inline-block ${bg} border rounded-md px-2.5 py-1 text-xs mr-1.5 mb-1.5 font-hei" data-node="${id}">${n.name}</button>`;
  };
  const battleChips = (g.battles || []).map(b => chip(b, false)).join('');
  const eventChips = (g.relatedEvents || []).map(e => chip(e, true)).join('');
  const H = (t) => `<h3 class="font-hei font-bold text-ink-soft border-l-4 pl-2.5 mb-2 text-sm" style="border-color:${color}">${t}</h3>`;

  document.getElementById('panel-body').innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
      <div class="lg:col-span-1 space-y-5">
        <div class="card rounded-lg p-4">
          ${FIELD_ROWS.map(([k, fn]) => `<div class="flex text-[13px] py-1 border-b border-dashed hairline last:border-0"><span class="w-20 text-ink-faint shrink-0 font-hei">${k}</span><span class="flex-1 font-hei">${fn(g) || '—'}</span></div>`).join('')}
        </div>
        <section>${H('历任核心职务')}<ul class="space-y-1 text-[13px] font-hei text-ink-soft">${posList || '—'}</ul></section>
        <section>${H('参与关键战役')}<div>${battleChips || '<span class="text-ink-faint">—</span>'}</div></section>
        <section>${H('重要历史事件关联')}<div>${eventChips || '<span class="text-ink-faint">—</span>'}</div></section>
      </div>
      <div class="lg:col-span-2 space-y-5">
        <section class="card rounded-lg p-5">
          ${H('成长轨迹 · 一生历程')}
          <p class="text-[13px] text-ink-soft font-hei leading-relaxed mb-4 pb-3 border-b border-dashed hairline">${g.earlyExperience || ''}</p>
          ${renderJourney(g, color)}
        </section>
        <div class="grid md:grid-cols-2 gap-5">
          <section>${H('重大历史行动')}<ul class="list-disc list-inside text-[13px] text-ink-soft space-y-1 font-hei">${(g.majorActions || []).map(a => `<li>${a}</li>`).join('') || '—'}</ul></section>
          <section>${H('最终历史结局')}<p class="text-[13px] text-ink-soft leading-relaxed font-hei">${g.finalOutcome || '—'}</p></section>
        </div>
        <section class="bg-stone-50 rounded-lg p-4 border-l-4" style="border-color:${color}">
          <h3 class="font-hei font-bold text-ink-soft mb-1.5 text-sm">历史简要评价</h3>
          <p class="text-[13px] text-ink-soft leading-relaxed italic font-serif">${g.evaluation || '—'}</p>
        </section>
        <section class="text-[11px] text-ink-faint pt-2 border-t hairline font-hei">史料出处：${(g.sources || []).join('；')}</section>
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
    const nl = e.target.closest('.node-link'); if (nl) { openNode(nl.dataset.node); return; }
    const gl = e.target.closest('.gen-link'); if (gl && GEN_MAP[gl.dataset.gid]) { openGeneral(gl.dataset.gid); return; }
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
  renderEraTabs(); renderTracks(); bindTrackEvents();
}

// ---------- 启动 ----------
function init() {
  if (!GENERALS.length) { document.getElementById('tracks').innerHTML = '<p class="p-4 text-red-600 font-hei">数据加载失败</p>'; return; }
  renderAxis();
  renderEraTabs();
  buildFilters();
  renderTracks();
  bindTrackEvents();
  bindGlobalEvents();
}
document.addEventListener('DOMContentLoaded', init);
})();
