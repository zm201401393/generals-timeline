/* 内置 SVG 中国地图模块 —— 自包含、离线可用
   提供：经纬度→SVG 坐标投影、简化中国轮廓、打点/连线/轨迹动画绘制
   数据来源：战役/事件的 lng/lat；城市坐标表 CITY 供将领轨迹使用
*/
(() => {
'use strict';

// SVG 画布尺寸
const VB_W = 760, VB_H = 620;

// 经纬度线性投影范围（覆盖中国主要区域 + 缅甸远征军）
const LNG_MIN = 92, LNG_MAX = 126;   // 东经
const LAT_MIN = 18, LAT_MAX = 44;    // 北纬
// 边距
const PAD = 30;
function project(lng, lat) {
  const x = PAD + (lng - LNG_MIN) / (LNG_MAX - LNG_MIN) * (VB_W - 2 * PAD);
  const y = PAD + (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * (VB_H - 2 * PAD);
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

// 简化中国轮廓（概略示意，非精确国界，用于历史地点定位背景）
// 采用一组经纬度控制点连成的多边形（东部海岸线 + 内陆概略边界）
const CHINA_OUTLINE_LL = [
  [123.5, 43.5], [126, 41.5], [124, 40], [122, 39], [121, 38.5], [119, 37.5],
  [122, 37.3], [121, 36], [120.5, 34], [121.8, 32], [121.5, 30.8], [122, 29.5],
  [121, 28], [120, 27], [119.5, 25.5], [117, 23.5], [116, 22.7], [113.5, 22],
  [110, 21], [109, 21.5], [108, 21.7], [106.5, 21.2], [105, 23], [103, 22.5],
  [101.5, 22.5], [101, 21.2], [99.5, 22], [98, 24], [97.5, 25.5], [98.5, 27],
  [98, 28.5], [96.5, 29], [94, 29], [92, 28], [92, 30], [94, 32], [96, 34],
  [98, 36], [100, 38], [103, 39.5], [106, 40], [110, 40.5], [112, 41.5],
  [116, 42.5], [119, 42.8], [123.5, 43.5]
];
function outlinePath() {
  return CHINA_OUTLINE_LL.map((p, i) => {
    const [x, y] = project(p[0], p[1]);
    return (i === 0 ? 'M' : 'L') + x + ',' + y;
  }).join(' ') + ' Z';
}

// 主要城市 / 地点经纬度（将领轨迹用；战役自带坐标不在此）
const CITY = {
  '北京': [116.41, 39.90], '南京': [118.79, 32.06], '上海': [121.47, 31.23],
  '广州': [113.27, 23.13], '武汉': [114.30, 30.59], '重庆': [106.55, 29.56],
  '西安': [108.94, 34.34], '太原': [112.55, 37.87], '沈阳': [123.43, 41.80],
  '成都': [104.07, 30.57], '长沙': [112.94, 28.23], '桂林': [110.29, 25.27],
  '延安': [109.49, 36.60], '瑞金': [116.03, 25.88], '井冈山': [114.17, 26.58],
  '台北': [121.56, 25.03], '昆明': [102.83, 24.88], '徐州': [117.28, 34.26],
  '锦州': [121.13, 41.10], '天津': [117.20, 39.13], '保定': [115.46, 38.87],
  '济南': [117.00, 36.65], '郑州': [113.65, 34.76], '兰州': [103.83, 36.06],
  '南昌': [115.86, 28.68], '合肥': [117.28, 31.86], '石家庄': [114.51, 38.04]
};

// 省份 → 省会坐标（用于将领籍贯/活动省份定位）
const PROVINCE_CENTER = {
  '北京': [116.41, 39.90], '天津': [117.20, 39.13], '上海': [121.47, 31.23],
  '重庆': [106.55, 29.56], '浙江': [120.15, 30.28], '广西': [108.32, 22.82],
  '广东': [113.27, 23.13], '山西': [112.55, 37.87], '陕西': [108.94, 34.34],
  '辽宁': [123.43, 41.80], '安徽': [117.28, 31.86], '山东': [117.00, 36.65],
  '湖南': [112.94, 28.23], '湖北': [114.30, 30.59], '四川': [104.07, 30.57],
  '江苏': [118.79, 32.06], '江西': [115.86, 28.68], '河北': [114.51, 38.04],
  '河南': [113.65, 34.76], '境外': [97.0, 21.0]
};

// 生成底图 SVG（外框 + 轮廓 + 经纬网格）
function baseSvg(extraDefs = '') {
  // 经度网格线
  let grid = '';
  for (let lng = 95; lng <= 125; lng += 5) {
    const [x1, y1] = project(lng, LAT_MAX), [x2, y2] = project(lng, LAT_MIN);
    grid += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d6cbb3" stroke-width="0.5" stroke-dasharray="3 4"/>`;
  }
  for (let lat = 20; lat <= 42; lat += 5) {
    const [x1, y1] = project(LNG_MIN, lat), [x2, y2] = project(LNG_MAX, lat);
    grid += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d6cbb3" stroke-width="0.5" stroke-dasharray="3 4"/>`;
  }
  return { viewBox: `0 0 ${VB_W} ${VB_H}`, outline: outlinePath(), grid, defs: extraDefs };
}

// ---------- 战图绘制 ----------
const SIDE_COLOR = { kmt: '#1d4ed8', ccp: '#b91c1c', enemy: '#57534e' };
const SIDE_LABEL = { kmt: '国民党军', ccp: '共产党军', enemy: '日军 / 北洋 / 敌方' };

// Catmull-Rom → 平滑贝塞尔路径（输入 [[x,y],...]）
function smoothPath(pts) {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${pts[0][0]},${pts[0][1]} L${pts[1][0]},${pts[1][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// 箭头 marker 定义（三色 × 进军/退却）；k=缩放系数，放大时 marker 反向缩小保持视觉一致
function arrowDefs(k) {
  k = k || 1;
  const mw = (7 / k).toFixed(2);
  let m = '';
  for (const [side, col] of Object.entries(SIDE_COLOR)) {
    m += `<marker id="arw-${side}" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="${mw}" markerHeight="${mw}" orient="auto-start-reverse">
      <path d="M1,1 L11,6 L1,11 L4,6 Z" fill="${col}"/></marker>`;
  }
  return m;
}

// 单条进军/退却箭头 → SVG path 串；k=缩放系数，线宽随缩放反向调整
function arrowSvg(arrow, idx, k) {
  k = k || 1;
  const sw = n => (n / k).toFixed(2);
  const xy = arrow.pts.map(p => project(p.lng, p.lat));
  if (xy.length < 2) {
    const [x, y] = xy[0] || [0, 0];
    return `<circle class="war-arrow" data-i="${idx}" cx="${x}" cy="${y}" r="${sw(10)}" fill="none" stroke="${SIDE_COLOR[arrow.side]}" stroke-width="${sw(3)}"/>`;
  }
  const d = smoothPath(xy);
  const col = SIDE_COLOR[arrow.side] || '#666';
  const retreat = arrow.kind === 'retreat';
  return `<path class="war-arrow" data-i="${idx}" d="${d}" fill="none" stroke="${col}"
    stroke-width="${sw(retreat ? 3 : 5)}" stroke-linecap="round" stroke-linejoin="round"
    ${retreat ? `stroke-dasharray="${sw(8)} ${sw(6)}"` : ''} opacity="${retreat ? 0.8 : 0.9}"
    marker-end="url(#arw-${arrow.side})"/>`;
}

// 交战/歼灭/胜利/和平解放标记；k=缩放系数
function clashSvg(clash, atXY, k) {
  k = k || 1;
  const s = 1 / k;
  const [x, y] = atXY;
  const kind = clash.kind;
  if (kind === 'annihilate' || kind === 'battle') {
    const col = kind === 'annihilate' ? '#b91c1c' : '#78716c';
    return `<g class="war-clash" transform="translate(${x},${y}) scale(${s.toFixed(3)})">
      <circle r="11" fill="none" stroke="${col}" stroke-width="2.5"/>
      <path d="M-8,-8 L8,8 M-8,8 L8,-8" stroke="${col}" stroke-width="2.5"/>
    </g>`;
  }
  if (kind === 'victory') {
    return `<g class="war-clash" transform="translate(${x},${y}) scale(${s.toFixed(3)})">
      <path d="M0,-11 L3.2,-3.5 L11,-3.5 L4.8,1.5 L7,9 L0,4.5 L-7,9 L-4.8,1.5 L-11,-3.5 L-3.2,-3.5 Z" fill="#d97706" stroke="#fff" stroke-width="0.8"/></g>`;
  }
  if (kind === 'peaceful') {
    return `<g class="war-clash" transform="translate(${x},${y}) scale(${s.toFixed(3)})">
      <circle r="10" fill="#16a34a" opacity="0.85"/><circle r="5" fill="#fff"/></g>`;
  }
  return '';
}

// 图例（右下角）
function warLegend(sides) {
  const items = [];
  if (sides.has('kmt')) items.push(`<span style="color:#1d4ed8">▬▶ 国民党军进军</span>`);
  if (sides.has('ccp')) items.push(`<span style="color:#b91c1c">▬▶ 共产党军进军</span>`);
  if (sides.has('enemy')) items.push(`<span style="color:#57534e">▬▶ 日军/北洋等</span>`);
  items.push(`<span style="color:#57534e">┅▶ 退却/败退</span>`);
  items.push(`<span style="color:#b91c1c">⊗ 交战/歼灭</span>`);
  items.push(`<span style="color:#d97706">★ 胜利</span>`);
  items.push(`<span style="color:#16a34a">◉ 和平解放</span>`);
  return items;
}

// ---------- 聚焦缩放：按一组经纬度点算 viewBox（只显示相关省份区域）----------
// pts: [{lng,lat},...]；返回 { viewBox, k }，k 为相对全图的放大系数（用于反向缩放标注/线宽）
function focusView(pts, marginRatio) {
  if (!pts || !pts.length) return { viewBox: `0 0 ${VB_W} ${VB_H}`, k: 1, x: 0, y: 0, w: VB_W, h: VB_H };
  const xs = pts.map(p => project(p.lng, p.lat)[0]);
  const ys = pts.map(p => project(p.lng, p.lat)[1]);
  let minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  // 边距（按跨度比例 + 最小绝对边距，保证单点/近点也有合理视野）
  const mr = marginRatio == null ? 0.35 : marginRatio;
  let w = maxX - minX, h = maxY - minY;
  const padX = Math.max(w * mr, 70), padY = Math.max(h * mr, 70);
  minX -= padX; maxX += padX; minY -= padY; maxY += padY;
  w = maxX - minX; h = maxY - minY;
  // 维持画布宽高比（VB_W:VB_H），避免拉伸
  const targetRatio = VB_W / VB_H;
  const curRatio = w / h;
  if (curRatio > targetRatio) { const nh = w / targetRatio; minY -= (nh - h) / 2; h = nh; }
  else { const nw = h * targetRatio; minX -= (nw - w) / 2; w = nw; }
  // 夹到画布范围内
  minX = Math.max(minX, -40); minY = Math.max(minY, -40);
  const k = VB_W / w;   // 放大系数
  return { viewBox: `${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`, k, x: minX, y: minY, w, h };
}

// 收集一场战役 campaign 的全部经纬度点（用于 focusView）
function campaignPoints(campaign, location) {
  const pts = [];
  (campaign?.arrows || []).forEach(a => (a.pts || []).forEach(p => pts.push({ lng: p.lng, lat: p.lat })));
  if (location && location.lng != null) pts.push({ lng: location.lng, lat: location.lat });
  return pts;
}

window.CNMap = {
  VB_W, VB_H, project, outlinePath, baseSvg, CITY, PROVINCE_CENTER,
  SIDE_COLOR, SIDE_LABEL, smoothPath, arrowDefs, arrowSvg, clashSvg, warLegend,
  focusView, campaignPoints
};
})();
