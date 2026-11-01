// Drape cutout: removes the background from a clothing photo right in the browser, no server.
// Main way: MediaPipe Magic Touch finds the item under a point (the photo centre, or where the person taps).
// Fallback without internet: the colour of the photo edges is taken as "background"; everything connected to the
// edges and close to those colours goes away. A brush fixes spots either way.
//
//   DrapeCutout.edit(blob) -> Promise<{blob, cut}>   cut=true: transparent PNG of the item; cut=false: original kept
(function(){
var WORK=512; // the mask is worked out at this size, then scaled up smoothly

function loadImg(blob){return new Promise(function(res,rej){var u=URL.createObjectURL(blob),im=new Image();
im.onload=function(){res({im:im,url:u})};im.onerror=function(){URL.revokeObjectURL(u);rej(new Error('Could not open that photo.'))};im.src=u})}

// sRGB -> CIE Lab (enough precision for comparing colours)
function lab(r,g,b){r/=255;g/=255;b/=255;
r=r>.04045?Math.pow((r+.055)/1.055,2.4):r/12.92;g=g>.04045?Math.pow((g+.055)/1.055,2.4):g/12.92;b=b>.04045?Math.pow((b+.055)/1.055,2.4):b/12.92;
var x=(r*.4124+g*.3576+b*.1805)/.95047,y=r*.2126+g*.7152+b*.0722,z=(r*.0193+g*.1192+b*.9505)/1.08883;
var f=function(t){return t>.008856?Math.cbrt(t):7.787*t+16/116};x=f(x);y=f(y);z=f(z);
return[116*y-16,500*(x-y),200*(y-z)]}

// how far every pixel is from the background colours (a few clusters taken from the photo edges)
function distances(data,w,h){
var n=w*h,L=new Float32Array(n),A=new Float32Array(n),B=new Float32Array(n),i;
for(i=0;i<n;i++){var c=lab(data[i*4],data[i*4+1],data[i*4+2]);L[i]=c[0];A[i]=c[1];B[i]=c[2]}
var band=Math.max(3,Math.round(Math.min(w,h)*.03)),edge=[];
for(var y=0;y<h;y++)for(var x=0;x<w;x++)if(x<band||y<band||x>=w-band||y>=h-band)edge.push(y*w+x);
var step=Math.max(1,Math.floor(edge.length/3000)),s=[];for(i=0;i<edge.length;i+=step)s.push(edge[i]);
// k-means, 4 background colours (floor + shadow + light falloff)
var K=4,cen=[];for(i=0;i<K;i++){var p=s[Math.floor((i+.5)*s.length/K)];cen.push([L[p],A[p],B[p]])}
for(var it=0;it<8;it++){var sum=cen.map(function(){return[0,0,0,0]});
s.forEach(function(p){var bi=0,bd=1e9;for(var k=0;k<K;k++){var d=sq(p,cen[k]);if(d<bd){bd=d;bi=k}}var m=sum[bi];m[0]+=L[p];m[1]+=A[p];m[2]+=B[p];m[3]++});
sum.forEach(function(m,k){if(m[3])cen[k]=[m[0]/m[3],m[1]/m[3],m[2]/m[3]]})}
function sq(p,c){var dl=(L[p]-c[0])*.8,da=A[p]-c[1],db=B[p]-c[2];return dl*dl+da*da+db*db} // lightness counts less: soft shadows stay background
var D=new Float32Array(n);for(i=0;i<n;i++){var bd2=1e9;for(var k2=0;k2<K;k2++){var d2=sq(i,cen[k2]);if(d2<bd2)bd2=d2}D[i]=Math.sqrt(bd2)}
var ed=edge.map(function(p){return D[p]}).sort(function(a,b){return a-b});
return{D:D,edgeQ:ed[Math.floor(ed.length*.9)]||0}}

// background = close to the edge colours AND connected to the photo edge; the item is what is left
function makeMask(D,w,h,edgeQ,strength){
var t=edgeQ*1.1+1.5+strength*.14,n=w*h,bg=new Uint8Array(n),q=new Int32Array(n),qh=0,qt=0,i;
var seed=function(p){if(!bg[p]&&D[p]<t){bg[p]=1;q[qt++]=p}};
for(var x=0;x<w;x++){seed(x);seed((h-1)*w+x)}for(var y=0;y<h;y++){seed(y*w);seed(y*w+w-1)}
while(qh<qt){var p=q[qh++],px=p%w;if(px>0)seed(p-1);if(px<w-1)seed(p+1);if(p>=w)seed(p-w);if(p<n-w)seed(p+w)}
var fg=new Uint8Array(n);for(i=0;i<n;i++)fg[i]=bg[i]?0:1;
fg=open(fg,w,h);
// keep the big pieces only (crumbs of the floor texture go)
var lab2=new Int32Array(n),sizes=[0];
for(i=0;i<n;i++)if(fg[i]&&!lab2[i]){var id=sizes.length,sz=0;qh=qt=0;q[qt++]=i;lab2[i]=id;
while(qh<qt){var r=q[qh++],rx=r%w;sz++;[rx>0?r-1:-1,rx<w-1?r+1:-1,r-w,r+w].forEach(function(o){if(o>=0&&o<n&&fg[o]&&!lab2[o]){lab2[o]=id;q[qt++]=o}})}sizes.push(sz)}
var big=Math.max.apply(null,sizes);for(i=0;i<n;i++)fg[i]=lab2[i]&&sizes[lab2[i]]>=big*.08?1:0;
return fg}
function open(m,w,h){return grow(grow(m,w,h,0),w,h,1)}
function grow(m,w,h,v){var o=new Uint8Array(m);for(var y=1;y<h-1;y++)for(var x=1;x<w-1;x++){var p=y*w+x;if(m[p]!==v&&(m[p-1]===v||m[p+1]===v||m[p-w]===v||m[p+w]===v))o[p]=v}return o}


// ---------- the editor: full screen on phones, follows the light / dark theme ----------
var css=[
'.dcut{border:0;padding:0;margin:auto;width:min(980px,100vw);height:min(780px,100dvh);max-width:100vw;max-height:100dvh;background:#0d1012;color:#f1f3f4;font:inherit;overflow:hidden;--acc:#7ee2a8;--acc2:#8fc7ff}',
'.dcut[open]{display:flex;flex-direction:column}',
'.dcut::backdrop{background:rgb(0 0 0 / .6);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}',
'@media (min-width:701px){.dcut{border-radius:28px;box-shadow:0 40px 90px -30px rgb(0 0 0 / .6)}}',
/* top: Skip · title · Done */
'.dc-top{position:absolute;z-index:4;left:0;right:0;top:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:calc(12px + env(safe-area-inset-top)) 16px 26px;background:linear-gradient(rgb(13 16 18 / .85),rgb(13 16 18 / 0))}',
'.dc-top h3{margin:0;font:400 22px/1 var(--serif,serif);letter-spacing:-.01em}',
'.dc-top .skip{border:0;background:none;color:rgb(241 243 244 / .65);font:inherit;font-size:12px;letter-spacing:.14em;text-transform:uppercase;padding:8px 2px;cursor:pointer}',
'.dc-top .done{height:36px;padding:0 18px;border:0;border-radius:999px;background:#f1f3f4;color:#0d1012;font:inherit;font-size:12px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}',
/* the photo */
'.dc-stage{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none;overscroll-behavior:none;background:#0d1012;cursor:none}',
'.dc-zoom{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;background:repeating-conic-gradient(#1c2226 0 25%,#262d32 0 50%) 0 0/24px 24px}',
'.dc-zoom canvas{display:block;position:absolute;left:0;top:0}',
'.dc-zoom .ov{opacity:.55;mix-blend-mode:normal}',
'.dc-ring{position:absolute;z-index:3;pointer-events:none;border:1.5px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgb(0 0 0 / .4),inset 0 0 0 1px rgb(0 0 0 / .25);transform:translate(-50%,-50%);display:none}',
/* loupe: a small window that shows what is under the finger */
'.dc-loupe{position:absolute;z-index:3;top:calc(70px + env(safe-area-inset-top));left:14px;width:128px;height:128px;border-radius:50%;overflow:hidden;border:2px solid #f1f3f4;box-shadow:0 14px 34px -10px rgb(0 0 0 / .7);display:none;background:#1c2226;transition:left .2s,right .2s}',
'.dc-loupe.right{left:auto;right:14px}',
'.dc-loupe canvas{width:100%;height:100%;display:block}',
'.dc-busy{position:absolute;inset:0;z-index:5;display:grid;place-items:center;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:rgb(241 243 244 / .7);background:rgb(13 16 18 / .7)}',
'.dc-busy i{display:block;width:28px;height:28px;margin:0 auto 14px;border-radius:50%;border:2px solid rgb(241 243 244 / .25);border-top-color:#f1f3f4;animation:dcspin .9s linear infinite}',
'@keyframes dcspin{to{transform:rotate(1turn)}}',
'.dc-hint{position:absolute;z-index:3;left:50%;top:calc(66px + env(safe-area-inset-top));transform:translateX(-50%);max-width:calc(100% - 40px);padding:8px 14px;border-radius:999px;background:rgb(13 16 18 / .72);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);font-size:12px;color:#f1f3f4;text-align:center;pointer-events:none;transition:opacity .5s;white-space:nowrap}',
'.dc-hint.warn{color:#ffb4a8}.dc-hint.gone{opacity:0}',
/* bottom: floating glass dock */
'.dc-dock{position:absolute;z-index:4;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(440px,calc(100% - 24px));display:flex;flex-direction:column;gap:10px}',
'.dc-size{display:flex;align-items:center;gap:12px;padding:10px 16px;border-radius:18px;background:rgb(22 27 30 / .72);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1px solid rgb(255 255 255 / .08)}',
'.dc-size[hidden]{display:none}',
'.dc-size span{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgb(241 243 244 / .6)}',
'.dc-size input{flex:1;-webkit-appearance:none;appearance:none;height:2px;border-radius:2px;background:rgb(255 255 255 / .25);outline:none}',
'.dc-size input::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#f1f3f4;border:0;box-shadow:0 2px 8px rgb(0 0 0 / .5)}',
'.dc-size input::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#f1f3f4;border:0}',
'.dc-size b{flex:none;width:30px;height:30px;display:grid;place-items:center}.dc-size b i{display:block;border-radius:50%;border:1.5px solid #f1f3f4}',
'.dc-tools{display:flex;align-items:stretch;gap:2px;padding:6px;border-radius:24px;background:rgb(22 27 30 / .78);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1px solid rgb(255 255 255 / .08);box-shadow:0 20px 40px -18px rgb(0 0 0 / .7)}',
'.dc-tools button{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 0 7px;border:0;background:none;color:rgb(241 243 244 / .55);font:inherit;font-size:10px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border-radius:18px;transition:color .2s,background .2s}',
'.dc-tools svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}',
'.dc-tools button[aria-pressed=true]{color:#0d1012;background:#f1f3f4}',
'.dc-tools .undo{flex:.8}.dc-tools .undo:disabled{opacity:.3;cursor:default}',
'.dc-tools .sep{flex:none;width:1px;margin:8px 2px;background:rgb(255 255 255 / .1)}'
].join('');

var ICONS={keep:'<path d="M12 4v16M4 12h16"/><circle cx="12" cy="12" r="9"/>',remove:'<path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z"/><path d="M14 7l3 3M3 4l2 2M7 3v2M3 8h2"/>',
erase:'<path d="M15.5 4.5l4 4L10 18H6l-2-2 11.5-11.5z"/><path d="M13 7l4 4M14 20h6"/>',restore:'<path d="M5 19c2-6 4-9 7-11 2.4-1.6 4.6-1.6 6-1M14 4l4 4"/><path d="M4 20l2-5 3 3z"/>',
undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'};

// Google MediaPipe "Magic Touch" (Apache 2.0): finds the object under a point. Loaded only when the editor opens.
var MP='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14',segP=null;
function segmenter(){return segP||(segP=import(MP+'/vision_bundle.mjs').then(function(v){
return v.FilesetResolver.forVisionTasks(MP+'/wasm').then(function(fs){return v.InteractiveSegmenter.createFromOptions(fs,{
baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite'},
outputCategoryMask:false,outputConfidenceMasks:true})})}).catch(function(e){segP=null;throw e}))}
function segmentAt(seg,canvas,x,y){var out=null;
seg.segment(canvas,{keypoint:{x:x,y:y}},function(res){var m=res.confidenceMasks[res.confidenceMasks.length>1?1:0];out=new Float32Array(m.getAsFloat32Array())});
return out}

function edit(blob){return loadImg(blob).then(function(r){return new Promise(function(done){
if(!document.getElementById('dcut-css')){var st=document.createElement('style');st.id='dcut-css';st.textContent=css;document.head.appendChild(st)}
var im=r.im,W=im.naturalWidth,H=im.naturalHeight,k=Math.min(1,WORK/Math.max(W,H)),w=Math.max(8,Math.round(W*k)),h=Math.max(8,Math.round(H*k));
// inside Telegram: dragging a finger down must not close the app while the person edits
var tg=window.Telegram&&window.Telegram.WebApp,swipesOff=false;try{if(tg&&tg.isVersionAtLeast('7.7')&&tg.isVerticalSwipesEnabled){tg.disableVerticalSwipes();swipesOff=true}}catch(e){}
var oldOver=document.documentElement.style.overscrollBehavior;document.documentElement.style.overscrollBehavior='none';
var dlg=document.createElement('dialog');dlg.className='dcut';dlg.setAttribute('aria-label','Clean up the photo');
dlg.innerHTML='<div class="dc-top"><button type="button" class="skip">Skip</button><h3>Clean up</h3><button type="button" class="done">Done</button></div>'+
'<div class="dc-stage"><div class="dc-zoom"><canvas class="img"></canvas><canvas class="ov"></canvas></div><div class="dc-ring"></div><div class="dc-loupe"><canvas width="256" height="256"></canvas></div><div class="dc-hint"></div><div class="dc-busy"><div><i></i>Finding the item</div></div>'+
'<div class="dc-dock"><div class="dc-size" hidden><span>Size</span><input type="range" min="8" max="110" value="36" aria-label="Brush size"><b><i></i></b></div>'+
'<div class="dc-tools" role="toolbar" aria-label="Tools"><button type="button" class="undo" disabled aria-label="Undo"><svg viewBox="0 0 24 24">'+ICONS.undo+'</svg>Undo</button><span class="sep"></span>'+
[['keep','Keep'],['remove','Magic'],['erase','Erase'],['restore','Restore']].map(function(t){return'<button type="button" data-b="'+t[0]+'"><svg viewBox="0 0 24 24">'+ICONS[t[0]]+'</svg>'+t[1]+'</button>'}).join('')+
'</div><div class="dc-size dc-str" hidden><span>Strength</span><input type="range" min="0" max="100" value="45" aria-label="Background strength"></div></div></div>';
document.body.appendChild(dlg);dlg.showModal();
var $=function(q){return dlg.querySelector(q)},stage=$('.dc-stage'),zoom=$('.dc-zoom'),cv=$('canvas.img'),g=cv.getContext('2d'),ov=$('canvas.ov'),og=ov.getContext('2d'),ring=$('.dc-ring'),hint=$('.dc-hint'),loupe=$('.dc-loupe'),lc=loupe.querySelector('canvas').getContext('2d');
cv.width=ov.width=W;cv.height=ov.height=H;zoom.style.width=W+'px';zoom.style.height=H+'px';
var mask=document.createElement('canvas');mask.width=W;mask.height=H;var mg=mask.getContext('2d');
var small=document.createElement('canvas');small.width=w;small.height=h;var sg=small.getContext('2d');sg.drawImage(im,0,0,w,h);
var dist=null,seg=null,tool='keep';
var TIP={keep:'Tap the piece to keep it · pinch to zoom',remove:'Tap leftover background, it goes in one piece',erase:'Paint what should go, lift to erase',restore:'Paint what should come back'};
var ht;function say(t,warn,stay){hint.textContent=t;hint.classList.toggle('warn',!!warn);hint.classList.remove('gone');clearTimeout(ht);if(!stay)ht=setTimeout(function(){hint.classList.add('gone')},2600)}
function paint(){g.clearRect(0,0,W,H);g.drawImage(im,0,0);g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0);g.globalCompositeOperation='source-over'}
function apply(fg,mode){var id=sg.createImageData(w,h),on=0;
for(var i=0;i<fg.length;i++){var a=Math.max(0,Math.min(1,(fg[i]-.35)/.3));id.data[i*4+3]=a*255;if(a>.5)on++}
var m=document.createElement('canvas');m.width=w;m.height=h;m.getContext('2d').putImageData(id,0,0);
if(mode==='set')mg.clearRect(0,0,W,H);
mg.globalCompositeOperation=mode==='remove'?'destination-out':'source-over';mg.drawImage(m,0,0,W,H);mg.globalCompositeOperation='source-over';paint();return on/fg.length}
function colorAuto(){var share=apply(makeMask(dist.D,w,h,dist.edgeQ,+$('.dc-str input').value),'set');
say(share<.03||share>.96?'Could not find the piece clearly. Try a plain background or Skip.':'Background removed. Erase and Restore fix the details.',share<.03||share>.96)}
var undoStack=[];function snap(){try{undoStack.push(mg.getImageData(0,0,W,H));if(undoStack.length>6)undoStack.shift();$('.undo').disabled=false}catch(e){}}
$('.undo').onclick=function(){var d=undoStack.pop();if(d){mg.putImageData(d,0,0);paint()}$('.undo').disabled=!undoStack.length;buzz()};
var LAB=null;function wand(x,y){if(!LAB){var dd=sg.getImageData(0,0,w,h).data;LAB=new Float32Array(w*h*3);for(var i=0;i<w*h;i++){var c=lab(dd[i*4],dd[i*4+1],dd[i*4+2]);LAB[i*3]=c[0];LAB[i*3+1]=c[1];LAB[i*3+2]=c[2]}}
var mc=document.createElement('canvas');mc.width=w;mc.height=h;mc.getContext('2d').drawImage(mask,0,0,w,h);var ma=mc.getContext('2d').getImageData(0,0,w,h).data;
var sx=Math.max(0,Math.min(w-1,Math.round(x*w))),sy=Math.max(0,Math.min(h-1,Math.round(y*h))),s0=sy*w+sx,L0=0,A0=0,B0=0,n0=0;
for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++){var q=Math.max(0,Math.min(h-1,sy+dy))*w+Math.max(0,Math.min(w-1,sx+dx));L0+=LAB[q*3];A0+=LAB[q*3+1];B0+=LAB[q*3+2];n0++}
L0/=n0;A0/=n0;B0/=n0;var T=15,out=new Float32Array(w*h),stk=[s0],seen=new Uint8Array(w*h);seen[s0]=1;
while(stk.length){var p=stk.pop(),dl=(LAB[p*3]-L0)*.7,da=LAB[p*3+1]-A0,db=LAB[p*3+2]-B0;if(dl*dl+da*da+db*db>T*T||ma[p*4+3]<60)continue;out[p]=1;
var px=p%w;[px>0?p-1:-1,px<w-1?p+1:-1,p-w,p+w].forEach(function(o){if(o>=0&&o<w*h&&!seen[o]){seen[o]=1;stk.push(o)}})}
return out}
function buzz(){try{tg&&tg.HapticFeedback.impactOccurred('light')}catch(e){}}
function tap(x,y,mode){snap();var m=mode==='remove'?wand(x,y):segmentAt(seg,small,x,y);if(!m)return;var share=apply(m,mode);buzz();
if(mode==='remove'&&share>.6){$('.undo').click();say('That would remove too much. Zoom in and use Erase.',true);return}
if(mode==='set'||mode==='add')say(share<.02?'Nothing found there. Tap right on the piece.':TIP.keep,share<.02)}
function sizePx(){return+$('.dc-size input').value}
function sizeDot(){var d=Math.min(28,sizePx()/3.4);var i=$('.dc-size b i');i.style.width=i.style.height=d+'px'}
$('.dc-size input').oninput=sizeDot;sizeDot();
function setTool(t){tool=t;[].forEach.call($('.dc-tools').querySelectorAll('[data-b]'),function(b){b.setAttribute('aria-pressed',b.dataset.b===t)});
$('.dc-size').hidden=!(t==='erase'||t==='restore');say(TIP[t]);ring.style.display='none'}
setTool('keep');
setTimeout(function(){segmenter().then(function(s){seg=s;tap(.5,.5,'set');undoStack=[];$('.undo').disabled=true;$('.dc-busy').hidden=true},function(){
var kb=$('[data-b=keep]');if(kb)kb.hidden=true;setTool('remove');
$('.dc-str').hidden=false;dist=distances(sg.getImageData(0,0,w,h).data,w,h);colorAuto();$('.dc-busy').hidden=true})},30);
var tm;$('.dc-str input').oninput=function(){clearTimeout(tm);tm=setTimeout(colorAuto,120)};
$('.dc-tools').onclick=function(e){var b=e.target.closest('[data-b]');if(b){setTool(b.dataset.b);buzz()}};

// ---------- zoom and pan ----------
var view={s:1,x:0,y:0},base=1;
function place(){zoom.style.transform='translate('+view.x+'px,'+view.y+'px) scale('+view.s+')'}
function fit(){var rr=stage.getBoundingClientRect(),top=70,bot=150;base=Math.min((rr.width-24)/W,(rr.height-top-bot)/H);view.s=base;view.x=(rr.width-W*base)/2;view.y=top+(rr.height-top-bot-H*base)/2;place()}
requestAnimationFrame(fit);addEventListener('resize',fit);
function zoomAt(px,py,f){var ns=Math.max(base*.9,Math.min(base*10,view.s*f));f=ns/view.s;view.x=px-(px-view.x)*f;view.y=py-(py-view.y)*f;view.s=ns;place()}
stage.addEventListener('wheel',function(e){e.preventDefault();var rr=stage.getBoundingClientRect();zoomAt(e.clientX-rr.left,e.clientY-rr.top,Math.exp(-e.deltaY*.002))},{passive:false});

// ---------- painting: the stroke shows in colour first and is applied when the finger lifts ----------
function imgPt(cx,cy){var rr=stage.getBoundingClientRect();return[(cx-rr.left-view.x)/view.s,(cy-rr.top-view.y)/view.s]}
var stroke=null;
function strokeTo(p){var rad=sizePx()/2/view.s;og.strokeStyle=og.fillStyle=tool==='erase'?'#7ee2a8':'#8fc7ff';og.lineWidth=rad*2;og.lineCap=og.lineJoin='round';
if(stroke.last){og.beginPath();og.moveTo(stroke.last[0],stroke.last[1]);og.lineTo(p[0],p[1]);og.stroke()}og.beginPath();og.arc(p[0],p[1],rad,0,7);og.fill();stroke.last=p}
function commit(){snap();mg.globalCompositeOperation=tool==='erase'?'destination-out':'source-over';mg.drawImage(ov,0,0);mg.globalCompositeOperation='source-over';og.clearRect(0,0,W,H);paint();buzz()}
function showRing(cx,cy){if(tool!=='erase'&&tool!=='restore'){ring.style.display='none';return}var rr=stage.getBoundingClientRect();ring.style.display='block';ring.style.width=ring.style.height=sizePx()+'px';ring.style.left=cx-rr.left+'px';ring.style.top=cy-rr.top+'px'}
// loupe: 2x of what is under the finger, the photo with the coloured stroke on top
function drawLoupe(cx,cy){var rr=stage.getBoundingClientRect(),p=imgPt(cx,cy),half=64/view.s/2;
loupe.style.display='block';loupe.classList.toggle('right',cx-rr.left<180&&cy-rr.top<260);
lc.clearRect(0,0,256,256);lc.fillStyle='#1c2226';lc.fillRect(0,0,256,256);
for(var yy=0;yy<256;yy+=32)for(var xx=0;xx<256;xx+=32)if((xx+yy)/32%2){lc.fillStyle='#262d32';lc.fillRect(xx,yy,32,32)}
lc.drawImage(cv,p[0]-half,p[1]-half,half*2,half*2,0,0,256,256);lc.globalAlpha=.55;lc.drawImage(ov,p[0]-half,p[1]-half,half*2,half*2,0,0,256,256);lc.globalAlpha=1;
var rad=sizePx()/2*2;lc.strokeStyle='#fff';lc.lineWidth=2;lc.beginPath();lc.arc(128,128,Math.min(120,rad),0,7);lc.stroke();lc.beginPath();lc.moveTo(128,120);lc.lineTo(128,136);lc.moveTo(120,128);lc.lineTo(136,128);lc.stroke()}

var pts={},pinch=null,down=null,lastTap=0;
stage.addEventListener('pointerdown',function(e){if(e.target.closest('.dc-dock,.dc-top'))return;try{stage.setPointerCapture(e.pointerId)}catch(err){}pts[e.pointerId]={x:e.clientX,y:e.clientY};var ids=Object.keys(pts);
if(ids.length===2){if(stroke){og.clearRect(0,0,W,H);stroke=null}down=null;loupe.style.display='none';var a=pts[ids[0]],b=pts[ids[1]];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),mx:(a.x+b.x)/2,my:(a.y+b.y)/2};return}
down={x:e.clientX,y:e.clientY,moved:false};showRing(e.clientX,e.clientY);
if(tool==='erase'||tool==='restore'){stroke={last:null};strokeTo(imgPt(e.clientX,e.clientY));if(e.pointerType!=='mouse')drawLoupe(e.clientX,e.clientY)}});
stage.addEventListener('pointermove',function(e){if(e.pointerType==='mouse'&&!down&&!pinch)showRing(e.clientX,e.clientY);if(!pts[e.pointerId])return;pts[e.pointerId]={x:e.clientX,y:e.clientY};
var ids=Object.keys(pts);
if(pinch&&ids.length===2){var a=pts[ids[0]],b=pts[ids[1]],d=Math.hypot(a.x-b.x,a.y-b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2,rr=stage.getBoundingClientRect();
view.x+=mx-pinch.mx;view.y+=my-pinch.my;place();zoomAt(mx-rr.left,my-rr.top,d/pinch.d);pinch={d:d,mx:mx,my:my};return}
if(!down)return;if(Math.abs(e.clientX-down.x)+Math.abs(e.clientY-down.y)>6)down.moved=true;showRing(e.clientX,e.clientY);
if(stroke){strokeTo(imgPt(e.clientX,e.clientY));if(e.pointerType!=='mouse')drawLoupe(e.clientX,e.clientY)}
else if(down.moved){view.x+=e.movementX||0;view.y+=e.movementY||0;place()}});
function up(e){var wasTap=down&&!down.moved&&!pinch;delete pts[e.pointerId];if(Object.keys(pts).length<2)pinch=null;
if(stroke&&down){commit()}stroke=null;loupe.style.display='none';
if(wasTap&&(tool==='remove'||(tool==='keep'&&seg))){var now=Date.now();
if(now-lastTap<300){fit();lastTap=0}else{lastTap=now;var p=imgPt(e.clientX,e.clientY);if(p[0]>=0&&p[1]>=0&&p[0]<=W&&p[1]<=H)tap(p[0]/W,p[1]/H,tool==='keep'?'add':'remove')}}
down=null;if(e.pointerType!=='mouse')ring.style.display='none'}
stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',up);
stage.addEventListener('pointerleave',function(e){if(e.pointerType==='mouse')ring.style.display='none'});
stage.addEventListener('dblclick',fit);

function finish(v){removeEventListener('resize',fit);document.documentElement.style.overscrollBehavior=oldOver;
try{if(swipesOff&&!/outfits/.test(location.pathname))tg.enableVerticalSwipes()}catch(e){}
dlg.close();dlg.remove();URL.revokeObjectURL(r.url);done(v)}
dlg.addEventListener('cancel',function(e){e.preventDefault();finish({blob:blob,cut:false})});
$('.skip').onclick=function(){finish({blob:blob,cut:false})};
$('.done').onclick=function(){
var d=g.getImageData(0,0,W,H).data,x0=W,y0=H,x1=-1,y1=-1;
for(var y=0;y<H;y+=2)for(var x=0;x<W;x+=2)if(d[(y*W+x)*4+3]>24){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
if(x1<0){finish({blob:blob,cut:false});return}
var pad=Math.round(Math.max(W,H)*.02);x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(W,x1+pad);y1=Math.min(H,y1+pad);
var out=document.createElement('canvas');out.width=x1-x0;out.height=y1-y0;out.getContext('2d').drawImage(cv,x0,y0,out.width,out.height,0,0,out.width,out.height);
out.toBlob(function(b){finish(b?{blob:b,cut:true}:{blob:blob,cut:false})},'image/png')}})})}

window.DrapeCutout={edit:edit};
})();
