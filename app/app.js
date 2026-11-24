/* ============================================================
   LA RAÍZ 2.0 · app de objetivos en árbol de habilidades
   Datos: un único raiz.json (Dropbox / archivo local / navegador).
   Reglas: estados bloqueado | disponible | activo | hecho;
   un activo por padre; al marcar hecho se desbloquea el siguiente;
   solo lo activo se desglosa.
   ============================================================ */
const VERSION = "v2.0";
const CFG = window.RAIZ_CONFIG || {};
const RUTA_DROPBOX = CFG.rutaArchivo || "/00_APP TD/raiz.json";
const LS_DATOS = "raiz.datos", LS_RT = "raiz.dbx.refresh", LS_VERIF = "raiz.dbx.verifier", LS_API = "raiz.api.key", LS_MODELO = "raiz.api.modelo", LS_CHAT = "raiz.chat";

let datos = null, selId = null, fileHandle = null, modo = "local", guardarTimer = null;
let vista = "inicio", calMes = null, calDia = null, raizMovil = null;

const $ = (s) => document.querySelector(s);
const hoy = () => { const d = new Date(); return fechaStr(d); };
const ahora = () => new Date().toISOString();
function fechaStr(d){ return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS = ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"];
function fechaCorta(f){ if(!f) return ""; const [y,m,d] = f.split("-"); return +d + " " + MESES[+m-1].slice(0,3); }
function toast(m){ const t=$("#toast"); t.textContent=m; t.style.display="block"; clearTimeout(t._t); t._t=setTimeout(()=>t.style.display="none",2400); }
function setEstado(cls, txt){ const p=$("#ptoDatos"); p.className="pto "+cls; $("#txtDatos").textContent=txt; const a=$("#ajDatos"); if(a) a.textContent = "Estado: " + txt; }
function esc(s){ return String(s??"").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function slug(t){ return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,24); }

/* ---------- modelo ---------- */
const nodo = (id) => datos.nodos.find(n => n.id === id);
const hijos = (id) => datos.nodos.filter(n => n.padre === id).sort((a,b)=>(a.orden||0)-(b.orden||0));
const raices = () => hijos("arbol");
function ruta(id){ const r=[]; let n=nodo(id); while(n){ r.unshift(n.titulo); n = n.padre ? nodo(n.padre) : null; } return r; }
function descendientes(id){ const out = []; const pila = [id]; while(pila.length){ const p = pila.pop(); for(const h of datos.nodos.filter(x => x.padre === p)){ out.push(h); pila.push(h.id); } } return out; }
function idNuevo(padreId, titulo){ const base = padreId + "." + slug(titulo); let id = base, k = 2; while(nodo(id)) id = base + "-" + (k++); return id; }

function activar(id){
  const n = nodo(id); if(!n) return false;
  if(n.estado === "bloqueado"){ toast("Está bloqueado: termina antes el anterior"); return false; }
  const otro = hijos(n.padre).find(h => h.estado === "activo" && h.id !== id);
  if(otro){ toast("Ya hay uno activo aquí: " + otro.titulo); return false; }
  n.estado = "activo"; n.activado = hoy();
  const ps = hijos(id); if(ps.length && !ps.some(x => x.estado === "activo")){ const f = ps.find(x => x.estado !== "hecho"); if(f){ f.estado = "activo"; f.activado = hoy(); } }
  const p = n.padre && nodo(n.padre); if(p && p.tipo !== "objetivo" && p.estado !== "activo" && p.estado !== "hecho") p.estado = "activo";
  return true;
}
function marcarHecho(id, silencioso){
  const n = nodo(id); if(!n) return;
  const pendientes = hijos(id).filter(h => h.estado !== "hecho");
  if(!silencioso && pendientes.length && !confirm("Quedan " + pendientes.length + " pasos sin hacer. ¿Marcar hecho igualmente?")) return;
  n.estado = "hecho"; n.cerrado = hoy();
  const hs = hijos(n.padre); const i = hs.findIndex(h => h.id === id);
  const sig = hs.slice(i+1).find(h => h.estado === "bloqueado");
  if(sig){ sig.estado = (n.tipo === "paso") ? "activo" : "disponible"; if(sig.estado === "activo") sig.activado = hoy(); if(!silencioso) toast((sig.estado === "activo" ? "Siguiente paso: " : "Desbloqueado: ") + sig.titulo); }
}
function reabrir(id){ const n=nodo(id); n.estado="activo"; delete n.cerrado; }
function nuevoHijo(padreId, titulo, extra){
  const p = nodo(padreId); if(!p) return null;
  const hs = hijos(padreId);
  const tipo = p.tipo === "raiz" ? "cuadro" : (p.tipo === "objetivo" ? "raiz" : "paso");
  let estado;
  if(tipo === "raiz") estado = "disponible";
  else if(hs.length === 0) estado = tipo === "paso" ? (p.estado === "activo" ? "activo" : "bloqueado") : "disponible";
  else estado = hs.every(h=>h.estado==="hecho") ? "disponible" : "bloqueado";
  const n = Object.assign({ id: idNuevo(padreId, titulo), padre: padreId, tipo, titulo, estado, orden: hs.length + 1, creado: hoy() }, extra || {});
  datos.nodos.push(n); return n;
}
function nuevaRaiz(titulo){ const rs = raices(); const base = "raiz-" + slug(titulo); let id = base, k = 2; while(nodo(id)) id = base + "-" + (k++); const n = { id, padre: "arbol", tipo: "raiz", titulo, estado: "disponible", orden: rs.length + 1, creado: hoy() }; datos.nodos.push(n); return n; }
function mover(id, delta){ const n = nodo(id); const hs = hijos(n.padre); const i = hs.findIndex(h => h.id === id); const j = i + delta; if(j < 0 || j >= hs.length) return; hs.forEach((h,k) => h.orden = k + 1); const o = hs[i].orden; hs[i].orden = hs[j].orden; hs[j].orden = o; }
function moverA(id, nuevoPadre, indice){
  const n = nodo(id); if(!n || id === nuevoPadre || !nodo(nuevoPadre)) return;
  if(descendientes(id).some(d => d.id === nuevoPadre)) return;
  const origen = n.padre; const destino = hijos(nuevoPadre).filter(h => h.id !== id);
  destino.splice(Math.max(0, Math.min(indice, destino.length)), 0, n); n.padre = nuevoPadre;
  destino.forEach((h,k) => h.orden = k + 1); if(origen !== nuevoPadre) hijos(origen).forEach((h,k) => h.orden = k + 1);
}
function eliminar(id, silencioso){
  const n = nodo(id); if(!n) return; const desc = descendientes(id);
  if(!silencioso && !confirm("¿Eliminar «" + n.titulo + "»" + (desc.length ? " y sus " + desc.length + " hijos" : "") + "? No se puede deshacer.")) return;
  const quitar = new Set([id, ...desc.map(d => d.id)]); datos.nodos = datos.nodos.filter(x => !quitar.has(x.id));
  hijos(n.padre).forEach((h,k) => h.orden = k + 1);
  if(selId === id){ selId = null; cerrarPanel(); }
}
function addNota(id, texto){ const n=nodo(id); (n.notas = n.notas || []).unshift({ fecha: hoy(), texto }); n.tocado = hoy(); }
function editar(id, campo, valor){ const n=nodo(id); if(valor==="" || valor==null) delete n[campo]; else n[campo]=valor; n.tocado = hoy(); }
function toggleImportante(id, esBandeja){ const x = esBandeja ? itemBandeja(id) : nodo(id); if(!x) return; if(x.importante) delete x.importante; else x.importante = true; }
/* textos */
const TEXTOS_DEF = { ahora:"Lo que toca", arbol_t:"El árbol", arbol_d:"Objetivo, raíces, cuadros y pasos. Lo que se desbloquea al terminar lo anterior.", bandeja_t:"Bandeja", bandeja_d:"Captura todo aquí y luego decide dónde va. Vacía es la meta.", revision_t:"Revisión semanal", revision_d:"Una vez por semana: bandeja, pasos parados, plazos y una línea." };
function texto(k){ return (datos.textos && datos.textos[k]) || TEXTOS_DEF[k] || ""; }
function setTexto(k, v){ datos.textos = datos.textos || {}; if(v) datos.textos[k] = v; else delete datos.textos[k]; }
/* bandeja */
function migrar(){
  if(datos.diario && datos.diario.length){ datos.bandeja = datos.bandeja || []; for(const d of datos.diario) datos.bandeja.push({ id: "b" + Math.random().toString(36).slice(2,8), fecha: d.fecha, texto: d.texto, estado: "pendiente" }); delete datos.diario; guardar(); }
  datos.bandeja = datos.bandeja || []; datos.revisiones = datos.revisiones || []; datos.eventos = datos.eventos || [];
}
function capturar(texto, extra){ const b = Object.assign({ id: "b" + Date.now().toString(36) + Math.random().toString(36).slice(2,5), fecha: hoy(), texto, estado: "pendiente" }, extra||{}); datos.bandeja.unshift(b); return b; }
function itemBandeja(id){ return datos.bandeja.find(b => b.id === id); }
function procesar(id, accion, arg){
  const b = itemBandeja(id); if(!b) return false;
  if(accion === "paso"){ const p = nodo(arg); if(!p) return false; if(p.estado !== "activo") p.estado = "activo"; nuevoHijo(arg, b.texto, b.importante ? {importante:true} : null); b.estado = "archivado"; b.destino = "paso en " + p.titulo; }
  else if(accion === "cuadro"){ const r = nodo(arg); if(!r) return false; nuevoHijo(arg, b.texto, b.importante ? {importante:true} : null); b.estado = "archivado"; b.destino = "cuadro en " + r.titulo; }
  else if(accion === "calendario"){ if(!arg) return false; datos.eventos.push({ id: "ev" + Date.now().toString(36), fecha: arg, texto: b.texto }); b.estado = "archivado"; b.destino = "calendario " + arg; }
  else if(accion === "nota"){ const n = nodo(arg); if(!n) return false; addNota(arg, b.texto); b.estado = "archivado"; b.destino = "nota en " + n.titulo; }
  else if(accion === "algundia") b.estado = "algundia";
  else if(accion === "archivar"){ b.estado = "archivado"; b.destino = "archivado"; }
  else if(accion === "pendiente"){ b.estado = "pendiente"; delete b.destino; }
  else if(accion === "borrar"){ datos.bandeja = datos.bandeja.filter(x => x.id !== id); return true; }
  else return false;
  b.procesado = hoy(); return true;
}
/* atención */
function activosHoy(){ const out = []; for(const r of raices()){ let n = hijos(r.id).find(c => c.estado === "activo"); if(!n) continue; let p; while((p = hijos(n.id).find(c => c.estado === "activo"))) n = p; out.push({ raiz: r, nodo: n }); } return out; }
function atencion(){
  const h = hoy(); const lim = new Date(); lim.setDate(lim.getDate() + 7); const h7 = fechaStr(lim);
  const vivos = datos.nodos.filter(n => (n.tipo === "cuadro" || n.tipo === "paso") && n.estado !== "hecho");
  const imp = [...vivos.filter(n => n.importante).map(n => ({ t:n.titulo, s: ruta(n.padre).slice(-1)[0], nodo:n.id })), ...datos.bandeja.filter(b => b.importante && b.estado !== "archivado").map(b => ({ t:b.texto, s:"bandeja", band:b.id }))];
  const ven = vivos.filter(n => n.plazo && n.plazo < h).sort((a,b) => a.plazo.localeCompare(b.plazo)).map(n => ({ t:n.titulo, s:"venció " + fechaCorta(n.plazo), nodo:n.id }));
  const pro = vivos.filter(n => n.plazo && n.plazo >= h && n.plazo <= h7).sort((a,b) => a.plazo.localeCompare(b.plazo)).map(n => ({ t:n.titulo, s:"vence " + fechaCorta(n.plazo), nodo:n.id }));
  return { imp, ven, pro };
}

/* ---------- vistas ---------- */
const VISTAS = { inicio:"vInicio", arbol:"vArbol", bandeja:"vBandeja", calendario:"vCalendario", revision:"vRevision", ajustes:"vAjustes" };
function ir(v, guardarEstado=true){
  if(!VISTAS[v]) v = "inicio"; vista = v;
  document.querySelectorAll(".vista").forEach(el => el.classList.toggle("on", el.id === VISTAS[v]));
  document.querySelectorAll("[data-ir]").forEach(a => a.classList.toggle("on", a.dataset.ir === v));
  if(guardarEstado) sessionStorage.setItem("raiz.vista", v);
  window.scrollTo(0,0); render();
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-ir]"); if(b){ e.preventDefault(); ir(b.dataset.ir); } });
function editable(el, valor, onOk){
  if(!el) return; el.classList.add("ed"); el.title = "Doble clic para editar";
  el.ondblclick = (e) => { e.stopPropagation(); e.preventDefault(); const inp = document.createElement("input"); inp.className = "edIn"; inp.value = valor; el.replaceWith(inp); inp.focus(); inp.select();
    let fin = false; const ok = () => { if(fin) return; fin = true; onOk(inp.value.trim()); guardar(); render(); };
    inp.onblur = ok; inp.onkeydown = (ev) => { if(ev.key==="Enter") ok(); if(ev.key==="Escape"){ fin = true; render(); } }; inp.onclick = (ev) => ev.stopPropagation(); };
}

/* ---------- render general ---------- */
function render(){
  const d = new Date(); $("#fechaHoy").textContent = DIAS[(d.getDay()+6)%7] + " " + d.getDate() + " · " + MESES[d.getMonth()] + " · " + d.getFullYear();
  if(!datos){ $("#portada").innerHTML = '<div class="aviso">Sin datos. Ve a Ajustes y conecta Dropbox o vincula raiz.json.</div>'; return; }
  $("#titulo").textContent = datos.titulo || "La raíz"; $("#lema").textContent = datos.lema || "";
  $("#txtActualizado").textContent = "act. " + (datos.actualizado || "").replace("T"," ").slice(0,16);
  const pend = datos.bandeja.filter(b => b.estado === "pendiente").length;
  $("#navPend").textContent = pend ? "· " + pend : ""; const cm = $("#cntMovil"); cm.style.display = pend ? "" : "none"; cm.textContent = pend;
  ["#titulo","#lema"].forEach(q => { const e = $(q); e.classList.remove("ed"); e.ondblclick = null; });
  if(vista === "inicio") renderInicio();
  else if(vista === "arbol") renderArbol();
  else if(vista === "bandeja") renderBandeja();
  else if(vista === "calendario") renderCalendario();
  else if(vista === "revision") renderRevision();
  else if(vista === "ajustes") renderAjustes();
  if(selId) renderPanel();
}

/* ---------- portada ---------- */
function renderInicio(){
  const el = $("#portada"); const act = activosHoy(); const at = atencion();
  const total = datos.nodos.filter(n => n.tipo === "cuadro").length, hechos = datos.nodos.filter(n => n.tipo === "cuadro" && n.estado === "hecho").length;
  const pend = datos.bandeja.filter(b => b.estado === "pendiente").length;
  const col = (cls, tit, arr, vacio) => `<div class="${cls}"><h4><span>${tit}</span><span>${arr.length||''}</span></h4>${arr.length ? arr.slice(0,5).map(x => `<div class="it" ${x.nodo?'data-abrirnodo="'+x.nodo+'"':''} ${x.band?'data-abrirband="'+x.band+'"':''}>${esc(x.t)}<small>${esc(x.s||'')}</small></div>`).join("") + (arr.length>5?'<div class="nada">+'+(arr.length-5)+' más</div>':'') : '<div class="nada">'+vacio+'</div>'}</div>`;
  let h = `<div class="col8">
    <div class="ahora"><h2 id="edAhora">${esc(texto("ahora"))}</h2>` +
    (act.length ? `<div class="ahoraLista">` + act.map(a => { const p = a.nodo.padre && nodo(a.nodo.padre); const hs = p ? hijos(p.id) : []; const pos = hs.findIndex(x => x.id === a.nodo.id) + 1;
      return `<div class="ahoraItem" data-abrirnodo="${a.nodo.id}"><div class="r">${esc(a.raiz.titulo)}${a.nodo.tipo==='paso'&&p?' · '+esc(p.titulo):''}</div><div class="t">${esc(a.nodo.titulo)}</div>${a.nodo.hecho_cuando?'<div class="h">Hecho cuando: '+esc(a.nodo.hecho_cuando)+'</div>':''}<div class="m"><span>${a.nodo.tipo==='paso'?'paso':'cuadro'} ${pos} de ${hs.length}</span><span>${a.nodo.plazo?'▸ '+fechaCorta(a.nodo.plazo):''}</span></div></div>`; }).join("") + `</div>`
    : `<div class="aviso">Nada activo. Entra en el árbol y activa un cuadro.</div>`) +
    `</div>
    <div class="atencion">${col("imp","★ Importante",at.imp,"nada marcado")}${col("ven","Vencido",at.ven,"nada vencido")}${col("pro","Próximos 7 días",at.pro,"nada esta semana")}</div>
    <div class="laminas">
      <div class="lamina" data-ir="arbol"><div class="num">01</div><h3 id="edArbolT">${esc(texto("arbol_t"))}</h3><p id="edArbolD">${esc(texto("arbol_d"))}</p><div class="pie">${raices().length} raíces · ${hechos}/${total} cuadros hechos</div></div>
      <div class="lamina" data-ir="bandeja"><div class="num">02</div><h3 id="edBandejaT">${esc(texto("bandeja_t"))}</h3><p id="edBandejaD">${esc(texto("bandeja_d"))}</p><div class="pie">${pend ? pend + ' sin procesar' : 'vacía'}</div></div>
      <div class="lamina" data-ir="revision"><div class="num">04</div><h3 id="edRevT">${esc(texto("revision_t"))}</h3><p id="edRevD">${esc(texto("revision_d"))}</p><div class="pie">${datos.ultimaRevision ? 'última: ' + fechaCorta(datos.ultimaRevision) : 'ninguna todavía'}</div></div>
    </div>
  </div>
  <div class="col4">${renderCal(hoy().slice(0,7), true)}</div>`;
  el.innerHTML = h;
  el.querySelector(".cal").onclick = (e) => { if(e.target.closest("[data-dia]")) { calDia = e.target.closest("[data-dia]").dataset.dia; calMes = calDia.slice(0,7); ir("calendario"); abrirDia(calDia); return; } calMes = hoy().slice(0,7); ir("calendario"); };
  el.querySelectorAll("[data-abrirnodo]").forEach(x => x.onclick = (e) => { e.stopPropagation(); abrir(x.dataset.abrirnodo); });
  el.querySelectorAll("[data-abrirband]").forEach(x => x.onclick = (e) => { e.stopPropagation(); abrirBandeja(x.dataset.abrirband); });
  editable($("#titulo"), datos.titulo || "La raíz", v => { datos.titulo = v || "La raíz"; });
  editable($("#lema"), datos.lema || "", v => { datos.lema = v; });
  editable($("#edAhora"), texto("ahora"), v => setTexto("ahora", v));
  editable($("#edArbolT"), texto("arbol_t"), v => setTexto("arbol_t", v)); editable($("#edArbolD"), texto("arbol_d"), v => setTexto("arbol_d", v));
  editable($("#edBandejaT"), texto("bandeja_t"), v => setTexto("bandeja_t", v)); editable($("#edBandejaD"), texto("bandeja_d"), v => setTexto("bandeja_d", v));
  editable($("#edRevT"), texto("revision_t"), v => setTexto("revision_t", v)); editable($("#edRevD"), texto("revision_d"), v => setTexto("revision_d", v));
}

/* ---------- calendario ---------- */
function marcasDelDia(f){
  const out = []; const h = hoy();
  for(const n of datos.nodos){ if(n.tipo !== "cuadro" && n.tipo !== "paso") continue;
    if(n.inicio === f) out.push({ cls:"inicio", txt:"▶ " + n.titulo, nodo:n.id });
    if(n.plazo === f){ const cls = n.estado === "hecho" ? "hecho" : (f < h ? "vencido" : "plazo"); out.push({ cls, txt:"◆ " + n.titulo, nodo:n.id }); }
    if(n.cerrado === f && n.plazo !== f) out.push({ cls:"hecho", txt:"✓ " + n.titulo, nodo:n.id }); }
  for(const e of datos.eventos) if(e.fecha === f) out.push({ cls:"evento", txt:e.texto, evento:e.id, nodo:e.nodo });
  return out;
}
function renderCal(mes, mini){
  const [y,m] = mes.split("-").map(Number); const primero = new Date(y, m-1, 1); const dow = (primero.getDay()+6)%7; const inicio = new Date(y, m-1, 1 - dow); const h0 = hoy();
  let h = `<div class="cal ${mini?'mini':'grande'}"><div class="cabc"><h3>${MESES[m-1][0].toUpperCase()+MESES[m-1].slice(1)} <span style="color:var(--grisClaro);font-weight:400">${y}</span></h3>`;
  h += mini ? `<span class="etq">03 · Calendario ▸</span>` : `<div class="acciones"><button class="btn sec" data-cal="-1">◀</button><button class="btn sec" data-cal="0">Hoy</button><button class="btn sec" data-cal="1">▶</button></div>`;
  h += `</div><div class="dias">` + ["lu","ma","mi","ju","vi","sá","do"].map(d=>`<div class="dn">${d}</div>`).join("");
  for(let i=0;i<42;i++){ const d = new Date(inicio); d.setDate(inicio.getDate()+i); const f = fechaStr(d); if(i >= 35 && d.getMonth() !== m-1) break;
    const fuera = d.getMonth() !== m-1; const ms = marcasDelDia(f);
    h += `<div class="d ${fuera?'fuera':''} ${f===h0?'hoy':''} ${f===calDia&&!mini?'sel':''}" data-dia="${f}"><span class="n">${d.getDate()}</span>`;
    if(mini) h += `<div class="ptos">` + ms.slice(0,3).map(x => `<i class="pto-${x.cls}"></i>`).join("") + `</div>`;
    else { h += ms.slice(0,3).map(x => `<span class="marca ${x.cls}" title="${esc(x.txt)}">${esc(x.txt)}</span>`).join(""); if(ms.length > 3) h += `<span class="marca">+${ms.length-3}</span>`; }
    h += `</div>`; }
  h += `</div>`;
  if(mini){ const prox = []; const d0 = new Date(); for(let i=0;i<14 && prox.length<4;i++){ const d = new Date(d0); d.setDate(d0.getDate()+i); const f = fechaStr(d); for(const x of marcasDelDia(f)) if(prox.length<4 && x.cls!=="hecho") prox.push({f, ...x}); }
    h += `<div class="proximos">` + (prox.length ? prox.map(x => `<div data-dia="${x.f}"><i class="pto-${x.cls}"></i><span class="mono" style="color:var(--grisClaro);font-size:11px;min-width:44px">${fechaCorta(x.f)}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.txt)}</span></div>`).join("") : '<div class="aviso">Nada en dos semanas.</div>') + `</div>`; }
  else h += `<div class="leyenda"><span class="lp">plazo</span><span class="lv">vencido</span><span class="lh">hecho</span><span class="li">inicio</span><span class="le">anotación</span></div>`;
  return h + `</div>`;
}
function renderCalendario(){
  if(!calMes) calMes = hoy().slice(0,7); const el = $("#calGrande"); el.innerHTML = renderCal(calMes, false);
  el.querySelectorAll("[data-cal]").forEach(b => b.onclick = () => { const k = +b.dataset.cal; if(k===0) calMes = hoy().slice(0,7); else { const [y,m] = calMes.split("-").map(Number); calMes = fechaStr(new Date(y, m-1+k, 1)).slice(0,7); } renderCalendario(); });
  el.querySelectorAll("[data-dia]").forEach(d => d.onclick = () => { calDia = d.dataset.dia; abrirDia(calDia); renderCalendario(); });
}
function abrirDia(f){
  selId = null; $("#panel").classList.add("open"); $("#velo").classList.add("open");
  const d = new Date(f + "T00:00:00"); $("#pRuta").textContent = "calendario"; $("#pTitulo").textContent = DIAS[(d.getDay()+6)%7] + " " + d.getDate() + " de " + MESES[d.getMonth()];
  const ms = marcasDelDia(f); const vivos = datos.nodos.filter(n => (n.tipo==="cuadro"||n.tipo==="paso") && n.estado !== "hecho");
  let h = `<div class="lista">` + (ms.length ? ms.map(x => `<div class="paso" ${x.nodo?('data-abrir="'+x.nodo+'"'):''}><span class="marca ${x.cls}" style="white-space:normal;flex:1;padding:3px 8px;border-radius:4px">${esc(x.txt)}</span>${x.evento?('<span class="mini"><button data-xe="'+x.evento+'" title="Borrar anotación">✕</button></span>'):''}</div>`).join("") : '<div class="aviso">Nada ese día.</div>') + `</div>`;
  h += `<div class="campo"><label class="etq">Anotar en este día</label><input id="evTxt" placeholder="Reunión, visita, entrega…" style="width:100%" /></div>`;
  h += `<div class="campo"><label class="etq">Vincular a un cuadro (opcional)</label><select id="evNodo" style="width:100%"><option value="">—</option>${vivos.map(n=>`<option value="${n.id}">${esc(n.titulo)}</option>`).join("")}</select></div>`;
  h += `<div class="acciones"><button class="btn act" id="bEv">Anotar</button></div>`;
  const c = $("#pCuerpo"); c.innerHTML = h;
  $("#bEv").onclick = () => { const t = $("#evTxt").value.trim(); if(!t) return; datos.eventos.push({ id: "ev" + Date.now().toString(36), fecha: f, texto: t, nodo: $("#evNodo").value || undefined }); guardar(); abrirDia(f); render(); };
  $("#evTxt").addEventListener("keydown", e => { if(e.key==="Enter") $("#bEv").click(); });
  c.querySelectorAll("[data-xe]").forEach(b => b.onclick = (e) => { e.stopPropagation(); datos.eventos = datos.eventos.filter(x => x.id !== b.dataset.xe); guardar(); abrirDia(f); render(); });
  c.querySelectorAll("[data-abrir]").forEach(p => p.onclick = (e) => { if(e.target.closest(".mini")) return; abrir(p.dataset.abrir); });
}

/* ---------- árbol ---------- */
function renderArbol(){
  const obj = nodo("arbol"), tronco = nodo("tronco"); $("#copa").textContent = obj ? obj.titulo : ""; $("#tronco").textContent = tronco ? tronco.titulo : "";
  if(obj) editable($("#copa"), obj.titulo, v => { if(v) obj.titulo = v; });
  const rs = raices(); if(!raizMovil || !nodo(raizMovil)) raizMovil = rs[0] && rs[0].id;
  $("#pestanas").innerHTML = rs.map(r => `<button class="${r.id===raizMovil?'on':''}" data-raizm="${r.id}">${esc(r.titulo)}</button>`).join("");
  $("#pestanas").querySelectorAll("[data-raizm]").forEach(b => b.onclick = () => { raizMovil = b.dataset.raizm; renderArbol(); });
  const arbol = $("#arbol"); let h = '<div class="tablero" id="tablero">';
  for(const r of rs){ const cs = hijos(r.id); const hechos = cs.filter(c=>c.estado==="hecho").length;
    h += `<section class="raiz ${r.id===raizMovil?'movilOn':''}" data-raiz="${r.id}"><h2 draggable="true" data-asa="${r.id}"><span class="asa" title="Arrastra para mover la columna">⋮⋮</span><span class="titulo-raiz" data-ren="${r.id}" title="Clic para renombrar">${esc(r.titulo)}</span><small>${hechos}/${cs.length}</small><button class="mas" data-menu="${r.id}" title="Menú">···</button></h2><div class="cuadros" data-lista="${r.id}">`;
    for(const c of cs){ const nh = hijos(c.id);
      h += `<div class="cuadro ${c.estado} ${c.id===selId?'sel':''}" draggable="true" data-id="${c.id}"><div class="t">${c.importante?'<span style="color:#c9a227">★</span> ':''}${esc(c.titulo)}</div><div class="m">${c.plazo?('<span>▸ '+fechaCorta(c.plazo)+'</span>'):''}${c.estado==='activo'&&nh.length?('<span>'+nh.filter(x=>x.estado==='hecho').length+'/'+nh.length+' pasos</span>'):''}${c.estado==='disponible'?'<span>disponible</span>':''}</div>${c.notas&&c.notas.length?'<div class="hijos">✎'+c.notas.length+'</div>':''}</div>`; }
    h += `</div><button class="masCuadro" data-nuevo="${r.id}">+ cuadro</button></section>`; }
  h += `<button class="nuevaRaiz" id="bNuevaRaiz">+ raíz</button></div>`; arbol.innerHTML = h;
  arbol.querySelectorAll(".cuadro").forEach(el => el.onclick = () => abrir(el.dataset.id));
  arbol.querySelectorAll("[data-nuevo]").forEach(el => el.onclick = () => { const t = prompt("Título del nuevo cuadro"); if(t){ nuevoHijo(el.dataset.nuevo, t.trim()); guardar(); render(); } });
  $("#bNuevaRaiz").onclick = () => { const t = prompt("Nombre de la nueva raíz"); if(t){ nuevaRaiz(t.trim()); guardar(); render(); } };
  arbol.querySelectorAll("[data-ren]").forEach(el => el.onclick = (e) => { e.stopPropagation(); const id = el.dataset.ren; const inp = document.createElement("input"); inp.value = nodo(id).titulo; el.replaceWith(inp); inp.focus(); inp.select();
    let fin = false; const ok = () => { if(fin) return; fin = true; const v = inp.value.trim(); if(v) nodo(id).titulo = v; guardar(); render(); }; inp.onblur = ok; inp.onkeydown = (ev) => { if(ev.key==="Enter") ok(); if(ev.key==="Escape"){ fin = true; render(); } }; });
  arbol.querySelectorAll("[data-menu]").forEach(b => b.onclick = (e) => { e.stopPropagation(); menuRaiz(b.dataset.menu, b); });
  instalarArrastre(arbol);
}
function menuRaiz(id, ancla){
  document.querySelectorAll(".menuRaiz").forEach(m => m.remove()); const r = nodo(id); const rs = raices(); const i = rs.findIndex(x => x.id === id);
  const m = document.createElement("div"); m.className = "menuRaiz";
  m.innerHTML = `<button data-o="ren">Renombrar</button><button data-o="izq" ${i===0?'disabled':''}>◀ Mover a la izquierda</button><button data-o="der" ${i===rs.length-1?'disabled':''}>Mover a la derecha ▶</button><button data-o="del" class="rojo">Eliminar raíz…</button>`;
  const rect = ancla.getBoundingClientRect(); m.style.left = Math.min(rect.left, window.innerWidth - 200) + "px"; m.style.top = (rect.bottom + window.scrollY + 4) + "px"; document.body.appendChild(m);
  m.querySelectorAll("button").forEach(b => b.onclick = () => { const o = b.dataset.o; m.remove();
    if(o==="ren"){ const t = prompt("Nuevo nombre", r.titulo); if(t){ r.titulo = t.trim(); } } if(o==="izq") mover(id, -1); if(o==="der") mover(id, 1); if(o==="del"){ eliminar(id); } guardar(); render(); });
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
    col.addEventListener("drop", (e) => { if(dragTipo !== "raiz") return; e.preventDefault(); e.stopPropagation(); const rs = raices().filter(r => r.id !== dragId); let idx = rs.findIndex(r => r.id === col.dataset.raiz); if(e.clientX > col.getBoundingClientRect().left + col.offsetWidth/2) idx += 1; limpiar(); moverA(dragId, "arbol", idx); guardar(); render(); }); });
}

/* ---------- panel de nodo ---------- */
function abrir(id){ selId = id; $("#panel").classList.add("open"); $("#velo").classList.add("open"); renderPanel(); if(vista === "arbol") renderArbol(); }
function cerrarPanel(){ selId = null; calDia = null; $("#panel").classList.remove("open"); $("#velo").classList.remove("open"); }
function renderPanel(){
  const n = nodo(selId); if(!n){ cerrarPanel(); return; }
  $("#pRuta").textContent = ruta(n.padre).join(" › "); $("#pTitulo").textContent = n.titulo;
  const hs = hijos(n.id);
  let h = `<div class="acciones"><button class="estrella ${n.importante?'on':''}" data-a="imp" title="Importante">★</button><span class="chip ${n.estado}">${n.estado}</span>${n.plazo?'<span class="chip">plazo '+fechaCorta(n.plazo)+'</span>':''}${n.cerrado?'<span class="chip hecho">hecho '+fechaCorta(n.cerrado)+'</span>':''}</div>`;
  h += `<div class="acciones">${n.estado==='disponible'?'<button class="btn act" data-a="activar">Activar</button>':''}${n.estado==='activo'?'<button class="btn act" data-a="hecho">Marcar hecho</button>':''}${n.estado==='hecho'?'<button class="btn sec" data-a="reabrir">Reabrir</button>':''}<button class="btn sec" data-a="subir">▲</button><button class="btn sec" data-a="bajar">▼</button><button class="btn rojo" data-a="eliminar" style="margin-left:auto">Eliminar</button></div>`;
  h += `<div class="campo"><label class="etq">Título</label><input data-e="titulo" value="${esc(n.titulo)}" style="width:100%" /></div>`;
  h += `<div class="campo"><label class="etq">Hecho cuando…</label><input data-e="hecho_cuando" value="${esc(n.hecho_cuando||'')}" placeholder="Criterio verificable" style="width:100%" /></div>`;
  h += `<div class="acciones" style="gap:10px"><div class="campo" style="flex:1"><label class="etq">Inicio</label><input data-e="inicio" type="date" value="${n.inicio||''}" style="width:100%" /></div><div class="campo" style="flex:1"><label class="etq">Plazo</label><input data-e="plazo" type="date" value="${n.plazo||''}" style="width:100%" /></div></div>`;
  h += `<div><div class="etq" style="margin-bottom:6px">${n.tipo==='raiz'?'Cuadros':'Pasos'} (${hs.filter(x=>x.estado==='hecho').length}/${hs.length})</div><div class="lista">`;
  hs.forEach((p,i) => { h += `<div class="paso ${p.estado}" data-abrir="${p.id}"><span class="n">${String(i+1).padStart(2,'0')}</span><span class="t" style="flex:1">${esc(p.titulo)}</span><span class="mini"><button data-m="${p.id}|-1">▲</button><button data-m="${p.id}|1">▼</button><button data-x="${p.id}">✕</button></span></div>`; });
  h += `</div>`;
  if(n.estado === "activo" || n.tipo === "raiz") h += `<div class="acciones" style="margin-top:6px"><input id="nuevoPaso" placeholder="${n.tipo==='raiz'?'Nuevo cuadro…':'Nuevo paso…'}" style="flex:1" /><button class="btn" data-a="nuevoPaso">+</button></div>`; else h += `<div class="aviso">Solo un nodo activo se desglosa.</div>`;
  h += `</div>`;
  h += `<div><div class="etq" style="margin-bottom:6px">Notas</div><textarea id="nuevaNota" placeholder="Apunta y pulsa Guardar nota" style="width:100%;min-height:60px"></textarea><div class="acciones" style="margin-top:6px"><button class="btn" data-a="nota">Guardar nota</button></div><div class="lista" style="margin-top:8px">${(n.notas||[]).map(x => `<div class="nota"><div class="f">${x.fecha}</div>${esc(x.texto)}</div>`).join("")}</div></div>`;
  const c = $("#pCuerpo"); c.innerHTML = h;
  c.querySelectorAll("[data-a]").forEach(b => b.onclick = () => { const a = b.dataset.a;
    if(a==="imp") toggleImportante(n.id, false); if(a==="activar") activar(n.id); if(a==="hecho") marcarHecho(n.id); if(a==="reabrir") reabrir(n.id); if(a==="subir") mover(n.id,-1); if(a==="bajar") mover(n.id,1); if(a==="eliminar"){ eliminar(n.id); }
    if(a==="nota"){ const t=$("#nuevaNota").value.trim(); if(t) addNota(n.id, t); } if(a==="nuevoPaso"){ const t=$("#nuevoPaso").value.trim(); if(t) nuevoHijo(n.id, t); }
    guardar(); render(); });
  c.querySelectorAll("[data-e]").forEach(i => i.onchange = () => { editar(n.id, i.dataset.e, i.value.trim()); guardar(); render(); });
  c.querySelectorAll("[data-abrir]").forEach(p => p.onclick = (e) => { if(e.target.closest(".mini")) return; abrir(p.dataset.abrir); });
  c.querySelectorAll("[data-m]").forEach(b => b.onclick = (e) => { e.stopPropagation(); const [id,d] = b.dataset.m.split("|"); mover(id, +d); guardar(); render(); });
  c.querySelectorAll("[data-x]").forEach(b => b.onclick = (e) => { e.stopPropagation(); eliminar(b.dataset.x); guardar(); render(); });
}

/* ---------- bandeja ---------- */
function renderBandeja(){
  const pint = (arr, vacio) => arr.length ? arr.map(b => `<div class="item ${b.importante?'imp':''}" data-b="${b.id}"><button class="estrella ${b.importante?'on':''}" data-imp="${b.id}">★</button><div class="tx">${esc(b.texto)}<div class="f">${fechaCorta(b.fecha)}${b.destino?' · '+esc(b.destino):''}</div></div></div>`).join("") : `<div class="aviso">${vacio}</div>`;
  const pend = datos.bandeja.filter(b => b.estado === "pendiente"), alg = datos.bandeja.filter(b => b.estado === "algundia"), arch = datos.bandeja.filter(b => b.estado === "archivado");
  $("#bandejaLista").innerHTML = pint(pend, "Bandeja vacía. Bien."); $("#bandejaAlgunLista").innerHTML = pint(alg, "Nada aparcado."); $("#nAlgun").textContent = alg.length; $("#bandejaArchLista").innerHTML = pint(arch.slice(0,30), "Nada archivado."); $("#nArch").textContent = arch.length;
  document.querySelectorAll("#vBandeja [data-b]").forEach(el => el.onclick = (e) => { if(e.target.closest("[data-imp]")) return; abrirBandeja(el.dataset.b); });
  document.querySelectorAll("#vBandeja [data-imp]").forEach(b => b.onclick = (e) => { e.stopPropagation(); toggleImportante(b.dataset.imp, true); guardar(); render(); });
}
function abrirBandeja(id){
  const b = itemBandeja(id); if(!b) return; selId = null; $("#panel").classList.add("open"); $("#velo").classList.add("open");
  $("#pRuta").textContent = "bandeja · " + fechaCorta(b.fecha) + (b.destino ? " · " + b.destino : ""); $("#pTitulo").textContent = b.texto;
  const activos = datos.nodos.filter(n => n.tipo === "cuadro" && n.estado === "activo"); const cuadros = datos.nodos.filter(n => (n.tipo === "cuadro" || n.tipo === "paso") && n.estado !== "hecho"); const rs = raices();
  const sel = (arr, id) => `<select id="${id}">${arr.map(n => `<option value="${n.id}">${esc(n.titulo)}</option>`).join("")}</select>`;
  let h = `<div class="acciones"><button class="estrella ${b.importante?'on':''}" data-a="imp">★</button><input id="bTexto" value="${esc(b.texto)}" style="flex:1" /></div><div class="etq">¿Qué es esto?</div><div class="opciones">`;
  h += `<div class="op" data-a="paso"><b>→ paso</b> de ${activos.length ? sel(activos, "selPaso") : '<span class="aviso">(no hay cuadros activos)</span>'}</div>`;
  h += `<div class="op" data-a="cuadro"><b>→ cuadro</b> en ${sel(rs, "selRaiz")}</div><div class="op" data-a="calendario"><b>→ calendario</b> <input type="date" id="selFecha" value="${hoy()}" /></div><div class="op" data-a="nota"><b>→ nota</b> de ${sel(cuadros, "selNota")}</div>`;
  h += `<div class="op" data-a="algundia"><b>algún día</b> quizá, no ahora</div><div class="op" data-a="archivar"><b>archivar</b> hecho o descartado</div>${b.estado !== "pendiente" ? '<div class="op" data-a="pendiente"><b>↩ bandeja</b> volver a pendiente</div>' : ''}<div class="op" data-a="borrar" style="color:var(--rojo)"><b>borrar</b> eliminar del todo</div></div>`;
  h += `<div class="aviso">O pídeselo a Claude: "¿dónde meto esto?"</div>`;
  const c = $("#pCuerpo"); c.innerHTML = h;
  $("#bTexto").onchange = () => { b.texto = $("#bTexto").value.trim() || b.texto; guardar(); };
  c.querySelectorAll("select,input").forEach(x => x.onclick = (e) => e.stopPropagation());
  c.querySelectorAll("[data-a]").forEach(o => o.onclick = () => { const a = o.dataset.a; b.texto = $("#bTexto").value.trim() || b.texto;
    if(a === "imp"){ toggleImportante(id, true); guardar(); abrirBandeja(id); render(); return; }
    const arg = a==="paso" ? ($("#selPaso")||{}).value : a==="cuadro" ? $("#selRaiz").value : a==="calendario" ? $("#selFecha").value : a==="nota" ? $("#selNota").value : null;
    if((a==="paso"||a==="cuadro"||a==="nota"||a==="calendario") && !arg){ toast("Elige el destino"); return; }
    if(procesar(id, a, arg)){ guardar(); cerrarPanel(); render(); } });
}

/* ---------- revisión ---------- */
function renderRevision(){
  const el = $("#revision"); const h0 = hoy(); const d7 = new Date(); d7.setDate(d7.getDate()-7); const hace7 = fechaStr(d7); const d15 = new Date(); d15.setDate(d15.getDate()+15); const en15 = fechaStr(d15);
  const pend = datos.bandeja.filter(b => b.estado === "pendiente"); const parados = datos.nodos.filter(n => n.tipo === "paso" && n.estado === "activo" && (n.tocado || n.activado || n.creado || "2000-01-01") < hace7);
  const vivos = datos.nodos.filter(n => (n.tipo === "cuadro" || n.tipo === "paso") && n.estado !== "hecho"); const prox = vivos.filter(n => n.plazo && n.plazo <= en15).sort((a,b) => a.plazo.localeCompare(b.plazo));
  const alg = datos.bandeja.filter(b => b.estado === "algundia"); const hechosSemana = datos.nodos.filter(n => n.cerrado && n.cerrado >= hace7);
  const item = (t, s, attr) => `<div class="paso" ${attr}><span class="t" style="flex:1">${esc(t)}</span><span class="n">${esc(s||"")}</span></div>`;
  let h = `<section class="s1"><h2>1 · Bandeja <small>${pend.length} sin procesar</small></h2><div class="cuerpo">${pend.length ? pend.slice(0,8).map(b => item(b.texto, fechaCorta(b.fecha), 'data-b="'+b.id+'"')).join("") : '<div class="aviso">Vacía. Bien.</div>'}<div class="acciones"><button class="btn sec" data-ir="bandeja">Ir a la bandeja</button></div></div></section>`;
  h += `<section class="s2"><h2>2 · Hecho esta semana <small>${hechosSemana.length}</small></h2><div class="cuerpo">${hechosSemana.length ? hechosSemana.map(n => item("✓ " + n.titulo, fechaCorta(n.cerrado), 'data-abrir="'+n.id+'"')).join("") : '<div class="aviso">Nada cerrado en 7 días.</div>'}</div></section>`;
  h += `<section class="s3"><h2>3 · Pasos parados <small>+7 días sin tocar</small></h2><div class="cuerpo">${parados.length ? parados.map(n => item(n.titulo, "desde " + fechaCorta(n.tocado||n.activado||n.creado), 'data-abrir="'+n.id+'"')).join("") : '<div class="aviso">Todo lo activo se ha movido esta semana.</div>'}</div></section>`;
  h += `<section class="s4"><h2>4 · Plazos en 15 días <small>${prox.length}</small></h2><div class="cuerpo">${prox.length ? prox.map(n => item(n.titulo, (n.plazo < h0 ? "VENCIÓ " : "") + fechaCorta(n.plazo), 'data-abrir="'+n.id+'"')).join("") : '<div class="aviso">Nada vence en dos semanas.</div>'}</div></section>`;
  h += `<section class="s5"><h2>5 · Algún día <small>${alg.length}</small></h2><div class="cuerpo">${alg.length ? alg.map(b => item(b.texto, fechaCorta(b.fecha), 'data-b="'+b.id+'"')).join("") : '<div class="aviso">Nada aparcado.</div>'}</div></section>`;
  h += `<section class="s1 linea"><h2>6 · La línea de la semana</h2><div class="tarjeta"><div class="acciones"><input id="revTxt" placeholder="Qué ha pasado, qué toca, cómo vas…" style="flex:1" /><button class="btn act" id="bRev">Cerrar revisión</button></div>${(datos.revisiones||[]).slice(0,12).map(r => `<div class="nota"><div class="f">${r.fecha}</div>${esc(r.texto)}</div>`).join("")}</div></section>`;
  el.innerHTML = h;
  el.querySelectorAll("[data-abrir]").forEach(x => x.onclick = () => abrir(x.dataset.abrir)); el.querySelectorAll("[data-b]").forEach(x => x.onclick = () => abrirBandeja(x.dataset.b));
  $("#bRev").onclick = () => { const t = $("#revTxt").value.trim(); datos.revisiones.unshift({ fecha: hoy(), texto: t || "(sin texto)" }); datos.ultimaRevision = hoy(); guardar(); render(); toast("Revisión cerrada"); };
}

/* ---------- ajustes ---------- */
function renderAjustes(){ $("#apiKey").value = localStorage.getItem(LS_API) || ""; $("#modelo").value = localStorage.getItem(LS_MODELO) || "claude-sonnet-5-5"; $("#bDropbox").textContent = localStorage.getItem(LS_RT) ? "Dropbox conectado" : "Conectar Dropbox"; }

/* ---------- persistencia ---------- */
function serializar(){ datos.actualizado = ahora().slice(0,19); return JSON.stringify(datos, null, 2); }
function guardar(){
  if(!datos) return; const txt = serializar(); localStorage.setItem(LS_DATOS, txt); clearTimeout(guardarTimer);
  guardarTimer = setTimeout(async () => { try{
    if(modo === "dropbox"){ setEstado("sync","subiendo…"); await dbxSubir(txt); setEstado("ok","Dropbox"); }
    else if(modo === "archivo" && fileHandle){ const w = await fileHandle.createWritable(); await w.write(txt); await w.close(); setEstado("ok","raiz.json local"); }
    else setEstado("", "solo en este navegador");
  }catch(e){ console.error(e); setEstado("err","error al guardar"); toast("No se pudo guardar: " + e.message); } }, 600);
}
async function cargarInicial(){
  if(CFG.appKey && localStorage.getItem(LS_RT)){ try{ modo="dropbox"; setEstado("sync","leyendo Dropbox…"); datos = JSON.parse(await dbxBajar()); setEstado("ok","Dropbox"); localStorage.setItem(LS_DATOS, JSON.stringify(datos)); return; } catch(e){ console.error(e); setEstado("err","Dropbox: " + e.message); } }
  const ls = localStorage.getItem(LS_DATOS); if(ls){ datos = JSON.parse(ls); modo = fileHandle ? "archivo" : "local"; setEstado("", "copia local"); return; }
  try{ const r = await fetch("../raiz.json", {cache:"no-store"}); if(r.ok){ datos = await r.json(); localStorage.setItem(LS_DATOS, JSON.stringify(datos)); setEstado("", "leído ../raiz.json"); return; } }catch(e){}
  setEstado("err","sin datos");
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
   CLAUDE DENTRO · chat por API con cambios propuestos
   ============================================================ */
let chatMsgs = []; try{ chatMsgs = JSON.parse(localStorage.getItem(LS_CHAT) || "[]"); }catch(e){ chatMsgs = []; }
let adjuntos = []; // {nombre, tipo, b64|texto}
let pendienteOps = null;
const SYSTEM = `Eres Claude dentro de "La raíz", la app personal de objetivos de Pablo Tejada Díaz (arquitecto en Málaga). Hablas en español, directo y breve, como un socio que organiza, no como un asistente genérico.

MODELO DE DATOS (JSON "raiz"):
- nodos: lista plana. Cada nodo: id, padre, tipo (objetivo | contexto | raiz | cuadro | paso), titulo, estado (bloqueado | disponible | activo | hecho), orden (1..n entre hermanos), y opcionales: hecho_cuando (criterio verificable), inicio y plazo (YYYY-MM-DD), importante (true), notas [{fecha,texto}].
- Jerarquía: objetivo "arbol" → raíces (padre "arbol") → cuadros (padre = id de raíz) → pasos (padre = id de cuadro). Máximo cuatro niveles.
- Reglas: solo un nodo activo por padre; lo bloqueado se desbloquea al marcar hecho el anterior; solo lo activo se desglosa en hijos. Un paso nuevo bajo un cuadro activo sin pasos queda activo; los demás, bloqueados en orden.
- bandeja: entradas GTD {id, fecha, texto, estado: pendiente | algundia | archivado, importante}.
- eventos: anotaciones de calendario {id, fecha, texto, nodo?}.

CÓMO RESPONDES. Siempre un único objeto JSON, sin texto fuera, con esta forma:
{"respuesta": "<lo que le dices a Pablo, en texto llano, con saltos de línea si hace falta>",
 "cambios": [ ...operaciones opcionales... ]}

OPERACIONES (campos exactos):
- {"op":"crear_raiz","titulo":"..."}
- {"op":"crear_cuadro","raiz":"<id de raíz>","titulo":"...","hecho_cuando":"...","plazo":"YYYY-MM-DD","inicio":"YYYY-MM-DD","importante":true}  (solo titulo y raiz obligatorios)
- {"op":"crear_paso","cuadro":"<id de cuadro>","titulo":"...","hecho_cuando":"...","plazo":"YYYY-MM-DD"}
- {"op":"editar","id":"<id>","campos":{"titulo":"...","hecho_cuando":"...","plazo":"...","inicio":"...","importante":true}}
- {"op":"activar","id":"<id>"}   {"op":"marcar_hecho","id":"<id>"}   {"op":"eliminar","id":"<id>"}
- {"op":"mover","id":"<id>","padre":"<id destino>","posicion":1}
- {"op":"nota","id":"<id>","texto":"..."}
- {"op":"anotar_calendario","fecha":"YYYY-MM-DD","texto":"...","nodo":"<id opcional>"}
- {"op":"capturar","texto":"..."}   {"op":"procesar_bandeja","id":"<id bandeja>","accion":"paso|cuadro|calendario|nota|algundia|archivar","arg":"<id o fecha>"}
- {"op":"revision","texto":"..."}  (cierra la revisión semanal con esa línea)
Para crear pasos de un cuadro que creas en la misma respuesta, usa como "cuadro" el valor "nuevo:<titulo del cuadro>" y la app lo resuelve.

CRITERIOS. Propón cambios solo cuando Pablo pida organizar, planificar, desglosar, procesar o anotar; si solo pregunta o conversa, "cambios" vacío. Los cuadros llevan siempre un hecho_cuando verificable. Pasos de media jornada como máximo. Fechas realistas a partir de HOY. No dupliques lo que ya existe: reutiliza ids existentes. Nunca elimines nada salvo que lo pida expresamente. Respeta el árbol de Pablo: su esencia es "renovar el pasado" (rehabilitación de edificios existentes en Málaga), el cuaderno es su escaparate, Nelio es su socio, y la regla de oro es un solo cuadro activo por raíz y empezar por una pieza.`;
function contextoRaiz(){
  const n = datos.nodos.map(x => { const o = { id:x.id, padre:x.padre, tipo:x.tipo, titulo:x.titulo, estado:x.estado, orden:x.orden }; for(const k of ["hecho_cuando","inicio","plazo","importante","cerrado"]) if(x[k]!=null) o[k]=x[k]; if(x.notas&&x.notas.length) o.notas = x.notas.slice(0,3).map(z=>z.fecha+": "+z.texto); return o; });
  const d60 = new Date(); d60.setDate(d60.getDate()+60); const f60 = fechaStr(d60); const d14 = new Date(); d14.setDate(d14.getDate()-14); const f14 = fechaStr(d14);
  return JSON.stringify({ hoy: hoy(), titulo: datos.titulo, lema: datos.lema, nodos: n, bandeja: datos.bandeja.filter(b => b.estado !== "archivado").map(b => ({id:b.id,fecha:b.fecha,texto:b.texto,estado:b.estado,importante:b.importante})), eventos: datos.eventos.filter(e => e.fecha >= f14 && e.fecha <= f60), ultimaRevision: datos.ultimaRevision, revisiones: (datos.revisiones||[]).slice(0,3) });
}
function abrirChat(){ $("#chat").classList.add("open"); renderChat(); if(!localStorage.getItem(LS_API)){ sysMsg("Falta la clave de API: ponla en Ajustes → Claude."); } setTimeout(()=>$("#chatTxt").focus(), 100); }
function cerrarChat(){ $("#chat").classList.remove("open"); }
function sysMsg(t){ const m = $("#msgs"); const d = document.createElement("div"); d.className = "msg sys"; d.textContent = t; m.appendChild(d); m.scrollTop = m.scrollHeight; }
function renderChat(){
  const m = $("#msgs"); m.innerHTML = chatMsgs.length ? "" : '<div class="msg sys">Cuéntame qué quieres organizar. Puedo crear cuadros y pasos, procesar la bandeja, anotar en el calendario o hacer contigo la revisión semanal. Antes de tocar nada te enseño los cambios.</div>';
  for(const x of chatMsgs){ const d = document.createElement("div"); d.className = "msg " + (x.rol === "user" ? "yo" : "ia"); d.textContent = x.texto; if(x.adj && x.adj.length) d.innerHTML += '<span class="adj">📎 ' + x.adj.map(esc).join(", ") + '</span>'; m.appendChild(d); }
  $("#modeloChat").value = localStorage.getItem(LS_MODELO) || "claude-sonnet-5-5";
  renderAdjuntos(); m.scrollTop = m.scrollHeight;
}
function renderAdjuntos(){ $("#adjuntos").innerHTML = adjuntos.map((a,i) => `<span>${esc(a.nombre)}<b data-q="${i}">✕</b></span>`).join(""); $("#adjuntos").querySelectorAll("[data-q]").forEach(b => b.onclick = () => { adjuntos.splice(+b.dataset.q,1); renderAdjuntos(); }); }
async function leerAdjunto(f){
  const nombre = f.name; const ext = nombre.split(".").pop().toLowerCase();
  if(["txt","md","json","csv"].includes(ext)) return { nombre, tipo:"texto", texto: await f.text() };
  const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });
  if(ext === "pdf") return { nombre, tipo:"pdf", b64 };
  if(["png","jpg","jpeg","webp","gif"].includes(ext)) return { nombre, tipo:"imagen", media: f.type || "image/png", b64 };
  return { nombre, tipo:"texto", texto: "(archivo " + nombre + " no soportado)" };
}
async function enviar(){
  const key = localStorage.getItem(LS_API); if(!key){ sysMsg("Falta la clave de API: ponla en Ajustes → Claude."); return; }
  const txt = $("#chatTxt").value.trim(); if(!txt && !adjuntos.length) return;
  const modelo = $("#modeloChat").value; localStorage.setItem(LS_MODELO, modelo);
  const contenido = [];
  for(const a of adjuntos){ if(a.tipo === "pdf") contenido.push({ type:"document", source:{ type:"base64", media_type:"application/pdf", data:a.b64 }, title:a.nombre }); else if(a.tipo === "imagen") contenido.push({ type:"image", source:{ type:"base64", media_type:a.media, data:a.b64 } }); else contenido.push({ type:"text", text:"Archivo " + a.nombre + ":\n" + a.texto.slice(0,60000) }); }
  contenido.push({ type:"text", text: txt || "(ver adjuntos)" });
  chatMsgs.push({ rol:"user", texto: txt || "(adjuntos)", adj: adjuntos.map(a=>a.nombre), contenido }); adjuntos = []; $("#chatTxt").value = ""; renderChat();
  const pens = document.createElement("div"); pens.className = "pensando"; pens.textContent = "pensando…"; $("#msgs").appendChild(pens); $("#bEnviar").disabled = true; $("#chatEstado").textContent = "";
  try{
    const historial = chatMsgs.slice(-12).map((x, i, arr) => ({ role: x.rol === "user" ? "user" : "assistant", content: (x.rol === "user" && x.contenido && i === arr.length-1) ? x.contenido : (x.rol === "user" ? x.texto : x.bruto || x.texto) }));
    // el estado actual va en el primer mensaje de usuario del envío como contexto fresco
    historial[historial.length-1] = { role:"user", content: [ { type:"text", text: "ESTADO ACTUAL DE LA RAÍZ (JSON):\n" + contextoRaiz() }, ...(Array.isArray(historial[historial.length-1].content) ? historial[historial.length-1].content : [{type:"text", text: historial[historial.length-1].content}]) ] };
    const r = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", headers:{ "content-type":"application/json", "x-api-key": key, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" }, body: JSON.stringify({ model: modelo, max_tokens: 4000, system: SYSTEM, messages: historial }) });
    const j = await r.json(); if(!r.ok) throw new Error((j.error && j.error.message) || r.status);
    const bruto = (j.content||[]).filter(c => c.type === "text").map(c => c.text).join("\n");
    let parsed = null; try{ parsed = JSON.parse(bruto); }catch(e){ const m = bruto.match(/\{[\s\S]*\}/); if(m){ try{ parsed = JSON.parse(m[0]); }catch(e2){} } }
    const respuesta = parsed ? parsed.respuesta : bruto; const cambios = (parsed && Array.isArray(parsed.cambios)) ? parsed.cambios : [];
    chatMsgs.push({ rol:"assistant", texto: respuesta, bruto }); if(chatMsgs.length > 40) chatMsgs = chatMsgs.slice(-40); localStorage.setItem(LS_CHAT, JSON.stringify(chatMsgs.map(x => ({ rol:x.rol, texto:x.texto, bruto:x.bruto, adj:x.adj }))));
    if(j.usage) $("#chatEstado").textContent = (j.usage.input_tokens||0) + " → " + (j.usage.output_tokens||0) + " tokens";
    renderChat(); if(cambios.length) proponer(cambios);
  }catch(e){ console.error(e); sysMsg("Error: " + e.message); }
  finally{ pens.remove(); $("#bEnviar").disabled = false; }
}
function describirOp(o){
  const t = (id) => { const n = nodo(id); return n ? "«" + n.titulo + "»" : id; };
  switch(o.op){
    case "crear_raiz": return "Crear raíz «" + o.titulo + "»";
    case "crear_cuadro": return "Crear cuadro «" + o.titulo + "» en " + t(o.raiz) + (o.plazo ? " · plazo " + fechaCorta(o.plazo) : "");
    case "crear_paso": return "Crear paso «" + o.titulo + "» en " + (String(o.cuadro).startsWith("nuevo:") ? "«" + o.cuadro.slice(6) + "»" : t(o.cuadro)) + (o.plazo ? " · plazo " + fechaCorta(o.plazo) : "");
    case "editar": return "Editar " + t(o.id) + ": " + Object.keys(o.campos||{}).join(", ");
    case "activar": return "Activar " + t(o.id); case "marcar_hecho": return "Marcar hecho " + t(o.id); case "eliminar": return "ELIMINAR " + t(o.id);
    case "mover": return "Mover " + t(o.id) + " a " + t(o.padre); case "nota": return "Nota en " + t(o.id) + ": " + o.texto;
    case "anotar_calendario": return "Calendario " + fechaCorta(o.fecha) + ": " + o.texto; case "capturar": return "Bandeja: " + o.texto;
    case "procesar_bandeja": { const b = itemBandeja(o.id); return "Procesar «" + (b ? b.texto : o.id) + "» → " + o.accion; }
    case "revision": return "Cerrar revisión semanal: " + o.texto;
    default: return "Operación desconocida: " + o.op;
  }
}
function proponer(cambios){
  pendienteOps = cambios; const d = document.createElement("div"); d.className = "propuesta";
  d.innerHTML = `<h4>Cambios propuestos · ${cambios.length}</h4><ul>` + cambios.map(o => `<li class="${o.op==='eliminar'?'err':''}">${esc(describirOp(o))}</li>`).join("") + `</ul><div class="acciones"><button class="btn act" id="bAplicar">Aplicar</button><button class="btn sec" id="bDescartar">Descartar</button></div>`;
  $("#msgs").appendChild(d); $("#msgs").scrollTop = $("#msgs").scrollHeight;
  d.querySelector("#bAplicar").onclick = () => { const res = aplicar(cambios); d.querySelector(".acciones").innerHTML = `<span class="aviso">${res.ok} aplicados${res.err ? " · " + res.err + " con error" : ""}</span>`; pendienteOps = null; guardar(); render(); };
  d.querySelector("#bDescartar").onclick = () => { d.querySelector(".acciones").innerHTML = '<span class="aviso">descartados</span>'; pendienteOps = null; };
}
function aplicar(cambios){
  let ok = 0, err = 0; const nuevos = {}; // "nuevo:titulo" -> id
  for(const o of cambios){ try{
    switch(o.op){
      case "crear_raiz": { const n = nuevaRaiz(o.titulo); nuevos["nuevo:" + o.titulo] = n.id; break; }
      case "crear_cuadro": { const raiz = nuevos[o.raiz] || o.raiz; if(!nodo(raiz)) throw 0; const extra = {}; for(const k of ["hecho_cuando","plazo","inicio","importante"]) if(o[k]!=null) extra[k]=o[k]; const n = nuevoHijo(raiz, o.titulo, extra); nuevos["nuevo:" + o.titulo] = n.id; break; }
      case "crear_paso": { const cu = nuevos[o.cuadro] || o.cuadro; if(!nodo(cu)) throw 0; const extra = {}; for(const k of ["hecho_cuando","plazo","inicio","importante"]) if(o[k]!=null) extra[k]=o[k]; nuevoHijo(cu, o.titulo, extra); break; }
      case "editar": { if(!nodo(o.id)) throw 0; for(const [k,v] of Object.entries(o.campos||{})) if(["titulo","hecho_cuando","plazo","inicio","importante"].includes(k)) editar(o.id, k, v); break; }
      case "activar": if(!activar(o.id)) throw 0; break;
      case "marcar_hecho": if(!nodo(o.id)) throw 0; marcarHecho(o.id, true); break;
      case "eliminar": if(!nodo(o.id)) throw 0; eliminar(o.id, true); break;
      case "mover": moverA(o.id, nuevos[o.padre] || o.padre, (o.posicion||1) - 1); break;
      case "nota": if(!nodo(o.id)) throw 0; addNota(o.id, o.texto); break;
      case "anotar_calendario": datos.eventos.push({ id:"ev" + Date.now().toString(36) + Math.random().toString(36).slice(2,4), fecha:o.fecha, texto:o.texto, nodo: nuevos[o.nodo] || o.nodo || undefined }); break;
      case "capturar": capturar(o.texto); break;
      case "procesar_bandeja": if(!procesar(o.id, o.accion, nuevos[o.arg] || o.arg)) throw 0; break;
      case "revision": datos.revisiones.unshift({ fecha: hoy(), texto: o.texto }); datos.ultimaRevision = hoy(); break;
      default: throw 0;
    } ok++; }catch(e){ err++; console.warn("op fallida", o, e); } }
  return { ok, err };
}

/* ---------- arranque ---------- */
$("#bChat").onclick = abrirChat; $("#bChatMovil").onclick = (e) => { e.preventDefault(); abrirChat(); }; $("#bCerrarChat").onclick = cerrarChat;
$("#bEnviar").onclick = enviar; $("#chatTxt").addEventListener("keydown", e => { if(e.key==="Enter" && (e.ctrlKey || e.metaKey)) enviar(); });
$("#chatFile").onchange = async (e) => { for(const f of e.target.files){ if(f.size > 20*1024*1024){ toast(f.name + " pesa más de 20 MB"); continue; } adjuntos.push(await leerAdjunto(f)); } e.target.value = ""; renderAdjuntos(); };
$("#modeloChat").onchange = () => localStorage.setItem(LS_MODELO, $("#modeloChat").value);
$("#bGuardarApi").onclick = () => { const k = $("#apiKey").value.trim(); if(k) localStorage.setItem(LS_API, k); else localStorage.removeItem(LS_API); localStorage.setItem(LS_MODELO, $("#modelo").value); toast(k ? "Clave guardada en este dispositivo" : "Clave borrada"); };
$("#bBorrarChat").onclick = () => { chatMsgs = []; localStorage.removeItem(LS_CHAT); renderChat(); toast("Conversación vaciada"); };
$("#bArchivo").onclick = vincularArchivo; $("#bDescargar").onclick = descargar;
$("#bDropbox").onclick = () => { if(localStorage.getItem(LS_RT)){ if(confirm("¿Desconectar Dropbox en este dispositivo?")){ localStorage.removeItem(LS_RT); location.reload(); } } else dbxConectar(); };
$("#bRecargar").onclick = async () => { localStorage.removeItem(LS_DATOS); await cargarInicial(); if(datos) migrar(); render(); };
$("#bCerrar").onclick = () => { cerrarPanel(); render(); }; $("#velo").onclick = () => { cerrarPanel(); render(); };
$("#bCapturar").onclick = () => { const t=$("#bandejaTxt").value.trim(); if(t){ capturar(t); $("#bandejaTxt").value=""; guardar(); render(); } };
$("#bandejaTxt").addEventListener("keydown", e => { if(e.key==="Enter") $("#bCapturar").click(); });

(async () => {
  const q = new URLSearchParams(location.search);
  if(q.get("code")){ try{ await dbxCanjearCodigo(q.get("code")); toast("Dropbox conectado"); }catch(e){ alert("Error al conectar Dropbox: " + e.message); } history.replaceState(null,"",location.pathname); }
  await cargarInicial(); if(datos) migrar();
  ir(sessionStorage.getItem("raiz.vista") || "inicio", false);
  if("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(()=>{});
})();
