import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── CAMPANITA Y "REQUIERE ATENCIÓN" (13/10/2026) ─────────────────
// Los avisos del personal ya se guardaban en /crm_users/{uid}/notificaciones
// (push.js → enviarPushCRM) pero no había dónde verlos: si el push no
// llegaba, se perdían. Acá se muestran en vivo, con dos pestañas:
//   · Requiere atención: avisos con `atencion: true` sin resolver (alta
//     self-serve, mora, suspensión, débito cancelado, baja, Factura C con
//     error, prueba .OS vencida sin tarjeta). Se marcan "resuelto" con una
//     nota de seguimiento.
//   · Todos: los últimos avisos, leídos o no.
// Cada dirección muestra lo suyo según `ambito`: negocio.finnix.com.ar los
// de 'negocio'; el CRM del estudio, el resto. "Ver" lleva al cliente (su
// plan en el panel del negocio, su ficha en el CRM) o al panel .OS.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function fechaDe(n) {
  const f = n.fecha;
  if (!f) return null;
  if (typeof f.toDate === 'function') return f.toDate();
  const d = new Date(f);
  return Number.isNaN(d.getTime()) ? null : d;
}
function haceCuanto(d) {
  if (!d) return '';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.round(h / 24);
  if (dias < 7) return `hace ${dias} día${dias === 1 ? '' : 's'}`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

let E = null;
let escuchando = false;

export function initCampanita({ db, uid, modoNegocio }) {
  if (E?.cortar) E.cortar();
  E = { db, uid, modoNegocio, avisos: [], pestania: 'atencion', abierta: false, cortar: null, resolviendo: null };

  const btn = document.getElementById('btn-campanita');
  const panel = document.getElementById('campanita-panel');
  if (!btn || !panel) return;
  btn.style.display = '';
  btn.onclick = (e) => { e.stopPropagation(); abrir(E.abierta ? null : E.pestania); };
  panel.onclick = clickPanel;
  // Los listeners del documento una sola vez (un nuevo login vuelve a llamar acá).
  if (!escuchando) {
    escuchando = true;
    document.addEventListener('click', (e) => {
      if (E?.abierta && !panel.contains(e.target) && !btn.contains(e.target)) cerrar();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && E?.abierta) cerrar(); });
  }
  window._campanitaAbrir = (pestania) => abrir(pestania || 'atencion');
  window._campanitaCortar = () => { E?.cortar?.(); E.cortar = null; cerrar(); btn.style.display = 'none'; };

  try {
    const q = query(collection(db, 'crm_users', uid, 'notificaciones'), orderBy('fecha', 'desc'), limit(150));
    E.cortar = onSnapshot(q, (snap) => {
      E.avisos = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
        .filter((n) => (modoNegocio ? n.ambito === 'negocio' : n.ambito !== 'negocio'));
      pintarContador();
      if (E.abierta) pintarPanel();
    }, (err) => console.error('campanita:', err));
  } catch (e) {
    console.error('campanita:', e);
  }
}

const pendientesAtencion = () => E.avisos.filter((n) => n.atencion && !n.resuelta);

function pintarContador() {
  const sinLeer = E.avisos.filter((n) => !n.leida).length;
  const atencion = pendientesAtencion().length;
  const badge = document.getElementById('campanita-badge');
  badge.textContent = sinLeer > 99 ? '99+' : String(sinLeer);
  badge.hidden = sinLeer === 0;
  document.getElementById('btn-campanita').setAttribute('aria-label',
    `Avisos: ${sinLeer} sin leer, ${atencion} requieren atención`);
  const pill = document.getElementById('negocio-atencion');
  if (pill) {
    pill.hidden = atencion === 0;
    pill.textContent = `⚠ ${atencion} requiere${atencion === 1 ? '' : 'n'} atención`;
  }
}

function abrir(pestania) {
  const panel = document.getElementById('campanita-panel');
  if (!pestania) { cerrar(); return; }
  E.pestania = pestania;
  E.abierta = true;
  panel.hidden = false;
  pintarPanel();
  // Lo que se ve se da por leído (un momento después, para que el punto
  // de "nuevo" alcance a verse).
  clearTimeout(E.timerLeer);
  E.timerLeer = setTimeout(marcarLeidos, 1500);
}
function cerrar() {
  E.abierta = false;
  E.resolviendo = null;
  document.getElementById('campanita-panel').hidden = true;
}

async function marcarLeidos() {
  const sinLeer = E.avisos.filter((n) => !n.leida).slice(0, 400);
  if (!sinLeer.length) return;
  try {
    const lote = writeBatch(E.db);
    sinLeer.forEach((n) => lote.update(doc(E.db, 'crm_users', E.uid, 'notificaciones', n.id), { leida: true }));
    await lote.commit();
  } catch (e) {
    console.error('campanita: marcar leídos', e);
  }
}

function pintarPanel() {
  const panel = document.getElementById('campanita-panel');
  const atencion = pendientesAtencion();
  const lista = E.pestania === 'atencion' ? atencion : E.avisos.slice(0, 60);
  panel.innerHTML = `
    <div class="camp-head">
      <b>Avisos${E.modoNegocio ? ' del negocio' : ''}</b>
      <button type="button" class="camp-x" data-camp="cerrar" aria-label="Cerrar">✕</button>
    </div>
    <div class="camp-tabs" role="tablist">
      <button type="button" role="tab" class="camp-tab ${E.pestania === 'atencion' ? 'activo' : ''}" data-camp-tab="atencion">Requiere atención${atencion.length ? ` <span class="camp-num">${atencion.length}</span>` : ''}</button>
      <button type="button" role="tab" class="camp-tab ${E.pestania === 'todos' ? 'activo' : ''}" data-camp-tab="todos">Todos</button>
    </div>
    <div class="camp-lista">
      ${lista.length ? lista.map(item).join('') : `<div class="camp-vacio">${E.pestania === 'atencion' ? 'Nada pendiente. 👌' : 'Todavía no hay avisos.'}</div>`}
    </div>`;
}

function item(n) {
  const pendiente = n.atencion && !n.resuelta;
  const destino = n.cliente_id || n.commerce_id;
  return `
    <div class="camp-item ${n.leida ? '' : 'nuevo'} ${pendiente ? 'pend' : ''}">
      <div class="camp-item-top">
        <span class="camp-titulo">${esc(n.titulo)}</span>
        <span class="camp-fecha">${esc(haceCuanto(fechaDe(n)))}</span>
      </div>
      ${n.cuerpo ? `<div class="camp-cuerpo">${esc(n.cuerpo)}</div>` : ''}
      ${n.resuelta ? `<div class="camp-resuelto">✓ Resuelto${n.seguimiento ? ': ' + esc(n.seguimiento) : ''}</div>` : ''}
      ${E.resolviendo === n.id ? `
        <div class="camp-resolver">
          <textarea class="fx-input" id="camp-nota" rows="2" maxlength="300" placeholder="¿Qué hiciste? (opcional)"></textarea>
          <div class="camp-acc">
            <button type="button" class="fx-btn-ghost" data-camp="cancelar">Cancelar</button>
            <button type="button" class="fx-btn-primary" data-camp="guardar" data-id="${esc(n.id)}">Marcar resuelto</button>
          </div>
        </div>` : `
        <div class="camp-acc">
          ${destino ? `<button type="button" class="fx-btn-ghost" data-camp="ver" data-cliente="${esc(n.cliente_id || '')}" data-comercio="${esc(n.commerce_id || '')}">Ver →</button>` : ''}
          ${pendiente ? `<button type="button" class="fx-btn-ghost" data-camp="resolver" data-id="${esc(n.id)}">✓ Resuelto</button>` : ''}
        </div>`}
    </div>`;
}

async function clickPanel(e) {
  e.stopPropagation();
  const tab = e.target.closest('[data-camp-tab]');
  if (tab) { E.pestania = tab.dataset.campTab; E.resolviendo = null; pintarPanel(); return; }
  const b = e.target.closest('[data-camp]');
  if (!b) return;
  const accion = b.dataset.camp;
  if (accion === 'cerrar') { cerrar(); return; }
  if (accion === 'resolver') { E.resolviendo = b.dataset.id; pintarPanel(); document.getElementById('camp-nota')?.focus(); return; }
  if (accion === 'cancelar') { E.resolviendo = null; pintarPanel(); return; }
  if (accion === 'guardar') {
    const nota = (document.getElementById('camp-nota')?.value || '').trim().slice(0, 300);
    b.disabled = true;
    try {
      await updateDoc(doc(E.db, 'crm_users', E.uid, 'notificaciones', b.dataset.id), {
        resuelta: true, resuelta_en: new Date().toISOString(), seguimiento: nota || null, leida: true,
      });
      E.resolviendo = null;
      window._toast?.('Marcado como resuelto', 'ok');
    } catch (err) {
      console.error(err);
      b.disabled = false;
      window._toast?.(window._mensajeError ? window._mensajeError(err, 'No se pudo guardar') : 'No se pudo guardar', 'error');
    }
    return;
  }
  if (accion === 'ver') {
    cerrar();
    const cliente = b.dataset.cliente;
    if (cliente) {
      if (E.modoNegocio) window.irAGestionPlan?.(cliente);
      else window.seleccionarCliente?.(cliente);
    } else if (b.dataset.comercio) {
      window.irOnboardingComercio?.();
    }
  }
}
