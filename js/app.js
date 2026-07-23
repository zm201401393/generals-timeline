/* 近现代国共将领交互式历史年表 — 应用逻辑 */
(() => {
'use strict';

// ---------- 数据装载 ----------
const GENERALS = window.DATA_GENERALS || [];
const BATTLES  = window.DATA_BATTLES  || [];
const EVENTS   = window.DATA_EVENTS   || [];
const BATTLE_MAP = Object.fromEntries(BATTLES.map(b => [b.id, b]));
const EVENT_MAP  = Object.fromEntries(EVENTS.map(e => [e.id, e]));
const GEN_MAP    = Object.fromEntries(GENERALS.map(g => [g.id, g]));
const NODE_MAP   = { ...BATTLE_MAP, ...EVENT_MAP }; // 战役+事件统一查询

const CAMP_LABEL = { kmt: '国民党', ccp: '共产党' };
const CAMP_COLOR = { kmt: '#2563eb', ccp: '#dc2626' };

// 历史阶段色带（背景）
const ERAS = [
  { name: '国共合作/北伐', start: 1924, end: 1927, color: 'rgba(168,85,247,.08)', border: '#a855f7' },
  { name: '土地革命战争', start: 1927, end: 1937, color: 'rgba(234,88,12,.07)',  border: '#ea580c' },
  { name: '抗日战争',     start: 1937, end: 1945, color: 'rgba(22,163,74,.08)',  border: '#16a34a' },
  { name: '解放战争',     start: 1945, end: 1950, color: 'rgba(220,38,38,.07)',  border: '#dc2626' }
];

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

// 时间轴总范围
const ALL_YEARS = GENERALS.flatMap(g => [toYear(g.lifeSpan.start), toYear(g.lifeSpan.end)]).filter(Boolean);
const AXIS_MIN = Math.min(...ALL_YEARS, 1885);
const AXIS_MAX = Math.max(...ALL_YEARS, 2001);
const PX_PER_YEAR = 9;           // 横向比例尺
const AXIS_W = (AXIS_MAX - AXIS_MIN) * PX_PER_YEAR;
const ROW_H = 30;

const xOf = y => (y - AXIS_MIN) * PX_PER_YEAR;

// ---------- 应用状态 ----------
const state = {
  filters: { camp: new Set(), province: new Set(), academy: new Set(), battle: new Set(), decade: new Set() },
  range: { start: null, end: null },   // 区间刷选（年）
  selected: new Set(),                  // 对比选中的将领 id
  highlightBattle: null                 // 当前高亮战役
};

// ---------- 派生：军校归一化（黄埔/保定等）----------
function academyTags(g) {
  const tags = new Set();
  (g.academy || []).forEach(a => {
    if (/黄埔/.test(a)) tags.add('黄埔军校');
    else if (/保定/.test(a)) tags.add('保定军校');
    else if (/讲武堂/.test(a)) tags.add('讲武堂');
    else if (/伏龙芝|苏联|莫斯科|红军学校/.test(a)) tags.add('苏联军校');
    else tags.add('其他/行伍');
  });
  return [...tags];
}
function decadeTag(g) {
  const y = toYear(g.birthDate);
  return y == null ? '未知' : `${Math.floor(y / 10) * 10}后`;
}

// ---------- 筛选判定 ----------
function passFilters(g) {
  const f = state.filters;
  if (f.camp.size && !f.camp.has(g.camp)) return false;
  if (f.province.size && !f.province.has(g.birthplace.province)) return false;
  if (f.academy.size && !academyTags(g).some(t => f.academy.has(t))) return false;
  if (f.battle.size && !(g.battles || []).some(b => f.battle.has(b))) return false;
  if (f.decade.size && !f.decade.has(decadeTag(g))) return false;
  return true;
}
// 区间：活跃期与区间有交集才算“在此时段活跃”
function inRange(g) {
  if (state.range.start == null) return true;
  const s = toYear(g.activeSpan.start), e = toYear(g.activeSpan.end);
  return e >= state.range.start && s <= state.range.end;
}

// =========================================================
//  渲染：时间轴刻度 + 阶段色带
// =========================================================
function renderAxis() {
  const axis = document.getElementById('axis');
  axis.style.width = AXIS_W + 'px';
  let html = '';
  for (let y = Math.ceil(AXIS_MIN / 5) * 5; y <= AXIS_MAX; y += 5) {
    const x = xOf(y);
    html += `<div class="absolute top-0 h-full border-l border-slate-200" style="left:${x}px">
      <span class="absolute top-0.5 left-1 text-[10px] text-slate-400">${y}</span></div>`;
  }
  axis.innerHTML = html;

  // 图例
  document.getElementById('era-legend').innerHTML = ERAS.map(e =>
    `<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 inline-block rounded-sm" style="background:${e.border}"></span>${e.name}</span>`
  ).join('');
}

function renderEraBands(container) {
  ERAS.forEach(e => {
    const div = document.createElement('div');
    div.className = 'era-band';
    div.style.left = xOf(e.start) + 'px';
    div.style.width = (e.end - e.start) * PX_PER_YEAR + 'px';
    div.style.background = e.color;
    div.style.borderLeft = `1px dashed ${e.border}`;
    div.title = e.name;
    container.appendChild(div);
  });
}

// =========================================================
//  渲染：将领轨迹条
// =========================================================
function renderTracks() {
  const tracks = document.getElementById('tracks');
  tracks.innerHTML = '';
  tracks.style.width = AXIS_W + 'px';

  const visible = GENERALS.filter(passFilters)
    .sort((a, b) => toYear(a.lifeSpan.start) - toYear(b.lifeSpan.start));

  tracks.style.height = (visible.length * ROW_H + 10) + 'px';
  renderEraBands(tracks);

  let activeCount = 0;
  visible.forEach((g, i) => {
    const top = i * ROW_H + 6;
    const dimmed = !inRange(g);
    if (!dimmed) activeCount++;

    const ls = toYear(g.lifeSpan.start), le = toYear(g.lifeSpan.end);
    const as = toYear(g.activeSpan.start), ae = toYear(g.activeSpan.end);
    const color = CAMP_COLOR[g.camp];

    // 姓名标签（固定在左侧 sticky）
    const name = document.createElement('div');
    name.className = `track-name absolute text-[11px] font-medium whitespace-nowrap px-1 rounded ${dimmed ? 'dim' : ''}`;
    name.style.cssText = `left:${xOf(ls)}px; top:${top - 14}px; color:${color}`;
    name.textContent = `${g.name}（${CAMP_LABEL[g.camp]}）`;
    tracks.appendChild(name);

    // 生卒底条
    const life = document.createElement('div');
    life.className = `track-bar absolute rounded-full cursor-pointer ${dimmed ? 'dim' : ''} ${state.selected.has(g.id) ? 'selected' : ''}`;
    life.style.cssText = `left:${xOf(ls)}px; top:${top}px; width:${(le - ls) * PX_PER_YEAR}px; height:14px; background:${color}22; border:1px solid ${color}66;`;
    life.dataset.gid = g.id;
    tracks.appendChild(life);

    // 活跃期深色叠加
    if (as && ae) {
      const act = document.createElement('div');
      act.className = 'track-bar absolute rounded-full cursor-pointer pointer-events-none';
      act.style.cssText = `left:${xOf(as)}px; top:${top + 2}px; width:${(ae - as) * PX_PER_YEAR}px; height:10px; background:${color}cc;`;
      if (dimmed) act.classList.add('dim');
      tracks.appendChild(act);
    }

    // 战役/事件标记点
    const nodes = [...(g.battles || []).map(id => BATTLE_MAP[id]), ...(g.relatedEvents || []).map(id => EVENT_MAP[id])].filter(Boolean);
    nodes.forEach(n => {
      const yr = midDate(n.start, n.end);
      if (yr == null) return;
      const mk = document.createElement('div');
      const isEvent = n.type === 'event';
      mk.className = 'marker absolute rounded-full cursor-pointer';
      mk.style.cssText = `left:${xOf(yr)}px; top:${top + 7}px; width:9px; height:9px; transform:translate(-50%,-50%); background:${isEvent ? '#f59e0b' : '#fff'}; border:2px solid ${color};`;
      mk.dataset.node = n.id;
      mk.dataset.gid = g.id;
      if (dimmed) mk.style.opacity = '.2';
      tracks.appendChild(mk);
    });
  });

  document.getElementById('count-hint').textContent =
    `显示 ${visible.length} 位将领` + (state.range.start != null ? `，其中 ${activeCount} 位在选定时段活跃` : '');
}

// =========================================================
//  人物档案面板
// =========================================================
const FIELD_ROWS = [
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

function openGeneral(id) {
  const g = GEN_MAP[id]; if (!g) return;
  state.highlightBattle = null;
  const color = CAMP_COLOR[g.camp];
  document.getElementById('panel-title').innerHTML =
    `${g.name} <span class="text-xs font-normal px-2 py-0.5 rounded ml-1 text-white" style="background:${color}">${CAMP_LABEL[g.camp]}</span>` +
    (g.aliases?.length ? `<span class="text-xs text-slate-400 ml-2">${g.aliases.join(' · ')}</span>` : '');

  const posList = (g.keyPositions || []).map(p =>
    `<li><span class="text-slate-400 font-mono text-xs">${p.start}–${p.end || '今'}</span> ${p.title}</li>`).join('');
  const battleChips = (g.battles || []).map(bid => {
    const b = BATTLE_MAP[bid]; if (!b) return '';
    return `<button class="node-link inline-block bg-slate-100 hover:bg-amber-100 border rounded px-2 py-0.5 text-xs mr-1 mb-1" data-node="${bid}">${b.name}</button>`;
  }).join('');
  const eventChips = (g.relatedEvents || []).map(eid => {
    const e = EVENT_MAP[eid]; if (!e) return '';
    return `<button class="node-link inline-block bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded px-2 py-0.5 text-xs mr-1 mb-1" data-node="${eid}">${e.name}</button>`;
  }).join('');

  document.getElementById('panel-body').innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="md:col-span-1 space-y-1.5">
        ${FIELD_ROWS.map(([k, fn]) => `<div class="flex text-sm"><span class="w-20 text-slate-400 shrink-0">${k}</span><span class="flex-1">${fn(g) || '—'}</span></div>`).join('')}
      </div>
      <div class="md:col-span-2 space-y-3">
        <section><h3 class="font-semibold text-slate-700 border-l-4 pl-2 mb-1" style="border-color:${color}">早期经历</h3><p class="text-slate-600 leading-relaxed">${g.earlyExperience || '—'}</p></section>
        <section><h3 class="font-semibold text-slate-700 border-l-4 pl-2 mb-1" style="border-color:${color}">历任核心职务</h3><ul class="text-slate-600 space-y-0.5">${posList || '—'}</ul></section>
        <section><h3 class="font-semibold text-slate-700 border-l-4 pl-2 mb-1" style="border-color:${color}">参与关键战役</h3><div>${battleChips || '<span class="text-slate-400">—</span>'}</div></section>
        <section><h3 class="font-semibold text-slate-700 border-l-4 pl-2 mb-1" style="border-color:${color}">重大历史行动</h3><ul class="list-disc list-inside text-slate-600 space-y-0.5">${(g.majorActions || []).map(a => `<li>${a}</li>`).join('') || '—'}</ul></section>
        <section><h3 class="font-semibold text-slate-700 border-l-4 pl-2 mb-1" style="border-color:${color}">重要历史事件关联</h3><div>${eventChips || '<span class="text-slate-400">—</span>'}</div></section>
        <section><h3 class="font-semibold text-slate-700 border-l-4 pl-2 mb-1" style="border-color:${color}">最终历史结局</h3><p class="text-slate-600 leading-relaxed">${g.finalOutcome || '—'}</p></section>
        <section><h3 class="font-semibold text-slate-700 border-l-4 pl-2 mb-1" style="border-color:${color}">历史简要评价</h3><p class="text-slate-600 leading-relaxed italic">${g.evaluation || '—'}</p></section>
        <section class="text-xs text-slate-400 pt-1 border-t">史料出处：${(g.sources || []).join('；')}</section>
      </div>
    </div>`;
  showPanel();
}

// =========================================================
//  战役/事件花名册面板
// =========================================================
function openNode(id) {
  const n = NODE_MAP[id]; if (!n) return;
  state.highlightBattle = id;
  highlightMarkers(id);

  const byCamp = { kmt: [], ccp: [] };
  (n.participants || []).forEach(p => { (byCamp[p.camp] || (byCamp[p.camp] = [])).push(p); });
  const col = (camp) => `
    <div class="flex-1">
      <h4 class="font-semibold mb-2" style="color:${CAMP_COLOR[camp]}">${CAMP_LABEL[camp]}（${byCamp[camp].length}人）</h4>
      <ul class="space-y-1">${byCamp[camp].map(p => {
        const g = GEN_MAP[p.generalId];
        return `<li><button class="gen-link text-left hover:underline" data-gid="${p.generalId}" style="color:${CAMP_COLOR[camp]}">${g ? g.name : p.generalId}</button>
          <span class="text-slate-500 text-xs">— ${p.role}</span></li>`;
      }).join('') || '<li class="text-slate-400 text-sm">—</li>'}</ul>
    </div>`;

  document.getElementById('panel-title').innerHTML =
    `${n.name} <span class="text-xs font-normal text-slate-400 ml-2">${n.category} · ${toYear(n.start)}${toYear(n.end) !== toYear(n.start) ? '–' + toYear(n.end) : ''}</span>`;
  document.getElementById('panel-body').innerHTML = `
    <div class="space-y-3">
      <div class="flex gap-6 text-sm text-slate-600">
        <span>📍 ${n.location?.text || '—'}</span>
        <span>结果：${n.outcome || '—'}</span>
      </div>
      <p class="text-slate-600 leading-relaxed bg-slate-50 rounded p-3">${n.summary || ''}</p>
      <div class="flex gap-6 pt-2 border-t">${col('kmt')}${col('ccp')}</div>
      <div class="text-xs text-slate-400 pt-1 border-t">史料出处：${(n.sources || []).join('；')}</div>
    </div>`;
  showPanel();
}

// =========================================================
//  交集计算（多选对比）
// =========================================================
function computeIntersection(ids) {
  const gs = ids.map(id => GEN_MAP[id]).filter(Boolean);
  if (gs.length < 2) return null;

  // 共同战役/事件
  const setsB = gs.map(g => new Set(g.battles || []));
  const setsE = gs.map(g => new Set(g.relatedEvents || []));
  const sharedBattles = [...setsB[0]].filter(b => setsB.every(s => s.has(b)));
  const sharedEvents  = [...setsE[0]].filter(e => setsE.every(s => s.has(e)));

  // 时间重叠
  const starts = gs.map(g => toYear(g.activeSpan.start));
  const ends   = gs.map(g => toYear(g.activeSpan.end));
  const ovStart = Math.max(...starts), ovEnd = Math.min(...ends);
  const timeOverlap = ovStart <= ovEnd ? { start: ovStart, end: ovEnd } : null;

  // 阵营关系
  const camps = new Set(gs.map(g => g.camp));
  const relation = camps.size === 1 ? '同阵营' : '跨阵营';

  return { gs, sharedBattles, sharedEvents, timeOverlap, relation };
}

function openIntersection() {
  const ids = [...state.selected];
  const r = computeIntersection(ids);
  if (!r) return;
  state.highlightBattle = null;

  const names = r.gs.map(g => `<span style="color:${CAMP_COLOR[g.camp]}">${g.name}</span>`).join(' × ');
  const nodeChip = (id) => {
    const n = NODE_MAP[id];
    const rolesByGen = r.gs.map(g => {
      const p = (n.participants || []).find(pp => pp.generalId === g.id);
      return `${g.name}：${p ? p.role : '—'}`;
    }).join('　');
    const sameCamp = new Set((n.participants || []).filter(p => r.gs.some(g => g.id === p.generalId)).map(p => p.camp)).size === 1;
    return `<button class="node-link block w-full text-left border rounded p-2 mb-2 hover:bg-amber-50" data-node="${id}">
      <div class="font-semibold">${n.name} <span class="text-xs text-slate-400">${n.category} · ${toYear(n.start)}</span>
        <span class="text-xs px-1.5 py-0.5 rounded ml-1 ${sameCamp ? 'bg-slate-200 text-slate-600' : 'bg-rose-100 text-rose-700'}">${sameCamp ? '同盟/同阵营' : '敌对/跨阵营'}</span></div>
      <div class="text-xs text-slate-500 mt-1">${rolesByGen}</div>
    </button>`;
  };

  const shared = [...r.sharedBattles, ...r.sharedEvents];
  document.getElementById('panel-title').textContent = '人物交集分析';
  document.getElementById('panel-body').innerHTML = `
    <div class="space-y-3">
      <div class="text-base">${names} <span class="text-sm text-slate-400 ml-2">关系：${r.relation}</span></div>
      <div class="grid md:grid-cols-2 gap-4">
        <section>
          <h3 class="font-semibold text-slate-700 mb-2">① 共同战役 / 事件（${shared.length}）</h3>
          ${shared.length ? shared.map(nodeChip).join('') : '<p class="text-slate-400 text-sm">无直接共同战役/事件记录</p>'}
        </section>
        <section>
          <h3 class="font-semibold text-slate-700 mb-2">② 时间交集</h3>
          ${r.timeOverlap
            ? `<p class="text-slate-600">活跃期重叠：<span class="font-mono">${r.timeOverlap.start} – ${r.timeOverlap.end}</span>（约 ${r.timeOverlap.end - r.timeOverlap.start} 年）</p>`
            : '<p class="text-slate-400 text-sm">活跃期无重叠</p>'}
          <h3 class="font-semibold text-slate-700 mt-3 mb-1">③ 各自出身</h3>
          <ul class="text-sm text-slate-600 space-y-0.5">
            ${r.gs.map(g => `<li><span style="color:${CAMP_COLOR[g.camp]}">${g.name}</span> · ${g.birthplace.province} · ${(g.academy||[])[0]||'—'}</li>`).join('')}
          </ul>
        </section>
      </div>
    </div>`;
  // 时间轴上高亮所有共同战役
  if (r.sharedBattles.length) highlightMarkers(r.sharedBattles[0]);
  showPanel();
}

// =========================================================
//  高亮 / 面板显隐 / tooltip
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
  tooltip.style.left = (x + 12) + 'px';
  tooltip.style.top = (y + 12) + 'px';
  tooltip.classList.remove('hidden');
}
function hideTip() { tooltip.classList.add('hidden'); }

// =========================================================
//  筛选面板渲染
// =========================================================
function uniq(arr) { return [...new Set(arr)]; }
function buildFilters() {
  const provinces = uniq(GENERALS.map(g => g.birthplace.province)).sort();
  const academies = uniq(GENERALS.flatMap(academyTags)).sort();
  const decades   = uniq(GENERALS.map(decadeTag)).sort();
  const battleOpts = BATTLES.filter(b => !b.belongsTo || true); // 含全部

  const groups = [
    { key: 'camp', title: '阵营', items: [['kmt', '国民党'], ['ccp', '共产党']] },
    { key: 'academy', title: '毕业军校', items: academies.map(a => [a, a]) },
    { key: 'province', title: '籍贯（省）', items: provinces.map(p => [p, p]) },
    { key: 'decade', title: '出生年代', items: decades.map(d => [d, d]) },
    { key: 'battle', title: '参与战役/事件', items: [...BATTLES, ...EVENTS].map(b => [b.id, b.name]) }
  ];

  document.getElementById('filters').innerHTML = groups.map(grp => `
    <div>
      <div class="font-semibold text-slate-700 mb-1.5 text-xs uppercase tracking-wide">${grp.title}</div>
      <div class="space-y-1 max-h-44 overflow-y-auto pr-1">
        ${grp.items.map(([val, label]) => `
          <label class="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
            <input type="checkbox" class="filter-cb accent-blue-600" data-group="${grp.key}" value="${val}">
            <span class="text-slate-600">${label}</span>
          </label>`).join('')}
      </div>
    </div>`).join('');
}

// =========================================================
//  区间刷选滑块
// =========================================================
function buildRangeSlider() {
  const rs = document.getElementById('rangeStart'), re = document.getElementById('rangeEnd');
  [rs, re].forEach(el => { el.min = AXIS_MIN; el.max = AXIS_MAX; });
  rs.value = AXIS_MIN; re.value = AXIS_MAX;
  const onInput = () => {
    let a = +rs.value, b = +re.value;
    if (a > b) [a, b] = [b, a];
    // 只有当区间不是全范围时才启用
    if (a <= AXIS_MIN && b >= AXIS_MAX) { state.range = { start: null, end: null }; document.getElementById('range-label').textContent = '全部'; }
    else { state.range = { start: a, end: b }; document.getElementById('range-label').textContent = `${a} – ${b}`; }
    renderTracks(); bindTrackEvents();
  };
  rs.addEventListener('input', onInput);
  re.addEventListener('input', onInput);
  document.getElementById('rangeClear').addEventListener('click', () => {
    rs.value = AXIS_MIN; re.value = AXIS_MAX; onInput();
  });
}

// =========================================================
//  事件绑定
// =========================================================
function bindTrackEvents() {
  const tracks = document.getElementById('tracks');
  tracks.querySelectorAll('.track-bar[data-gid]').forEach(bar => {
    bar.onclick = (e) => {
      const gid = bar.dataset.gid;
      if (e.shiftKey) { toggleSelect(gid); }   // shift 多选对比
      else openGeneral(gid);
    };
  });
  tracks.querySelectorAll('.marker').forEach(m => {
    m.onclick = (e) => { e.stopPropagation(); openNode(m.dataset.node); };
    m.onmousemove = (e) => {
      const n = NODE_MAP[m.dataset.node], g = GEN_MAP[m.dataset.gid];
      const p = (n.participants || []).find(pp => pp.generalId === m.dataset.gid);
      showTip(`<b>${n.name}</b>（${toYear(n.start)}）<br>${g.name}：${p ? p.role : ''}<br>📍${n.location?.text || ''}`, e.clientX, e.clientY);
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
  // 筛选复选框
  document.getElementById('filters').addEventListener('change', (e) => {
    if (!e.target.classList.contains('filter-cb')) return;
    const set = state.filters[e.target.dataset.group];
    e.target.checked ? set.add(e.target.value) : set.delete(e.target.value);
    renderTracks(); bindTrackEvents();
  });

  // 面板内链接（战役/将领跳转）委托
  document.getElementById('panel-body').addEventListener('click', (e) => {
    const nl = e.target.closest('.node-link'); if (nl) { openNode(nl.dataset.node); return; }
    const gl = e.target.closest('.gen-link'); if (gl) { openGeneral(gl.dataset.gid); return; }
  });

  document.getElementById('panel-close').onclick = hidePanel;
  document.getElementById('compareBtn').onclick = openIntersection;
  document.getElementById('resetBtn').onclick = resetAll;

  // 搜索
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
  state.range = { start: null, end: null };
  state.highlightBattle = null;
  document.querySelectorAll('.filter-cb').forEach(cb => cb.checked = false);
  document.getElementById('rangeStart').value = AXIS_MIN;
  document.getElementById('rangeEnd').value = AXIS_MAX;
  document.getElementById('range-label').textContent = '全部';
  document.getElementById('compareBtn').textContent = '对比交集 (0)';
  document.getElementById('compareBtn').disabled = true;
  hidePanel();
  renderTracks(); bindTrackEvents();
}

// ---------- 启动 ----------
function init() {
  if (!GENERALS.length) { document.getElementById('tracks').innerHTML = '<p class="p-4 text-red-500">数据加载失败</p>'; return; }
  renderAxis();
  buildFilters();
  buildRangeSlider();
  renderTracks();
  bindTrackEvents();
  bindGlobalEvents();
}
document.addEventListener('DOMContentLoaded', init);
})();
