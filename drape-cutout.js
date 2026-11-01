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

var css='.dcut{border:0;padding:0;border-radius:28px;width:min(920px,calc(100vw - 32px));max-height:calc(100vh - 32px);background:#f4f6f7;color:var(--ink,#101316);box-shadow:0 40px 90px -30px rgba(10,20,30,.5);font:inherit}'+
'.dcut::backdrop{background:rgba(16,19,22,.45);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}'+
'.dcut .in{display:grid;grid-template-columns:1fr 280px;min-height:0}'+
'.dcut .view{position:relative;background:#e3e8eb;border-radius:28px 0 0 28px;display:grid;place-items:center;padding:24px;min-height:min(560px,calc(100vh - 80px))}'+
'.dcut canvas{max-width:100%;max-height:calc(100vh - 140px);border-radius:12px;touch-action:none;cursor:crosshair;background:repeating-conic-gradient(#dfe4e7 0 25%,#f3f5f6 0 50%) 0 0/18px 18px}'+
'.dcut .side{padding:28px 24px;display:flex;flex-direction:column;gap:18px}'+
'.dcut h3{margin:0;font-family:var(--wide,inherit);font-weight:600;font-size:22px;letter-spacing:-.02em;text-transform:uppercase}'+
'.dcut p{margin:0;color:var(--muted,#5a656e);font-size:14px;line-height:1.5}'+
'.dcut label{display:flex;flex-direction:column;gap:8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#5a656e)}'+
'.dcut input[type=range]{width:100%;accent-color:#101316}'+
'.dcut .seg{display:flex;gap:4px;padding:4px;border-radius:999px;background:#e3e8eb}'+
'.dcut .seg button{flex:1;height:34px;border:0;border-radius:999px;background:transparent;font:inherit;font-size:13px;cursor:pointer}'+
'.dcut .seg button[aria-pressed=true]{background:#101316;color:#fff}'+
'.dcut .warn{color:#8a4b12}'+
'.dcut .acts{margin-top:auto;display:flex;flex-direction:column;gap:8px}'+
'.dcut .acts button{height:46px;border-radius:999px;border:1px solid rgba(16,19,22,.14);background:#fff;font:inherit;font-size:13px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}'+
'.dcut .acts .main{background:#101316;color:#fff;border-color:#101316}'+
'.dcut .busy{position:absolute;inset:0;display:grid;place-items:center;font-size:14px;color:var(--muted,#5a656e);background:rgba(227,232,235,.7);border-radius:28px 0 0 28px}'+
'@media (max-width:760px){.dcut .in{grid-template-columns:1fr}.dcut .view{border-radius:28px 28px 0 0;min-height:50vh}.dcut .busy{border-radius:28px 28px 0 0}}';

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
dlg.innerHTML='<div class="in"><div class="view"><canvas></canvas><div class="busy">Finding the item…</div></div><div class="side">'+
'<h3>Clean up</h3><p class="msg"></p>'+
'<div class="seg"><button type="button" data-b="pick" aria-pressed="true">Tap item</button><button type="button" data-b="erase" aria-pressed="false">Erase</button><button type="button" data-b="keep" aria-pressed="false">Restore</button></div>'+
'<label class="lsize">Brush size<input type="range" min="6" max="90" value="28" class="size"></label>'+
'<label class="lstr" hidden>Background removal<input type="range" min="0" max="100" value="45" class="str"></label>'+
'<div class="acts"><button type="button" class="main use">Use cutout</button><button type="button" class="orig">Keep original photo</button></div></div></div>';
document.body.appendChild(dlg);dlg.showModal();
var cv=dlg.querySelector('canvas'),g=cv.getContext('2d'),busy=dlg.querySelector('.busy'),msg=dlg.querySelector('.msg');
cv.width=W;cv.height=H;
var mask=document.createElement('canvas');mask.width=W;mask.height=H;var mg=mask.getContext('2d');
var small=document.createElement('canvas');small.width=w;small.height=h;var sg=small.getContext('2d');sg.drawImage(im,0,0,w,h);
var dist=null,seg=null,prob=null,brush='pick';
var TIP={pick:'Tap the item to keep it. Tap other parts of it to add them.',erase:'Paint over spots that should go.',keep:'Paint over parts of the item that went missing.'};
function say(t,warn){msg.textContent=t;msg.classList.toggle('warn',!!warn)}
function paint(){g.clearRect(0,0,W,H);g.globalCompositeOperation='source-over';g.drawImage(im,0,0);g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0);g.globalCompositeOperation='source-over'}
// small mask (0..1 per pixel) -> soft full-size mask
function show(fg){var id=sg.createImageData(w,h),on=0;
for(var i=0;i<fg.length;i++){var a=Math.max(0,Math.min(1,(fg[i]-.35)/.3));id.data[i*4+3]=a*255;if(a>.5)on++}
var m=document.createElement('canvas');m.width=w;m.height=h;m.getContext('2d').putImageData(id,0,0);
mg.clearRect(0,0,W,H);mg.drawImage(m,0,0,W,H);paint();return on/fg.length}
function colorAuto(){var share=show(makeMask(dist.D,w,h,dist.edgeQ,+dlg.querySelector('.str').value));
say(share<.03||share>.96?'We could not find the item clearly. Try a plain background, or keep the original photo.':'We removed the background. Paint over any spots to fix them.',share<.03||share>.96)}
function tap(x,y,add){var m=segmentAt(seg,small,x,y);if(!m)return;
if(!prob||!add)prob=m;else for(var i=0;i<m.length;i++)prob[i]=Math.max(prob[i],m[i]);
var share=show(prob);say(share<.02?'Nothing found there. Tap right on the item.':TIP.pick,share<.02)}
// try the smart way first; without internet (or if it fails) fall back to the colour method
setTimeout(function(){segmenter().then(function(s){seg=s;tap(.5,.5,false);busy.hidden=true},function(){
brush='erase';[].forEach.call(dlg.querySelector('.seg').children,function(x){x.setAttribute('aria-pressed',x.dataset.b==='erase');if(x.dataset.b==='pick')x.hidden=true});
dlg.querySelector('.lstr').hidden=false;dist=distances(sg.getImageData(0,0,w,h).data,w,h);colorAuto();busy.hidden=true})},30);
var tm;dlg.querySelector('.str').oninput=function(){clearTimeout(tm);tm=setTimeout(colorAuto,120)};
dlg.querySelector('.seg').onclick=function(e){var b=e.target.closest('[data-b]');if(!b)return;brush=b.dataset.b;[].forEach.call(this.children,function(x){x.setAttribute('aria-pressed',x===b)});say(TIP[brush])};
// brush: erase makes pixels see-through, restore brings the photo back
var down=false,last=null;
function at(e){var r=cv.getBoundingClientRect();return[(e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height]}
function stroke(p){var rr=+dlg.querySelector('.size').value*W/cv.getBoundingClientRect().width/2;
mg.globalCompositeOperation=brush==='erase'?'destination-out':'source-over';mg.fillStyle='#000';mg.strokeStyle='#000';mg.lineWidth=rr*2;mg.lineCap='round';
mg.beginPath();if(last){mg.moveTo(last[0],last[1]);mg.lineTo(p[0],p[1]);mg.stroke()}mg.beginPath();mg.arc(p[0],p[1],rr,0,7);mg.fill();mg.globalCompositeOperation='source-over';last=p;paint()}
cv.onpointerdown=function(e){var p=at(e);if(brush==='pick'){if(seg)tap(p[0]/W,p[1]/H,true);return}down=true;last=null;cv.setPointerCapture(e.pointerId);stroke(p)};
cv.onpointermove=function(e){if(down)stroke(at(e))};
cv.onpointerup=cv.onpointercancel=function(){down=false;last=null};
function finish(v){dlg.close();dlg.remove();URL.revokeObjectURL(r.url);done(v)}
dlg.addEventListener('cancel',function(e){e.preventDefault();finish({blob:blob,cut:false})});
dlg.querySelector('.orig').onclick=function(){finish({blob:blob,cut:false})};
dlg.querySelector('.use').onclick=function(){
// crop to the item with a little air around it
var d=g.getImageData(0,0,W,H).data,x0=W,y0=H,x1=-1,y1=-1;
for(var y=0;y<H;y+=2)for(var x=0;x<W;x+=2)if(d[(y*W+x)*4+3]>24){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
if(x1<0){finish({blob:blob,cut:false});return}
var pad=Math.round(Math.max(W,H)*.02);x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(W,x1+pad);y1=Math.min(H,y1+pad);
var out=document.createElement('canvas');out.width=x1-x0;out.height=y1-y0;out.getContext('2d').drawImage(cv,x0,y0,out.width,out.height,0,0,out.width,out.height);
out.toBlob(function(b){finish(b?{blob:b,cut:true}:{blob:blob,cut:false})},'image/png')}})})}

window.DrapeCutout={edit:edit};
})();
