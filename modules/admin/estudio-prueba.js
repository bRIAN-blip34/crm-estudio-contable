// ── ESTUDIO EN PRUEBA (26/10/2026, functions/lib/estudios-prueba.js) ─────
// Para un estudio invitado a probar el CRM:
//  - barra arriba con los días que quedan, "Recomendá Finnix" y el recorrido;
//  - si la prueba venció o está pausada, una pantalla que lo dice (los datos
//    quedan guardados; la dueña la extiende o la activa desde Finnix — mi
//    negocio → Estudios). Un super_admin mirando ese estudio nunca se bloquea.
//  - "Recomendá Finnix": su link de Terminal OS / Urban.OS / Finnix App y lo que
//    lleva ganado (callable misReferidosEstudio: nombres y comisión, nunca
//    ventas de los comercios).

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pesos = (n) => '$ ' + new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WHATSAPP_FINNIX = '5493718415249';

export function diasRestantes(estudio, ahora = new Date()) {
  if (!estudio?.prueba_hasta) return null;
  return Math.ceil((new Date(estudio.prueba_hasta).getTime() - ahora.getTime()) / 86400000);
}

export function aplicarEstadoEstudio({ estudio, rol, nombre, signOut }) {
  document.getElementById('ep-barra')?.remove();
  document.getElementById('ep-bloqueo')?.remove();
  if (!estudio || estudio.id === 'insfran') return;
  const dias = diasRestantes(estudio);
  const terminada = ['vencida', 'pausada'].includes(estudio.estado) || (estudio.estado === 'prueba' && dias !== null && dias <= 0);
  if (terminada && rol !== 'super_admin') {
    const msg = encodeURIComponent(`Hola, soy ${nombre || ''} de ${estudio.nombre || 'mi estudio'}. Quiero seguir usando Finnix.`);
    document.body.insertAdjacentHTML('beforeend', `
      <div id="ep-bloqueo" role="dialog" aria-modal="true" aria-labelledby="ep-bloqueo-titulo">
        ${ESTILOS}
        <div class="ep-bloqueo-caja">
          <div class="ep-bloqueo-icono">⏸</div>
          <h2 id="ep-bloqueo-titulo">${estudio.estado === 'pausada' ? 'Tu estudio está en pausa' : 'Terminó tu prueba de Finnix'}</h2>
          <p>Tus clientes y todo lo que cargaste quedan guardados. Escribinos y lo dejamos andando de nuevo.</p>
          <a class="ep-btn" href="https://wa.me/${WHATSAPP_FINNIX}?text=${msg}" target="_blank" rel="noopener">Escribir por WhatsApp</a>
          <button type="button" class="ep-btn-sec" data-ep-salir>Cerrar sesión</button>
        </div>
      </div>`);
    document.querySelector('[data-ep-salir]').addEventListener('click', () => signOut?.());
    return;
  }
  if (estudio.estado !== 'prueba') return;
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  topbar.insertAdjacentHTML('afterend', `
    <div id="ep-barra" role="status">
      ${ESTILOS}
      <span class="ep-barra-txt">🧪 Prueba gratis de Finnix · ${dias === 1 ? 'te queda 1 día' : `te quedan ${dias} días`}</span>
      ${['admin', 'contador'].includes(rol) ? '<button type="button" class="ep-barra-btn" data-ep-recomendar>💸 Recomendá Terminal OS y ganá</button>' : ''}
      ${rol === 'admin' ? '<button type="button" class="ep-barra-btn ep-barra-sec" data-ep-recorrido>🧭 Ver el recorrido</button>' : ''}
    </div>`);
  document.querySelector('[data-ep-recomendar]')?.addEventListener('click', () => abrirRecomendar());
  document.querySelector('[data-ep-recorrido]')?.addEventListener('click', () => window._iniciarRecorrido?.(true));
}

export async function abrirRecomendar() {
  document.getElementById('ep-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div id="ep-modal" role="dialog" aria-modal="true" aria-labelledby="ep-modal-titulo">
      ${ESTILOS}
      <div class="ep-modal-caja">
        <button type="button" class="ep-cerrar" data-ep-cerrar aria-label="Cerrar">✕</button>
        <h2 id="ep-modal-titulo">Recomendá Finnix y ganá</h2>
        <div id="ep-modal-cuerpo"><div class="ep-cargando">Cargando…</div></div>
      </div>
    </div>`);
  const modal = document.getElementById('ep-modal');
  const cerrar = () => modal.remove();
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-ep-cerrar]')) cerrar(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { cerrar(); document.removeEventListener('keydown', esc); } });
  let r;
  try {
    r = (await window._httpsCallable(window._functions, 'misReferidosEstudio')({})).data;
  } catch (e) {
    console.error(e);
    document.getElementById('ep-modal-cuerpo').innerHTML = `<p class="ep-error">${esc(window._mensajeError ? window._mensajeError(e, 'No se pudo cargar') : 'No se pudo cargar')}</p>`;
    return;
  }
  const mensaje = `Hola! Te recomiendo Terminal OS para tu comercio: stock, caja, fiado y factura de ARCA en la tablet. Tenés 30 días gratis para probarla: ${r.links.terminal}`;
  const links = [
    ['Terminal OS (almacenes, kioscos y comercios)', r.links.terminal],
    ['Urban.OS (tiendas de ropa)', r.links.urban],
  ];
  document.getElementById('ep-modal-cuerpo').innerHTML = `
    <p class="ep-lead">Por cada comercio que se suscriba con tu link ganás el <b>${esc(r.pct)}%</b> de lo que paga cada mes, mientras siga pagando. Te lo liquidamos por mes. No ves sus ventas: solo quién se sumó y tu comisión.</p>
    <div class="ep-totales">
      <div><b>${pesos(r.totales.a_pagar)}</b><span>a cobrar</span></div>
      <div><b>${pesos(r.totales.pagada)}</b><span>ya cobrado</span></div>
      <div><b>${r.recomendados.length}</b><span>comercios recomendados</span></div>
    </div>
    <h3>Tus links</h3>
    ${links.map(([t, url]) => `
      <div class="ep-link">
        <div><div class="ep-link-t">${esc(t)}</div><code>${esc(url)}</code></div>
        <button type="button" class="ep-btn-sec" data-ep-copiar="${esc(url)}">Copiar</button>
      </div>`).join('')}
    <a class="ep-btn" href="https://wa.me/?text=${encodeURIComponent(mensaje)}" target="_blank" rel="noopener">Mandar por WhatsApp</a>
    <h3>Comercios que recomendaste</h3>
    ${r.recomendados.length ? `<table class="ep-tabla"><thead><tr><th>Comercio</th><th>Estado</th><th class="num">Tu comisión</th></tr></thead><tbody>
      ${r.recomendados.map((x) => `<tr><td>${esc(x.nombre || 'Comercio')}</td><td>${x.estado === 'pagando' ? '✅ Pagando' : '⏳ En prueba'}</td><td class="num">${pesos(x.comision_total)}</td></tr>`).join('')}
    </tbody></table>` : '<p class="ep-vacio">Todavía no se sumó ningún comercio con tu link. Mandáselo a tus clientes con negocio: tienen 30 días gratis.</p>'}
    ${r.meses.length ? `<h3>Por mes</h3><div class="ep-meses">${r.meses.map((m) => `<div><span>${MESES[Number(m.periodo.slice(4)) - 1]} ${m.periodo.slice(0, 4)}</span><b>${pesos(m.comision)}</b></div>`).join('')}</div>` : ''}`;
  document.getElementById('ep-modal-cuerpo').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ep-copiar]');
    if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.epCopiar); b.textContent = '✓ Copiado'; setTimeout(() => { b.textContent = 'Copiar'; }, 2000); } catch { window._toast?.(b.dataset.epCopiar, 'ok'); }
  });
}

const ESTILOS = `<style>
  #ep-barra { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 20px; background:linear-gradient(90deg, rgba(47,111,237,.18), rgba(47,111,237,.06)); border-bottom:1px solid var(--border); font-size:13px; color:var(--text); }
  .ep-barra-txt { font-weight:600; margin-right:auto; }
  .ep-barra-btn { background:var(--accent); color:#fff; border:0; border-radius:8px; padding:6px 12px; font:inherit; font-size:12.5px; font-weight:600; cursor:pointer; }
  .ep-barra-sec { background:transparent; color:var(--text); border:1px solid var(--border); }
  #ep-bloqueo, #ep-modal { position:fixed; inset:0; z-index:9000; background:rgba(5,8,15,.82); display:flex; align-items:center; justify-content:center; padding:16px; }
  .ep-bloqueo-caja, .ep-modal-caja { background:var(--surface); border:1px solid var(--border); border-radius:18px; width:100%; color:var(--text); }
  .ep-bloqueo-caja { max-width:440px; padding:32px 28px; text-align:center; }
  .ep-bloqueo-icono { font-size:40px; }
  .ep-bloqueo-caja h2 { margin:10px 0 8px; font-size:20px; }
  .ep-bloqueo-caja p { color:var(--text-2); margin-bottom:18px; }
  .ep-modal-caja { max-width:620px; max-height:90vh; overflow:auto; padding:24px; position:relative; }
  .ep-modal-caja h2 { font-size:19px; margin-bottom:8px; padding-right:30px; }
  .ep-modal-caja h3 { font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-3); margin:18px 0 8px; }
  .ep-cerrar { position:absolute; top:14px; right:14px; background:none; border:0; color:var(--text-2); font-size:18px; cursor:pointer; }
  .ep-lead { color:var(--text-2); font-size:13.5px; }
  .ep-totales { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px; margin-top:14px; }
  .ep-totales div { background:var(--surface2); border-radius:12px; padding:12px; }
  .ep-totales b { display:block; font-size:17px; }
  .ep-totales span { font-size:12px; color:var(--text-3); }
  .ep-link { display:flex; gap:10px; align-items:center; justify-content:space-between; background:var(--surface2); border-radius:10px; padding:10px 12px; margin-bottom:8px; }
  .ep-link-t { font-size:12.5px; font-weight:600; }
  .ep-link code { font-size:12px; color:var(--text-2); word-break:break-all; }
  .ep-btn { display:block; width:100%; text-align:center; text-decoration:none; background:var(--accent); color:#fff; border:0; border-radius:10px; padding:11px; font:inherit; font-weight:700; cursor:pointer; margin-top:6px; }
  .ep-btn-sec { background:transparent; color:var(--text); border:1px solid var(--border); border-radius:8px; padding:7px 12px; font:inherit; font-size:12.5px; cursor:pointer; flex:none; }
  .ep-bloqueo-caja .ep-btn-sec { width:100%; margin-top:10px; padding:10px; }
  .ep-tabla { width:100%; border-collapse:collapse; font-size:13px; }
  .ep-tabla th { text-align:left; color:var(--text-3); font-weight:600; font-size:11.5px; padding:6px 4px; border-bottom:1px solid var(--border); }
  .ep-tabla td { padding:8px 4px; border-bottom:1px solid var(--border); }
  .ep-tabla .num { text-align:right; }
  .ep-meses { display:grid; gap:6px; }
  .ep-meses div { display:flex; justify-content:space-between; font-size:13px; }
  .ep-vacio, .ep-cargando { color:var(--text-2); font-size:13px; }
  .ep-error { color:var(--danger); }
  @media (max-width:560px) { .ep-totales { grid-template-columns:1fr 1fr; } #ep-barra { padding:8px 14px; } }
</style>`;
