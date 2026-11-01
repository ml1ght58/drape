// Drape app shell for phones: the bottom tab bar (Catalog, Wardrobe, Outfits, Profile).
// Shown only on narrow screens (see .tabbar in drape.css); on a computer the top menu stays.
// Inside Telegram (Mini App) it also follows Telegram's theme, uses Telegram's Back button and gives light haptics.
(function(){
var P='Drape%20%E2%80%94%20',here=decodeURIComponent(location.pathname.split('/').pop()||'');
var I={
catalog:'<path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5z"/><path d="M4 7.5 12 11l8-3.5M12 11v9"/>',
wardrobe:'<path d="M12 6.5a2 2 0 1 1 2-2"/><path d="M12 6.5v1.2L3.6 13.6c-.9.6-.5 2 .6 2h15.6c1.1 0 1.5-1.4.6-2L12 7.7"/><path d="M6 15.6V19h12v-3.4"/>',
outfits:'<rect x="4" y="4" width="7" height="9" rx="1.5"/><rect x="13" y="4" width="7" height="6" rx="1.5"/><rect x="13" y="12" width="7" height="8" rx="1.5"/><rect x="4" y="15" width="7" height="5" rx="1.5"/>',
profile:'<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c.9-3.6 3.5-5.4 7.2-5.4s6.3 1.8 7.2 5.4"/>'};
var T=[['catalog','Catalog'],['wardrobe','Wardrobe'],['outfits','Outfits'],['profile','Profile']];
var bar=document.createElement('nav');bar.className='tabbar';bar.setAttribute('aria-label','Main');
// the published site uses short names (catalog.html), the working copy the long ones (Drape — catalog.html)
var long=/^Drape — /.test(here);
bar.innerHTML=T.map(function(t){var on=here==='Drape — '+t[0]+'.html'||here===t[0]+'.html';
return'<a class="tab" href="'+(long?P:'')+t[0]+'.html"'+(on?' aria-current="page"':'')+'><svg viewBox="0 0 24 24" aria-hidden="true">'+I[t[0]]+'</svg><span>'+t[1]+'</span></a>'}).join('');
document.body.appendChild(bar);document.documentElement.classList.add('has-tabbar');

// ---------- always the newest version ----------
// Telegram and GitHub keep old pages for a while. The published site knows its build id (meta drape-build);
// if version.json says there is a newer one, the page reloads itself once with the new id in the address.
(function(){var m=document.querySelector('meta[name=drape-build]');if(!m||!window.fetch)return;var mine=m.content;
fetch('version.json?t='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(v){
if(!v||!v.build||v.build===mine)return;var k='drape-reload-'+v.build;try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1')}catch(e){}
var u=new URL(location.href);u.searchParams.set('b',v.build);location.replace(u.toString())}).catch(function(){})})();

// ---------- Telegram Mini App ----------
// Telegram opens the first page with #tgWebAppData... in the address; we remember that for the next pages of the visit.
var inTg=/tgWebApp/.test(location.hash);
try{if(inTg)sessionStorage.setItem('drape-tg','1');else inTg=sessionStorage.getItem('drape-tg')==='1'}catch(e){}
if(!inTg)return;
document.documentElement.classList.add('tg');
function start(tg){if(!tg)return;
  tg.ready();tg.expand();
  var at=function(v){try{return tg.isVersionAtLeast(v)}catch(e){return false}};
  // theme: Telegram's light/dark wins unless the person picked one in Profile → Appearance
  function theme(){var own=null;try{own=localStorage.getItem('drape-theme')}catch(e){}
    if(own!=='light'&&own!=='dark')document.documentElement.dataset.theme=tg.colorScheme==='dark'?'dark':'light';
    var page=getComputedStyle(document.documentElement).getPropertyValue('--page').trim();
    if(/^#[0-9a-f]{6}$/i.test(page)&&at('6.1')){try{tg.setHeaderColor(page);tg.setBackgroundColor(page)}catch(e){}if(at('7.10'))try{tg.setBottomBarColor(page)}catch(e){}}}
  theme();tg.onEvent('themeChanged',theme);
  // Telegram's own Back button replaces the browser one; it is hidden on the first page of the visit
  var first=false;try{first=!sessionStorage.getItem('drape-tg-seen');sessionStorage.setItem('drape-tg-seen','1')}catch(e){}
  if(at('6.1')){if(first||history.length<2)tg.BackButton.hide();else{tg.BackButton.show();tg.BackButton.onClick(function(){history.back()})}}
  // on a computer the app opens full screen (Telegram 8.0+); Telegram's own buttons then float on top,
  // so .tg-full pushes our header below them (Telegram fills the --tg-*-safe-area-inset-* sizes)
  function full(){document.documentElement.classList.toggle('tg-full',!!tg.isFullscreen)}
  if(at('8.0')){tg.onEvent('fullscreenChanged',full);full();
    if(/^(tdesktop|macos|unigram)$/.test(tg.platform)&&!tg.isFullscreen)try{tg.requestFullscreen()}catch(e){}}
  // the outfit table is dragged with a finger: don't let that swipe close the app
  if(/outfits/.test(here)&&at('7.7'))try{tg.disableVerticalSwipes()}catch(e){}
  // a light tap feeling on buttons
  if(at('6.1'))document.addEventListener('click',function(e){if(e.target.closest('.btn,.chip,.pill,.tab,.opt,.slot,.swatch,.shuffle,.heart,[data-pick]')){try{tg.HapticFeedback.selectionChanged()}catch(err){}}},true);
  // the name from Telegram fills Profile the first time (only on this device, nothing is sent anywhere)
  var u=tg.initDataUnsafe&&tg.initDataUnsafe.user;
  try{if(u&&u.first_name&&!localStorage.getItem('drape-name'))localStorage.setItem('drape-name',u.first_name)}catch(e){}}
if(window.Telegram&&window.Telegram.WebApp)start(window.Telegram.WebApp);
else{var s=document.createElement('script');s.src='https://telegram.org/js/telegram-web-app.js?64';s.onload=function(){start(window.Telegram&&window.Telegram.WebApp)};document.head.appendChild(s)}
})();
