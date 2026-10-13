(() => {
  'use strict';
  if(document.getElementById('customyt-shorts-host'))return;
  const L=globalThis.CustomYTLayout, KEY='customyt.shorts.v1';
  // Reuse the shared rectangle engine's related slot for the Shorts action bar.
  const labels={video:'Shorts 영상',info:'Shorts 기본정보',related:'Shorts 액션 버튼',comments:'Shorts 댓글'};
  let variants={closed:null,open:null},slot=null;
  let closeRequestedUntil=0,closedSince=0,closeTimer=0;
  let layout=null,presets=[],nodes={},paths=new Set(),root=null,editing=false,gesture=null;
  let loaded=false,timer=0,queue=Promise.resolve(),undo=[],editStart=null,lastUrl='',ui=null,resizeFrame=0;
  const copy=value=>value?structuredClone(value):null;
  const host=document.createElement('div');host.id='customyt-shorts-host';
  host.style.cssText='position:fixed;inset:0;z-index:2021;pointer-events:none';
  const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML=`<style>
    *{box-sizing:border-box}button{font:12px system-ui;color:white;border:0;border-radius:4px;background:#285b9f;pointer-events:auto;touch-action:none}
    .outline{position:fixed;border:2px solid #8ab4ff;border-radius:8px;pointer-events:none}
    .handle{position:absolute;left:3px;top:3px;cursor:grab;padding:4px 8px}
    .corner{position:absolute;right:-4px;bottom:-4px;width:17px;height:17px;cursor:nwse-resize}
    .shield{position:fixed;inset:0;pointer-events:auto;touch-action:none;cursor:grabbing}
    .guide{position:fixed;background:#63e6be;pointer-events:none}[hidden]{display:none!important}
  </style><div class="shield" hidden></div><div class="panels"></div><div class="guides"></div>`;
  document.body.append(host);
  const $=s=>shadow.querySelector(s);
  const top=()=>Math.max(56,document.querySelector('ytd-masthead')?.getBoundingClientRect().bottom||56)+8;
  const visible=e=>!!e && e.isConnected && !e.closest('[hidden]') && e.getBoundingClientRect().width>0 && getComputedStyle(e).visibility!=='hidden';
  const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
  function status(message){if(ui)ui.querySelector('.shorts-status').textContent=message;}
  function sync(){if(slot)variants[slot]=copy(layout);}
  function split(value){
    if(value && Object.hasOwn(value,'closed') && Object.hasOwn(value,'open'))return {closed:L.validRects(value.closed)?copy(value.closed):null,open:L.validRects(value.open)?copy(value.open):null};
    const result={closed:null,open:null};
    if(L.validRects(value))result[value.panels.comments?'open':'closed']=copy(value);
    return result;
  }
  function persist(){sync();const value={version:3,variants:copy(variants),presets:copy(presets)};queue=queue.then(()=>chrome.storage.local.set({[KEY]:value})).catch(()=>status('저장하지 못했습니다. 유튜브 탭을 새로고침해 주세요.'));}
  function release(notify=true){
    root?.classList.remove('cys-video-active');
    for(const key of ['x','y','w','h'])root?.style.removeProperty('--cys-player-'+key);
    const wasApplied=Object.values(nodes).some(node=>node.classList.contains('cys-panel'));
    for(const node of Object.values(nodes)) {
      node.classList.remove('cys-panel');node.removeAttribute('data-cys-panel');
      for(const key of ['x','y','w','h'])node.style.removeProperty('--cys-'+key);
    }
    for(const p of paths)p.classList.remove('cys-path','cys-comments-shell','cys-video-shell');paths.clear();
    if(notify && wasApplied && !resizeFrame)resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;window.dispatchEvent(new Event('resize'));});
  }
  function defaults(){
    return L.capture(Object.fromEntries(Object.entries(nodes).map(([id,node])=>[id,rect(node)])),innerWidth,top());
  }
  function discover(){
    // Previous/next reels can have non-zero dimensions outside the viewport.
    // Select the visible media, not the first player container in DOM order.
    const candidates=[...root.querySelectorAll('#shorts-player')].filter(visible).map(player=>{
      const media=player.querySelector('video');
      // YouTube temporarily offsets the video outside its player while loading.
      // The player box remains the stable geometry during comment transitions.
      const r=media?player.getBoundingClientRect():null;
      const area=r?Math.max(0,Math.min(r.right,innerWidth)-Math.max(r.left,0))*Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,top())):0;
      const link=player.querySelector('.ytp-title-link')?.getAttribute('href');
      const current=link?new URL(link,location.href).pathname===location.pathname:false;
      return {player,area,current};
    }).filter(candidate=>candidate.area>0).sort((a,b)=>Number(b.current)-Number(a.current)||b.area-a.area);
    const player=candidates[0]?.player;
    const reel=player?.closest('ytd-reel-video-renderer');
    const next={};
    if(player)next.video=player;
    // Extracted overlays can live outside the active reel, so visibility matters.
    const find=s=>[...root.querySelectorAll(s)].filter(visible).find(node=>{
      const owner=node.closest('ytd-reel-video-renderer');
      if(owner && owner!==reel)return false;
      const r=node.getBoundingClientRect();return r.bottom>top() && r.top<innerHeight && r.right>0 && r.left<innerWidth;
    });
    next.info=find('yt-reel-metapanel-view-model');
    next.related=find('reel-action-bar-view-model');
    // Opening comments starts outside the viewport during YouTube's slide-in.
    // The expanded state, not the animated position, identifies this panel.
    next.comments=[...root.querySelectorAll('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]')].find(node=>node.isConnected && !node.closest('[hidden]'));
    for(const id of Object.keys(next))if(!next[id])delete next[id];
    if(reel && reel.closest('[hidden]'))delete next.video;
    if(layout && !next.video)return;
    const nextPaths=new Set();
    for(const node of Object.values(next))for(let p=node.parentElement;p && p!==root.parentElement;p=p.parentElement)nextPaths.add(p);
    if(Object.keys(next).length!==Object.keys(nodes).length || Object.entries(next).some(([id,node])=>nodes[id]!==node) || nextPaths.size!==paths.size || [...nextPaths].some(p=>!paths.has(p))) {
      release(false);nodes=next;
    }
  }
  function apply(){
    if(!layout || !nodes.video)return;
    const geometry=L.arrangeRects(layout,innerWidth,top(),new Set(Object.keys(nodes)));
    if(!geometry.fits){release();status('창을 넓히면 저장한 Shorts 배치가 돌아옵니다.');return;}
    for(const [key,value] of Object.entries(geometry.panels.video))root.style.setProperty('--cys-player-'+key,value+'px');
    root.classList.add('cys-video-active');
    for(const [id,node] of Object.entries(nodes)) {
      const r=geometry.panels[id];if(!r)continue;
      node.classList.add('cys-panel');node.dataset.cysPanel=id;
      for(const [key,value] of Object.entries(r))node.style.setProperty('--cys-'+key,value+'px');
      // Keep scroll-snap slots intact; only remove containing-block effects.
      for(let p=node.parentElement;p && p!==root.parentElement;p=p.parentElement){
        p.classList.add('cys-path');paths.add(p);
        if(p!==root && id==='comments')p.classList.add('cys-comments-shell');
        if(id==='video' && p!==root && p!==node.closest('ytd-reel-video-renderer') && p.contains(node) && !p.querySelector('reel-action-bar-view-model,yt-reel-metapanel-view-model'))p.classList.add('cys-video-shell');
      }
    }
  }
  function draw(){
    apply();
    const container=$('.panels');
    if(!editing){container.replaceChildren();return;}
    const present=new Set(Object.keys(nodes));
    for(const el of [...container.children])if(!present.has(el.dataset.id))el.remove();
    for(const [id,node] of Object.entries(nodes)) {
      let box=container.querySelector(`[data-id="${id}"]`);
      if(!box){
        box=document.createElement('div');box.className='outline';box.dataset.id=id;
        for(const resize of [false,true]) {
          const button=document.createElement('button');button.className=resize?'corner':'handle';
          button.textContent=resize?'◢':labels[id];button.setAttribute('aria-label',labels[id]+(resize?' 크기 조절':' 이동'));
          button.onpointerdown=event=>start(event,id,resize);
          button.onkeydown=event=>keyMove(event,id,resize);
          box.append(button);
        }
        container.append(box);
      }
      const r=rect(node);Object.assign(box.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});
    }
  }
  function remember(){undo.push(copy(layout));if(undo.length>25)undo.shift();}
  function start(event,id,resize){
    if(event.button!==0)return;
    event.preventDefault();event.stopPropagation();
    gesture={id,resize,x:event.clientX,y:event.clientY,before:copy(layout),base:copy(layout)||defaults()};
    host.setPointerCapture(event.pointerId);$('.shield').hidden=false;
  }
  function finish(cancel=false){
    if(!gesture)return;
    if(cancel)layout=gesture.before;
    else if(JSON.stringify(layout)!==JSON.stringify(gesture.before)){undo.push(gesture.before);persist();}
    gesture=null;$('.shield').hidden=true;$('.guides').replaceChildren();if(!layout)release();draw();update();
  }
  function keyMove(event,id,resize){
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();remember();
    if(!layout)layout=defaults();
    const dx=(event.key==='ArrowLeft'?-16:event.key==='ArrowRight'?16:0)*layout.width/innerWidth;
    const dy=event.key==='ArrowUp'?-16:event.key==='ArrowDown'?16:0;
    layout=resize?L.resizePushing(layout,id,dx,dy):L.movePushing(layout,id,dx,dy);
    persist();draw();update();
  }
  window.addEventListener('pointermove',event=>{
    if(!gesture)return;
    const scale=innerWidth/gesture.base.width;
    const result=L.snapPanels(gesture.base,gesture.id,(event.clientX-gesture.x)/scale,event.clientY-gesture.y,gesture.resize,
      {disabled:event.altKey,thresholdX:10/scale,bottom:innerHeight-top()});
    layout=result.layout;draw();$('.guides').replaceChildren();
    for(const g of result.guides){const line=document.createElement('div');line.className='guide';line.style.cssText=g.axis==='x'?`left:${g.value*scale}px;top:${top()}px;width:1px;height:100vh`:`left:0;top:${g.value+top()}px;width:100vw;height:1px`;$('.guides').append(line);}
  },true);
  window.addEventListener('pointerup',()=>finish(),true);
  window.addEventListener('pointercancel',()=>finish(true),true);
  window.addEventListener('blur',()=>finish(true));
  window.addEventListener('wheel',event=>{if(gesture){event.preventDefault();event.stopImmediatePropagation();}},{capture:true,passive:false});
  window.addEventListener('keydown',event=>{
    if(!editing || event.key!=='Escape')return;
    if(gesture)finish(true);else{layout=copy(editStart);editing=false;persist();release();draw();update();}
    event.preventDefault();
  });
  function options(selected=''){
    const select=ui.querySelector('.shorts-list');select.replaceChildren(new Option('Shorts 프리셋 선택',''));
    for(const p of presets)select.add(new Option(p.name,p.id));select.value=selected;
  }
  function mount(){
    const controls=document.querySelector('#customyt-toolbar')?.shadowRoot;
    if(!controls || ui===controls)return;
    ui=controls;
    const button=document.createElement('button');button.className='shorts-edit';button.textContent='Shorts 편집';
    const undoButton=document.createElement('button');undoButton.className='shorts-undo';undoButton.textContent='되돌리기';undoButton.title='마지막 배치 변경 되돌리기';undoButton.hidden=true;
    ui.querySelector('.buttons').prepend(button,undoButton);
    ui.querySelector('#page-shorts').innerHTML=`<strong>Shorts 화면 배치</strong><p>영상·기본정보·액션 버튼·열린 댓글을 편집합니다. 다음 영상에도 배치가 유지됩니다.</p>
      <button class="shorts-start">Shorts 화면 편집</button><button class="shorts-reset">Shorts 원래 배치로 복원</button>
      <div class="presets"><strong>Shorts 전용 프리셋 (댓글 있음·없음 함께 저장)</strong><p class="shorts-variant"></p><input class="shorts-name" aria-label="Shorts 프리셋 이름" maxlength="40" placeholder="프리셋 이름"><button class="shorts-save">Shorts 프리셋 저장</button><select class="shorts-list" aria-label="Shorts 프리셋 선택"></select><button class="shorts-load">Shorts 프리셋 불러오기</button><button class="shorts-overwrite">Shorts 프리셋 덮어쓰기</button><button class="shorts-delete">Shorts 프리셋 삭제</button></div>
      <p>제목 손잡이로 이동하고 우하단으로 크기를 조절하세요. 10px 스냅·8px 간격을 적용합니다. Alt는 자유 조절, Esc는 취소입니다. 댓글은 유튜브 댓글 버튼으로 열어주세요.</p><p class="shorts-status" role="status"></p>`;
    const startEdit=()=>{
      if(!root || !nodes.video)return;
      if(editing){editing=false;persist();}else{editStart=copy(layout);editing=true;undo=[];}
      draw();update();ui.querySelector('.menu').hidden=true;ui.querySelector('.more').setAttribute('aria-expanded','false');
    };
    button.onclick=startEdit;ui.querySelector('.shorts-start').onclick=startEdit;
    ui.querySelector('.shorts-undo').onclick=()=>{finish(true);if(undo.length){layout=undo.pop();persist();release();draw();update();}};
    ui.querySelector('.shorts-reset').onclick=()=>{finish(true);remember();layout=null;editing=false;release();persist();draw();update();};
    ui.querySelector('.shorts-save').onclick=()=>{
      const name=ui.querySelector('.shorts-name').value.trim();
      if(!name || presets.some(p=>p.name===name) || presets.length>=30){status('중복되지 않는 이름을 입력하세요. 프리셋은 최대 30개입니다.');return;}
      sync();const preset={id:crypto.randomUUID(),name,variants:copy(variants)};presets.push(preset);options(preset.id);persist();update();status('Shorts 프리셋을 저장했습니다.');
    };
    ui.querySelector('.shorts-load').onclick=()=>{const p=presets.find(p=>p.id===ui.querySelector('.shorts-list').value);if(p){finish(true);remember();sync();variants=copy(p.variants);layout=copy(variants[slot]);editing=false;release();persist();draw();update();}};
    ui.querySelector('.shorts-overwrite').onclick=()=>{const p=presets.find(p=>p.id===ui.querySelector('.shorts-list').value);if(p){sync();p.variants=copy(variants);persist();status('선택한 Shorts 프리셋을 덮어썼습니다.');}};
    ui.querySelector('.shorts-delete').onclick=()=>{presets=presets.filter(p=>p.id!==ui.querySelector('.shorts-list').value);options();persist();update();};
    ui.querySelector('.shorts-list').onchange=update;options();
  }
  function update(){
    if(!ui)return;
    const active=!!root && !document.fullscreenElement,ready=active && !!nodes.video && innerWidth>=760;
    ui.querySelector('.shorts-edit').hidden=!active;ui.querySelector('.shorts-edit').disabled=!ready;
    ui.querySelector('.shorts-edit').textContent=editing?'Shorts 편집 완료':'Shorts 편집';
    ui.querySelector('.shorts-start').textContent=editing?'Shorts 편집 완료':'Shorts 화면 편집';
    for(const name of ['start','save','reset'])ui.querySelector('.shorts-'+name).disabled=!ready;
    ui.querySelector('.shorts-undo').disabled=!ready || !undo.length;
    ui.querySelector('.shorts-undo').hidden=!active || !editing;
    ui.querySelector('.shorts-variant').textContent=slot==='open'?'현재 배치: 댓글 있음':'현재 배치: 댓글 없음';
    const selected=presets.some(p=>p.id===ui.querySelector('.shorts-list').value);
    for(const name of ['load','overwrite','delete'])ui.querySelector('.shorts-'+name).disabled=!ready || !selected;
    if(!active)status('Shorts 재생 화면에서 설정할 수 있습니다.');
    else if(innerWidth<760)status('편집하려면 창 너비를 760px 이상으로 넓혀주세요.');
    else if(!nodes.video)status('현재 Shorts 플레이어를 찾는 중입니다.');
  }
  function refresh(){
    timer=0;if(!loaded)return;mount();
    const next=location.pathname.startsWith('/shorts/')?document.querySelector('ytd-shorts:not([hidden])'):null;
    if(next!==root || location.pathname!==lastUrl){
      finish(true);
      if(next!==root){release();nodes={};}
      root=next;lastUrl=location.pathname;editing=false;undo=[];
    }
    if(!root || document.fullscreenElement || innerWidth<760){release();$('.panels').replaceChildren();update();return;}
    if(gesture)return;
    let nextSlot=root.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]')?'open':'closed';
    if(nextSlot==='closed' && slot==='open' && Date.now()>closeRequestedUntil){
      if(!closedSince)closedSince=Date.now();
      if(Date.now()-closedSince<800){
        nextSlot='open';
        if(!closeTimer)closeTimer=setTimeout(()=>{closeTimer=0;schedule();},800);
      }
    }else{closedSince=0;if(closeTimer){clearTimeout(closeTimer);closeTimer=0;}}
    if(slot!==nextSlot){
      if(nextSlot==='open')closeRequestedUntil=0;
      sync();release(!variants[nextSlot]);slot=nextSlot;layout=copy(variants[slot]);undo=[];editStart=copy(layout);
    }
    discover();draw();update();
  }
  // Mutation callbacks run before paint, including player replacement during a
  // YouTube animation frame. Deferring another frame exposes native coordinates.
  function schedule(){if(!timer){timer=1;queueMicrotask(refresh);}}
  new MutationObserver(records=>{
    if(records.some(r=>r.target!==host && !host.contains(r.target)))schedule();
  }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','visibility','is-active','video-id']});
  for(const event of ['yt-navigate-finish','yt-page-data-updated','fullscreenchange'])document.addEventListener(event,schedule);
  document.addEventListener('yt-navigate-start',()=>{finish(true);editing=false;$('.panels').replaceChildren();schedule();});
  window.addEventListener('resize',()=>{finish(true);schedule();});
  document.addEventListener('scroll',schedule,true);window.addEventListener('popstate',schedule);
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('button');
    if(button?.closest('[target-id="engagement-panel-comments-section"]') && /닫기|close/i.test(button.getAttribute('aria-label')||button.title||''))closeRequestedUntil=Date.now()+1500;
  },true);
  chrome.storage.local.get(KEY).then(result=>{
    const saved=result[KEY];if(![1,2,3].includes(saved?.version))return;
    variants=saved.version===3?split(saved.variants):saved.version===2?split(saved.layout):{closed:null,open:null};
    if(Array.isArray(saved.presets))presets=saved.presets.filter(p=>p && typeof p.id==='string' && typeof p.name==='string' && p.name.length<=40).slice(0,30).map(p=>({id:p.id,name:p.name,variants:split(p.variants||p.layout)}));
    if(saved.version===1 && L.validRects(saved.layout))presets.push({id:crypto.randomUUID(),name:'이전 Shorts 배치 (업데이트 백업)',variants:split(saved.layout)});
    if(saved.version!==3)persist();
  }).catch(()=>{}).finally(()=>{loaded=true;refresh();});
})();
