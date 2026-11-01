// Drape storage: wardrobe items and outfits, kept privately in this browser (IndexedDB).
// Falls back to memory when the browser blocks storage. Later this becomes a real server.
(function(){
var VERSION=2,STORES=['garments','outfits'],db=null,mem={garments:[],outfits:[]};

function open(){return new Promise(function(res,rej){try{
var r=indexedDB.open('drape',VERSION);
r.onupgradeneeded=function(){STORES.forEach(function(n){if(!r.result.objectStoreNames.contains(n))r.result.createObjectStore(n,{keyPath:'id'})})};
r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)}}catch(e){rej(e)}})}

function run(name,mode,fn){return new Promise(function(res,rej){var t=db.transaction(name,mode),q=fn(t.objectStore(name));t.oncomplete=function(){res(q&&q.result)};t.onerror=function(){rej(t.error)}})}

var ready=open().then(function(d){db=d;return true},function(e){console.warn('Drape storage unavailable',e);return false});

window.DrapeStore={
ready:ready, // resolves to false when items will not survive a reload
all:function(name){return ready.then(function(){return db?run(name,'readonly',function(s){return s.getAll()}):mem[name].slice()})},
put:function(name,obj){return ready.then(function(){if(db)return run(name,'readwrite',function(s){return s.put(obj)});mem[name]=mem[name].filter(function(x){return x.id!==obj.id}).concat(obj)})},
del:function(name,id){return ready.then(function(){if(db)return run(name,'readwrite',function(s){return s.delete(id)});mem[name]=mem[name].filter(function(x){return x.id!==id})})},
clear:function(name){return ready.then(function(){if(db)return run(name,'readwrite',function(s){return s.clear()});mem[name]=[]})}};

// shared lists
window.DrapeData={
CATS:['Tops','Bottoms','Outerwear','Shoes','Accessories','Other'],
COLORS:[['Black','#151617'],['White','#f7f7f5'],['Grey','#9a9c9f'],['Beige','#d9ccb4'],['Brown','#7a5a43'],['Navy','#1f2a44'],['Blue','#5d7ea8'],['Green','#4f7a55'],['Olive','#6b6d4a'],['Red','#b23a32'],['Pink','#e6b3c0'],['Yellow','#e8c84a'],['Orange','#dd7a35'],['Purple','#6e5a8f'],['Multi','conic-gradient(#b23a32,#e8c84a,#4f7a55,#5d7ea8,#6e5a8f,#b23a32)']]};

// drawn placeholder garments for sample items (not real products)
(function(){
function svg(body,c){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 360"><defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#28323c" flood-opacity=".22"/></filter></defs><g filter="url(#s)" fill="'+c+'" stroke="rgba(0,0,0,.18)" stroke-width="2" stroke-linejoin="round">'+body+'</g></svg>')}
var SHAPES={
hoodie:'<path d="M110 40c10-14 70-14 80 0l50 22 38 150-34 10-24-90v190H80V122l-24 90-34-10 38-150z"/><path d="M118 40c4 34 60 34 64 0" fill="none"/><path d="M135 62v40M165 62v40" fill="none"/><path d="M100 220h100l-12 50h-76z" fill="none"/>',
tee:'<path d="M112 46c12 16 64 16 76 0l58 22 30 70-46 18-12-30v214H82V126l-12 30-46-18 30-70z"/><path d="M112 46c12 22 64 22 76 0" fill="none"/>',
jeans:'<path d="M88 30h124l14 300h-58l-18-200-18 200H74z"/><path d="M88 52h124M150 52v70M112 52c0 22-10 30-22 32M188 52c0 22 10 30 22 32" fill="none"/>',
cargo:'<path d="M90 30h120l18 300h-62l-16-190-16 190H72z"/><path d="M90 52h120M150 52v70" fill="none"/><path d="M80 160h34v46H82zM186 160h34l-2 46h-32z"/>',
jacket:'<path d="M108 44c14-10 70-10 84 0l50 24 30 160-36 8-20-90v168H84V146l-20 90-36-8 30-160z"/><path d="M150 50v264M120 46l30 24 30-24M84 296h132" fill="none"/>',
sneaker:'<path d="M40 210c0-30 10-60 34-70l60-22c18 22 40 32 70 34l56 14c20 6 24 26 24 44v20H40z"/><path d="M40 230h244v18c0 8-6 14-14 14H54c-8 0-14-6-14-14z" fill="#f4f3f0"/><path d="M110 132l14 30M130 126l14 30M150 124l12 28" fill="none"/>',
cap:'<path d="M70 200c0-70 40-100 80-100s80 30 80 100z"/><path d="M60 200h170c26 0 44 10 50 24H60c-8 0-12-8 0-24z"/><circle cx="150" cy="98" r="7"/>',
bag:'<path d="M60 70c40-40 140-40 180 0" fill="none" stroke-width="10"/><rect x="70" y="150" width="160" height="120" rx="30"/><path d="M90 190h120" fill="none"/>'};
window.DrapeData.SHAPES=SHAPES;window.DrapeData.sampleSvg=svg;
})();
})();

// a catalog photo that isn't made yet shows a quiet hanger instead of a broken image
(function(){
var soon='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><g fill="none" stroke="#9aa5ad" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M150 150v-12c0-10 16-12 16-26a16 16 0 0 0-32 0"/><path d="M150 150l-96 56c-10 6-6 18 4 18h184c10 0 14-12 4-18z"/></g><text x="150" y="282" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" fill="#7a868f">Photo coming soon</text></svg>');
document.addEventListener('error',function(e){var im=e.target;
if(im&&im.tagName==='IMG'&&/assets\/ai\/catalog\//.test(im.getAttribute('src')||'')&&!im.dataset.soon){im.dataset.soon='1';im.src=soon}},true);
})();
