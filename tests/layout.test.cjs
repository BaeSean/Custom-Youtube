const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../layout.js');
test('inward collapse icon means theater; outward expand icon means normal',()=>{
  // Right arrow points left toward x=13.58: collapse / 기본보기.
  assert.equal(L.modeFromIcon('M21 3ZM16.87 6.72H16.86L16.79 6.79L13.58 10'),L.modeFromLabel('기본보기'));
  // Left arrow points left toward x=4.58: expand / 영화관 모드.
  assert.equal(L.modeFromIcon('M21 3ZM7.87 6.72L7.79 6.79L4.58 10'),L.modeFromLabel('영화관 모드'));
  assert.equal(L.modeFromIcon('unknown'),null);
});
test('mode button label describes destination, including unspaced Korean labels',()=>{
  for(const label of ['영화관 모드','영화관모드 (t)','Theater mode (t)','Theatre mode'])assert.equal(L.modeFromLabel(label),'normal');
  for(const label of ['기본보기','기본 보기 키보드 단축키 t','기본\u00a0보기','Default view (t)','Default mode'])assert.equal(L.modeFromLabel(label),'theater');
  for(const label of [null,'','설정'])assert.equal(L.modeFromLabel(label),null);
});

function verify(result, box) {
  assert.equal(result.fits, true);
  const panels = Object.entries(result.panels);
  for (const [id, r] of panels) {
    assert.ok(r.w >= L.PANELS[id].min[0] - 1e-7, id + ' width');
    assert.ok(r.h >= L.PANELS[id].min[1] - 1e-7, id + ' height');
    assert.ok(r.x >= box.x && r.y >= box.y);
    assert.ok(r.x + r.w <= box.x + box.w + 1e-7);
    assert.ok(r.y + r.h <= box.y + box.h + 1e-7);
  }
  for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) {
    const a = panels[i][1], b = panels[j][1];
    assert.ok(a.x + a.w <= b.x + 1e-7 || b.x + b.w <= a.x + 1e-7 || a.y + a.h <= b.y + 1e-7 || b.y + b.h <= a.y + 1e-7, 'panels overlap');
  }
}

test('default tree has every panel exactly once and survives JSON storage', () => {
  assert.equal(L.valid(L.defaults()), true);
  assert.equal(L.valid(JSON.parse(JSON.stringify(L.defaults()))), true);
  assert.deepEqual(L.ids(L.defaults()).sort(), Object.keys(L.PANELS).sort());
});
test('inline editor starting tree contains all panels with native column ordering', () => {
  const tree = L.nativeTree();
  assert.equal(L.valid(tree), true);
  assert.deepEqual(L.ids(tree.a), ['video', 'info', 'description', 'comments']);
  assert.deepEqual(L.ids(tree.b), ['related', 'shorts']);
  const [w, h] = L.minimum(tree), box = {x:24,y:80,w:w+500,h:h+100};
  verify(L.arrange(tree, box), box);
});
test('native resize locates the nearest matching boundary and side', () => {
  const tree = L.nativeTree();
  assert.deepEqual(L.boundary(tree, 'video', 'x'), {id:'page', side:'a'});
  assert.deepEqual(L.boundary(tree, 'related', 'x'), {id:'page', side:'b'});
  assert.deepEqual(L.boundary(tree, 'comments', 'y'), {id:'main-description', side:'b'});
  assert.equal(L.boundary(tree, 'missing', 'x'), null);
});
test('missing unloaded sections consume no room and return after load', () => {
  const tree = L.nativeTree();
  const unloaded = L.prune(tree, new Set(['video','info','related','shorts']));
  const loaded = L.prune(tree, new Set(L.ids(tree)));
  assert.equal(L.ids(unloaded).length,4);
  assert.equal(L.ids(loaded).length,6);
  assert.equal(L.valid(tree),true);
});
test('invalid saved data is rejected', () => {
  for (const v of [null, {}, [], {panel:'unknown'}, {panel:'__proto__'}, {panel:'video'}, {...L.defaults(), ratio: NaN}, {...L.defaults(), ratio: 1}, {...L.defaults(), b: { panel: 'video' }}]) assert.equal(L.valid(v), false);
});
test('missing optional panels collapse without mutating saved layout', () => {
  const original = L.defaults(), before = JSON.stringify(original);
  const filtered = L.prune(original, new Set(['video', 'comments', 'related']));
  assert.deepEqual(L.ids(filtered).sort(), ['comments', 'related', 'video']);
  assert.equal(JSON.stringify(original), before);
  assert.equal(L.prune(original, new Set()), null);
});
test('common viewport sizes respect boundaries and never overlap', () => {
  for (const [w, h] of [[1264, 604], [1424, 784], [1904, 964]]) {
    const box = {x: 8, y: 108, w, h}; verify(L.arrange(L.defaults(), box), box);
  }
});
test('undersized viewports fail safely, exact minimum fits', () => {
  const tree = L.defaults(), [w, h] = L.minimum(tree);
  assert.equal(L.arrange(tree, {x:0,y:0,w:w-1,h}).fits, false);
  assert.equal(L.arrange(tree, {x:0,y:0,w,h:h-1}).fits, false);
  verify(L.arrange(tree, {x:0,y:0,w,h}), {x:0,y:0,w,h});
});
for (const edge of ['left', 'right', 'top', 'bottom']) test(`move every pair to ${edge}: no loss, duplication or overlap`, () => {
  const original = L.defaults(), before = JSON.stringify(original);
  for (const source of L.ids(original)) for (const target of L.ids(original)) {
    const moved = L.move(original, source, target, edge, 'moved');
    assert.equal(L.valid(moved), true);
    const [w, h] = L.minimum(moved), box = {x: 0, y: 0, w: w+800, h: h+600};
    verify(L.arrange(moved, box), box);
    if (source !== target) {
      const a = L.arrange(moved, box).panels[source], b = L.arrange(moved, box).panels[target];
      if (edge === 'left') assert.ok(a.x < b.x);
      if (edge === 'right') assert.ok(a.x > b.x);
      if (edge === 'top') assert.ok(a.y < b.y);
      if (edge === 'bottom') assert.ok(a.y > b.y);
    }
  }
  assert.equal(JSON.stringify(original), before);
});
test('invalid and self moves are no-ops', () => {
  const t = L.defaults();
  assert.equal(L.move(t, 'video', 'video', 'left', 'x'), t);
  assert.equal(L.move(t, 'absent', 'video', 'left', 'x'), t);
  assert.equal(L.move(t, 'video', 'comments', 'diagonal', 'x'), t);
});
test('extreme resize requests are clamped to panel minimums', () => {
  const t = L.defaults(), box = {x:0,y:0,w:1500,h:1000};
  for (const d of L.arrange(t, box).dividers) for (const ratio of [-100, 0.0001, 0.5, 0.9999, 100]) {
    const changed = L.resize(t, d.id, ratio); assert.equal(L.valid(changed), true); verify(L.arrange(changed, box), box);
  }
});
test('stable divider IDs resize correctly when optional siblings are absent', () => {
  const t = L.resize(L.defaults(), 'main', 0.4);
  const visible = L.prune(t, new Set(['video', 'comments']));
  assert.equal(visible.id, 'main'); assert.equal(visible.ratio, 0.4);
});
test('manifest has only local storage and YouTube content script access', () => {
  const root = path.join(__dirname, '..');
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions, ['storage']);
  assert.deepEqual(m.content_scripts[0].matches, ['https://www.youtube.com/*']);
  for (const file of [...m.content_scripts[0].js, ...m.content_scripts[0].css]) assert.ok(fs.existsSync(path.join(root, file)));
  assert.ok(!m.content_scripts[0].js.some(p => p.includes('fixture')));
});

const nativePanels={video:{x:80,y:80,w:1000,h:560},info:{x:80,y:648,w:1000,h:70},related:{x:80,y:726,w:1000,h:300},comments:{x:1100,y:80,w:400,h:900}};
test('Shorts initial slots do not overlap and retain a closed comment slot',()=>{
  for(const width of [760,1280,1920,2560])for(const height of [400,640,1000]){
    const layout=L.shortsDefaults(width,height);
    assert.equal(L.validRects(layout),true);
    const closed=L.arrangeRects(layout,width,64,new Set(['video','info','related']));
    assert.equal(closed.panels.comments,undefined);
    const reopened=L.arrangeRects(layout,width,64,new Set(['video','info','related','comments']));
    assert.equal(reopened.panels.comments.y,layout.panels.comments.y+64);
    assert.equal(reopened.fits,true);
  }
});
test('snapping aligns viewport edges and panel spacing; Alt bypass preserves free movement',()=>{
  const layout=L.capture({video:{x:40,y:40,w:320,h:220},comments:{x:700,y:40,w:260,h:300}},1200,0);
  const edge=L.snapPanels(layout,'video',-35,0);
  assert.equal(edge.layout.panels.video.x,0);
  const gap=L.snapPanels(layout,'video',338,0);
  assert.equal(gap.layout.panels.video.x+320,692);
  assert.equal(L.validRects(gap.layout),true);
  const free=L.snapPanels(layout,'video',-35,0,false,{disabled:true});
  assert.equal(free.layout.panels.video.x,5);assert.deepEqual(free.guides,[]);
  const far=L.snapPanels(layout,'video',-20,0);
  assert.equal(far.layout.panels.video.x,20);
  const resize=L.snapPanels(layout,'video',337,77,true);
  assert.equal(resize.layout.panels.video.w,652);
  assert.equal(resize.layout.panels.video.h,300);
  assert.equal(L.validRects(resize.layout),true);
  assert.equal(layout.panels.video.w,320);
});
test('automatic comment restoration never moves Shorts or other existing panels',()=>{
  const layout=L.capture({...nativePanels,shorts:{x:80,y:1040,w:1000,h:200}},1600,0);
  const collision={...layout.panels.shorts};
  assert.deepEqual(L.restorePanelPosition(layout,'comments',collision),layout);
  const free={x:1100,y:1000,w:400,h:200};
  const restored=L.restorePanelPosition(layout,'comments',free);
  assert.deepEqual(restored.panels.comments,free);
  assert.deepEqual(restored.panels.shorts,layout.panels.shorts);
  assert.equal(L.validRects(restored),true);
});
test('normal description variants and theater are independent and preserve other slots',()=>{
  const original=L.capture({...nativePanels,description:{x:80,y:1034,w:1000,h:140}},1600,0);
  const closed=L.layoutVariant(original,'normalWithoutDescription');
  const theater=L.layoutVariant(original,'theater');
  assert.equal(closed.panels.description,undefined);
  assert.deepEqual(closed.panels.comments,original.panels.comments);
  assert.equal(theater.panels.comments,undefined);
  assert.equal(theater.panels.description,undefined);
  assert.deepEqual(theater.panels.related,original.panels.related);
  closed.panels.video.w=500;
  assert.equal(original.panels.video.w,1000);
  assert.equal(L.layoutVariant(null,'normal'),null);
  assert.equal(L.validRects(theater),true);
});
test('dragging info pushes recommendations and shorts as a chain, without mutating the source',()=>{
  const t=L.capture({info:{x:0,y:0,w:1000,h:80},related:{x:0,y:88,w:490,h:200},shorts:{x:510,y:88,w:490,h:200},comments:{x:0,y:296,w:1000,h:200}},1000,0);
  const before=JSON.stringify(t), moved=L.movePushing(t,'info',0,70);
  assert.equal(moved.panels.related.y,158);assert.equal(moved.panels.shorts.y,158);assert.equal(moved.panels.comments.y,366);
  assert.equal(L.validRects(moved),true);assert.equal(JSON.stringify(t),before);
});
test('corner resize changes both axes, expands to canvas width and allows small video',()=>{
  const t=L.capture(nativePanels,1600,80);
  const resized=L.resizePushing(t,'video',120,60);
  assert.equal(resized.panels.video.w,1120);assert.equal(resized.panels.video.h,620);assert.equal(L.validRects(resized),true);
  const large=L.resizePushing(t,'video',10000,1000);assert.equal(large.panels.video.w,1600);assert.equal(large.panels.video.x,0);assert.equal(L.validRects(large),true);
  const small=L.resizePushing(t,'video',-10000,-10000);assert.equal(small.panels.video.w,160);assert.equal(small.panels.video.h,90);
});
test('free dragging keeps size and other slots, rejects collisions',()=>{
  const layout=L.capture(nativePanels,1600,80), before=JSON.stringify(layout);
  const moved=L.translateRect(layout,'info',17,1100);
  assert.equal(L.validRects(moved),true);
  assert.deepEqual(moved.panels.info,{...layout.panels.info,x:97,y:1668});
  for(const id of ['video','comments','related'])assert.deepEqual(moved.panels[id],layout.panels[id]);
  assert.equal(L.translateRect(layout,'info',0,-100),null);
  assert.equal(JSON.stringify(layout),before);
  assert.equal(L.translateRect(layout,'info',NaN,0),null);
});
test('first native resize preserves right-side comments and recommendations below the video',()=>{
  const layout=L.capture(nativePanels,1600,80);
  assert.equal(L.validRects(layout),true);
  const changed=L.resizeRect(layout,'video','x',-100);
  const actual=L.arrangeRects(changed,1600,80,new Set(Object.keys(nativePanels))).panels;
  assert.deepEqual(actual,{...nativePanels,video:{...nativePanels.video,w:900}});
  assert.deepEqual(L.arrangeRects(layout,1600,80,new Set(Object.keys(nativePanels))).panels,nativePanels);
});
test('swapping exchanges only two full slots and survives storage',()=>{
  const layout=L.capture(nativePanels,1600,80);
  const swapped=L.swapRects(layout,'comments','related');
  assert.deepEqual(swapped.panels.comments,layout.panels.related);
  assert.deepEqual(swapped.panels.related,layout.panels.comments);
  assert.deepEqual(swapped.panels.video,layout.panels.video);
  assert.deepEqual(swapped.panels.info,layout.panels.info);
  assert.equal(L.validRects(JSON.parse(JSON.stringify(swapped))),true);
  assert.deepEqual(L.swapRects(swapped,'comments','related'),layout);
});
test('independent resizing stops at neighbors without moving them',()=>{
  const layout=L.capture(nativePanels,1600,80);
  assert.equal(L.resizeRect(layout,'video','x',2000).panels.video.w,1020);
  assert.equal(L.resizeRect(layout,'video','y',2000).panels.video.h,568);
  for(const id of Object.keys(layout.panels))for(const axis of ['x','y'])for(const delta of [-10000,10000]) {
    const changed=L.resizeRect(layout,id,axis,delta);
    assert.equal(L.validRects(changed),true);
    for(const other of Object.keys(layout.panels))if(other!==id)assert.deepEqual(changed.panels[other],layout.panels[other]);
  }
});
test('Shorts native capture keeps centered coordinates until the first move',()=>{
  const native={video:{x:480,y:64,w:320,h:570},info:{x:490,y:540,w:280,h:60},related:{x:820,y:240,w:65,h:300}};
  const captured=L.capture(native,1280,64);
  assert.deepEqual(L.arrangeRects(captured,1280,64,new Set(Object.keys(native))).panels,native);
  const moved=L.movePushing(captured,'info',-320,0);
  assert.equal(L.validRects(moved),true);
  assert.equal(moved.panels.video.x,480);
  assert.equal(captured.panels.info.x,490);
});

test('capture validation rejects overlapping or corrupt saved slots',()=>{
  const layout=L.capture(nativePanels,1600,80);
  assert.equal(L.validRects({...layout,width:0}),false);
  assert.equal(L.validRects({...layout,panels:{...layout.panels,info:layout.panels.video}}),false);
  assert.equal(L.validRects({...layout,panels:{unknown:layout.panels.video}}),false);
});
test('viewport and page scrolling preserve slot order',()=>{
  const layout=L.capture(nativePanels,1600,80);
  const result=L.arrangeRects(layout,1440,-100,new Set(Object.keys(nativePanels)));
  assert.equal(result.fits,true);
  assert.equal(result.panels.video.x,72);
  assert.equal(result.panels.video.y,-100);
  assert.ok(result.panels.comments.x>result.panels.video.x);
  assert.ok(result.panels.related.y>result.panels.info.y);
});
