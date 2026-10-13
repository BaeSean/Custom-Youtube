// Local-only API stand-in. No dependency or remote media is required.
window.chrome = {storage:{local:{
  get:async key=>({[key]:JSON.parse(localStorage.getItem(key)||'null')}),
  set:async values=>{for(const [key,value] of Object.entries(values))localStorage.setItem(key,JSON.stringify(value));}
}}};
const watchFixture=document.querySelector('ytd-watch-flexy');
if(new URLSearchParams(location.search).get('legacy-video')==='1')document.documentElement.classList.add('fixture-zero-height');
if(new URLSearchParams(location.search).get('variant')==='right-comments'||new URLSearchParams(location.search).get('variant')==='regression')document.documentElement.classList.add('fixture-right-comments');
const originalPlayer=document.querySelector('#player'), originalParent=originalPlayer.parentElement;
const video=document.querySelector('video'), originalVideo=video;
const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
const ctx=canvas.getContext('2d');
let frames=0;
function drawFrame(){
  const gradient=ctx.createLinearGradient(0,0,960,540);gradient.addColorStop(0,'#17435b');gradient.addColorStop(1,'#74472d');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,960,540);
  ctx.fillStyle='#ffbf62';ctx.beginPath();ctx.arc(140+(frames%500),180,65,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='white';ctx.font='bold 44px sans-serif';ctx.fillText('Native video. Same page.',90,335);
  ctx.font='24px sans-serif';ctx.fillText(`LIVE TEST  /  FRAME ${++frames}`,90,385);
}
drawFrame();video.srcObject=canvas.captureStream(12);video.play().catch(()=>{});
const mediaTimer=setInterval(()=>{drawFrame();document.querySelector('#time').textContent=`${video.currentTime.toFixed(1)}s`;},100);
window.addEventListener('pagehide',()=>{clearInterval(mediaTimer);video.srcObject.getTracks().forEach(track=>track.stop());});
function sizeNativeVideo(){
  if(watchFixture.classList.contains('cyt-layout'))return;
  const r=originalPlayer.getBoundingClientRect();
  Object.assign(video.style,{width:`${r.width}px`,height:`${r.height}px`,top:'0px',left:'0px'});
}
sizeNativeVideo();window.addEventListener('resize',sizeNativeVideo);
document.querySelector('#play').onclick=()=>{if(video.paused){video.play();document.querySelector('#play').textContent='일시정지';}else{video.pause();document.querySelector('#play').textContent='재생';}};
document.querySelector('#fullscreen').onclick=()=>document.fullscreenElement?document.exitFullscreen():originalPlayer.requestFullscreen();
const commentMarkup=Array.from({length:24},(_,i)=>`<ytd-comment-thread-renderer class="row"><strong>@viewer_${i+1}</strong><p>댓글 ${i+1} · 영상은 계속 재생하고 댓글은 따로 스크롤합니다.</p><button>답글</button></ytd-comment-thread-renderer>`).join('');
document.querySelector('#comments').innerHTML=commentMarkup;
document.querySelector('#recommendations').innerHTML=Array.from({length:3},(_,i)=>`<div class="row"><div class="thumb"></div><strong>추천 영상 ${i+1}</strong><p>채널 · 조회수 1.2만회</p></div>`).join('');
const shortMarkup=Array.from({length:4},(_,i)=>`<div class="row short"><div class="thumb"></div><strong>추천 Shorts ${i+1}</strong></div>`).join('');
document.querySelector('ytd-reel-shelf-renderer').innerHTML=shortMarkup;
if(new URLSearchParams(location.search).get('duplicate-shorts')==='1') {
  const current=document.querySelector('ytd-reel-shelf-renderer');current.dataset.fixtureShelf='current';
  const stale=document.createElement('ytd-reel-shelf-renderer');
  stale.hidden=true;stale.dataset.fixtureShelf='stale';
  stale.innerHTML='<ytm-shorts-lockup-view-model-v2>이전 Shorts</ytm-shorts-lockup-view-model-v2>';
  current.before(stale);
}
if(new URLSearchParams(location.search).get('variant')==='refresh'){
  document.querySelector('#description').hidden=true;document.querySelector('#comments').hidden=true;
  watchFixture.setAttribute('fixed-default-panels','');
}
for(const [label,id] of [['설명','engagement-panel-structured-description'],['댓글','engagement-panel-comments-section']]){
  document.querySelector(`#fixed-side-menu button[aria-label="${label}"]`).onclick=()=>{
    const panel=document.querySelector(`[target-id="${id}"]`);
    if(new URLSearchParams(location.search).get('exclusive-panels')==='1') {
      for(const other of watchFixture.querySelectorAll('ytd-engagement-panel-section-list-renderer'))other.setAttribute('visibility','ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
    }
    panel.setAttribute('visibility','ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
    if(label==='댓글')setTimeout(()=>{panel.querySelector('ytd-comments').innerHTML=commentMarkup;},150);
  };
}
if(new URLSearchParams(location.search).get('exclusive-panels')==='1') {
  for(const label of ['설명','댓글']) {
    const button=document.createElement('button');button.textContent=`네이티브 ${label} 전환`;
    button.onclick=()=>document.querySelector(`#fixed-side-menu button[aria-label="${label}"]`).click();
    document.querySelector('#test-tools').append(button);
  }
}
const modernMode=new URLSearchParams(location.search).get('modern-mode')==='1';
function setFixtureMode(wide) {
  if(new URLSearchParams(location.search).get('hidden-shorts')==='1' && document.querySelector('.ytp-size-button').hasAttribute('aria-label')) {
    document.querySelector('ytd-reel-shelf-renderer')?.style.setProperty('display','none');
  }
  const button=document.querySelector('.ytp-size-button');
  const stale=new URLSearchParams(location.search).get('stale-label')==='1';
  if(stale)button.innerHTML=`<svg width="24" height="24"><path d="${wide?'M16.87 6.72H16.86L16.79 6.79L13.58 10':'M7.87 6.72L7.79 6.79L4.58 10'}"/></svg>`;
  if(!stale || !button.hasAttribute('aria-label'))button.setAttribute('aria-label',wide?'기본보기':'영화관 모드(t)');
  if(modernMode){
    watchFixture.dataset.view=wide?'theater':'normal';
  } else watchFixture.toggleAttribute('theater',wide);
  sizeNativeVideo();
}
setFixtureMode(false);
if(new URLSearchParams(location.search).get('close-description-theater')==='1') {
  const button=document.createElement('button');button.textContent='설명 닫기 및 영화관 자동 전환';
  document.querySelector('#test-tools').append(button);
  button.onclick=()=>{
    document.querySelector('[target-id="engagement-panel-structured-description"]').setAttribute('visibility','ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
    setFixtureMode(true);
  };
  const close=document.createElement('button');close.textContent='닫기';
  close.setAttribute('aria-label','닫기');
  close.onclick=()=>{document.body.dataset.nativeDescriptionClose='ran';button.click();};
  document.querySelector('[target-id="engagement-panel-structured-description"]').prepend(close);
}
let modeClickCount=0;
document.querySelector('.ytp-size-button').onclick=()=>{
  modeClickCount++;watchFixture.dataset.modeClicks=String(modeClickCount);
  if(new URLSearchParams(location.search).get('ignore-first-mode-click')==='1' && modeClickCount===1)return;
  setTimeout(()=>{setFixtureMode(modernMode?watchFixture.dataset.view!=='theater':!watchFixture.hasAttribute('theater'));},new URLSearchParams(location.search).get('slow-mode')==='1'?1800:350);
};
document.querySelector('#theater').onclick=()=>document.querySelector('.ytp-size-button').click();
if(new URLSearchParams(location.search).get('variant')==='regression') {
  document.documentElement.classList.add('fixture-regression');
  document.querySelector('#comments').hidden=true;
  const panel=document.querySelector('[target-id="engagement-panel-comments-section"]');
  panel.insertAdjacentHTML('afterbegin','<header>댓글 24 <button class="close-comments">닫기</button></header>');
  panel.insertAdjacentHTML('beforeend','<footer><input aria-label="댓글 추가" placeholder="댓글 추가"></footer>');
  panel.querySelector('ytd-comments').innerHTML=commentMarkup;
  panel.setAttribute('visibility','ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  panel.querySelector('.close-comments').onclick=()=>panel.setAttribute('visibility','ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  document.querySelector('#recommendations').innerHTML='<ytd-item-section-renderer><div id="contents">'+Array.from({length:3},(_,i)=>`<yt-lockup-view-model><div class="thumb"></div><strong>추천 영상 ${i+1}</strong></yt-lockup-view-model>`).join('')+'</div></ytd-item-section-renderer>';
  document.querySelector('#recommendations #contents').append(document.querySelector('ytd-reel-shelf-renderer'));
  new MutationObserver(()=>{
    document.querySelector('#recommendations ytd-item-section-renderer').setAttribute('secondary-grid-columns',watchFixture.classList.contains('cyt-layout')?'1':'3');
  }).observe(watchFixture,{attributes:true,attributeFilter:['class']});
}
// Reproduce native inner-player caps and a horizontally scrolling Shorts track.
if(new URLSearchParams(location.search).get('size-caps')==='1') {
  document.querySelector('#player-container-inner').style.maxWidth='480px';
  document.querySelector('#movie_player').style.maxHeight='270px';
  const shelf=document.querySelector('ytd-reel-shelf-renderer');
  shelf.innerHTML='<button id="short-next">다음 Shorts</button><div id="scroll-container" style="display:flex;overflow:auto;width:100%">'+Array.from({length:4},(_,i)=>`<div style="flex:0 0 200px" class="row short"><div class="thumb"></div>Shorts ${i+1}</div>`).join('')+'</div>';
  shelf.querySelector('button').onclick=()=>shelf.querySelector('#scroll-container').scrollBy({left:200});
}
document.querySelector('#route').onclick=event=>{
  document.dispatchEvent(new Event('yt-navigate-start'));
  const home=location.pathname==='/watch';history.pushState({},'',home?'/':'/watch');watchFixture.hidden=home;
  event.target.textContent=home?'영상으로 이동':'홈으로 이동';document.dispatchEvent(new Event('yt-navigate-finish'));
};
let fixtureIndex=1;
document.querySelector('#next').onclick=()=>{
  document.dispatchEvent(new Event('yt-navigate-start'));watchFixture.setAttribute('video-id',`fixture-${++fixtureIndex}`);
  document.querySelector('h1').textContent=`다음 영상 ${fixtureIndex}`;
  const old=document.querySelector('ytd-watch-metadata');old.replaceWith(old.cloneNode(true));
  document.dispatchEvent(new Event('yt-navigate-finish'));
  if(modernMode)setTimeout(()=>setFixtureMode(new URLSearchParams(location.search).get('late-theater')==='1'),800);
};
document.querySelector('#optional').onclick=()=>{
  const shelf=document.querySelector('ytd-reel-shelf-renderer');
  if(shelf)shelf.remove();else{const next=document.createElement('ytd-reel-shelf-renderer');next.innerHTML=shortMarkup;(new URLSearchParams(location.search).get('late-shorts')==='1'?document.querySelector('#native-extra'):document.querySelector('ytd-watch-next-secondary-results-renderer')).append(next);}
};
if(new URLSearchParams(location.search).get('reparent-shorts')==='1') {
  const button=document.createElement('button');button.textContent='Shorts 부모 교체';
  document.querySelector('#test-tools').append(button);
  button.onclick=()=>{
    const shelf=document.querySelector('ytd-reel-shelf-renderer');
    if(!shelf)return;
    const wrapper=document.createElement('div');wrapper.hidden=true;
    wrapper.style.visibility='hidden';
    document.querySelector('#native-extra').append(wrapper);
    wrapper.append(shelf);
  };
}
document.querySelector('#verify').onclick=()=>{
  const results=Array.from(document.querySelectorAll('[data-cyt-panel]')).map(panel=>{
    const r=panel.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    const onscreen=x>=0&&x<innerWidth&&y>56&&y<innerHeight;
    const top=onscreen?document.elementFromPoint(x,y):null;
    return {panel:panel.dataset.cytPanel,visible:onscreen?!!top&&panel.contains(top):null,onscreen};
  });
  const vr=video.getBoundingClientRect();
  const media={width:vr.width,height:vr.height,currentTime:video.currentTime,readyState:video.readyState,videoWidth:video.videoWidth,preserved:document.querySelector('video')===originalVideo&&originalPlayer.parentElement===originalParent};
  const pass=results.filter(result=>result.onscreen).every(result=>result.visible)&&media.width>100&&media.height>100&&media.readyState>=2&&media.videoWidth===960&&media.preserved;
  document.body.dataset.renderingCheck=JSON.stringify({pass,results,media});
  document.querySelector('#fixture-status').textContent=pass?'로컬 검증 · 실제 영상 크기·프레임·패널 검사 통과':'로컬 검증 실패';
};
