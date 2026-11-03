(function(){
'use strict';
const app = document.getElementById('app');
const phone = document.getElementById('phone');
const ORIG_HEAD = document.head.innerHTML, ORIG_BODY = document.body.innerHTML;
/* Textos editados por la dueña: { "texto original": "texto nuevo" }. __ts decide qué copia es la más reciente. */
let TX = {};
try{ TX = JSON.parse(document.getElementById('vip-texts').textContent || '{}') || {}; }catch(e){ TX = {}; }
const ORIGTXT = new WeakMap();
const EDIT = { on:false, mode:'edit', dirty:0, can:false };
let ART = null;

/* =========================================================
   Utilidades
   ========================================================= */
const pad = n => String(n).padStart(2,'0');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const soles = n => 'S/ ' + (Math.round(n*100)/100).toFixed(2);
function hash(s){ let h = 2166136261; s = String(s); for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h,16777619); } return h>>>0; }
function rng(seed){ let a = hash(seed); return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a>>>15, 1 | a); t = t + Math.imul(t ^ t>>>7, 61 | t) ^ t; return ((t ^ t>>>14)>>>0)/4294967296; }; }
function shuffle(arr, r){ const a = arr.slice(); for (let i=a.length-1;i>0;i--){ const j = Math.floor(r()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; }
function ymd(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function addDays(n){ const d = new Date(); d.setDate(d.getDate()+n); return ymd(d); }
function parseYmd(s){ const p = s.split('-').map(Number); return new Date(p[0],p[1]-1,p[2]); }
function daysFromToday(s){ return Math.round((parseYmd(s) - parseYmd(ymd(new Date())))/864e5); }
function addMin(t,m){ const p = t.split(':').map(Number); let tot = p[0]*60+p[1]+m; tot = ((tot%1440)+1440)%1440; return pad(Math.floor(tot/60))+':'+pad(tot%60); }
function depDate(t){ if (t.dep) return new Date(t.dep); const d = parseYmd(t.date); const p = t.time.split(':').map(Number); d.setHours(p[0],p[1],0,0); return d; }
function nowSim(){ return new Date(); }
function dayLabel(s){ const n = daysFromToday(s); if (n===0) return 'Hoy'; if (n===1) return 'Mañana'; if (n===2) return 'Pasado mañana'; return parseYmd(s).toLocaleDateString('es-PE',{weekday:'short',day:'numeric',month:'short'}); }
function dateLong(s){ const t = parseYmd(s).toLocaleDateString('es-PE',{weekday:'long',day:'numeric',month:'long'}); return t.charAt(0).toUpperCase()+t.slice(1); }
function mmss(ms){ ms = Math.max(0,ms); const s = Math.floor(ms/1000); return pad(Math.floor(s/60))+':'+pad(s%60); }
function durTxt(min){ min = Math.max(0,Math.round(min)); const h = Math.floor(min/60), m = min%60; return h ? (h+' h '+pad(m)+' min') : (m+' min'); }
function untilTxt(ms){ if (ms <= 0) return 'Ya salió'; const min = Math.round(ms/60000); if (min < 60) return 'Sale en '+min+' min'; if (min < 1440) return 'Sale en '+durTxt(min); return 'Sale el '+dateLong(ymd(new Date(Date.now()+ms))); }
function firstName(n){ return String(n||'').trim().split(/\s+/)[0] || ''; }
function shortName(n){ const p = String(n||'').trim().split(/\s+/); return p.length>1 ? p[0]+' '+p[1].charAt(0)+'.' : p[0]; }
function code(r){ const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for (let i=0;i<4;i++) s += c[Math.floor((r?r():Math.random())*c.length)]; return s; }

/* =========================================================
   Íconos
   ========================================================= */
const I = {
  back:'<path d="M15 18l-6-6 6-6"/>', chev:'<path d="M9 6l6 6-6 6"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>',
  swap:'<path d="M7 4v16M7 4L3 8M7 4l4 4M17 20V4M17 20l-4-4M17 20l4-4"/>',
  cal:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.2 0 3.8 1.2 4.5 3.5"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  pin:'<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  share:'<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  alert:'<path d="M12 3L2 20h20z"/><path d="M12 10v4M12 17.5v.01"/>',
  card:'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
  home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  ticket:'<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2.5 2.5 0 0 0 0 5v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2.5 2.5 0 0 0 0-5z"/><path d="M14 6v12" stroke-dasharray="2 2.5"/>',
  live:'<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M5 5a10 10 0 0 0 0 14M19 19a10 10 0 0 0 0-14"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bag:'<rect x="5" y="7" width="14" height="13" rx="2"/><path d="M9 7V4h6v3M9 11v5M15 11v5"/>',
  phone:'<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  id:'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.6-1.5 1.7-2.2 3-2.2s2.4.7 3 2.2M14 10h4M14 13.5h3"/>',
  camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  wheel:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2"/><path d="M3.5 12H10M14 12h6.5M12 14v6.5"/>',
  route:'<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/>',
  money:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>',
  logout:'<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/>',
  snow:'<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
  bolt:'<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  belt:'<path d="M6 3l12 18M4 14h16"/>',
  gps:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  chat:'<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  doc:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  car:'<path d="M4 16v-4l2-5h12l2 5v4z"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/><path d="M4 12h16"/>',
  tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  play:'<path d="M7 4.5v15l12-7.5z"/>', pause:'<path d="M8 5v14M16 5v14"/>',
  expand:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  seat:'<path d="M7 4h7a2 2 0 0 1 2 2v7H8a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zM6 13h12l1 4H7zM9 17v3M16 17v3"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  star:'<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
  flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  wifi:'<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a4.5 4.5 0 0 1 6.4 0"/><circle cx="12" cy="19" r="1"/>'
};
function ic(n, s){ s = s || 20; return '<svg class="i" width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(I[n]||'')+'</svg>'; }
function starI(s, fill){ s = s || 14; return '<svg width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="'+(fill===false?'none':'currentColor')+'" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">'+I.star+'</svg>'; }

/* =========================================================
   Marca (versión clara del logo del equipo)
   ========================================================= */
function mark(h){
  return '<svg class="lg" viewBox="0 0 100 64" height="'+h+'" aria-hidden="true">'+
   '<defs><linearGradient id="vipg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD24A"/><stop offset=".55" stop-color="#F2B705"/><stop offset="1" stop-color="#C98F00"/></linearGradient></defs>'+
   '<g transform="translate(1.6 1.6)" fill="#8E6200"><path d="M2 8h12l8 24 8-24h12L28 44H16z"/><path d="M45 29h10v15H45z"/><path d="M50 2a10 10 0 0 1 10 10c0 6-6 11-10 15-4-4-10-9-10-15A10 10 0 0 1 50 2z"/><path fill-rule="evenodd" d="M64 8h18c10 0 16 6 16 14s-6 14-16 14h-7v8H64zM75 17v10h6c3 0 5-2 5-5s-2-5-5-5z"/></g>'+
   '<g fill="url(#vipg)"><path d="M2 8h12l8 24 8-24h12L28 44H16z"/><path d="M45 29h10v15H45z"/><path fill-rule="evenodd" d="M50 2a10 10 0 0 1 10 10c0 6-6 11-10 15-4-4-10-9-10-15A10 10 0 0 1 50 2zm0 6.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z"/><path fill-rule="evenodd" d="M64 8h18c10 0 16 6 16 14s-6 14-16 14h-7v8H64zM75 17v10h6c3 0 5-2 5-5s-2-5-5-5z"/></g>'+
   '<path d="M4 58C34 54 70 52 96 38" fill="none" stroke="#23262D" stroke-width="7" stroke-linecap="round"/>'+
   '<path d="M8 57.4C36 53.6 70 51.6 93 39.6" fill="none" stroke="#FFFFFF" stroke-width="1.2" stroke-dasharray="4 4"/>'+
  '</svg>';
}
function logoH(h){
  return '<span style="display:inline-flex;align-items:center;gap:8px" aria-label="VIP Ruta segura" role="img">'+mark(h)+
    '<span style="display:flex;flex-direction:column;line-height:1"><b style="font-family:var(--f-display);font-stretch:118%;font-weight:900;font-size:'+Math.round(h*.42)+'px;letter-spacing:-.01em">Ruta segura</b><small style="font-weight:700;font-size:'+Math.max(9,Math.round(h*.27))+'px;color:var(--muted);letter-spacing:.06em">TRUJILLO ⇄ CHICLAYO</small></span></span>';
}

/* =========================================================
   Datos del servicio
   ========================================================= */
const TRIP_MIN = 200;   // 3 h 20 min por la Panamericana Norte
const TIMES = ['05:30','07:00','08:30','10:00','11:30','13:00','14:30','16:00','17:30','19:00','20:30'];
const OFF = {
  tru:{ city:'Trujillo', name:'Oficina Trujillo', addr:'Av. Túpac Amaru con Av. Miraflores', q:'Av. Túpac Amaru y Av. Miraflores, Trujillo, La Libertad' },
  chi:{ city:'Chiclayo', name:'Oficina Chiclayo', addr:'Av. José Balta con Pasaje Nazareth', q:'Av. José Balta y Pasaje Nazareth, Chiclayo, Lambayeque' }
};
const mapsLink = k => 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(OFF[k].q);
const VT = {
  auto:{ label:'Auto', seats:4, price:60, layout:[['D',1],[2,3,4]], desc:'Sedán · 4 pasajeros', bags:'1 maleta mediana y 1 mochila por pasajero', feats:['Aire acondicionado','Cinturón en cada asiento','Cargador USB','GPS de la unidad'] },
  camioneta:{ label:'Camioneta', seats:6, price:50, layout:[['D',1],[2,3,4],[5,6]], desc:'SUV 7 plazas · 6 pasajeros', bags:'1 maleta grande y 1 mochila por pasajero', feats:['Aire acondicionado','Cinturón en cada asiento','Cargador USB','Más espacio para piernas'] },
  minivan:{ label:'Minivan', seats:8, price:40, layout:[['D',1,2],[3,4,5],[6,7,8]], desc:'Van · 8 pasajeros', bags:'1 maleta mediana y 1 mochila por pasajero', feats:['Aire acondicionado','Cinturón en cada asiento','Cargador USB','Ideal para grupos y familias'] }
};
const SPECIAL = [{md:'07-28',n:'Fiestas Patrias'},{md:'07-29',n:'Fiestas Patrias'},{md:'10-31',n:'Día de la Canción Criolla'},{md:'11-01',n:'Día de Todos los Santos'},{md:'12-24',n:'Nochebuena'},{md:'12-25',n:'Navidad'},{md:'12-31',n:'Fin de año'},{md:'01-01',n:'Año Nuevo'}];
const RATE_TAGS = ['Puntual','Manejo seguro','Vehículo limpio','Amable','Respetó la ruta','Buen trato al equipaje'];
const BAD_TAGS = ['Exceso de velocidad','Se desvió de la ruta','Me cobró extra','Placa distinta a la app'];

function promoFor(t, full){
  const list = [];
  if (daysFromToday(t.date) >= 2) list.push({ k:'ant', name:'Reserva anticipada', pct:10 });
  const sp = SPECIAL.find(x => x.md === t.date.slice(5)); if (sp) list.push({ k:'esp', name:sp.n, pct:10 });
  const h = +t.time.slice(0,2); if (h >= 10 && h < 15) list.push({ k:'val', name:'Horario valle', pct:10 });
  if (full) list.push({ k:'full', name:'Vehículo completo', pct:15 });
  list.sort((a,b) => b.pct - a.pct);
  return list[0] || null;
}
function nextSpecial(){
  const today = new Date(); const y = today.getFullYear();
  const all = SPECIAL.map(s => { let d = new Date(y, +s.md.slice(0,2)-1, +s.md.slice(3)); if (d < parseYmd(ymd(today))) d = new Date(y+1, d.getMonth(), d.getDate()); return { d, n:s.n }; }).sort((a,b) => a.d - b.d);
  return all[0];
}

/* =========================================================
   Estado y API: todo lo importante vive en el servidor (Neon).
   Aquí solo se guardan preferencias de pantalla en este navegador.
   ========================================================= */
const KEY = 'vipRutaSegura.v4';
try{ localStorage.removeItem('vipRutaSegura.v3'); }catch(e){}   // la demo antigua guardaba contraseñas en claro
function DEF(){ return { role:null, search:{from:'tru', date:ymd(new Date()), type:'all', pax:1}, seenOnb:false, sharing:null }; }
let S = load();
function load(){ try{ const raw = localStorage.getItem(KEY); if (raw){ const o = Object.assign(DEF(), JSON.parse(raw)); if (daysFromToday(o.search.date) < 0) o.search.date = ymd(new Date()); return o; } }catch(e){} return DEF(); }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }

let ME = null;            // usuario con sesión (GET /api/me)
let F = {};               // valores temporales de formularios
let stack = [];           // historial de pantallas
let hold = { tripId:null, bookingId:null, seats:[], until:0 };
let GEO = null;           // ubicación real del celular, si el navegador la entrega
const DB_ = { trips:{}, drivers:{}, seats:{}, pay:{}, revs:{}, bookings:[], myTrips:[], myInfo:{ today:{pax:0,income:0}, pendingPayments:0 }, man:{}, live:{}, adm:{} };

const P = () => ME;
const C = () => (ME && ME.driver) || null;
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v||'').trim());

async function api(method, path, body){
  let r;
  try{ r = await fetch('/api'+path, { method, credentials:'same-origin', headers: body !== undefined ? { 'Content-Type':'application/json' } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined }); }
  catch(e){ const er = new Error('Sin conexión. Revisa tu internet e inténtalo otra vez.'); er.offline = true; throw er; }
  let j = null; try{ j = await r.json(); }catch(e){}
  if (!r.ok){ const er = new Error((j && j.error) || 'Algo salió mal. Inténtalo otra vez.'); er.status = r.status; er.data = j; throw er; }
  return j;
}
const GET = p => api('GET', p), POST = (p, b) => api('POST', p, b || {}), PUT = (p, b) => api('PUT', p, b);
function fail(e){
  if (e && e.status === 401 && ME){ ME = null; stack = [{ s:'welcome' }]; render(); return toast('Tu sesión terminó. Ingresa otra vez.','bad'); }
  toast(esc((e && e.message) || 'Algo salió mal.'), 'bad');
}
let busy = false;
async function once(fn){ if (busy) return; busy = true; try{ return await fn(); }catch(e){ fail(e); }finally{ busy = false; } }

/* ---------- cachés de lo que llega del servidor */
function cacheDrivers(m){ if (m) Object.assign(DB_.drivers, m); }
function cacheTrips(list){ (list||[]).forEach(t => { DB_.trips[t.id] = t; }); }
function trip(id){ return id ? DB_.trips[id] || null : null; }
function myDriverView(){
  const c = ME.driver;
  return { id:ME.id, name:ME.name, verified:c.status === 'approved', rating:c.rating, reviews:c.reviews, trips:0, since:new Date().getFullYear(), photo:ME.files.selfie, photos:{ ext:c.veh.ext, int:c.veh.int, bag:c.veh.bag }, vtype:c.veh.type, model:c.veh.model, plate:c.veh.plate, color:c.veh.color, lic:c.lic.cat };
}
function driver(id){ return DB_.drivers[id] || (ME && ME.driver && id === ME.id ? myDriverView() : { id, name:'Conductor', verified:false, photos:{}, lic:'—', color:'#ECEEF1', model:'', plate:'' }); }
function driverFor(t){ const d = driver(t.driverId); return Object.assign({}, d, { model:t.model || d.model, plate:t.plate || d.plate, color:t.color || d.color, vtype:t.vtype }); }
const ratingTxt = id => { const d = id === 'me' ? { rating: C() && C().rating } : driver(id); return d.rating == null ? 'Nuevo' : Number(d.rating).toFixed(1); };
function seatInfo(t){ return DB_.seats[t.id] || { occupied:[], mine:[], holding:[], holdUntil:null }; }
const takenCount = t => { const s = DB_.seats[t.id]; return s ? s.occupied.length : (t.taken || 0); };
const freeCount = t => Math.max(0, t.seats - takenCount(t));
function setSeatState(t, st){ DB_.seats[t.id] = st; }

function homeOf(role){ return role === 'admin' ? 'a_home' : role === 'conductor' ? 'd_home' : 'p_home'; }

/* =========================================================
   Ilustraciones (vehículos y personas)
   ========================================================= */
function vehSVG(type, color, opt){
  opt = opt || {};
  color = color || '#ECEEF1';
  const dark = ['#3A3F48','#2B4A7A','#B8372F'].indexOf(color) >= 0;
  const stroke = dark ? 'rgba(0,0,0,.35)' : 'rgba(22,24,29,.35)';
  const glass = '#BFD5E4';
  const wheel = (cx,cy,r) => '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="#23262D"/><circle cx="'+cx+'" cy="'+cy+'" r="'+(r*.48)+'" fill="#C9CDD4"/><circle cx="'+cx+'" cy="'+cy+'" r="'+(r*.16)+'" fill="#23262D"/>';
  let body = '';
  if (type === 'auto'){
    body = '<path d="M14 64C14 54 20 50 30 49L64 46 86 28C90 25 95 24 100 24H140C147 24 152 26 157 31L174 47 196 51C204 53 208 57 208 64V68C208 71 206 72 203 72H18C15 72 14 71 14 68Z" fill="'+color+'" stroke="'+stroke+'" stroke-width="1.5"/>'+
      '<path d="M90 31L121 30V45L72 46Z" fill="'+glass+'"/><path d="M127 30H146L165 45H127Z" fill="'+glass+'"/>'+
      '<path d="M18 59H202" stroke="#F2B705" stroke-width="3"/><path d="M124 47V68" stroke="'+stroke+'"/><rect x="197" y="54" width="9" height="4" rx="2" fill="#FFE08A"/><rect x="14" y="54" width="6" height="5" rx="1.5" fill="#E0523F"/>'+
      wheel(58,72,14)+wheel(168,72,14);
  } else if (type === 'camioneta'){
    body = '<path d="M12 68V44C12 40 15 38 19 38L44 36 62 16C65 13 69 12 74 12H150C156 12 160 14 163 19L178 38 200 42C206 43 209 47 209 53V68C209 71 207 73 204 73H17C14 73 12 71 12 68Z" fill="'+color+'" stroke="'+stroke+'" stroke-width="1.5"/>'+
      '<path d="M66 18H98V36H48Z" fill="'+glass+'"/><path d="M104 18H132V36H104Z" fill="'+glass+'"/><path d="M138 18H152L168 36H138Z" fill="'+glass+'"/>'+
      '<rect x="70" y="8" width="80" height="3.5" rx="1.5" fill="#23262D"/><path d="M16 56H205" stroke="#F2B705" stroke-width="3"/><path d="M101 38V68M135 38V68" stroke="'+stroke+'"/>'+
      '<rect x="199" y="47" width="9" height="5" rx="2" fill="#FFE08A"/><rect x="12" y="46" width="5" height="7" rx="1.5" fill="#E0523F"/>'+
      wheel(52,73,15)+wheel(170,73,15);
  } else {
    body = '<path d="M10 69V22C10 15 14 12 21 12H148C155 12 159 14 163 19L186 42C200 44 210 48 210 56V69C210 72 208 74 205 74H15C12 74 10 72 10 69Z" fill="'+color+'" stroke="'+stroke+'" stroke-width="1.5"/>'+
      '<path d="M16 19H48V38H16Z" fill="'+glass+'"/><path d="M54 19H96V38H54Z" fill="'+glass+'"/><path d="M102 19H140V38H102Z" fill="'+glass+'"/><path d="M146 19H157L177 40H146Z" fill="'+glass+'"/>'+
      '<path d="M14 54H206" stroke="#F2B705" stroke-width="3"/><path d="M99 40V70" stroke="'+stroke+'"/><rect x="200" y="50" width="8" height="5" rx="2" fill="#FFE08A"/><rect x="10" y="46" width="5" height="8" rx="1.5" fill="#E0523F"/>'+
      wheel(50,74,14)+wheel(172,74,14);
  }
  const shadow = '<ellipse cx="110" cy="86" rx="96" ry="4" fill="rgba(22,24,29,.12)"/>';
  const attrs = opt.attrs || '';
  return '<svg class="veh" viewBox="0 0 220 92" '+attrs+' role="img" aria-label="'+esc(VT[type] ? VT[type].label : 'Vehículo')+'">'+shadow+body+'</svg>';
}
const SKIN = ['#C68B59','#8D5524','#E0AC69','#B57A4B','#D9A27A','#A86B3C'];
const HAIR = ['#1E1A17','#2B1D14','#3B2A1E','#121212','#4A3326'];
const SHIRT = ['#23262D','#1F5FD1','#0F7D53','#8E6200','#5B4BC4','#C2352B'];
const BGS = ['#FFF3C7','#E6EDFC','#E1F4EA','#FCE9E7','#EEF0F3','#F3E8FF'];
function avatarSVG(p, size){
  size = size || 44;
  const skin = SKIN[(p.skin||0)%SKIN.length], hair = HAIR[(p.hair||0)%HAIR.length], shirt = SHIRT[(p.shirt != null ? p.shirt : hash(p.name||'x'))%SHIRT.length], bg = BGS[hash(p.name||'a')%BGS.length];
  const back = p.long ? '<path d="M17 32Q15 12 32 12Q49 12 47 32V47Q42 44 42 30Q34 22 24 25Q22 32 22 47Q17 44 17 32Z" fill="'+hair+'"/>' : '';
  const front = p.long ? '<path d="M20 28Q20 14 32 14Q44 14 45 27Q38 19 26 22Q23 24 20 28Z" fill="'+hair+'"/>' : '<path d="M20 27Q20 13 32 13Q44 13 44 27Q41 19 32 19Q24 19 20 27Z" fill="'+hair+'"/>';
  return '<svg class="avatar" width="'+size+'" height="'+size+'" viewBox="0 0 64 64" role="img" aria-label="'+esc(p.name||'Foto')+'"><circle cx="32" cy="32" r="32" fill="'+bg+'"/>'+back+'<path d="M10 64Q12 45 32 44Q52 45 54 64Z" fill="'+shirt+'"/><rect x="28" y="36" width="8" height="9" rx="3" fill="'+skin+'"/><circle cx="32" cy="28" r="12" fill="'+skin+'"/>'+front+'</svg>';
}
function verBadge(d){ return d.verified ? '<span class="bdg ok">'+ic('check',12)+'Verificado</span>' : '<span class="bdg gold">En revisión</span>'; }

function heroScene(){
  return '<svg viewBox="0 0 360 190" role="img" aria-label="Minivan VIP en la Panamericana Norte rumbo a Chiclayo">'+
    '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4CF"/><stop offset="1" stop-color="#FFFDF6"/></linearGradient></defs>'+
    '<rect width="360" height="190" fill="url(#sky)"/>'+
    '<circle cx="292" cy="46" r="22" fill="#F2B705" opacity=".9"/><circle cx="292" cy="46" r="34" fill="#F2B705" opacity=".14"/>'+
    '<path d="M0 118Q50 92 110 108T230 100T360 106V190H0Z" fill="#EADBB8"/>'+
    '<path d="M0 126Q70 110 150 122T300 114T360 120V190H0Z" fill="#E2CC9C"/>'+
    '<path d="M58 118V96M58 104L50 98M58 101L66 95" stroke="#7E9B6C" stroke-width="3" stroke-linecap="round"/>'+
    '<g transform="translate(300 86)"><rect x="-2" y="18" width="4" height="40" fill="#23262D"/><rect x="-36" y="0" width="72" height="24" rx="4" fill="#23262D"/><text x="0" y="16" text-anchor="middle" font-family="Archivo, sans-serif" font-weight="800" font-size="11" fill="#F2B705" style="font-stretch:115%">CHICLAYO →</text></g>'+
    '<rect x="0" y="146" width="360" height="30" fill="#2A2E36"/><rect x="0" y="146" width="360" height="3" fill="#F2B705"/><rect x="0" y="173" width="360" height="3" fill="#F2B705"/>'+
    '<path class="dash-move" d="M-40 161H400" stroke="#FFFFFF" stroke-width="2.5" stroke-dasharray="22 18"/>'+
    '<g transform="translate(96 82)">'+vehSVG('minivan','#FFFFFF',{attrs:'width="170" height="71"'})+'</g>'+
    '<g transform="translate(176 46)"><path d="M0 0a11 11 0 0 1 11 11c0 7-11 17-11 17S-11 18-11 11A11 11 0 0 1 0 0z" fill="#23262D"/><circle cx="0" cy="11" r="4" fill="#F2B705"/></g>'+
  '</svg>';
}

/* =========================================================
   Mapa de la ruta (Panamericana Norte)
   ========================================================= */
const MAP = { W:360, H:470, lonW:-80.12, lonE:-78.82, latN:-6.50, latS:-8.36 };
function prj(lat, lon){ return [ (lon - MAP.lonW)/(MAP.lonE - MAP.lonW)*MAP.W, (lat - MAP.latN)/(MAP.latS - MAP.latN)*MAP.H ]; }
const ROUTE = [
  {lat:-8.1040,lon:-79.0300,n:'Trujillo',off:'tru'},{lat:-8.0700,lon:-79.0580},{lat:-7.9700,lon:-79.1250},
  {lat:-7.7917,lon:-79.2233,n:'Chocope'},{lat:-7.7317,lon:-79.3008,n:'Paiján'},{lat:-7.6100,lon:-79.3900},
  {lat:-7.4295,lon:-79.5044,n:'San Pedro de Lloc'},{lat:-7.3000,lon:-79.4800,n:'Ciudad de Dios'},{lat:-7.2270,lon:-79.4290,n:'Chepén'},
  {lat:-7.1200,lon:-79.5100},{lat:-6.9990,lon:-79.6180,n:'Mocupe'},{lat:-6.8640,lon:-79.8190,n:'Reque'},{lat:-6.7700,lon:-79.8405,n:'Chiclayo',off:'chi'}
];
const COAST = [[-6.62,-80.02],[-6.70,-79.99],[-6.77,-79.97],[-6.836,-79.937],[-6.90,-79.89],[-6.94,-79.865],[-7.02,-79.80],[-7.10,-79.73],[-7.17,-79.69],[-7.26,-79.63],[-7.34,-79.588],[-7.40,-79.575],[-7.47,-79.55],[-7.55,-79.51],[-7.62,-79.48],[-7.70,-79.44],[-7.78,-79.39],[-7.86,-79.32],[-7.95,-79.24],[-8.02,-79.17],[-8.08,-79.12],[-8.13,-79.06],[-8.18,-79.02],[-8.225,-78.985],[-8.32,-78.90]];
const PORTS = [{n:'Pimentel',lat:-6.836,lon:-79.937},{n:'Puerto Eten',lat:-6.94,lon:-79.865},{n:'Pacasmayo',lat:-7.40,lon:-79.575},{n:'Puerto Malabrigo',lat:-7.70,lon:-79.44},{n:'Huanchaco',lat:-8.08,lon:-79.12}];
const PTS = ROUTE.map(r => prj(r.lat, r.lon));
const CUM = [0]; for (let i=1;i<PTS.length;i++){ CUM.push(CUM[i-1] + Math.hypot(PTS[i][0]-PTS[i-1][0], PTS[i][1]-PTS[i-1][1])); }
const TOTAL = CUM[CUM.length-1];
function hav(a,b){ const R=6371, toR=x=>x*Math.PI/180; const dLat=toR(b.lat-a.lat), dLon=toR(b.lon-a.lon); const h=Math.sin(dLat/2)**2+Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
let ROUTE_KM = 0; for (let i=1;i<ROUTE.length;i++) ROUTE_KM += hav(ROUTE[i-1], ROUTE[i]); ROUTE_KM = Math.round(ROUTE_KM * 1.07);
function along(q){
  q = Math.max(0, Math.min(1, q)); const target = q * TOTAL; let i = 0;
  while (i < CUM.length-2 && CUM[i+1] < target) i++;
  const seg = (CUM[i+1]-CUM[i]) || 1, f = (target - CUM[i]) / seg;
  return { x:PTS[i][0]+(PTS[i+1][0]-PTS[i][0])*f, y:PTS[i][1]+(PTS[i+1][1]-PTS[i][1])*f, i, f, lat:ROUTE[i].lat+(ROUTE[i+1].lat-ROUTE[i].lat)*f, lon:ROUTE[i].lon+(ROUTE[i+1].lon-ROUTE[i].lon)*f };
}

/* ---------- GPS en vivo: la posición viene del celular del conductor */
function avatarOf(d, size){ if (d && d.photo) return '<img class="avatar" src="'+esc(d.photo)+'" width="'+size+'" height="'+size+'" alt="'+esc(d.name||'Foto')+'" style="object-fit:cover">'; return avatarSVG(d || {}, size); }
function avatarMe(size){ if (ME && ME.files && ME.files.selfie) return '<img class="avatar" src="'+esc(ME.files.selfie)+'" width="'+size+'" height="'+size+'" alt="Tu foto" style="object-fit:cover">'; const n = (ME && ME.name) || 'Tú'; return avatarSVG({ name:n, skin:hash(n)%6, hair:hash(n+'h')%5 }, size); }

// Proyecta una coordenada sobre la ruta para saber el avance (0 = Trujillo, 1 = Chiclayo).
function snapRoute(lat, lon){
  const p = prj(lat, lon); let best = { d:1e9, i:0, f:0 };
  for (let i = 0; i < PTS.length - 1; i++){
    const ax = PTS[i][0], ay = PTS[i][1], bx = PTS[i+1][0], by = PTS[i+1][1]; const dx = bx - ax, dy = by - ay; const l2 = dx*dx + dy*dy || 1;
    const f = Math.max(0, Math.min(1, ((p[0]-ax)*dx + (p[1]-ay)*dy) / l2)); const x = ax + dx*f, y = ay + dy*f; const d = Math.hypot(p[0]-x, p[1]-y);
    if (d < best.d) best = { d, i, f };
  }
  const q = (CUM[best.i] + (CUM[best.i+1] - CUM[best.i]) * best.f) / TOTAL;
  return { x:p[0], y:p[1], i:best.i, f:best.f, q, off:best.d };
}
function liveOf(t){
  const l = DB_.live[t.id] || {}; const run = t.status === 'started', done = t.status === 'finished';
  const pt = l.lat != null ? snapRoute(l.lat, l.lon) : null;
  const q = done ? 1 : pt ? pt.q : 0; const p = t.from === 'tru' ? q : 1 - q;
  const stale = l.at ? (Date.now() - new Date(l.at).getTime()) > 120000 : false;
  return { p, run, done, pt, speed:l.speed || 0, at:l.at || null, stale, has:!!pt };
}
function posOf(t){
  const L = liveOf(t);
  if (L.pt) return { x:L.pt.x, y:L.pt.y, i:L.pt.i, f:L.pt.f, lat:DB_.live[t.id].lat, lon:DB_.live[t.id].lon };
  const q = t.from === 'tru' ? 0 : 1; const a = along(q); return { x:a.x, y:a.y, i:a.i, f:a.f, lat:a.lat, lon:a.lon };
}
function nextTown(t){
  const L = liveOf(t); const q = t.from === 'tru' ? L.p : 1 - L.p; const target = q*TOTAL;
  const named = ROUTE.map((r,i) => ({ r, d:CUM[i] })).filter(o => o.r.n);
  if (t.from === 'tru'){ const n = named.find(o => o.d > target + 0.5); return n ? n.r.n : 'Chiclayo'; }
  const rev = named.slice().reverse(); const n = rev.find(o => o.d < target - 0.5); return n ? n.r.n : 'Trujillo';
}
function speedNow(t){ const L = liveOf(t); return L.run && !L.stale ? Math.round(L.speed) : 0; }

function mapSVG(t, follow){
  const L = liveOf(t); const pos = posOf(t);
  let s = 1, tx = 0, ty = 0;
  if (follow){ s = 2.7; tx = MAP.W/2 - pos.x*s; ty = MAP.H*0.48 - pos.y*s; }
  const T = (x,y) => (x*s+tx).toFixed(1)+','+(y*s+ty).toFixed(1);
  const TL = (lat,lon) => { const p = prj(lat,lon); return T(p[0],p[1]); };
  const XY = (lat,lon) => { const p = prj(lat,lon); return [p[0]*s+tx, p[1]*s+ty]; };
  let o = '<svg viewBox="0 0 '+MAP.W+' '+MAP.H+'" role="img" aria-label="Mapa de la ruta Trujillo – Chiclayo con la posición del vehículo">';
  o += '<rect width="'+MAP.W+'" height="'+MAP.H+'" fill="#F3F1EA"/>';
  // dunas suaves
  [[-7.15,-79.62,40],[-7.62,-79.30,46],[-6.95,-79.55,34],[-7.95,-79.05,30]].forEach(d => { const c = XY(d[0],d[1]); o += '<ellipse cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" rx="'+(d[2]*s)+'" ry="'+(d[2]*.45*s)+'" fill="#EADBB8" opacity=".55"/>'; });
  // graticula
  if (!follow){
    [-7,-7.5,-8].forEach(lat => { const y = prj(lat,-79)[1]; o += '<path d="M0 '+y.toFixed(1)+'H'+MAP.W+'" stroke="#16181D" stroke-opacity=".07" stroke-dasharray="3 4"/><text x="'+(MAP.W-6)+'" y="'+(y-4).toFixed(1)+'" text-anchor="end" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="#757B87">'+Math.abs(lat).toFixed(1).replace('.0','')+'°S</text>'; });
    [-79.5,-79].forEach(lon => { const x = prj(-7,lon)[0]; o += '<path d="M'+x.toFixed(1)+' 0V'+MAP.H+'" stroke="#16181D" stroke-opacity=".07" stroke-dasharray="3 4"/><text x="'+(x+4).toFixed(1)+'" y="'+(MAP.H-8)+'" font-size="8.5" font-family="IBM Plex Mono, monospace" fill="#757B87">'+Math.abs(lon).toFixed(1).replace('.0','')+'°O</text>'; });
  }
  // océano
  const ocean = COAST.map(c => TL(c[0],c[1])).concat([TL(-8.6,-78.9), TL(-8.6,-80.6), TL(-6.3,-80.6), TL(-6.3,-80.02)]).join(' ');
  o += '<polygon points="'+ocean+'" fill="#D5E7F2"/>';
  o += '<polyline points="'+COAST.map(c => TL(c[0],c[1])).join(' ')+'" fill="none" stroke="#A9CDE3" stroke-width="2"/>';
  if (!follow){ const oc = XY(-7.55,-79.86); o += '<text x="'+oc[0].toFixed(1)+'" y="'+oc[1].toFixed(1)+'" transform="rotate(-62 '+oc[0].toFixed(1)+' '+oc[1].toFixed(1)+')" text-anchor="middle" font-size="11" font-style="italic" letter-spacing="3" fill="#6E98B3" font-family="Figtree, sans-serif">OCÉANO PACÍFICO</text>'; }
  PORTS.forEach(p => { const c = XY(p.lat,p.lon); o += '<circle cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" r="2.4" fill="#fff" stroke="#6E98B3" stroke-width="1.3"/><text x="'+(c[0]-5).toFixed(1)+'" y="'+(c[1]+3).toFixed(1)+'" text-anchor="end" font-size="8.5" font-style="italic" fill="#5D88A3" font-family="Figtree, sans-serif" stroke="#D5E7F2" stroke-width="2.5" paint-order="stroke">'+p.n+'</text>'; });
  // ruta
  const all = PTS.map(p => T(p[0],p[1])).join(' ');
  o += '<polyline points="'+all+'" fill="none" stroke="#2A2E36" stroke-width="'+(follow?9:7)+'" stroke-linecap="round" stroke-linejoin="round"/>';
  o += '<polyline points="'+all+'" fill="none" stroke="#FFFFFF" stroke-width="1.1" stroke-dasharray="5 5" stroke-linejoin="round"/>';
  // tramo recorrido
  let done = [];
  if (t.from === 'tru'){ done = PTS.slice(0, pos.i+1).concat([[pos.x,pos.y]]); }
  else { done = [[pos.x,pos.y]].concat(PTS.slice(pos.i+1)); }
  if (L.p > 0.001) o += '<polyline points="'+done.map(p => T(p[0],p[1])).join(' ')+'" fill="none" stroke="#F2B705" stroke-width="'+(follow?5:4)+'" stroke-linecap="round" stroke-linejoin="round"/>';
  // pueblos
  ROUTE.forEach((r,i) => {
    if (!r.n) return; const p = PTS[i]; const x = p[0]*s+tx, y = p[1]*s+ty;
    if (r.off){
      const label = OFF[r.off].name;
      o += '<g transform="translate('+x.toFixed(1)+' '+y.toFixed(1)+')"><path d="M0 -26a10 10 0 0 1 10 10c0 7-10 16-10 16S-10 -9-10 -16a10 10 0 0 1 10-10z" fill="#23262D"/><circle cx="0" cy="-16" r="4" fill="#F2B705"/></g>';
      const lft = r.off === 'tru'; o += '<text x="'+(lft ? x-14 : x+14).toFixed(1)+'" y="'+(y-12).toFixed(1)+'" text-anchor="'+(lft?'end':'start')+'" font-size="11" font-weight="800" fill="#16181D" font-family="Figtree, sans-serif" stroke="#F3F1EA" stroke-width="3" paint-order="stroke">'+label+'</text>';
    } else {
      o += '<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="3.6" fill="#fff" stroke="#2A2E36" stroke-width="2"/>';
      o += '<text x="'+(x+8).toFixed(1)+'" y="'+(y+3.5).toFixed(1)+'" font-size="10" font-weight="700" fill="#454B57" font-family="Figtree, sans-serif" stroke="#F3F1EA" stroke-width="3" paint-order="stroke">'+r.n+'</text>';
    }
  });
  // pasajero (GPS del celular) si está dentro del mapa
  if (GEO && GEO.lat < MAP.latN && GEO.lat > MAP.latS && GEO.lon > MAP.lonW && GEO.lon < MAP.lonE){
    const g = XY(GEO.lat, GEO.lon); o += '<circle cx="'+g[0].toFixed(1)+'" cy="'+g[1].toFixed(1)+'" r="9" fill="#1F5FD1" opacity=".18"/><circle cx="'+g[0].toFixed(1)+'" cy="'+g[1].toFixed(1)+'" r="5" fill="#1F5FD1" stroke="#fff" stroke-width="2"/>';
  }
  // vehículo
  const vx = pos.x*s+tx, vy = pos.y*s+ty; const d = driverFor(t);
  o += '<g transform="translate('+vx.toFixed(1)+' '+vy.toFixed(1)+')">';
  o += '<circle r="19" fill="#F2B705" opacity="'+(L.run?'.28':'.14')+'"/>';
  o += '<circle r="11" fill="#F2B705" stroke="#16181D" stroke-width="2.5"/><path d="M-5 2.5V-.5l1.6-3.5h6.8L5-.5v3z" fill="#16181D"/><circle cx="-2.6" cy="3.6" r="1.4" fill="#16181D"/><circle cx="2.6" cy="3.6" r="1.4" fill="#16181D"/>';
  const pw = d.plate.length*7.4+16; o += '<g transform="translate('+(vx > MAP.W - pw - 24 ? -15 - pw : 15)+' -26)"><rect width="'+pw+'" height="20" rx="6" fill="#16181D"/><text x="8" y="14" font-size="11" font-family="IBM Plex Mono, monospace" font-weight="600" fill="#F2B705">'+esc(d.plate)+'</text></g></g>';
  // norte y escala
  o += '<g transform="translate('+(MAP.W-30)+' 76)"><circle r="13" fill="#fff" stroke="#E1E4E9"/><path d="M0 -8L4 4 0 1.5-4 4z" fill="#16181D"/><text y="-15" text-anchor="middle" font-size="9" font-weight="800" fill="#16181D" font-family="Figtree, sans-serif"></text></g><text x="'+(MAP.W-30)+'" y="104" text-anchor="middle" font-size="9" font-weight="800" fill="#16181D" font-family="Figtree, sans-serif">N</text>';
  const pxKm = MAP.H/((MAP.latN-MAP.latS)*111)*s; const km = follow ? 5 : 20; const w = pxKm*km;
  o += '<g transform="translate(14 '+(MAP.H-22)+')"><rect x="-4" y="-12" width="'+(w+44)+'" height="22" rx="6" fill="#fff" opacity=".9"/><path d="M0 0H'+w.toFixed(1)+'" stroke="#16181D" stroke-width="3"/><path d="M0 -4V4M'+w.toFixed(1)+' -4V4" stroke="#16181D" stroke-width="1.5"/><text x="'+(w+6).toFixed(1)+'" y="4" font-size="9.5" font-weight="700" font-family="IBM Plex Mono, monospace" fill="#16181D">'+km+' km</text></g>';
  o += '</svg>';
  return o;
}
/* =========================================================
   Componentes
   ========================================================= */
function top(title, opt){
  opt = opt || {};
  const back = opt.back === false ? '<span class="ib-sp"></span>' : '<button class="ib" data-act="back" aria-label="Volver">'+ic('back',22)+'</button>';
  return '<header class="top">'+back+'<h1>'+title+(opt.sub ? '<span class="sub">'+opt.sub+'</span>' : '')+'</h1>'+(opt.right || '<span class="ib-sp"></span>')+'</header>';
}
const chip = (label, on, act, arg) => '<button class="chip" aria-pressed="'+(!!on)+'" data-act="'+act+'" data-arg="'+esc(arg)+'">'+label+'</button>';
function field(id, label, opt){
  opt = opt || {};
  const v = F[id] != null ? F[id] : (opt.value || '');
  return '<div class="fld"><label for="f-'+id+'">'+label+'</label><input id="f-'+id+'" data-f="'+id+'" type="'+(opt.type||'text')+'" value="'+esc(v)+'"'+(opt.ph?' placeholder="'+esc(opt.ph)+'"':'')+(opt.mode?' inputmode="'+opt.mode+'"':'')+(opt.max?' maxlength="'+opt.max+'"':'')+(opt.auto?' autocomplete="'+opt.auto+'"':'')+(opt.ro?' readonly':'')+'>'+(opt.hint?'<span class="hint" id="h-'+id+'">'+opt.hint+'</span>':'')+'</div>';
}

function navBar(cur){
  const items = S.role === 'admin'
    ? [['a_home','Resumen','home'],['a_review','Revisión','shield'],['a_users','Usuarios','users'],['a_ops','Operación','route']]
    : S.role === 'conductor'
    ? [['d_home','Panel','home'],['d_manifest','Pasajeros','users'],['d_live','En ruta','live'],['d_profile','Perfil','user']]
    : [['p_home','Inicio','home'],['p_trips','Mis viajes','ticket'],['p_live','En vivo','live'],['p_profile','Perfil','user']];
  return '<nav class="nav" aria-label="Navegación principal">'+items.map(it => '<button data-act="tab" data-arg="'+it[0]+'"'+(it[0]===cur?' aria-current="page"':'')+'><span class="ni">'+ic(it[2],21)+'</span>'+it[1]+'</button>').join('')+'</nav>';
}
const TABS = ['p_home','p_trips','p_live','p_profile','d_home','d_manifest','d_live','d_profile','a_home','a_review','a_users','a_ops'];
function seatMap(t, interactive){
  const v = VT[t.vtype]; const si = seatInfo(t);
  const rows = v.layout.map(row => '<div class="crow">'+row.map(n => {
    if (n === 'D') return '<span class="seat drv" aria-label="Conductor">'+ic('wheel',24)+'<small>Chofer</small></span>';
    if (n > t.seats) return '<span class="seat na" aria-label="Asiento '+n+' no disponible"><b>'+n+'</b><small>No va</small></span>';
    let cls = 'free', lab = 'Libre';
    if (si.holding.indexOf(n) >= 0){ cls = 'sel'; lab = 'Elegido'; }
    else if (si.mine.indexOf(n) >= 0){ cls = 'mine'; lab = 'Tuyo'; }
    else if (si.occupied.indexOf(n) >= 0){ cls = 'taken'; lab = 'Ocupado'; }
    if (!interactive) return '<span class="seat '+cls+'"><b>'+n+'</b><small>'+lab+'</small></span>';
    return '<button class="seat '+cls+'" data-act="seat" data-arg="'+n+'" aria-pressed="'+(cls==='sel')+'" aria-label="Asiento '+n+', '+lab+'"><b>'+n+'</b><small>'+lab+'</small></button>';
  }).join('')+'</div>').join('');
  return '<div class="cabin">'+rows+'</div>';
}

function legend(){ return '<div class="legend"><span><i style="border-color:var(--ok)"></i>Libre</span><span><i style="border-color:var(--ink);background:var(--gold)"></i>Elegido</span><span><i style="border-color:#D3D6DC;background:#EEF0F3"></i>Ocupado</span><span><i style="border-color:var(--info);background:var(--info-soft)"></i>Tuyo</span></div>'; }

function tripCard(t){
  const d = driverFor(t), v = VT[t.vtype]; const free = t.free;
  const gone = depDate(t) < nowSim() || t.status !== 'active'; const full = free === 0; const dis = gone || full;
  const pr = promoFor(t, false); const unit = t.price, fin = pr ? unit*(1-pr.pct/100) : unit;
  const bars = Array.from({length:t.seats}, (_,i) => '<i class="'+(i < free ? 'f' : '')+'"></i>').join('');
  return '<button class="tc" '+(dis?'disabled':'data-act="open" data-arg="'+esc(t.id)+'"')+' aria-label="Salida '+t.time+', '+v.label+', '+free+' asientos libres, '+soles(fin)+'">'+
    (pr && !dis ? '<span class="ptag">'+ic('tag',13)+pr.name+' −'+pr.pct+'%</span>' : '')+
    '<span><span class="times"><span>'+t.time+'</span><i></i><span class="dur">3 h 20</span><i></i><span>'+addMin(t.time,TRIP_MIN)+'</span></span><span class="price">'+(pr?'<s>'+soles(unit)+'</s>':'')+'<b>'+soles(fin)+'</b></span></span>'+
    '<span><span class="vm">'+vehSVG(t.vtype, d.color)+'</span><span class="vinfo"><b>'+v.label+' · '+esc(d.model)+'</b><span class="plate">'+esc(d.plate)+'</span><small class="muted">'+v.desc+'</small></span></span>'+
    '<span class="bot"><span class="drv">'+avatarOf(d,36)+'<span><b>'+esc(shortName(d.name))+'</b><span style="display:flex;gap:6px;align-items:center">'+verBadge(d)+'<span class="stars">'+starI(12)+ratingTxt(d.id)+'</span></span></span></span>'+
    '<span class="seatsleft '+(free<=2?'low':'')+'">'+(gone?'Ya salió':full?'Lleno':free+' de '+t.seats+' libres')+(dis?'':'<span class="mb">'+bars+'</span>')+'</span></span>'+
  '</button>';
}

/* =========================================================
   Pantallas
   ========================================================= */
const SCREENS = {};
const AFTER = {};

SCREENS.splash = () => '<div class="splash">'+mark(96)+'<div style="text-align:center"><div style="font-family:var(--f-display);font-stretch:120%;font-weight:900;font-size:26px">Ruta segura</div></div><p>Trujillo ⇄ Chiclayo</p><div class="road-load" aria-hidden="true"></div></div>';

const CHANGES = [
  { src:'Sprint Review · 08-10-26', fb:'Los botones INGRESAR no llevaban a ninguna pantalla.', ch:'Entrada por perfil con tarjetas y la app recuerda tu perfil.', go:'welcome' },
  { src:'Prueba PVIP-01', fb:'Mucho texto, colores oscuros y botones de más.', ch:'Diseño claro, menos texto y una acción principal por pantalla.', go:'landing' },
  { src:'Sprint Review · 08-10-26', fb:'El asiento no se guardaba y podía repetirse.', ch:'Asientos por colores, aviso si está ocupado y disponibilidad que baja al reservar.', go:'seats' },
  { src:'Prueba PVIP-01', fb:'Lo más difícil fue ingresar como conductor.', ch:'Registro de 3 datos y verificación por pasos, sin trabar el ingreso.', go:'d_verif' },
  { src:'Sprint Review · 08-10-26', fb:'Cada chofer debe tener su panel y la regla de 15 minutos.', ch:'Panel del conductor con ventas en vivo y el asiento se libera solo a los 20 min.', go:'d_manifest' },
  { src:'Grupo 02 · 15-10-26', fb:'Faltan filtros de verificación de pasajeros y conductores.', ch:'Insignias de verificación en ambos perfiles (DNI, licencia, SOAT, antecedentes).', go:'trip' },
  { src:'Grupo 01', fb:'Ver fotos del interior de la camioneta antes de reservar.', ch:'Sección «Conoce tu vehículo»: exterior, interior y maletera.', go:'trip' },
  { src:'Grupo 02 y Grupo 03', fb:'Precios muy estables, faltan promociones.', ch:'Descuentos por anticipación, horario valle, fechas especiales y vehículo completo.', go:'home' },
  { src:'Prueba PVIP-01', fb:'Compartir el viaje en tiempo real y botón SOS (importancia 5).', ch:'GPS del vehículo en el mapa, compartir ubicación y SOS.', go:'live' }
];

SCREENS.landing = () => {
  const ns = nextSpecial();
  return '<header class="top brand">'+logoH(34)+'<button class="btn sm dark" data-act="start" data-arg="">Ingresar</button></header>'+
  '<main class="scr land">'+
   '<section class="hero">'+
     '<p class="eb">Panamericana Norte · 3 h 20 min</p>'+
     '<h2 class="h-hero">Tu asiento seguro entre Trujillo y Chiclayo.</h2>'+
     '<p class="lead">Reserva en auto, camioneta o minivan con conductores verificados. Sigue el viaje en el mapa y comparte tu ubicación con tu familia.</p>'+
     '<div class="hero-art">'+heroScene()+'</div>'+
     '<div class="cta2"><button class="btn" data-act="start" data-arg="pasajero">'+ic('seat')+'Reservar mi asiento</button><button class="btn line" data-act="start" data-arg="conductor">'+ic('wheel')+'Quiero manejar con VIP</button></div>'+
     '<ul class="trust"><li>'+ic('shield',16)+'Conductores verificados</li><li>'+ic('gps',16)+'GPS en vivo</li><li>'+ic('card',16)+'Yape y Plin</li></ul>'+
   '</section>'+
   '<section><p class="eb">El problema</p><h3 class="h-sec">Viajar entre ciudades no debería darte nervios</h3><p style="color:var(--ink2)">En muchos colectivos no sabes quién maneja, tu asiento no está asegurado y tu familia no sabe por dónde vas. VIP Ruta Segura junta todo en una app: conductor verificado, asiento confirmado y el viaje visible en el mapa.</p></section>'+
   '<section><p class="eb">Cómo funciona</p><h3 class="h-sec">Reservas en menos de 2 minutos</h3><ol class="steps">'+
     '<li><div><b>Elige horario y vehículo</b><span>Salidas desde las 5:30 a. m. en ambas oficinas. Ves la foto del conductor y del vehículo antes de pagar.</span></div></li>'+
     '<li><div><b>Escoge tu asiento y paga</b><span>El mapa de asientos te muestra cuáles están libres. Pagas con Yape o Plin.</span></div></li>'+
     '<li><div><b>Viaja con el GPS encendido</b><span>Ves por dónde va la unidad, compartes tu ubicación y, al llegar, calificas el viaje.</span></div></li>'+
   '</ol></section>'+
   '<section><p class="eb">Seguridad</p><h3 class="h-sec">Filtros para los dos lados del viaje</h3><div class="grid2">'+
     feat('id','Conductor con DNI y licencia','Validamos DNI, licencia A-IIa o superior, SOAT y revisión técnica.')+
     feat('doc','Antecedentes revisados','Cada conductor sube su certificado de antecedentes policiales.')+
     feat('phone','Pasajeros verificados','Celular con código SMS, DNI y selfie. El conductor sabe a quién recoge.')+
     feat('gps','GPS de la unidad','La ruta se ve en vivo durante todo el viaje.')+
     feat('share','Comparte tu viaje','Envía tu ubicación, la placa y el conductor por WhatsApp.')+
     feat('alert','Botón SOS','Alerta a tu contacto de emergencia con tu ubicación.')+
   '</div></section>'+
   '<section><p class="eb">Flota</p><h3 class="h-sec">Solo autos, camionetas y minivans</h3><div class="fleet">'+
     ['auto','camioneta','minivan'].map(k => '<div class="fl">'+vehSVG(k, k==='auto'?'#B9C4D2':k==='camioneta'?'#3A3F48':'#ECEEF1')+'<div><b>'+VT[k].label+'</b><small>'+VT[k].desc+'</small></div><div class="pr"><small>aprox.</small>'+soles(VT[k].price)+'</div></div>').join('')+
   '</div></section>'+
   '<section><p class="eb">Promociones</p><h3 class="h-sec">Paga menos si planificas</h3><div class="hscroll">'+promoCards(ns)+'</div></section>'+
   '<section><p class="eb">Pagos</p><h3 class="h-sec">Paga como ya pagas todos los días</h3><div class="pay-logos"><span class="pm"><i style="background:#742284"></i>Yape</span><span class="pm"><i style="background:#00A5B5"></i>Plin</span></div><p class="hint">Pagas directo al Yape o Plin del conductor y él confirma tu pago: tu asiento queda bloqueado para nadie más.</p></section>'+
   '<section><p class="eb">Oficinas</p><h3 class="h-sec">Sales y llegas a una oficina, no a la pista</h3>'+
     ['tru','chi'].map(k => '<div class="card tight"><div class="off"><span class="oi">'+ic('pin',22)+'</span><div><b>'+OFF[k].name+'</b><small>'+OFF[k].addr+'</small></div><a class="btn xs line" href="'+mapsLink(k)+'" target="_blank" rel="noopener">Cómo llegar</a></div></div>').join('')+
   '</section>'+
   '<section><p class="eb">Lo que nos dijeron en las pruebas</p><h3 class="h-sec">Cada comentario cambió algo de la app</h3><div class="hscroll">'+
     CHANGES.map(c => '<div class="quote"><span class="src">'+c.src+'</span><q>'+c.fb+'</q><span class="fix">'+ic('check',15)+c.ch+'</span></div>').join('')+
   '</div></section>'+
   '<section class="faq"><p class="eb">Preguntas frecuentes</p>'+
     faq('¿Cuánto equipaje puedo llevar?','En auto y minivan, 1 maleta mediana y 1 mochila por pasajero. En camioneta entra 1 maleta grande.')+
     faq('¿Cuánto tiempo me espera el conductor?','Llega 15 minutos antes. El conductor espera como máximo 20 minutos después de la hora de salida; si no llegas, pierdes tu asiento.')+
     faq('¿Cómo sé que el conductor es el correcto?','Antes de subir, compara la foto, el nombre y la placa con los que ves en tu boleto. Si algo no coincide, no subas y repórtalo desde la app.')+
     faq('¿Puedo reservar el vehículo completo?','Sí. Si todos los asientos están libres, reservas la unidad entera con 15 % de descuento.')+
   '</section>'+
   '<section><div class="cta2"><button class="btn" data-act="start" data-arg="pasajero">Empezar ahora</button></div></section>'+
   '<section class="foot"><b>VIP Ruta Segura</b><span>Prototipo V3 · Diseño de Productos Digitales · Laboratorio 07. Equipo: Diaz Huaman, Herrada Moncada y Vargas Garcia.</span><span>El pago va directo al Yape o Plin del conductor y él confirma tu asiento. Tus documentos solo los ve el equipo de VIP.</span></section>'+
  '</main>';
};
function feat(icn, b, s){ return '<div class="feat"><span class="fi">'+ic(icn,19)+'</span><b>'+b+'</b><span>'+s+'</span></div>'; }
function faq(q, a){ return '<details><summary>'+q+'</summary><p>'+a+'</p></details>'; }
function promoCards(ns){
  return '<div class="promo"><span class="pct">−10%</span><b>Reserva anticipada</b><span>Compra con 2 días o más de anticipación.</span></div>'+
    '<div class="promo light"><span class="pct">−10%</span><b>Horario valle</b><span>Salidas entre 10:00 a. m. y 3:00 p. m.</span></div>'+
    '<div class="promo"><span class="pct">−15%</span><b>Vehículo completo</b><span>Reserva todos los asientos para tu familia o grupo.</span></div>'+
    '<div class="promo light"><span class="pct">−10%</span><b>'+esc(ns.n)+'</b><span>'+dateLong(ymd(ns.d))+'. También Fiestas Patrias, Navidad y Año Nuevo.</span></div>';
}

/* ---------- inicio guiado: presentación, bienvenida, registro por pasos */
const SLIDES = [
  { icon:'shield', t:'Sabes quién te lleva', d:'Conductores con DNI, licencia y antecedentes revisados.' },
  { icon:'seat', t:'Tu asiento, asegurado', d:'Lo eliges en el mapa y pagas con Yape o Plin.' },
  { icon:'gps', t:'Tu familia te sigue', d:'GPS en vivo, compartes tu ubicación y tienes botón SOS.' }
];
SCREENS.onb = () => {
  const i = F.slide || 0, sl = SLIDES[i], last = i === SLIDES.length - 1;
  return '<div class="onb">'+
    '<div class="onb-top">'+mark(34)+(last ? '<span></span>' : '<button class="link" data-act="onbDone" style="color:var(--muted);text-decoration:none">Saltar</button>')+'</div>'+
    '<div class="onb-mid"><span class="onb-badge">'+ic(sl.icon,58)+'</span><h2 class="h-hero">'+sl.t+'</h2><p class="lead">'+sl.d+'</p></div>'+
    '<div class="onb-bot"><div class="dots" aria-label="Paso '+(i+1)+' de '+SLIDES.length+'">'+SLIDES.map((_,k) => '<i class="'+(k===i?'on':'')+'"></i>').join('')+'</div>'+
    '<button class="btn" data-act="onbNext">'+(last ? 'Empezar' : 'Siguiente')+' '+ic('chev',20)+'</button></div>'+
  '</div>';
};
function bigField(id, label, opt){ return field(id, label, opt).replace('<div class="fld">','<div class="fld big">'); }

/* ---------- registro en 4 pasos: DNI (RENIEC) · correo (código) · celular · contraseña */
function regStepValid(){
  const st = F.step || 1;
  if (st === 1) return F.dniToken ? true : /^\d{8}$/.test(F.dni || '');
  if (st === 2) return F.otpSent ? /^\d{6}$/.test(F.otp || '') : isEmail(F.email);
  if (st === 3) return /^9\d{8}$/.test(F.phone || '');
  return (F.pass || '').length >= 6;
}

SCREENS.reg = (p) => {
  if (!F.role) F.role = p.role || 'pasajero';
  const st = F.step || 1, r = F.role;
  const bar = '<div class="segbar" aria-label="Paso '+st+' de 4">'+[1,2,3,4].map(k => '<i class="'+(k<=st?'on':'')+'"></i>').join('')+'</div>';
  let body = '', btn = '';
  if (st === 1){
    body = '<h2 class="h-xl">¿Cuál es tu DNI?</h2><p class="muted">Lo validamos con RENIEC para saber quién eres. Así '+(r==='pasajero'?'tu conductor':'el pasajero')+' puede confiar en ti.</p>'+
      bigField('dni','DNI',{ph:'8 dígitos', mode:'numeric', max:8, ro:!!F.dniToken})+
      (F.dniToken ? '<div class="note ok">'+ic('check',18)+'<span>Hola, <b>'+esc(F.name)+'</b>. Este es el nombre que verán en tu cuenta.</span></div><button class="link" data-act="regChangeDni" style="align-self:flex-start">No soy yo / cambiar DNI</button>' : '');
    btn = F.dniToken ? 'Siguiente: tu correo' : 'Validar mi DNI';
  } else if (st === 2){
    if (!F.otpSent){ body = '<h2 class="h-xl">¿Cuál es tu correo?</h2><p class="muted">Te enviamos un código de 6 dígitos para confirmar que es tuyo.</p>'+bigField('email','Correo',{type:'email', ph:'tucorreo@gmail.com', auto:'email'}); btn = 'Enviarme el código'; }
    else { body = '<h2 class="h-xl">Escribe el código</h2><p class="muted">Lo enviamos a <b>'+esc((F.email||'').trim().toLowerCase())+'</b>. Revisa también tu carpeta de spam. <button class="link" data-act="regChangeEmail">Cambiar correo</button></p>'+bigField('otp','Código de 6 dígitos',{ph:'• • • • • •', mode:'numeric', max:6, auto:'one-time-code'})+'<button class="link" data-act="regSend" style="align-self:flex-start">Reenviar código</button>'; btn = 'Verificar y seguir'; }
  } else if (st === 3){
    body = '<h2 class="h-xl">¿Cuál es tu celular?</h2><p class="muted">Lo usamos para coordinar el viaje'+(r==='conductor'?' con tus pasajeros':' con tu conductor')+'.</p>'+bigField('phone','Celular',{ph:'9XX XXX XXX', mode:'numeric', max:9, auto:'tel'});
    btn = 'Siguiente: tu contraseña';
  } else {
    body = '<h2 class="h-xl">Crea tu contraseña</h2><p class="muted">Mínimo 6 caracteres.</p>'+bigField('pass','Contraseña',{type:F.showPass?'text':'password', ph:'••••••', auto:'new-password'})+
      '<button class="link" data-act="regShowPass" style="align-self:flex-start">'+(F.showPass?'Ocultar':'Mostrar')+' contraseña</button>'+
      '<label class="check"><input type="checkbox" id="f-rem" '+(F.noRemember?'':'checked')+'> Recordar mi cuenta en este celular</label>';
    btn = 'Crear mi cuenta';
  }
  return top(r === 'pasajero' ? 'Cuenta de pasajero' : 'Cuenta de conductor', { sub:'Paso '+st+' de 4' })+
    '<main class="scr reg">'+bar+body+'</main>'+
    '<div class="bar"><button class="btn" id="btn-next" data-act="regNext" '+(regStepValid()?'':'disabled')+'>'+btn+' '+ic('chev',20)+'</button></div>';
};
AFTER.reg = () => { const i = app.querySelector('.reg input:not([readonly])'); if (i && !('ontouchstart' in window)) i.focus(); };
SCREENS.ready = () => {
  const r = S.role;
  return '<div class="onb"><div class="onb-mid" style="align-items:center;text-align:center"><span class="onb-badge ok">'+ic('check',62)+'</span><h2 class="h-hero">Listo, '+esc(firstName(ME.name))+'.</h2>'+
    '<p class="lead">'+(r==='conductor' ? 'Tu correo y tu DNI ya están validados. Para publicar viajes sube tus documentos: el administrador los revisa.' : 'Tu correo y tu DNI ya están validados. Ahora elige tu viaje.')+'</p></div>'+
    '<div class="onb-bot">'+(r!=='conductor' ? '<button class="btn" data-act="tab" data-arg="p_home">Buscar mi viaje '+ic('chev',20)+'</button>' : '<button class="btn" data-act="driverDocs">Subir mis documentos '+ic('chev',20)+'</button><button class="btn line" data-act="tab" data-arg="d_home">Ver mi panel primero</button>')+'</div></div>';
};
SCREENS.login = () => top('Ingresar')+
  '<main class="scr reg"><h2 class="h-xl">Hola de nuevo</h2><p class="muted">Ingresa con tu correo y tu contraseña.</p>'+
    bigField('lemail','Correo',{type:'email', ph:'tucorreo@gmail.com', auto:'email'})+bigField('lpass','Contraseña',{type:'password', ph:'••••••', auto:'current-password'})+
    '<p class="hint err" id="lerr"></p>'+
    '<span class="muted">¿No tienes cuenta? <button class="link" data-act="tab" data-arg="welcome">Créala en 2 minutos</button></span></main>'+
  '<div class="bar"><button class="btn" data-act="doLogin">Ingresar '+ic('chev',20)+'</button></div>';

/* ---------- verificación (selfie y DNI los revisa el administrador) */
function vList(role){
  const a = ME, d = C();
  const l = [
    { k:'email', ic:'chat', t:'Correo', s:'Confirmado con código', done:true, auto:true },
    { k:'dni', ic:'id', t:'DNI', s:'Validado con RENIEC', done:true, auto:true },
    { k:'dni_photo', ic:'id', t:'Foto del DNI', s:'La revisa el administrador', done:!!a.files.dni_photo },
    { k:'selfie', ic:'camera', t:'Selfie', s:'La revisa el administrador', done:!!a.files.selfie }
  ];
  if (role === 'pasajero') l.push({ k:'emerg', ic:'users', t:'Contacto de emergencia', s:'Recibe tu ubicación si activas SOS', done:!!a.emerg.name });
  else if (d){
    l.push({ k:'lic', ic:'card', t:'Licencia de conducir', s:'Categoría A-IIa o superior, con foto', done:!!(d.lic.num && d.lic.file) });
    l.push({ k:'veh', ic:'car', t:'Vehículo y fotos', s:'Placa, modelo, exterior e interior', done:!!(d.veh.model && d.veh.plate && d.veh.ext && d.veh.int) });
    l.push({ k:'soat', ic:'shield', t:'SOAT y revisión técnica', s:'Ambos vigentes, con foto del SOAT', done:!!(d.soat.until && d.soat.file && d.rt) });
    l.push({ k:'ant', ic:'doc', t:'Antecedentes policiales', s:'Certificado en PDF o foto', done:!!d.ant });
    l.push({ k:'pay', ic:'money', t:'Dónde te pagan', s:'Tu número de Yape y/o Plin', done:!!(d.yape || d.plin) });
  }
  return l;
}
function vLevel(role){ const l = vList(role); return { done:l.filter(x => x.done).length, total:l.length }; }
function vStatus(role){ if (role === 'pasajero'){ const s = ME.pax.status; return { st: s === 'none' ? 'draft' : s, note:ME.pax.note }; } const d = C(); return { st:d ? d.status : 'draft', note:d ? d.note : null }; }
const driverOk = () => !!(C() && C().status === 'approved');

SCREENS.verif = (p) => {
  const role = p.role || S.role; const lv = vLevel(role); const steps = vList(role); const done = lv.done === lv.total; const vs = vStatus(role);
  let body = steps.map(st => {
    const k = st.k, ok = st.done, open = F.vopen === k;
    return '<div class="vstep '+(ok?'done':'')+'"><button '+(st.auto?'disabled':'data-act="vopen" data-arg="'+k+'"')+' aria-expanded="'+open+'"><span class="vi">'+ic(ok?'check':st.ic,20)+'</span><span class="vt"><b>'+st.t+'</b><small>'+(ok ? (st.auto ? st.s : 'Guardado · toca para cambiarlo') : st.s)+'</small></span>'+(ok?'<span class="bdg ok">Listo</span>':ic('chev',18))+'</button>'+(open ? '<div class="vb">'+vBody(role,k)+'</div>' : '')+'</div>';
  }).join('');
  let footer = '';
  if (vs.st === 'approved') footer = '<div class="note ok">'+ic('shield',18)+'<span>'+(role==='pasajero' ? 'Cuenta verificada: los conductores verán tu insignia de pasajero confiable.' : 'Tu cuenta está verificada. Ya puedes publicar viajes y los pasajeros verán tu insignia.')+'</span></div>';
  else if (vs.st === 'pending') footer = '<div class="note info">'+ic('clock',18)+'<span><b>En revisión.</b> El administrador revisa tus documentos y te avisamos por correo apenas lo termine.</span></div>';
  else footer = (vs.st === 'rejected' ? '<div class="note bad">'+ic('alert',18)+'<span><b>No pudimos aprobarte.</b> '+esc(vs.note||'')+' Corrige lo que se indica y vuelve a enviar.</span></div>' : '')+
    '<button class="btn dark" data-act="submitReview" data-arg="'+role+'" '+(done?'':'disabled')+'>Enviar a revisión</button>'+(done ? '' : '<p class="hint" style="text-align:center">Completa los pasos de arriba para poder enviar.</p>');
  return top('Verificación', { sub: role==='pasajero'?'Pasajero':'Conductor' })+
  '<main class="scr">'+
    '<div class="card tight"><div class="kv"><b style="text-align:left">'+(vs.st==='approved' ? (role==='pasajero'?'Pasajero confiable':'Conductor verificado') : 'Tu verificación')+'</b><b>'+lv.done+' de '+lv.total+'</b></div><div class="vbar"><i style="width:'+(lv.done/lv.total*100)+'%"></i></div><small class="muted">'+(role==='pasajero'?'Puedes reservar sin esto. La selfie, el DNI y tu contacto de emergencia te dan la insignia de confianza.':'Completa todos los pasos y envíalos: sin la aprobación del administrador no puedes publicar viajes. Tus documentos solo los ve el equipo de VIP.')+'</small></div>'+
    body + footer +
  '</main>';
};
const uplBox = (key, label, hint, img, icon) => '<label class="upl">'+(img && !/\.pdf/.test(img)?'<img src="'+esc(img)+'" alt="'+esc(label)+'">':'<span class="ph">'+ic(icon||'camera',24)+'</span>')+'<span><b style="display:block">'+label+'</b><small class="muted">'+hint+'</small></span><input type="file" accept="'+(key==='ant'||key==='soat'||key==='lic'?'image/*,application/pdf':'image/*')+'"'+(key==='selfie'?' capture="user"':'')+' data-file="'+key+'" aria-label="'+label+'"></label>';
function vBody(role, k){
  const a = ME, c = C();
  if (k === 'dni_photo') return uplBox('dni_photo','Foto de tu DNI','Que se lea el número y se vea tu cara', a.files.dni_photo, 'id');
  if (k === 'selfie') return uplBox('selfie','Tómate una selfie','Con buena luz y sin lentes oscuros', a.files.selfie, 'camera');
  if (k === 'emerg') return '<div class="row2">'+field('ename','Nombre',{ph:'Ej. Mamá', value:a.emerg.name})+field('ephone','Celular',{mode:'numeric', max:9, ph:'9XX XXX XXX', value:a.emerg.phone})+'</div><button class="btn sm dark" data-act="saveEmerg">Guardar contacto</button>';
  if (k === 'lic') return '<div class="row2">'+field('licnum','N.º de licencia',{ph:'Q12345678', max:9, value:c.lic.num})+'<div class="fld"><label for="f-liccat">Categoría</label><select id="f-liccat" data-f="liccat">'+['A-I','A-IIa','A-IIb','A-IIIa','A-IIIb','A-IIIc'].map(x => '<option'+((F.liccat||c.lic.cat)===x?' selected':'')+'>'+x+'</option>').join('')+'</select></div></div>'+uplBox('lic','Foto de la licencia','Por delante, que se lea el número', c.lic.file, 'card')+'<button class="btn sm dark" data-act="saveLic">Guardar licencia</button>';
  if (k === 'veh'){
    const vt = F.vtype || c.veh.type;
    return '<div class="fld"><label>Tipo de vehículo</label><div class="seg">'+['auto','camioneta','minivan'].map(x => '<button data-act="vtypeReg" data-arg="'+x+'" aria-pressed="'+(vt===x)+'">'+VT[x].label+'</button>').join('')+'</div></div>'+
      '<div class="row2">'+field('vmodel','Marca y modelo',{ph:'Ej. Hyundai H-1', value:c.veh.model})+field('vplate','Placa',{ph:'T4B-912', max:7, value:c.veh.plate})+'</div>'+
      uplBox('veh_ext','Foto exterior','Que se vea la placa', c.veh.ext, 'car')+uplBox('veh_int','Foto del interior','Los pasajeros la verán en «Conoce tu vehículo»', c.veh.int, 'seat')+uplBox('veh_bag','Foto de la maletera (opcional)','Ayuda al pasajero a saber qué equipaje entra', c.veh.bag, 'bag')+
      '<button class="btn sm dark" data-act="saveVeh">Guardar vehículo</button>';
  }
  if (k === 'soat') return field('soat','SOAT vigente hasta',{type:'date', value:c.soat.until})+uplBox('soat','Foto del SOAT','PDF o foto', c.soat.file, 'shield')+'<label class="check"><input type="checkbox" id="f-rt" '+(c.rt?'checked':'')+'> Tengo la revisión técnica vigente</label><button class="btn sm dark" data-act="saveSoat">Guardar</button>';
  if (k === 'ant') return uplBox('ant','Certificado de antecedentes','PDF o foto, emitido hace menos de 3 meses', c.ant, 'doc');
  if (k === 'pay') return '<p style="font-size:14px;color:var(--ink2)">Los pasajeros te pagan directo a este número y tú confirmas el pago en la app. Pon al menos uno.</p><div class="row2">'+field('yape','Número de Yape',{mode:'numeric', max:9, ph:'9XX XXX XXX', value:c.yape})+field('plin','Número de Plin',{mode:'numeric', max:9, ph:'9XX XXX XXX', value:c.plin})+'</div><button class="btn sm dark" data-act="savePay">Guardar</button>';
  return '';
}


/* =========================================================
   Cargadores: cada pantalla pide al servidor lo que necesita
   ========================================================= */
const LOAD = {};
async function refreshMe(){
  const r = await GET('/me');
  if (!r.me){ const e = new Error('Tu sesión terminó. Ingresa otra vez.'); e.status = 401; throw e; }
  ME = r.me; return r;
}
async function loadBookings(){ const r = await GET('/bookings'); DB_.bookings = r.bookings; cacheDrivers(r.drivers); cacheTrips(r.bookings.map(b => b.trip)); return r; }
async function loadTripFull(id){
  const r = await GET('/trips/'+encodeURIComponent(id)); cacheTrips([r.trip]); cacheDrivers(r.drivers); DB_.pay[r.trip.id] = r.pay; setSeatState(r.trip, r.seatState); DB_.revs[r.trip.driverId] = r.reviews; return r;
}
const bookingById = id => DB_.bookings.find(b => b.id === id) || null;
function agoTxt(ts){ const m = Math.floor((Date.now() - new Date(ts).getTime())/60000); if (m < 1) return 'ahora'; if (m < 60) return 'hace '+m+' min'; if (m < 1440) return 'hace '+Math.floor(m/60)+' h'; return 'hace '+Math.floor(m/1440)+' d'; }
function revHTML(r){
  return '<div class="rev"><div class="rh"><b>'+esc(r.a||'Pasajero')+'</b><span class="stars">'+Array.from({length:5},(_,i)=>starI(12, i<r.s)).join('')+'</span></div>'+(r.t?'<p>'+esc(r.t)+'</p>':'')+
   '<div class="tags">'+(r.tags||[]).map(x => '<span class="bdg mute">'+esc(x)+'</span>').join('')+'</div><small class="muted">'+(r.at?agoTxt(r.at):'')+'</small></div>';
}
function isFinished(b){
  const t = b.trip; if (b.noShow || ['rechazado','cancelado'].indexOf(b.status) >= 0) return true;
  if (t.status === 'finished' || t.status === 'cancelled') return true;
  return t.status === 'active' && depDate(t).getTime() + (TRIP_MIN+60)*60000 < Date.now();
}
function nextBooking(){
  const up = DB_.bookings.filter(b => (b.status === 'confirmado' || b.status === 'por_confirmar') && !isFinished(b)).sort((a,b) => depDate(a.trip) - depDate(b.trip));
  return up[0] || null;
}
const statusBdg = b => b.noShow ? '<span class="bdg bad">Asiento perdido</span>' : b.status === 'rechazado' ? '<span class="bdg bad">Pago rechazado</span>' : b.status === 'cancelado' ? '<span class="bdg bad">Cancelado</span>' : b.status === 'por_confirmar' ? '<span class="bdg gold">Por confirmar</span>' : isFinished(b) ? '<span class="bdg mute">Finalizado</span>' : '<span class="bdg ok">Confirmado</span>';

/* ---------- inicio pasajero */
LOAD.p_home = async () => { await refreshMe(); return loadBookings(); };
SCREENS.p_home = () => {
  const a = P(), s = S.search, to = s.from === 'tru' ? 'chi' : 'tru';
  const vs = vStatus('pasajero'); const nb = nextBooking(); const ns = nextSpecial();
  const dates = [0,1,2].map(n => addDays(n));
  return '<header class="top brand">'+logoH(32)+'<button class="ib" data-act="tab" data-arg="p_profile" aria-label="Perfil" style="border-radius:50%;overflow:hidden">'+avatarMe(40)+'</button></header>'+
  '<main class="scr">'+
    '<div class="home-hi"><h2 class="h-xl">Hola, '+esc(firstName(a.name))+'.<br><span>¿Cuándo viajas?</span></h2></div>'+
    (nb ? nextCard(nb) : '')+
    '<section class="card search" aria-label="Buscar viaje">'+
      '<div class="od"><div class="od-row"><span class="dot o"></span><div><small>Sales de</small><b>'+OFF[s.from].city+'</b><span>'+OFF[s.from].addr+'</span></div></div><div class="od-row"><span class="dot d"></span><div><small>Llegas a</small><b>'+OFF[to].city+'</b><span>'+OFF[to].addr+'</span></div></div><button class="swap" data-act="swap" aria-label="Invertir origen y destino">'+ic('swap',20)+'</button></div>'+
      '<div><div class="lbl" style="margin-bottom:8px">Fecha</div><div class="chips">'+dates.map(d => chip(dayLabel(d), s.date===d, 'date', d)).join('')+'<label class="chip datepick" '+(dates.indexOf(s.date)<0?'aria-pressed="true" style="background:var(--ink);color:#fff;border-color:var(--ink)"':'')+'>'+ic('cal',16)+'<input type="date" id="date-in" min="'+addDays(0)+'" value="'+s.date+'" aria-label="Elegir otra fecha"></label></div></div>'+
      '<div><div class="lbl" style="margin-bottom:8px">Vehículo</div><div class="chips">'+['all','auto','camioneta','minivan'].map(k => chip(k==='all'?'Todos':VT[k].label, s.type===k, 'vtype', k)).join('')+'</div></div>'+
      '<div class="paxrow"><div><div class="lbl">Pasajeros</div><small class="muted">Puedes elegir varios asientos</small></div><div class="stepper"><button data-act="pax" data-arg="-1" aria-label="Menos pasajeros">−</button><b aria-live="polite">'+s.pax+'</b><button data-act="pax" data-arg="1" aria-label="Más pasajeros">+</button></div></div>'+
      '<button class="btn" data-act="search">'+ic('route')+'Ver horarios disponibles</button>'+
    '</section>'+
    (vs.st !== 'approved' ? '<button class="card tight" data-act="nav" data-arg="verif" style="text-align:left;border-color:#F2D57A;background:#FFFBEA"><div class="off"><span class="oi" style="background:var(--gold);color:var(--ink)">'+ic('shield',22)+'</span><div><b>'+(vs.st==='pending'?'Tu verificación está en revisión':vs.st==='rejected'?'Corrige tu verificación':'Gana la insignia «Pasajero confiable»')+'</b><small>'+(vs.st==='pending'?'El administrador revisa tu selfie y tu DNI.':'Sube tu selfie y tu DNI. Toma 2 minutos.')+'</small></div>'+ic('chev')+'</div></button>' : '')+
    '<div class="sec-h"><h3>Promociones</h3><small class="muted">Se aplican solas</small></div>'+
    '<div class="hscroll">'+promoCards(ns)+'</div>'+
    '<div class="sec-h"><h3>Oficinas</h3></div>'+
    ['tru','chi'].map(k => '<div class="card tight"><div class="off"><span class="oi">'+ic('pin',22)+'</span><div><b>'+OFF[k].name+'</b><small>'+OFF[k].addr+'</small></div><a class="btn xs line" href="'+mapsLink(k)+'" target="_blank" rel="noopener">Mapa</a></div></div>').join('')+
  '</main>';
};
function nextCard(b){
  const t = b.trip, d = driverFor(t); const ms = depDate(t) - nowSim();
  return '<section class="card nextc"><div style="display:flex;justify-content:space-between;align-items:center"><span class="eb">Tu próximo viaje</span><span class="bdg gold" data-dep="'+depDate(t).getTime()+'">'+untilTxt(ms)+'</span></div>'+
    '<div style="display:flex;align-items:center;gap:10px"><b style="font-family:var(--f-display);font-stretch:115%;font-weight:900;font-size:22px">'+OFF[t.from].city+' → '+OFF[t.to].city+'</b></div>'+
    '<div class="kv"><span>'+dayLabel(t.date)+' · '+t.time+'</span><b>Asiento '+b.seats.join(', ')+'</b></div><div class="kv"><span>'+esc(d.model)+(b.status==='por_confirmar'?' · pago por confirmar':'')+'</span><b class="mono">'+esc(d.plate)+'</b></div>'+
    '<div class="actions2"><button class="btn sm" data-act="ticket" data-arg="'+b.id+'">'+ic('ticket',18)+'Boleto</button><button class="btn sm line" style="background:transparent;color:#fff;border-color:#4A505C" data-act="liveB" data-arg="'+b.id+'">'+ic('live',18)+'En vivo</button></div></section>';
}

/* ---------- resultados */
LOAD.p_results = async () => { const s = S.search; const r = await GET('/trips?from='+s.from+'&date='+s.date); cacheTrips(r.trips); cacheDrivers(r.drivers); DB_.results = r.trips.map(t => t.id); return r; };
SCREENS.p_results = () => {
  const s = S.search; const to = s.from === 'tru' ? 'chi' : 'tru';
  const all = (DB_.results || []).map(trip).filter(Boolean); const list = all.filter(t => s.type === 'all' || t.vtype === s.type);
  const avail = list.filter(t => t.status === 'active' && depDate(t) >= nowSim() && t.free > 0);
  return top(OFF[s.from].city+' → '+OFF[to].city, { sub: dateLong(s.date) })+
  '<main class="scr">'+
    '<div class="chips" style="flex-wrap:nowrap;overflow-x:auto;margin-inline:-16px;padding-inline:16px;scrollbar-width:none">'+['all','auto','camioneta','minivan'].map(k => chip(k==='all'?'Todos':VT[k].label, s.type===k, 'vtypeR', k)).join('')+'</div>'+
    '<p class="muted" style="font-size:13.5px"><b style="color:var(--ink)">'+avail.length+' salidas disponibles</b> · Sales de '+OFF[s.from].addr+'</p>'+
    (list.length ? list.map(tripCard).join('') : '<div class="empty"><h3 class="h-sec">'+(all.length ? 'No hay salidas con ese filtro' : 'Todavía no hay salidas publicadas para este día')+'</h3><p>'+(all.length ? '' : 'Prueba con otra fecha o con el sentido contrario.')+'</p>'+(all.length ? '<button class="btn sm line" data-act="vtypeR" data-arg="all">Ver todos los vehículos</button>' : '<button class="btn sm line" data-act="swap2">Probar el otro sentido</button>')+'</div>')+
  '</main>';
};

/* ---------- detalle del viaje */
LOAD.p_trip = p => loadTripFull(p.id);
SCREENS.p_trip = (p) => {
  const t = trip(p.id); if (!t) return top('Viaje')+'<main class="scr"><div class="empty">Este viaje ya no está disponible.</div></main>';
  const d = driverFor(t), v = VT[t.vtype]; const tab = F.vtab || 'ext'; const free = t.free;
  const pr = promoFor(t,false); const unit = t.price, fin = pr ? unit*(1-pr.pct/100) : unit;
  const ph = d.photos || {};
  let gal = '';
  if (tab === 'ext') gal = ph.ext ? '<img src="'+esc(ph.ext)+'" alt="Foto exterior del vehículo">' : vehSVG(t.vtype, d.color);
  else if (tab === 'int') gal = ph.int ? '<img src="'+esc(ph.int)+'" alt="Foto del interior">' : seatMap(t,false);
  else gal = ph.bag ? '<img src="'+esc(ph.bag)+'" alt="Foto de la maletera">' : '<div style="display:flex;gap:14px;align-items:center;padding:8px 4px"><span class="oi" style="width:64px;height:64px;border-radius:18px;background:var(--asphalt);color:var(--gold);display:grid;place-items:center">'+ic('bag',32)+'</span><div><b>Equipaje incluido</b><p style="font-size:14px;color:var(--ink2)">'+v.bags+'. Si llevas algo más grande, avísale al conductor.</p></div></div>';
  const revs = DB_.revs[t.driverId] || [];
  return top(t.time+' · '+v.label, { sub: OFF[t.from].city+' → '+OFF[t.to].city+' · '+dayLabel(t.date) })+
  '<main class="scr">'+
    '<section class="hero-veh"><div class="gal-cap"><span class="eb">Conoce tu vehículo</span><span class="plate">'+esc(d.plate)+'</span></div>'+gal+
      '<div class="seg" role="tablist">'+[['ext','Exterior'],['int','Interior'],['bag','Maletera']].map(x => '<button role="tab" data-act="vtab" data-arg="'+x[0]+'" aria-pressed="'+(tab===x[0])+'">'+x[1]+'</button>').join('')+'</div>'+
      '<div class="amen">'+v.feats.map((f,i) => '<span>'+ic(['snow','belt','bolt','users'][i],16)+f+'</span>').join('')+'</div>'+
      (ph.ext || ph.int ? '' : '<small class="muted">Ilustración de referencia: el conductor aún no subió fotos.</small>')+
    '</section>'+
    '<section class="card"><div class="drvcard">'+avatarOf(d,58)+'<div><b>'+esc(d.name)+'</b><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:3px">'+verBadge(d)+'<span class="stars">'+starI(13)+ratingTxt(d.id)+'</span><small class="muted">'+(d.trips ? d.trips.toLocaleString('es-PE')+' viajes · ' : '')+'desde '+d.since+'</small></div></div></div>'+
      (d.verified ? '<ul class="checks"><li>'+ic('check',15)+'DNI validado</li><li>'+ic('check',15)+'Licencia '+esc(d.lic)+' revisada</li><li>'+ic('check',15)+'SOAT y revisión técnica</li><li>'+ic('check',15)+'Antecedentes revisados</li></ul>' : '')+'</section>'+
    '<section class="card"><h3>Recorrido</h3><div class="timeline">'+
      '<div class="tl-dot"><i></i><em></em></div><div class="tl-t"><b>'+t.time+'</b>'+OFF[t.from].name+'<br><small class="muted">'+OFF[t.from].addr+'</small> · <a href="'+mapsLink(t.from)+'" target="_blank" rel="noopener" style="color:var(--info);font-weight:700;font-size:13px">Cómo llegar</a></div>'+
      '<div class="tl-dot"><i class="g"></i></div><div class="tl-t" style="padding-bottom:0"><b>'+addMin(t.time,TRIP_MIN)+'</b>'+OFF[t.to].name+'<br><small class="muted">'+OFF[t.to].addr+'</small></div>'+
    '</div><div class="note">'+ic('clock',18)+'<span>Llega 15 min antes. El conductor espera como máximo 20 min después de la salida; si no llegas, pierdes el asiento.</span></div></section>'+
    '<section class="card"><div class="sec-h" style="margin:0"><h3>Reseñas</h3><span class="stars">'+starI(14)+ratingTxt(d.id)+' <small class="muted" style="font-weight:600">('+(d.reviews||0)+')</small></span></div>'+
      (revs.length ? revs.map(revHTML).join('') : '<p class="muted" style="font-size:14px">Aún no tiene reseñas. Sé la primera persona en calificarlo.</p>')+
    '</section>'+
  '</main>'+
  '<div class="bar"><div class="tot"><small>'+(pr?pr.name+' −'+pr.pct+'%':'Por asiento')+'</small><b>'+soles(fin)+'</b></div><button class="btn" data-act="toSeats" data-arg="'+esc(t.id)+'" '+(free===0||depDate(t)<nowSim()||t.status!=='active'?'disabled':'')+'>Elegir mi asiento ('+free+' libres)</button></div>';
};

/* ---------- asientos (se guardan en el servidor 10 minutos) */
LOAD.p_seats = async (p) => { const r = await GET('/trips/'+encodeURIComponent(p.id)+'/seats'); cacheTrips([r.trip]); setSeatState(r.trip, r.seatState); syncHold(r.trip); return r; };
function syncHold(t){ const si = seatInfo(t); hold.tripId = t.id; hold.seats = si.holding.slice(); hold.until = si.holdUntil ? Date.parse(si.holdUntil) : 0; hold.bookingId = si.holdId || null; }
function holdTotal(t, sel, others){
  const isFull = others === 0 && sel === t.seats; const pr = promoFor(t, isFull);
  return { isFull, pr, sub:sel*t.price, total: sel * t.price * (pr ? 1 - pr.pct/100 : 1) };
}
SCREENS.p_seats = (p) => {
  const t = trip(p.id); if (!t) return top('Asientos')+'<main class="scr"><div class="empty">Este viaje ya no está disponible.</div></main>';
  const si = seatInfo(t); const sel = si.holding.length; const occ = si.occupied.length; const others = occ - sel;
  const free = t.seats - occ; const ht = holdTotal(t, sel, others); const d = driverFor(t);
  return top('Elige tu asiento', { sub: t.time+' · '+VT[t.vtype].label+' · '+d.plate })+
  '<main class="scr">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div class="occbar" style="flex:1;min-width:160px"><small class="muted" style="font-weight:700"><span id="occtxt">'+free+' libres · '+sel+' elegidos · '+others+' ocupados</span></small><div class="ob"><i style="width:'+(others/t.seats*100)+'%;background:#B7BCC5"></i><i style="width:'+(sel/t.seats*100)+'%;background:var(--gold)"></i></div></div>'+
    (sel ? '<span class="holdchip">'+ic('clock',15)+'Guardado por <b data-hold class="tab">'+mmss(hold.until-Date.now())+'</b></span>' : '')+'</div>'+
    seatMap(t, true)+ legend()+
    (others === 0 && t.seats > 1 ? '<button class="card tight" data-act="fullVeh" style="text-align:left;'+(ht.isFull?'border-color:var(--ink);box-shadow:0 0 0 3px var(--gold)':'')+'"><div class="off"><span class="oi" style="background:var(--gold);color:var(--ink)">'+ic('users',22)+'</span><div><b>'+(ht.isFull?'Vehículo completo reservado':'Reservar el vehículo completo')+'</b><small>Todos los asientos libres: 15 % de descuento para tu grupo.</small></div><span class="bdg gold">−15%</span></div></button>' : '')+
    (S.search.pax > 1 && sel < S.search.pax ? '<div class="note info">'+ic('info',18)+'Buscaste '+S.search.pax+' pasajeros. Te falta elegir '+(S.search.pax - sel)+' asiento'+(S.search.pax-sel>1?'s':'')+'.</div>' : '')+
  '</main>'+
  '<div class="bar"><div class="tot"><small>'+(sel ? 'Asiento'+(sel>1?'s':'')+' '+si.holding.slice().sort((a,b)=>a-b).join(', ')+(ht.pr?' · '+ht.pr.name+' −'+ht.pr.pct+'%':'') : 'Elige un asiento')+'</small><b>'+soles(ht.total)+'</b></div><button class="btn" data-act="toPay" '+(sel?'':'disabled')+'>Ir a pagar '+ic('chev',20)+'</button></div>';
};

/* ---------- pago manual: Yape o Plin directo al conductor */
LOAD.p_pay = async () => { const t = trip(hold.tripId); if (!t) return null; const r = await loadTripFull(t.id); syncHold(r.trip); return r; };
function payMethods(t){ const p = DB_.pay[t.id] || {}; return ['yape','plin'].filter(m => p[m]); }
const fmtPhone = s => String(s||'').replace(/(\d{3})(\d{3})(\d{3})/,'$1 $2 $3');
SCREENS.p_pay = () => {
  const t = trip(hold.tripId); const si = t ? seatInfo(t) : null;
  if (!t || !si.holding.length) return top('Pago')+'<main class="scr"><div class="empty"><h3 class="h-sec">Tu reserva expiró</h3><p>Vuelve a elegir tu asiento.</p><button class="btn sm" data-act="back">Volver</button></div></main>';
  const d = driverFor(t); const ms = payMethods(t); const m = ms.indexOf(F.method) >= 0 ? F.method : ms[0]; F.method = m;
  const ht = holdTotal(t, si.holding.length, si.occupied.length - si.holding.length); const num = (DB_.pay[t.id] || {})[m];
  const label = m === 'yape' ? 'Yape' : 'Plin';
  return top('Pago', { sub: 'Paso final' })+
  '<main class="scr">'+
    '<section class="card tight"><div class="off">'+avatarOf(d,40)+'<div><b>'+OFF[t.from].city+' → '+OFF[t.to].city+'</b><small>'+dateLong(t.date)+' · '+t.time+' · '+esc(d.model)+' <span class="plate">'+esc(d.plate)+'</span></small></div></div><div class="divider"></div>'+
      '<div class="kv"><span>Asiento'+(si.holding.length>1?'s':'')+' '+si.holding.slice().sort((a,b)=>a-b).join(', ')+' × '+soles(t.price)+'</span><b>'+soles(ht.sub)+'</b></div>'+
      (ht.pr ? '<div class="kv"><span style="color:var(--ok);font-weight:700">'+ht.pr.name+' (−'+ht.pr.pct+'%)</span><b style="color:var(--ok)">−'+soles(ht.sub-ht.total)+'</b></div>' : '')+
      '<div class="kv" style="font-size:16px"><span style="color:var(--ink);font-weight:800">Total a pagar</span><b style="font-size:18px">'+soles(ht.total)+'</b></div>'+
      '<span class="holdchip" style="align-self:flex-start">'+ic('clock',15)+'Asiento guardado por <b data-hold class="tab">'+mmss(hold.until-Date.now())+'</b></span>'+
    '</section>'+
    (ms.length ? '<div class="lbl">¿Con qué le pagas?</div><div class="methods" role="group" aria-label="Método de pago">'+ms.map(x => '<button class="meth" data-act="method" data-arg="'+x+'" aria-pressed="'+(m===x)+'"><i style="background:'+(x==='yape'?'#742284':'#00A5B5')+'">'+(x==='yape'?'Y':'P')+'</i>'+(x==='yape'?'Yape':'Plin')+'</button>').join('')+'</div>'+
      '<section class="card"><ol class="steps" style="margin:0"><li><div><b>Paga '+soles(ht.total)+' por '+label+'</b><span>Al número <b class="mono">'+fmtPhone(num)+'</b> a nombre de <b>'+esc(shortName(d.name))+'</b>.</span></div></li><li><div><b>Guarda tu comprobante</b><span>Anota el número de operación y toma una captura.</span></div></li><li><div><b>Súbelo aquí</b><span>El conductor revisa que le llegó y confirma tu asiento.</span></div></li></ol>'+
      '<button class="btn sm line" data-act="copyNum" data-arg="'+num+'">'+ic('copy',16)+'Copiar número</button></section>'+
      '<section class="card">'+field('opno','Número de operación',{ph:'Ej. 12345678', max:20, value:F.opno})+uplBox('capture','Captura de tu pago','Foto o captura del comprobante', F.capture, 'camera')+'</section>' :
      '<div class="note bad">'+ic('alert',18)+'<span>Este conductor aún no configuró dónde recibir pagos. Elige otro viaje o inténtalo más tarde.</span></div>')+
    '<div class="note info">'+ic('lock',18)+'<span>El pago va directo al conductor. Tu asiento queda <b>por confirmar</b> hasta que él lo apruebe; recibirás un correo cuando esté listo.</span></div>'+
  '</main>'+
  '<div class="bar"><div class="tot"><small>Total</small><b>'+soles(ht.total)+'</b></div><button class="btn" id="btn-pay" data-act="pay" '+(payValid()?'':'disabled')+'>Ya pagué · enviar comprobante</button></div>';
};
function payValid(){ return /^[A-Za-z0-9-]{5,20}$/.test((F.opno||'').trim()) && !!F.capture; }
AFTER.p_pay = () => { const b = document.getElementById('btn-pay'); if (b) b.disabled = !payValid(); };


/* ---------- boleto */
LOAD.p_ticket = async (p) => { const r = await GET('/bookings/'+encodeURIComponent(p.bid)); const i = DB_.bookings.findIndex(b => b.id === r.booking.id); if (i >= 0) DB_.bookings[i] = r.booking; else DB_.bookings.push(r.booking); cacheTrips([r.booking.trip]); cacheDrivers(r.drivers); return r; };
SCREENS.p_ticket = (p) => {
  const b = bookingById(p.bid); if (!b) return top('Boleto')+'<main class="scr"><div class="empty">No encontramos este boleto.</div></main>';
  const t = b.trip, d = driverFor(t); const ok = b.status === 'confirmado';
  const pm = b.payMethod === 'plin' ? 'Plin' : 'Yape';
  return top('Tu boleto', { sub: 'Código '+b.code })+
  '<main class="scr">'+
    (b.status === 'por_confirmar' ? '<div class="note">'+ic('clock',18)+'<span><b>Comprobante enviado.</b> '+esc(shortName(d.name))+' revisa que le llegó tu '+pm+' y confirma tu asiento. Esta pantalla se actualiza sola y te avisamos por correo.</span></div>' : '')+
    (b.status === 'confirmado' && p.fresh ? '<div class="note ok">'+ic('check',18)+'<span><b>Pago confirmado con '+pm+'.</b> Asiento'+(b.seats.length>1?'s':'')+' '+b.seats.join(', ')+' reservado'+(b.seats.length>1?'s':'')+' a tu nombre.</span></div>' : '')+
    (b.status === 'rechazado' ? '<div class="note bad">'+ic('alert',18)+'<span><b>El conductor no pudo confirmar tu pago.</b> '+esc(b.payNote||'')+' Tu asiento se liberó; puedes reservar de nuevo.</span></div>' : '')+
    (b.status === 'cancelado' ? '<div class="note bad">'+ic('alert',18)+'<span><b>Este viaje se canceló.</b> Si ya habías pagado, pide la devolución al conductor.</span></div>' : '')+
    (b.noShow ? '<div class="note bad">'+ic('clock',18)+'<span>No abordaste en los 20 minutos de espera y el asiento se liberó.</span></div>' : '')+
    '<article class="ticket"><div class="th"><span class="eb">Boleto de viaje · '+dateLong(t.date)+'</span><div class="cities"><div><b>'+OFF[t.from].city+'</b><small>'+t.time+'</small></div><div class="mid"></div><div style="text-align:right"><b>'+OFF[t.to].city+'</b><small>'+addMin(t.time,TRIP_MIN)+' aprox.</small></div></div></div>'+
      '<div class="perf"><i></i><i></i></div>'+
      '<div class="tb"><div class="tgrid"><div><small>Asiento</small><b>'+b.seats.join(', ')+'</b></div><div><small>Vehículo</small><b>'+VT[t.vtype].label+'</b></div><div><small>Placa</small><b class="mono">'+esc(d.plate)+'</b></div></div>'+
      '<div class="drvcard">'+avatarOf(d,46)+'<div><b>'+esc(d.name)+'</b><div style="display:flex;gap:6px;margin-top:3px">'+verBadge(d)+'<span class="stars">'+starI(12)+ratingTxt(d.id)+'</span></div></div></div>'+
      '<div class="kv"><span>Embarque</span><b>'+OFF[t.from].name+'<br><small class="muted" style="font-weight:600">'+OFF[t.from].addr+'</small></b></div>'+
      '<div class="kv"><span>'+(ok?'Pagado':'Monto')+'</span><b>'+soles(b.total)+' · '+pm+'</b></div>'+
      (ok ? '<div class="divider"></div><div class="tqr"><div id="tqr"></div><div><small class="muted" style="font-weight:700">Muéstralo al subir</small><div class="code">'+b.code+'</div><small class="muted">El conductor escanea este QR. Compara la foto y la placa antes de subir.</small></div></div>' : '')+
      '</div></article>'+
    (ok ? '<div class="note">'+ic('clock',18)+'<span>Llega a la oficina 15 min antes. El conductor espera 20 min después de la salida; si no llegas, pierdes el asiento.</span></div>' : '')+
    (ok || b.status === 'por_confirmar' ? '<div class="actions2"><button class="btn dark" data-act="liveB" data-arg="'+b.id+'">'+ic('live',18)+'Ver en vivo</button><button class="btn line" data-act="share" data-arg="'+esc(t.id)+'">'+ic('share',18)+'Compartir</button></div>' : '')+
    '<button class="btn line" data-act="tab" data-arg="p_trips">Ir a mis viajes</button>'+
  '</main>';
};
AFTER.p_ticket = (p) => { const b = bookingById(p.bid); const el = document.getElementById('tqr'); if (b && el && b.status === 'confirmado') drawQR(el, 'VIP|'+b.code+'|'+b.trip.id+'|'+b.seats.join('-'), 104); };
function drawQR(el, text, size){
  try{ if (window.QRCode){ new window.QRCode(el, { text, width:size, height:size, colorDark:'#16181D', colorLight:'#FFFFFF', correctLevel: window.QRCode.CorrectLevel.M }); return; } }catch(e){}
  el.innerHTML = '<div style="width:'+size+'px;height:'+size+'px;display:grid;place-items:center;border:2px dashed #C4C8D0;border-radius:12px;font-family:var(--f-mono);font-size:12px;text-align:center;padding:10px">'+esc(text.split('|').slice(-3).join(' '))+'</div>';
}

/* ---------- mis viajes */
LOAD.p_trips = loadBookings;
SCREENS.p_trips = () => {
  const tab = F.ttab || 'up';
  const list = DB_.bookings.filter(b => tab === 'up' ? !isFinished(b) : isFinished(b)).sort((a,b) => tab==='up' ? depDate(a.trip)-depDate(b.trip) : depDate(b.trip)-depDate(a.trip));
  return top('Mis viajes', { back:false })+
  '<main class="scr">'+
    '<div class="seg"><button data-act="ttab" data-arg="up" aria-pressed="'+(tab==='up')+'">Próximos</button><button data-act="ttab" data-arg="past" aria-pressed="'+(tab==='past')+'">Realizados</button></div>'+
    (list.length ? list.map(b => {
      const t = b.trip, d = driverFor(t); const fin = isFinished(b); const canRate = t.status === 'finished' && b.status === 'confirmado';
      return '<section class="card tight"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-family:var(--f-display);font-stretch:112%;font-weight:850;font-size:18px">'+OFF[t.from].city+' → '+OFF[t.to].city+'</b>'+statusBdg(b)+'</div>'+
        '<div class="kv"><span>'+dayLabel(t.date)+' · '+t.time+'</span><b>Asiento '+b.seats.join(', ')+'</b></div><div class="kv"><span>'+esc(shortName(d.name))+' · '+esc(d.model)+'</span><b class="mono">'+esc(d.plate)+'</b></div>'+
        (b.noShow ? '<div class="note bad">'+ic('clock',18)+'<span>No llegaste en los 20 minutos de espera y el asiento se liberó.</span></div>' : '')+
        (b.status === 'rechazado' ? '<div class="note bad">'+ic('alert',18)+'<span>El conductor no confirmó tu pago'+(b.payNote?': '+esc(b.payNote):'')+'.</span></div>' : '')+
        '<div class="actions2">'+(canRate ? (b.rated ? '<span class="bdg ok" style="justify-content:center;padding:10px">'+ic('check',14)+'Ya calificaste</span>' : '<button class="btn sm" data-act="rate" data-arg="'+b.id+'">'+starI(16)+'Calificar</button>') : (fin ? '<span></span>' : '<button class="btn sm" data-act="ticket" data-arg="'+b.id+'">Boleto</button>'))+(b.status==='confirmado' || b.status==='por_confirmar' ? '<button class="btn sm line" data-act="liveB" data-arg="'+b.id+'">'+(fin?'Ver recorrido':'En vivo')+'</button>' : '<button class="btn sm line" data-act="ticket" data-arg="'+b.id+'">Detalle</button>')+'</div></section>';
    }).join('') : '<div class="empty">'+ic('ticket',40)+'<h3 class="h-sec">'+(tab==='up'?'Aún no tienes viajes reservados':'Todavía no terminas ningún viaje')+'</h3><p>'+(tab==='up'?'Busca una salida y elige tu asiento.':'Cuando llegues a tu destino, aquí podrás calificar al conductor.')+'</p>'+(tab==='up'?'<button class="btn sm" data-act="tab" data-arg="p_home">Buscar viaje</button>':'')+'</div>')+
  '</main>';
};

/* ---------- en vivo (pasajero y conductor): la posición es la del celular del conductor */
function liveView(t, who){
  const L = liveOf(t), d = driverFor(t); const follow = !!F.follow;
  const rem = (1 - L.p) * TRIP_MIN; const kmLeft = Math.round((1 - L.p) * ROUTE_KM);
  const arrived = L.done;
  const nPax = (DB_.man[t.id] && DB_.man[t.id].seats ? DB_.man[t.id].seats.filter(s => s.state === 'sold' || s.state === 'on').length : 0);
  let status = arrived ? 'Llegó a '+OFF[t.to].name : (L.run ? (L.has ? (L.stale ? 'Sin señal del GPS hace '+Math.round((Date.now()-new Date(L.at))/60000)+' min' : 'En ruta · próximo punto: '+nextTown(t)) : 'Esperando la primera ubicación del conductor…') : (t.status === 'cancelled' ? 'Viaje cancelado' : 'Esperando la salida en '+OFF[t.from].name));
  return '<div class="map" id="mapbox"><div id="map">'+mapSVG(t, follow)+'</div><span class="live-pill"><span class="pulse '+(L.run&&!L.stale?'':'off')+'"></span><span id="lv-pill">'+(L.run?(L.stale?'Sin señal':'GPS en vivo'):arrived?'Viaje terminado':'GPS listo')+'</span></span><div class="mtools"><button data-act="follow" aria-pressed="'+follow+'" aria-label="'+(follow?'Ver ruta completa':'Seguir al vehículo')+'">'+ic(follow?'expand':'gps',20)+'</button></div></div>'+
    '<div class="card tight"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b id="lv-status" style="font-size:15px">'+status+'</b></div><div class="progress-line"><i id="lv-bar" style="width:'+(L.p*100).toFixed(1)+'%"></i></div><div class="kv" style="font-size:12.5px"><span>'+OFF[t.from].city+' · '+t.time+'</span><span>'+OFF[t.to].city+' · '+addMin(t.time,TRIP_MIN)+'</span></div></div>'+
    '<div class="stats"><div class="stat"><small>Velocidad</small><b id="lv-spd">'+speedNow(t)+'<em>km/h</em></b></div><div class="stat"><small>Faltan</small><b id="lv-km">'+(L.has||arrived?kmLeft:'—')+'<em>km</em></b></div><div class="stat"><small>Tiempo</small><b id="lv-rem" style="font-size:17px">'+(L.has||arrived?durTxt(rem):'—')+'</b></div></div>'+
    (who === 'p' ? '<div class="card tight"><div class="drvcard">'+avatarOf(d,44)+'<div><b>'+esc(d.name)+'</b><div style="display:flex;gap:6px;align-items:center;margin-top:2px;flex-wrap:wrap">'+verBadge(d)+'<span class="plate">'+esc(d.plate)+'</span><small class="muted">'+esc(d.model)+'</small></div></div></div></div>'
                 : '<div class="note '+(GPSW.id!=null?'ok':'')+'">'+ic('wifi',18)+'<span>'+(t.status==='started' ? (GPSW.tripId===t.id && GPSW.id!=null ? 'Transmitiendo tu ubicación a tus pasajeros y a la central VIP. Mantén esta pantalla abierta.' : 'El viaje está en curso pero no se está transmitiendo tu ubicación. Toca «Activar GPS».') : 'Al iniciar, tus '+nPax+' pasajeros verán la unidad en el mapa con el GPS de tu celular.')+'</span></div>')+
    (S.sharing && S.sharing.tripId === t.id && who === 'p' ? '<div class="sharepill">'+ic('share',18)+'<span>Compartiendo tu viaje con '+esc(S.sharing.name)+'</span><button class="link" data-act="stopShare" style="margin-left:auto;color:#0B5A3C">Detener</button></div>' : '')+
    '<div class="actions2">'+(who==='p' ? '<button class="btn dark" data-act="share" data-arg="'+esc(t.id)+'">'+ic('share',18)+'Compartir ubicación</button>' :
      (arrived ? '<button class="btn dark" data-act="manifestOf" data-arg="'+esc(t.id)+'">Calificar pasajeros</button>' :
       t.status === 'started' ? '<button class="btn dark" data-act="'+(GPSW.tripId===t.id && GPSW.id!=null?'finishTrip':'gpsOn')+'" data-arg="'+esc(t.id)+'">'+(GPSW.tripId===t.id && GPSW.id!=null?ic('flag',18)+'Terminar viaje':ic('gps',18)+'Activar GPS')+'</button>' :
       '<button class="btn dark" data-act="startTrip" data-arg="'+esc(t.id)+'">'+ic('play',18)+'Iniciar viaje</button>'))+'<button class="btn sos" data-act="sos" data-arg="'+esc(t.id)+'">'+ic('alert',18)+'SOS</button></div>'+
    (arrived && who === 'p' ? liveArrived(t) : '')+
    (t.status === 'started' && who === 'd' ? '<button class="link" data-act="finishTrip" data-arg="'+esc(t.id)+'" style="align-self:center;color:var(--muted)">Ya llegué: terminar el viaje</button>' : '');
}
function liveArrived(t){
  const b = DB_.bookings.find(x => x.trip.id === t.id && x.status === 'confirmado'); if (!b) return '';
  return '<section class="card" style="border-color:var(--ok)"><h3>Llegaste a '+OFF[t.to].city+'</h3><p style="font-size:14px;color:var(--ink2)">¿Cómo te fue con '+esc(firstName(driver(t.driverId).name))+'? Tu calificación ayuda a otros pasajeros.</p>'+(!b.rated?'<button class="btn" data-act="rate" data-arg="'+b.id+'">'+starI(18)+'Calificar viaje</button>':'<span class="bdg ok">'+ic('check',13)+'Gracias por calificar</span>')+'</section>';
}
function liveBooking(p){ let b = p.bid ? bookingById(p.bid) : null; if (!b) b = nextBooking() || DB_.bookings.filter(x => x.status === 'confirmado').sort((x,y) => depDate(y.trip)-depDate(x.trip))[0] || null; return b; }
LOAD.p_live = async (p) => {
  if (!DB_.bookings.length || !p.bid) await loadBookings();
  const b = liveBooking(p); if (!b) return null;
  const r = await GET('/trips/'+encodeURIComponent(b.trip.id)+'/live'); cacheTrips([r.trip]); cacheDrivers(r.drivers); DB_.live[r.trip.id] = r.live || {}; return r;
};
SCREENS.p_live = (p) => {
  const b = liveBooking(p); const t = b ? trip(b.trip.id) || b.trip : null;
  if (!t) return top('En vivo', { back:false })+'<main class="scr"><div class="empty">'+ic('gps',44)+'<h3 class="h-sec">Aquí verás tu viaje en el mapa</h3><p>Cuando reserves, podrás seguir la unidad por la Panamericana Norte con el GPS del conductor, compartir tu ubicación y usar el botón SOS.</p><button class="btn sm" data-act="tab" data-arg="p_home">Buscar viaje</button></div></main>';
  F.liveTrip = t.id;
  return top('Viaje en vivo', { back: stack.length > 1, sub: OFF[t.from].city+' → '+OFF[t.to].city+' · '+t.time })+'<main class="scr">'+liveView(t, 'p')+'</main>';
};

/* ---------- calificar */
SCREENS.p_rate = (p) => {
  const b = bookingById(p.bid); if (!b) return top('Califica tu viaje')+'<main class="scr"><div class="empty">No encontramos este viaje.</div></main>';
  const t = b.trip, d = driverFor(t);
  const st = F.rs || 0; const tags = F.rtags || []; const bad = F.rbad || [];
  const words = ['','Muy malo','Malo','Regular','Bueno','Excelente'];
  return top('Califica tu viaje')+
  '<main class="scr">'+
    '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding-top:6px">'+avatarOf(d,76)+'<h2 class="h-sec">¿Cómo estuvo tu viaje con '+esc(firstName(d.name))+'?</h2><small class="muted">'+OFF[t.from].city+' → '+OFF[t.to].city+' · '+dateLong(t.date)+'</small></div>'+
    '<div class="bigstars" role="radiogroup" aria-label="Calificación">'+[1,2,3,4,5].map(n => '<button role="radio" aria-checked="'+(st===n)+'" class="'+(n<=st?'on':'')+'" data-act="rstar" data-arg="'+n+'" aria-label="'+n+' estrella'+(n>1?'s':'')+'">'+starI(44)+'</button>').join('')+'</div>'+
    '<p style="text-align:center;font-weight:800;min-height:20px">'+(words[st]||'Toca las estrellas')+'</p>'+
    '<div><div class="lbl" style="margin-bottom:8px">¿Qué te gustó?</div><div class="tagpick">'+RATE_TAGS.map(x => chip(x, tags.indexOf(x)>=0, 'rtag', x)).join('')+'</div></div>'+
    (st && st <= 3 ? '<div><div class="lbl" style="margin-bottom:8px">¿Algo salió mal? Lo revisa la central</div><div class="tagpick">'+BAD_TAGS.map(x => chip(x, bad.indexOf(x)>=0, 'rbad', x)).join('')+'</div></div>' : '')+
    '<div class="fld"><label for="f-rtext">Cuéntanos tu experiencia (opcional)</label><textarea id="f-rtext" data-f="rtext" maxlength="300" placeholder="Ej. Salimos puntual y el conductor manejó con cuidado.">'+esc(F.rtext||'')+'</textarea></div>'+
  '</main>'+
  '<div class="bar"><button class="btn" data-act="sendRate" data-arg="'+b.id+'" '+(st?'':'disabled')+'>Enviar calificación</button></div>';
};

/* ---------- perfil pasajero */
LOAD.p_profile = refreshMe;
SCREENS.p_profile = () => {
  const a = P(); const lv = vLevel('pasajero'); const vs = vStatus('pasajero');
  return top('Perfil', { back:false })+
  '<main class="scr">'+
    '<section class="card" style="align-items:center;text-align:center">'+avatarMe(84)+'<div><h2 class="h-sec">'+esc(a.name)+'</h2><small class="muted">'+esc(fmtPhone(a.phone))+' · '+esc(a.email)+'</small></div>'+(vs.st==='approved'?'<span class="bdg ok">'+ic('shield',13)+'Pasajero confiable</span>':vs.st==='pending'?'<span class="bdg gold">Verificación en revisión</span>':'<span class="bdg gold">Verificación '+lv.done+' de '+lv.total+'</span>')+'</section>'+
    '<button class="card tight" data-act="nav" data-arg="verif" style="text-align:left"><div class="off"><span class="oi">'+ic('shield',22)+'</span><div><b>Verificación de identidad</b><small>DNI ✓ · Correo ✓ · Selfie '+(a.files.selfie?'✓':'pendiente')+' · Foto del DNI '+(a.files.dni_photo?'✓':'pendiente')+'</small></div>'+ic('chev')+'</div></button>'+
    '<button class="card tight" data-act="nav" data-arg="verif" style="text-align:left"><div class="off"><span class="oi">'+ic('users',22)+'</span><div><b>Contacto de emergencia</b><small>'+(a.emerg.name?esc(a.emerg.name)+' · '+esc(a.emerg.phone):'Agrega a alguien de confianza')+'</small></div>'+ic('chev')+'</div></button>'+
    '<div class="card tight"><div class="off"><span class="oi">'+ic('card',22)+'</span><div><b>Cómo se paga</b><small>Yape o Plin directo al conductor; él confirma tu asiento</small></div></div></div>'+
    '<button class="card tight" data-act="nav" data-arg="landing" style="text-align:left"><div class="off"><span class="oi">'+ic('info',22)+'</span><div><b>Conoce VIP Ruta Segura</b><small>Cómo funciona, seguridad, flota y preguntas</small></div>'+ic('chev')+'</div></button>'+
    (EDIT.can ? '<button class="btn dark" data-act="editOpen">'+ic('edit')+'Editar textos de la app</button>' : '')+
    '<button class="btn line" data-act="switchRole" data-arg="conductor">'+ic('wheel')+(a.driver?'Cambiar a modo conductor':'Quiero manejar con VIP')+'</button>'+
    '<button class="btn line" data-act="logout">'+ic('logout')+'Cerrar sesión</button>'+
  '</main>';
};


/* =========================================================
   Conductor: panel, publicar/editar, pasajeros, cobros, GPS
   ========================================================= */
const WAIT_MIN = 20;
const GPSW = { id:null, tripId:null, last:0, arrived:false };
async function loadMyTrips(){ const r = await GET('/driver/trips'); DB_.myTrips = r.trips; DB_.myInfo = { today:r.today, pendingPayments:r.pendingPayments }; cacheTrips(r.trips); return r; }
function myTrips(){ return DB_.myTrips.slice().sort((a,b) => depDate(a) - depDate(b)); }
function myNextTrip(){ const now = Date.now(); return myTrips().find(t => (t.status === 'active' || t.status === 'started') && depDate(t).getTime() + (TRIP_MIN+60)*60000 > now) || null; }
async function loadManifest(t){ const m = await GET('/driver/trips/'+encodeURIComponent(t.id)+'/manifest'); cacheTrips([Object.assign({}, trip(t.id) || {}, m.trip)]); DB_.man[t.id] = m; DB_.live[t.id] = m.live ? { lat:m.live.lat, lon:m.live.lon, speed:m.live.speed_kmh, at:m.live.updated_at } : {}; return m; }
function resumeGps(){ const st = DB_.myTrips.find(t => t.status === 'started'); if (st && GPSW.tripId !== st.id && S.role === 'conductor') startWatch(st.id); }

LOAD.d_home = async () => { await refreshMe(); const r = await loadMyTrips(); const nt = myNextTrip(); let m = null; if (nt) m = await loadManifest(nt); resumeGps(); return { r, m }; };
function vBanner(){
  const c = C(); const vs = vStatus('conductor'); const lv = vLevel('conductor');
  if (vs.st === 'approved') return '';
  const msg = vs.st === 'pending' ? ['Tu verificación está en revisión','El administrador revisa tus documentos. Te avisamos por correo.'] : vs.st === 'rejected' ? ['Corrige tu verificación', vs.note || 'El administrador pidió cambios.'] : ['Completa tu verificación','Sin verificación no puedes publicar viajes. Te faltan '+(lv.total-lv.done)+' paso'+(lv.total-lv.done===1?'':'s')+'.'];
  return '<button class="card tight" data-act="nav" data-arg="verif" style="text-align:left;border-color:#F2D57A;background:#FFFBEA"><div class="off"><span class="oi" style="background:var(--gold);color:var(--ink)">'+ic('shield',22)+'</span><div><b>'+msg[0]+'</b><small>'+esc(msg[1])+'</small></div>'+ic('chev')+'</div></button>';
}
SCREENS.d_home = () => {
  const c = C(); const lv = vLevel('conductor'); const nt = myNextTrip(); const inf = DB_.myInfo; const ok = driverOk();
  const list = myTrips().filter(t => t !== nt);
  return '<header class="top brand">'+logoH(32)+'<button class="ib" data-act="tab" data-arg="d_profile" aria-label="Perfil" style="border-radius:50%;overflow:hidden">'+avatarMe(40)+'</button></header>'+
  '<main class="scr">'+
    '<section class="dhead"><div class="who">'+avatarMe(52)+'<div><b>'+esc(ME.name)+'</b><div style="margin-top:3px">'+(ok?'<span class="bdg ok">'+ic('check',12)+'Conductor verificado</span>':'<span class="bdg gold">Verificación '+lv.done+' de '+lv.total+'</span>')+'</div></div></div>'+
      '<div class="kpis"><div><small>Pasajeros hoy</small><b>'+inf.today.pax+'</b></div><div><small>Ingreso hoy</small><b>'+soles(inf.today.income).replace('S/ ','S/')+'</b></div><div><small>Calificación</small><b>'+ratingTxt('me')+'</b></div></div></section>'+
    vBanner()+
    (inf.pendingPayments ? '<button class="card tight" data-act="tab" data-arg="d_manifest" style="text-align:left;border-color:var(--gold)"><div class="off"><span class="oi" style="background:var(--gold);color:var(--ink)">'+ic('money',22)+'</span><div><b>'+inf.pendingPayments+' pago'+(inf.pendingPayments>1?'s':'')+' por confirmar</b><small>Revisa que te llegó el Yape/Plin y confirma el asiento.</small></div>'+ic('chev')+'</div></button>' : '')+
    (nt ? driverNextCard(nt) + salesPanel(nt) : '<section class="card"><h3>Aún no tienes viajes publicados</h3><p style="font-size:14px;color:var(--ink2)">Publica tu primera salida y aparecerá al instante en las búsquedas de los pasajeros.</p></section>')+
    '<button class="btn" data-act="newTrip" '+(ok?'':'disabled')+'>'+ic('plus')+'Publicar un viaje</button>'+
    (list.length ? '<div class="sec-h"><h3>Tus salidas</h3></div>'+list.map(tripRow).join('') : '')+
    '<div class="sec-h"><h3>Reseñas recientes</h3>'+((C().reviews)?'<button class="link" data-act="nav" data-arg="d_reviews">Ver todas</button>':'')+'</div>'+
    (C().reviews ? '<p class="muted" style="font-size:14px">Tienes '+C().reviews+' reseña'+(C().reviews>1?'s':'')+' con un promedio de <b style="color:var(--ink)">'+ratingTxt('me')+'</b>.</p>' : '<p class="muted" style="font-size:14px">Cuando tus pasajeros califiquen el viaje, sus comentarios aparecerán aquí.</p>')+
  '</main>';
};
function tripRow(t){
  const open = t.status === 'active';
  return '<section class="card tight"><div class="kv"><b style="text-align:left">'+OFF[t.from].city+' → '+OFF[t.to].city+'</b><span class="bdg mute">'+dayLabel(t.date)+' · '+t.time+'</span></div><div class="kv"><span>'+(t.sold||0)+' de '+t.seats+' asientos vendidos'+(t.pending?' · '+t.pending+' por confirmar':'')+'</span><b>'+soles((t.sold||0)*t.price)+'</b></div>'+
    '<div class="actions2"><button class="btn xs line" data-act="manifestOf" data-arg="'+esc(t.id)+'">'+ic('users',15)+'Pasajeros</button>'+(open?'<button class="btn xs line" data-act="editTrip" data-arg="'+esc(t.id)+'">'+ic('edit',15)+'Editar</button>':'<span></span>')+'</div>'+(open?'<button class="link" data-act="cancelTrip" data-arg="'+esc(t.id)+'" style="align-self:flex-start;color:var(--bad)">Cancelar este viaje</button>':'')+'</section>';
}
function driverNextCard(t){
  const n = t.sold || 0;
  return '<section class="card nextc"><div style="display:flex;justify-content:space-between;align-items:center"><span class="eb">Próxima salida</span><span class="bdg gold" data-dep="'+depDate(t).getTime()+'">'+untilTxt(depDate(t)-nowSim())+'</span></div>'+
    '<b style="font-family:var(--f-display);font-stretch:115%;font-weight:900;font-size:22px">'+OFF[t.from].city+' → '+OFF[t.to].city+'</b>'+
    '<div class="kv"><span>'+dateLong(t.date)+' · '+t.time+'</span><b>'+n+' de '+t.seats+' pasajeros</b></div>'+
    '<div class="occbar"><div class="ob" style="background:#3A3F48"><i style="width:'+(n/t.seats*100)+'%;background:var(--gold)"></i></div></div>'+
    '<div class="actions2"><button class="btn sm" data-act="manifestOf" data-arg="'+esc(t.id)+'">'+ic('users',18)+'Pasajeros</button><button class="btn sm line" style="background:transparent;color:#fff;border-color:#4A505C" data-act="driveOf" data-arg="'+esc(t.id)+'">'+ic('play',18)+(t.status==='started'?'Ir al mapa':'Iniciar viaje')+'</button></div></section>';
}

/* ---------- ventas de pasajes en tiempo real (datos reales del servidor) */
function salesStats(t){
  const m = DB_.man[t.id];
  if (m){ const s = m.seats; return { sold:s.filter(x => x.state === 'sold' || x.state === 'on').length, pend:s.filter(x => x.state === 'pending').length, boarded:s.filter(x => x.state === 'on').length, m }; }
  return { sold:t.sold || 0, pend:t.pending || 0, boarded:t.boarded || 0, m:null };
}
function waitInfo(t){ const el = (nowSim() - depDate(t))/60000; return { el }; }
function departStatus(t){
  const st = salesStats(t); const sold = st.sold, full = sold + st.pend >= t.seats; const w = waitInfo(t);
  if (t.status === 'finished') return { cls:'ok', t:'Viaje terminado', d:'Llegaste a '+OFF[t.to].name+'.' };
  if (t.status === 'started') return { cls:'ok', t:'Viaje en curso', d:'Tus pasajeros ven la unidad en el mapa.' };
  if (sold > 0 && st.boarded === sold && st.pend === 0 && (full || w.el >= 0)) return { cls:'ok', go:true, t:'Todos a bordo: puedes partir', d:full ? 'Vehículo lleno y todos subieron.' : 'Ya subieron todos los que pagaron.' };
  if (w.el < 0) return full ? { cls:'ok', t:'Vehículo lleno', d:'Vendiste todos los pasajes. Espera que suban tus '+sold+' pasajeros.' } : { cls:'gold', t:'Aún se venden pasajes', d:'Quedan '+(t.seats-sold-st.pend)+' asiento'+(t.seats-sold-st.pend===1?'':'s')+'. Salida programada a las '+t.time+'.'+(st.pend?' Tienes '+st.pend+' pago'+(st.pend>1?'s':'')+' por confirmar.':'') };
  if (w.el < WAIT_MIN) return { cls:'gold', t:'Esperando pasajeros', d:'Faltan '+(sold-st.boarded)+' por subir. Si no llegan en '+mmss((WAIT_MIN-w.el)*60000)+', pierden su asiento.' };
  return { cls:'ok', go:true, t:'Ya puedes partir', d:'Pasaron los 20 minutos de espera. Quien no llegó perdió su asiento.' };
}
function salesPanel(t){
  const st = salesStats(t); const ds = departStatus(t); const m = st.m;
  const ev = m ? m.feed.slice(0,4) : [];
  const dots = Array.from({length:t.seats}, (_,i) => { const n = i+1; const s = m ? m.seats.find(x => x.seat === n && x.state !== 'released') : null; const c = !s ? 'free' : s.state === 'on' ? 'on' : s.state === 'pending' ? 'pend' : 'sold'; return '<i class="sd '+c+'" title="Asiento '+n+'">'+n+'</i>'; }).join('');
  return '<section class="card sales" id="salesbox" data-tid="'+esc(t.id)+'">'+
    '<div class="sales-h"><span class="live-dot"><span class="pulse"></span>Venta de pasajes en vivo</span><small class="muted">'+dayLabel(t.date)+' '+t.time+'</small></div>'+
    '<div class="sold"><b>'+st.sold+'</b><span>de '+t.seats+' pasajes<br>vendidos</span><em>'+soles(st.sold*t.price)+'</em></div>'+
    '<div class="seatdots">'+dots+'</div>'+
    '<div class="depart '+ds.cls+'">'+ic(ds.go ? 'check' : 'clock',20)+'<div><b>'+ds.t+'</b><small>'+ds.d+'</small></div></div>'+
    (ds.go && t.status === 'active' ? '<button class="btn ok" data-act="driveOf" data-arg="'+esc(t.id)+'">'+ic('play',18)+'Iniciar viaje ahora</button>' : '')+
    (ev.length ? '<ul class="feed">'+ev.map(e => '<li class="'+e.k+'"><span class="fi">'+ic(e.k === 'compra' ? 'ticket' : 'flag',15)+'</span><span class="ft"><b>'+(e.k === 'compra' ? (e.confirmed ? 'Vendido asiento '+e.seat : 'Por confirmar asiento '+e.seat) : 'Asiento '+e.seat+' liberado')+'</b>'+esc(shortName(e.name))+(e.k === 'compra' ? ' · '+(e.pay === 'plin' ? 'Plin' : 'Yape') : ' · no llegó en 20 min')+'</span><small>'+agoTxt(e.at)+'</small></li>').join('')+'</ul>' : '<p class="muted" style="font-size:13.5px">Todavía no hay compras. Aparecerán aquí en cuanto un pasajero reserve.</p>')+
  '</section>';
}

/* ---------- publicar / editar viaje */
SCREENS.d_create = () => {
  const c = C(); const ed = F.editTrip ? trip(F.editTrip) : null; const v = VT[ed ? ed.vtype : c.veh.type];
  if (ed && F.cdate == null){ F.cfrom = ed.from; F.cdate = ed.date; F.ctime = ed.time; F.cprice = ed.price; F.cseats = ed.seats; }
  const from = F.cfrom || 'tru';
  if (F.cdate == null) F.cdate = ymd(new Date());
  if (F.ctime == null){ const now = new Date(); const nt = TIMES.find(t => t > pad(now.getHours()+1)+':'+pad(now.getMinutes())) || '07:00'; F.ctime = nt; if (nt === '07:00' && now.getHours() >= 19) F.cdate = addDays(1); }
  if (F.cprice == null) F.cprice = v.price;
  if (F.cseats == null) F.cseats = v.seats;
  const veh = ed ? { model:ed.model, plate:ed.plate, color:ed.color, type:ed.vtype } : c.veh;
  return top(ed ? 'Editar viaje' : 'Publicar viaje')+
  '<main class="scr">'+
    '<div class="fld"><label>Sentido</label><div class="seg">'+['tru','chi'].map(k => '<button '+(ed?'disabled ':'data-act="cfrom" data-arg="'+k+'" ')+'aria-pressed="'+(from===k)+'">'+OFF[k].city+' → '+OFF[k==='tru'?'chi':'tru'].city+'</button>').join('')+'</div><span class="hint">Salida desde '+OFF[from].name+' ('+OFF[from].addr+').</span></div>'+
    '<div class="row2">'+field('cdate','Fecha',{type:'date', value:F.cdate})+field('ctime','Hora de salida',{type:'time', value:F.ctime})+'</div>'+
    '<div class="card tight"><div class="off"><span style="width:96px;flex-shrink:0">'+vehSVG(veh.type, veh.color)+'</span><div><b>'+esc(veh.model||v.label)+'</b><small><span class="plate">'+esc(veh.plate||'—')+'</span> · '+v.desc+'</small></div></div></div>'+
    '<div class="row2">'+field('cprice','Precio por asiento (S/)',{type:'number', mode:'decimal', value:F.cprice, hint:'Sugerido: '+soles(v.price)+' · entre S/ 20 y S/ 120'})+field('cseats','Asientos que ofreces',{type:'number', mode:'numeric', value:F.cseats, hint:'Máximo '+v.seats})+'</div>'+
    '<div class="note info">'+ic('info',18)+'<span>'+(ed ? 'Los pasajeros que ya reservaron recibirán un correo con el cambio. Conservan el precio que pagaron.' : 'Las promociones (anticipada, horario valle, fechas especiales y vehículo completo) se aplican solas. VIP asume el descuento.')+'</span></div>'+
    '<p class="hint" id="cerr"></p>'+
  '</main>'+
  '<div class="bar"><button class="btn" data-act="publish">'+ic('check')+(ed?'Guardar cambios':'Publicar viaje')+'</button></div>';
};

/* ---------- lista de pasajeros: cobros, abordaje, calificación */
LOAD.d_manifest = async (p) => {
  await loadMyTrips(); const trips = myTrips(); if (!trips.length) return null;
  const t = (F.mtrip && trips.find(x => x.id === F.mtrip)) || (p.id && trips.find(x => x.id === p.id)) || myNextTrip() || trips[0];
  F.mtrip = t.id; return loadManifest(t);
};
SCREENS.d_manifest = (p) => {
  const trips = myTrips();
  if (!trips.length) return top('Pasajeros', { back:false })+'<main class="scr"><div class="empty">'+ic('users',40)+'<h3 class="h-sec">Todavía no tienes pasajeros</h3><p>Publica un viaje y aquí verás quién reservó, su asiento, su pago y su verificación.</p><button class="btn sm" data-act="newTrip" '+(driverOk()?'':'disabled')+'>Publicar viaje</button>'+(driverOk()?'':'<small class="muted">Primero completa tu verificación.</small>')+'</div></main>';
  const tid = F.mtrip && trips.find(t => t.id === F.mtrip) ? F.mtrip : (myNextTrip()||trips[0]).id;
  const t = trip(tid); const m = DB_.man[tid]; const rows = m ? m.seats : [];
  const on = rows.filter(s => s.state === 'on').length, no = rows.filter(s => s.state === 'released').length, pend = rows.filter(s => s.state === 'sold' || s.state === 'pending').length;
  const finished = t.status === 'finished';
  return top('Pasajeros', { back:false, sub: OFF[t.from].city+' → '+OFF[t.to].city+' · '+t.time })+
  '<main class="scr">'+
    (trips.length > 1 ? '<div class="tripchips">'+trips.map(x => chip(dayLabel(x.date)+' '+x.time+' · '+OFF[x.from].city.slice(0,3), x.id===tid, 'mtrip', x.id)).join('')+'</div>' : '')+
    (!finished ? salesPanel(t) : '')+
    (t.status === 'active' || t.status === 'started' ? '<button class="btn dark" data-act="scan" data-arg="'+esc(t.id)+'">'+ic('camera',18)+'Escanear QR del pasajero</button>' : '')+
    '<div class="stats"><div class="stat"><small>Abordaron</small><b>'+on+'</b></div><div class="stat"><small>Por subir</small><b>'+pend+'</b></div><div class="stat"><small>No vino</small><b>'+no+'</b></div></div>'+
    (finished ? '<div class="note ok">'+ic('check',18)+'<span>Viaje terminado. Califica a tus pasajeros: ayuda a otros conductores.</span></div>' : t.status === 'active' ? '<div class="waitbox" id="waitbox">'+waitHTML(t)+'</div>' : '')+
    '<section class="card">'+(rows.length ? rows.map(s => paxRow(t, s, finished, rows)).join('') : '<p class="muted">Aún nadie reservó en esta salida.</p>')+'</section>'+
  '</main>';
};
function waitHTML(t){
  const w = waitInfo(t);
  if (w.el < 0) return '<span class="oi" style="width:42px;height:42px;border-radius:12px;background:#EEF0F3;display:grid;place-items:center">'+ic('clock',22)+'</span><div style="flex:1"><small class="muted" style="font-weight:700">Falta para la salida</small><div class="wt">'+durTxt(-w.el)+'</div></div>';
  if (w.el < WAIT_MIN) return '<span class="oi" style="width:42px;height:42px;border-radius:12px;background:var(--gold);display:grid;place-items:center">'+ic('clock',22)+'</span><div style="flex:1"><small class="muted" style="font-weight:700">Espera de pasajeros (20 min)</small><div class="wt">'+mmss((WAIT_MIN-w.el)*60000)+'</div></div><span class="bdg gold">Esperando</span>';
  return '<span class="oi" style="width:42px;height:42px;border-radius:12px;background:var(--bad-soft);color:var(--bad);display:grid;place-items:center">'+ic('flag',22)+'</span><div style="flex:1"><small class="muted" style="font-weight:700">Pasaron los 20 minutos</small><div style="font-weight:800">Quien no abordó perdió su asiento</div></div>';
}
function paxRow(t, s, finished, rows){
  const mates = rows.filter(x => x.bookingId === s.bookingId && x.state === s.state).map(x => x.seat).sort((a,b) => a-b); const lead = mates[0] === s.seat;
  const av = avatarOf({ name:s.name, photo:s.photo }, 44);
  let acts = '';
  if (s.state === 'released') acts = '<span class="bdg bad">No llegó en 20 min · perdió el asiento</span>';
  else if (s.state === 'pending' && !lead) acts = '<span class="bdg gold">Se confirma junto con el asiento '+mates[0]+'</span>';
  else if (s.state === 'pending') acts = '<div class="acts" style="flex-wrap:wrap"><button class="btn xs line" data-act="viewPay" data-arg="'+esc(t.id)+'|'+s.seat+'">'+ic('doc',15)+'Ver pago</button><button class="btn xs ok" data-act="payOk" data-arg="'+s.paymentId+'">'+ic('check',15)+'Confirmar</button><button class="btn xs red" data-act="payNo" data-arg="'+s.paymentId+'">Rechazar</button></div>';
  else if (finished){ const r = s.myRating || 0; acts = '<div class="acts" aria-label="Calificar pasajero">'+[1,2,3,4,5].map(n => '<button class="ib" style="width:34px;height:34px;border-radius:10px;color:'+(n<=r?'var(--gold)':'#C9CDD5')+'" data-act="rpax" data-arg="'+esc(t.id)+'|'+s.seat+'|'+n+'" aria-label="'+n+' estrellas">'+starI(16)+'</button>').join('')+'</div>'; }
  else if (s.state === 'on') acts = '<span class="bdg ok">'+ic('check',12)+'Abordó</span>';
  else acts = '<div class="acts" style="align-items:center;flex-wrap:wrap"><button class="btn xs ok" data-act="board" data-arg="'+esc(t.id)+'|'+s.seat+'">'+ic('check',15)+'Abordó</button><span class="bdg gold">'+(waitInfo(t).el < 0 ? 'Por llegar' : 'Si no llega en '+Math.max(1,Math.ceil(WAIT_MIN - waitInfo(t).el))+' min, pierde el asiento')+'</span></div>';
  return '<div class="pax">'+av+'<div><div class="ph"><b>'+esc(s.name)+'</b><span class="seatno">Asiento '+s.seat+'</span></div>'+
    '<div class="meta"><span class="bdg ok">'+ic('check',11)+'DNI</span>'+(s.trusted?'<span class="bdg ok">'+ic('check',11)+'Pasajero confiable</span>':'')+'<span class="bdg mute">'+starI(11)+' '+(s.rating==null?'Nuevo':Number(s.rating).toFixed(1))+'</span>'+(s.phone?'<a class="bdg info" href="tel:'+esc(s.phone)+'">'+ic('phone',11)+fmtPhone(s.phone)+'</a>':'')+'</div>'+
    '<div class="meta"><span class="bdg '+(s.state==='pending'?'gold':'info')+'">'+ic('money',12)+(s.method==='plin'?'Plin':'Yape')+' · '+(s.state==='pending'?'Por confirmar'+(lead?' '+soles(s.amount||0)+(mates.length>1?' ('+mates.length+' asientos)':''):''):'Pagado')+'</span><span class="bdg mute mono">'+esc(s.code)+'</span></div>'+acts+'</div></div>';
}

/* ---------- en ruta: el GPS es el del celular del conductor */
function dTrip(){ const trips = myTrips(); return (F.dtrip && trips.find(t => t.id === F.dtrip)) || trips.find(t => t.status === 'started') || myNextTrip(); }
LOAD.d_live = async () => { await loadMyTrips(); const t = dTrip(); if (!t) return null; resumeGps(); return loadManifest(t); };
SCREENS.d_live = () => {
  const t = dTrip();
  if (!t) return top('En ruta', { back:false })+'<main class="scr"><div class="empty">'+ic('route',40)+'<h3 class="h-sec">Sin viaje en curso</h3><p>Cuando inicies una salida, tu ubicación se transmite a los pasajeros y a la central.</p><button class="btn sm" data-act="tab" data-arg="d_home">Ir al panel</button></div></main>';
  F.liveTrip = t.id;
  return top('En ruta', { back:false, sub: OFF[t.from].city+' → '+OFF[t.to].city+' · '+t.time })+'<main class="scr">'+liveView(t, 'd')+'</main>';
};
let gpsWarned = false;
function startWatch(tid){
  if (!navigator.geolocation) return toast('Tu navegador no tiene GPS.','bad');
  stopWatch(); GPSW.tripId = tid; GPSW.arrived = false;
  GPSW.id = navigator.geolocation.watchPosition(pos => {
    const c = pos.coords; const spd = c.speed != null && isFinite(c.speed) ? Math.round(c.speed*3.6) : null;
    DB_.live[tid] = { lat:c.latitude, lon:c.longitude, speed:spd || 0, at:new Date().toISOString() };
    const now = Date.now();
    if (now - GPSW.last >= 8000){ GPSW.last = now; POST('/trips/'+encodeURIComponent(tid)+'/location', { lat:c.latitude, lon:c.longitude, speed:spd }).then(() => { gpsWarned = false; }).catch(e => { if (e.status === 409) return stopWatch(); if (!gpsWarned){ gpsWarned = true; toast('No pudimos enviar tu ubicación. Revisa tu internet; seguimos intentando.','bad'); } }); }
    const t = trip(tid); if (t && !GPSW.arrived && liveOf(t).p >= 0.985 && t.status === 'started'){ GPSW.arrived = true; finishTripNow(tid, true); }
  }, err => { stopWatch(); toast(err && err.code === 1 ? 'Activa el permiso de ubicación del navegador para transmitir tu GPS.' : 'No pudimos leer tu GPS. Revisa que esté encendido.','bad'); if (cur().s === 'd_live') render(true); }, { enableHighAccuracy:true, maximumAge:5000, timeout:25000 });
}
function stopWatch(){ if (GPSW.id != null){ try{ navigator.geolocation.clearWatch(GPSW.id); }catch(e){} } GPSW.id = null; GPSW.tripId = null; }
async function finishTripNow(tid, auto){
  try{ await POST('/trips/'+encodeURIComponent(tid)+'/finish'); stopWatch(); const t = trip(tid); if (t) t.status = 'finished'; await loadMyTrips().catch(()=>{}); render(true); toast(auto ? 'Llegaste a tu destino. Viaje terminado.' : 'Viaje terminado. Ya puedes calificar a tus pasajeros.'); }
  catch(e){ GPSW.arrived = false; fail(e); }
}

LOAD.d_reviews = async () => { const r = await GET('/drivers/me/reviews'); DB_.revs.me = r.reviews; return r; };
SCREENS.d_reviews = () => top('Tus reseñas')+'<main class="scr"><section class="card">'+((DB_.revs.me||[]).map(revHTML).join('') || '<p class="muted">Sin reseñas aún.</p>')+'</section></main>';

/* ---------- perfil del conductor */
LOAD.d_profile = refreshMe;
SCREENS.d_profile = () => {
  const c = C(); const v = VT[c.veh.type]; const vs = vStatus('conductor');
  const docs = [['DNI', ME.dni], ['Licencia', c.lic.num ? c.lic.num+' · '+c.lic.cat : null], ['SOAT', c.soat.until ? 'Vence '+parseYmd(c.soat.until).toLocaleDateString('es-PE') : null], ['Revisión técnica', c.rt ? 'Vigente' : null], ['Antecedentes', c.ant ? 'Subido' : null], ['Cobro', [c.yape && 'Yape '+fmtPhone(c.yape), c.plin && 'Plin '+fmtPhone(c.plin)].filter(Boolean).join(' · ') || null]];
  return top('Perfil', { back:false })+
  '<main class="scr">'+
    '<section class="card" style="align-items:center;text-align:center">'+avatarMe(84)+'<div><h2 class="h-sec">'+esc(ME.name)+'</h2><small class="muted">'+esc(fmtPhone(ME.phone))+' · '+esc(ME.email)+'</small></div>'+verBadge({verified:vs.st==='approved'})+'</section>'+
    vBanner()+
    '<section class="card"><h3>Tu vehículo</h3>'+(c.veh.ext?'<img src="'+esc(c.veh.ext)+'" alt="Tu vehículo" style="border-radius:14px;aspect-ratio:16/10;object-fit:cover;width:100%">':vehSVG(c.veh.type, c.veh.color))+'<div class="kv"><span>'+esc(c.veh.model||v.label)+'</span><span class="plate">'+esc(c.veh.plate||'—')+'</span></div><small class="muted">'+v.desc+'</small></section>'+
    '<section class="card"><h3>Documentos</h3>'+docs.map(d => '<div class="kv"><span>'+d[0]+'</span>'+(d[1]?'<b>'+esc(d[1])+' <span style="color:var(--ok)">✓</span></b>':'<span class="bdg gold">Pendiente</span>')+'</div>').join('')+'<button class="btn sm line" data-act="nav" data-arg="verif">Actualizar documentos</button></section>'+
    '<button class="btn line" data-act="nav" data-arg="d_reviews">'+starI(18)+'Mis reseñas</button>'+
    (EDIT.can ? '<button class="btn dark" data-act="editOpen">'+ic('edit')+'Editar textos de la app</button>' : '')+
    '<button class="btn line" data-act="switchRole" data-arg="pasajero">'+ic('seat')+'Cambiar a modo pasajero</button>'+
    '<button class="btn line" data-act="logout">'+ic('logout')+'Cerrar sesión</button>'+
  '</main>';
};


/* =========================================================
   Administrador: resumen, revisión de documentos, usuarios, operación
   ========================================================= */
const ADM = () => DB_.adm;
LOAD.a_home = async () => { await refreshMe(); const r = await GET('/admin/summary'); DB_.adm.summary = r; return r; };
SCREENS.a_home = () => {
  const s = ADM().summary || { users:0, drivers:0, reviews:0, trips:0, bookings:0, pay_pending:0, revenue:0, incidents:0 };
  const tile = (n, label, sub, act, arg, hot) => '<button class="card tight" data-act="'+act+'" data-arg="'+arg+'" style="text-align:left'+(hot?';border-color:var(--gold)':'')+'"><div class="off"><span class="oi" style="'+(hot?'background:var(--gold);color:var(--ink)':'')+'">'+ic(n,22)+'</span><div><b>'+label+'</b><small>'+sub+'</small></div>'+ic('chev')+'</div></button>';
  return '<header class="top brand">'+logoH(32)+'<button class="ib" data-act="logout" aria-label="Cerrar sesión">'+ic('logout',20)+'</button></header>'+
  '<main class="scr">'+
    '<section class="dhead"><div class="who">'+avatarMe(52)+'<div><b>'+esc(ME.name)+'</b><div style="margin-top:3px"><span class="bdg info">Administrador</span></div></div></div>'+
      '<div class="kpis"><div><small>Usuarios</small><b>'+s.users+'</b></div><div><small>Conductores</small><b>'+s.drivers+'</b></div><div><small>Cobrado</small><b>'+soles(s.revenue).replace('S/ ','S/')+'</b></div></div></section>'+
    tile('shield','Revisiones pendientes', s.reviews+' por aprobar (selfie, DNI, documentos)','tab','a_review', s.reviews>0)+
    tile('money','Pagos por confirmar', s.pay_pending+' pendientes con los conductores','opsGo','pagos', s.pay_pending>0)+
    tile('alert','Incidentes abiertos', s.incidents+' (SOS y reportes de calificaciones bajas)','opsGo','incidentes', s.incidents>0)+
    tile('route','Viajes activos', s.trips+' publicados · '+s.bookings+' reservas confirmadas','opsGo','viajes', false)+
    (EDIT.can ? '<button class="btn dark" data-act="editOpen">'+ic('edit')+'Editar textos de la app</button>' : '')+
  '</main>';
};

const fileLink = (url, label) => /^\/api\/files\//.test(url||'') ? '<button class="thumb" data-act="viewFile" data-arg="'+esc(url)+'"><img src="'+esc(url)+'" alt="'+esc(label)+'" loading="lazy" onerror="this.parentNode.classList.add(\'pdf\');this.remove()"><span>'+esc(label)+'</span></button>' : '<span class="thumb none"><span>'+esc(label)+'<br>falta</span></span>';
LOAD.a_review = async () => { const r = await GET('/admin/reviews'); DB_.adm.reviews = r.reviews; return r; };
SCREENS.a_review = () => {
  const list = ADM().reviews || [];
  return top('Revisión', { back:false, sub:list.length+' por revisar' })+
  '<main class="scr">'+
    (list.length ? list.map(r => '<section class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>'+esc(r.name)+'</b><span class="bdg '+(r.role==='conductor'?'gold':'info')+'">'+(r.role==='conductor'?'Conductor':'Pasajero')+'</span></div>'+
      '<div class="kv"><span>DNI</span><b class="mono">'+esc(r.dni||'—')+'</b></div><div class="kv"><span>Correo</span><b style="font-size:13px">'+esc(r.email)+'</b></div><div class="kv"><span>Celular</span><b>'+esc(fmtPhone(r.phone))+'</b></div>'+
      (r.emerg ? '<div class="kv"><span>Emergencia</span><b style="font-size:13px">'+esc(r.emerg)+'</b></div>' : '')+
      Object.keys(r.data||{}).map(k => '<div class="kv"><span>'+esc(k)+'</span><b style="font-size:13px;text-align:right">'+esc(r.data[k])+'</b></div>').join('')+
      '<div class="thumbs">'+Object.keys(r.files||{}).map(k => fileLink(r.files[k], k)).join('')+'</div>'+
      '<p class="hint">Compara la selfie con la foto del DNI y revisa que cada documento se lea y esté vigente.</p>'+
      '<div class="actions2"><button class="btn ok" data-act="reviewDo" data-arg="'+r.userId+'|'+r.role+'|approve">'+ic('check',18)+'Aprobar</button><button class="btn line" data-act="reviewDo" data-arg="'+r.userId+'|'+r.role+'|reject">Rechazar</button></div></section>').join('')
      : '<div class="empty">'+ic('shield',40)+'<h3 class="h-sec">Todo al día</h3><p>No hay verificaciones pendientes.</p></div>')+
  '</main>';
};

LOAD.a_users = async () => { const r = await GET('/admin/users?q='+encodeURIComponent(F.uq||'')); DB_.adm.users = r.users; return r; };
SCREENS.a_users = () => {
  const list = ADM().users || [];
  return top('Usuarios', { back:false })+
  '<main class="scr">'+
    '<div class="row2" style="grid-template-columns:1fr auto;align-items:end">'+field('uq','Buscar por nombre, correo, DNI o celular',{ph:'Ej. juan', value:F.uq})+'<button class="btn" style="height:48px" data-act="usersSearch">Buscar</button></div>'+
    (list.length ? list.map(u => '<section class="card tight"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>'+esc(u.name)+'</b><span style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">'+(u.isAdmin?'<span class="bdg info">Admin</span>':'')+(u.driver?'<span class="bdg '+(u.driver==='approved'?'ok':'gold')+'">Conductor '+({approved:'aprobado',pending:'en revisión',draft:'incompleto',rejected:'rechazado'}[u.driver])+'</span>':'')+(u.pax==='approved'?'<span class="bdg ok">Confiable</span>':'')+(u.blocked?'<span class="bdg bad">Bloqueado</span>':'')+'</span></div>'+
      '<div class="kv"><span>Correo</span><b style="font-size:13px">'+esc(u.email)+'</b></div><div class="kv"><span>DNI · celular</span><b style="font-size:13px">'+esc(u.dni||'—')+' · '+esc(fmtPhone(u.phone)||'—')+'</b></div>'+
      (u.blocked && u.reason ? '<div class="note bad">'+ic('alert',18)+'<span>'+esc(u.reason)+'</span></div>' : '')+
      (u.isAdmin ? '' : '<button class="btn sm '+(u.blocked?'line':'')+'" data-act="'+(u.blocked?'unblockUser':'blockUser')+'" data-arg="'+u.id+'">'+(u.blocked?'Desbloquear cuenta':'Bloquear cuenta')+'</button>')+'</section>').join('') : '<div class="empty"><p>No encontramos usuarios con ese dato.</p></div>')+
  '</main>';
};

LOAD.a_ops = async () => {
  const tab = F.otab || 'pagos';
  if (tab === 'pagos'){ const r = await GET('/admin/payments?status='+(F.pstat||'pendiente')); DB_.adm.payments = r.payments; return r; }
  if (tab === 'viajes'){ const r = await GET('/admin/trips'); DB_.adm.trips = r.trips; return r; }
  const r = await GET('/admin/incidents'); DB_.adm.incidents = r.incidents; return r;
};
SCREENS.a_ops = () => {
  const tab = F.otab || 'pagos'; const A_ = ADM(); let body = '';
  if (tab === 'pagos'){
    const st = F.pstat || 'pendiente'; const list = A_.payments || [];
    body = '<div class="chips">'+['pendiente','confirmado','rechazado'].map(k => chip(k[0].toUpperCase()+k.slice(1)+'s', st===k, 'pstat', k)).join('')+'</div>'+
      (list.length ? list.map(p => '<section class="card tight"><div style="display:flex;justify-content:space-between;align-items:center"><b>'+soles(p.amount)+' · '+(p.method==='plin'?'Plin':'Yape')+'</b><span class="bdg '+(p.status==='confirmado'?'ok':p.status==='rechazado'?'bad':'gold')+'">'+p.status+'</span></div>'+
        '<div class="kv"><span>Pasajero → conductor</span><b style="font-size:13px;text-align:right">'+esc(shortName(p.passenger))+' → '+esc(shortName(p.driver))+'</b></div><div class="kv"><span>'+esc(p.trip)+'</span><b class="mono">'+esc(p.code)+'</b></div><div class="kv"><span>N.º de operación</span><b class="mono">'+esc(p.opNo)+'</b></div>'+(p.note?'<small class="muted">'+esc(p.note)+'</small>':'')+
        '<div class="actions2"><button class="btn xs line" data-act="viewFile" data-arg="'+esc(p.capture||'')+'">'+ic('doc',15)+'Ver captura</button>'+(p.status==='pendiente'?'<span></span>':'<span></span>')+'</div>'+
        (p.status==='pendiente' ? '<div class="actions2"><button class="btn xs ok" data-act="payOk" data-arg="'+p.id+'">'+ic('check',15)+'Confirmar</button><button class="btn xs red" data-act="payNo" data-arg="'+p.id+'">Rechazar</button></div>' : '')+'</section>').join('') : '<div class="empty"><p>No hay pagos '+st+'s.</p></div>');
  } else if (tab === 'viajes'){
    const list = A_.trips || [];
    body = list.length ? list.map(t => '<section class="card tight"><div class="kv"><b style="text-align:left">'+OFF[t.from].city+' → '+OFF[t.to].city+'</b><span class="bdg '+(t.status==='cancelled'?'bad':t.status==='finished'?'mute':'ok')+'">'+({active:'Activo',started:'En curso',finished:'Terminado',cancelled:'Cancelado'}[t.status])+'</span></div>'+
      '<div class="kv"><span>'+dayLabel(t.date)+' · '+t.time+'</span><b>'+t.sold+' de '+t.seats+' · '+soles(t.price)+'</b></div><div class="kv"><span>Conductor</span><b style="font-size:13px">'+esc(t.driverName)+' · <span class="mono">'+esc(t.plate)+'</span></b></div>'+
      (t.status==='active'||t.status==='started' ? '<button class="link" data-act="adminCancelTrip" data-arg="'+esc(t.id)+'" style="align-self:flex-start;color:var(--bad)">Cancelar viaje</button>' : '')+'</section>').join('') : '<div class="empty"><p>Aún no hay viajes publicados.</p></div>';
  } else {
    const list = A_.incidents || [];
    body = list.length ? list.map(i => '<section class="card tight" style="'+(i.status==='abierto'?'border-color:var(--bad)':'')+'"><div class="kv"><b style="text-align:left;color:'+(i.kind==='sos'?'var(--bad)':'var(--ink)')+'">'+(i.kind==='sos'?'SOS':'Reporte de calificación')+'</b><span class="bdg '+(i.status==='abierto'?'bad':'ok')+'">'+i.status+'</span></div>'+
      '<div class="kv"><span>Usuario</span><b style="font-size:13px">'+esc(i.user||'—')+(i.phone?' · <a href="tel:'+esc(i.phone)+'">'+esc(fmtPhone(i.phone))+'</a>':'')+'</b></div>'+(i.trip?'<div class="kv"><span>'+esc(i.trip)+'</span><b style="font-size:13px">'+esc(i.driver||'')+' · <span class="mono">'+esc(i.plate||'')+'</span></b></div>':'')+
      ((i.issues||[]).length ? '<div class="tags">'+i.issues.map(x => '<span class="bdg bad">'+esc(x)+'</span>').join('')+'</div>' : '')+
      (i.lat!=null ? '<a class="btn xs line" href="https://www.google.com/maps?q='+i.lat+','+i.lon+'" target="_blank" rel="noopener">'+ic('pin',15)+'Ver ubicación</a>' : '')+'<small class="muted">'+agoTxt(i.at)+'</small>'+
      (i.status==='abierto' ? '<button class="btn sm dark" data-act="resolveInc" data-arg="'+i.id+'">Marcar como resuelto</button>' : '')+'</section>').join('') : '<div class="empty"><p>No hay incidentes.</p></div>';
  }
  return top('Operación', { back:false })+
  '<main class="scr"><div class="seg">'+[['pagos','Pagos'],['viajes','Viajes'],['incidentes','Incidentes']].map(x => '<button data-act="otab" data-arg="'+x[0]+'" aria-pressed="'+(tab===x[0])+'">'+x[1]+'</button>').join('')+'</div>'+body+'</main>';
};


SCREENS.welcome = () => {
  const accs = ME ? (ME.isAdmin ? ['admin'] : ['pasajero'].concat(ME.driver ? ['conductor'] : [])) : [];
  const names = { pasajero:'Cuenta de pasajero', conductor:'Cuenta de conductor', admin:'Administrador' };
  return '<div class="onb">'+
    '<div class="onb-top">'+logoH(40)+'</div>'+
    '<div class="onb-mid" style="justify-content:flex-start;padding-top:28px"><h2 class="h-hero">¿Qué quieres hacer?</h2>'+
      (ME && ME.isAdmin ? '' : '<button class="choice" data-act="start" data-arg="pasajero"><span class="ci">'+ic('seat',28)+'</span><span><b>Quiero viajar</b><small>Reservo mi asiento</small></span>'+ic('chev',24)+'</button>'+
      '<button class="choice dark" data-act="start" data-arg="conductor"><span class="ci">'+ic('wheel',28)+'</span><span><b>Quiero manejar</b><small>Publico mis viajes</small></span>'+ic('chev',24)+'</button>')+
      accs.map(r => '<button class="choice line" data-act="continueAs" data-arg="'+r+'"><span class="ci">'+avatarMe(44)+'</span><span><b>Seguir como '+esc(firstName(ME.name))+'</b><small>'+names[r]+'</small></span>'+ic('chev',24)+'</button>').join('')+
    '</div>'+
    '<div class="onb-bot" style="align-items:center">'+(ME ? '' : '<span class="muted">¿Ya tienes cuenta? <button class="link" data-act="start" data-arg="">Ingresar</button></span>')+'<button class="link" data-act="nav" data-arg="landing" style="color:var(--muted)">¿Qué es VIP Ruta Segura?</button></div>'+
  '</div>';
};

/* =========================================================
   Navegación y render (cada pantalla pide sus datos al servidor)
   ========================================================= */
function cur(){ return stack[stack.length-1] || { s:'welcome', p:{} }; }
function allowed(s){
  if (s.indexOf('p_') === 0) return !!ME && !ME.isAdmin;
  if (s.indexOf('d_') === 0) return !!(ME && ME.driver);
  if (s.indexOf('a_') === 0) return !!(ME && ME.isAdmin);
  if (s === 'verif' || s === 'ready') return !!ME;
  return true;
}
const isTab = s => TABS.indexOf(s) >= 0;
const loadingHTML = s => '<main class="scr"><div class="proc"><div class="spin"></div><p class="muted">Cargando…</p></div></main>'+(isTab(s) ? navBar(s) : '');
const errorHTML = c => top('Algo salió mal', { back:stack.length > 1 })+'<main class="scr"><div class="empty">'+ic('wifi',40)+'<h3 class="h-sec">No pudimos cargar esta pantalla</h3><p>'+esc(c.err)+'</p><button class="btn sm" data-act="retry">Reintentar</button></div></main>'+(isTab(c.s) ? navBar(c.s) : '');
function render(keepScroll){
  const c = cur(); const prev = app.querySelector('.scr'); const st = keepScroll && prev ? prev.scrollTop : 0;
  if (!allowed(c.s)){ const r = ME ? (ME.isAdmin ? 'admin' : (S.role === 'conductor' && ME.driver ? 'conductor' : 'pasajero')) : null; stack = [{ s: r ? homeOf(r) : 'welcome' }]; return render(); }
  if (LOAD[c.s] && !c.loaded){
    if (!c.loading){ c.loading = true; runLoad(c); }
    app.innerHTML = loadingHTML(c.s); return;
  }
  app.innerHTML = c.err && LOAD[c.s] && !c.ok ? errorHTML(c) : SCREENS[c.s](c.p || {}) + (isTab(c.s) ? navBar(c.s) : '');
  const sc = app.querySelector('.scr'); if (sc) sc.scrollTop = st;
  if (AFTER[c.s]) AFTER[c.s](c.p || {});
  applyTexts(app); renderEditUI();
  renderSide();
}
async function runLoad(c){
  try{ c.sig = JSON.stringify(await LOAD[c.s](c.p || {})); c.err = null; c.ok = true; }
  catch(e){ if (e.status === 401){ c.loading = false; return fail(e); } c.err = e.message; if (cur() === c) toast(esc(e.message),'bad'); }
  c.loading = false; c.loaded = true; c.lastPoll = Date.now();
  if (cur() === c) render();
}
let pollWarned = false;   // un solo aviso mientras dure la falla; se rearma cuando vuelve a funcionar
async function silentRefresh(c, force){
  if (!c || !LOAD[c.s] || c.loading || c.refreshing) return;
  c.refreshing = true;
  try{
    const sig = JSON.stringify(await LOAD[c.s](c.p || {})); c.err = null; c.ok = true; pollWarned = false;
    if (cur() === c && (force || sig !== c.sig)){ c.sig = sig; render(true); } else c.sig = sig;
  }catch(e){ if (e.status === 401) fail(e); else if (!pollWarned && cur() === c){ pollWarned = true; toast(esc(e.message),'bad'); } }
  finally{ c.refreshing = false; c.lastPoll = Date.now(); }
}
const refreshCur = () => silentRefresh(cur(), true);
function reload(){ const c = cur(); c.loaded = false; c.loading = false; c.ok = false; render(); }
function go(s, p){ stack.push({ s, p:p||{} }); render(); }
function tabTo(s){ stack = [{ s, p:{} }]; render(); }

/* ---------- avisos y hojas */
let toastT = null;
function toast(msg, kind){
  const old = phone.querySelector('.toast'); if (old) old.remove();
  const el = document.createElement('div'); el.className = 'toast '+(kind||'ok'); el.setAttribute('role','status');
  el.innerHTML = ic(kind==='bad'?'alert':kind==='gold'?'info':'check',20)+'<span>'+msg+'</span>';
  if (!app.querySelector('.nav') && !app.querySelector('.bar')) el.style.bottom = '20px';
  applyTexts(el); phone.appendChild(el); clearTimeout(toastT); toastT = setTimeout(() => el.remove(), kind === 'bad' ? 5200 : 3600);
}
function sheet(html){ closeSheet(); const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>'+html+'</div>'; bg.addEventListener('click', e => { if (e.target === bg) closeSheet(); }); if (!bg.querySelector('.txed')) applyTexts(bg); phone.appendChild(bg); const f = bg.querySelector('button,a,input,textarea'); if (f) f.focus(); }
function closeSheet(){ stopScan(); const s = phone.querySelector('.sheet-bg'); if (s) s.remove(); }
function confirmSheet(title, text, okLabel, onOk, danger){
  sheet('<h3>'+title+'</h3><p style="color:var(--ink2)">'+text+'</p><div class="actions2"><button class="btn line" data-act="closeSheet">Cancelar</button><button class="btn '+(danger?'red':'dark')+'" id="cs-ok">'+okLabel+'</button></div>');
  document.getElementById('cs-ok').addEventListener('click', () => { closeSheet(); onOk(); });
}
// Hoja con un cuadro de texto (motivo de rechazo, bloqueo, etc.)
function reasonSheet(title, text, okLabel, onOk){
  sheet('<h3>'+title+'</h3><p style="color:var(--ink2);font-size:14px">'+text+'</p><div class="fld"><textarea id="f-reason" rows="3" maxlength="160" placeholder="Escribe el motivo"></textarea></div><div class="actions2"><button class="btn line" data-act="closeSheet">Cancelar</button><button class="btn red" id="rs-ok">'+okLabel+'</button></div>');
  document.getElementById('rs-ok').addEventListener('click', () => { const v = document.getElementById('f-reason').value.trim(); if (v.length < 3) return toast('Escribe el motivo.','bad'); closeSheet(); onOk(v); });
}
function copyText(txt, okMsg){
  if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(() => toast(okMsg || 'Mensaje copiado. Pégalo en WhatsApp o SMS.'), () => fallbackCopy(txt)); }
  else fallbackCopy(txt);
}
function fallbackCopy(txt){ const box = phone.querySelector('.msgbox'); if (box){ const r = document.createRange(); r.selectNodeContents(box); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); toast('Texto seleccionado. Cópialo manualmente.','gold'); } else toast('Cópialo manualmente: '+esc(txt),'gold'); }

/* ---------- ubicación del celular (para compartir y SOS) */
function tryGeo(){ if (!navigator.geolocation) return; try{ navigator.geolocation.getCurrentPosition(p => { GEO = { lat:p.coords.latitude, lon:p.coords.longitude, acc:p.coords.accuracy, t:Date.now() }; }, () => {}, { enableHighAccuracy:true, timeout:8000, maximumAge:30000 }); }catch(e){} }
function curPos(t){
  if (GEO && Date.now() - GEO.t < 120000) return { lat:GEO.lat, lon:GEO.lon, src:'del GPS de tu celular' };
  const l = DB_.live[t.id]; if (l && l.lat != null) return { lat:l.lat, lon:l.lon, src:'del GPS de la unidad' };
  const o = t.from === 'tru' ? ROUTE[0] : ROUTE[ROUTE.length-1]; return { lat:o.lat, lon:o.lon, src:'de la oficina de salida (aún no hay GPS)' };
}
function shareMsg(t){
  const d = driverFor(t), L = liveOf(t), pos = curPos(t);
  const url = 'https://www.google.com/maps?q='+pos.lat.toFixed(5)+','+pos.lon.toFixed(5);
  const eta = L.run && L.has ? addMin(pad(new Date().getHours())+':'+pad(new Date().getMinutes()), Math.round((1-L.p)*TRIP_MIN)) : addMin(t.time, TRIP_MIN);
  return 'Hola, estoy viajando con VIP Ruta Segura de '+OFF[t.from].city+' a '+OFF[t.to].city+'.\nUnidad: '+d.model+', placa '+d.plate+'.\nConductor: '+d.name+(d.verified?' (verificado)':'')+'.\nSalida '+t.time+', llegada aprox. '+eta+'.\nMi ubicación ahora: '+url;
}

/* ---------- escáner de QR (cámara del conductor) */
const SCANR = { stream:null, timer:null, busy:false };
function stopScan(){ if (SCANR.timer){ clearInterval(SCANR.timer); SCANR.timer = null; } if (SCANR.stream){ SCANR.stream.getTracks().forEach(t => t.stop()); SCANR.stream = null; } SCANR.busy = false; }
async function startScan(tid){
  const msg = document.getElementById('scanmsg'), vid = document.getElementById('scanv');
  const say = (m, bad) => { const e = document.getElementById('scanmsg'); if (e){ e.textContent = m; e.className = 'hint'+(bad?' err':''); } };
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return say('Este navegador no abre la cámara. Escribe el código del boleto abajo.', true);
  try{ SCANR.stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:false }); }
  catch(e){ return say('No pudimos abrir la cámara. Da permiso al navegador o escribe el código abajo.', true); }
  if (!vid || !document.getElementById('scanv')){ stopScan(); return; }
  vid.srcObject = SCANR.stream; try{ await vid.play(); }catch(e){}
  const det = ('BarcodeDetector' in window) ? new window.BarcodeDetector({ formats:['qr_code'] }) : null;
  const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently:true });
  say('Apunta al QR del boleto…');
  SCANR.timer = setInterval(async () => {
    if (SCANR.busy || !vid.videoWidth) return;
    let text = null;
    try{
      if (det){ const r = await det.detect(vid); if (r && r.length) text = r[0].rawValue; }
      else if (window.jsQR){ cv.width = vid.videoWidth; cv.height = vid.videoHeight; cx.drawImage(vid, 0, 0); const im = cx.getImageData(0, 0, cv.width, cv.height); const q = window.jsQR(im.data, im.width, im.height); if (q) text = q.data; }
    }catch(e){}
    if (text){ SCANR.busy = true; await boardByCode(tid, text); setTimeout(() => { SCANR.busy = false; }, 2500); }
  }, 350);
}
async function boardByCode(tid, text){
  const say = (m, bad) => { const e = document.getElementById('scanmsg'); if (e){ e.textContent = m; e.className = 'hint'+(bad?' err':''); } };
  try{
    const r = await POST('/trips/'+encodeURIComponent(tid)+'/board', { code:text });
    say((r.already ? 'Ya había abordado: ' : 'Abordó: ')+r.name+' · asiento '+r.seats.join(', ')+'.');
    toast((r.already ? 'Ya estaba a bordo: ' : 'Abordó: ')+esc(firstName(r.name))+' · asiento '+r.seats.join(', ')+'.');
    silentRefresh(cur(), true);
  }catch(e){ say(e.message, true); toast(esc(e.message),'bad'); }
}


/* =========================================================
   Acciones (todas hablan con el servidor)
   ========================================================= */
const ACT = {};
ACT.back = () => {
  closeSheet();
  if (cur().s === 'reg' && (F.step||1) > 1){ if (F.step === 2 && F.otpSent){ F.otpSent = false; F.otp = ''; } else F.step--; return render(); }
  if (stack.length > 1){ stack.pop(); const c = cur(); if (LOAD[c.s] && c.loaded) silentRefresh(c, true); else render(); }
  else if (ME){ tabTo(homeOf(S.role || 'pasajero')); } else { stack = [{ s:'welcome' }]; render(); }
};
ACT.nav = (s) => { if (s === 'verif') return go('verif', { role: S.role === 'conductor' ? 'conductor' : 'pasajero' }); go(s); };
ACT.tab = (s) => tabTo(s);
ACT.closeSheet = () => closeSheet();
ACT.retry = () => reload();
ACT.start = (role) => {
  if (!role){ F = {}; return go('login'); }
  if (ME){ if (role === 'conductor' && !ME.driver) return becomeDriver(); S.role = role; save(); return tabTo(homeOf(role)); }
  F = { role, step:1 }; go('reg', { role });
};
ACT.onbNext = () => { if ((F.slide||0) < SLIDES.length-1){ F.slide = (F.slide||0) + 1; render(); } else ACT.onbDone(); };
ACT.onbDone = () => { S.seenOnb = true; save(); F = {}; stack = [{ s:'welcome' }]; render(); };

/* registro */
ACT.regChangeDni = () => { F.dniToken = null; F.name = ''; F.dni = ''; render(); };
ACT.regChangeEmail = () => { F.otpSent = false; F.otp = ''; render(); };
ACT.regShowPass = () => { F.showPass = !F.showPass; render(true); };
ACT.regSend = () => once(async () => { await POST('/auth/code', { email:(F.email||'').trim().toLowerCase() }); F.otp = ''; render(true); toast('Te enviamos otro código a tu correo.','gold'); });
ACT.regNext = () => once(async () => {
  if (!regStepValid()) return;
  const st = F.step || 1;
  if (st === 1){
    if (!F.dniToken){ const r = await POST('/dni', { dni:F.dni }); F.dniToken = r.dniToken; F.name = r.name; return render(true); }
    F.step = 2; return render();
  }
  if (st === 2){
    const email = (F.email||'').trim().toLowerCase();
    if (!F.otpSent){ await POST('/auth/code', { email }); F.otpSent = true; F.otp = ''; render(); return toast('Te enviamos un código a tu correo. Revisa también el spam.','gold'); }
    const r = await POST('/auth/verify', { email, code:F.otp }); F.emailToken = r.emailToken; F.otpSent = false; F.step = 3; render(); return toast('Correo verificado.');
  }
  if (st === 3){ F.step = 4; return render(); }
  const rem = document.getElementById('f-rem'); const remember = rem ? rem.checked : true;
  const r = await POST('/auth/register', { dniToken:F.dniToken, emailToken:F.emailToken, phone:F.phone, password:F.pass, role:F.role, remember });
  ME = r.me; S.role = F.role; save(); F = {}; stack = [{ s:'ready' }]; render();
});
ACT.driverDocs = () => { stack = [{ s:'d_home' }, { s:'verif', p:{ role:'conductor' } }]; render(); };
ACT.doLogin = () => once(async () => {
  const err = document.getElementById('lerr'); if (err) err.textContent = '';
  let r;
  try{ r = await POST('/auth/login', { email:(F.lemail||'').trim(), password:F.lpass||'' }); }
  catch(e){ if (err) err.textContent = e.message; toast(esc(e.message),'bad'); return; }
  ME = r.me; F = {};
  if (ME.isAdmin) S.role = 'admin'; else if (S.role === 'admin') S.role = null; else if (S.role === 'conductor' && !ME.driver) S.role = 'pasajero';
  save();
  if (!ME.isAdmin && ME.driver && S.role !== 'pasajero' && S.role !== 'conductor'){ stack = [{ s:'welcome' }]; render(); }
  else { if (!S.role) S.role = 'pasajero'; save(); tabTo(homeOf(S.role)); }
  toast('Hola de nuevo, '+esc(firstName(ME.name))+'.');
});
ACT.continueAs = (r) => { S.role = r; save(); F = {}; tabTo(homeOf(r)); };
async function becomeDriver(){
  await once(async () => { const r = await POST('/me/driver'); ME = r.me; S.role = 'conductor'; save(); stack = [{ s:'d_home' }, { s:'verif', p:{ role:'conductor' } }]; render(); toast('Perfil de conductor creado. Sube tus documentos para que los revisemos.','gold'); });
}
ACT.switchRole = (r) => {
  closeSheet();
  if (r === 'conductor' && !ME.driver) return confirmSheet('¿Quieres manejar con VIP?', 'Crearemos tu perfil de conductor. Tendrás que subir tus documentos y esperar la aprobación del administrador.', 'Sí, quiero manejar', becomeDriver);
  S.role = r; save(); F = {}; tabTo(homeOf(r)); toast('Modo '+r+' activado.');
};
ACT.logout = () => confirmSheet('¿Cerrar sesión?', 'Tus reservas y datos quedan guardados en tu cuenta.', 'Cerrar sesión', async () => {
  let lo = null; try{ await POST('/auth/logout'); }catch(e){ lo = e; }
  stopWatch(); ME = null; S.role = null; save(); F = {}; hold = { tripId:null, bookingId:null, seats:[], until:0 }; stack = [{ s:'welcome' }]; render();
  if (lo) toast('No pudimos cerrar tu sesión en el servidor. Si al volver sigues dentro, cierra sesión otra vez.','bad');
});

/* verificación */
ACT.vopen = (k) => { F.vopen = F.vopen === k ? null : k; render(true); };
ACT.saveEmerg = () => once(async () => {
  const n = (F.ename != null ? F.ename : ME.emerg.name).trim(), ph = F.ephone != null ? F.ephone : ME.emerg.phone;
  if (n.length < 2) return toast('Escribe el nombre de tu contacto.','bad'); if (!/^9\d{8}$/.test(ph)) return toast('El celular debe tener 9 dígitos y empezar con 9.','bad');
  const r = await PUT('/me/profile', { emerg:{ name:n, phone:ph } }); ME = r.me; F.vopen = null; render(true); toast('Contacto de emergencia guardado.');
});
async function putDriver(body, okMsg){ const r = await PUT('/me/driver', body); ME = r.me; F.vopen = null; render(true); toast(okMsg); }
ACT.saveLic = () => once(async () => { const c = C(); const num = (F.licnum != null ? F.licnum : c.lic.num).toUpperCase().trim(); await putDriver({ lic_num:num, lic_cat:F.liccat || c.lic.cat }, c.lic.file ? 'Licencia guardada.' : 'Datos guardados. Falta subir la foto de la licencia.'); });
ACT.vtypeReg = (x) => { F.vtype = x; render(true); };
ACT.saveVeh = () => once(async () => { const c = C(); await putDriver({ vtype:F.vtype || c.veh.type, model:F.vmodel != null ? F.vmodel : c.veh.model, plate:(F.vplate != null ? F.vplate : c.veh.plate).toUpperCase().trim() }, 'Vehículo guardado.'); });
ACT.saveSoat = () => once(async () => { const c = C(); const rt = document.getElementById('f-rt'); await putDriver({ soat_until:F.soat != null ? F.soat : c.soat.until, rt_ok:!!(rt && rt.checked) }, 'SOAT y revisión técnica guardados.'); });
ACT.savePay = () => once(async () => { const c = C(); const y = F.yape != null ? F.yape : c.yape, p = F.plin != null ? F.plin : c.plin; if (!y && !p) return toast('Pon al menos un número de Yape o Plin.','bad'); await putDriver({ yape_phone:y||'', plin_phone:p||'' }, 'Listo: te pagarán a ese número.'); });
ACT.submitReview = (role) => once(async () => { const r = await POST('/me/submit', { role }); ME = r.me; render(true); toast('Enviado. El administrador lo revisará y te avisamos por correo.'); });

/* búsqueda */
ACT.swap = () => { S.search.from = S.search.from === 'tru' ? 'chi' : 'tru'; save(); render(true); };
ACT.swap2 = () => { S.search.from = S.search.from === 'tru' ? 'chi' : 'tru'; save(); reload(); };
ACT.date = (d) => { S.search.date = d; save(); render(true); };
ACT.vtype = (k) => { S.search.type = k; save(); render(true); };
ACT.vtypeR = (k) => { S.search.type = k; save(); render(true); };
ACT.pax = (n) => { S.search.pax = Math.max(1, Math.min(8, S.search.pax + Number(n))); save(); render(true); };
ACT.search = () => go('p_results');
ACT.open = (id) => { F.vtab = 'ext'; go('p_trip', { id }); };
ACT.vtab = (x) => { F.vtab = x; render(true); };

/* asientos: se guardan en el servidor 10 minutos; si otra persona lo toma antes, avisa */
ACT.toSeats = (id) => { hold = { tripId:id, bookingId:null, seats:[], until:0 }; go('p_seats', { id }); };
async function holdSeats(t, want){
  try{
    const r = await POST('/trips/'+encodeURIComponent(t.id)+'/hold', { seats:want });
    setSeatState(t, r.seatState); syncHold(t); return r;
  }catch(e){
    if (e.status === 409 && e.data && e.data.taken){
      toast(esc(e.message),'bad');
      try{ const r = await GET('/trips/'+encodeURIComponent(t.id)+'/seats'); setSeatState(t, r.seatState); syncHold(t); }catch(_){}
      render(true); return null;
    }
    throw e;
  }
}
ACT.seat = (n) => once(async () => {
  n = Number(n); const t = trip(hold.tripId); const si = seatInfo(t);
  if (si.mine.indexOf(n) >= 0 && si.holding.indexOf(n) < 0) return toast('Este asiento ya es tuyo.','bad');
  if (si.occupied.indexOf(n) >= 0 && si.holding.indexOf(n) < 0){ toast('Este asiento ya fue reservado. Elige otro.','bad'); try{ const r = await GET('/trips/'+encodeURIComponent(t.id)+'/seats'); setSeatState(t, r.seatState); syncHold(t); }catch(_){} return render(true); }
  const want = si.holding.slice(); const i = want.indexOf(n); const adding = i < 0; if (adding) want.push(n); else want.splice(i,1);
  const r = await holdSeats(t, want); if (!r) return;
  render(true);
  const left = t.seats - seatInfo(t).occupied.length;
  toast(adding ? 'Asiento '+n+' reservado. Quedan '+left+' asiento'+(left===1?'':'s')+'.' : 'Asiento '+n+' liberado.', adding ? 'ok' : 'gold');
});
ACT.fullVeh = () => once(async () => {
  const t = trip(hold.tripId); const si = seatInfo(t);
  if (si.occupied.length - si.holding.length) return;
  const all = Array.from({length:t.seats}, (_,i) => i+1); const full = si.holding.length === t.seats;
  const r = await holdSeats(t, full ? [] : all); if (!r) return; render(true);
  if (!full) toast('Vehículo completo: '+t.seats+' asientos con 15 % de descuento.');
});
ACT.toPay = () => { if (!hold.seats.length) return; go('p_pay'); };
ACT.method = (m) => { F.method = m; render(true); };
ACT.copyNum = (n) => copyText(n, 'Número copiado. Pégalo en tu app Yape o Plin.');
ACT.pay = () => once(async () => {
  if (!payValid()) return; const t = trip(hold.tripId);
  if (!hold.bookingId) return toast('Tu reserva expiró. Vuelve a elegir tu asiento.','bad');
  sheet('<div class="proc"><div class="spin"></div><h3>Enviando tu comprobante…</h3><p class="muted">No cierres la app.</p></div>');
  let r;
  try{ r = await POST('/bookings/'+hold.bookingId+'/pay', { method:F.method, opNo:F.opno.trim(), capture:F.capture }); }
  catch(e){ closeSheet(); if (e.status === 409){ render(true); } throw e; }
  closeSheet(); F.opno = ''; F.capture = null; const bid = r.booking.id;
  hold = { tripId:null, bookingId:null, seats:[], until:0 };
  stack = [{ s:'p_home' }, { s:'p_ticket', p:{ bid, fresh:true } }]; render();
  toast('Comprobante enviado. El conductor lo confirmará en breve.','gold');
});
ACT.ticket = (bid) => go('p_ticket', { bid });
ACT.liveB = (bid) => { if (S.role !== 'pasajero') return; tryGeo(); go('p_live', { bid }); };
ACT.follow = () => { F.follow = !F.follow; render(true); };
ACT.share = (id) => {
  const t = trip(id); tryGeo(); const a = P(); const msg = shareMsg(t);
  const num = a && a.emerg && a.emerg.phone ? '51'+a.emerg.phone : '';
  const sharing = S.sharing && S.sharing.tripId === t.id;
  sheet('<h3>Comparte tu viaje</h3><p class="muted" style="font-size:14px">Tu ubicación sale '+curPos(t).src+'.</p><div class="msgbox" id="sharemsg">'+esc(msg)+'</div>'+
    '<a class="btn ok" href="https://wa.me/'+num+'?text='+encodeURIComponent(msg)+'" target="_blank" rel="noopener">'+ic('chat',18)+'Enviar por WhatsApp'+(a && a.emerg.name ? ' a '+esc(a.emerg.name) : '')+'</a>'+
    '<div class="actions2"><button class="btn line" data-act="copyShare" data-arg="'+esc(t.id)+'">'+ic('copy',18)+'Copiar</button><button class="btn '+(sharing?'line':'dark')+'" data-act="toggleShare" data-arg="'+esc(t.id)+'">'+(sharing?'Dejar de compartir':'Marcar como compartido')+'</button></div>'+
    (a && !a.emerg.name ? '<p class="hint">Agrega un contacto de emergencia en tu perfil para enviárselo directo.</p>' : ''));
};
ACT.copyShare = (id) => copyText(shareMsg(trip(id)));
ACT.toggleShare = (id) => { if (S.sharing && S.sharing.tripId === id){ S.sharing = null; toast('Dejaste de compartir tu viaje.','gold'); } else { S.sharing = { tripId:id, name:(P() && P().emerg.name) || 'tu contacto', since:Date.now() }; toast('Viaje compartido con '+esc(S.sharing.name)+'.'); } save(); closeSheet(); render(true); };
ACT.stopShare = () => { S.sharing = null; save(); render(true); };
ACT.sos = (id) => {
  const t = trip(id); tryGeo(); const a = P() || { emerg:{} }; const pos = curPos(t); const d = driverFor(t);
  const msg = 'ALERTA VIP Ruta Segura: necesito ayuda. Voy de '+OFF[t.from].city+' a '+OFF[t.to].city+' en '+d.model+' placa '+d.plate+'. Mi ubicación: https://www.google.com/maps?q='+pos.lat.toFixed(5)+','+pos.lon.toFixed(5);
  const num = a.emerg && a.emerg.phone ? '51'+a.emerg.phone : '';
  sheet('<h3 style="color:var(--bad)">Botón SOS</h3><p style="color:var(--ink2);font-size:14px">Envía tu ubicación y los datos de la unidad. Si estás en peligro, llama a emergencias.</p>'+
    '<a class="btn red" href="https://wa.me/'+num+'?text='+encodeURIComponent(msg)+'" target="_blank" rel="noopener">'+ic('alert',18)+'Alertar por WhatsApp'+(a.emerg && a.emerg.name ? ' a '+esc(a.emerg.name) : '')+'</a>'+
    '<button class="btn dark" data-act="reportCentral" data-arg="'+esc(t.id)+'">'+ic('flag',18)+'Avisar a la central VIP</button>'+
    '<div class="emerg"><div><b>105</b><small>Policía</small></div><div><b>116</b><small>Bomberos</small></div><div><b>106</b><small>SAMU</small></div></div>'+
    '<p class="hint">Marca estos números desde tu teléfono. La app no hace la llamada por ti.</p>');
};
ACT.reportCentral = (id) => once(async () => { const pos = curPos(trip(id)); await POST('/incidents', { tripId:id, lat:pos.lat, lon:pos.lon }); closeSheet(); toast('Alerta enviada a la central VIP con tu ubicación.','gold'); });

/* calificación */
ACT.rate = (bid) => { F.rs = 0; F.rtags = []; F.rbad = []; F.rtext = ''; go('p_rate', { bid }); };
ACT.rstar = (n) => { F.rs = Number(n); render(true); };
ACT.rtag = (x) => { F.rtags = F.rtags || []; const i = F.rtags.indexOf(x); if (i >= 0) F.rtags.splice(i,1); else F.rtags.push(x); render(true); };
ACT.rbad = (x) => { F.rbad = F.rbad || []; const i = F.rbad.indexOf(x); if (i >= 0) F.rbad.splice(i,1); else F.rbad.push(x); render(true); };
ACT.sendRate = (bid) => once(async () => {
  if (!F.rs) return;
  await POST('/bookings/'+encodeURIComponent(bid)+'/rate', { stars:F.rs, tags:F.rtags||[], flags:F.rbad||[], comment:(F.rtext||'').trim() });
  F.rs = 0; F.rtags = []; F.rbad = []; F.rtext = ''; F.ttab = 'past'; stack = [{ s:'p_trips' }]; render();
  toast('Gracias. Tu calificación ya aparece en el perfil del conductor.');
});
ACT.ttab = (x) => { F.ttab = x; render(true); };

/* conductor: viajes */
ACT.cfrom = (k) => { F.cfrom = k; render(true); };
const clearTripForm = () => ['cfrom','cdate','ctime','cprice','cseats','editTrip'].forEach(k => delete F[k]);
ACT.newTrip = () => { if (!driverOk()) return toast('Primero completa tu verificación y espera la aprobación.','bad'); clearTripForm(); go('d_create'); };
ACT.editTrip = (id) => { clearTripForm(); F.editTrip = id; go('d_create'); };
ACT.publish = () => once(async () => {
  const err = document.getElementById('cerr'); const bad = m => { if (err){ err.textContent = m; err.className = 'hint err'; } toast(esc(m),'bad'); };
  const ed = F.editTrip ? trip(F.editTrip) : null; const v = VT[ed ? ed.vtype : C().veh.type];
  const price = Number(F.cprice), seats = Math.round(Number(F.cseats));
  if (!F.cdate || daysFromToday(F.cdate) < 0) return bad('Elige una fecha de hoy en adelante.');
  if (!/^\d{2}:\d{2}$/.test(F.ctime||'')) return bad('Escribe la hora de salida.');
  if (depDate({ date:F.cdate, time:F.ctime }) < new Date()) return bad('Esa hora ya pasó. Elige una hora futura.');
  if (!(price >= 20 && price <= 120)) return bad('El precio debe estar entre S/ 20 y S/ 120.');
  if (!(seats >= 1 && seats <= v.seats)) return bad('Puedes ofrecer de 1 a '+v.seats+' asientos.');
  if (ed) await PUT('/trips/'+encodeURIComponent(ed.id), { date:F.cdate, time:F.ctime, price, seats });
  else await POST('/trips', { from:F.cfrom || 'tru', date:F.cdate, time:F.ctime, price, seats });
  clearTripForm(); stack = [{ s:'d_home' }]; render();
  toast(ed ? 'Cambios guardados. Avisamos por correo a quienes ya reservaron.' : 'Viaje publicado. Ya aparece en las búsquedas de pasajeros.');
});
ACT.cancelTrip = (id) => { const t = trip(id); confirmSheet('¿Cancelar este viaje?', 'Salida '+t.date+' · '+t.time+'. Los pasajeros con reserva recibirán un correo y sus asientos se liberan. Si ya pagaron, tendrás que devolverles el dinero.', 'Sí, cancelar viaje', () => once(async () => { await POST('/trips/'+encodeURIComponent(id)+'/cancel', {}); await loadMyTrips(); render(true); toast('Viaje cancelado. Avisamos a los pasajeros.','gold'); }), true); };
ACT.manifestOf = (id) => { F.mtrip = id; tabTo('d_manifest'); };
ACT.mtrip = (id) => { F.mtrip = id; reload(); };
ACT.driveOf = (id) => { F.dtrip = id; tabTo('d_live'); };
ACT.startTrip = (id) => once(async () => {
  if (!navigator.geolocation) return toast('Tu navegador no tiene GPS: no se puede transmitir el viaje.','bad');
  await POST('/trips/'+encodeURIComponent(id)+'/start'); const t = trip(id); if (t) t.status = 'started';
  startWatch(id); await loadMyTrips().catch(() => {}); render(true); toast('Viaje iniciado. Tus pasajeros ya ven la unidad en el mapa.');
});
ACT.gpsOn = (id) => { startWatch(id); setTimeout(() => render(true), 600); toast('Activando tu GPS…','gold'); };
ACT.finishTrip = (id) => confirmSheet('¿Terminar el viaje?', 'Tus pasajeros podrán calificarte y dejarás de transmitir tu ubicación.', 'Sí, terminar', () => once(() => finishTripNow(id, false)));
ACT.board = (arg) => once(async () => {
  const p = arg.split('|'); const tid = p.slice(0,-1).join('|'), s = p[p.length-1];
  const r = await POST('/trips/'+encodeURIComponent(tid)+'/board', { seat:Number(s) }); toast(esc(firstName(r.name))+' abordó. Asiento '+s+'.'); refreshCur();
});
ACT.scan = (id) => {
  sheet('<h3>Escanear boleto</h3><p class="muted" style="font-size:14px">Apunta la cámara al QR del boleto del pasajero.</p><div class="scanbox"><video id="scanv" playsinline muted></video></div><p class="hint" id="scanmsg">Abriendo la cámara…</p>'+field('scancode','O escribe el código del boleto',{ph:'VIP-XXXX', max:8})+'<div class="actions2"><button class="btn line" data-act="closeSheet">Cerrar</button><button class="btn dark" data-act="scanManual" data-arg="'+esc(id)+'">Validar código</button></div>');
  startScan(id);
};
ACT.scanManual = (id) => once(async () => { const v = (F.scancode||'').trim(); if (v.length < 4) return toast('Escribe el código del boleto.','bad'); await boardByCode(id, v); });
ACT.viewPay = (arg) => {
  const p = arg.split('|'); const s = p.pop(); const tid = p.join('|'); const row = (DB_.man[tid] || { seats:[] }).seats.find(x => String(x.seat) === s); if (!row) return;
  sheet('<h3>Pago de '+esc(shortName(row.name))+'</h3><div class="kv"><span>Monto</span><b>'+soles(row.amount||0)+'</b></div><div class="kv"><span>Método</span><b>'+(row.method==='plin'?'Plin':'Yape')+'</b></div><div class="kv"><span>N.º de operación</span><b class="mono">'+esc(row.opNo)+'</b></div>'+(row.capture?'<img src="'+esc(row.capture)+'" alt="Captura del pago" style="width:100%;border-radius:12px;max-height:46vh;object-fit:contain;background:#F7F8FA">':'')+'<p class="hint">Abre tu app y confirma que el pago llegó con ese número de operación.</p><div class="actions2"><button class="btn red" data-act="payNo" data-arg="'+row.paymentId+'">Rechazar</button><button class="btn ok" data-act="payOk" data-arg="'+row.paymentId+'">Confirmar</button></div>');
};
ACT.payOk = (id) => { closeSheet(); once(async () => { await POST('/payments/'+encodeURIComponent(id)+'/confirm'); toast('Pago confirmado. Avisamos al pasajero por correo.'); await refreshCur(); }); };
ACT.payNo = (id) => reasonSheet('¿Rechazar este pago?', 'El asiento se libera y avisamos al pasajero con tu motivo (por ejemplo: «no me llegó el Yape»).', 'Rechazar pago', v => once(async () => { await POST('/payments/'+encodeURIComponent(id)+'/reject', { note:v }); toast('Pago rechazado. El asiento quedó libre.','gold'); await refreshCur(); }));
ACT.rpax = (arg) => once(async () => { const p = arg.split('|'); const n = Number(p.pop()), s = p.pop(), tid = p.join('|'); await POST('/trips/'+encodeURIComponent(tid)+'/pax-rate', { seat:Number(s), stars:n }); await refreshCur(); });

/* administrador */
ACT.viewFile = (url) => { if (!url) return toast('No hay archivo.','gold'); sheet('<img src="'+esc(url)+'" alt="Documento" style="width:100%;border-radius:12px;max-height:60vh;object-fit:contain;background:#F7F8FA" onerror="this.outerHTML=\'<p class=muted>Este archivo no es una imagen (puede ser PDF).</p>\'"><a class="btn line" href="'+esc(url)+'" target="_blank" rel="noopener">Abrir en otra pestaña</a>'); };
ACT.reviewDo = (arg) => {
  const p = arg.split('|'); const send = (note) => once(async () => { await POST('/admin/review', { userId:p[0], role:p[1], decision:p[2], note }); toast(p[2] === 'approve' ? 'Aprobado. Avisamos por correo.' : 'Rechazado. Avisamos por correo.', p[2] === 'approve' ? 'ok' : 'gold'); await refreshCur(); });
  if (p[2] === 'approve') confirmSheet('¿Aprobar?', 'Confirma que la selfie coincide con el DNI y que los documentos son válidos y están vigentes.', 'Sí, aprobar', () => send(''));
  else reasonSheet('¿Rechazar la solicitud?', 'Escribe qué debe corregir. El usuario lo verá y podrá volver a enviar.', 'Rechazar', send);
};
ACT.usersSearch = () => reload();
ACT.blockUser = (id) => reasonSheet('¿Bloquear esta cuenta?', 'No podrá ingresar. Si es conductor, se cancelan sus viajes activos y se avisa a sus pasajeros.', 'Bloquear', v => once(async () => { await POST('/admin/users/'+encodeURIComponent(id)+'/block', { blocked:true, reason:v }); toast('Cuenta bloqueada.','gold'); await refreshCur(); }));
ACT.unblockUser = (id) => once(async () => { await POST('/admin/users/'+encodeURIComponent(id)+'/block', { blocked:false }); toast('Cuenta desbloqueada.'); await refreshCur(); });
ACT.opsGo = (tab) => { F.otab = tab; tabTo('a_ops'); };
ACT.otab = (tab) => { F.otab = tab; reload(); };
ACT.pstat = (k) => { F.pstat = k; reload(); };
ACT.adminCancelTrip = (id) => reasonSheet('¿Cancelar este viaje?', 'Se avisa por correo a los pasajeros con reserva.', 'Cancelar viaje', v => once(async () => { await POST('/admin/trips/'+encodeURIComponent(id)+'/cancel', { reason:v }); toast('Viaje cancelado.','gold'); await refreshCur(); }));
ACT.resolveInc = (id) => once(async () => { await POST('/admin/incidents/'+encodeURIComponent(id)+'/resolve'); toast('Incidente resuelto.'); await refreshCur(); });

/* atajos del panel lateral de escritorio */
ACT.jump = (go_) => {
  closeSheet();
  if (go_ === 'landing'){ stack = [{ s:'landing' }]; return render(); }
  if (go_ === 'welcome'){ stack = [{ s:'welcome' }]; return render(); }
  if (!ME) return toast('Ingresa o crea tu cuenta para ver esta pantalla.','gold');
  if (go_ === 'd_verif'){ if (!ME.driver) return toast('Primero activa tu perfil de conductor en tu perfil.','gold'); S.role = 'conductor'; save(); stack = [{ s:'d_home' }, { s:'verif', p:{ role:'conductor' } }]; return render(); }
  if (go_ === 'd_manifest'){ if (!ME.driver) return toast('Primero activa tu perfil de conductor en tu perfil.','gold'); S.role = 'conductor'; save(); return tabTo('d_manifest'); }
  if (ME.isAdmin) return toast('Estás como administrador.','gold');
  S.role = 'pasajero'; save();
  if (go_ === 'live') return tabTo('p_live');
  tabTo('p_home');
};

function renderSide(){
  const side = document.getElementById('side'); if (!side || side.dataset.done === (EDIT.can ? '2' : '1')) return; side.dataset.done = EDIT.can ? '2' : '1';
  side.innerHTML = (EDIT.can ? '<button class="btn dark" data-act="editOpen">'+ic('edit',18)+'Editar textos de la app</button>' : '')+'<div class="slogo">'+logoH(46)+'</div><h2>Prototipo V3 navegable</h2><p>App para pasajeros y conductores entre Trujillo y Chiclayo. Cada cambio sale del feedback del Laboratorio 07. Toca «Ver» para ir directo a esa parte de la app.</p>'+
    '<ul class="chg">'+CHANGES.map(c => '<li><span class="src">'+c.src+'</span><span class="fb">'+c.fb+'</span><span class="ch">'+c.ch+'</span><button class="btn xs dark" data-act="jump" data-arg="'+c.go+'">Ver</button></li>').join('')+'</ul>'+
    '<p class="hint">Cuentas, viajes, pagos y avisos son reales: se guardan en el servidor.</p>';
}
function applyTexts(root){
  if (!root || !Object.keys(TX).some(k => k !== '__ts' && TX[k] != null)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentNode && /^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach(n => {
    const raw = n.nodeValue; const t = raw.trim(); if (!t) return;
    const orig = ORIGTXT.get(n) || t; const v = TX[orig];
    if (v != null && v !== t){ ORIGTXT.set(n, orig); n.nodeValue = raw.replace(t, v); }
  });
  root.querySelectorAll && root.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(el => {
    const orig = el.dataset.ph || el.placeholder; const v = TX['ph:'+orig];
    if (v != null){ el.dataset.ph = orig; el.placeholder = v; }
  });
}

const EDIT_SCREENS = [
  ['onb0','Presentación 1'],['onb1','Presentación 2'],['onb2','Presentación 3'],['welcome','¿Qué quieres hacer?'],
  ['reg1','Registro · DNI'],['reg2','Registro · correo'],['reg2b','Registro · código'],['reg3','Registro · celular'],['reg4','Registro · contraseña'],
  ['login','Ingresar'],['landing','¿Qué es VIP? (página larga)']
];
function editGo(v){
  F = {};
  if (/^onb\d$/.test(v)){ F.slide = +v.slice(3); stack = [{ s:'onb' }]; }
  else if (v === 'welcome' || v === 'login' || v === 'landing'){ stack = [{ s:v }]; }
  else if (/^reg/.test(v)){ F = { role:'pasajero', step: v === 'reg1' ? 1 : v === 'reg3' ? 3 : v === 'reg4' ? 4 : 2, dni:'12345678', dniToken:'x', name:'Camila Rojas', email:'camila@gmail.com', phone:'912345678' }; if (v === 'reg2b') F.otpSent = true; stack = [{ s:'welcome' }, { s:'reg', p:{ role:'pasajero' } }]; }
  render();
}

function renderEditUI(){
  const bar = document.getElementById('editbar'); if (!bar) return;
  phone.classList.toggle('editmode', EDIT.on && EDIT.mode === 'edit');
  let fab = phone.querySelector('.edit-fab');
  if (EDIT.can && !EDIT.on){ if (!fab){ fab = document.createElement('button'); fab.className = 'edit-fab'; fab.dataset.act = 'editOpen'; fab.textContent = '✎ EDITAR TEXTOS'; phone.appendChild(fab); } }
  else if (fab) fab.remove();
  if (!EDIT.on){ bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = '<div class="eb-row"><span class="eb-title">'+ic('edit',16)+'Editando textos</span>'+
      '<div class="seg"><button data-act="editMode" data-arg="nav" aria-pressed="'+(EDIT.mode==='nav')+'">Navegar</button><button data-act="editMode" data-arg="edit" aria-pressed="'+(EDIT.mode==='edit')+'">Editar</button></div></div>'+
    '<div class="eb-row"><select id="edit-go" aria-label="Ir a pantalla"><option value="">Ir a pantalla…</option>'+EDIT_SCREENS.map(o => '<option value="'+o[0]+'">'+o[1]+'</option>').join('')+'</select>'+
      '<button class="btn xs" data-act="editSave" '+(EDIT.dirty?'':'disabled')+'>Guardar'+(EDIT.dirty?' ('+EDIT.dirty+')':'')+'</button><button class="btn xs line" data-act="editClose" style="background:transparent;color:#fff;border-color:#4A505C">Salir</button></div>'+
    '<small>'+(EDIT.mode==='edit' ? 'Toca cualquier texto para cambiarlo.' : 'Usa la app normal para llegar a otra pantalla.')+'</small>';
}
ACT.editOpen = () => { EDIT.on = true; EDIT.mode = 'edit'; renderEditUI(); toast('Toca cualquier texto para cambiarlo.','gold'); };
ACT.editMode = (m) => { EDIT.mode = m; renderEditUI(); };
ACT.editClose = () => {
  if (EDIT.dirty) return confirmSheet('¿Salir sin guardar?', 'Tienes '+EDIT.dirty+' cambio'+(EDIT.dirty>1?'s':'')+' sin guardar. Si sales, solo se verán en esta pantalla hasta que recargues.', 'Salir sin guardar', () => { EDIT.on = false; renderEditUI(); }, true);
  EDIT.on = false; renderEditUI();
};
function textTarget(e){
  let node = null;
  try{
    if (document.caretRangeFromPoint){ const r = document.caretRangeFromPoint(e.clientX, e.clientY); if (r && r.startContainer.nodeType === 3) node = r.startContainer; }
    else if (document.caretPositionFromPoint){ const r = document.caretPositionFromPoint(e.clientX, e.clientY); if (r && r.offsetNode.nodeType === 3) node = r.offsetNode; }
  }catch(_){}
  if (node && node.nodeValue.trim() && e.target.contains(node)) return node;
  let el = e.target;
  while (el && el !== app){
    const t = Array.from(el.childNodes).find(n => n.nodeType === 3 && n.nodeValue.trim());
    if (t) return t;
    el = el.parentElement;
  }
  return null;
}
function openTextEditor(node, ph){
  const current = ph ? ph.placeholder : node.nodeValue.trim();
  const orig = ph ? (ph.dataset.ph || ph.placeholder) : (ORIGTXT.get(node) || current);
  const changed = ph ? TX['ph:'+orig] != null : TX[orig] != null;
  sheet('<div class="txed"></div><h3>Cambiar texto</h3>'+(changed ? '<small class="muted">Original: «'+esc(orig)+'»</small>' : '')+
    '<div class="fld"><label for="f-txed">'+(ph ? 'Texto de ayuda del campo' : 'Nuevo texto')+'</label><textarea id="f-txed" rows="3" style="min-height:90px">'+esc(current)+'</textarea></div>'+
    (/\d/.test(orig) ? '<p class="hint">Este texto tiene números o datos que la app cambia sola (precios, horas, nombres). Tu cambio se verá solo cuando aparezca exactamente igual.</p>' : '')+
    '<div class="actions2">'+(changed ? '<button class="btn line" id="tx-reset">Volver al original</button>' : '<button class="btn line" data-act="closeSheet">Cancelar</button>')+'<button class="btn" id="tx-ok">Aplicar</button></div>');
  const ta = document.getElementById('f-txed'); ta.focus(); ta.select();
  const key = ph ? 'ph:'+orig : orig;
  const done = (val) => {
    closeSheet();
    TX[key] = val; TX.__ts = Date.now(); EDIT.dirty++;
    if (ph){ ph.dataset.ph = orig; ph.placeholder = val == null ? orig : val; }
    else { ORIGTXT.set(node, orig); node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), val == null ? orig : val); }
    applyTexts(app); renderEditUI();
    toast('Texto cambiado. Toca «Guardar» para que todos lo vean.','gold');
  };
  document.getElementById('tx-ok').addEventListener('click', () => { const v = ta.value.replace(/\s+/g,' ').trim(); if (!v) return toast('El texto no puede quedar vacío.','bad'); done(v === orig ? null : v); });
  const rs = document.getElementById('tx-reset'); if (rs) rs.addEventListener('click', () => done(null));
}
['pointerdown','mousedown'].forEach(t => document.addEventListener(t, e => { if (EDIT.on && EDIT.mode === 'edit' && app.contains(e.target)) e.preventDefault(); }, true));
document.addEventListener('click', e => {
  if (!(EDIT.on && EDIT.mode === 'edit') || !app.contains(e.target)) return;
  e.preventDefault(); e.stopPropagation();
  const f = e.target.closest('input[placeholder],textarea[placeholder]');
  if (f) return openTextEditor(null, f);
  const n = textTarget(e); if (n) openTextEditor(n, null);
}, true);
document.addEventListener('change', e => { if (e.target.id === 'edit-go' && e.target.value){ editGo(e.target.value); } }, true);
function buildDoc(){
  const json = JSON.stringify(TX).replace(/</g,'\\u003c');
  const body = ORIG_BODY.replace(/(<script type="application\/json" id="vip-texts">)[\s\S]*?(<\/script>)/, (m, a, b) => a + json + b);
  return '<!doctype html><html><head>'+ORIG_HEAD+'</head><body>'+body+'</body></html>';
}
function saveFail(err){
  const c = err && err.code;
  if (c === 'conflict') return toast('Se guardó otra versión al mismo tiempo. La app se va a recargar.','gold');
  if (c === 'not_writer' || c === 'not_granted' || c === 'consent_required' || c === 'not_declared'){ EDIT.can = false; EDIT.on = false; renderEditUI(); return toast('Este enlace es de solo lectura para ti. Pide a la dueña que haga el cambio.','bad'); }
  if (c === 'rate_limited') return toast('Guardaste muchas veces seguidas. Espera unos segundos y vuelve a guardar.','bad');
  if (c === 'too_large') return toast('Los textos son demasiado largos para guardarlos.','bad');
  toast('No se pudo guardar. Revisa tu conexión y toca «Guardar» otra vez.','bad');
}
ACT.editSave = async () => {
  if (!ART || !EDIT.dirty) return;
  const json = JSON.stringify(TX, null, 1);
  toast('Guardando…','gold');
  try{
    await ART.publish({ 'textos.json': { content: json, contentType: 'application/json' } });
    EDIT.dirty = 0; renderEditUI(); toast('Guardado. Todos los que abran el enlace ya ven los textos nuevos.');
  }catch(err){
    const c = err && err.code;
    if (c === 'capability_disabled' || c === 'capability_removed' || c === 'invalid_content'){
      try{ await ART.publish(buildDoc()); EDIT.dirty = 0; return; }catch(e2){ return saveFail(e2); }
    }
    saveFail(err);
  }
};
(function loadTexts(){
  try{
    fetch('textos.json', { cache:'no-store' }).then(r => r.ok ? r.json() : null).then(j => {
      if (j && typeof j === 'object' && (j.__ts||0) > (TX.__ts||0)){ TX = j; render(true); }
    }).catch(() => {});
  }catch(e){}
  if (window.claude && typeof window.claude.use === 'function'){
    Promise.all([window.claude.use('artifact'), window.claude.use('user')]).then(async ([a, u]) => {
      ART = a; let can = false;
      try{ can = !!(a && u && await u.canEdit()); }catch(e){ can = false; }
      EDIT.can = can; renderSide(); if (cur().s.indexOf('profile') > 0) render(true); else renderEditUI();
    }).catch(() => {});
  }
})();

/* =========================================================
   Eventos
   ========================================================= */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  e.preventDefault(); fn(el.dataset.arg, el, e);
});
document.addEventListener('input', e => {
  const el = e.target; const k = el.dataset && el.dataset.f; if (!k) return;
  let v = el.value;
  if (['phone','otp','dni','ephone','yape','plin'].indexOf(k) >= 0){ v = v.replace(/\D/g,''); if (v !== el.value) el.value = v; }
  if (k === 'opno'){ v = v.replace(/[^A-Za-z0-9-]/g,''); if (v !== el.value) el.value = v; }
  F[k] = v;
  const s = cur().s;
  if (s === 'reg'){ const b = document.getElementById('btn-next'); if (b) b.disabled = !regStepValid(); }
  if (s === 'p_pay'){ const b = document.getElementById('btn-pay'); if (b) b.disabled = !payValid(); }
});
function readImg(file, max){
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, max/Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width*k); c.height = Math.round(im.height*k); c.getContext('2d').drawImage(im,0,0,c.width,c.height); res(c.toDataURL('image/jpeg',.82)); }; im.onerror = rej; im.src = fr.result; };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}
function readPdf(file){ return new Promise((res, rej) => { if (file.size > 3.5*1024*1024) return rej(new Error('El PDF pesa más de 3,5 MB. Sube una foto o un PDF más liviano.')); const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); }); }
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.id === 'date-in' && el.value){ S.search.date = el.value; save(); render(true); return; }
  if (el.dataset && el.dataset.f === 'liccat'){ F.liccat = el.value; return; }
  if (el.dataset && el.dataset.file){
    const f = el.files && el.files[0]; if (!f) return; const key = el.dataset.file; el.value = '';
    await once(async () => {
      let url;
      try{ url = f.type === 'application/pdf' ? await readPdf(f) : await readImg(f, key === 'selfie' ? 720 : 1280); }
      catch(err){ return toast(esc(err && err.message ? err.message : 'No pudimos leer ese archivo. Prueba con otra foto.'),'bad'); }
      if (key === 'capture'){ F.capture = url; render(true); return toast('Captura lista.'); }
      toast('Subiendo…','gold');
      const r = await POST('/me/files', { kind:key, data:url }); ME = r.me; render(true); toast('Archivo guardado.');
    });
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSheet();
  if (e.key === 'Enter' && (e.target.tagName === 'INPUT' || e.target === document.body)){ const s = cur().s; if (s === 'reg'){ e.preventDefault(); ACT.regNext(); } else if (s === 'login'){ e.preventDefault(); ACT.doLogin(); } else if (s === 'a_users'){ e.preventDefault(); ACT.usersSearch(); } }
});
let tx0 = null;
document.addEventListener('touchstart', e => { tx0 = cur().s === 'onb' ? e.touches[0].clientX : null; }, { passive:true });
document.addEventListener('touchend', e => { if (tx0 == null) return; const dx = e.changedTouches[0].clientX - tx0; tx0 = null; if (Math.abs(dx) < 50) return; if (dx < 0) ACT.onbNext(); else if ((F.slide||0) > 0){ F.slide--; render(); } }, { passive:true });

/* =========================================================
   Relojes: cuenta regresiva, actualización automática y mapa en vivo
   ========================================================= */
const POLL = { p_home:15000, p_trip:8000, p_seats:4000, p_trips:8000, p_ticket:5000, p_live:5000, d_home:6000, d_manifest:5000, d_live:5000, a_home:15000, a_review:15000, a_ops:8000 };
const isTyping = () => { const a = document.activeElement; return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && app.contains(a)); };
function refreshLiveDOM(){
  const t = F.liveTrip ? trip(F.liveTrip) : null; if (!t || ['p_live','d_live'].indexOf(cur().s) < 0) return;
  const L = liveOf(t); const m = document.getElementById('map'); if (!m) return;
  m.innerHTML = mapSVG(t, !!F.follow);
  const set = (id, h) => { const el = document.getElementById(id); if (el) el.innerHTML = h; };
  const has = L.has || L.done;
  set('lv-spd', speedNow(t)+'<em>km/h</em>'); set('lv-km', (has ? Math.round((1-L.p)*ROUTE_KM) : '—')+'<em>km</em>'); set('lv-rem', has ? durTxt((1-L.p)*TRIP_MIN) : '—');
  if (L.run) set('lv-status', L.has ? (L.stale ? 'Sin señal del GPS hace '+Math.round((Date.now()-new Date(L.at))/60000)+' min' : 'En ruta · próximo punto: '+nextTown(t)) : 'Esperando la primera ubicación del conductor…');
  const bar = document.getElementById('lv-bar'); if (bar) bar.style.width = (L.p*100).toFixed(1)+'%';
}
let tick = 0, expiredWarned = false;
setInterval(() => {
  tick++;
  const c = cur();
  if (hold.until && hold.seats.length){
    if (Date.now() > hold.until + 800){
      if (!expiredWarned && (c.s === 'p_seats' || c.s === 'p_pay')){ expiredWarned = true; toast('Se acabó el tiempo de reserva. Vuelve a elegir tu asiento.','bad'); hold.seats = []; hold.until = 0; silentRefresh(c, true); }
    } else expiredWarned = false;
  }
  document.querySelectorAll('[data-hold]').forEach(el => { el.textContent = mmss(hold.until - Date.now()); });
  document.querySelectorAll('[data-dep]').forEach(el => { el.textContent = untilTxt(Number(el.dataset.dep) - nowSim().getTime()); });
  if (c.s === 'd_manifest'){ const wb = document.getElementById('waitbox'); const t = trip(F.mtrip); if (wb && t) wb.innerHTML = waitHTML(t); }
  if (tick % 2 === 0) refreshLiveDOM();
  const iv = POLL[c.s];
  if (iv && c.loaded && !document.hidden && Date.now() - (c.lastPoll || 0) >= iv && !isTyping()){ c.lastPoll = Date.now(); silentRefresh(c); }
}, 1000);

/* Red de seguridad: un fallo que ninguna pantalla manejó también se avisa con un toast. */
let lastErrToast = 0;
function unexpected(msg){ const n = Date.now(); if (n - lastErrToast < 4000) return; lastErrToast = n; toast(esc(msg || 'Algo salió mal. Inténtalo otra vez.'),'bad'); }
window.addEventListener('unhandledrejection', e => { const r = e.reason; if (r && r.status === 401 && ME) return fail(r); unexpected(r && (r.status || r.offline) ? r.message : null); });
window.addEventListener('error', e => { if (!e.message || /ResizeObserver|Script error/i.test(e.message)) return; unexpected(); });

/* =========================================================
   Arranque: sesión del servidor, pantalla de bienvenida
   ========================================================= */
stack = [{ s:'splash' }]; render();
(async () => {
  const t0 = Date.now(); let r = null, bootErr = null;
  try{ r = await GET('/me'); }catch(e){ bootErr = e; }
  ME = r && r.me ? r.me : null;
  const wait = Math.max(0, 1500 - (Date.now() - t0)); await new Promise(res => setTimeout(res, wait));
  if (ME){
    if (ME.isAdmin) S.role = 'admin';
    else if (S.role === 'admin' || !S.role || (S.role === 'conductor' && !ME.driver)) S.role = ME.driver && !S.role ? null : 'pasajero';
    save();
    stack = [{ s: S.role ? homeOf(S.role) : 'welcome' }];
  } else {
    stack = [{ s: S.seenOnb ? 'welcome' : 'onb' }];
    if (r && r.blocked !== undefined) setTimeout(() => toast('Tu cuenta está bloqueada. Contacta a la central VIP.'+(r.blocked ? ' Motivo: '+esc(r.blocked) : ''),'bad'), 300);
  }
  render();
  if (bootErr) setTimeout(() => toast('No pudimos conectar con el servidor. '+esc(bootErr.message),'bad'), 300);
})();
})();
