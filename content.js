(() => {
  'use strict';
  if (document.getElementById('customyt-host')) return;
  const L = globalThis.CustomYTLayout;
  // Retain old settings without auto-applying the previous fullscreen layout.
  const KEY = 'customyt.watch.v3';
  const PRESET_KEY = 'customyt.presets.v1';
  let presets = [];
  let initialMode = 'normal', activeMode = null, modeApplied = false;
  let modeDeadline = 0, modeClicked = false;
  let modeLastClick = 0;
  let nativeModeRequest = null;
  let descriptionClosed = false;
  let descriptionOpened = false;
  let normalDescriptionVisible = null;
  let videoKey = '', modeStableSince = 0;
  let navigationSettlesUntil = 0;
  const grids = new Set();
  const layouts = { normal: null, normalWithoutDescription: null, theater: null };
  let activeSlot = null;
  let tree = null, editing = false, loaded = false, navigating = false;
  let watch = null, nodes = {}, paths = new Set(), unused = new Set();
  let geometry = { panels: {}, dividers: [] }, applied = false, gesture = null;
  let undo = [], editStart = null, frame = 0, refreshTimer = 0, nativeResizeFrame = 0;
  let storageQueue = Promise.resolve(), suspendedReason = '';
  const clone = value => value ? structuredClone(value) : null;
  const rectOf = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };

  const host = document.createElement('div');
  host.id = 'customyt-host';
  host.style.cssText = 'position:fixed;inset:0;z-index:2019;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    :host { all: initial; font: 13px/1.5 system-ui,sans-serif; color: #f1f1f1; }
    * { box-sizing: border-box; } [hidden] { display: none !important; }
    .panel { position: fixed; outline: 2px solid #7aa7ff; outline-offset: -2px; border-radius: 6px; pointer-events: none; }
    .handle { position: absolute; left: 4px; height: 26px; max-width: calc(100% - 8px); padding: 3px 10px; border: 0; border-radius: 5px; background: #254d8e; color: white; font: inherit; cursor: grab; pointer-events: auto; user-select: none; touch-action: none; }
    .divider, .edge { position: fixed; pointer-events: auto; touch-action: none; border-radius: 4px; }
    .divider { background: #6a9fff55; }
    .x { cursor: col-resize; } .y { cursor: row-resize; }
    .xy { cursor:nwse-resize; background:#8ab4ff; z-index:2; }
    .edge { background: #8ab4ff99; }
    .divider:hover, .edge:hover { background: #9abfff; }
    :focus-visible { outline: 2px solid white; outline-offset: -2px; }
    .shield { position: fixed; inset: 0; pointer-events: auto; cursor: grabbing; }
    .preview { position: fixed; border: 2px solid #a4c4ff; border-radius: 8px; background: #376bb366; display: grid; place-items: center; pointer-events: none; }
    .invalid { border-color: #ffacac; background: #a5363666; }
    .snap-guide { position:fixed;background:#63e6be;pointer-events:none;box-shadow:0 0 3px #163d32; }
    .live { position: fixed; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  </style><div class="panels"></div><div class="dividers"></div><div class="shield" hidden></div><div class="preview" hidden></div><div class="snap-guides"></div><div class="live" role="status" aria-live="polite"></div>`;
  const $ = selector => shadow.querySelector(selector);
  document.body.append(host);

  const toolbar = document.createElement('div');
  toolbar.id = 'customyt-toolbar';
  toolbar.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;margin-inline-end:12px;';
  const controls = toolbar.attachShadow({ mode: 'open' });
  controls.innerHTML = `<style>
    :host { all: initial; display: inline-flex; font: 13px/1.4 system-ui,sans-serif; color: var(--yt-spec-text-primary,#f1f1f1); }
    * { box-sizing: border-box; } [hidden] { display: none !important; }
    .buttons { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
    button { font: inherit; color: inherit; border: 1px solid #8885; border-radius: 18px; padding: 6px 11px; background: var(--yt-spec-badge-chip-background,#ffffff18); cursor: pointer; white-space: nowrap; }
    button:hover { background: #8884; } button:disabled { opacity: .4; cursor: default; }
    button:focus-visible { outline: 2px solid #8ab4ff; }
    .edit[aria-pressed="true"] { background: #285b9f; border-color: #8ab4ff; color: white; }
    .more { width: 30px; padding: 6px 0; }
    .menu { position: fixed; z-index: 2200; width: min(380px,calc(100vw - 16px)); padding: 16px; border: 1px solid #8885; border-radius: 12px; background: var(--yt-spec-base-background,#161616); color: var(--yt-spec-text-primary,#f1f1f1); box-shadow: 0 6px 30px #0008; white-space: normal; }
    .menu button { display: block; width: 100%; margin-top: 8px; text-align: left; border-radius: 7px; white-space: normal; }
    .menu p { margin: 9px 0; font-size: 12px; line-height: 1.6; opacity: .85; }
    select, input { font: inherit; padding: 5px; color: inherit; background: var(--yt-spec-base-background,#161616); max-width:100%; }
    .menu { max-height:calc(100vh - 80px); overflow:auto; }
    .presets { border-top:1px solid #8885; margin-top:12px; padding-top:12px; }
    .presets input,.presets select { width:100%; margin-top:6px; }
    .status { font-size: 12px; color: #8ab4ff; }
    .tabs { display:flex; gap:6px; margin:12px 0; }
    .tabs button { text-align:center; margin:0; }
    .tabs [aria-selected="true"] { background:#285b9f; color:white; border-color:#8ab4ff; }
    fieldset { border:0; padding:0; margin:0; min-width:0; }
    .mode-row { display:flex; justify-content:space-between; align-items:center; gap:12px; }
    details { margin-top:14px; font-size:12px; } summary { cursor:pointer; }
    .preset-delete { color:#ed8888; }
  </style><div class="buttons">
    <button class="edit" aria-pressed="false" title="현재 영상 화면의 배치를 편집합니다">화면 편집</button>
    <button class="undo" title="마지막 배치 변경 되돌리기" hidden>되돌리기</button>
    <button class="more" aria-label="배치 설정" aria-expanded="false">⋯</button>
  </div><div class="menu" hidden>
    <strong>CustomYT 설정</strong>
    <div class="tabs" role="tablist" aria-label="화면 유형">
      <button role="tab" id="tab-home" aria-controls="page-home" aria-selected="false" tabindex="-1" data-page="home">유튜브 메인</button>
      <button role="tab" id="tab-watch" aria-controls="page-watch" aria-selected="true" data-page="watch">영상 재생</button>
      <button role="tab" id="tab-shorts" aria-controls="page-shorts" aria-selected="false" tabindex="-1" data-page="shorts">Shorts</button>
    </div>
    <section role="tabpanel" id="page-home" aria-labelledby="tab-home" hidden><strong>유튜브 메인</strong><p>메인 화면 배치 편집은 아직 지원하지 않습니다. 현재는 영상 재생 화면에서 배치와 프리셋을 설정할 수 있습니다.</p></section>
    <section role="tabpanel" id="page-shorts" aria-labelledby="tab-shorts" hidden><strong>Shorts 재생</strong><p>Shorts 재생 화면 편집은 아직 지원하지 않습니다. 일반 영상의 추천 Shorts 패널은 ‘영상 재생’에서 편집합니다.</p></section>
    <section role="tabpanel" id="page-watch" aria-labelledby="tab-watch">
    <p class="watch-notice" hidden>일반 영상을 재생하면 아래 설정을 변경할 수 있습니다.</p>
    <fieldset class="watch-settings">
    <label class="mode-row">화면 모드 <select class="initial-mode" aria-label="화면 모드"><option value="normal">기본 모드</option><option value="theater">영화관 모드</option></select></label>
    <p>기본모드는 설명 열림·닫힘 배치를 따로 기억합니다. 영화관모드에서는 설명과 댓글을 표시하지 않습니다.</p><p class="layout-state"></p>
    <div class="presets"><strong>레이아웃 프리셋</strong>
      <input class="preset-name" aria-label="프리셋 이름" placeholder="예: 댓글 집중 배치" maxlength="40">
      <button class="preset-save">현재 배치를 새 프리셋으로 저장</button>
      <select class="preset-list" aria-label="저장한 프리셋"></select>
      <button class="preset-load">선택한 프리셋 불러오기</button>
      <button class="preset-overwrite">선택한 프리셋에 현재 배치 덮어쓰기</button>
      <button class="preset-delete">선택한 프리셋 삭제</button>
      <p>현재 모드의 프리셋만 표시합니다. 기본모드 프리셋 하나에 설명 있음·없음 배치를 함께 저장합니다. 불러온 뒤 편집해도 저장된 프리셋은 유지됩니다.</p>
    </div>
    <details><summary>편집 방법과 초기화</summary><p>화면 편집 → 제목을 끌어 이동 → 우하단 모서리로 크기 조절 → 완료 순서로 사용하세요. 겹치는 패널은 아래로 밀립니다. Esc로 드래그나 이번 편집을 취소할 수 있습니다.</p><button class="reset">현재 모드를 유튜브 기본 배치로 초기화</button></details>
    </fieldset><details><summary>패널 상태 확인</summary><button class="panel-diagnostics">현재 상태 확인</button><pre class="panel-report" style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;user-select:text"></pre></details></section>
    <div class="status" role="status" aria-live="polite"></div>
  </div>`;
  const C = selector => controls.querySelector(selector);
  C('.panel-diagnostics').onclick=()=>{
    const shorts=nodes.shorts;
    const r=shorts?.getBoundingClientRect();
    const hidden=[];
    for(let p=shorts;p && p!==watch;p=p.parentElement) {
      const css=getComputedStyle(p);
      if(css.display==='none' || css.visibility==='hidden')hidden.push(`${p.localName}${p.id?'#'+p.id:''}`);
    }
    C('.panel-report').textContent=JSON.stringify({
      version:chrome.runtime?.getManifest?.().version||'local',mode:activeMode,layout:activeSlot,
      shortsContentCount:watch?.querySelectorAll('a[href*="/shorts/"], ytd-reel-item-renderer, ytm-shorts-lockup-view-model-v2').length||0,
      shortsDetected:!!shorts,savedShorts:tree?.panels.shorts||null,
      actualShorts:r?{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}:null,
      belowViewport:!!r && r.top>=innerHeight,hiddenAncestors:hidden
    },null,2);
  };
  function selectPage(page) {
    for(const tab of controls.querySelectorAll('[role="tab"]')) {
      const selected=tab.dataset.page===page;
      tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
      C(`#page-${tab.dataset.page}`).hidden=!selected;
    }
  }
  for(const tab of controls.querySelectorAll('[role="tab"]')) {
    tab.onclick=()=>selectPage(tab.dataset.page);
    tab.onkeydown=event=>{
      const tabs=[...controls.querySelectorAll('[role="tab"]')];
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(tabs.indexOf(tab)+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      selectPage(tabs[index].dataset.page);tabs[index].focus();
    };
  }
  let settingsPath='';

  function notify(text) { $('.live').textContent = text; C('.status').textContent = text; C('.edit').title = text || '현재 영상 화면의 배치를 편집합니다'; }
  function mountToolbar() {
    const end = document.querySelector('ytd-masthead #end');
    if (!end) { toolbar.remove(); return; }
    if (toolbar.parentElement !== end) end.insertBefore(toolbar, end.firstChild);
  }
  function updateControls() {
    toolbar.style.display = navigating || document.fullscreenElement ? 'none' : 'inline-flex';
    C('.edit').hidden=!watch;
    C('.watch-settings').disabled=!watch;
    C('.watch-notice').hidden=!!watch;
    if(settingsPath!==location.pathname){settingsPath=location.pathname;selectPage(settingsPath==='/watch'?'watch':settingsPath.startsWith('/shorts')?'shorts':'home');}
    C('.edit').textContent = editing ? '완료' : '화면 편집';
    C('.edit').setAttribute('aria-pressed', String(editing));
    C('.edit').disabled = !!suspendedReason || !modeApplied;
    C('.initial-mode').disabled = !modeApplied && modeClicked;
    C('.initial-mode').title = modeApplied ? '현재 화면에 적용할 모드' : '유튜브 화면 모드를 적용하는 중입니다';
    C('.undo').hidden = !editing; C('.undo').disabled = !undo.length;
    C('.reset').disabled = !tree;
    C('.preset-save').disabled = !modeApplied || !!suspendedReason;
    const selected=presets.some(p=>p.id===C('.preset-list').value && p.mode===activeMode);
    for(const action of ['load','overwrite','delete'])C(`.preset-${action}`).disabled=!selected || !modeApplied || !!suspendedReason;
    if (!C('.menu').hidden) {
      const r = toolbar.getBoundingClientRect();
      Object.assign(C('.menu').style, { top: `${r.bottom + 8}px`, right: `${Math.max(8, innerWidth - r.right)}px` });
    }
  }
  function save() {
    storeCurrentLayout();
    const value = { version: 3, initialMode, normalDescriptionVisible, layouts: clone(layouts) };
    storageQueue = storageQueue.then(() => chrome.storage.local.set({ [KEY]: value }))
      .then(() => notify('배치를 저장했습니다.'))
      .catch(() => notify('배치를 저장하지 못했습니다. 확장프로그램을 다시 로드했다면 유튜브를 새로고침해 주세요.'));
  }
  function storeCurrentLayout() { if(activeSlot)layouts[activeSlot]=L.layoutVariant(tree,activeSlot); }
  function normalPresetLayouts() {
    storeCurrentLayout();
    return {normal:clone(layouts.normal),normalWithoutDescription:clone(layouts.normalWithoutDescription)};
  }
  function remember(before = tree) { undo.push(clone(before)); if (undo.length > 25) undo.shift(); }
  function presetOptions(selected = C('.preset-list').value) {
    C('.preset-list').replaceChildren();
    const empty=document.createElement('option');empty.value='';empty.textContent='프리셋 선택';C('.preset-list').append(empty);
    for(const preset of presets.filter(p=>p.mode===(activeMode||initialMode))){
      const option=document.createElement('option');option.value=preset.id;
      option.textContent=`${preset.name} · ${preset.mode==='theater'?'영화관':'기본'}`;C('.preset-list').append(option);
    }
    C('.preset-list').value=selected;updateControls();
  }
  function persistPresets(message) {
    const snapshot=clone(presets);
    storageQueue=storageQueue.then(()=>chrome.storage.local.set({[PRESET_KEY]:snapshot}))
      .then(()=>notify(message)).catch(()=>notify('프리셋 저장에 실패했습니다. 유튜브를 새로고침한 뒤 다시 시도해 주세요.'));
  }
  C('.preset-list').onchange=()=>updateControls();
  C('.preset-save').onclick=()=>{
    const name=C('.preset-name').value.trim();
    if(!name){notify('프리셋 이름을 입력해 주세요.');C('.preset-name').focus();return;}
    if(presets.length>=30){notify('프리셋은 최대 30개입니다. 필요 없는 항목을 삭제해 주세요.');return;}
    if(presets.some(p=>p.name===name)){notify('같은 이름이 있습니다. 다른 이름을 쓰거나 해당 프리셋을 선택해 덮어써 주세요.');return;}
    cancelGesture();
    const preset={id:crypto.randomUUID(),name,mode:currentMode(),tree:clone(tree)};
    if(preset.mode==='normal'){preset.variants=normalPresetLayouts();preset.descriptionVisible=normalDescriptionVisible;}
    presets.push(preset);presetOptions(preset.id);persistPresets('현재 배치를 프리셋으로 저장했습니다.');
  };
  C('.preset-overwrite').onclick=()=>{
    const preset=presets.find(p=>p.id===C('.preset-list').value);if(!preset)return;
    cancelGesture();preset.mode=currentMode();preset.tree=clone(tree);
    if(preset.mode==='normal'){preset.variants=normalPresetLayouts();preset.descriptionVisible=normalDescriptionVisible;}else delete preset.variants;
    presetOptions(preset.id);persistPresets('선택한 프리셋을 현재 배치로 덮어썼습니다.');
  };
  C('.preset-delete').onclick=()=>{
    presets=presets.filter(p=>p.id!==C('.preset-list').value);presetOptions('');persistPresets('프리셋을 삭제했습니다. 현재 배치는 유지됩니다.');
  };
  C('.preset-load').onclick=()=>{
    const preset=presets.find(p=>p.id===C('.preset-list').value);if(!preset)return;
    cancelGesture();storeCurrentLayout();
    release();editing=false;undo=[];
    if(preset.mode==='normal') {
      if(typeof preset.descriptionVisible==='boolean')normalDescriptionVisible=preset.descriptionVisible;
      for(const slot of ['normal','normalWithoutDescription']) {
        const value=preset.variants?.[slot];
        layouts[slot]=L.layoutVariant(value===null || L.validRects(value)?value:preset.tree,slot);
      }
    } else layouts.theater=L.layoutVariant(preset.tree,'theater');
    if(activeMode===preset.mode)tree=clone(layouts[activeSlot]);
    initialMode=preset.mode;C('.initial-mode').value=initialMode;
    modeApplied=false;modeDeadline=0;modeClicked=false;modeStableSince=0;
    save();requestRender();scheduleRefresh();
  };
  function setRect(element, r) { Object.assign(element.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` }); }
  function nativeVisible(node) {
    if (!node || !node.isConnected) return false;
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(node).visibility !== 'hidden';
  }
  function materialComments(node) { return !!node?.querySelector('ytd-comment-thread-renderer, ytd-comment-view-model, ytd-message-renderer, #message'); }
  function materialDescription(node) {
    return !!node && Array.from(node.querySelectorAll('#description-inline-expander, ytd-text-inline-expander, yt-attributed-string, yt-formatted-string, p'))
      .some(part => part.textContent.trim().length > 0);
  }
  function materialShorts(node) {
    return !!node.querySelector('a[href*="/shorts/"], ytd-reel-item-renderer, yt-shorts-lockup-view-model, yt-shorts-lockup-view-model-v2, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, .short');
  }
  function discover() {
    const next = {};
    const pick = (id, selectors, ready = () => true) => {
      if(activeMode==='theater' && ['description','comments'].includes(id))return;
      if(id==='description' && normalDescriptionVisible===false)return;
      const shortsCandidates=[];
      for (const selector of selectors) for (const node of watch.querySelectorAll(selector)) {
        const engagement = node.closest('ytd-engagement-panel-section-list-renderer');
        const justOpened = engagement?.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';
        // Keep loaded comments independent; description follows native open/close.
        const independentContent=activeMode==='normal' && !!engagement && id==='comments' && ready(node) &&
          !!(tree || layouts.normal || layouts.normalWithoutDescription);
        const requestedDescription=id==='description' && normalDescriptionVisible===true && !!engagement && ready(node);
        if(engagement && !justOpened && !independentContent && !requestedDescription)continue;
        if(id==='description' && node.closest('[hidden]'))continue;
        const panel = engagement && ['comments','description'].includes(id) ? engagement : node;
        const restoredShorts=id==='shorts' && materialShorts(node) &&
          ((tree?.panels.shorts) ||
           (applied && !!node.closest('.cyt-unused, .cyt-panel, .cyt-path')));
        if (ready(node) && ((applied && nodes[id] === panel) || nativeVisible(node) || justOpened || independentContent || requestedDescription || restoredShorts)) {
          if(id==='shorts') {
            const visible=nativeVisible(node) && !node.closest('[hidden], .cyt-unused');
            shortsCandidates.push({node:panel,score:visible?2:nodes.shorts===panel?1:0});
          } else { next[id] = panel; return; }
        }
      }
      if(shortsCandidates.length)next.shorts=shortsCandidates.sort((a,b)=>b.score-a.score)[0].node;
    };
    pick('video', ['#player:has(video)', '#player:has(ytd-player)']);
    pick('info', ['ytd-watch-metadata']);
    pick('description', ['ytd-watch-metadata #description', 'ytd-structured-description-content-renderer'], materialDescription);
    // Skip empty skeletons and hidden engagement wrappers; select real content.
    pick('comments', ['ytd-comments[engagement-panel]', 'ytd-comments#comments'], node => materialComments(node) || (nativeVisible(node) && node.innerText.trim().length > 30));
    pick('related', ['#related:has(ytd-watch-next-secondary-results-renderer)']);
    pick('shorts', ['#related ytd-reel-shelf-renderer', '#related yt-reel-shelf-view-model', '#related ytd-rich-shelf-renderer[is-shorts]', 'ytd-reel-shelf-renderer', 'yt-reel-shelf-view-model', 'ytd-rich-shelf-renderer[is-shorts]', 'yt-shelf-view-model:has(a[href*="/shorts/"])'], materialShorts);
    // YouTube can move the same shelf to a different wrapper during a mode switch.
    // A node identity match alone does not mean our visible ancestor paths are current.
    const nextPaths=new Set();
    for(const node of Object.values(next))for(let p=node.parentElement;p && p!==watch;p=p.parentElement)nextPaths.add(p);
    const samePaths=!applied || (nextPaths.size===paths.size && [...nextPaths].every(p=>paths.has(p)));
    if (samePaths && Object.keys(next).length === Object.keys(nodes).length && Object.entries(next).every(([id, node]) => nodes[id] === node)) return;
    release(); nodes = next;
  }
  function release() {
    const wasApplied = applied;
    watch?.classList.remove('cyt-layout'); watch?.style.removeProperty('--cyt-page-height');
    for (const node of Object.values(nodes)) {
      node.classList.remove('cyt-panel'); node.removeAttribute('data-cyt-panel');
      for (const prop of ['x', 'y', 'w', 'h', 'display']) node.style.removeProperty(`--cyt-${prop}`);
    }
    for (const node of paths) node.classList.remove('cyt-path');
    for (const node of unused) node.classList.remove('cyt-unused');
    paths.clear(); unused.clear(); applied = false;
    for(const grid of grids){grid.classList.remove('cyt-grid');grid.style.removeProperty('--cyt-card-width');}
    grids.clear();
    if (wasApplied && !nativeResizeFrame) {
      nativeResizeFrame = requestAnimationFrame(() => {
        nativeResizeFrame = 0;
        window.dispatchEvent(new Event('resize'));
      });
    }
  }
  function mark() {
    preserveGrids();
    const selected = new Set(Object.values(nodes));
    for (const [id, node] of Object.entries(nodes)) {
      const display=getComputedStyle(node).display;
      node.style.setProperty('--cyt-display', display==='none'?'block':display);
      node.classList.add('cyt-panel'); node.dataset.cytPanel = id;
      for (let p = node.parentElement; p && p !== watch; p = p.parentElement) { p.classList.add('cyt-path'); paths.add(p); }
    }
    // Only unused branches disappear; active content ancestors stay visible.
    function visit(parent) {
      for (const child of parent.children) {
        if (selected.has(child) || ['STYLE', 'SCRIPT', 'TEMPLATE'].includes(child.tagName)) continue;
        if (paths.has(child)) visit(child);
        else { child.classList.add('cyt-unused'); unused.add(child); }
      }
    }
    visit(watch); watch.classList.add('cyt-layout'); applied = true;
  }
  function preserveGrids() {
    for(const grid of nodes.related?.querySelectorAll('ytd-item-section-renderer > #contents')||[]) {
      if(grids.has(grid) || getComputedStyle(grid).display!=='grid')continue;
      const card=grid.querySelector('yt-lockup-view-model, ytd-compact-video-renderer, ytd-rich-item-renderer');
      const width=card?.getBoundingClientRect().width;
      if(!width || width<100)continue;
      grid.style.setProperty('--cyt-card-width',`${width}px`);grid.classList.add('cyt-grid');grids.add(grid);
    }
  }
  function currentMode() {
    const button=watch?.querySelector('.ytp-size-button');
    if(!button)return null;
    for(const path of button.querySelectorAll('path')){
      const mode=L.modeFromIcon(path.getAttribute('d'));if(mode)return mode;
    }
    for(const attribute of ['aria-label','title','data-title-no-tooltip','data-tooltip-title']){
      const mode=L.modeFromLabel(button.getAttribute(attribute));
      if(mode)return mode;
    }
    return watch?.hasAttribute('theater')?'theater':null;
  }
  function topOffset() {
    const bottom = document.querySelector('ytd-masthead')?.getBoundingClientRect().bottom;
    return bottom > 0 && bottom < 140 ? bottom : 56;
  }
  function layoutFor(candidate) {
    return L.arrangeRects(candidate, innerWidth, watch.getBoundingClientRect().y, new Set(Object.keys(nodes)));
  }
  function currentLayout() {
    const captured = tree || L.capture(nativeGeometry().panels, innerWidth, watch.getBoundingClientRect().y);
    if (!L.validRects(captured)) {
      notify('현재 열린 영역이 겹쳐 있어 편집을 시작할 수 없습니다. 겹쳐 열린 설명·댓글 패널을 닫아 주세요.');
      return null;
    }
    return captured;
  }
  function nativeGeometry() {
    const panels = Object.fromEntries(Object.entries(nodes).filter(([,node]) => nativeVisible(node)).map(([id,node]) => [id, rectOf(node)]));
    for (const [parent, child] of [['info', 'description'], ['related', 'shorts']]) {
      const a = panels[parent], b = panels[child];
      if (!a || !b || !nodes[parent].contains(nodes[child])) continue;
      if (b.y - a.y >= 32) a.h = Math.min(a.h, b.y - a.y);
      else if (a.y + a.h > b.y + b.h + 32) { const end = a.y + a.h; a.y = b.y + b.h; a.h = end - a.y; }
    }
    return { panels, dividers: [], fits: true };
  }
  function clearOverlays() { $('.panels').replaceChildren(); $('.dividers').replaceChildren(); }
  function renderOverlays() {
    if (!editing || suspendedReason) { clearOverlays(); return; }
    const ids = Object.keys(geometry.panels);
    for (const section of Array.from($('.panels').children)) if (!ids.includes(section.dataset.panel)) section.remove();
    for (const [id, r] of Object.entries(geometry.panels)) {
      let section = $('.panels').querySelector(`[data-panel="${id}"]`);
      if (!section) {
        section = document.createElement('section'); section.className = 'panel'; section.dataset.panel = id;
        const handle = document.createElement('button'); handle.className = 'handle'; handle.textContent = `⠿ ${L.PANELS[id].title}`;
        handle.title = '끌어서 이동하세요. 겹치는 패널은 아래로 밀립니다';
        handle.onpointerdown = event => startDrag(event, id);
        section.append(handle); $('.panels').append(section);
      }
      setRect(section, r); section.hidden = r.y + r.h <= topOffset() || r.y >= innerHeight;
      section.querySelector('.handle').style.top = `${Math.max(3, topOffset() + 4 - r.y)}px`;
    }
    const edgeKeys = new Set();
    function edgeFor(key, className) {
      edgeKeys.add(key);
      let edge = Array.from($('.dividers').children).find(node => node.dataset.key === key);
      if (!edge) { edge = document.createElement('div'); edge.dataset.key = key; $('.dividers').append(edge); }
      edge.className = className;
      return edge;
    }
    for (const [id, r] of Object.entries(geometry.panels)) {
      if (r.y + r.h < topOffset() || r.y >= innerHeight) continue;
      const edge = edgeFor(`rect:${id}:xy`, 'edge xy');
      setRect(edge, {x:r.x+r.w-12,y:r.y+r.h-12,w:16,h:16});
      edge.tabIndex=0; edge.setAttribute('role','separator');
      edge.setAttribute('aria-label',`${L.PANELS[id].title} 너비와 높이 조절`);
      edge.setAttribute('aria-orientation','horizontal');
      edge.setAttribute('aria-valuenow',String(Math.round(r.h)));
      edge.onpointerdown=event=>startNativeResize(event,id,'xy');
      edge.onkeydown=event=>resizeWithKey(event,id,'xy');
    }
    for (const edge of Array.from($('.dividers').children)) if (!edgeKeys.has(edge.dataset.key)) edge.remove();
  }
  function specialMode() {
    if (document.fullscreenElement || watch?.hasAttribute('fullscreen')) return '전체화면에서는 유튜브 기본 동작을 사용합니다.';
    if (watch && Array.from(watch.querySelectorAll('ytd-live-chat-frame:not([hidden]), ytd-playlist-panel-renderer:not([hidden])')).some(nativeVisible)) return '라이브 채팅·재생목록이 열린 화면의 편집은 아직 지원하지 않습니다.';
    return '';
  }
  function render() {
    frame = 0; mountToolbar(); suspendedReason = specialMode();
    if (!modeApplied && watch) { release(); clearOverlays(); updateControls(); return; }
    if (!watch || navigating || suspendedReason) { release(); clearOverlays(); if(navigating || suspendedReason)C('.menu').hidden = true; updateControls(); return; }
    if (tree && nodes.video && nodes.info) {
      const planned = layoutFor(tree);
      if (planned.fits) {
        if (!applied) mark();
        const height = Math.max(...Object.values(planned.panels).map(r => r.y + r.h)) - watch.getBoundingClientRect().y + 8;
        watch.style.setProperty('--cyt-page-height', `${height}px`);
        geometry = layoutFor(tree);
        for (const [id, r] of Object.entries(geometry.panels)) for (const [prop, value] of Object.entries(r)) nodes[id].style.setProperty(`--cyt-${prop}`, `${value}px`);
      } else {
        release(); geometry = nativeGeometry(); notify('창 너비가 부족하여 기본 배치를 표시합니다. 창을 넓히면 저장한 배치가 돌아옵니다.');
      }
    } else { if (applied) release(); geometry = nativeGeometry(); }
    renderOverlays(); updateControls();
  }
  function requestRender() { if (!frame) frame = requestAnimationFrame(render); }
  function refresh() {
    refreshTimer = 0;
    if (!loaded) return;
    mountToolbar();
    const next = location.pathname === '/watch' ? document.querySelector('ytd-watch-flexy:not([hidden])') : null;
    if (watch !== next) { cancelGesture(); release(); watch?.classList.remove('cyt-theater-panels','cyt-hide-description'); nodes = {}; watch = next; }
    if (watch) {
      const key=watch.getAttribute('video-id')||new URL(location.href).searchParams.get('v')||'';
      let nativeChanged=false;
      if(key!==videoKey){videoKey=key;navigationSettlesUntil=Date.now()+4000;modeApplied=false;modeDeadline=0;modeClicked=false;modeStableSince=0;}
      if(descriptionOpened) {
        descriptionOpened=false;
        normalDescriptionVisible=true;
        if(activeMode==='theater' && !nativeModeRequest) {
          initialMode='normal';nativeChanged=true;navigationSettlesUntil=0;
          modeApplied=false;modeDeadline=0;modeClicked=false;modeStableSince=0;
          save();
        }
      }
      if(descriptionClosed) {
        descriptionClosed=false;
        normalDescriptionVisible=false;save();
        // Closing the native side panel can also change YouTube's player mode.
        // It is a layout-variant change, not a request to leave normal mode.
        if(activeMode==='normal' && initialMode==='normal' && !nativeModeRequest && modeApplied) {
          navigationSettlesUntil=Date.now()+1800;
          modeApplied=false;modeDeadline=0;modeClicked=false;modeStableSince=0;
        }
      }
      if(nativeModeRequest){
        const actual=currentMode();
        if(actual===nativeModeRequest.before && Date.now()<nativeModeRequest.until){scheduleRefresh();return;}
        if(actual && actual!==nativeModeRequest.before){initialMode=actual;nativeChanged=true;navigationSettlesUntil=0;}
        nativeModeRequest=null;modeApplied=true;modeDeadline=0;modeClicked=false;
      }
      if(modeApplied && Date.now()<navigationSettlesUntil && currentMode() && currentMode()!==initialMode){modeApplied=false;modeDeadline=0;modeClicked=false;modeStableSince=0;}
      applyInitialMode();
      if(!modeApplied){requestRender();return;}
      const mode=currentMode();
      if(!mode){scheduleRefresh();return;}
      if (activeMode!==mode) {
        cancelGesture();
        storeCurrentLayout();
        release(); activeMode=mode; activeSlot=null; tree=clone(layouts[mode]); undo=[]; editing=false;
        presetOptions('');
      }
      // A page's transient default must not overwrite the user's saved choice.
      C('.initial-mode').value=mode;
      if(nativeChanged)save();
      watch.classList.toggle('cyt-theater-panels',mode==='theater');
      watch.classList.toggle('cyt-hide-description',mode==='normal' && normalDescriptionVisible===false);
      discover();
      if(mode==='normal' && normalDescriptionVisible===null) {normalDescriptionVisible=!!nodes.description;save();}
      const slot=mode==='theater'?'theater':nodes.description?'normal':'normalWithoutDescription';
      if(activeSlot!==slot) {
        cancelGesture();storeCurrentLayout();release();
        activeSlot=slot;tree=clone(layouts[slot]);undo=[];
        if(editing)editStart=clone(tree);
        C('.layout-state').textContent=slot==='theater'?'현재 배치: 영화관':slot==='normal'?'현재 배치: 기본 · 설명 있음':'현재 배치: 기본 · 설명 없음';
      }
      if(applied)preserveGrids();
      // Newly loaded content gets its own free slot; existing slots stay in place.
      if(tree)for(const [id,node] of Object.entries(nodes))if(!tree.panels[id]) {
        const bottom=Math.max(0,...Object.values(tree.panels).map(r=>r.y+r.h));
        const r=rectOf(node);
        tree.panels[id]={x:24,y:bottom+L.GAP,w:Math.min(tree.width-48,Math.max(L.PANELS[id].min[0],r.w)),h:Math.max(L.PANELS[id].min[1],Math.min(r.h,500))};
        if(id==='comments' && mode==='normal') {
          const previous=slot==='normal'?layouts.normalWithoutDescription:layouts.normal;
          tree=L.restorePanelPosition(tree,'comments',previous?.panels.comments,previous?.width);
        }
      }
    }
    requestRender();
  }
  function scheduleRefresh() { if (!refreshTimer) refreshTimer = setTimeout(refresh, 100); }
  function capture(event) { event.preventDefault(); host.setPointerCapture(event.pointerId); $('.shield').hidden = false; }
  function startDrag(event, id) {
    if (!editing || event.button !== 0) return;
    const base=currentLayout(); if(!base)return;
    gesture={type:'drag',source:id,startX:event.clientX,startY:event.clientY,before:clone(tree),base:clone(base)};capture(event);
  }
  function startNativeResize(event,id,axis) {
    if(!editing || event.button!==0)return;
    const base=currentLayout(); if(!base)return;
    gesture={type:'resize',id,axis,startX:event.clientX,startY:event.clientY,before:clone(tree),base:clone(base)};capture(event);
  }
  function resizeWithKey(event,id,axis) {
    const keys=axis==='xy'?['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']:axis==='x'?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];
    if(!keys.includes(event.key))return;
    event.preventDefault();const base=currentLayout();if(!base)return;
    remember();const horizontal=['ArrowLeft','ArrowRight'].includes(event.key),delta=['ArrowLeft','ArrowUp'].includes(event.key)?-16:16;
    tree=L.resizePushing(base,id,horizontal?delta*base.width/innerWidth:0,horizontal?0:delta);requestRender();save();
  }
  window.addEventListener('pointermove', event => {
    if (!gesture) return;
    if (gesture.type === 'resize') {
      const dx=gesture.axis==='y'?0:(event.clientX-gesture.startX)*gesture.base.width/innerWidth;
      const dy=gesture.axis==='x'?0:event.clientY-gesture.startY;
      if(Math.abs(dx)+Math.abs(dy)<2)return;
      tree=snappedGesture(gesture.id,dx,dy,true,event.altKey);requestRender();return;
    }
    const dx=(event.clientX-gesture.startX)*gesture.base.width/innerWidth, dy=event.clientY-gesture.startY;
    if(Math.abs(dx)+Math.abs(dy)<3)return;
    const top=watch.getBoundingClientRect().y;
    const candidate=snappedGesture(gesture.source,dx,dy,false,event.altKey);
    gesture.candidate=candidate;
    const scale=innerWidth/gesture.base.width;
    const moved=candidate.panels[gesture.source];
    const r={x:moved.x*scale,y:moved.y+top,w:moved.w*scale,h:moved.h};
    if(candidate){tree=candidate;requestRender();}
    setRect($('.preview'),r);$('.preview').hidden=false;$('.preview').classList.toggle('invalid',!candidate);
    $('.preview').textContent=candidate?'': '겹치는 위치입니다. 빈 공간으로 이동해 주세요';
  },true);
  function snappedGesture(id,dx,dy,resize,disabled) {
    const top=watch.getBoundingClientRect().y,scale=innerWidth/gesture.base.width;
    const result=L.snapPanels(gesture.base,id,dx,dy,resize,{
      minY:topOffset()+4-top,bottom:innerHeight-top,thresholdX:10/scale,thresholdY:10,disabled
    });
    $('.snap-guides').replaceChildren();
    for(const guide of result.guides) {
      const line=document.createElement('div');line.className='snap-guide';
      setRect(line,guide.axis==='x'?{x:guide.value*scale,y:topOffset(),w:1,h:innerHeight-topOffset()}:{x:0,y:guide.value+top,w:innerWidth,h:1});
      $('.snap-guides').append(line);
    }
    return result.layout;
  }
  window.addEventListener('pointerup', () => {
    if (!gesture) return;
    const before=gesture.before;
    if(gesture.type==='drag')tree=gesture.candidate||gesture.before;
    if(JSON.stringify(before)!==JSON.stringify(tree)) {remember(before);save();}
    gesture=null;$('.shield').hidden=true;$('.preview').hidden=true;$('.snap-guides').replaceChildren();requestRender();
    window.dispatchEvent(new Event('resize'));
  },true);
  function cancelGesture() {
    if(gesture)tree=gesture.before;
    gesture=null;$('.shield').hidden=true;$('.preview').hidden=true;$('.snap-guides').replaceChildren();requestRender();
  }
  window.addEventListener('pointercancel',cancelGesture,true);
  window.addEventListener('blur',()=>{if(gesture)cancelGesture();});
  window.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    if(gesture){cancelGesture();return;}
    if(!C('.menu').hidden){C('.menu').hidden=true;C('.more').setAttribute('aria-expanded','false');return;}
    if(editing){tree=clone(editStart);editing=false;undo=[];save();requestRender();}
  });
  C('.edit').onclick=()=>{
    cancelGesture();
    if(!editing){editStart=clone(tree);editing=true;notify('이동·크기 조절 시 10px 이내 경계에 정렬됩니다. Alt를 누르면 자유 조절합니다. 겹치는 패널은 아래로 밀립니다.');}
    else {editing=false;save();}
    requestRender();
  };
  C('.undo').onclick=()=>{cancelGesture();if(undo.length){tree=undo.pop();save();requestRender();}};
  C('.reset').onclick=()=>{cancelGesture();remember();tree=null;save();requestRender();};
  C('.more').onclick=()=>{C('.menu').hidden=!C('.menu').hidden;C('.more').setAttribute('aria-expanded',String(!C('.menu').hidden));updateControls();};
  document.addEventListener('pointerdown',event=>{
    if(!C('.menu').hidden && !event.composedPath().includes(toolbar)){
      C('.menu').hidden=true;C('.more').setAttribute('aria-expanded','false');
    }
  },true);
  function applyInitialMode() {
    if(modeApplied || !watch || document.fullscreenElement)return;
    // This button is a toggle, not an idempotent mode setter. Never retry it
    // while an earlier transition may still be running.
    if(applied){release();requestRender();scheduleRefresh();return;}
    if(!modeDeadline)modeDeadline=Date.now()+6000;
    if(currentMode()===initialMode){
      if(!modeStableSince)modeStableSince=Date.now();
      if(Date.now()-modeStableSince<100){scheduleRefresh();return;}
      modeApplied=true;modeDeadline=0;modeClicked=false;return;
    }
    modeStableSince=0;
    if(Date.now()>modeDeadline){
      modeApplied=true;modeDeadline=0;modeClicked=false;
      const actual=currentMode();
      if(actual)C('.initial-mode').value=actual;
      notify('모드 전환에 실패했습니다. 현재 화면 모드를 표시합니다. 원하는 모드를 다시 선택해 주세요.');return;
    }
    const button=watch.querySelector('.ytp-size-button');
    if(currentMode() && button && button.isConnected && !button.disabled && nativeVisible(button) && !modeClicked){
      modeClicked=true;modeLastClick=Date.now();button.click();updateControls();
    }
    scheduleRefresh();
  }
  C('.initial-mode').onchange=()=>{
    navigationSettlesUntil=0;
    nativeModeRequest=null;
    cancelGesture(); storeCurrentLayout();
    release(); editing=false; initialMode=C('.initial-mode').value;modeApplied=false;modeDeadline=0;modeClicked=false;modeStableSince=0;
    save();notify('선택한 모드를 적용하는 중입니다.');requestRender();scheduleRefresh();
  };
  function nativeModeIntent() {
    if(!watch || document.fullscreenElement)return;
    nativeModeRequest={before:currentMode(),until:Date.now()+1800};
    cancelGesture();release();editing=false;modeApplied=false;modeDeadline=0;modeClicked=false;modeStableSince=0;
    clearOverlays();scheduleRefresh();
  }
  document.addEventListener('click',event=>{
    const title=event.composedPath().find(node=>node instanceof Element && node.matches('ytd-watch-metadata h1, ytd-watch-metadata #title'));
    if(event.isTrusted && title && watch?.contains(title) && modeApplied) {
      normalDescriptionVisible=true;
      const content=watch.querySelector('ytd-structured-description-content-renderer');
      if(activeMode==='theater') {
        // A title click is an explicit request, even if YouTube's panel is
        // already internally expanded and its next native click would close it.
        cancelGesture();storeCurrentLayout();
        initialMode='normal';nativeModeRequest=null;navigationSettlesUntil=0;
        modeApplied=false;modeDeadline=0;modeClicked=false;modeStableSince=0;
        editing=false;release();
        if(materialDescription(content)) {
          event.preventDefault();event.stopImmediatePropagation();
          content.closest('ytd-engagement-panel-section-list-renderer')?.setAttribute('visibility','ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
        }
        save();requestRender();scheduleRefresh();return;
      }
      save();
      if(tree && materialDescription(content)) {event.preventDefault();event.stopImmediatePropagation();}
      scheduleRefresh();return;
    }
    const close=event.composedPath().find(node=>node instanceof Element && node.matches('button, [role="button"]') &&
      /^(닫기|패널 닫기|close|close panel)$/i.test(node.getAttribute('aria-label')||''));
    const description=close?.closest('[target-id="engagement-panel-structured-description"]');
    if(event.isTrusted && description && watch?.contains(description) && activeMode==='normal' && modeApplied && !nativeModeRequest) {
      // Hide only this panel; do not run YouTube's close handler that restores theater mode.
      event.preventDefault();event.stopImmediatePropagation();
      normalDescriptionVisible=false;save();
      scheduleRefresh();return;
    }
    if(event.isTrusted && event.composedPath().some(node=>node instanceof Element && node.matches('.ytp-size-button')))nativeModeIntent();
  },true);
  document.addEventListener('keydown',event=>{
    if(!event.isTrusted || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.key.toLowerCase()!=='t')return;
    if(event.composedPath().some(node=>node instanceof Element && (node.matches('input,textarea,select') || node.isContentEditable)))return;
    nativeModeIntent();
  },true);
  window.addEventListener('scroll',requestRender,{passive:true});
  window.addEventListener('resize',()=>{if(gesture)cancelGesture();requestRender();});
  document.addEventListener('fullscreenchange',()=>{cancelGesture();requestRender();});
  document.addEventListener('yt-navigate-start',()=>{navigating=true;nativeModeRequest=null;modeApplied=false;modeDeadline=0;modeClicked=false;modeStableSince=0;cancelGesture();release();clearOverlays();editing=false;updateControls();});
  document.addEventListener('yt-navigate-finish',()=>{navigating=false;refresh();});
  window.addEventListener('popstate',scheduleRefresh);
  new MutationObserver(records=>{
    if(activeMode==='theater' && modeApplied && !nativeModeRequest && !navigating) {
      descriptionOpened ||= records.some(record=>record.type==='attributes' && record.attributeName==='visibility' &&
        record.oldValue!=='ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' &&
        record.target.matches('[target-id="engagement-panel-structured-description"]') &&
        record.target.getAttribute('visibility')==='ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
    }
    if(activeMode==='normal' && initialMode==='normal' && modeApplied && !nativeModeRequest && !navigating) {
      if(records.some(record=>record.type==='attributes' && record.attributeName==='visibility' &&
        record.oldValue!=='ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' &&
        record.target.matches('[target-id="engagement-panel-structured-description"]') &&
        record.target.getAttribute('visibility')==='ENGAGEMENT_PANEL_VISIBILITY_EXPANDED')) {
        normalDescriptionVisible=true;save();
      }
      descriptionClosed ||= records.some(record=>
        record.type==='attributes' && record.attributeName==='visibility' &&
        record.oldValue==='ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' &&
        record.target.matches('[target-id="engagement-panel-structured-description"]') &&
        record.target.getAttribute('visibility')==='ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
    }
    if(records.some(record=>record.target!==host && record.target!==toolbar && !host.contains(record.target) && !toolbar.contains(record.target) && !(record.type==='childList' && nodes.video?.contains(record.target) && !record.target.closest?.('.ytp-size-button'))))scheduleRefresh();
  }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['hidden','visibility','theater','fullscreen','video-id','aria-label','title','data-title-no-tooltip','data-tooltip-title','d','secondary-grid-columns','is-grid-view-enabled']});
  Promise.all([chrome.storage.local.get(KEY),chrome.storage.local.get(PRESET_KEY)]).then(([result,presetResult])=>{
    const saved=result[KEY];
    if(saved?.version===3){
      if(typeof saved.normalDescriptionVisible==='boolean')normalDescriptionVisible=saved.normalDescriptionVisible;
      if(['normal','theater'].includes(saved.initialMode))initialMode=saved.initialMode;
      for(const mode of ['normal','normalWithoutDescription','theater'])if(L.validRects(saved.layouts?.[mode]))layouts[mode]=L.layoutVariant(saved.layouts[mode],mode);
      if(!Object.hasOwn(saved.layouts||{},'normalWithoutDescription'))layouts.normalWithoutDescription=L.layoutVariant(layouts.normal,'normalWithoutDescription');
    }
    C('.initial-mode').value=initialMode;
    const list=presetResult[PRESET_KEY];
    if(Array.isArray(list))presets=list.filter(p=>p && typeof p.id==='string' && typeof p.name==='string' && p.name.trim().length>0 && p.name.length<=40 && ['normal','theater'].includes(p.mode) && (p.tree===null || L.validRects(p.tree))).slice(0,30);
    presetOptions('');
  }).catch(()=>notify('저장한 배치를 읽지 못해 유튜브 기본 화면으로 시작합니다.')).finally(()=>{loaded=true;refresh();});
})();
