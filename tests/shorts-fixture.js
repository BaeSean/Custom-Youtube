window.chrome={storage:{local:{get:async key=>({[key]:JSON.parse(localStorage.getItem(key)||'null')}),set:async value=>{for(const [key,data] of Object.entries(value))localStorage.setItem(key,JSON.stringify(data));}}}};
if(new URLSearchParams(location.search).has('legacy')) {
  localStorage.setItem('customyt.shorts.v1',JSON.stringify({version:1,layout:{type:'rects',width:1280,panels:{video:{x:16,y:0,w:320,h:600},related:{x:344,y:0,w:72,h:600},info:{x:424,y:0,w:800,h:130}}},presets:[]}));
  const stale=document.createElement('ytd-reel-video-renderer');
  stale.style.cssText='position:fixed;top:-2000px;width:320px;height:570px';
  stale.innerHTML='<div id="shorts-player"><video style="width:320px;height:570px"></video></div>';
  document.querySelector('ytd-shorts').prepend(stale);
}
const canvas=document.createElement('canvas');canvas.width=360;canvas.height=640;const ctx=canvas.getContext('2d');
let frames=0,index=1;
const draw=()=>{ctx.fillStyle='#14394d';ctx.fillRect(0,0,360,640);ctx.fillStyle='#f5b95d';ctx.fillRect(40,80+(frames%180),280,150);ctx.fillStyle='white';ctx.font='24px sans-serif';ctx.fillText(`Shorts ${index} / ${++frames}`,25,500);};draw();
const video=document.querySelector('#player-container video');video.srcObject=canvas.captureStream(12);video.play().catch(()=>{});const interval=setInterval(draw,100);
const transitionRegression=new URLSearchParams(location.search).has('transition');
if(transitionRegression){
  video.style.cssText='position:absolute;top:-624px';
  const cinematic=document.createElement('div');cinematic.id='shorts-cinematic-container';cinematic.textContent='Native cinematic layer';
  document.querySelector('ytd-shorts').append(cinematic);
}
window.addEventListener('pagehide',()=>{clearInterval(interval);video.srcObject.getTracks().forEach(t=>t.stop());});
const panel=document.querySelector('ytd-engagement-panel-section-list-renderer');
document.querySelector('#content').innerHTML=Array.from({length:30},(_,i)=>`<p>댓글 ${i+1} · 다음 영상 전환과 분리된 스크롤</p>`).join('');
document.querySelector('#comments-open').onclick=()=>panel.setAttribute('visibility','ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
document.querySelector('#comments-close').onclick=()=>panel.setAttribute('visibility','ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
document.querySelector('#next-short').onclick=()=>{
  const appliedBefore=panel.classList.contains('cys-panel');
  document.dispatchEvent(new Event('yt-navigate-start'));
  document.querySelector('#test-tools').dataset.commentLayoutRetained=String(!appliedBefore || panel.classList.contains('cys-panel'));
  history.pushState({},'',`/shorts/fixture-${++index}`);
  const info=document.querySelector('yt-reel-metapanel-view-model');const replacement=info.cloneNode(true);replacement.querySelector('#title').textContent=`Shorts ${index}`;info.replaceWith(replacement);
  document.dispatchEvent(new Event('yt-navigate-finish'));
  if(transitionRegression)requestAnimationFrame(()=>{
    const oldPlayer=document.querySelector('#shorts-player');const replacement=document.createElement('div');replacement.id='shorts-player';
    oldPlayer.replaceWith(replacement);while(oldPlayer.firstChild)replacement.append(oldPlayer.firstChild);
    requestAnimationFrame(()=>{document.querySelector('#test-tools').dataset.playerAppliedBeforePaint=String(replacement.classList.contains('cys-panel'));});
  });
};
document.querySelector('#route-watch').onclick=()=>{document.dispatchEvent(new Event('yt-navigate-start'));history.pushState({},'','/watch?v=fixture');document.querySelector('ytd-shorts').hidden=true;document.dispatchEvent(new Event('yt-navigate-finish'));};
const feed=document.querySelector('#shorts-container');
feed.addEventListener('scroll',()=>{if(feed.scrollTop>feed.clientHeight*.75){document.querySelector('#next-short').click();feed.scrollTop=0;}});
