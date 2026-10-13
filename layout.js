/* Shared by the content script and dependency-free Node tests. */
(function (root) {
  'use strict';
  const GAP = 8;
  const PANELS = {
    video: { title: '영상', min: [320, 220] },
    info: { title: '기본 정보', min: [230, 130] },
    description: { title: '영상 설명', min: [230, 130] },
    comments: { title: '댓글', min: [240, 180] },
    related: { title: '추천 영상', min: [240, 180] },
    shorts: { title: '추천 Shorts', min: [220, 150] }
  };
  const leaf = panel => ({ panel });
  const split = (id, axis, ratio, a, b) => ({ id, axis, ratio, a, b });
  function defaults() {
    return split('main', 'x', 0.62,
      split('left', 'y', 0.72, leaf('video'),
        split('details', 'x', 0.5, leaf('info'), leaf('description'))),
      split('right', 'y', 0.5, leaf('comments'),
        split('recommendations', 'x', 0.55, leaf('related'), leaf('shorts'))));
  }
  function nativeTree() {
    return split('page', 'x', 0.7,
      split('main-video', 'y', 0.57, leaf('video'),
        split('main-info', 'y', 0.22, leaf('info'),
          split('main-description', 'y', 0.35, leaf('description'), leaf('comments')))),
      split('side', 'y', 0.66, leaf('related'), leaf('shorts')));
  }
  function boundary(tree, panel, axis) {
    if (!tree || tree.panel || !ids(tree).includes(panel)) return null;
    const side = ids(tree.a).includes(panel) ? 'a' : 'b';
    return boundary(tree[side], panel, axis) || (tree.axis === axis ? { id: tree.id, side } : null);
  }
  function ids(tree) {
    return !tree ? [] : tree.panel ? [tree.panel] : [...ids(tree.a), ...ids(tree.b)];
  }
  function valid(tree) {
    const panels = new Set();
    const splits = new Set();
    function visit(n, depth) {
      if (!n || typeof n !== 'object' || depth > 12) return false;
      if (n.panel) {
        if (!Object.hasOwn(PANELS, n.panel) || panels.has(n.panel)) return false;
        panels.add(n.panel);
        return true;
      }
      if (typeof n.id !== 'string' || n.id.length > 80 || splits.has(n.id) ||
          !['x', 'y'].includes(n.axis) || !Number.isFinite(n.ratio) || n.ratio <= 0 || n.ratio >= 1) return false;
      splits.add(n.id);
      return visit(n.a, depth + 1) && visit(n.b, depth + 1);
    }
    return visit(tree, 0) && panels.size === Object.keys(PANELS).length;
  }
  function prune(tree, available) {
    if (!tree) return null;
    if (tree.panel) return available.has(tree.panel) ? { ...tree } : null;
    const a = prune(tree.a, available), b = prune(tree.b, available);
    return a && b ? { ...tree, a, b } : a || b;
  }
  function minimum(tree) {
    if (!tree) return [0, 0];
    if (tree.panel) return PANELS[tree.panel].min;
    const a = minimum(tree.a), b = minimum(tree.b);
    return tree.axis === 'x' ? [a[0] + b[0] + GAP, Math.max(a[1], b[1])] :
      [Math.max(a[0], b[0]), a[1] + b[1] + GAP];
  }
  function arrange(tree, box) {
    const panels = {}, dividers = [];
    function visit(n, r) {
      if (!n) return;
      if (n.panel) { panels[n.panel] = r; return; }
      const horizontal = n.axis === 'x';
      const length = (horizontal ? r.w : r.h) - GAP;
      const minA = minimum(n.a)[horizontal ? 0 : 1];
      const minB = minimum(n.b)[horizontal ? 0 : 1];
      const size = Math.max(minA, Math.min(length - minB, length * n.ratio));
      const a = { ...r }, b = { ...r }, d = { ...r };
      if (horizontal) { a.w = size; b.x += size + GAP; b.w = length - size; d.x += size; d.w = GAP; }
      else { a.h = size; b.y += size + GAP; b.h = length - size; d.y += size; d.h = GAP; }
      dividers.push({ ...d, id: n.id, axis: n.axis, box: r, length, minA, minB, ratio: size / length });
      visit(n.a, a); visit(n.b, b);
    }
    const min = minimum(tree);
    if (box.w < min[0] || box.h < min[1]) return { panels, dividers, fits: false, min };
    visit(tree, box);
    return { panels, dividers, fits: true, min };
  }
  function move(tree, source, target, edge, newId) {
    if (source === target || !ids(tree).includes(source) || !ids(tree).includes(target) ||
        !['left', 'right', 'top', 'bottom'].includes(edge)) return tree;
    const removed = prune(tree, new Set(ids(tree).filter(id => id !== source)));
    function insert(n) {
      if (n.panel === target) {
        const first = edge === 'left' || edge === 'top';
        return split(newId, ['left', 'right'].includes(edge) ? 'x' : 'y', 0.5,
          first ? leaf(source) : n, first ? n : leaf(source));
      }
      return n.panel ? n : { ...n, a: insert(n.a), b: insert(n.b) };
    }
    return insert(removed);
  }
  function resize(tree, id, ratio) {
    if (tree.panel) return tree;
    return tree.id === id ? { ...tree, ratio: Math.max(0.01, Math.min(0.99, ratio)) } :
      { ...tree, a: resize(tree.a, id, ratio), b: resize(tree.b, id, ratio) };
  }
  const overlaps = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
  function capture(panels, width, top) {
    return { type: 'rects', width, panels: Object.fromEntries(Object.entries(panels).map(([id, r]) => [id, {...r, y:r.y-top}])) };
  }
  function validRects(layout) {
    if (layout?.type !== 'rects' || !Number.isFinite(layout.width) || layout.width <= 0 || !layout.panels) return false;
    const entries = Object.entries(layout.panels);
    return entries.length > 0 && entries.every(([id,r]) => Object.hasOwn(PANELS,id) && r &&
      ['x','y','w','h'].every(key=>Number.isFinite(r[key])) && r.x >= 0 && r.w > 0 && r.h > 0 && r.x+r.w <= layout.width+1) &&
      entries.every(([,a],i)=>entries.slice(i+1).every(([,b])=>!overlaps(a,b)));
  }
  function arrangeRects(layout, width, top, present) {
    const scale = width / layout.width;
    const panels = Object.fromEntries(Object.entries(layout.panels).filter(([id])=>present.has(id)).map(([id,r])=>[id,{x:r.x*scale,y:r.y+top,w:r.w*scale,h:r.h}]));
    return {panels,dividers:[],fits:Object.entries(panels).every(([id,r])=>r.w >= Math.min(PANELS[id].min[0],layout.panels[id].w)-0.5)};
  }
  function swapRects(layout, source, target) {
    if (!layout.panels[source] || !layout.panels[target] || source===target) return layout;
    return {...layout,panels:{...layout.panels,[source]:{...layout.panels[target]},[target]:{...layout.panels[source]}}};
  }
  function resizeRect(layout, id, axis, delta) {
    const r=layout.panels[id];
    if (!r || !['x','y'].includes(axis) || !Number.isFinite(delta)) return layout;
    const horizontal=axis==='x', size=horizontal?'w':'h', other=horizontal?'y':'x', extent=horizontal?'h':'w';
    let limit=horizontal?layout.width-r.x:Math.max(r.h+delta,r.h);
    for (const [key,b] of Object.entries(layout.panels)) {
      if(key===id || b[other]>=r[other]+r[extent]-0.5 || b[other]+b[extent]<=r[other]+0.5)continue;
      if(b[axis]>=r[axis]+r[size]-0.5)limit=Math.min(limit,b[axis]-r[axis]);
    }
    const minimum=Math.min(PANELS[id].min[horizontal?0:1],r[size]);
    return {...layout,panels:{...layout.panels,[id]:{...r,[size]:Math.max(minimum,Math.min(limit,r[size]+delta))}}};
  }
  function translateRect(layout, id, dx, dy, minY = 0) {
    const r=layout.panels[id];
    if(!r || ![dx,dy,minY].every(Number.isFinite))return null;
    const moved={...r,x:Math.max(0,Math.min(layout.width-r.w,r.x+dx)),y:Math.max(minY,r.y+dy)};
    if(Object.entries(layout.panels).some(([key,b])=>key!==id && overlaps(moved,b)))return null;
    return {...layout,panels:{...layout.panels,[id]:moved}};
  }
  function pushPanels(layout, id, rect) {
    const placed={ [id]:rect };
    for(const [key,original] of Object.entries(layout.panels).filter(([key])=>key!==id).sort((a,b)=>a[1].y-b[1].y)) {
      const r={...original};
      // Put colliding panels below the occupied area; cascading pushes preserve
      // their sizes and relative order without exceeding the horizontal canvas.
      let hit;
      while((hit=Object.values(placed).find(other=>overlaps(r,other))))r.y=hit.y+hit.h+GAP;
      placed[key]=r;
    }
    return {...layout,panels:placed};
  }
  function movePushing(layout,id,dx,dy,minY=0) {
    const r=layout.panels[id];if(!r || ![dx,dy,minY].every(Number.isFinite))return null;
    return pushPanels(layout,id,{...r,x:Math.max(0,Math.min(layout.width-r.w,r.x+dx)),y:Math.max(minY,r.y+dy)});
  }
  function resizePushing(layout,id,dw,dh) {
    const r=layout.panels[id];if(!r || ![dw,dh].every(Number.isFinite))return layout;
    const min=id==='video'?[160,90]:PANELS[id].min;
    const w=Math.max(Math.min(min[0],r.w),Math.min(layout.width,r.w+dw));
    const h=Math.max(Math.min(min[1],r.h),r.h+dh);
    return pushPanels(layout,id,{...r,x:Math.min(r.x,layout.width-w),w,h});
  }
  function modeFromLabel(label) {
    if(typeof label!=='string')return null;
    // The button names its destination, so the current mode is the opposite.
    if(/기본\s*(보기|모드)|default\s*(view|mode)/i.test(label))return 'theater';
    if(/영화관\s*모드|theat(?:er|re)\s*mode/i.test(label))return 'normal';
    return null;
  }
  function snapPanels(layout,id,dx,dy,resize=false,options={}) {
    const minY=options.minY??0;
    const apply=(x,y)=>resize?resizePushing(layout,id,x,y):movePushing(layout,id,x,y,minY);
    let result=apply(dx,dy);
    if(!result || options.disabled)return {layout:result,guides:[]};
    const r=result.panels[id], original=layout.panels[id];
    const guides=[];
    const snapped={...r};
    for(const axis of ['x','y']) {
      const size=axis==='x'?'w':'h',threshold=axis==='x'?(options.thresholdX??10):(options.thresholdY??10);
      const edges=resize?[r[axis]+r[size]]:[r[axis],r[axis]+r[size]];
      const targets=axis==='x'?[{value:0},{value:layout.width}]:[{value:minY}];
      if(axis==='y' && Number.isFinite(options.bottom))targets.push({value:options.bottom});
      for(const [peer,b] of Object.entries(layout.panels))if(peer!==id) {
        targets.push({value:b[axis],peer,side:0},{value:b[axis]+b[size],peer,side:1},
          {value:b[axis]-GAP,peer,side:1},{value:b[axis]+b[size]+GAP,peer,side:0});
      }
      let best=null;
      for(const edge of edges)for(const target of targets) {
        if(target.side!==undefined && target.side!==(resize || edge!==r[axis]?1:0))continue;
        const delta=target.value-edge;
        const proposed={...r,[resize?size:axis]:r[resize?size:axis]+delta};
        if(target.peer && overlaps(proposed,layout.panels[target.peer]))continue;
        if(Math.abs(delta)<=threshold && (!best || Math.abs(delta)<Math.abs(best.delta)))best={...target,delta,axis,edge};
      }
      if(best){snapped[resize?size:axis]+=best.delta;guides.push(best);}
    }
    result=apply(resize?snapped.w-original.w:snapped.x-original.x,resize?snapped.h-original.h:snapped.y-original.y);
    const actual=result.panels[id];
    return {layout:result,guides:guides.filter(g=>{
      const size=g.axis==='x'?'w':'h';
      const aligned=Math.abs(actual[g.axis]+actual[size]-g.value)<0.5 || (!resize && Math.abs(actual[g.axis]-g.value)<0.5);
      return aligned && (!g.peer || result.panels[g.peer][g.axis]===layout.panels[g.peer][g.axis]);
    })};
  }
  function modeFromIcon(path) {
    if(typeof path!=='string')return null;
    // The icon describes the ACTION: inward arrows collapse to default view
    // (currently theater); outward arrows expand (currently normal).
    if(/M16\.87\s+6\.72H16\.86/.test(path))return 'theater';
    if(/M7\.87\s+6\.72L7\.79/.test(path))return 'normal';
    return null;
  }
  function layoutVariant(layout, slot) {
    if(!layout)return null;
    const copy=structuredClone(layout);
    if(slot!=='normal')delete copy.panels.description;
    if(slot==='theater')delete copy.panels.comments;
    return copy;
  }
  function restorePanelPosition(layout,id,previous,previousWidth=layout.width) {
    if(!previous || !layout.panels[id])return layout;
    const scale=layout.width/previousWidth;
    const candidate={...layout,panels:{...layout.panels,[id]:{...previous,x:previous.x*scale,w:previous.w*scale}}};
    // Automatic restoration must never push an existing panel out of view.
    return validRects(candidate)?candidate:layout;
  }
  function shortsDefaults(width,height) {
    const h=Math.max(400,height),videoW=Math.min(420,width-384,Math.round(h*9/16));
    const sideX=videoW+112,sideW=width-sideX-24;
    return {type:'rects',width,panels:{video:{x:16,y:0,w:videoW,h},related:{x:videoW+24,y:0,w:72,h},
      info:{x:sideX,y:0,w:sideW,h:130},comments:{x:sideX,y:138,w:sideW,h:Math.max(180,h-138)}}};
  }
  const api = { GAP, PANELS, defaults, nativeTree, boundary, ids, valid, prune, minimum, arrange, move, resize, capture, validRects, arrangeRects, swapRects, resizeRect, translateRect, modeFromLabel, modeFromIcon, movePushing, resizePushing, layoutVariant, restorePanelPosition, snapPanels, shortsDefaults };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CustomYTLayout = api;
})(globalThis);
