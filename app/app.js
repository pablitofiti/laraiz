/* ============================================================
   LA RAÍZ 2.1 · objetivos en árbol + pizarras de día y semana
   Datos: un único raiz.json (Dropbox / archivo local / navegador).
   - espacios: frentes de trabajo creados por el usuario; cada uno es un
     nodo "objetivo" (padre null) con sus raíces, cuadros y pasos.
   - archivado: fecha en raíces o cuadros; se oculta pero se conserva.
   - agenda: { "YYYY-MM-DD": { manana:[], tarde:[], sinhora:[], hecho:[], movido:{} } }
     con referencias "id de nodo" | "tarea:<id>" | "band:<id>".
   - tareas: tareas sueltas { id, titulo, espacio, creado, hecho, cerrado }.
   ============================================================ */
const VERSION = "v2.2";
const CFG = window.RAIZ_CONFIG || {};
const RUTA_DROPBOX = CFG.rutaArchivo || "/00_APP TD/raiz.json";
const LS_DATOS = "raiz.datos", LS_RT = "raiz.dbx.refresh", LS_VERIF = "raiz.dbx.verifier", LS_API = "raiz.api.key", LS_MODELO = "raiz.api.modelo", LS_CHAT = "raiz.chat", LS_ESP = "raiz.espacio";
const PALETA = ["#e3b341","#5b8def","#4fb286","#f0a04b","#a77bd8","#e0707a","#3fb0c9","#8a8f5c"];

let datos = null, selId = null, fileHandle = null, modo = "local", guardarTimer = null, dbxFallo = false;
let vista = "inicio", calMes = null, calDia = null, raizMovil = null;
let espacioSel = localStorage.getItem(LS_ESP) || null;
let agFecha = null, agModo = "dia"; const ocultos = new Set();

const $ = (s) => document.querySelector(s);
function fechaStr(d){ return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
const hoy = () => fechaStr(new Date());
const ahora = () => new Date().toISOString();
function aFecha(f){ return new Date(f + "T12:00:00"); }
function sumar(f, n){ const d = aFecha(f); d.setDate(d.getDate() + n); return fechaStr(d); }
function dow(f){ return (aFecha(f).getDay()+6)%7; }
function lunesDe(f){ return sumar(f, -dow(f)); }
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS = ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"];
const DCORTO = ["lu","ma","mi","ju","vi","sá","do"];
const FRANJA = { manana:"mañana", tarde:"tarde", sinhora:"sin hora", hecho:"hecho" };
function fechaCorta(f){ if(!f) return ""; const [y,m,d] = f.split("-"); return +d + " " + MESES[+m-1].slice(0,3); }
function fechaLarga(f){ const d = aFecha(f); return DIAS[dow(f)] + " " + d.getDate() + " de " + MESES[d.getMonth()]; }
function semanaISO(f){ const d = aFecha(f); d.setDate(d.getDate() + 3 - ((d.getDay()+6)%7)); const y = new Date(d.getFullYear(),0,4); return 1 + Math.round(((d - y)/86400000 - 3 + ((y.getDay()+6)%7))/7); }
function mayus(t){ return t ? t[0].toUpperCase() + t.slice(1) : t; }
function esc(s){ return String(s??"").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function slug(t){ return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,24) || "x"; }
function uid(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
function setEstado(cls, txt){ const p=$("#ptoDatos"); p.className="pto "+cls; $("#txtDatos").textContent=txt; const a=$("#ajDatos"); if(a) a.textContent = "Estado: " + txt; }

/* ---------- toast con deshacer ---------- */
let deshacerSnap = null;
const foto = () => JSON.stringify(datos);
function ocultarToast(){ const t = $("#toast"); t.classList.remove("on"); t.style.display = "none"; deshacerSnap = null; }
function toast(m, snap){
  const t = $("#toast"); deshacerSnap = snap || null;
  t.innerHTML = esc(m) + (snap ? ' <button id="bDeshacer">Deshacer</button>' : ""); t.classList.add("on"); t.style.display = "flex";
  if(snap) $("#bDeshacer").onclick = (e) => { e.stopPropagation(); datos = JSON.parse(deshacerSnap); ocultarToast(); guardar(); render(); };
  clearTimeout(t._t); t._t = setTimeout(ocultarToast, snap ? 6000 : 2400);
}

/* ---------- modelo: nodos ---------- */
const nodo = (id) => datos.nodos.find(n => n.id === id);
const hijos = (id) => datos.nodos.filter(n => n.padre === id).sort((a,b)=>(a.orden||0)-(b.orden||0));
function archivadoEf(n){ while(n){ if(n.archivado) return n.archivado; n = n.padre ? nodo(n.padre) : null; } return null; }
const vivo = (n) => !!n && !archivadoEf(n);
const hijosVivos = (id) => hijos(id).filter(n => !n.archivado);
function raizSup(id){ let n = nodo(id); while(n && n.padre) n = nodo(n.padre); return n; }
function ruta(id){ const r=[]; let n=nodo(id); while(n){ if(n.tipo !== "objetivo") r.unshift(n.titulo); n = n.padre ? nodo(n.padre) : null; } return r; }
function descendientes(id){ const out = []; const pila = [id]; while(pila.length){ const p = pila.pop(); for(const h of datos.nodos.filter(x => x.padre === p)){ out.push(h); pila.push(h.id); } } return out; }
function idNuevo(padreId, titulo){ const base = padreId + "." + slug(titulo); let id = base, k = 2; while(nodo(id)) id = base + "-" + (k++); return id; }

/* espacios */
const espacios = () => (datos.espacios||[]).slice().sort((a,b)=>(a.orden||0)-(b.orden||0));
const espacio = (id) => (datos.espacios||[]).find(e => e.id === id);
function espacioDe(nodeId){ const top = raizSup(nodeId); return top ? espacio(top.id) : null; }
function colorEsp(id){ const e = espacio(id); return e ? e.color : "var(--lineaFuerte)"; }
const raices = (esp) => hijosVivos(esp || espacioSel);
const todasRaices = () => espacios().flatMap(e => raices(e.id));

function activar(id){
  const n = nodo(id); if(!n) return false;
  if(n.estado === "bloqueado"){ toast("Está bloqueado: termina antes el anterior"); return false; }
  const otro = hijosVivos(n.padre).find(h => h.estado === "activo" && h.id !== id);
  if(otro && n.tipo !== "raiz"){ toast("Ya hay uno activo aquí: " + otro.titulo); return false; }
  n.estado = "activo"; n.activado = hoy();
  const ps = hijosVivos(id); if(ps.length && !ps.some(x => x.estado === "activo")){ const f = ps.find(x => x.estado !== "hecho"); if(f){ f.estado = "activo"; f.activado = hoy(); } }
  const p = n.padre && nodo(n.padre); if(p && p.tipo !== "objetivo" && p.estado !== "activo" && p.estado !== "hecho") p.estado = "activo";
  return true;
}
function marcarHecho(id, silencioso){
  const n = nodo(id); if(!n) return false;
  const pendientes = hijosVivos(id).filter(h => h.estado !== "hecho");
  if(!silencioso && pendientes.length && !confirm("Quedan " + pendientes.length + " pasos sin hacer. ¿Marcar hecho igualmente?")) return false;
  n.estado = "hecho"; n.cerrado = hoy();
  const hs = hijosVivos(n.padre); const i = hs.findIndex(h => h.id === id);
  const sig = hs.slice(i+1).find(h => h.estado === "bloqueado");
  if(sig){ sig.estado = (n.tipo === "paso") ? "activo" : "disponible"; if(sig.estado === "activo") sig.activado = hoy(); if(!silencioso) toast((sig.estado === "activo" ? "Siguiente paso: " : "Desbloqueado: ") + sig.titulo); }
  return true;
}
function reabrir(id){ const n=nodo(id); if(!n) return; n.estado="activo"; delete n.cerrado;
  // si al cerrarlo se desbloqueó el siguiente y aún no se ha tocado, vuelve a bloquearse (solo un activo por padre)
  const hs = hijosVivos(n.padre); const i = hs.findIndex(h => h.id === id); const sig = hs[i+1];
  if(sig && sig.estado === (n.tipo === "paso" ? "activo" : "disponible") && !sig.tocado && !(sig.notas||[]).length && !hijosVivos(sig.id).some(h => h.estado === "hecho")) sig.estado = "bloqueado"; }
function nuevoHijo(padreId, titulo, extra){
  const p = nodo(padreId); if(!p) return null; const hs = hijosVivos(padreId);
  const tipo = p.tipo === "raiz" ? "cuadro" : (p.tipo === "objetivo" ? "raiz" : "paso");
  let estado;
  if(tipo === "raiz") estado = "disponible";
  else if(hs.length === 0) estado = tipo === "paso" ? (p.estado === "activo" ? "activo" : "bloqueado") : "disponible";
  else estado = hs.every(h=>h.estado==="hecho") ? (tipo === "paso" && p.estado === "activo" ? "activo" : "disponible") : "bloqueado";
  const n = Object.assign({ id: idNuevo(padreId, titulo), padre: padreId, tipo, titulo, estado, orden: hijos(padreId).length + 1, creado: hoy() }, extra || {});
  datos.nodos.push(n); return n;
}
function nuevaRaiz(titulo, esp){ esp = esp || espacioSel; const base = "raiz-" + slug(titulo); let id = base, k = 2; while(nodo(id)) id = base + "-" + (k++); const n = { id, padre: esp, tipo: "raiz", titulo, estado: "disponible", orden: hijos(esp).length + 1, creado: hoy() }; datos.nodos.push(n); return n; }
function nuevoEspacio(nombre, color){
  const base = "esp-" + slug(nombre); let id = base, k = 2; while(nodo(id) || espacio(id)) id = base + "-" + (k++);
  datos.nodos.push({ id, padre: null, tipo: "objetivo", titulo: nombre, estado: "activo", creado: hoy() });
  datos.espacios.push({ id, nombre, color: color || PALETA[datos.espacios.length % PALETA.length], orden: datos.espacios.length + 1 });
  return id;
}
function eliminarEspacio(id){
  if(espacios().length <= 1){ toast("Tiene que quedar al menos un espacio"); return; }
  const n = hijos(id).length; if(!confirm("¿Eliminar el espacio «" + espacio(id).nombre + "»" + (n ? " con sus " + n + " raíces y todo lo que cuelga de ellas" : "") + "?")) return;
  const snap = foto(); const quitar = new Set([id, ...descendientes(id).map(d => d.id)]);
  datos.nodos = datos.nodos.filter(x => !quitar.has(x.id) && x.espacio !== id); datos.espacios = datos.espacios.filter(e => e.id !== id); datos.tareas = datos.tareas.filter(t => t.espacio !== id);
  if(espacioSel === id) espacioSel = espacios()[0].id; guardar(); render(); toast("Espacio eliminado", snap);
}
function mover(id, delta){ const n = nodo(id); const hs = hijos(n.padre); const i = hs.findIndex(h => h.id === id); const j = i + delta; if(j < 0 || j >= hs.length) return; hs.forEach((h,k) => h.orden = k + 1); const o = hs[i].orden; hs[i].orden = hs[j].orden; hs[j].orden = o; }
function moverA(id, nuevoPadre, indice){
  const n = nodo(id); if(!n || id === nuevoPadre || !nodo(nuevoPadre)) return;
  if(descendientes(id).some(d => d.id === nuevoPadre)) return;
  const origen = n.padre; const destino = hijos(nuevoPadre).filter(h => h.id !== id);
  destino.splice(Math.max(0, Math.min(indice, destino.length)), 0, n); n.padre = nuevoPadre;
  destino.forEach((h,k) => h.orden = k + 1); if(origen !== nuevoPadre) hijos(origen).forEach((h,k) => h.orden = k + 1);
}
function eliminar(id, silencioso){
  const n = nodo(id); if(!n) return false; const desc = descendientes(id);
  if(!silencioso && !confirm("¿Eliminar «" + n.titulo + "»" + (desc.length ? " y sus " + desc.length + " hijos" : "") + "?" + (n.tipo !== "paso" ? "\n\nSi lo has terminado y quieres conservarlo, mejor Archivar." : ""))) return false;
  const quitar = new Set([id, ...desc.map(d => d.id)]); datos.nodos = datos.nodos.filter(x => !quitar.has(x.id));
  hijos(n.padre).forEach((h,k) => h.orden = k + 1);
  if(selId === id){ selId = null; cerrarPanel(); }
  return true;
}
function archivar(id){ const n = nodo(id); if(!n) return; n.archivado = hoy(); if(selId === id) cerrarPanel(); }
function restaurar(id){ const n = nodo(id); if(!n) return; delete n.archivado; }
function addNota(id, texto){ const n=nodo(id); (n.notas = n.notas || []).unshift({ fecha: hoy(), texto }); n.tocado = hoy(); }
function editar(id, campo, valor){ const n=nodo(id); if(valor==="" || valor==null) delete n[campo]; else n[campo]=valor; n.tocado = hoy(); }
function toggleImportante(id, esBandeja){ const x = esBandeja ? itemBandeja(id) : nodo(id); if(!x) return; if(x.importante) delete x.importante; else x.importante = true; }

/* textos editables */
const TEXTOS_DEF = { f_hoy:"Hoy", f_semana:"Semana", f_arbol:"El árbol", f_bandeja:"Bandeja", f_calendario:"Calendario", f_revision:"Revisión", f_archivo:"Archivo", f_ajustes:"Ajustes" };
function texto(k){ return (datos.textos && datos.textos[k]) || TEXTOS_DEF[k] || ""; }
function setTexto(k, v){ datos.textos = datos.textos || {}; if(v) datos.textos[k] = v; else delete datos.textos[k]; }

/* ---------- migración ---------- */
function migrar(){
  let cambio = false;
  if(datos.diario && datos.diario.length){ datos.bandeja = datos.bandeja || []; for(const d of datos.diario) datos.bandeja.push({ id: uid("b"), fecha: d.fecha, texto: d.texto, estado: "pendiente" }); delete datos.diario; cambio = true; }
  if(!datos.bandeja){ datos.bandeja = []; cambio = true; } if(!datos.revisiones){ datos.revisiones = []; cambio = true; } if(!datos.eventos){ datos.eventos = []; cambio = true; }
  if(!datos.agenda){ datos.agenda = {}; cambio = true; } if(!datos.tareas){ datos.tareas = []; cambio = true; }
  if(!datos.espacios || !datos.espacios.length){
    datos.espacios = [];
    const objs = datos.nodos.filter(n => n.tipo === "objetivo" && !n.padre);
    if(!objs.length){ const o = { id:"arbol", padre:null, tipo:"objetivo", titulo:"Mi espacio", estado:"activo" }; datos.nodos.push(o); objs.push(o); }
    objs.forEach((o, i) => datos.espacios.push({ id:o.id, nombre:(o.titulo||"Mi espacio").split(" · ")[0], color:PALETA[i % PALETA.length], orden:i+1 }));
    const t = datos.nodos.find(n => n.tipo === "contexto" && !n.espacio); if(t) t.espacio = objs[0].id;
    cambio = true;
  }
  if(!espacioSel || !espacio(espacioSel)) espacioSel = espacios()[0].id;
  return cambio;
}

/* ---------- bandeja (modelo) ---------- */
function capturar(texto, extra){ const b = Object.assign({ id: uid("b"), fecha: hoy(), texto, estado: "pendiente" }, extra||{}); datos.bandeja.unshift(b); return b; }
function itemBandeja(id){ return datos.bandeja.find(b => b.id === id); }
function procesar(id, accion, arg){
  const b = itemBandeja(id); if(!b) return false;
  if(accion === "paso"){ const p = nodo(arg); if(!p) return false; if(p.estado !== "activo") p.estado = "activo"; nuevoHijo(arg, b.texto, b.importante ? {importante:true} : null); b.estado = "archivado"; b.destino = "paso en " + p.titulo; }
  else if(accion === "cuadro"){ const r = nodo(arg); if(!r) return false; nuevoHijo(arg, b.texto, b.importante ? {importante:true} : null); b.estado = "archivado"; b.destino = "cuadro en " + r.titulo; }
  else if(accion === "calendario"){ if(!arg) return false; datos.eventos.push({ id: uid("ev"), fecha: arg, texto: b.texto }); b.estado = "archivado"; b.destino = "calendario " + arg; }
  else if(accion === "nota"){ const n = nodo(arg); if(!n) return false; addNota(arg, b.texto); b.estado = "archivado"; b.destino = "nota en " + n.titulo; }
  else if(accion === "tarea"){ const t = nuevaTarea(b.texto, espacio(arg) ? arg : espacioSel); if(b.importante) t.importante = true; for(const g of Object.keys(datos.agenda)) reemplazarRef(g, "band:" + id, "tarea:" + t.id); b.estado = "archivado"; b.destino = "tarea suelta"; }
  else if(accion === "algundia") b.estado = "algundia";
  else if(accion === "archivar"){ b.estado = "archivado"; b.destino = "archivado"; }
  else if(accion === "pendiente"){ b.estado = "pendiente"; delete b.destino; }
  else if(accion === "borrar"){ datos.bandeja = datos.bandeja.filter(x => x.id !== id); for(const g of Object.keys(datos.agenda)) quitarDeDia(g, "band:" + id); return true; }
  else return false;
  b.procesado = hoy(); return true;
}

/* ---------- agenda ---------- */
function nuevaTarea(titulo, esp){ const t = { id: uid("t"), titulo, espacio: esp || espacioSel, creado: hoy() }; datos.tareas.push(t); return t; }
const tarea = (id) => datos.tareas.find(t => t.id === id);
const VACIO = { manana:[], tarde:[], sinhora:[], hecho:[], movido:{} };
function diaLeer(f){ return datos.agenda[f] || VACIO; }
function diaEsc(f){ const d = datos.agenda[f] || (datos.agenda[f] = {}); d.movido = d.movido || {}; for(const k of ["manana","tarde","sinhora","hecho"]) d[k] = d[k] || []; return d; }
function refInfo(ref){
  if(!ref) return null;
  if(ref.startsWith("tarea:")){ const t = tarea(ref.slice(6)); if(!t) return null; return { tipo:"tarea", titulo:t.titulo, esp:t.espacio, meta:"suelta", plazo:"", hecho:!!t.hecho, importante:t.importante }; }
  if(ref.startsWith("band:")){ const b = itemBandeja(ref.slice(5)); if(!b) return null; return { tipo:"band", titulo:b.texto, esp:null, meta:"bandeja", plazo:"", hecho:b.estado === "archivado", importante:b.importante }; }
  const n = nodo(ref); if(!n) return null; const e = espacioDe(ref); const r = ruta(n.padre);
  return { tipo:"nodo", titulo:n.titulo, esp:e && e.id, meta:(n.tipo === "paso" ? r.slice(-1)[0] : r[0]) || "", plazo:n.plazo || "", hecho:n.estado === "hecho", importante:n.importante, disp:n.estado === "disponible", arch:!!archivadoEf(n) };
}
function dondeEsta(ref, f){ const d = diaLeer(f); for(const k of ["manana","tarde","sinhora","hecho"]) if((d[k]||[]).includes(ref)) return k; return null; }
function quitarDeDia(f, ref){ const d = datos.agenda[f]; if(!d) return; for(const k of ["manana","tarde","sinhora","hecho"]) if(d[k]) d[k] = d[k].filter(x => x !== ref); if(d.movido) delete d.movido[ref]; }
function reemplazarRef(f, viejo, nuevo){ const d = datos.agenda[f]; if(!d) return; for(const k of ["manana","tarde","sinhora","hecho"]) if(d[k]) d[k] = d[k].map(x => x === viejo ? nuevo : x); if(d.movido && d.movido[viejo]){ d.movido[nuevo] = d.movido[viejo]; delete d.movido[viejo]; } }
function completar(ref, f){
  const i = refInfo(ref); if(!i) return false;
  if(i.tipo === "nodo"){ if(i.hecho) return true; return marcarHecho(ref); }
  if(i.tipo === "tarea"){ const t = tarea(ref.slice(6)); t.hecho = true; t.cerrado = f; return true; }
  if(i.tipo === "band"){ const b = itemBandeja(ref.slice(5)); b.estado = "archivado"; b.destino = "hecho " + fechaCorta(f); b.procesado = hoy(); return true; }
}
function descompletar(ref){
  const i = refInfo(ref); if(!i) return;
  if(i.tipo === "nodo" && i.hecho) reabrir(ref);
  if(i.tipo === "tarea"){ const t = tarea(ref.slice(6)); t.hecho = false; delete t.cerrado; }
  if(i.tipo === "band"){ const b = itemBandeja(ref.slice(5)); b.estado = "pendiente"; delete b.destino; }
}
function agendar(f, ref, franja){
  if(!refInfo(ref) || !FRANJA[franja]) return false;
  const antes = dondeEsta(ref, f);
  if(franja === "hecho"){ if(antes !== "hecho" && !completar(ref, f)) return false; }
  else if(antes === "hecho") descompletar(ref);
  // en los demás días: los de hoy en adelante se quitan; los pasados quedan como "movido" (historial)
  for(const [g, d] of Object.entries(datos.agenda)){ if(g === f) continue; const k = dondeEsta(ref, g); if(!k || k === "hecho") continue; if(g >= hoy()) quitarDeDia(g, ref); else { d.movido = d.movido || {}; d.movido[ref] = f; } }
  quitarDeDia(f, ref); diaEsc(f)[franja].push(ref);
  return true;
}
function desagendar(f, ref){ if(dondeEsta(ref, f) === "hecho") descompletar(ref); quitarDeDia(f, ref); }
function planDe(f){ const d = diaLeer(f); return ["manana","tarde","sinhora","hecho"].flatMap(k => (d[k]||[]).map(ref => ({ ref, franja:k }))).filter(x => { const i = refInfo(x.ref); return i && !(i.arch && f >= hoy()); }); }
function pendientesDia(f){ const d = diaLeer(f); return ["manana","tarde","sinhora"].flatMap(k => (d[k]||[]).map(ref => ({ref, franja:k}))).filter(x => { const i = refInfo(x.ref); return i && !i.hecho && !i.arch && !(d.movido||{})[x.ref]; }); }
function diaConRestos(){ for(let i=1;i<=14;i++){ const f = sumar(hoy(), -i); const p = pendientesDia(f); if(p.length) return { f, p }; } return null; }
function agendadoEn(ref, desde){ for(const g of Object.keys(datos.agenda).sort()){ if(g < desde) continue; const k = dondeEsta(ref, g); if(k && k !== "hecho" && !(diaLeer(g).movido||{})[ref]) return g; } return null; }
function porHacer(){
  // lo que se puede planificar: pasos activos, cuadros activos sin pasos pendientes, cuadros disponibles, tareas sueltas y bandeja
  const porEsp = {}; for(const e of espacios()) porEsp[e.id] = [];
  for(const n of datos.nodos){
    if(n.tipo !== "paso" && n.tipo !== "cuadro") continue; if(!vivo(n)) continue;
    const ok = (n.tipo === "paso" && n.estado === "activo") || (n.tipo === "cuadro" && n.estado === "disponible") || (n.tipo === "cuadro" && n.estado === "activo" && !hijosVivos(n.id).some(h => h.estado !== "hecho"));
    if(!ok) continue; const e = espacioDe(n.id); if(e && porEsp[e.id]) porEsp[e.id].push(n);
  }
  const peso = (n) => (n.estado === "activo" ? 0 : 2) - (n.importante ? 1 : 0); // activos e importantes primero
  const out = espacios().flatMap(e => porEsp[e.id].sort((a,b) => peso(a) - peso(b) || (a.plazo||"9999").localeCompare(b.plazo||"9999")).map(n => n.id));
  for(const t of datos.tareas) if(!t.hecho) out.push("tarea:" + t.id);
  for(const b of datos.bandeja) if(b.estado === "pendiente") out.push("band:" + b.id);
  return out;
}
function eventosDe(f){ return datos.eventos.filter(e => e.fecha === f).sort((a,b) => (a.hora||"").localeCompare(b.hora||"")); }

/* ---------- atención ---------- */
function activosHoy(){ const out = []; for(const r of todasRaices()){ let n = hijosVivos(r.id).find(c => c.estado === "activo"); if(!n) continue; let p; while((p = hijosVivos(n.id).find(c => c.estado === "activo"))) n = p; out.push({ raiz: r, nodo: n }); } return out; }
function atencion(){
  const h = hoy(); const h7 = sumar(h, 7);
  const vivos = datos.nodos.filter(n => (n.tipo === "cuadro" || n.tipo === "paso") && n.estado !== "hecho" && vivo(n));
  const conEsp = (n) => ({ t:n.titulo, s: ruta(n.padre).slice(-1)[0], nodo:n.id, c: colorEsp(espacioDe(n.id)?.id) });
  const imp = [...vivos.filter(n => n.importante).map(conEsp), ...datos.tareas.filter(t => t.importante && !t.hecho).map(t => ({ t:t.titulo, s:"tarea suelta", c:colorEsp(t.espacio), ir:"hoy" })), ...datos.bandeja.filter(b => b.importante && b.estado !== "archivado").map(b => ({ t:b.texto, s:"bandeja", band:b.id, c:"var(--lineaFuerte)" }))];
  const ven = vivos.filter(n => n.plazo && n.plazo < h).sort((a,b) => a.plazo.localeCompare(b.plazo)).map(n => Object.assign(conEsp(n), { s:"venció " + fechaCorta(n.plazo) }));
  const pro = vivos.filter(n => n.plazo && n.plazo >= h && n.plazo <= h7).sort((a,b) => a.plazo.localeCompare(b.plazo)).map(n => Object.assign(conEsp(n), { s:"vence " + fechaCorta(n.plazo) }));
  return { imp, ven, pro };
}

/* ---------- vistas ---------- */
const VISTAS = { inicio:"vInicio", hoy:"vHoy", arbol:"vArbol", bandeja:"vBandeja", calendario:"vCalendario", revision:"vRevision", archivo:"vArchivo", ajustes:"vAjustes" };
function ir(v, guardarEstado=true){
  if(v === "semana"){ agModo = "semana"; agFecha = hoy(); v = "hoy"; }
  else if(v === "mes"){ agModo = "mes"; agFecha = hoy(); v = "hoy"; }
  else if(v === "hoy"){ agModo = "dia"; agFecha = hoy(); }
  if(!VISTAS[v]) v = "inicio"; vista = v;
  document.querySelectorAll(".vista").forEach(el => el.classList.toggle("on", el.id === VISTAS[v]));
  document.querySelectorAll("[data-ir]").forEach(a => a.classList.toggle("on", a.dataset.ir === v));
  if(guardarEstado) sessionStorage.setItem("raiz.vista", v);
  window.scrollTo(0,0); render();
}
let navT = null;
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ir]"); if(!b || e.target.closest(".edIn")) return; e.preventDefault();
  if(e.target.closest(".ed")){ clearTimeout(navT); navT = setTimeout(() => ir(b.dataset.ir), 280); return; } // deja sitio al doble clic de editar
  ir(b.dataset.ir);
});
function editable(el, valor, onOk){
  if(!el) return; el.classList.add("ed"); el.title = "Doble clic para editar";
  el.ondblclick = (e) => { clearTimeout(navT); e.stopPropagation(); e.preventDefault(); const inp = document.createElement("input"); inp.className = "edIn"; inp.value = valor; el.replaceWith(inp); inp.focus(); inp.select();
    let fin = false; const ok = () => { if(fin) return; fin = true; inp.replaceWith(el); onOk(inp.value.trim()); guardar(); render(); };
    inp.onblur = ok; inp.onkeydown = (ev) => { if(ev.key==="Enter") ok(); if(ev.key==="Escape"){ fin = true; inp.replaceWith(el); render(); } }; inp.onclick = (ev) => ev.stopPropagation(); };
}
function avisoGlobal(){
  const a = $("#avisoGlobal"); let h = "";
  if(CFG.appKey && !localStorage.getItem(LS_RT) && modo !== "archivo") h = `<span>Este dispositivo <b>no está conectado a Dropbox</b>: lo que hagas aquí no llega a tu archivo ni a tus otros dispositivos.</span><button class="btn act" id="bAvisoDbx">Conectar Dropbox</button>`;
  else if(dbxFallo) h = `<span><b>No se pudo leer Dropbox.</b> Estás trabajando con la copia de este dispositivo y no se sube nada.</span><button class="btn act" id="bAvisoRe">Reintentar</button>`;
  a.innerHTML = h; a.classList.toggle("on", !!h);
  const b1 = $("#bAvisoDbx"); if(b1) b1.onclick = dbxConectar; const b2 = $("#bAvisoRe"); if(b2) b2.onclick = () => location.reload();
}

/* ---------- render general ---------- */
function render(){
  const d = new Date(); $("#fechaHoy").textContent = DIAS[(d.getDay()+6)%7] + " " + d.getDate() + " · " + MESES[d.getMonth()] + " · " + d.getFullYear();
  const tv = $("#txtVersion"); if(tv) tv.textContent = VERSION;
  avisoGlobal();
  if(!datos){ $("#portada").innerHTML = '<div class="aviso">Sin datos. Ve a Ajustes y conecta Dropbox o vincula raiz.json.</div>'; return; }
  $("#titulo").textContent = datos.titulo || "La raíz"; $("#lema").textContent = datos.lema || "";
  $("#txtActualizado").textContent = "act. " + (datos.actualizado || "").replace("T"," ").slice(0,16);
  const pend = datos.bandeja.filter(b => b.estado === "pendiente").length;
  $("#navPend").textContent = pend ? "· " + pend : ""; const cm = $("#cntMovil"); cm.style.display = pend ? "" : "none"; cm.textContent = pend;
  ["#titulo","#lema"].forEach(q => { const e = $(q); e.classList.remove("ed"); e.ondblclick = null; });
  if(vista === "inicio") renderInicio();
  else if(vista === "hoy") renderAgenda();
  else if(vista === "arbol") renderArbol();
  else if(vista === "bandeja") renderBandeja();
  else if(vista === "calendario") renderCalendario();
  else if(vista === "revision") renderRevision();
  else if(vista === "archivo") renderArchivo();
  else if(vista === "ajustes") renderAjustes();
  if(selId) renderPanel();
}

/* ---------- portada ---------- */
const ICONOS = {
  hoy:'<rect x="3" y="4" width="5" height="16"/><rect x="10" y="4" width="5" height="11"/><rect x="17" y="4" width="4" height="7"/>',
  semana:'<rect x="3" y="5" width="18" height="15"/><path d="M3 10h18M7.5 10v10M12 10v10M16.5 10v10"/>',
  arbol:'<rect x="8" y="3" width="8" height="4"/><path d="M12 7v5M12 12l-7 8M12 12v8M12 12l7 8"/>',
  bandeja:'<path d="M3 13l2-8h14l2 8v6H3z M3 13h5l1 2h6l1-2h5"/>',
  calendario:'<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  revision:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  archivo:'<rect x="3" y="4" width="18" height="5"/><path d="M5 9v11h14V9M10 13h4"/>',
  ajustes:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
};
function icono(k){ return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${ICONOS[k]||""}</svg>`; }
function renderInicio(){
  const el = $("#portada"); const at = atencion(); const h = hoy();
  const col = (cls, tit, arr, vacio) => `<div class="colAt ${cls}"><h4><span>${tit}</span></h4><div class="num">${arr.length}</div>${arr.length ? arr.slice(0,7).map(x => `<div class="it" ${x.nodo?'data-abrirnodo="'+x.nodo+'"':''} ${x.band?'data-abrirband="'+x.band+'"':''} ${x.ir?'data-ir="'+x.ir+'"':''}><i style="background:${x.c}"></i><div>${esc(x.t)}<small>${esc(x.s||'')}</small></div></div>`).join("") + (arr.length>7?'<div class="nada">+'+(arr.length-7)+' más</div>':'') : '<div class="nada">'+vacio+'</div>'}</div>`;
  const plan = planDe(h); const hechas = plan.filter(x => x.franja === "hecho").length; const act = activosHoy();
  const semL = lunesDe(h); let semT = 0, semH = 0; for(let i=0;i<7;i++){ const p = planDe(sumar(semL,i)); semT += p.length; semH += p.filter(x => x.franja === "hecho").length; }
  const pend = datos.bandeja.filter(b => b.estado === "pendiente").length;
  const cuadros = datos.nodos.filter(n => n.tipo === "cuadro" && vivo(n)); const archN = datos.nodos.filter(n => n.archivado).length;
  const listaHoy = plan.length
    ? plan.filter(x => x.franja !== "hecho").slice(0,4).map(x => { const i = refInfo(x.ref); return { t:i.titulo, c:colorEsp(i.esp) }; })
    : act.slice(0,4).map(a => ({ t:a.nodo.titulo, c:colorEsp(espacioDe(a.nodo.id)?.id) }));
  const fichas = [
    { k:"hoy", ir:"hoy", grande:true, dato: plan.length ? `${hechas}/${plan.length} hechas hoy` : "sin planificar · esto es lo que toca", lista: listaHoy },
    { k:"semana", ir:"semana", dato: `${semH}/${semT} esta semana` },
    { k:"arbol", ir:"arbol", dato: `${espacios().length} espacio${espacios().length===1?'':'s'} · ${cuadros.filter(c=>c.estado==='hecho').length}/${cuadros.length} cuadros` },
    { k:"bandeja", ir:"bandeja", dato: pend ? pend + " sin procesar" : "vacía" },
    { k:"calendario", ir:"calendario", dato: `${datos.eventos.filter(e => e.fecha >= h && e.fecha <= sumar(h,14)).length} citas en 2 semanas` },
    { k:"revision", ir:"revision", dato: datos.ultimaRevision ? "última: " + fechaCorta(datos.ultimaRevision) : "ninguna todavía" },
    { k:"archivo", ir:"archivo", dato: archN + " archivado" + (archN===1?'':'s') },
    { k:"ajustes", ir:"ajustes", dato: (localStorage.getItem(LS_RT) ? "Dropbox ✓" : "sin Dropbox") + " · " + (localStorage.getItem(LS_API) ? "Claude ✓" : "sin Claude") }
  ];
  el.innerHTML = `<div class="arriba">${col("imp","★ Importante",at.imp,"nada marcado")}${col("ven","Vencido",at.ven,"nada vencido")}${col("pro","Próximos 7 días",at.pro,"nada esta semana")}${renderCal(h.slice(0,7), "medio")}</div>
    <div class="fichas">${fichas.map((f,i) => `<div class="ficha ${f.grande?'grande':''}" data-ir="${f.ir}"><div class="top">${icono(f.k)}<span class="num">${String(i+1).padStart(2,'0')}</span></div>${f.lista && f.lista.length ? `<div class="lista">${f.lista.map(x => `<div><i style="background:${x.c}"></i><span>${esc(x.t)}</span></div>`).join("")}</div>` : ''}<h3 data-ed="f_${f.k}">${esc(texto("f_"+f.k))}</h3><div class="dato">${esc(f.dato)}</div></div>`).join("")}</div>`;
  const calEl = el.querySelector(".cal"); calEl.onclick = (e) => { const dd = e.target.closest("[data-dia]"); if(dd){ calDia = dd.dataset.dia; calMes = calDia.slice(0,7); ir("calendario"); abrirDia(calDia); return; } calMes = h.slice(0,7); ir("calendario"); };
  el.querySelectorAll("[data-abrirnodo]").forEach(x => x.onclick = (e) => { e.stopPropagation(); abrir(x.dataset.abrirnodo); });
  el.querySelectorAll("[data-abrirband]").forEach(x => x.onclick = (e) => { e.stopPropagation(); abrirBandeja(x.dataset.abrirband); });
  el.querySelectorAll("[data-ed]").forEach(x => editable(x, texto(x.dataset.ed), v => setTexto(x.dataset.ed, v)));
  editable($("#titulo"), datos.titulo || "La raíz", v => { datos.titulo = v || "La raíz"; });
  editable($("#lema"), datos.lema || "", v => { datos.lema = v; });
}

/* ---------- calendario ---------- */
function marcasDelDia(f){
  const out = []; const h = hoy();
  for(const n of datos.nodos){ if((n.tipo !== "cuadro" && n.tipo !== "paso") || !vivo(n)) continue;
    if(n.inicio === f) out.push({ cls:"inicio", txt:"▶ " + n.titulo, nodo:n.id });
    if(n.plazo === f){ const cls = n.estado === "hecho" ? "hecho" : (f < h ? "vencido" : "plazo"); out.push({ cls, txt:"◆ " + n.titulo, nodo:n.id }); }
    if(n.cerrado === f && n.plazo !== f) out.push({ cls:"hecho", txt:"✓ " + n.titulo, nodo:n.id }); }
  for(const e of eventosDe(f)) out.push({ cls:"evento", txt:(e.hora ? e.hora + " · " : "") + e.texto, evento:e.id, nodo:e.nodo });
  return out;
}
function renderCal(mes, tam){
  const mini = tam === "mini" || tam === "medio";
  const [y,m] = mes.split("-").map(Number); const primero = new Date(y, m-1, 1); const dw = (primero.getDay()+6)%7; const inicio = new Date(y, m-1, 1 - dw); const h0 = hoy();
  let h = `<div class="cal ${mini?'mini':'grande'} ${tam==='medio'?'medio':''}"><div class="cabc"><h3>${mayus(MESES[m-1])} <span style="color:var(--grisClaro);font-weight:400">${y}</span></h3>`;
  h += mini ? `<span class="etq">Calendario ▸</span>` : `<div class="acciones"><button class="btn sec" data-cal="-1">◀</button><button class="btn sec" data-cal="0">Hoy</button><button class="btn sec" data-cal="1">▶</button></div>`;
  h += `</div><div class="dias">` + DCORTO.map(d=>`<div class="dn">${d}</div>`).join("");
  for(let i=0;i<42;i++){ const d = new Date(inicio); d.setDate(inicio.getDate()+i); const f = fechaStr(d); if(i >= 35 && d.getMonth() !== m-1) break;
    const fuera = d.getMonth() !== m-1; const ms = marcasDelDia(f);
    h += `<div class="d ${fuera?'fuera':''} ${f===h0?'hoy':''} ${f===calDia&&!mini?'sel':''}" data-dia="${f}"><span class="n">${d.getDate()}</span>`;
    if(mini) h += `<div class="ptos">` + ms.slice(0,3).map(x => `<i class="pto-${x.cls}"></i>`).join("") + `</div>`;
    else { h += ms.slice(0,3).map(x => `<span class="marca ${x.cls}" title="${esc(x.txt)}">${esc(x.txt)}</span>`).join(""); if(ms.length > 3) h += `<span class="marca">+${ms.length-3}</span>`; }
    h += `</div>`; }
  h += `</div>`;
  if(mini){ const prox = []; for(let i=0;i<14 && prox.length<5;i++){ const f = sumar(h0, i); for(const x of marcasDelDia(f)) if(prox.length<5 && x.cls!=="hecho") prox.push({f, ...x}); }
    h += `<div class="proximos">` + (prox.length ? prox.map(x => `<div data-dia="${x.f}"><i class="pto-${x.cls}"></i><span class="mono" style="color:var(--grisClaro);font-size:11px;min-width:44px">${fechaCorta(x.f)}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.txt)}</span></div>`).join("") : '<div class="aviso">Nada en dos semanas.</div>') + `</div>`; }
  else h += `<div class="leyenda"><span class="lp">plazo</span><span class="lv">vencido</span><span class="lh">hecho</span><span class="li">inicio</span><span class="le">anotación</span></div>`;
  return h + `</div>`;
}
function renderCalendario(){
  if(!calMes) calMes = hoy().slice(0,7); const el = $("#calGrande"); el.innerHTML = renderCal(calMes, "grande");
  el.querySelectorAll("[data-cal]").forEach(b => b.onclick = () => { const k = +b.dataset.cal; if(k===0) calMes = hoy().slice(0,7); else { const [y,m] = calMes.split("-").map(Number); calMes = fechaStr(new Date(y, m-1+k, 1)).slice(0,7); } renderCalendario(); });
  el.querySelectorAll("[data-dia]").forEach(d => d.onclick = () => { calDia = d.dataset.dia; abrirDia(calDia); renderCalendario(); });
}
function abrirDia(f){
  selId = null; abrirFicha("calendario", mayus(fechaLarga(f)));
  const ms = marcasDelDia(f); const vivos = datos.nodos.filter(n => (n.tipo==="cuadro"||n.tipo==="paso") && n.estado !== "hecho" && vivo(n));
  let h = `<div class="lista">` + (ms.length ? ms.map(x => `<div class="paso" ${x.nodo?('data-abrir="'+x.nodo+'"'):''}><span class="marca ${x.cls}" style="white-space:normal;flex:1;padding:3px 8px;border-radius:4px">${esc(x.txt)}</span>${x.evento?('<span class="mini"><button data-xe="'+x.evento+'" title="Borrar anotación">✕</button></span>'):''}</div>`).join("") : '<div class="aviso">Nada ese día.</div>') + `</div>`;
  h += `<div class="acciones"><div class="campo" style="flex:1"><label class="etq">Anotar en este día</label><input id="evTxt" placeholder="Reunión, visita, entrega…" style="width:100%" /></div><div class="campo"><label class="etq">Hora</label><input id="evHora" type="time" /></div></div>`;
  h += `<div class="campo"><label class="etq">Vincular a un cuadro (opcional)</label><select id="evNodo" style="width:100%"><option value="">—</option>${vivos.map(n=>`<option value="${n.id}">${esc(n.titulo)}</option>`).join("")}</select></div>`;
  h += `<div class="acciones"><button class="btn act" id="bEv">Anotar</button><button class="btn sec" id="bEvDia">Abrir la pizarra de ese día</button></div>`;
  const c = $("#pCuerpo"); c.innerHTML = h;
  $("#bEv").onclick = () => { const t = $("#evTxt").value.trim(); if(!t) return; const ev = { id: uid("ev"), fecha: f, texto: t }; if($("#evHora").value) ev.hora = $("#evHora").value; if($("#evNodo").value) ev.nodo = $("#evNodo").value; datos.eventos.push(ev); guardar(); abrirDia(f); render(); };
  $("#bEvDia").onclick = () => { cerrarPanel(); ir("hoy"); agFecha = f; render(); };
  $("#evTxt").addEventListener("keydown", e => { if(e.key==="Enter") $("#bEv").click(); });
  c.querySelectorAll("[data-xe]").forEach(b => b.onclick = (e) => { e.stopPropagation(); datos.eventos = datos.eventos.filter(x => x.id !== b.dataset.xe); guardar(); abrirDia(f); render(); });
  c.querySelectorAll("[data-abrir]").forEach(p => p.onclick = (e) => { if(e.target.closest(".mini")) return; abrir(p.dataset.abrir); });
}

/* ---------- agenda: día / semana / mes ---------- */
function chipsEspacios(conteo){
  return `<div class="chips">${espacios().map(e => `<span class="chipEsp ${ocultos.has(e.id)?'off':'on'}" data-filtro="${e.id}" title="Mostrar u ocultar"><i style="background:${e.color}"></i>${esc(e.nombre)}${conteo ? `<small>${conteo[e.id]||0}</small>` : ''}</span>`).join("")}<span class="chipEsp nuevo" data-ir="ajustes">+ espacio</span></div>`;
}
function visibleRef(ref, f){ const i = refInfo(ref); if(!i) return false; if(i.esp && ocultos.has(i.esp)) return false; if(i.arch && (!f || f >= hoy())) return false; return true; }
function posit(ref, desde, extra){
  const i = refInfo(ref); if(!i) return ""; extra = extra || {};
  const dia = (g) => DCORTO[dow(g)] + " " + aFecha(g).getDate();
  const etq = extra.movido ? `<span class="rojo">→ ${dia(extra.movido)}</span>` : extra.otroDia ? `<span>→ ${dia(extra.otroDia)}</span>` : extra.franja ? `<span>${FRANJA[extra.franja]}</span>` : "";
  return `<div class="pos ${i.hecho?'hecho':''} ${i.disp?'disp':''} ${i.tipo==='band'?'band':''} ${extra.movido?'movido':''}" draggable="true" data-ref="${esc(ref)}" data-desde="${desde}" style="--c:${colorEsp(i.esp)}"><div class="t">${i.importante?'<span style="color:#c9a227">★</span> ':''}${esc(i.titulo)}</div><div class="m"><span>${esc(i.meta)}${i.plazo?' · '+fechaCorta(i.plazo):''}${i.disp?' · disponible':''}</span>${etq}</div></div>`;
}
function evt(e){ return `<div class="evt" data-evento="${e.fecha}">${e.hora?'<b>'+e.hora+'</b>':'<b>·</b>'}${esc(e.texto)}</div>`; }
function poolHtml(excluir, conOtroDia){
  const refs = porHacer().filter(r => !excluir.has(r) && visibleRef(r));
  const grupos = {}; for(const r of refs){ const i = refInfo(r); const k = i.tipo === "band" ? "_band" : (i.esp || "_"); (grupos[k] = grupos[k] || []).push(r); }
  let h = `<div class="cabCol"><b>Por hacer</b><span>${refs.length}</span></div>`;
  for(const e of espacios()){ const g = grupos[e.id]; if(!g) continue; h += `<div class="grp"><i style="background:${e.color}"></i>${esc(e.nombre)}<span>${g.length}</span></div>` + g.map(r => posit(r, "pool", { otroDia: conOtroDia ? agendadoEn(r, hoy()) : null })).join(""); }
  if(grupos._band) h += `<div class="grp"><i style="background:var(--lineaFuerte)"></i>Bandeja<span>${grupos._band.length}</span></div>` + grupos._band.map(r => posit(r, "pool")).join("");
  if(!refs.length) h += `<div class="aviso">Nada pendiente. Activa cuadros en el árbol o captura en la bandeja.</div>`;
  return h;
}
function renderAgenda(){
  if(!agFecha) agFecha = hoy();
  const el = $("#agenda"); const h0 = hoy();
  let titulo, sub, paso;
  if(agModo === "dia"){ titulo = agFecha === h0 ? "Hoy" : mayus(DIAS[dow(agFecha)]); sub = fechaLarga(agFecha) + " · " + aFecha(agFecha).getFullYear(); paso = 1; }
  else if(agModo === "semana"){ const l = lunesDe(agFecha); titulo = "Semana " + semanaISO(agFecha); sub = fechaCorta(l) + " – " + fechaCorta(sumar(l,6)) + " · " + aFecha(l).getFullYear(); paso = 7; }
  else { const d = aFecha(agFecha); titulo = mayus(MESES[d.getMonth()]); sub = String(d.getFullYear()); paso = 0; }
  let h = `<div class="agCab"><div><div class="sub">${sub}</div><h2>${titulo}</h2></div><div class="acciones">
    <span class="seg"><button data-modo="dia" class="${agModo==='dia'?'on':''}">Día</button><button data-modo="semana" class="${agModo==='semana'?'on':''}">Semana</button><button data-modo="mes" class="${agModo==='mes'?'on':''}">Mes</button></span>
    <button class="btn sec" data-nav="-1" title="Anterior">◀</button><button class="btn sec" data-nav="0">Hoy</button><button class="btn sec" data-nav="1" title="Siguiente">▶</button>
    ${agModo !== "mes" ? `<button class="btn" id="bPlanificar">✦ Planifícame ${agModo==='dia'?'el día':'la semana'}</button>` : ''}</div></div>`;
  const restos = (agModo === "semana" || (agModo === "dia" && agFecha === h0)) ? diaConRestos() : null;
  if(restos) h += `<div class="banner">El ${fechaLarga(restos.f)} quedaron <b>${restos.p.length}</b> sin hacer.<button class="btn" id="bArrastrar">Pasarlas a hoy</button></div>`;
  if(agModo === "dia") h += renderDia(agFecha); else if(agModo === "semana") h += renderSemana(agFecha); else h += renderMes(agFecha);
  el.innerHTML = h;
  el.querySelectorAll("[data-modo]").forEach(b => b.onclick = () => { agModo = b.dataset.modo; renderAgenda(); });
  el.querySelectorAll("[data-nav]").forEach(b => b.onclick = () => { const k = +b.dataset.nav; if(k === 0) agFecha = h0; else if(agModo === "mes"){ const d = aFecha(agFecha); agFecha = fechaStr(new Date(d.getFullYear(), d.getMonth()+k, 1)); } else agFecha = sumar(agFecha, k*paso); renderAgenda(); });
  el.querySelectorAll("[data-filtro]").forEach(c => c.onclick = () => { const id = c.dataset.filtro; if(ocultos.has(id)) ocultos.delete(id); else ocultos.add(id); renderAgenda(); });
  const bp = $("#bPlanificar"); if(bp) bp.onclick = () => planificarConClaude(agModo);
  const ba = $("#bArrastrar"); if(ba) ba.onclick = () => { const snap = foto(); for(const x of restos.p) agendar(h0, x.ref, x.franja); guardar(); render(); toast(restos.p.length + " pasadas a hoy", snap); };
  el.querySelectorAll("[data-evento]").forEach(x => x.onclick = (e) => { e.stopPropagation(); abrirDia(x.dataset.evento); });
  el.querySelectorAll("[data-mesdia]").forEach(x => x.onclick = () => { agFecha = x.dataset.mesdia; agModo = "dia"; renderAgenda(); });
  el.querySelectorAll("[data-semdia]").forEach(x => x.onclick = () => { agFecha = x.dataset.semdia; agModo = "dia"; renderAgenda(); });
  el.querySelectorAll("[data-suelta]").forEach(b => b.onclick = (e) => { e.stopPropagation(); const t = prompt("Tarea suelta"); if(!t || !t.trim()) return; const [f, fr] = b.dataset.suelta.split("|"); const esp = espacios().find(x => !ocultos.has(x.id)) || espacios()[0]; const ta = nuevaTarea(t.trim(), esp.id); agendar(f, "tarea:" + ta.id, fr); guardar(); render(); });
  instalarArrastreAgenda(el);
}
function renderDia(f){
  const d = diaLeer(f); const enDia = new Set(["manana","tarde","sinhora","hecho"].flatMap(k => d[k]||[]));
  const conteo = {}; for(const x of planDe(f)){ const i = refInfo(x.ref); if(i && i.esp) conteo[i.esp] = (conteo[i.esp]||0) + 1; }
  const evs = eventosDe(f); const evM = evs.filter(e => !e.hora || e.hora < "14:00"), evT = evs.filter(e => e.hora && e.hora >= "14:00");
  const lista = (k) => (d[k]||[]).filter(r => visibleRef(r, f)).map(r => posit(r, f + "|" + k, { movido: (d.movido||{})[r] })).join("");
  const sinhora = (d.sinhora||[]).filter(r => visibleRef(r, f));
  const tot = planDe(f).length, hechas = (d.hecho||[]).filter(r => visibleRef(r, f)).length;
  let h = chipsEspacios(conteo) + `<div class="tableroDia">`;
  h += `<div class="colAg pool" data-drop="pool">${sinhora.length ? `<div class="cabCol"><b>Para este día</b><span>${sinhora.length} sin hora</span></div><div data-drop="${f}|sinhora" style="display:flex;flex-direction:column;gap:7px">${lista("sinhora")}</div><div style="height:10px"></div>` : ''}${poolHtml(enDia, true)}</div>`;
  h += `<div class="colAg" data-drop="${f}|manana"><div class="cabCol"><b>Mañana</b><span>${(d.manana||[]).length}</span></div>${evM.map(evt).join("")}${lista("manana")}<button class="suelta" data-suelta="${f}|manana">+ tarea suelta</button><div class="huecoDrop">ARRASTRA AQUÍ</div></div>`;
  h += `<div class="colAg" data-drop="${f}|tarde"><div class="cabCol"><b>Tarde</b><span>${(d.tarde||[]).length}</span></div>${evT.map(evt).join("")}${lista("tarde")}<button class="suelta" data-suelta="${f}|tarde">+ tarea suelta</button><div class="huecoDrop">ARRASTRA AQUÍ</div></div>`;
  h += `<div class="colAg" data-drop="${f}|hecho"><div class="cabCol"><b>Hecho</b><span>${hechas}/${tot}</span></div>${lista("hecho")}<div class="huecoDrop">SUELTA LO TERMINADO</div></div>`;
  return h + `</div>`;
}
function renderSemana(f){
  const l = lunesDe(f); const dias = [0,1,2,3,4,5,6].map(i => sumar(l,i)); const h0 = hoy();
  const enSemana = new Set(); const conteo = {};
  for(const g of dias){ const d = diaLeer(g); for(const k of ["manana","tarde","sinhora","hecho"]) for(const r of (d[k]||[])){ if(k === "hecho" || !(d.movido||{})[r]) enSemana.add(r); const i = refInfo(r); if(i && i.esp) conteo[i.esp] = (conteo[i.esp]||0) + 1; } }
  let h = chipsEspacios(conteo) + `<div class="tableroSem"><div class="colAg pool" data-drop="pool">${poolHtml(enSemana, false)}</div>`;
  let totT = 0, totH = 0; const porEsp = {};
  for(const g of dias){
    const d = diaLeer(g); const pasado = g < h0, esHoy = g === h0, finde = dow(g) >= 5;
    const items = ["manana","tarde","sinhora","hecho"].flatMap(k => (d[k]||[]).filter(r => visibleRef(r, g)).map(r => ({ r, k })));
    const hechas = items.filter(x => x.k === "hecho").length; totT += items.length; totH += hechas;
    for(const x of items){ const i = refInfo(x.r); const e = i.esp || "_"; porEsp[e] = porEsp[e] || [0,0]; porEsp[e][0]++; if(x.k === "hecho") porEsp[e][1]++; }
    const cuerpo = eventosDe(g).map(evt).join("") + items.map(x => posit(x.r, g + "|" + x.k, { franja: x.k === "hecho" ? null : x.k, movido: (d.movido||{})[x.r] })).join("");
    h += `<div class="colAg ${finde?'finde':''}" data-drop="${g}|sinhora"><div class="cabCol ${esHoy?'hoy':(pasado?'dim':'')}" data-semdia="${g}" style="cursor:pointer" title="Abrir la pizarra de este día"><b><span class="mono" style="font-size:10px;font-weight:400;color:var(--grisClaro);margin-right:4px">${DCORTO[dow(g)].toUpperCase()}</span><span class="dnum">${aFecha(g).getDate()}</span></b><span>${items.length ? hechas + '/' + items.length : ''}</span></div>${cuerpo || '<div class="huecoDrop">LIBRE</div>'}</div>`;
  }
  h += `</div><div class="resumenSem"><span style="color:var(--tinta)">SEMANA ${semanaISO(f)} · ${totH} de ${totT} hechas</span>${espacios().filter(e => porEsp[e.id]).map(e => `<span><i style="background:${e.color}"></i>${esc(e.nombre)} ${porEsp[e.id][1]}/${porEsp[e.id][0]}</span>`).join("")}<span style="margin-left:auto">toca una tarea para elegir mañana o tarde · clic en un día para abrir su pizarra</span></div>`;
  return h;
}
function renderMes(f){
  const d0 = aFecha(f); const y = d0.getFullYear(), m = d0.getMonth(); const ini = lunesDe(fechaStr(new Date(y, m, 1))); const h0 = hoy();
  let h = `<div class="mes">` + DCORTO.map(x => `<div class="dn">${x}</div>`).join("");
  let totT = 0, totH = 0;
  for(let i=0;i<42;i++){ const g = sumar(ini, i); const dd = aFecha(g); if(i >= 35 && dd.getMonth() !== m) break; const fuera = dd.getMonth() !== m;
    const p = planDe(g); const hechas = p.filter(x => x.franja === "hecho"); if(!fuera){ totT += p.length; totH += hechas.length; }
    const ptos = hechas.map(x => { const inf = refInfo(x.ref); return `<i style="background:${colorEsp(inf && inf.esp)}"></i>`; }).join("");
    h += `<div class="d ${fuera?'fuera':''} ${g===h0?'hoy':''}" data-mesdia="${g}"><span class="n">${dd.getDate()}</span><div class="ptos">${ptos}</div>${p.length ? `<span class="r">${hechas.length}/${p.length}</span>` : ''}</div>`; }
  h += `</div><div class="resumenSem"><span style="color:var(--tinta)">${MESES[m].toUpperCase()} ${y} · ${totH} de ${totT} hechas</span><span>cada punto es una tarea hecha, con el color de su espacio</span><span style="margin-left:auto">clic en un día para abrir su pizarra</span></div>`;
  return h;
}
function menuPosit(ref, desde, ancla){
  document.querySelectorAll(".menuPos").forEach(m => m.remove());
  const i = refInfo(ref); if(!i) return;
  const [f, franjaAct] = desde === "pool" ? [agModo === "dia" ? agFecha : null, null] : desde.split("|");
  const m = document.createElement("div"); m.className = "menuPos";
  let h = `<div class="t">${esc(i.titulo).slice(0,60)}</div>`;
  if(f){ h += `<div class="t">${mayus(fechaLarga(f))}</div>` + ["manana","tarde","sinhora","hecho"].filter(k => k !== franjaAct).map(k => `<button data-a="fr|${f}|${k}">${k === "hecho" ? "Hecho ✓" : mayus(FRANJA[k])}</button>`).join(""); if(franjaAct) h += `<button data-a="quitar|${f}">Quitar del día</button>`; }
  const l = lunesDe(agFecha); h += `<div class="t">Llevar a un día</div><div class="fila">${[0,1,2,3,4,5,6].map(k => { const g = sumar(l,k); return `<button data-a="fr|${g}|sinhora" title="${fechaLarga(g)}">${DCORTO[k]} ${aFecha(g).getDate()}</button>`; }).join("")}</div>`;
  if(i.tipo === "nodo") h += `<button data-a="abrir">Abrir en el árbol</button>`; else if(i.tipo === "band") h += `<button data-a="band">Procesar en la bandeja</button>`; else h += `<button data-a="tarea">Editar tarea</button>`;
  m.innerHTML = h; document.body.appendChild(m);
  const r = ancla.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - m.offsetWidth - 8)) + "px"; m.style.top = (r.bottom + window.scrollY + 4) + "px";
  m.onclick = (e) => e.stopPropagation();
  m.querySelectorAll("[data-a]").forEach(b => b.onclick = (e) => { e.stopPropagation(); const [a, g, fr] = b.dataset.a.split("|"); m.remove();
    if(a === "fr"){ const snap = foto(); if(agendar(g, ref, fr)){ guardar(); render(); toast(fr === "hecho" ? "Hecho" : "Planificado: " + fechaCorta(g) + " · " + FRANJA[fr], snap); } }
    if(a === "quitar"){ const snap = foto(); desagendar(g, ref); guardar(); render(); toast("Quitado del día", snap); }
    if(a === "abrir") abrir(ref); if(a === "band") abrirBandeja(ref.slice(5)); if(a === "tarea") abrirTarea(ref.slice(6)); });
  setTimeout(() => document.addEventListener("click", () => m.remove(), { once:true }), 0);
}
function instalarArrastreAgenda(el){
  let drag = null;
  el.querySelectorAll(".pos[data-ref]").forEach(p => {
    p.addEventListener("dragstart", (e) => { drag = { ref: p.dataset.ref, desde: p.dataset.desde }; p.classList.add("arrastrando"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", drag.ref); });
    p.addEventListener("dragend", () => { p.classList.remove("arrastrando"); el.querySelectorAll(".sobre").forEach(x => x.classList.remove("sobre")); drag = null; });
    p.addEventListener("click", (e) => { e.stopPropagation(); menuPosit(p.dataset.ref, p.dataset.desde, p); });
  });
  el.querySelectorAll("[data-drop]").forEach(z => {
    z.addEventListener("dragover", (e) => { if(!drag) return; e.preventDefault(); e.stopPropagation(); el.querySelectorAll(".sobre").forEach(x => x !== z && x.classList.remove("sobre")); z.classList.add("sobre"); });
    z.addEventListener("dragleave", (e) => { if(!z.contains(e.relatedTarget)) z.classList.remove("sobre"); });
    z.addEventListener("drop", (e) => { if(!drag) return; e.preventDefault(); e.stopPropagation(); z.classList.remove("sobre"); const destino = z.dataset.drop; const { ref, desde } = drag; drag = null;
      const snap = foto();
      if(destino === "pool"){ if(desde === "pool") return; desagendar(desde.split("|")[0], ref); }
      else {
        const [g, fr] = destino.split("|"); let franja = fr;
        if(agModo === "semana" && desde !== "pool"){ const [g0, fr0] = desde.split("|"); if(g0 === g) return; if(fr0 === "hecho"){ toast("Ya está hecho ese día"); return; } franja = fr0; }
        if(!agendar(g, ref, franja)) return;
        if(franja === "hecho") toast("Hecho", snap);
      }
      guardar(); render(); });
  });
}
function abrirTarea(id){
  const t = tarea(id); if(!t) return; selId = null; abrirFicha("tarea suelta", t.titulo);
  $("#pCuerpo").innerHTML = `<div class="acciones"><button class="estrella ${t.importante?'on':''}" id="tImp" title="Importante">★</button><input id="tTit" value="${esc(t.titulo)}" style="flex:1" /></div>
    <div class="campo"><label class="etq">Espacio</label><select id="tEsp" style="width:100%">${espacios().map(e => `<option value="${e.id}" ${e.id===t.espacio?'selected':''}>${esc(e.nombre)}</option>`).join("")}</select></div>
    <div class="acciones"><button class="btn act" id="tOk">Guardar</button><button class="btn sec" id="tHecha">${t.hecho?'Reabrir':'Marcar hecha'}</button><button class="btn rojo" id="tDel" style="margin-left:auto">Eliminar</button></div>`;
  $("#tImp").onclick = () => { if(t.importante) delete t.importante; else t.importante = true; guardar(); abrirTarea(id); render(); };
  $("#tOk").onclick = () => { t.titulo = $("#tTit").value.trim() || t.titulo; t.espacio = $("#tEsp").value; guardar(); cerrarPanel(); render(); };
  $("#tHecha").onclick = () => { t.hecho = !t.hecho; if(t.hecho) t.cerrado = hoy(); else delete t.cerrado; guardar(); cerrarPanel(); render(); };
  $("#tDel").onclick = () => { const snap = foto(); datos.tareas = datos.tareas.filter(x => x.id !== id); for(const g of Object.keys(datos.agenda)) quitarDeDia(g, "tarea:" + id); guardar(); cerrarPanel(); render(); toast("Tarea eliminada", snap); };
}

/* ---------- árbol ---------- */
function renderArbol(){
  if(!espacio(espacioSel)) espacioSel = espacios()[0].id;
  $("#chipsArbol").innerHTML = espacios().map(e => `<span class="chipEsp ${e.id===espacioSel?'on':'off'}" data-esp="${e.id}"><i style="background:${e.color}"></i>${esc(e.nombre)}<small>${raices(e.id).length}</small></span>`).join("") + `<span class="chipEsp nuevo" id="bChipNuevo">+ espacio</span>`;
  $("#chipsArbol").querySelectorAll("[data-esp]").forEach(c => c.onclick = () => { espacioSel = c.dataset.esp; localStorage.setItem(LS_ESP, espacioSel); raizMovil = null; renderArbol(); });
  $("#bChipNuevo").onclick = () => { const n = prompt("Nombre del nuevo espacio (un trabajo, un proyecto grande, lo personal…)"); if(!n || !n.trim()) return; espacioSel = nuevoEspacio(n.trim()); localStorage.setItem(LS_ESP, espacioSel); guardar(); render(); };
  const obj = nodo(espacioSel); const tronco = datos.nodos.find(n => n.tipo === "contexto" && n.espacio === espacioSel);
  $("#copa").textContent = obj ? obj.titulo : ""; $("#tronco").textContent = tronco ? tronco.titulo : "";
  if(obj) editable($("#copa"), obj.titulo, v => { if(v) obj.titulo = v; });
  if(tronco) editable($("#tronco"), tronco.titulo, v => { if(v) tronco.titulo = v; });
  const rs = raices(); if(!raizMovil || !rs.find(r => r.id === raizMovil)) raizMovil = rs[0] && rs[0].id;
  $("#pestanas").innerHTML = rs.map(r => `<button class="${r.id===raizMovil?'on':''}" data-raizm="${r.id}">${esc(r.titulo)}</button>`).join("");
  $("#pestanas").querySelectorAll("[data-raizm]").forEach(b => b.onclick = () => { raizMovil = b.dataset.raizm; renderArbol(); });
  const arbol = $("#arbol"); let h = '<div class="tablero" id="tablero">';
  for(const r of rs){ const cs = hijosVivos(r.id); const hechos = cs.filter(c=>c.estado==="hecho").length;
    h += `<section class="raiz ${r.id===raizMovil?'movilOn':''}" data-raiz="${r.id}"><h2 draggable="true" data-asa="${r.id}"><span class="asa" title="Arrastra para mover la columna">⋮⋮</span><span class="titulo-raiz" data-ren="${r.id}" title="Clic para renombrar">${esc(r.titulo)}</span><small>${hechos}/${cs.length}</small><button class="mas" data-menu="${r.id}" title="Menú">···</button></h2><div class="cuadros" data-lista="${r.id}">`;
    for(const c of cs){ const nh = hijosVivos(c.id);
      h += `<div class="cuadro ${c.estado} ${c.id===selId?'sel':''}" draggable="true" data-id="${c.id}"><div class="t">${c.importante?'<span style="color:#c9a227">★</span> ':''}${esc(c.titulo)}</div><div class="m">${c.plazo?('<span>▸ '+fechaCorta(c.plazo)+'</span>'):''}${c.estado==='activo'&&nh.length?('<span>'+nh.filter(x=>x.estado==='hecho').length+'/'+nh.length+' pasos</span>'):''}${c.estado==='disponible'?'<span>disponible</span>':''}</div>${c.notas&&c.notas.length?'<div class="hijos">✎'+c.notas.length+'</div>':''}</div>`; }
    h += `</div><button class="masCuadro" data-nuevo="${r.id}">+ cuadro</button></section>`; }
  if(!rs.length) h += `<div class="aviso" style="align-self:center;max-width:320px">Este espacio está vacío. Crea su primera raíz o pídele a Claude que te lo organice.</div>`;
  h += `<button class="nuevaRaiz" id="bNuevaRaiz">+ raíz</button></div>`; arbol.innerHTML = h;
  arbol.querySelectorAll(".cuadro").forEach(el => el.onclick = () => abrir(el.dataset.id));
  arbol.querySelectorAll("[data-nuevo]").forEach(el => el.onclick = () => { const t = prompt("Título del nuevo cuadro"); if(t && t.trim()){ nuevoHijo(el.dataset.nuevo, t.trim()); guardar(); render(); } });
  $("#bNuevaRaiz").onclick = () => { const t = prompt("Nombre de la nueva raíz"); if(t && t.trim()){ nuevaRaiz(t.trim()); guardar(); render(); } };
  arbol.querySelectorAll("[data-ren]").forEach(el => el.onclick = (e) => { e.stopPropagation(); const id = el.dataset.ren; const inp = document.createElement("input"); inp.value = nodo(id).titulo; el.replaceWith(inp); inp.focus(); inp.select();
    let fin = false; const ok = () => { if(fin) return; fin = true; const v = inp.value.trim(); if(v) nodo(id).titulo = v; guardar(); render(); }; inp.onblur = ok; inp.onkeydown = (ev) => { if(ev.key==="Enter") ok(); if(ev.key==="Escape"){ fin = true; render(); } }; });
  arbol.querySelectorAll("[data-menu]").forEach(b => b.onclick = (e) => { e.stopPropagation(); menuRaiz(b.dataset.menu, b); });
  instalarArrastre(arbol);
}
function menuRaiz(id, ancla){
  document.querySelectorAll(".menuRaiz").forEach(m => m.remove()); const r = nodo(id); const rs = raices(); const i = rs.findIndex(x => x.id === id);
  const m = document.createElement("div"); m.className = "menuRaiz";
  m.innerHTML = `<button data-o="ren">Renombrar</button><button data-o="izq" ${i===0?'disabled':''}>◀ Mover a la izquierda</button><button data-o="der" ${i===rs.length-1?'disabled':''}>Mover a la derecha ▶</button>${espacios().length > 1 ? `<button data-o="esp">Llevar a otro espacio…</button>` : ''}<button data-o="arch">Archivar raíz</button><button data-o="del" class="rojo">Eliminar raíz…</button>`;
  const rect = ancla.getBoundingClientRect(); m.style.left = Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - 220) + "px"; m.style.top = (rect.bottom + window.scrollY + 4) + "px"; document.body.appendChild(m);
  m.querySelectorAll("button").forEach(b => b.onclick = () => { const o = b.dataset.o; m.remove(); const snap = foto();
    if(o==="ren"){ const t = prompt("Nuevo nombre", r.titulo); if(t && t.trim()) r.titulo = t.trim(); }
    if(o==="izq") mover(id, -1); if(o==="der") mover(id, 1);
    if(o==="esp"){ const otros = espacios().filter(e => e.id !== espacioSel); const n = prompt("¿A qué espacio la llevas?\n" + otros.map((e,k) => (k+1) + ". " + e.nombre).join("\n"), "1"); const e = otros[(+n||0) - 1]; if(!e) return; moverA(id, e.id, 999); guardar(); render(); toast("Llevada a " + e.nombre, snap); return; }
    if(o==="arch"){ archivar(id); guardar(); render(); toast("Raíz archivada · está en Archivo", snap); return; }
    if(o==="del"){ if(eliminar(id)){ guardar(); render(); toast("Raíz eliminada", snap); } return; }
    guardar(); render(); });
  setTimeout(() => document.addEventListener("click", () => m.remove(), { once:true }), 0);
}
function instalarArrastre(arbol){
  let dragId = null, dragTipo = null;
  const limpiar = () => arbol.querySelectorAll(".arrastrando,.sobre,.sobre-antes,.sobre-despues").forEach(x => x.classList.remove("arrastrando","sobre","sobre-antes","sobre-despues"));
  arbol.querySelectorAll(".cuadro[draggable]").forEach(el => {
    el.addEventListener("dragstart", (e) => { dragId = el.dataset.id; dragTipo = "cuadro"; el.classList.add("arrastrando"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); });
    el.addEventListener("dragend", () => { dragId = null; dragTipo = null; limpiar(); });
    el.addEventListener("dragover", (e) => { if(dragTipo !== "cuadro" || dragId === el.dataset.id) return; e.preventDefault(); const mitad = e.clientY < el.getBoundingClientRect().top + el.offsetHeight/2; el.classList.toggle("sobre-antes", mitad); el.classList.toggle("sobre-despues", !mitad); });
    el.addEventListener("dragleave", () => el.classList.remove("sobre-antes","sobre-despues"));
    el.addEventListener("drop", (e) => { if(dragTipo !== "cuadro") return; e.preventDefault(); e.stopPropagation(); const destino = nodo(el.dataset.id); const hs = hijos(destino.padre).filter(h => h.id !== dragId); let idx = hs.findIndex(h => h.id === destino.id); if(!el.classList.contains("sobre-antes")) idx += 1; limpiar(); moverA(dragId, destino.padre, idx); guardar(); render(); }); });
  arbol.querySelectorAll(".cuadros[data-lista]").forEach(el => {
    el.addEventListener("dragover", (e) => { if(dragTipo !== "cuadro") return; e.preventDefault(); el.classList.add("sobre"); });
    el.addEventListener("dragleave", (e) => { if(!el.contains(e.relatedTarget)) el.classList.remove("sobre"); });
    el.addEventListener("drop", (e) => { if(dragTipo !== "cuadro") return; e.preventDefault(); limpiar(); moverA(dragId, el.dataset.lista, 999); guardar(); render(); }); });
  arbol.querySelectorAll("h2[data-asa]").forEach(h2 => { const col = h2.closest(".raiz");
    h2.addEventListener("dragstart", (e) => { if(e.target.tagName === "INPUT"){ e.preventDefault(); return; } dragId = h2.dataset.asa; dragTipo = "raiz"; col.classList.add("arrastrando"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); });
    h2.addEventListener("dragend", () => { dragId = null; dragTipo = null; limpiar(); });
    col.addEventListener("dragover", (e) => { if(dragTipo !== "raiz" || dragId === col.dataset.raiz) return; e.preventDefault(); col.classList.add("sobre"); });
    col.addEventListener("dragleave", (e) => { if(!col.contains(e.relatedTarget)) col.classList.remove("sobre"); });
    col.addEventListener("drop", (e) => { if(dragTipo !== "raiz") return; e.preventDefault(); e.stopPropagation(); const rs = hijos(espacioSel).filter(r => r.id !== dragId); let idx = rs.findIndex(r => r.id === col.dataset.raiz); if(e.clientX > col.getBoundingClientRect().left + col.offsetWidth/2) idx += 1; limpiar(); moverA(dragId, espacioSel, idx); guardar(); render(); }); });
}

/* ---------- panel de nodo ---------- */
function abrirFicha(ruta, titulo){ $("#panel").classList.add("open"); $("#velo").classList.add("open"); $("#pRuta").textContent = ruta; const t = $("#pTitulo"); t.textContent = titulo; t.classList.remove("ed"); t.ondblclick = null; t.title = ""; $("#pMenu").innerHTML = ""; $("#pCuerpo").scrollTop = 0; }
function abrir(id){ const n = nodo(id); if(!n) return; const e = espacioDe(id); if(e && e.id !== espacioSel && vista === "arbol") espacioSel = e.id; selId = id; abrirFicha("", n.titulo); renderPanel(); if(vista === "arbol") renderArbol(); }
function cerrarPanel(){ selId = null; calDia = null; $("#panel").classList.remove("open"); $("#velo").classList.remove("open"); document.querySelectorAll(".menuRaiz").forEach(m => m.remove()); }
function renderPanel(){
  const n = nodo(selId); if(!n){ cerrarPanel(); return; }
  const e = espacioDe(n.id); const arch = archivadoEf(n); const hs = hijosVivos(n.id); const hechos = hs.filter(x => x.estado === "hecho").length;
  $("#pRuta").textContent = (e && espacios().length > 1 ? e.nombre + " › " : "") + ruta(n.padre).join(" › ") || (e ? e.nombre : "");
  const tit = $("#pTitulo"); tit.textContent = n.titulo; editable(tit, n.titulo, v => { if(v) editar(n.id, "titulo", v); });
  const pm = $("#pMenu"); pm.innerHTML = `<button class="mas" aria-label="Más" title="Más opciones">···</button>`;
  pm.querySelector(".mas").onclick = (ev) => { ev.stopPropagation(); document.querySelectorAll(".menuRaiz").forEach(m => m.remove());
    const m = document.createElement("div"); m.className = "menuRaiz";
    const padres = n.tipo === "cuadro" ? todasRaices().filter(r => r.id !== n.padre) : n.tipo === "paso" ? datos.nodos.filter(x => x.tipo === "cuadro" && vivo(x) && x.id !== n.padre) : [];
    m.innerHTML = `${n.estado === "hecho" ? '<button data-o="reabrir">Reabrir</button>' : ''}${n.tipo !== "raiz" && !arch ? '<button data-o="hoy">→ Pasar a la pizarra de hoy</button>' : ''}${padres.length ? '<button data-o="mover">' + (n.tipo === "paso" ? "Mover a otro cuadro…" : "Mover a otra raíz…") + '</button>' : ''}${(n.tipo === "raiz" || n.tipo === "cuadro") ? (n.archivado ? '<button data-o="restaurar">Restaurar del archivo</button>' : '<button data-o="archivar">Archivar</button>') : ''}<button data-o="del" class="rojo">Eliminar…</button>`;
    const r = pm.getBoundingClientRect(); m.style.position = "fixed"; m.style.left = Math.max(8, r.right - 220) + "px"; m.style.top = (r.bottom + 4) + "px"; document.body.appendChild(m);
    m.querySelectorAll("button").forEach(b => b.onclick = () => { const o = b.dataset.o; m.remove(); const snap = foto();
      if(o === "reabrir"){ reabrir(n.id); guardar(); render(); }
      if(o === "hoy"){ agendar(hoy(), n.id, "sinhora"); guardar(); render(); toast("En la pizarra de hoy", snap); }
      if(o === "mover"){ const k = prompt("¿A cuál?\n" + padres.map((x,i) => (i+1) + ". " + (n.tipo === "paso" ? ruta(x.id).join(" › ") : x.titulo)).join("\n"), "1"); const d = padres[(+k||0)-1]; if(!d) return; moverA(n.id, d.id, 999); guardar(); render(); toast("Movido a " + d.titulo, snap); }
      if(o === "archivar"){ archivar(n.id); guardar(); render(); toast("Archivado · está en Archivo", snap); }
      if(o === "restaurar"){ restaurar(n.id); guardar(); render(); toast("Restaurado", snap); }
      if(o === "del"){ if(eliminar(n.id)){ guardar(); render(); toast("Eliminado", snap); } } });
    setTimeout(() => document.addEventListener("click", () => m.remove(), { once:true }), 0); };
  let h = arch ? `<div class="archivado">Archivado el ${fechaCorta(arch)}.${n.archivado ? '<button class="btn" data-a="restaurar" style="margin-left:auto">Restaurar</button>' : ''}</div>` : "";
  const etiq = n.tipo === "raiz" ? "Cuadros" : "Pasos";
  let main = `<div class="chipsF"><span class="chip ${n.estado}">${n.estado}</span>${n.importante ? '<span class="chip activo">★ importante</span>' : ''}${n.plazo ? '<span class="chip ' + (n.plazo < hoy() && n.estado !== "hecho" ? "vencido" : "") + '">plazo ' + fechaCorta(n.plazo) + '</span>' : ''}${n.inicio ? '<span class="chip">desde ' + fechaCorta(n.inicio) + '</span>' : ''}${n.cerrado ? '<span class="chip hecho">hecho ' + fechaCorta(n.cerrado) + '</span>' : ''}${n.hecho_cuando ? '<span class="chip" title="Hecho cuando…">✓ ' + esc(n.hecho_cuando) + '</span>' : ''}</div>`;
  main += `<div><div class="cabPasos"><h4>${etiq}</h4><span>${hechos} de ${hs.length}</span></div>${hs.length ? `<div class="progreso" style="margin:8px 0 10px"><i style="width:${Math.round(100*hechos/Math.max(1,hs.length))}%"></i></div>` : '<div style="height:8px"></div>'}<div class="lista" id="listaPasos">`;
  hs.forEach(p => { main += `<div class="paso ${p.estado}" data-abrir="${p.id}" draggable="true"><button class="check" data-check="${p.id}" title="${p.estado === 'hecho' ? 'Reabrir' : 'Marcar hecho'}" aria-label="Marcar hecho">✓</button><span class="t">${p.importante ? '<span style="color:#c9a227">★</span> ' : ''}${esc(p.titulo)}${p.plazo ? '<small class="mono" style="color:var(--grisClaro);font-size:10px;margin-left:8px">' + fechaCorta(p.plazo) + '</small>' : ''}</span><span class="asa" title="Arrastra para ordenar">⋮⋮</span><button class="x" data-x="${p.id}" title="Eliminar">✕</button></div>`; });
  main += `</div>`;
  if(n.estado === "activo" || n.tipo === "raiz" || hs.length) main += `<div class="acciones" style="margin-top:8px"><input id="nuevoPaso" placeholder="${n.tipo==='raiz'?'Nuevo cuadro… (Enter)':'Nuevo paso… (Enter)'}" style="flex:1" /><button class="btn" data-a="nuevoPaso">+</button></div>`; else main += `<div class="aviso" style="margin-top:6px">Actívalo para desglosarlo en pasos.</div>`;
  main += `</div>`;
  main += `<div><div class="cabPasos"><h4>Notas</h4><span>${(n.notas||[]).length}</span></div><textarea class="notaIn" id="nuevaNota" placeholder="Apunta algo y pulsa Enter (Mayús+Enter para salto de línea)" style="margin-top:8px"></textarea><div class="lista" style="margin-top:8px">${(n.notas||[]).map(x => `<div class="nota"><div class="f">${x.fecha}</div>${esc(x.texto)}</div>`).join("")}</div></div>`;
  let lado = `<div class="bloque">`;
  if(n.estado === "disponible") lado += `<button class="btn act" data-a="activar">Activar</button>`;
  else if(n.estado === "activo" && n.tipo !== "raiz") lado += `<button class="btn act" data-a="hecho">Marcar hecho</button>`;
  else if(n.estado === "hecho") lado += `<button class="btn sec" data-a="reabrir">Reabrir</button>`;
  else if(n.estado === "bloqueado") lado += `<div class="aviso">Bloqueado: se abre al terminar el anterior.</div>`;
  if((n.tipo === "paso" || n.tipo === "cuadro") && n.estado !== "hecho" && !arch) lado += `<button class="btn sec" data-a="hoyA">→ Hoy</button>`;
  lado += `<button class="btn sec" data-a="imp">${n.importante ? "★ Quitar importante" : "☆ Marcar importante"}</button></div>`;
  lado += `<div class="bloque"><div class="campo"><label class="etq">Plazo</label><input data-e="plazo" type="date" value="${n.plazo||''}" /></div><div class="campo"><label class="etq">Inicio</label><input data-e="inicio" type="date" value="${n.inicio||''}" /></div><div class="campo"><label class="etq">Hecho cuando…</label><input data-e="hecho_cuando" value="${esc(n.hecho_cuando||'')}" placeholder="Criterio verificable" /></div></div>`;
  h += `<div class="fichaGrid"><div class="principal">${main}</div><div class="lado">${lado}</div></div>`;
  const c = $("#pCuerpo"); c.innerHTML = h;
  c.querySelectorAll("[data-a]").forEach(b => b.onclick = () => { const a = b.dataset.a; const snap = foto();
    if(a==="imp") toggleImportante(n.id, false); if(a==="activar") activar(n.id); if(a==="hecho") marcarHecho(n.id); if(a==="reabrir") reabrir(n.id);
    if(a==="restaurar"){ restaurar(n.id); toast("Restaurado"); }
    if(a==="hoyA"){ agendar(hoy(), n.id, "sinhora"); toast("En la pizarra de hoy", snap); }
    if(a==="nuevoPaso"){ const t=$("#nuevoPaso").value.trim(); if(!t) return; nuevoHijo(n.id, t); }
    guardar(); render(); });
  const np = $("#nuevoPaso"); if(np) np.addEventListener("keydown", ev => { if(ev.key === "Enter"){ ev.preventDefault(); c.querySelector('[data-a="nuevoPaso"]').click(); } });
  $("#nuevaNota").addEventListener("keydown", ev => { if(ev.key === "Enter" && !ev.shiftKey){ ev.preventDefault(); const t = ev.target.value.trim(); if(!t) return; addNota(n.id, t); guardar(); render(); } });
  c.querySelectorAll("[data-e]").forEach(i => i.onchange = () => { editar(n.id, i.dataset.e, i.value.trim()); guardar(); render(); });
  c.querySelectorAll("[data-abrir]").forEach(p => p.onclick = (e) => { if(e.target.closest(".check,.x,.asa")) return; abrir(p.dataset.abrir); });
  c.querySelectorAll("[data-check]").forEach(b => b.onclick = (e) => { e.stopPropagation(); const p = nodo(b.dataset.check); if(!p) return; const snap = foto();
    if(p.estado === "hecho"){ reabrir(p.id); } else if(p.estado === "bloqueado"){ toast("Está bloqueado: termina antes el anterior"); return; } else { if(!marcarHecho(p.id)) return; }
    guardar(); render(); if(p.estado === "hecho") toast("Hecho: " + p.titulo, snap); });
  c.querySelectorAll("[data-x]").forEach(b => b.onclick = (e) => { e.stopPropagation(); const snap = foto(); if(eliminar(b.dataset.x)){ guardar(); render(); toast("Eliminado", snap); } });
  let dragP = null; const lp = $("#listaPasos");
  lp.querySelectorAll(".paso").forEach(el => {
    el.addEventListener("dragstart", (ev) => { dragP = el.dataset.abrir; el.classList.add("arrastrando"); ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", dragP); });
    el.addEventListener("dragend", () => { dragP = null; lp.querySelectorAll(".arrastrando,.sobre-antes,.sobre-despues").forEach(x => x.classList.remove("arrastrando","sobre-antes","sobre-despues")); });
    el.addEventListener("dragover", (ev) => { if(!dragP || dragP === el.dataset.abrir) return; ev.preventDefault(); const mitad = ev.clientY < el.getBoundingClientRect().top + el.offsetHeight/2; el.classList.toggle("sobre-antes", mitad); el.classList.toggle("sobre-despues", !mitad); });
    el.addEventListener("dragleave", () => el.classList.remove("sobre-antes","sobre-despues"));
    el.addEventListener("drop", (ev) => { if(!dragP) return; ev.preventDefault(); ev.stopPropagation(); const dest = nodo(el.dataset.abrir); const rest = hijos(dest.padre).filter(x => x.id !== dragP); let idx = rest.findIndex(x => x.id === dest.id); if(!el.classList.contains("sobre-antes")) idx += 1; moverA(dragP, dest.padre, idx); dragP = null; guardar(); render(); }); });
}

/* ---------- bandeja (vista) ---------- */
function porMeses(arr){
  const g = {}; for(const b of arr){ const k = (b.procesado || b.fecha || "").slice(0,7); (g[k] = g[k] || []).push(b); }
  return Object.keys(g).sort().reverse().map(k => ({ k, items: g[k] }));
}
function itemHtml(b){ return `<div class="item ${b.importante?'imp':''}" data-b="${b.id}"><button class="estrella ${b.importante?'on':''}" data-imp="${b.id}" title="Importante">★</button><div class="tx">${esc(b.texto)}<div class="f">${fechaCorta(b.fecha)}${b.destino?' · '+esc(b.destino):''}</div></div><button class="x" data-xb="${b.id}" title="Borrar">✕</button></div>`; }
function renderBandeja(){
  const pend = datos.bandeja.filter(b => b.estado === "pendiente"), alg = datos.bandeja.filter(b => b.estado === "algundia"), arch = datos.bandeja.filter(b => b.estado === "archivado");
  $("#bandejaLista").innerHTML = pend.length ? pend.map(itemHtml).join("") : '<div class="aviso">Bandeja vacía. Bien.</div>';
  const mesAct = hoy().slice(0,7);
  const grupos = (arr, tipo) => arr.length ? porMeses(arr).map(g => { const [y,m] = g.k.split("-"); return `<details class="mesBand" ${g.k===mesAct?'open':''}><summary>${m ? mayus(MESES[+m-1]) + " " + y : "Sin fecha"} <small>${g.items.length}</small><button class="btn sec" data-vaciar="${tipo}|${g.k}">Vaciar mes</button></summary><div class="lista">${g.items.map(itemHtml).join("")}</div></details>`; }).join("") : '<div class="aviso" style="padding:8px 0">Nada aquí.</div>';
  $("#bandejaAlgunLista").innerHTML = grupos(alg, "algundia"); $("#nAlgun").textContent = alg.length;
  $("#bandejaArchLista").innerHTML = grupos(arch, "archivado"); $("#nArch").textContent = arch.length;
  const v = $("#vBandeja");
  v.querySelectorAll("[data-b]").forEach(el => el.onclick = (e) => { if(e.target.closest("[data-imp],[data-xb]")) return; abrirBandeja(el.dataset.b); });
  v.querySelectorAll("[data-imp]").forEach(b => b.onclick = (e) => { e.stopPropagation(); toggleImportante(b.dataset.imp, true); guardar(); render(); });
  v.querySelectorAll("[data-xb]").forEach(b => b.onclick = (e) => { e.stopPropagation(); const snap = foto(); procesar(b.dataset.xb, "borrar"); guardar(); render(); toast("Borrado", snap); });
  v.querySelectorAll("[data-vaciar]").forEach(b => b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); const [tipo, k] = b.dataset.vaciar.split("|"); const quitar = datos.bandeja.filter(x => x.estado === tipo && (x.procesado || x.fecha || "").slice(0,7) === k);
    if(!confirm("¿Borrar las " + quitar.length + " entradas de este mes?")) return; const snap = foto(); for(const x of quitar) procesar(x.id, "borrar"); guardar(); render(); toast(quitar.length + " borradas", snap); });
}
function abrirBandeja(id){
  const b = itemBandeja(id); if(!b) return; selId = null; abrirFicha("bandeja · " + fechaCorta(b.fecha) + (b.destino ? " · " + b.destino : ""), b.texto);
  const activos = datos.nodos.filter(n => n.tipo === "cuadro" && n.estado === "activo" && vivo(n)); const cuadros = datos.nodos.filter(n => (n.tipo === "cuadro" || n.tipo === "paso") && n.estado !== "hecho" && vivo(n)); const rs = todasRaices();
  const varios = espacios().length > 1;
  const etiqueta = (n) => { const e = espacioDe(n.id); return (varios && e ? e.nombre + " · " : "") + n.titulo; };
  const sel = (arr, sid) => `<select id="${sid}">${arr.map(n => `<option value="${n.id}">${esc(etiqueta(n))}</option>`).join("")}</select>`;
  let h = `<div class="acciones"><button class="estrella ${b.importante?'on':''}" data-a="imp">★</button><input id="bTexto" value="${esc(b.texto)}" style="flex:1" /></div><div class="etq">¿Qué es esto?</div><div class="opciones">`;
  h += `<div class="op" data-a="paso"><b>→ paso</b> de ${activos.length ? sel(activos, "selPaso") : '<span class="aviso">(no hay cuadros activos)</span>'}</div>`;
  h += `<div class="op" data-a="cuadro"><b>→ cuadro</b> en ${sel(rs, "selRaiz")}</div>`;
  h += `<div class="op" data-a="tarea"><b>→ tarea suelta</b> ${varios ? `en <select id="selEsp">${espacios().map(e => `<option value="${e.id}">${esc(e.nombre)}</option>`).join("")}</select>` : 'para planificar en Hoy'}</div>`;
  h += `<div class="op" data-a="calendario"><b>→ calendario</b> <input type="date" id="selFecha" value="${hoy()}" /></div><div class="op" data-a="nota"><b>→ nota</b> de ${sel(cuadros, "selNota")}</div>`;
  h += `<div class="op" data-a="algundia"><b>algún día</b> quizá, no ahora</div><div class="op" data-a="archivar"><b>archivar</b> hecho o descartado</div>${b.estado !== "pendiente" ? '<div class="op" data-a="pendiente"><b>↩ bandeja</b> volver a pendiente</div>' : ''}<div class="op" data-a="borrar" style="color:var(--rojo)"><b>borrar</b> eliminar del todo</div></div>`;
  h += `<div class="aviso">O pídeselo a Claude: "¿dónde meto esto?"</div>`;
  const c = $("#pCuerpo"); c.innerHTML = h;
  $("#bTexto").onchange = () => { b.texto = $("#bTexto").value.trim() || b.texto; guardar(); };
  c.querySelectorAll("select,input").forEach(x => x.onclick = (e) => e.stopPropagation());
  c.querySelectorAll("[data-a]").forEach(o => o.onclick = () => { const a = o.dataset.a; b.texto = $("#bTexto").value.trim() || b.texto;
    if(a === "imp"){ toggleImportante(id, true); guardar(); abrirBandeja(id); render(); return; }
    const arg = a==="paso" ? ($("#selPaso")||{}).value : a==="cuadro" ? ($("#selRaiz")||{}).value : a==="calendario" ? $("#selFecha").value : a==="nota" ? ($("#selNota")||{}).value : a==="tarea" ? (($("#selEsp")||{}).value || espacioSel) : null;
    if((a==="paso"||a==="cuadro"||a==="nota"||a==="calendario") && !arg){ toast("Elige el destino"); return; }
    const snap = foto(); if(procesar(id, a, arg)){ guardar(); cerrarPanel(); render(); toast(a === "borrar" ? "Borrado" : "Procesado", snap); } });
}

/* ---------- revisión ---------- */
function renderRevision(){
  const el = $("#revision"); const h0 = hoy(); const hace7 = sumar(h0, -7); const en15 = sumar(h0, 15);
  const pend = datos.bandeja.filter(b => b.estado === "pendiente"); const parados = datos.nodos.filter(n => n.tipo === "paso" && n.estado === "activo" && vivo(n) && (n.tocado || n.activado || n.creado || "2000-01-01") < hace7);
  const vivos = datos.nodos.filter(n => (n.tipo === "cuadro" || n.tipo === "paso") && n.estado !== "hecho" && vivo(n)); const prox = vivos.filter(n => n.plazo && n.plazo <= en15).sort((a,b) => a.plazo.localeCompare(b.plazo));
  const alg = datos.bandeja.filter(b => b.estado === "algundia");
  const hechosSemana = datos.nodos.filter(n => n.cerrado && n.cerrado >= hace7).map(n => ({ titulo:n.titulo, cerrado:n.cerrado, id:n.id })).concat(datos.tareas.filter(t => t.hecho && t.cerrado >= hace7).map(t => ({ titulo:t.titulo, cerrado:t.cerrado, id:null }))).sort((a,b) => b.cerrado.localeCompare(a.cerrado));
  const item = (t, s, attr) => `<div class="paso" ${attr||''}><span class="t" style="flex:1">${esc(t)}</span><span class="n">${esc(s||"")}</span></div>`;
  let h = `<section class="s1"><h2>1 · Bandeja <small>${pend.length} sin procesar</small></h2><div class="cuerpo">${pend.length ? pend.slice(0,8).map(b => item(b.texto, fechaCorta(b.fecha), 'data-b="'+b.id+'"')).join("") : '<div class="aviso">Vacía. Bien.</div>'}<div class="acciones"><button class="btn sec" data-ir="bandeja">Ir a la bandeja</button></div></div></section>`;
  h += `<section class="s2"><h2>2 · Hecho esta semana <small>${hechosSemana.length}</small></h2><div class="cuerpo">${hechosSemana.length ? hechosSemana.map(n => item("✓ " + n.titulo, fechaCorta(n.cerrado), n.id ? 'data-abrir="'+n.id+'"' : '')).join("") : '<div class="aviso">Nada cerrado en 7 días.</div>'}<div class="acciones"><button class="btn sec" data-ir="semana">Ver la semana</button></div></div></section>`;
  h += `<section class="s3"><h2>3 · Pasos parados <small>+7 días sin tocar</small></h2><div class="cuerpo">${parados.length ? parados.map(n => item(n.titulo, "desde " + fechaCorta(n.tocado||n.activado||n.creado), 'data-abrir="'+n.id+'"')).join("") : '<div class="aviso">Todo lo activo se ha movido esta semana.</div>'}</div></section>`;
  h += `<section class="s4"><h2>4 · Plazos en 15 días <small>${prox.length}</small></h2><div class="cuerpo">${prox.length ? prox.map(n => item(n.titulo, (n.plazo < h0 ? "VENCIÓ " : "") + fechaCorta(n.plazo), 'data-abrir="'+n.id+'"')).join("") : '<div class="aviso">Nada vence en dos semanas.</div>'}</div></section>`;
  h += `<section class="s5"><h2>5 · Algún día <small>${alg.length}</small></h2><div class="cuerpo">${alg.length ? alg.map(b => item(b.texto, fechaCorta(b.fecha), 'data-b="'+b.id+'"')).join("") : '<div class="aviso">Nada aparcado.</div>'}</div></section>`;
  h += `<section class="s1 linea"><h2>6 · La línea de la semana</h2><div class="tarjeta"><div class="acciones"><input id="revTxt" placeholder="Qué ha pasado, qué toca, cómo vas…" style="flex:1" /><button class="btn act" id="bRev">Cerrar revisión</button></div>${(datos.revisiones||[]).slice(0,12).map(r => `<div class="nota"><div class="f">${r.fecha}</div>${esc(r.texto)}</div>`).join("")}</div></section>`;
  el.innerHTML = h;
  el.querySelectorAll("[data-abrir]").forEach(x => x.onclick = () => abrir(x.dataset.abrir)); el.querySelectorAll("[data-b]").forEach(x => x.onclick = () => abrirBandeja(x.dataset.b));
  $("#bRev").onclick = () => { const t = $("#revTxt").value.trim(); datos.revisiones.unshift({ fecha: hoy(), texto: t || "(sin texto)" }); datos.ultimaRevision = hoy(); guardar(); render(); toast("Revisión cerrada"); };
}

/* ---------- archivo ---------- */
function renderArchivo(){
  const el = $("#archivo"); let h = ""; let total = 0;
  const fila = (n, sub) => `<div class="archItem"><div class="tx"><b>${esc(n.titulo)}</b><small>${esc(sub)}</small></div><button class="btn sec" data-ver="${n.id}">Ver</button><button class="btn" data-rest="${n.id}">Restaurar</button><button class="btn rojo" data-del="${n.id}" title="Eliminar del todo">✕</button></div>`;
  for(const e of espacios()){
    const rs = hijos(e.id).filter(r => r.archivado);
    const cs = datos.nodos.filter(n => n.tipo === "cuadro" && n.archivado && !archivadoEf(nodo(n.padre)) && espacioDe(n.id)?.id === e.id);
    if(!rs.length && !cs.length) continue; total += rs.length + cs.length;
    h += `<section><h2><i style="background:${e.color}"></i>${esc(e.nombre)}</h2>`;
    h += rs.map(r => { const cu = hijos(r.id).filter(x => x.tipo === "cuadro"); return fila(r, `raíz · ${cu.filter(x => x.estado === "hecho").length}/${cu.length} cuadros hechos · archivada el ${fechaCorta(r.archivado)}`); }).join("");
    h += cs.map(c => fila(c, `cuadro de ${nodo(c.padre)?.titulo || ""} · archivado el ${fechaCorta(c.archivado)}`)).join("");
    h += `</section>`;
  }
  el.innerHTML = total ? h : `<div class="aviso">Nada archivado todavía. Cuando termines una raíz o un cuadro, usa «Archivar» en su menú (···) o en su panel: desaparece del árbol, del Hoy y de Claude, pero se conserva aquí con todos sus pasos y notas.</div>`;
  el.querySelectorAll("[data-ver]").forEach(b => b.onclick = () => abrir(b.dataset.ver));
  el.querySelectorAll("[data-rest]").forEach(b => b.onclick = () => { const snap = foto(); restaurar(b.dataset.rest); guardar(); render(); toast("Restaurado", snap); });
  el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { const snap = foto(); if(eliminar(b.dataset.del)){ guardar(); render(); toast("Eliminado", snap); } });
}

/* ---------- ajustes ---------- */
function renderAjustes(){
  const ak = $("#apiKey"); if(document.activeElement !== ak) ak.value = localStorage.getItem(LS_API) || "";
  $("#modelo").value = localStorage.getItem(LS_MODELO) || "claude-sonnet-5-5"; $("#bDropbox").textContent = localStorage.getItem(LS_RT) ? "Dropbox conectado" : "Conectar Dropbox";
  const es = espacios();
  $("#ajEspacios").innerHTML = es.map((e,i) => `<div class="espRow"><input type="color" value="${e.color}" data-col="${e.id}" title="Color" /><input type="text" value="${esc(e.nombre)}" data-nom="${e.id}" /><button class="btn sec" data-sub="${e.id}" ${i===0?'disabled':''}>▲</button><button class="btn sec" data-baj="${e.id}" ${i===es.length-1?'disabled':''}>▼</button><button class="btn rojo" data-delesp="${e.id}" title="Eliminar espacio">✕</button></div>`).join("");
  const reord = (id, d) => { const arr = espacios(); const i = arr.findIndex(x => x.id === id); const j = i + d; if(j<0||j>=arr.length) return; arr.forEach((x,k) => x.orden = k+1); const o = arr[i].orden; arr[i].orden = arr[j].orden; arr[j].orden = o; guardar(); render(); };
  const a = $("#ajEspacios");
  a.querySelectorAll("[data-col]").forEach(x => x.onchange = () => { espacio(x.dataset.col).color = x.value; guardar(); render(); });
  a.querySelectorAll("[data-nom]").forEach(x => x.onchange = () => { const v = x.value.trim(); if(v){ espacio(x.dataset.nom).nombre = v; guardar(); render(); } });
  a.querySelectorAll("[data-sub]").forEach(x => x.onclick = () => reord(x.dataset.sub, -1));
  a.querySelectorAll("[data-baj]").forEach(x => x.onclick = () => reord(x.dataset.baj, 1));
  a.querySelectorAll("[data-delesp]").forEach(x => x.onclick = () => eliminarEspacio(x.dataset.delesp));
}

/* ---------- persistencia ---------- */
function serializar(){ datos.actualizado = ahora().slice(0,19); return JSON.stringify(datos, null, 2); }
function guardar(){
  if(!datos) return; const txt = serializar(); localStorage.setItem(LS_DATOS, txt); clearTimeout(guardarTimer);
  guardarTimer = setTimeout(async () => { try{
    if(modo === "dropbox"){ setEstado("sync","subiendo…"); await dbxSubir(txt); setEstado("ok","Dropbox"); }
    else if(modo === "archivo" && fileHandle){ const w = await fileHandle.createWritable(); await w.write(txt); await w.close(); setEstado("ok","raiz.json local"); }
    else setEstado("", dbxFallo ? "sin conexión a Dropbox" : "solo en este navegador");
  }catch(e){ console.error(e); setEstado("err","error al guardar"); toast("No se pudo guardar: " + e.message); } }, 600);
}
async function cargarInicial(){
  const ls = localStorage.getItem(LS_DATOS); let local = null; try{ local = ls ? JSON.parse(ls) : null; }catch(e){}
  if(CFG.appKey && localStorage.getItem(LS_RT)){
    try{ setEstado("sync","leyendo Dropbox…"); const remoto = JSON.parse(await dbxBajar()); modo = "dropbox"; dbxFallo = false;
      const fl = (local && local.actualizado) || "", fr = remoto.actualizado || "";
      if(local && fl > fr && confirm("Este dispositivo tiene cambios más recientes que Dropbox:\n  aquí: " + fl.replace("T"," ").slice(0,16) + "\n  Dropbox: " + fr.replace("T"," ").slice(0,16) + "\n\nAceptar: subir a Dropbox lo de este dispositivo.\nCancelar: quedarse con lo que hay en Dropbox.")){ datos = local; setEstado("ok","Dropbox"); guardar(); }
      else { datos = remoto; setEstado("ok","Dropbox"); localStorage.setItem(LS_DATOS, JSON.stringify(datos)); }
      return;
    } catch(e){ console.error(e); dbxFallo = true; setEstado("err","Dropbox no responde"); }
  }
  if(local){ datos = local; modo = fileHandle ? "archivo" : "local"; if(!dbxFallo) setEstado("", "solo en este navegador"); return; }
  try{ const r = await fetch("../raiz.json", {cache:"no-store"}); if(r.ok){ datos = await r.json(); localStorage.setItem(LS_DATOS, JSON.stringify(datos)); setEstado("", "leído ../raiz.json"); return; } }catch(e){}
  if(!dbxFallo) setEstado("err","sin datos");
}
async function vincularArchivo(){
  if(!window.showOpenFilePicker){ toast("Este navegador no permite escribir archivos; usa Chrome/Edge o Dropbox"); return; }
  try{ const [h] = await window.showOpenFilePicker({ types:[{description:"raiz.json", accept:{"application/json":[".json"]}}] }); fileHandle = h; const f = await h.getFile(); datos = JSON.parse(await f.text()); modo = "archivo"; migrar(); localStorage.setItem(LS_DATOS, JSON.stringify(datos)); setEstado("ok","raiz.json local"); render(); }catch(e){ if(e.name!=="AbortError") toast(e.message); }
}
function descargar(){ const b = new Blob([serializar()],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download="raiz.json"; a.click(); }

/* ---------- Dropbox (OAuth PKCE) ---------- */
function b64url(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
async function sha256(s){ return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); }
function redirectUri(){ return location.origin + location.pathname; }
async function dbxConectar(){ if(!CFG.appKey){ toast("Falta appKey en config.js"); return; } const verifier = b64url(crypto.getRandomValues(new Uint8Array(48))); localStorage.setItem(LS_VERIF, verifier); const challenge = b64url(await sha256(verifier)); const u = new URL("https://www.dropbox.com/oauth2/authorize"); u.search = new URLSearchParams({ client_id: CFG.appKey, response_type:"code", code_challenge: challenge, code_challenge_method:"S256", token_access_type:"offline", redirect_uri: redirectUri() }).toString(); location.href = u.toString(); }
async function dbxCanjearCodigo(code){ const verifier = localStorage.getItem(LS_VERIF); const r = await fetch("https://api.dropboxapi.com/oauth2/token", { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body: new URLSearchParams({ code, grant_type:"authorization_code", client_id: CFG.appKey, code_verifier: verifier, redirect_uri: redirectUri() }) }); const j = await r.json(); if(!r.ok) throw new Error(j.error_description || JSON.stringify(j)); localStorage.setItem(LS_RT, j.refresh_token); localStorage.removeItem(LS_VERIF); }
let accessToken = null, accessExp = 0;
async function dbxToken(){ if(accessToken && Date.now() < accessExp - 60000) return accessToken; const r = await fetch("https://api.dropboxapi.com/oauth2/token", { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body: new URLSearchParams({ grant_type:"refresh_token", refresh_token: localStorage.getItem(LS_RT), client_id: CFG.appKey }) }); const j = await r.json(); if(!r.ok){ if(j.error==="invalid_grant") localStorage.removeItem(LS_RT); throw new Error(j.error_description || j.error); } accessToken = j.access_token; accessExp = Date.now() + (j.expires_in||14400)*1000; return accessToken; }
async function dbxBajar(){ const t = await dbxToken(); const r = await fetch("https://content.dropboxapi.com/2/files/download", { method:"POST", headers:{ Authorization:"Bearer "+t, "Dropbox-API-Arg": JSON.stringify({ path: RUTA_DROPBOX }) } }); if(!r.ok) throw new Error("descarga " + r.status); return r.text(); }
async function dbxSubir(txt){ const t = await dbxToken(); const r = await fetch("https://content.dropboxapi.com/2/files/upload", { method:"POST", headers:{ Authorization:"Bearer "+t, "Content-Type":"application/octet-stream", "Dropbox-API-Arg": JSON.stringify({ path: RUTA_DROPBOX, mode:"overwrite", mute:true }) }, body: txt }); if(!r.ok) throw new Error("subida " + r.status); }

/* ============================================================
   CLAUDE DENTRO
   ============================================================ */
let chatMsgs = []; localStorage.removeItem(LS_CHAT); // 2.2: el chat empieza en limpio en cada arranque
const NOMBRE_MODELO = { "claude-sonnet-5-5":"Sonnet 5.5", "claude-opus-5-5":"Opus 5.5", "claude-haiku-5-5":"Haiku 5.5" };
const modeloActual = () => localStorage.getItem(LS_MODELO) || "claude-sonnet-5-5";
const SUGERENCIAS = [["Planifícame el día de hoy", "Planifícame el día de hoy: reparte en mañana y tarde lo que más importa, respetando las citas fijas."],["Procesa la bandeja", "Procesa la bandeja: dime qué es cada cosa y dónde la meterías (paso, cuadro, tarea, calendario o algún día)."],["¿Qué me toca ahora?", "¿Qué me toca ahora mismo? Mira lo activo, lo vencido y lo importante y dime por dónde empiezo."],["Hagamos la revisión semanal", "Hagamos la revisión semanal: repasa conmigo lo hecho, lo parado y los plazos, y cierra la revisión con una línea."]];
let adjuntos = [];
const SYSTEM = `Eres Claude dentro de "La raíz", la app de objetivos y planificación de Pablo Tejada Díaz (arquitecto en Málaga). Hablas en español, directo y breve, como un socio que organiza, no como un asistente genérico.

MODELO DE DATOS (JSON "raiz"):
- espacios: los frentes de trabajo que Pablo ha creado {id, nombre}. Cada espacio es un nodo "objetivo" (padre null, mismo id) con su propio árbol.
- nodos: lista plana {id, padre, tipo (objetivo|contexto|raiz|cuadro|paso), titulo, estado (bloqueado|disponible|activo|hecho), orden} y opcionales hecho_cuando (criterio verificable), inicio y plazo (YYYY-MM-DD), importante, notas. Jerarquía: espacio → raíces → cuadros → pasos. Solo un activo por padre (salvo raíces); lo bloqueado se desbloquea al marcar hecho el anterior; solo lo activo se desglosa. Lo archivado no se te muestra: está terminado y guardado.
- bandeja: entradas GTD {id, fecha, texto, estado pendiente|algundia, importante}.
- eventos: citas fijas de calendario {id, fecha, hora?, texto, nodo?}.
- tareas: tareas sueltas {id, titulo, espacio} que no cuelgan del árbol.
- agenda: pizarra de cada día {"YYYY-MM-DD": {manana:[refs], tarde:[refs], sinhora:[refs], hecho:[refs]}}. Una ref es el id de un nodo, "tarea:<id>" o "band:<id>".

CÓMO RESPONDES. Siempre un único objeto JSON, sin texto fuera:
{"respuesta":"<lo que le dices a Pablo, en texto llano, con saltos de línea si hace falta>","cambios":[ ...operaciones opcionales... ]}

OPERACIONES (campos exactos):
- {"op":"crear_espacio","nombre":"...","color":"#rrggbb"}
- {"op":"crear_raiz","titulo":"...","espacio":"<id de espacio>"}
- {"op":"crear_cuadro","raiz":"<id de raíz>","titulo":"...","hecho_cuando":"...","plazo":"YYYY-MM-DD","inicio":"YYYY-MM-DD","importante":true}
- {"op":"crear_paso","cuadro":"<id de cuadro>","titulo":"...","hecho_cuando":"...","plazo":"YYYY-MM-DD"}
- {"op":"editar","id":"<id>","campos":{"titulo":"...","hecho_cuando":"...","plazo":"...","inicio":"...","importante":true}}
- {"op":"activar","id":"<id>"}  {"op":"marcar_hecho","id":"<id>"}  {"op":"archivar","id":"<id raíz o cuadro>"}  {"op":"eliminar","id":"<id>"}
- {"op":"mover","id":"<id>","padre":"<id destino>","posicion":1}
- {"op":"nota","id":"<id>","texto":"..."}
- {"op":"anotar_calendario","fecha":"YYYY-MM-DD","hora":"HH:MM","texto":"...","nodo":"<id opcional>"}
- {"op":"capturar","texto":"..."}  {"op":"procesar_bandeja","id":"<id bandeja>","accion":"paso|cuadro|tarea|calendario|nota|algundia|archivar","arg":"<id de cuadro/raíz/espacio, o fecha>"}
- {"op":"tarea","titulo":"...","espacio":"<id de espacio>","fecha":"YYYY-MM-DD","franja":"manana|tarde|sinhora"}  (tarea suelta; con fecha queda ya en la pizarra de ese día)
- {"op":"agendar","ref":"<ref>","fecha":"YYYY-MM-DD","franja":"manana|tarde|sinhora"}  {"op":"desagendar","ref":"<ref>","fecha":"YYYY-MM-DD"}
- {"op":"revision","texto":"..."}  (cierra la revisión semanal con esa línea)
Para referirte a algo que creas en la misma respuesta usa "nuevo:<titulo>" (o "nuevo:<nombre>" para un espacio) en cuadro, raiz, espacio o ref.

CRITERIOS. Propón cambios solo cuando Pablo pida organizar, planificar, desglosar, procesar o anotar; si solo pregunta o conversa, "cambios" vacío. Los cuadros llevan un hecho_cuando verificable. Pasos de media jornada como máximo. Fechas realistas desde HOY. Reutiliza ids existentes, no dupliques. No elimines nada salvo petición expresa; lo terminado se archiva.
PLANIFICAR UN DÍA: pocas cosas (4-6 en total), lo vencido e importante primero; respeta las citas fijas (antes de las 14:00 son de mañana); mezcla espacios con criterio; usa "agendar" con refs de lo que ya existe (pasos activos, cuadros, tareas, bandeja) y "tarea" solo para lo que no existe.
PLANIFICAR UNA SEMANA: reparte de lunes a viernes con huecos libres, no llenes el fin de semana salvo que lo pida, usa franja "sinhora" si no hace falta concretar.`;
function contextoRaiz(){
  const n = datos.nodos.filter(x => vivo(x)).map(x => { const o = { id:x.id, padre:x.padre, tipo:x.tipo, titulo:x.titulo, estado:x.estado, orden:x.orden }; for(const k of ["hecho_cuando","inicio","plazo","importante","cerrado"]) if(x[k]!=null) o[k]=x[k]; if(x.notas&&x.notas.length) o.notas = x.notas.slice(0,3).map(z=>z.fecha+": "+z.texto); return o; });
  const h = hoy(); const ag = {}; for(let i=-1;i<14;i++){ const f = sumar(h, i); const d = datos.agenda[f]; if(d) ag[f] = { manana:d.manana||[], tarde:d.tarde||[], sinhora:d.sinhora||[], hecho:d.hecho||[] }; }
  return JSON.stringify({ hoy: h, dia_semana: DIAS[dow(h)], espacios: espacios().map(e => ({ id:e.id, nombre:e.nombre })), nodos: n,
    bandeja: datos.bandeja.filter(b => b.estado !== "archivado").map(b => ({ id:b.id, fecha:b.fecha, texto:b.texto, estado:b.estado, importante:b.importante })),
    tareas: datos.tareas.filter(t => !t.hecho).map(t => ({ id:t.id, titulo:t.titulo, espacio:t.espacio, importante:t.importante })),
    eventos: datos.eventos.filter(e => e.fecha >= sumar(h,-14) && e.fecha <= sumar(h,60)), agenda: ag, ultimaRevision: datos.ultimaRevision, revisiones: (datos.revisiones||[]).slice(0,3) });
}
function abrirChat(){ $("#chat").classList.add("open"); renderChat(); if(!localStorage.getItem(LS_API)) sysMsg("Falta la clave de API: ponla en Ajustes → Claude."); setTimeout(()=>$("#chatTxt").focus(), 100); }
function cerrarChat(){ $("#chat").classList.remove("open"); }
function sysMsg(t){ const m = $("#msgs"); const d = document.createElement("div"); d.className = "msg sys"; d.textContent = t; m.appendChild(d); m.scrollTop = m.scrollHeight; }
function renderChat(){
  const m = $("#msgs"); m.innerHTML = "";
  if(!chatMsgs.length){ m.innerHTML = `<div class="sugerencias"><div class="etq">Para empezar</div>${SUGERENCIAS.map((x,i) => `<button data-sug="${i}"><i></i>${esc(x[0])}</button>`).join("")}<div class="msg sys" style="margin-top:6px">Claude ve tu árbol, tus pizarras, la bandeja y el calendario. Antes de tocar nada te enseña los cambios.</div></div>`; m.querySelectorAll("[data-sug]").forEach(b => b.onclick = () => { $("#chatTxt").value = SUGERENCIAS[+b.dataset.sug][1]; enviar(); }); }
  for(const x of chatMsgs){ const d = document.createElement("div"); d.className = "msg " + (x.rol === "user" ? "yo" : "ia"); d.textContent = x.texto; if(x.adj && x.adj.length){ const a = document.createElement("span"); a.className = "adj"; a.innerHTML = x.adj.map(z => z.mini ? `<img src="${z.mini}" alt="${esc(z.nombre)}" />` : `<span>📎 ${esc(z.nombre)}</span>`).join(""); d.appendChild(a); } m.appendChild(d); }
  $("#modeloChat").textContent = NOMBRE_MODELO[modeloActual()] || modeloActual(); renderAdjuntos(); m.scrollTop = m.scrollHeight;
}
function renderAdjuntos(){ $("#adjuntos").innerHTML = adjuntos.map((a,i) => `<span>${a.mini ? `<img src="${a.mini}" alt="" />` : ''}${esc(a.nombre)}<b data-q="${i}" title="Quitar">✕</b></span>`).join(""); $("#adjuntos").querySelectorAll("[data-q]").forEach(b => b.onclick = () => { adjuntos.splice(+b.dataset.q,1); renderAdjuntos(); }); }
async function adjuntar(files){ let n = 0; for(const f of files){ if(!f) continue; if(f.size > 20*1024*1024){ toast(f.name + " pesa más de 20 MB"); continue; } adjuntos.push(await leerAdjunto(f)); n++; } renderAdjuntos(); if(n) $("#chatTxt").focus(); return n; }
async function leerAdjunto(f){
  const nombre = f.name || ("imagen-" + new Date().toTimeString().slice(0,8).replace(/:/g,"") + ".png"); const ext = nombre.split(".").pop().toLowerCase();
  if(["txt","md","json","csv"].includes(ext)) return { nombre, tipo:"texto", texto: await f.text() };
  const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });
  if(ext === "pdf") return { nombre, tipo:"pdf", b64 };
  if(["png","jpg","jpeg","webp","gif"].includes(ext) || (f.type||"").startsWith("image/")){ const media = f.type || "image/png"; return { nombre, tipo:"imagen", media, b64, mini: "data:" + media + ";base64," + b64 }; }
  return { nombre, tipo:"texto", texto: "(archivo " + nombre + " no soportado)" };
}
function planificarConClaude(m){
  abrirChat();
  if(m === "dia") $("#chatTxt").value = `Planifícame ${agFecha === hoy() ? "el día de hoy" : "el " + fechaLarga(agFecha)} (${agFecha}). Reparte en mañana y tarde lo que más importa, respetando las citas fijas.`;
  else { const l = lunesDe(agFecha); $("#chatTxt").value = `Planifícame la semana del ${fechaCorta(l)} al ${fechaCorta(sumar(l,6))} (${l} a ${sumar(l,6)}): reparte lo pendiente entre los días, sin llenarlos.`; }
  if(localStorage.getItem(LS_API)) enviar();
}
async function enviar(){
  const key = localStorage.getItem(LS_API); if(!key){ sysMsg("Falta la clave de API: ponla en Ajustes → Claude."); return; }
  const txt = $("#chatTxt").value.trim(); if(!txt && !adjuntos.length) return;
  const modelo = modeloActual();
  const contenido = [];
  for(const a of adjuntos){ if(a.tipo === "pdf") contenido.push({ type:"document", source:{ type:"base64", media_type:"application/pdf", data:a.b64 }, title:a.nombre }); else if(a.tipo === "imagen") contenido.push({ type:"image", source:{ type:"base64", media_type:a.media, data:a.b64 } }); else contenido.push({ type:"text", text:"Archivo " + a.nombre + ":\n" + a.texto.slice(0,60000) }); }
  contenido.push({ type:"text", text: txt || "(ver adjuntos)" });
  chatMsgs.push({ rol:"user", texto: txt || "(adjuntos)", adj: adjuntos.map(a => ({ nombre:a.nombre, mini:a.mini })), contenido }); adjuntos = []; $("#chatTxt").value = ""; $("#chatTxt").style.height = ""; renderChat();
  const pens = document.createElement("div"); pens.className = "pensando"; pens.textContent = "pensando…"; $("#msgs").appendChild(pens); $("#bEnviar").disabled = true;
  try{
    const historial = chatMsgs.slice(-12).map((x, i, arr) => ({ role: x.rol === "user" ? "user" : "assistant", content: (x.rol === "user" && x.contenido && i === arr.length-1) ? x.contenido : (x.rol === "user" ? x.texto : x.bruto || x.texto) }));
    const ult = historial[historial.length-1];
    historial[historial.length-1] = { role:"user", content: [ { type:"text", text: "ESTADO ACTUAL (JSON):\n" + contextoRaiz() }, ...(Array.isArray(ult.content) ? ult.content : [{type:"text", text: ult.content}]) ] };
    while(historial.length && historial[0].role !== "user") historial.shift();
    const r = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", headers:{ "content-type":"application/json", "x-api-key": key, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" }, body: JSON.stringify({ model: modelo, max_tokens: 4000, system: SYSTEM, messages: historial }) });
    const j = await r.json(); if(!r.ok) throw new Error((j.error && j.error.message) || r.status);
    const bruto = (j.content||[]).filter(c => c.type === "text").map(c => c.text).join("\n");
    let parsed = null; try{ parsed = JSON.parse(bruto); }catch(e){ const mm = bruto.match(/\{[\s\S]*\}/); if(mm){ try{ parsed = JSON.parse(mm[0]); }catch(e2){} } }
    const respuesta = parsed ? parsed.respuesta : bruto; const cambios = (parsed && Array.isArray(parsed.cambios)) ? parsed.cambios : [];
    chatMsgs.push({ rol:"assistant", texto: respuesta, bruto }); if(chatMsgs.length > 40) chatMsgs = chatMsgs.slice(-40);
    renderChat(); if(cambios.length) proponer(cambios);
  }catch(e){ console.error(e); sysMsg("Error: " + e.message); }
  finally{ pens.remove(); $("#bEnviar").disabled = false; }
}
function describirOp(o){
  const t = (id) => { if(!id) return "?"; id = String(id); if(id.startsWith("nuevo:")) return "«" + id.slice(6) + "»"; if(id.startsWith("tarea:")){ const x = tarea(id.slice(6)); return x ? "«" + x.titulo + "»" : id; } if(id.startsWith("band:")){ const x = itemBandeja(id.slice(5)); return x ? "«" + x.texto + "»" : id; } const e = espacio(id); if(e) return "espacio «" + e.nombre + "»"; const n = nodo(id); return n ? "«" + n.titulo + "»" : id; };
  const fr = (x) => FRANJA[x] || "sin hora";
  switch(o.op){
    case "crear_espacio": return "Crear espacio «" + o.nombre + "»";
    case "crear_raiz": return "Crear raíz «" + o.titulo + "»" + (o.espacio ? " en " + t(o.espacio) : "");
    case "crear_cuadro": return "Crear cuadro «" + o.titulo + "» en " + t(o.raiz) + (o.plazo ? " · plazo " + fechaCorta(o.plazo) : "");
    case "crear_paso": return "Crear paso «" + o.titulo + "» en " + t(o.cuadro) + (o.plazo ? " · plazo " + fechaCorta(o.plazo) : "");
    case "editar": return "Editar " + t(o.id) + ": " + Object.keys(o.campos||{}).join(", ");
    case "activar": return "Activar " + t(o.id); case "marcar_hecho": return "Marcar hecho " + t(o.id); case "archivar": return "Archivar " + t(o.id); case "restaurar": return "Restaurar " + t(o.id); case "eliminar": return "ELIMINAR " + t(o.id);
    case "mover": return "Mover " + t(o.id) + " a " + t(o.padre); case "nota": return "Nota en " + t(o.id) + ": " + o.texto;
    case "anotar_calendario": return "Calendario " + fechaCorta(o.fecha) + (o.hora ? " " + o.hora : "") + ": " + o.texto; case "capturar": return "Bandeja: " + o.texto;
    case "procesar_bandeja": return "Procesar " + t("band:" + o.id) + " → " + o.accion;
    case "tarea": return "Tarea suelta «" + o.titulo + "»" + (o.fecha ? " · " + fechaCorta(o.fecha) + " " + fr(o.franja) : "");
    case "agendar": return "Planificar " + t(o.ref) + " · " + fechaCorta(o.fecha) + " " + fr(o.franja);
    case "desagendar": return "Quitar " + t(o.ref) + " del " + fechaCorta(o.fecha);
    case "revision": return "Cerrar revisión semanal: " + o.texto;
    default: return "Operación desconocida: " + o.op;
  }
}
function proponer(cambios){
  const d = document.createElement("div"); d.className = "propuesta";
  d.innerHTML = `<h4>Cambios propuestos · ${cambios.length}</h4><ul>` + cambios.map(o => `<li class="${o.op==='eliminar'?'err':''}">${esc(describirOp(o))}</li>`).join("") + `</ul><div class="acciones"><button class="btn act" data-ap>Aplicar</button><button class="btn sec" data-des>Descartar</button></div>`;
  $("#msgs").appendChild(d); $("#msgs").scrollTop = $("#msgs").scrollHeight;
  d.querySelector("[data-ap]").onclick = () => { const snap = foto(); const res = aplicar(cambios); d.querySelector(".acciones").innerHTML = `<span class="aviso">${res.ok} aplicados${res.err ? " · " + res.err + " con error" : ""}</span>`; guardar(); render(); toast("Cambios aplicados", snap); };
  d.querySelector("[data-des]").onclick = () => { d.querySelector(".acciones").innerHTML = '<span class="aviso">descartados</span>'; };
}
function aplicar(cambios){
  let ok = 0, err = 0; const nuevos = {};
  const res = (x) => (x != null && nuevos[x]) || x;
  const extras = (o) => { const e = {}; for(const k of ["hecho_cuando","plazo","inicio","importante"]) if(o[k]!=null && o[k]!=="") e[k]=o[k]; return e; };
  for(const o of cambios){ try{
    switch(o.op){
      case "crear_espacio": { if(!o.nombre) throw 0; nuevos["nuevo:" + o.nombre] = nuevoEspacio(o.nombre, o.color); break; }
      case "crear_raiz": { const esp = res(o.espacio) || espacioSel; if(!espacio(esp)) throw 0; nuevos["nuevo:" + o.titulo] = nuevaRaiz(o.titulo, esp).id; break; }
      case "crear_cuadro": { const raiz = res(o.raiz); if(!nodo(raiz)) throw 0; nuevos["nuevo:" + o.titulo] = nuevoHijo(raiz, o.titulo, extras(o)).id; break; }
      case "crear_paso": { const cu = res(o.cuadro); if(!nodo(cu)) throw 0; nuevos["nuevo:" + o.titulo] = nuevoHijo(cu, o.titulo, extras(o)).id; break; }
      case "editar": { if(!nodo(o.id)) throw 0; for(const [k,v] of Object.entries(o.campos||{})) if(["titulo","hecho_cuando","plazo","inicio","importante"].includes(k)) editar(o.id, k, v); break; }
      case "activar": if(!activar(res(o.id))) throw 0; break;
      case "marcar_hecho": if(!nodo(res(o.id))) throw 0; marcarHecho(res(o.id), true); break;
      case "archivar": if(!nodo(res(o.id))) throw 0; archivar(res(o.id)); break;
      case "restaurar": if(!nodo(o.id)) throw 0; restaurar(o.id); break;
      case "eliminar": if(!nodo(o.id)) throw 0; eliminar(o.id, true); break;
      case "mover": if(!nodo(o.id) || !nodo(res(o.padre))) throw 0; moverA(o.id, res(o.padre), (o.posicion||1) - 1); break;
      case "nota": if(!nodo(res(o.id))) throw 0; addNota(res(o.id), o.texto); break;
      case "anotar_calendario": { if(!o.fecha || !o.texto) throw 0; const ev = { id:uid("ev"), fecha:o.fecha, texto:o.texto }; if(o.hora) ev.hora = o.hora; if(o.nodo && nodo(res(o.nodo))) ev.nodo = res(o.nodo); datos.eventos.push(ev); break; }
      case "capturar": capturar(o.texto); break;
      case "procesar_bandeja": if(!procesar(o.id, o.accion, res(o.arg))) throw 0; break;
      case "tarea": { if(!o.titulo) throw 0; const esp = res(o.espacio); const t = nuevaTarea(o.titulo, espacio(esp) ? esp : espacioSel); nuevos["nuevo:" + o.titulo] = "tarea:" + t.id; if(o.fecha) agendar(o.fecha, "tarea:" + t.id, FRANJA[o.franja] && o.franja !== "hecho" ? o.franja : "sinhora"); break; }
      case "agendar": { const ref = res(o.ref); if(!agendar(o.fecha, ref, FRANJA[o.franja] ? o.franja : "sinhora")) throw 0; break; }
      case "desagendar": desagendar(o.fecha, res(o.ref)); break;
      case "revision": datos.revisiones.unshift({ fecha: hoy(), texto: o.texto }); datos.ultimaRevision = hoy(); break;
      default: throw 0;
    } ok++; }catch(e){ err++; console.warn("op fallida", o, e); } }
  return { ok, err };
}

/* ---------- arranque ---------- */
$("#bChat").onclick = abrirChat; $("#bChatMovil").onclick = (e) => { e.preventDefault(); abrirChat(); }; $("#bCerrarChat").onclick = cerrarChat;
$("#bEnviar").onclick = enviar; $("#chatTxt").addEventListener("keydown", e => { if(e.key==="Enter" && (e.ctrlKey || e.metaKey)) enviar(); });
$("#chatFile").onchange = async (e) => { await adjuntar([...e.target.files]); e.target.value = ""; };
// pegar imágenes y arrastrar archivos al chat
document.addEventListener("paste", async (e) => { if(!$("#chat").classList.contains("open")) return; const files = [...(e.clipboardData && e.clipboardData.files || [])].filter(f => (f.type||"").startsWith("image/") || /\.(pdf|txt|md)$/i.test(f.name||"")); if(!files.length) return; e.preventDefault(); const n = await adjuntar(files); if(n) toast(n === 1 ? "Imagen adjuntada" : n + " archivos adjuntados"); });
{ const ch = $("#chat"); let cnt = 0; const conArchivos = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  ch.addEventListener("dragenter", (e) => { if(!conArchivos(e)) return; e.preventDefault(); cnt++; ch.classList.add("dropOn"); });
  ch.addEventListener("dragover", (e) => { if(!conArchivos(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  ch.addEventListener("dragleave", () => { cnt = Math.max(0, cnt-1); if(!cnt) ch.classList.remove("dropOn"); });
  ch.addEventListener("drop", async (e) => { if(!conArchivos(e)) return; e.preventDefault(); cnt = 0; ch.classList.remove("dropOn"); const n = await adjuntar([...e.dataTransfer.files]); if(n) toast(n === 1 ? "Archivo adjuntado" : n + " archivos adjuntados"); }); }
$("#chatTxt").addEventListener("input", () => { const t = $("#chatTxt"); t.style.height = "auto"; t.style.height = Math.min(200, t.scrollHeight) + "px"; });
$("#modelo").onchange = () => { localStorage.setItem(LS_MODELO, $("#modelo").value); };

$("#bGuardarApi").onclick = () => { const k = $("#apiKey").value.trim(); if(k) localStorage.setItem(LS_API, k); else localStorage.removeItem(LS_API); localStorage.setItem(LS_MODELO, $("#modelo").value); toast(k ? "Clave guardada en este dispositivo" : "Clave borrada"); };
$("#bVerApi").onclick = () => { const i = $("#apiKey"); i.type = i.type === "password" ? "text" : "password"; $("#bVerApi").textContent = i.type === "password" ? "Mostrar" : "Ocultar"; };
$("#bCopiarApi").onclick = async () => { const k = localStorage.getItem(LS_API) || $("#apiKey").value; if(!k){ toast("No hay clave guardada"); return; } try{ await navigator.clipboard.writeText(k); toast("Clave copiada al portapapeles"); }catch(e){ $("#apiKey").type = "text"; $("#apiKey").select(); toast("Selecciónala y copia con Ctrl+C"); } };
$("#bBorrarChat").onclick = () => { chatMsgs = []; localStorage.removeItem(LS_CHAT); renderChat(); toast("Conversación vaciada"); };
$("#bArchivo").onclick = vincularArchivo; $("#bDescargar").onclick = descargar;
$("#bDropbox").onclick = () => { if(localStorage.getItem(LS_RT)){ if(confirm("¿Desconectar Dropbox en este dispositivo?")){ localStorage.removeItem(LS_RT); location.reload(); } } else dbxConectar(); };
$("#bRecargar").onclick = async () => { localStorage.removeItem(LS_DATOS); await cargarInicial(); if(datos && migrar()) guardar(); render(); };
$("#bNuevoEspacio").onclick = () => { const n = prompt("Nombre del nuevo espacio (un trabajo, un proyecto grande, lo personal…)"); if(!n || !n.trim()) return; nuevoEspacio(n.trim()); guardar(); render(); };
$("#bCerrar").onclick = () => { cerrarPanel(); render(); }; $("#velo").onclick = () => { cerrarPanel(); render(); }; $("#panel").addEventListener("click", (e) => { if(e.target === $("#panel")){ cerrarPanel(); render(); } });
$("#bCapturar").onclick = () => { const t=$("#bandejaTxt").value.trim(); if(t){ capturar(t); $("#bandejaTxt").value=""; guardar(); render(); } };
$("#bandejaTxt").addEventListener("keydown", e => { if(e.key==="Enter") $("#bCapturar").click(); });
document.addEventListener("keydown", e => { if(e.key === "Escape"){ const menus = document.querySelectorAll(".menuPos,.menuRaiz"); if(menus.length){ menus.forEach(m => m.remove()); return; } if($("#chat").classList.contains("open")) cerrarChat(); else if($("#panel").classList.contains("open")){ cerrarPanel(); render(); } } });

(async () => {
  const q = new URLSearchParams(location.search);
  if(q.get("code")){ try{ await dbxCanjearCodigo(q.get("code")); toast("Dropbox conectado"); }catch(e){ alert("Error al conectar Dropbox: " + e.message); } history.replaceState(null,"",location.pathname); }
  await cargarInicial(); if(datos && migrar()) guardar();
  const cap = q.get("capturar"), cla = q.get("claude");
  if(cap || cla) history.replaceState(null,"",location.pathname);
  if(cap && datos){ capturar(cap.trim()); guardar(); ir("bandeja", false); toast("Capturado en la bandeja"); }
  else if(cla && datos){ ir("inicio", false); abrirChat(); $("#chatTxt").value = cla.trim(); setTimeout(() => enviar(), 300); }
  else ir(sessionStorage.getItem("raiz.vista") || "inicio", false);
  if("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(()=>{});
})();
