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
'.dcut{border:0;padding:0;margin:auto;width:min(980px,100vw);height:min(760px,100dvh);max-width:100vw;max-height:100dvh;background:var(--page,#e6ebee);color:var(--ink,#101316);font:inherit;overflow:hidden}',
'.dcut[open]{display:flex;flex-direction:column}',
'.dcut::backdrop{background:rgb(0 0 0 / .55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}',
'@media (min-width:701px){.dcut{border-radius:28px;box-shadow:0 40px 90px -30px rgb(0 0 0 / .5)}}',
'.dc-top{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:calc(10px + env(safe-area-inset-top)) 16px 10px}',
'.dc-top h3{margin:0;font:400 24px/1 var(--serif,serif);letter-spacing:-.01em}',
'.dc-top button:disabled{opacity:.35;cursor:default}',
'.dc-top button{height:36px;padding:0 4px;border:0;background:none;color:var(--muted,#5a656e);font:inherit;font-size:12px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}',
'.dc-stage{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none;background:repeating-conic-gradient(var(--card,#dde5ea) 0 25%,var(--page,#e6ebee) 0 50%) 0 0/20px 20px;cursor:crosshair}',
'.dc-zoom{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}',
'.dc-zoom canvas{display:block}',
'.dc-ring{position:absolute;pointer-events:none;border:1.5px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgb(0 0 0 / .35);transform:translate(-50%,-50%);display:none}',
'.dc-busy{position:absolute;inset:0;display:grid;place-items:center;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#5a656e);background:rgb(var(--page-rgb,230 235 238) / .75)}',
'.dc-hint{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);max-width:calc(100% - 32px);padding:8px 14px;border-radius:999px;background:rgb(var(--page-rgb,230 235 238) / .85);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font-size:12px;color:var(--ink,#101316);text-align:center;pointer-events:none;transition:opacity .3s}',
'.dc-hint.warn{color:var(--danger,#b3261e)}',
'.dc-bar{flex:none;padding:12px 16px calc(14px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px;border-top:1px solid var(--line,rgb(16 19 22 / .14))}',
'.dc-tools{display:flex;justify-content:space-between;gap:4px}',
'.dc-tools button{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;padding:6px 0;border:0;background:none;color:var(--muted,#5a656e);font:inherit;font-size:10px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;border-radius:12px}',
'.dc-tools svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}',
'.dc-tools button[aria-pressed=true]{color:var(--ink,#101316);background:rgb(var(--ink-rgb,16 19 22) / .07)}',
'.dc-size{display:flex;align-items:center;gap:12px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted,#5a656e)}',
'.dc-size input{flex:1;accent-color:var(--ink,#101316)}',
'.dc-size[hidden]{display:none}',
'.dc-acts{display:flex;align-items:center;gap:14px}',
'.dc-acts .use{flex:1;height:48px;border:0;border-radius:999px;background:var(--ink,#101316);color:var(--on-ink,#fff);font:inherit;font-size:13px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}',
'.dc-acts .orig{border:0;background:none;color:var(--muted,#5a656e);font:inherit;font-size:11px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;padding:8px 2px}'
].join('');

var ICONS={keep:'<path d="M12 4v16M4 12h16"/><circle cx="12" cy="12" r="9"/>',remove:'<path d="M8 8l8 8M16 8l-8 8"/><circle cx="12" cy="12" r="9"/>',
erase:'<path d="M15.5 4.5l4 4L10 18H6l-2-2 11.5-11.5z"/><path d="M13 7l4 4M14 20h6"/>',keep2:'<path d="M5 19c2-6 4-9 7-11 2.4-1.6 4.6-1.6 6-1M14 4l4 4"/><path d="M4 20l2-5 3 3z"/>'};

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
var dlg=document.createElement('dialog');dlg.className='dcut';dlg.setAttribute('aria-label','Clean up the photo');
dlg.innerHTML='<div class="dc-top"><button type="button" class="orig2">Cancel</button><h3>Clean up</h3><button type="button" class="undo" disabled>Undo</button></div>'+
'<div class="dc-stage"><div class="dc-zoom"><canvas></canvas></div><div class="dc-ring"></div><div class="dc-hint"></div><div class="dc-busy">Finding the item…</div></div>'+
'<div class="dc-bar"><div class="dc-tools" role="radiogroup" aria-label="Tool">'+
[['keep','Keep',ICONS.keep],['remove','Remove',ICONS.remove],['erase','Erase',ICONS.erase],['restore','Restore',ICONS.keep2]].map(function(t){return'<button type="button" role="radio" data-b="'+t[0]+'"><svg viewBox="0 0 24 24">'+t[2]+'</svg>'+t[1]+'</button>'}).join('')+
'</div><label class="dc-size" hidden>Brush<input type="range" min="6" max="90" value="30"></label>'+
'<label class="dc-size dc-str" hidden>Strength<input type="range" min="0" max="100" value="45"></label>'+
'<div class="dc-acts"><button type="button" class="orig">Keep original</button><button type="button" class="use">Use cutout</button></div></div>';
document.body.appendChild(dlg);dlg.showModal();
var $=function(q){return dlg.querySelector(q)},stage=$('.dc-stage'),zoom=$('.dc-zoom'),cv=$('canvas'),g=cv.getContext('2d'),ring=$('.dc-ring'),hint=$('.dc-hint');
cv.width=W;cv.height=H;
var mask=document.createElement('canvas');mask.width=W;mask.height=H;var mg=mask.getContext('2d');
var small=document.createElement('canvas');small.width=w;small.height=h;var sg=small.getContext('2d');sg.drawImage(im,0,0,w,h);
var dist=null,seg=null,tool='keep';
var TIP={keep:'Tap the item to keep it. Pinch to zoom in, double tap to zoom out.',remove:'Tap a leftover patch of background, it goes in one piece.',erase:'Paint over spots that should go.',restore:'Paint over parts of the item that went missing.'};
function say(t,warn){hint.textContent=t;hint.classList.toggle('warn',!!warn)}
function paint(){g.clearRect(0,0,W,H);g.drawImage(im,0,0);g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0);g.globalCompositeOperation='source-over'}
// a 0..1 map at the small size -> a soft full-size layer that is added to (or cut out of) the mask
function apply(fg,mode){var id=sg.createImageData(w,h),on=0;/* on = share of the photo this step touches */
for(var i=0;i<fg.length;i++){var a=Math.max(0,Math.min(1,(fg[i]-.35)/.3));id.data[i*4+3]=a*255;if(a>.5)on++}
var m=document.createElement('canvas');m.width=w;m.height=h;m.getContext('2d').putImageData(id,0,0);
if(mode==='set')mg.clearRect(0,0,W,H);
mg.globalCompositeOperation=mode==='remove'?'destination-out':'source-over';mg.drawImage(m,0,0,W,H);mg.globalCompositeOperation='source-over';paint();return on/fg.length}
function colorAuto(){var share=apply(makeMask(dist.D,w,h,dist.edgeQ,+$('.dc-str input').value),'set');
say(share<.03||share>.96?'We could not find the item clearly. Try a plain background, or keep the original.':'Background removed. Use Erase and Restore for the details.',share<.03||share>.96)}
function tap(x,y,mode){snap();var m=mode==='remove'?wand(x,y):segmentAt(seg,small,x,y);if(!m)return;var share=apply(m,mode);
if(mode==='remove'&&share>.6){$('.undo').click();say('That would remove too much. Zoom in and use Erase.',true);return}
if(mode==='set'||mode==='add')say(share<.02?'Nothing found there. Tap right on the item.':TIP.keep,share<.02)}
// undo: a few snapshots of the mask
var undoStack=[];function snap(){try{undoStack.push(mg.getImageData(0,0,W,H));if(undoStack.length>6)undoStack.shift();$('.undo').disabled=false}catch(e){}}
$('.undo').onclick=function(){var d=undoStack.pop();if(d){mg.putImageData(d,0,0);paint()}$('.undo').disabled=!undoStack.length};
// magic eraser: the patch of similar colour that touches the tapped point, inside what is kept now
var LAB=null;function wand(x,y){if(!LAB){var dd=sg.getImageData(0,0,w,h).data;LAB=new Float32Array(w*h*3);for(var i=0;i<w*h;i++){var c=lab(dd[i*4],dd[i*4+1],dd[i*4+2]);LAB[i*3]=c[0];LAB[i*3+1]=c[1];LAB[i*3+2]=c[2]}}
var mc=document.createElement('canvas');mc.width=w;mc.height=h;mc.getContext('2d').drawImage(mask,0,0,w,h);var ma=mc.getContext('2d').getImageData(0,0,w,h).data;
var sx=Math.max(0,Math.min(w-1,Math.round(x*w))),sy=Math.max(0,Math.min(h-1,Math.round(y*h))),s0=sy*w+sx,L0=0,A0=0,B0=0,n0=0;
for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++){var q=Math.max(0,Math.min(h-1,sy+dy))*w+Math.max(0,Math.min(w-1,sx+dx));L0+=LAB[q*3];A0+=LAB[q*3+1];B0+=LAB[q*3+2];n0++}
L0/=n0;A0/=n0;B0/=n0;var T=15,out=new Float32Array(w*h),st=[s0],seen=new Uint8Array(w*h);seen[s0]=1;
while(st.length){var p=st.pop(),dl=(LAB[p*3]-L0)*.7,da=LAB[p*3+1]-A0,db=LAB[p*3+2]-B0;if(dl*dl+da*da+db*db>T*T||ma[p*4+3]<60)continue;out[p]=1;
var px=p%w;[px>0?p-1:-1,px<w-1?p+1:-1,p-w,p+w].forEach(function(o){if(o>=0&&o<w*h&&!seen[o]){seen[o]=1;st.push(o)}})}
return out}
function setTool(t){tool=t;[].forEach.call($('.dc-tools').children,function(b){b.setAttribute('aria-pressed',b.dataset.b===t)});
dlg.querySelector('.dc-size').hidden=!(t==='erase'||t==='restore');say(TIP[t]);ring.style.display='none'}
setTool('keep');
// smart way first; without internet (or if it fails) the colour method
setTimeout(function(){segmenter().then(function(s){seg=s;tap(.5,.5,'set');$('.dc-busy').hidden=true},function(){
[].forEach.call($('.dc-tools').children,function(b){if(b.dataset.b==='keep')b.hidden=true});setTool('remove');
$('.dc-str').hidden=false;dist=distances(sg.getImageData(0,0,w,h).data,w,h);colorAuto();$('.dc-busy').hidden=true})},30);
var tm;$('.dc-str input').oninput=function(){clearTimeout(tm);tm=setTimeout(colorAuto,120)};
$('.dc-tools').onclick=function(e){var b=e.target.closest('[data-b]');if(b)setTool(b.dataset.b)};

// ---------- zoom and pan: pinch / wheel, double tap or "Reset zoom" fits the photo again ----------
var view={s:1,x:0,y:0},base=1;
function place(){zoom.style.transform='translate('+view.x+'px,'+view.y+'px) scale('+view.s+')'}
function fit(){var r=stage.getBoundingClientRect(),pad=16;base=Math.min((r.width-pad*2)/W,(r.height-pad*2)/H);view.s=base;view.x=(r.width-W*base)/2;view.y=(r.height-H*base)/2;place()}
requestAnimationFrame(fit);addEventListener('resize',fit);
function zoomAt(px,py,f){var ns=Math.max(base,Math.min(base*8,view.s*f));f=ns/view.s;view.x=px-(px-view.x)*f;view.y=py-(py-view.y)*f;view.s=ns;place()}
stage.addEventListener('wheel',function(e){e.preventDefault();var r=stage.getBoundingClientRect();zoomAt(e.clientX-r.left,e.clientY-r.top,Math.exp(-e.deltaY*.002))},{passive:false});

// pointers: one finger draws or taps, two fingers zoom and move
var pts={},pinch=null,down=null,last=null,lastTap=0;
function imgPt(cx,cy){var r=stage.getBoundingClientRect();return[(cx-r.left-view.x)/view.s,(cy-r.top-view.y)/view.s]}
function brush(p){var rr=+$('.dc-size input').value/2/view.s*1.4;
mg.globalCompositeOperation=tool==='erase'?'destination-out':'source-over';mg.strokeStyle=mg.fillStyle='#000';mg.lineWidth=rr*2;mg.lineCap='round';
if(last){mg.beginPath();mg.moveTo(last[0],last[1]);mg.lineTo(p[0],p[1]);mg.stroke()}mg.beginPath();mg.arc(p[0],p[1],rr,0,7);mg.fill();mg.globalCompositeOperation='source-over';last=p;paint()}
function showRing(cx,cy){if(tool!=='erase'&&tool!=='restore')return;var r=stage.getBoundingClientRect(),d=+$('.dc-size input').value*1.4;ring.style.display='block';ring.style.width=ring.style.height=d+'px';ring.style.left=cx-r.left+'px';ring.style.top=cy-r.top+'px'}
stage.addEventListener('pointerdown',function(e){stage.setPointerCapture(e.pointerId);pts[e.pointerId]={x:e.clientX,y:e.clientY};var ids=Object.keys(pts);
if(ids.length===2){down=null;last=null;var a=pts[ids[0]],b=pts[ids[1]];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),mx:(a.x+b.x)/2,my:(a.y+b.y)/2};return}
down={x:e.clientX,y:e.clientY,moved:false};last=null;showRing(e.clientX,e.clientY);
if(tool==='erase'||tool==='restore'){snap();brush(imgPt(e.clientX,e.clientY))}});
stage.addEventListener('pointermove',function(e){if(e.pointerType==='mouse'&&!down&&!pinch)showRing(e.clientX,e.clientY);if(!pts[e.pointerId])return;pts[e.pointerId]={x:e.clientX,y:e.clientY};
var ids=Object.keys(pts);
if(pinch&&ids.length===2){var a=pts[ids[0]],b=pts[ids[1]],d=Math.hypot(a.x-b.x,a.y-b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2,r=stage.getBoundingClientRect();
view.x+=mx-pinch.mx;view.y+=my-pinch.my;place();zoomAt(mx-r.left,my-r.top,d/pinch.d);pinch={d:d,mx:mx,my:my};return}
if(!down)return;if(Math.abs(e.clientX-down.x)+Math.abs(e.clientY-down.y)>6)down.moved=true;showRing(e.clientX,e.clientY);
if(tool==='erase'||tool==='restore')brush(imgPt(e.clientX,e.clientY));
else if(down.moved&&view.s>base*1.01){view.x+=e.movementX||0;view.y+=e.movementY||0;place()}});
function up(e){var wasTap=down&&!down.moved&&!pinch;delete pts[e.pointerId];if(Object.keys(pts).length<2)pinch=null;
if(wasTap&&(tool==='remove'||(tool==='keep'&&seg))){var now=Date.now();
if(now-lastTap<300){fit();lastTap=0}else{lastTap=now;var p=imgPt(e.clientX,e.clientY);if(p[0]>=0&&p[1]>=0&&p[0]<=W&&p[1]<=H)tap(p[0]/W,p[1]/H,tool==='keep'?'add':'remove')}}
down=null;last=null;if(e.pointerType!=='mouse')ring.style.display='none'}
stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',up);
stage.addEventListener('pointerleave',function(e){if(e.pointerType==='mouse')ring.style.display='none'});

function finish(v){removeEventListener('resize',fit);dlg.close();dlg.remove();URL.revokeObjectURL(r.url);done(v)}
dlg.addEventListener('cancel',function(e){e.preventDefault();finish({blob:blob,cut:false})});
$('.orig').onclick=$('.orig2').onclick=function(){finish({blob:blob,cut:false})};
$('.use').onclick=function(){
// crop to the item with a little air around it
var d=g.getImageData(0,0,W,H).data,x0=W,y0=H,x1=-1,y1=-1;
for(var y=0;y<H;y+=2)for(var x=0;x<W;x+=2)if(d[(y*W+x)*4+3]>24){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
if(x1<0){finish({blob:blob,cut:false});return}
var pad=Math.round(Math.max(W,H)*.02);x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(W,x1+pad);y1=Math.min(H,y1+pad);
var out=document.createElement('canvas');out.width=x1-x0;out.height=y1-y0;out.getContext('2d').drawImage(cv,x0,y0,out.width,out.height,0,0,out.width,out.height);
out.toBlob(function(b){finish(b?{blob:b,cut:true}:{blob:blob,cut:false})},'image/png')}})})}

window.DrapeCutout={edit:edit};
})();
