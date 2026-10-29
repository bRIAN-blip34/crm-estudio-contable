import { collection, collectionGroup, getDocs, query, where, orderBy, doc, setDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── PANEL DE ADMINISTRADOR / PANEL DEL CONTADOR ───────────────────
// contadorUid: null para admin (vista global, todos los clientes, tabla
// "por contador", botones de carga masiva) — o el uid de un contador para
// que vea la misma estructura de KPIs/listas pero acotada a SU propia
// cartera (mismo filtro contador_uid que ya usa cargarClientes() en
// index.html para la sidebar). La tabla "por contador" y los botones de
// carga masiva (operan sobre todos los clientes de una) quedan admin-only.
// Todo lo que se interpola en innerHTML y viene de afuera (el formulario
// público, o el propio cliente desde finnix-app) pasa por acá. Segunda capa:
// la Cloud Function ya limpia en la entrada, pero esto cubre también lo que
// se guardó ANTES de esa limpieza.
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export async function renderDashboardGeneral(container, db, contadorUid = null) {
  // Cobrar honorarios con Mercado Pago usa la cuenta de Finnix: solo el estudio
  // de Finnix. Un estudio en prueba (26/10/2026) los registra y entrega el
  // comprobante sin valor fiscal.
  const COBRO_MP_HONORARIOS = (window._estudioId || 'insfran') === 'insfran';
  container.innerHTML = `
    <div class="dg-wrap">

      <div class="dg-header">
        <div>
          <div class="dg-titulo">${contadorUid ? 'Mi panel' : 'Panel de administrador'}</div>
          <div class="dg-subtitulo">${contadorUid ? 'Vista de tu cartera de clientes' : 'Vista global del estudio — contadores, clientes y pagos'}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap">
          ${contadorUid ? '' : `
            <button type="button" class="fx-btn-ghost" onclick="window._dgAbrirImportarComprobantes()">
              ↑ Cargar comprobantes masivo
            </button>
            <button type="button" class="fx-btn-ghost" onclick="window._dgAbrirImportarDDJJ()">
              ↑ Cargar DDJJ masivo
            </button>
            <button type="button" class="fx-btn-ghost" onclick="window._dgAbrirImportarDeudas()">
              ↑ Cargar deudas
            </button>
          `}
          <button type="button" class="fx-btn-ghost" onclick="window._dgExportarHonorarios()">
            ↓ Exportar honorarios (Excel)
          </button>
          <select id="dg-periodo" class="dg-select" onchange="window._dgCargar()">
            ${generarOpcionesPeriodos(1)}
          </select>
        </div>
      </div>

      <div class="dg-loading" id="dg-loading">Cargando…</div>

      <div id="dg-contenido" style="display:none">

        <!-- Onboarding — solo aparece con el estudio recién creado, sin
             ningún cliente cargado todavía (ver cargar(), clientes.length
             === 0). Desaparece solo apenas se carga el primer cliente, no
             hace falta cerrarlo a mano. Admin-only (contadorUid null) —
             un contador nunca crea el estudio, no tiene sentido para él. -->
        ${contadorUid ? '' : `
        <div class="dg-banner-onboarding" id="dg-banner-onboarding" style="display:none">
          <div class="dg-onboarding-title">👋 Bienvenido a tu CRM</div>
          <p class="dg-onboarding-sub">Todavía no hay ningún cliente cargado — estos son los primeros pasos:</p>
          <div class="dg-onboarding-steps">
            <button type="button" class="dg-onboarding-step" onclick="window.abrirAltaCliente()">
              <span class="dg-onboarding-step-num">1</span>
              <span class="dg-onboarding-step-txt">
                <strong>Cargá tu primer cliente</strong>
                <span>Datos fiscales, contacto y acceso a la app — 3 pasos, desde el sidebar</span>
              </span>
            </button>
            <button type="button" class="dg-onboarding-step" onclick="window.abrirUsuariosCRM()">
              <span class="dg-onboarding-step-num">2</span>
              <span class="dg-onboarding-step-txt">
                <strong>Invitá a tu equipo</strong>
                <span>Sumá contadores y administrativos desde "Usuarios", arriba a la derecha</span>
              </span>
            </button>
            <button type="button" class="dg-onboarding-step" onclick="window._abrirMFA()">
              <span class="dg-onboarding-step-num">3</span>
              <span class="dg-onboarding-step-txt">
                <strong>Activá la verificación en dos pasos</strong>
                <span>Opcional — protege tu cuenta con un código por SMS al iniciar sesión</span>
              </span>
            </button>
          </div>
        </div>
        `}

        <!-- Para hoy — lo único que hay que hacer, derivado de los mismos
             datos que ya se cargaron para los KPIs. Reemplaza al banner de
             "mensajes sin resolver", que avisaba de una sola de las cuatro
             cosas y dejaba al resto del panel sin ningún punto de entrada.
             Cada tarjeta lleva a la sección donde se resuelve. -->
        <div class="dg-foco" id="dg-foco" role="status"></div>

        <!-- KPIs globales -->
        <div class="dg-kpis" id="dg-kpis"></div>

        <!-- Comunicaciones — kanban por estado (Iniciados/Pendientes/Finalizados) -->
        <div class="dg-seccion dg-acc-violet" id="dg-seccion-comms">
          <div class="dg-comms-head">
            <div class="dg-comms-head-left">
              <div class="dg-seccion-titulo">Comunicaciones</div>
              <span class="dg-comms-count" id="dg-comms-count" aria-live="polite"></span>
            </div>
          </div>
          <div class="dg-kanban" id="dg-kanban"></div>
        </div>

        <!-- Honorarios: buscar cliente, marcar pagado, generar comprobante
             — acción del día a día, buscada por texto en vez de tener que
             entrar a la ficha completa del cliente. Sobre detalles, ya
             cargado en memoria (honorarios de TODOS los períodos, no solo
             el elegido arriba — ver cargarDetallesGlobal/PorCliente, esa
             query no filtra por período) — sin queries nuevas. -->
        <div class="dg-seccion dg-acc-success" id="dg-seccion-honorarios">
          <div class="dg-seccion-titulo">Honorarios — buscar cliente y registrar pago</div>
          <input type="text" id="dg-honbusq-input" class="dg-select" style="width:100%;max-width:420px"
                 placeholder="Buscar por nombre o CUIT…" oninput="window._dgBuscarHonorarios()"/>
          <div id="dg-honbusq-resultados">
            <div class="dg-empty">Escribí el nombre o el CUIT de un cliente para ver sus honorarios,
              marcarlos cobrados y generar el comprobante.</div>
          </div>
        </div>

        <!-- Histórico de cobros -->
        <div class="dg-seccion dg-acc-accent">
          <div class="dg-seccion-titulo">Histórico de cobros — últimos períodos</div>
          <div class="dg-historico" id="dg-historico"></div>
        </div>

        ${contadorUid ? '' : `
        <!-- Por contador -->
        <div class="dg-seccion dg-acc-teal">
          <div class="dg-seccion-titulo">Por contador asignado — click para ver detalle</div>
          <div class="dg-tabla-wrap">
            <table class="dg-tabla">
              <thead>
                <tr>
                  <th>Contador</th>
                  <th class="num">Clientes</th>
                  <th class="num">Liq. pend.</th>
                  <th class="num">Liq. present.</th>
                  <th class="num">Venc. vencidos</th>
                  <th class="num">Venc. próx. 7d</th>
                  <th class="num">Consultas s/resp.</th>
                </tr>
              </thead>
              <tbody id="dg-tbody-contadores"></tbody>
            </table>
          </div>
        </div>
        `}

        <!-- Clientes sin comprobantes — colapsable: con cientos de clientes,
             la lista entera acá sería más larga que el resto del dashboard
             junto. Arranca cerrada, mostrando solo la cantidad. -->
        <div class="dg-seccion dg-acc-warn" id="dg-seccion-sin-cbte">
          <button type="button" class="dg-seccion-toggle" id="dg-toggle-sin-cbte"
                  onclick="window._dgToggleSinCbte()" aria-expanded="false" aria-controls="dg-lista-sin-cbte">
            <span class="dg-seccion-titulo">Clientes sin comprobantes cargados este período</span>
            <span class="dg-seccion-toggle-right">
              <span class="dg-seccion-count" id="dg-count-sin-cbte">0</span>
              <span class="dg-seccion-chevron" id="dg-chevron-sin-cbte">▸</span>
            </span>
          </button>
          <div class="dg-lista" id="dg-lista-sin-cbte" style="display:none"></div>
        </div>

        <!-- Clientes con vencimientos vencidos -->
        <div class="dg-seccion dg-acc-danger" id="dg-seccion-venc">
          <div class="dg-seccion-titulo">Clientes con vencimientos vencidos</div>
          <div class="dg-lista" id="dg-lista-venc-vencidos"></div>
        </div>

      </div>
    </div>

    <!-- Modal detalle por contador -->
    <div id="dg-detalle-modal-bg" style="display:none" onclick="window._dgDetalleCerrar(event)">
      <div class="dg-detalle-modal" onclick="event.stopPropagation()">
        <div class="dg-detalle-header">
          <span id="dg-detalle-titulo">Contador</span>
          <button onclick="window._dgDetalleCerrar()" style="color:var(--text-2);font-size:18px">✕</button>
        </div>
        <div class="dg-detalle-body" id="dg-detalle-body"></div>
      </div>
    </div>

    <style>
      .dg-wrap { display:flex; flex-direction:column; gap:20px; }
      .dg-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; }
      .dg-titulo { font-size:22px; font-weight:600; letter-spacing:-0.3px; }
      .dg-subtitulo { font-size:13px; color:var(--text-2); margin-top:2px; }
      .dg-select {
        background:var(--surface2); border:1px solid var(--border);
        border-radius:8px; padding:8px 12px; color:var(--text);
        font-size:13px; font-family:var(--sans); outline:none;
      }
      .dg-loading { color:var(--text-3); font-size:13px; padding:32px; text-align:center; }

      /* Onboarding del estudio recién creado (ver alta-estudio.js) — se
         suma al vocabulario visual de --accent-dim/--teal ya usado en el
         resto del dashboard, sin degradados nuevos. */
      .dg-banner-onboarding {
        background:var(--accent-dim); border:1px solid var(--accent);
        border-radius:12px; padding:20px 22px; display:flex; flex-direction:column; gap:14px;
      }
      .dg-onboarding-title { font-size:16px; font-weight:700; color:var(--accent-2); }
      .dg-onboarding-sub { font-size:13px; color:var(--text-2); margin:0; }
      .dg-onboarding-steps {
        display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;
      }
      .dg-onboarding-step {
        display:flex; align-items:flex-start; gap:12px; text-align:left;
        background:var(--surface); border:1px solid var(--border); border-radius:10px;
        padding:14px 16px; cursor:pointer; font-family:var(--sans); transition:border-color .15s;
      }
      .dg-onboarding-step:hover { border-color:var(--accent); }
      .dg-onboarding-step-num {
        width:24px; height:24px; border-radius:999px; flex-shrink:0;
        background:var(--accent); color:#fff; font-size:12px; font-weight:700;
        display:flex; align-items:center; justify-content:center;
      }
      .dg-onboarding-step-txt { display:flex; flex-direction:column; gap:3px; }
      .dg-onboarding-step-txt strong { font-size:13px; color:var(--text); }
      .dg-onboarding-step-txt span { font-size:11.5px; color:var(--text-2); line-height:1.4; }

      /* Banner de mensajes sin resolver (iniciados + pendientes) —
         visibilidad inmediata del estado del sistema, arriba de todo, en
         vez de un puntito que solo se ve si el cliente puntual está en
         pantalla. Antes usaba tintes de #1A5C9E (accent viejo, tema
         claro) hardcodeados — con el tema oscuro esos tintes quedaban
         casi invisibles y el texto (#0f3f6e, azul oscuro) ilegible sobre
         fondo oscuro. Ahora todo sale de --accent/--accent-2/--accent-dim
         (ya actualizados al tema oscuro en index.html). */
      /* ── PARA HOY ────────────────────────────────────────────────
         Lo primero que se ve al entrar: qué requiere acción hoy y dónde
         se resuelve. Solo aparece lo que tiene algo pendiente — con todo
         al día queda una sola tarjeta verde, no cuatro ceros. */
      .dg-foco {
        background:var(--surface); border:1px solid var(--border);
        border-radius:14px; padding:16px 18px 18px;
        display:flex; flex-direction:column; gap:12px;
        position:relative; overflow:hidden;
      }
      /* Filito de color arriba: el panel entero arranca con una señal de
         urgencia antes de leer un solo número. */
      .dg-foco::before {
        content:""; position:absolute; inset:0 0 auto 0; height:3px;
        background:linear-gradient(90deg,var(--danger),var(--warn),var(--accent));
      }
      .dg-foco.esta-al-dia::before { background:linear-gradient(90deg,var(--success),var(--teal)); }
      .dg-foco-head { display:flex; align-items:baseline; gap:10px; }
      .dg-foco-titulo { font-size:15px; font-weight:700; letter-spacing:-0.2px; }
      .dg-foco-sub { font-size:12px; color:var(--text-3); }
      .dg-foco-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(215px,1fr)); gap:10px; }
      .dg-foco-card {
        display:flex; align-items:center; gap:12px; text-align:left;
        background:var(--surface2); border:1px solid var(--border);
        border-left:3px solid var(--dg-foco-color,var(--accent));
        border-radius:10px; padding:12px 14px; cursor:pointer;
        font-family:var(--sans); color:inherit; width:100%;
        transition:background .12s, border-color .12s, transform .12s;
      }
      .dg-foco-card:hover { background:var(--surface3); transform:translateY(-1px); }
      .dg-foco-card:focus-visible { outline:2px solid var(--accent-2); outline-offset:2px; }
      .dg-foco-card.urgente { --dg-foco-color:var(--danger); }
      .dg-foco-card.avisa   { --dg-foco-color:var(--warn); }
      .dg-foco-card.info    { --dg-foco-color:var(--accent); }
      .dg-foco-icon {
        width:34px; height:34px; border-radius:10px; flex-shrink:0;
        display:flex; align-items:center; justify-content:center;
        background:color-mix(in srgb, var(--dg-foco-color) 18%, transparent);
        color:var(--dg-foco-color);
      }
      .dg-foco-icon svg { width:17px; height:17px; }
      .dg-foco-txt { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
      .dg-foco-valor {
        font-family:var(--mono); font-size:19px; font-weight:600; line-height:1.15;
        color:var(--text); font-variant-numeric:tabular-nums;
      }
      .dg-foco-label {
        font-size:12px; color:var(--text-2); line-height:1.35;
        display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
      }
      .dg-foco-flecha { color:var(--text-3); font-size:14px; flex-shrink:0; }
      .dg-foco-card:hover .dg-foco-flecha { color:var(--dg-foco-color); }
      .dg-foco-ok {
        display:flex; align-items:center; gap:12px;
        font-size:13px; color:var(--text-2);
      }
      .dg-foco-ok .dg-foco-icon { --dg-foco-color:var(--success); }

      /* Comunicaciones */
      .dg-comms-head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .dg-comms-head-left { display:flex; align-items:center; gap:10px; }
      .dg-comms-count {
        font-family:var(--mono); font-size:11px; font-weight:600; color:var(--accent-2);
        background:var(--accent-dim); padding:2px 8px; border-radius:999px;
        font-variant-numeric:tabular-nums;
      }

      /* Kanban de comunicaciones — 3 columnas por estado (Iniciados/
         Pendientes/Finalizados). estado se guarda en el doc de la
         consulta (ver inferirEstadoConsulta más abajo, retrocompatible
         con consultas viejas que no tienen el campo). */
      .dg-kanban { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
      .dg-kcol { background:var(--surface); border:1px solid var(--border); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; min-width:0; }
      /* Encabezado de columna: hasta el 31/08/2026 era un bloque de color
         saturado a todo lo ancho — gritaba más que los KPIs y que el propio
         contenido de las tarjetas. Ahora es una franja sobria con un punto
         de color y el texto en el color de la categoría: se sigue
         distinguiendo la columna de un vistazo, sin robarle atención al
         mensaje del cliente, que es lo que hay que leer. */
      .dg-kcol-head {
        padding:11px 14px; display:flex; align-items:center; justify-content:space-between;
        font-weight:600; font-size:12.5px; color:var(--dg-kcol-color,var(--text));
        background:var(--surface2); border-bottom:1px solid var(--border);
      }
      .dg-kcol-head-left { display:flex; align-items:center; gap:8px; }
      .dg-kcol-head-left::before {
        content:""; width:7px; height:7px; border-radius:50%;
        background:var(--dg-kcol-color,var(--accent));
      }
      .dg-kcol.iniciados   { --dg-kcol-color:var(--violet-2); }
      .dg-kcol.pendientes  { --dg-kcol-color:var(--warn-2); }
      .dg-kcol.finalizados { --dg-kcol-color:var(--success-2); }
      .dg-kcol-count {
        background:color-mix(in srgb, var(--dg-kcol-color) 16%, transparent);
        padding:2px 9px; border-radius:999px; font-size:11px;
        font-family:var(--mono); font-variant-numeric:tabular-nums;
      }
      .dg-kcol-body { padding:10px; display:flex; flex-direction:column; gap:8px; max-height:420px; overflow-y:auto; }
      /* .dg-kcard es un <div> (no <button>) a propósito: adentro conviven
         el "abrir consulta" y los botones de acción (Responder/Resolver/
         Reabrir/Recordatorio) — HTML no permite anidar <button> dentro de
         otro <button> (el navegador corta el tag antes de tiempo y rompe
         el árbol en silencio, sin error visible). El click para "abrir
         consulta" vive en .dg-kcard-open, un <button> aparte que envuelve
         SOLO la parte no interactiva (avatar/nombre/hora/mensaje); las
         acciones quedan afuera, como hermanas, cada una su propio <button>
         real — sin necesitar event.stopPropagation() en ninguna. */
      .dg-kcard {
        background:var(--surface2); border:1px solid var(--border); border-radius:10px;
        padding:10px; display:flex; flex-direction:column; gap:6px;
      }
      .dg-kcard:hover { border-color:var(--border-2); }
      .dg-kcard-open {
        display:flex; flex-direction:column; gap:6px; text-align:left;
        font:inherit; color:inherit; width:100%; cursor:pointer; background:none; border:none; padding:0;
      }
      .dg-kcard-open:focus-visible { outline:2px solid var(--accent-2); outline-offset:1px; }
      .dg-kcard-top { display:flex; align-items:center; gap:7px; }
      .dg-kavatar {
        width:24px; height:24px; border-radius:50%; flex-shrink:0;
        display:flex; align-items:center; justify-content:center;
        font-family:var(--mono); font-size:10px; font-weight:700; color:#fff;
      }
      .dg-kcol.iniciados .dg-kavatar   { background:linear-gradient(135deg,var(--violet),var(--violet-2)); }
      .dg-kcol.pendientes .dg-kavatar  { background:linear-gradient(135deg,var(--warn),var(--warn-2)); }
      .dg-kcol.finalizados .dg-kavatar { background:linear-gradient(135deg,var(--success),var(--success-2)); }
      .dg-kcard-cliente { font-size:12px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .dg-kcard-hora { margin-left:auto; font-size:10px; color:var(--text-3); font-family:var(--mono); flex-shrink:0; white-space:nowrap; }
      .dg-kcard-msg {
        font-size:12px; color:var(--text-2); display:-webkit-box;
        -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
      }
      .dg-kcard-acciones { display:flex; gap:6px; margin-top:2px; }
      .dg-kbtn {
        border:none; border-radius:7px; padding:5px 10px; font-size:11px; font-weight:700;
        cursor:pointer; font-family:var(--sans);
      }
      .dg-kbtn.responder    { background:var(--accent); color:#fff; }
      .dg-kbtn.resolver     { background:var(--success); color:#052e16; }
      .dg-kbtn.reabrir      { background:var(--surface); border:1px solid var(--border-2); color:var(--text-2); }
      .dg-kbtn.recordatorio { background:var(--surface); border:1px solid var(--border-2); color:var(--text-2); }
      .dg-kbtn:hover { opacity:.88; }
      .dg-kcol-empty { font-size:11.5px; color:var(--text-3); text-align:center; padding:18px 10px; }

      /* KPIs — tarjeta con ícono degradado por categoría (antes solo un
         borde de color a la izquierda), matching el resto del rediseño. */
      /* El ícono pasó de un cuadrado degradado grande arriba del todo a un
         chip discreto AL LADO de la etiqueta: el número vuelve a ser lo más
         grande de la tarjeta. Los dos KPIs que son una proporción llevan
         además una barra de progreso — "cobré 3 de 5" se entiende antes
         mirando una barra que leyendo dos cifras. */
      .dg-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(215px,1fr)); gap:12px; }
      /* 25/09/2026: pasaron de <div> a <button> — cada KPI lleva a la
         pantalla donde se resuelve/detalla (mismo espíritu que las
         tarjetas de "Para hoy", .dg-foco-card, más arriba). */
      .dg-kpi {
        background:var(--surface); border:1px solid var(--border);
        border-radius:14px; padding:15px 17px;
        display:flex; flex-direction:column; gap:6px;
        font-family:var(--sans); text-align:left; width:100%; cursor:pointer;
        transition:background .12s, border-color .12s, transform .12s;
      }
      .dg-kpi:hover { background:var(--surface2); border-color:var(--border-2); transform:translateY(-1px); }
      .dg-kpi:focus-visible { outline:2px solid var(--accent-2); outline-offset:2px; }
      .dg-kpi-flecha {
        font-size:10.5px; color:var(--text-3); opacity:0; transition:opacity .12s; margin-top:2px;
      }
      .dg-kpi:hover .dg-kpi-flecha { opacity:1; color:var(--dg-kpi-color); }
      .dg-kpi-icon {
        width:44px; height:44px; border-radius:12px; flex-shrink:0;
        display:flex; align-items:center; justify-content:center;
        background:color-mix(in srgb, var(--dg-kpi-color) 16%, transparent);
        color:var(--dg-kpi-color);
        margin-bottom:2px;
      }
      .dg-kpi-icon svg { width:22px; height:22px; }
      .dg-kpi-ok     { --dg-kpi-color:var(--success-2); }
      .dg-kpi-warn   { --dg-kpi-color:var(--warn-2); }
      .dg-kpi-danger { --dg-kpi-color:var(--danger-2); }
      .dg-kpi-neutro { --dg-kpi-color:var(--accent-2); }
      .dg-kpi-label { font-size:11.5px; font-weight:500; color:var(--text-2); }
      .dg-kpi-valor {
        font-size:25px; font-weight:600; color:var(--text); font-family:var(--mono);
        letter-spacing:-0.5px; font-variant-numeric:tabular-nums; line-height:1.15;
      }
      .dg-kpi-sub   { font-size:11.5px; color:var(--text-3); }
      .dg-kpi-barra { height:4px; border-radius:999px; background:var(--surface3); overflow:hidden; margin-top:4px; }
      .dg-kpi-barra span { display:block; height:100%; border-radius:999px; background:var(--dg-kpi-color); }
      /* Destacado (03/09/2026) — las 1-2 cifras de plata (cobrado del período,
         comisión Finnix) pesan más que "clientes en cartera" o "liquidaciones
         presentadas": ocupan 2 columnas de la grilla y un escalón más de
         tamaño en ícono/número, para que se lean primero sin tener que leer
         las cuatro tarjetas para saber cuál mirar. */
      .dg-kpi-destacado { grid-column:span 2; }
      .dg-kpi-destacado .dg-kpi-icon { width:56px; height:56px; border-radius:14px; }
      .dg-kpi-destacado .dg-kpi-icon svg { width:28px; height:28px; }
      .dg-kpi-destacado .dg-kpi-valor { font-size:34px; }
      /* ⚠ El span:2 de arriba, en un ancho de mobile, NO siempre cae en una
         sola columna por las suyas — depende de cuántas tarjetas NORMALES
         quedan después de la destacada en el orden de auto-placement de la
         grilla. Con 2 quedando en la misma fila (ej. la vista de contador:
         Cobrado destacada + Liquidaciones + Clientes), CSS Grid las pone
         lado a lado en columnas angostas (~115px) en vez de apiladas —
         confirmado con Playwright, no era solo una suposición. Y no alcanza
         con fijar .dg-kpis a 1fr: si la destacada sigue pidiendo
         span 2, la grilla crea una columna implícita igual para poder
         cumplirlo (grid-auto-columns, spec de CSS Grid) — hay que sacarle
         también el span acá, no solo achicar la grilla. */
      @media (max-width: 768px) {
        .dg-kpis { grid-template-columns: 1fr; }
        .dg-kpi-destacado { grid-column: span 1; }
      }

      /* Secciones — hasta el 31/08/2026 eran un título gris diminuto suelto
         sobre el fondo, con el contenido flotando abajo: todo el panel se
         leía como una sola columna de texto sin bloques. Ahora cada sección
         es una tarjeta con su propio encabezado y una barrita de color que
         la identifica (--dg-acc, ver .dg-acc-*). Como el contenido pasó a
         vivir DENTRO de la tarjeta, lo que antes era una tarjeta propia
         (.dg-historico, .dg-lista-item, .dg-empty) pierde su fondo/borde —
         si no, quedaban tarjetas adentro de tarjetas. */
      .dg-seccion {
        display:flex; flex-direction:column; gap:12px;
        background:var(--surface); border:1px solid var(--border);
        border-radius:14px; padding:16px 18px;
      }
      .dg-seccion-titulo {
        font-size:13.5px; font-weight:600; color:var(--text);
        display:flex; align-items:center; gap:9px; letter-spacing:-0.1px;
      }
      .dg-seccion-titulo::before {
        content:""; width:3px; height:14px; border-radius:2px; flex-shrink:0;
        background:var(--dg-acc,var(--accent));
      }
      .dg-acc-violet  { --dg-acc:var(--violet-2); }
      .dg-acc-success { --dg-acc:var(--success); }
      .dg-acc-accent  { --dg-acc:var(--accent); }
      .dg-acc-teal    { --dg-acc:var(--teal-2); }
      .dg-acc-warn    { --dg-acc:var(--warn); }
      .dg-acc-danger  { --dg-acc:var(--danger); }
      /* Al llegar desde una tarjeta de "Para hoy", la sección destino
         parpadea una vez — si no, en un panel largo no se ve que la página
         se movió. */
      .dg-seccion.dg-resaltada { animation:dg-resaltar 1.2s ease-out; }
      @keyframes dg-resaltar {
        0%   { border-color:var(--dg-acc,var(--accent)); box-shadow:0 0 0 3px color-mix(in srgb, var(--dg-acc,var(--accent)) 22%, transparent); }
        100% { border-color:var(--border); box-shadow:none; }
      }
      .dg-seccion-toggle {
        display:flex; align-items:center; justify-content:space-between;
        width:100%; background:none; border:none; padding:0; margin:0;
        cursor:pointer; font-family:var(--sans); text-align:left;
      }
      .dg-seccion-toggle-right { display:flex; align-items:center; gap:10px; flex-shrink:0; }
      .dg-seccion-count {
        font-family:var(--mono); font-size:11px; font-weight:600; color:var(--text-2);
        background:var(--surface2); border:1px solid var(--border);
        border-radius:999px; padding:2px 9px;
      }
      .dg-seccion-chevron {
        color:var(--text-3); font-size:12px; transition:transform .15s;
        display:inline-block;
      }
      .dg-seccion-toggle[aria-expanded="true"] .dg-seccion-chevron { transform:rotate(90deg); }
      .dg-seccion-toggle[aria-expanded="true"] .dg-seccion-count { color:var(--accent); border-color:var(--accent); }

      /* La sección "Comisiones y cobranza" que vivía acá (.dg-com-*, mismo
         estilo que .dg-tabla-compacta) se mudó al panel Suscripciones el
         24/09/2026 — ver modules/admin/suscripciones-panel.js (.sp-com-*).
         No queda CSS huérfano: se llevó las reglas con ella. */

      /* Histórico */
      .dg-historico { display:flex; flex-direction:column; gap:9px; }
      .dg-hist-row { display:flex; align-items:center; gap:12px; font-size:12px; }
      .dg-hist-periodo { width:100px; flex-shrink:0; color:var(--text-2); }
      .dg-hist-barwrap { flex:1; background:var(--surface2); border-radius:999px; height:10px; overflow:hidden; }
      .dg-hist-bar {
        height:100%; border-radius:999px; transition:width .3s;
        background:linear-gradient(90deg,var(--accent),var(--accent-2));
      }
      /* El período más alto de la serie se marca — sin esto, dos barras
         parecidas no dicen cuál fue el mejor mes de un vistazo. */
      .dg-hist-row.es-max .dg-hist-bar { background:linear-gradient(90deg,var(--teal),var(--teal-2)); }
      .dg-hist-row.es-max .dg-hist-valor { color:var(--teal-2); }
      .dg-hist-valor { width:115px; flex-shrink:0; text-align:right; font-family:var(--mono); color:var(--text); font-variant-numeric:tabular-nums; }

      /* Tabla contadores */
      .dg-tabla-wrap { overflow-x:auto; }
      .dg-tabla { width:100%; border-collapse:collapse; font-size:13px; }
      .dg-tabla th {
        text-align:left; padding:8px 12px; font-size:11px; font-weight:500;
        color:var(--text-3); border-bottom:1px solid var(--border);
        letter-spacing:0.04em; text-transform:uppercase; white-space:nowrap;
      }
      .dg-tabla th.num, .dg-tabla td.num { text-align:right; }
      .dg-tabla td {
        padding:10px 12px; border-bottom:1px solid var(--border);
        color:var(--text); font-family:var(--mono); font-size:12.5px;
      }
      .dg-tabla td:first-child { font-family:var(--sans); font-size:13px; }
      .dg-tabla tbody tr { cursor:pointer; transition:background .12s; }
      .dg-tabla tbody tr:hover { background:var(--surface2); }
      .dg-venc-vencido { color:var(--danger); }
      .dg-consultas-pend { color:var(--warn); }

      /* Las dos tablas por contador (la operativa de 7 columnas y la de
         comisiones, de 6) pasan a lista de tarjetas en el celu — mismo truco
         de CSS puro que comprobantes.js y motor-iva.js: cada celda ya lleva
         data-label, acá la tabla entera pasa a display:block y cada valor
         muestra su etiqueta con ::before. Antes dependían de la red de
         seguridad genérica de scroll-x, que en 375-430px obligaba a arrastrar
         la tabla de costado para leer las últimas columnas. */
      @media (max-width: 768px) {
        .dg-tabla-wrap { overflow-x:visible; }
        .dg-tabla, .dg-tabla tbody, .dg-tabla tr, .dg-tabla td { display:block; width:100%; }
        .dg-tabla thead { display:none; }
        .dg-tabla tbody tr {
          background:var(--surface2); border:1px solid var(--border);
          border-radius:10px; padding:10px 12px; margin-bottom:8px;
        }
        .dg-tabla tbody tr:last-child { margin-bottom:0; }
        .dg-tabla tbody tr:hover { background:var(--surface2); }
        .dg-tabla td {
          border-bottom:none; padding:4px 0; font-size:13px;
          display:flex; align-items:baseline; gap:8px;
        }
        /* margin-right:auto en la etiqueta (y no space-between en la celda):
           una celda con más de un valor —"8 (4 RI · 4 Mono)"— se separaba a
           los dos extremos de la tarjeta en vez de quedar junta a la derecha. */
        .dg-tabla td::before {
          content:attr(data-label); color:var(--text-3); font-family:var(--sans);
          font-size:11.5px; flex-shrink:0; margin-right:auto;
        }
        .dg-tabla td.num { text-align:right; }
        /* La primera celda es el nombre del contador: hace de título de la
           tarjeta, sin etiqueta al costado. */
        .dg-tabla td:first-child {
          font-size:14px; font-weight:600; color:var(--text);
          padding:0 0 8px; margin-bottom:6px; border-bottom:1px solid var(--border);
        }
        .dg-tabla td:first-child::before { content:none; }
      }

      /* Listas clickeables */
      .dg-lista { display:flex; flex-direction:column; }
      .dg-lista-item {
        display:flex; align-items:center; justify-content:space-between; gap:10px;
        padding:10px 12px; border-radius:8px; margin:0 -12px;
        font-size:13px; cursor:pointer; transition:background .12s;
        border-bottom:1px solid var(--border);
      }
      .dg-lista-item:last-child { border-bottom:none; }
      .dg-lista-item:hover { background:var(--surface2); }
      .dg-lista-item-nombre { display:flex; align-items:center; gap:8px; min-width:0; }
      .dg-lista-chip {
        font-size:10px; font-family:var(--mono); color:var(--text-3);
        background:var(--surface2); border:1px solid var(--border);
        border-radius:999px; padding:1px 7px; flex-shrink:0;
      }
      .dg-lista-item-meta {
        font-size:11px; color:var(--text-3); font-family:var(--mono);
        display:flex; align-items:center; gap:10px; flex-shrink:0; text-align:right;
      }
      .dg-lista-contador { color:var(--text-2); }
      .dg-lista-detalle { color:var(--text-3); }
      .dg-lista-alerta { color:var(--danger-2); }

      @media (max-width: 768px) {
        /* En el celu el nombre y el detalle no entran en una línea */
        .dg-lista-item { flex-direction:column; align-items:flex-start; gap:4px; }
        .dg-lista-item-meta { text-align:left; flex-wrap:wrap; }
      }
      .dg-empty { font-size:12.5px; color:var(--text-3); padding:10px 0; }

      /* Modal detalle contador */
      #dg-detalle-modal-bg {
        position:fixed; inset:0; background:rgba(0,0,0,.65);
        display:flex; align-items:center; justify-content:center; z-index:210;
      }
      .dg-detalle-modal {
        background:var(--surface); border:1px solid var(--border);
        border-radius:14px; width:640px; max-width:96vw; max-height:88vh;
        display:flex; flex-direction:column; overflow:hidden;
      }
      .dg-detalle-header {
        display:flex; justify-content:space-between; align-items:center;
        padding:18px 24px; border-bottom:1px solid var(--border);
        font-weight:600; font-size:15px; flex-shrink:0;
      }
      .dg-detalle-body { overflow-y:auto; padding:16px 24px; display:flex; flex-direction:column; gap:10px; }
      .dg-cliente-card {
        background:var(--surface2); border:1px solid var(--border);
        border-radius:10px; padding:14px 16px;
        display:flex; flex-direction:column; gap:10px;
      }
      .dg-cliente-card-top { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
      .dg-cliente-nombre { font-size:14px; font-weight:600; }
      .dg-cliente-meta { font-size:11px; color:var(--text-2); font-family:var(--mono); margin-top:2px; }
      .dg-cliente-acciones { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .dg-btn-mini {
        font-size:11px; color:var(--text-2); border:1px solid var(--border);
        border-radius:6px; padding:4px 10px; background:none;
        font-family:var(--sans); cursor:pointer; transition:all .15s;
      }
      .dg-btn-mini:hover { border-color:var(--accent); color:var(--accent); }
      .dg-select-mini {
        font-size:11px; background:var(--surface); border:1px solid var(--border);
        border-radius:6px; padding:4px 8px; color:var(--text); font-family:var(--sans);
      }
      .dg-hon-lista { display:flex; flex-direction:column; gap:6px; }
      .dg-hon-row {
        display:flex; align-items:center; justify-content:space-between;
        padding:6px 10px; background:var(--surface); border-radius:6px;
        font-size:12px;
      }
      .dg-hon-row-info { font-family:var(--mono); }
      .dg-empty-mini { font-size:11px; color:var(--text-3); }

      /* Búsqueda de honorarios (buscar cliente → marcar pago → comprobante) */
      #dg-honbusq-resultados { display:flex; flex-direction:column; gap:12px; margin-top:12px; }
      .dg-honbusq-cliente {
        background:var(--surface); border:1px solid var(--border); border-radius:10px;
        padding:14px 16px; display:flex; flex-direction:column; gap:8px;
      }
      .dg-honbusq-cliente-nombre { font-size:13.5px; font-weight:600; }
      .dg-honbusq-cliente-cuit { font-family:var(--mono); font-size:11px; color:var(--text-3); font-weight:400; }
      .dg-honbusq-row {
        display:flex; align-items:center; justify-content:space-between; gap:10px;
        padding:8px 10px; background:var(--surface2); border-radius:8px;
        font-size:12px; flex-wrap:wrap;
      }
      .dg-honbusq-row-acciones { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
      .dg-honbusq-badge {
        font-family:var(--mono); font-size:10.5px; font-weight:600;
        padding:2px 9px; border-radius:999px; white-space:nowrap;
      }
      /* --success/--warn no tienen variante "-dim" (fondo suave) definida
         en index.html — a diferencia de --accent-dim, que sí existe y se
         reusa en el resto de este archivo. Mismo criterio que
         .panel-archivado-banner en index.html: rgba literal a partir del
         hex de --success/--warn (#22c55e/#ff8a3d), no una var inventada. */
      .dg-honbusq-badge.is-cobrado    { background:rgba(34,197,94,.15);  color:var(--success); }
      .dg-honbusq-badge.is-pendiente  { background:rgba(255,138,61,.15); color:var(--warn); }
      .fx-btn-ghost.is-small { font-size:11px; padding:4px 9px; }

      /* Mobile (ver index.html, fase 2 de "CRM mobile-first" en CLAUDE.md)
         — .dg-kpis ya es responsive solo (auto-fit/minmax), no necesita
         media query. El kanban de 3 columnas sí: apiladas en vez de lado
         a lado, si no quedan de ~110px cada una. Se saca el tope de alto
         de cada columna (max-height/overflow-y propios) para que scrollee
         la página entera en vez de un scroll anidado adentro de la
         columna — más natural al toque en mobile. */
      @media (max-width: 768px) {
        .dg-kanban { grid-template-columns: 1fr; }
        .dg-kcol-body { max-height: none; overflow-y: visible; }
      }
    </style>
  `;

  // Estado del módulo (poblado en cada cargar())
  let detalles = [];
  let usersById = new Map();
  let comunicaciones = { iniciados: [], pendientes: [], finalizados: [] };
  // Colapsada por default — con cientos de clientes esta lista puede tener
  // más filas que el resto del dashboard junto (ver "Clientes sin
  // comprobantes"). Se mantiene fuera de cargar() para no volver a
  // colapsarse sola cada vez que se cambia de período (window._dgCargar).
  let sinCbteAbierto = false;

  async function cargar() {
    const periodo = document.getElementById('dg-periodo').value;
    document.getElementById('dg-loading').style.display   = '';
    document.getElementById('dg-contenido').style.display = 'none';

    try {
      // where('estudio_id', ...) en las dos: no es solo para acotar el
      // resultado, es requisito para que la query pase la regla de
      // Firestore — una regla que depende de resource.data no filtra por
      // documento sola en una lista sin este where (mismo motivo que las
      // 5 reglas collectionGroup, ver firestore.rules "COLLECTION
      // GROUP"). Sin esto, este panel mostraba clientes/staff de
      // CUALQUIER estudio.
      const clientesQuery = contadorUid
        ? query(collection(db, 'clientes'), where('contador_uid', '==', contadorUid), where('estudio_id', '==', window._estudioId), orderBy('razon_social'))
        : query(collection(db, 'clientes'), where('estudio_id', '==', window._estudioId), orderBy('razon_social'));
      // El listado de /crm_users/ (para la tabla "por contador" y el
      // selector de reasignación) solo lo puede leer admin/administrativo
      // por regla de Firestore — un contador pidiéndolo se encuentra con
      // permission-denied en TODA la query de lista, no solo en los docs
      // ajenos. No hace falta de todos modos: esa tabla y el drill-down de
      // reasignar quedan ocultos en la vista del contador (ver arriba).
      // 'super_admin' incluido en el rol-in: un cliente puede tener
      // contador_uid apuntando a alguien que después se promovió a
      // super_admin (como el caso real de Aleja) — sin esto, esa fila de
      // la tabla mostraba el UID crudo en vez del nombre.
      const [clientesSnap, usersSnap] = await Promise.all([
        getDocs(clientesQuery),
        contadorUid ? Promise.resolve(null) : getDocs(query(collection(db, 'crm_users'), where('rol', 'in', ['admin', 'contador', 'super_admin']), where('estudio_id', '==', window._estudioId))),
      ]);

      // Los archivados (papelera) y los que todavía esperan confirmación de
      // onboarding no son cartera activa: contarlos infla los KPIs y la tabla
      // por contador con clientes que ya no se atienden o que ni siquiera se
      // aceptaron. El filtro va acá y no en el `where` de la query a
      // propósito: Firestore excluye de un `!=` cualquier documento que NO
      // tenga el campo, y hoy la mayoría de los clientes no tiene `activo`
      // seteado — un `where('activo','!=',false)` dejaría el panel casi
      // vacío hasta backfillear (misma trampa que `estudio_id`, ver
      // CLAUDE.md "Multi-tenant"). Filtrar en JS cuesta la misma query.
      // Las cuentas demo (28/09/2026, ver CLAUDE.md "Cuentas demo") tampoco
      // son cartera real — se crean para mostrarle la app en vivo a un
      // prospecto, no representan un cliente pagando de verdad. Contarlas
      // infla los KPIs igual que un archivado o un pendiente_confirmacion.
      const clientes = clientesSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => c.activo !== false && c.estado !== 'pendiente_confirmacion' && c.demo !== true);
      usersById = usersSnap ? new Map(usersSnap.docs.map(d => [d.id, d.data()])) : new Map();

      // Onboarding: solo con el estudio recién creado y todavía sin
      // ningún cliente (admin-only, ver el `${contadorUid ? '' : ...}`
      // del template — el elemento directamente no existe en la vista de
      // contador, de ahí el chequeo de null).
      const bannerOnboarding = document.getElementById('dg-banner-onboarding');
      if (bannerOnboarding) {
        bannerOnboarding.style.display = clientes.length === 0 ? '' : 'none';
      }

      // Vista de contador: acotada a su propia cartera (ya vino filtrada
      // por contador_uid en clientesQuery) — típicamente decenas de
      // clientes, el patrón de 1 query por cliente no pesa lo mismo que
      // en la vista global. Vista de admin: TODA la cartera del estudio —
      // ahí sí hace falta collectionGroup() (ver cargarDetallesGlobal).
      detalles = contadorUid
        ? await cargarDetallesPorCliente(clientes, periodo)
        : await cargarDetallesGlobal(clientes, periodo);

      const global    = agregarGlobal(detalles, periodo);
      const historico = agregarHistorico(detalles);
      comunicaciones  = agregarComunicaciones(detalles);

      renderKPIsGlobales(global);
      renderHistorico(historico);
      if (!contadorUid) {
        renderTablaContadores(agregarPorContador(detalles, usersById));
      }
      renderListaClickeable('dg-lista-sin-cbte', global.sinComprobantes);
      document.getElementById('dg-count-sin-cbte').textContent =
        `${global.sinComprobantes.length} de ${global.totalClientes}`;
      aplicarEstadoSinCbte();
      renderListaClickeable('dg-lista-venc-vencidos', global.conVencVencidos, detalleVencido);
      renderFoco(global, comunicaciones);
      renderKanban();

      document.getElementById('dg-contenido').style.display = '';
    } catch (e) {
      console.error(e);
      window._toast(window._mensajeError(e, 'Error al cargar el panel de administrador'), 'error');
    } finally {
      document.getElementById('dg-loading').style.display = 'none';
    }
  }

  // Vista de contador (cartera propia, ya acotada por contador_uid en el
  // query de clientes) — mismo patrón de siempre, 5 queries por cliente.
  async function cargarDetallesPorCliente(clientes, periodo) {
    return Promise.all(clientes.map(async c => {
      const [honSnap, vencSnap, liqSnap, consSnap, cbteSnap] = await Promise.all([
        getDocs(collection(db, `clientes/${c.id}/honorarios`)),
        getDocs(collection(db, `clientes/${c.id}/vencimientos`)),
        getDocs(query(collection(db, `clientes/${c.id}/liquidaciones`), where('periodo', '==', periodo))),
        getDocs(collection(db, `clientes/${c.id}/consultas`)),
        getDocs(query(collection(db, `clientes/${c.id}/comprobantes`), where('periodo', '==', periodo))),
      ]);
      return {
        cliente: c,
        honorarios:    honSnap.docs.map(d => ({ _id: d.id, ...d.data() })),
        vencimientos:  vencSnap.docs.map(d => d.data()),
        liquidaciones: liqSnap.docs.map(d => d.data()),
        consultas:     consSnap.docs.map(d => ({ _id: d.id, ...d.data() })),
        comprobantes:  cbteSnap.docs.map(d => d.data()),
      };
    }));
  }

  // Vista global de admin — antes hacía las mismas 5 queries de arriba
  // PERO POR CADA CLIENTE del estudio: con 500 clientes son 2.500 queries
  // en un solo load del panel de inicio (ver CLAUDE.md, "Rendimiento a
  // escala"). Acá en cambio son 5 queries TOTALES, con collectionGroup()
  // — leen todas las subcolecciones de ese nombre en TODO el proyecto de
  // una, sin importar cuántos clientes haya. Requiere las reglas nuevas
  // `match /{path=**}/<subcolección>/{id}` en firestore.rules (solo
  // esAdmin() — el contador sigue por cargarDetallesPorCliente de arriba,
  // no necesita este permiso) y, para las dos queries con `where(periodo)`,
  // un índice COLLECTION_GROUP nuevo por campo (ver firestore.indexes.json
  // — las reglas de subcolección directa NO alcanzan para collection-group,
  // Firestore las evalúa aparte).
  async function cargarDetallesGlobal(clientes, periodo) {
    const porCliente = new Map(clientes.map(c => [c.id, {
      cliente: c, honorarios: [], vencimientos: [], liquidaciones: [], consultas: [], comprobantes: [],
    }]));

    // Cada doc de un collectionGroup() trae su propio ref — .parent.parent
    // es el doc /clientes/{clienteId} que lo contiene. Un doc cuyo padre
    // no está en porCliente (cliente de otro contador si algún día hay
    // filtro, o ya borrado) se descarta solo, sin romper nada.
    function agregar(campo, snap, mapper) {
      for (const d of snap.docs) {
        const entry = porCliente.get(d.ref.parent.parent?.id);
        if (entry) entry[campo].push(mapper(d));
      }
    }

    // estudio_id en el where(): no es solo aislamiento de datos, es lo que
    // permite que la query pase las reglas de Firestore. Una regla de list
    // que depende de resource.data (como la de estas 5 subcolecciones, ver
    // firestore.rules) exige que la propia query pueda probar que TODO
    // resultado posible la cumple — sin este where(), Firestore rechaza el
    // collectionGroup() entero en vez de filtrar resultado por resultado
    // ("las reglas de seguridad no son un filtro", confirmado con el
    // emulador). window._estudioId ya está seteado en index.html antes de
    // llamar a renderDashboardGeneral (mostrarApp → cargarEstudio()).
    const estudioId = window._estudioId;
    const [honSnap, vencSnap, liqSnap, consSnap, cbteSnap] = await Promise.all([
      getDocs(query(collectionGroup(db, 'honorarios'), where('estudio_id', '==', estudioId))),
      getDocs(query(collectionGroup(db, 'vencimientos'), where('estudio_id', '==', estudioId))),
      getDocs(query(collectionGroup(db, 'liquidaciones'), where('periodo', '==', periodo), where('estudio_id', '==', estudioId))),
      getDocs(query(collectionGroup(db, 'consultas'), where('estudio_id', '==', estudioId))),
      getDocs(query(collectionGroup(db, 'comprobantes'), where('periodo', '==', periodo), where('estudio_id', '==', estudioId))),
    ]);

    agregar('honorarios',    honSnap,  d => ({ _id: d.id, ...d.data() }));
    agregar('vencimientos',  vencSnap, d => d.data());
    agregar('liquidaciones', liqSnap,  d => d.data());
    agregar('consultas',     consSnap, d => ({ _id: d.id, ...d.data() }));
    agregar('comprobantes',  cbteSnap, d => d.data());

    return clientes.map(c => porCliente.get(c.id));
  }

  // ── AGREGACIÓN GLOBAL ────────────────────────────────────────
  // ⚠ `detalles[].honorarios` trae TODOS los períodos, no solo el elegido
  // arriba (ver cargarDetallesGlobal/PorCliente — esa query no filtra por
  // período a propósito, la usa el buscador de honorarios). Así que acá se
  // separa a mano: lo del período elegido va a los KPIs y a la sección de
  // comisiones; lo de períodos anteriores que sigue pendiente se muestra
  // aparte como deuda arrastrada, que es otra cosa y otra decisión.
  function agregarGlobal(detalles, periodo) {
    let facturadoPeriodo = 0, cobradoPeriodo = 0, pendientePeriodo = 0;
    // pendienteAnterior sigue haciendo falta acá — lo usa "Para hoy" (ver
    // renderFoco más abajo) para avisar de honorarios sin cobrar de
    // períodos viejos. El desglose de COMISIÓN (cuánto de esto es de
    // Finnix) se mudó al panel Suscripciones el 24/09/2026 junto con la
    // sección "Comisiones y cobranza" — ver ese módulo, que arma su propia
    // cuenta con un query aparte, así que ya no hace falta computarla acá.
    let pendienteAnterior = 0;
    // Estado de las liquidaciones del período elegido — mismo criterio que
    // agregarPorContador (un mono no liquida IVA, así que no cuenta como
    // pendiente). Se agregó acá para el KPI "Liquidaciones del período":
    // antes ese dato solo existía por contador, en la tabla de más abajo.
    let liqPresentadas = 0;
    let liqPendientes = 0;
    let ri = 0, mono = 0;
    const sinComprobantes  = [];
    const conVencVencidos  = [];
    const hoyStr = new Date().toISOString().slice(0, 10);
    const diasDesde = (f) => Math.floor((new Date(hoyStr) - new Date(f)) / 86400000);

    for (const d of detalles) {
      for (const h of d.honorarios) {
        const monto = h.monto || 0;
        if (h.periodo === periodo) {
          facturadoPeriodo += monto;
          if (h.estado === 'cobrado') cobradoPeriodo += monto;
          else pendientePeriodo += monto;
        } else if (h.estado !== 'cobrado') {
          pendienteAnterior += monto;
        }
      }
      if (d.cliente.tipo === 'ri') ri++; else mono++;
      for (const imp of (d.cliente.tipo !== 'mono' ? ['iva', 'iibb'] : ['iibb'])) {
        const liq = d.liquidaciones.find(l => l.impuesto === imp);
        if (liq && liq.estado === 'presentada') liqPresentadas++; else liqPendientes++;
      }
      if (d.comprobantes.length === 0) sinComprobantes.push(d.cliente);

      // Se guarda el vencimiento más atrasado, no solo que "hay alguno":
      // la lista de abajo muestra qué impuesto y cuántos días lleva, que es
      // lo que decide a quién llamar primero.
      const vencidos = d.vencimientos
        .filter(v => v.estado === 'pendiente' && v.fecha < hoyStr)
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
      if (vencidos.length) {
        conVencVencidos.push({
          ...d.cliente,
          _venc: vencidos[0],
          _vencDias: diasDesde(vencidos[0].fecha),
          _vencTotal: vencidos.length,
        });
      }
    }

    return {
      facturadoPeriodo, cobradoPeriodo, pendientePeriodo, pendienteAnterior,
      liqPresentadas, liqPendientes, totalClientes: detalles.length, ri, mono,
      sinComprobantes, conVencVencidos, periodo,
    };
  }

  // ── HISTÓRICO DE COBROS (últimos 6 períodos con datos) ───────
  function agregarHistorico(detalles) {
    const porPeriodo = new Map();
    for (const d of detalles) {
      for (const h of d.honorarios) {
        if (h.estado !== 'cobrado' || !h.periodo) continue;
        if (!porPeriodo.has(h.periodo)) porPeriodo.set(h.periodo, 0);
        porPeriodo.set(h.periodo, porPeriodo.get(h.periodo) + (h.monto || 0));
      }
    }
    return [...porPeriodo.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6)
      .reverse();
  }

  // ── COMUNICACIONES ────────────────────────────────────────────
  // Aplana las consultas de todos los clientes en una sola lista ordenada
  // por fecha — antes la única señal de "llegó un mensaje" era el
  // puntito de la sidebar, que no dice cuántos hay, de quién, ni qué
  // dicen. "Sin responder" usa el mismo criterio que ya usaba
  // agregarPorContador() para consultasSinResponder (respuesta vacía) —
  // no leida_por_contador, que es un estado aparte (ese maneja el punto
  // del sidebar/tab, ver index.html).
  // estado de una consulta: 'iniciada' | 'pendiente' | 'resuelta' — campo
  // nuevo, lo escribe/actualiza SOLO el CRM (finnix-app nunca lo toca, no
  // sabe que existe). Retrocompatible con consultas viejas que no lo
  // tienen: si nunca se abrió en el CRM (leida_por_contador !== true) se
  // toma como 'iniciada'; si ya se abrió pero nadie la marcó resuelta a
  // mano, 'pendiente' (tenga o no respuesta — responder y resolver son
  // acciones distintas: se puede contestar y dejarla pendiente de
  // confirmación, o resolverla sin más texto si ya se solucionó por otro
  // medio); si tiene respuesta y el campo estado nunca se tocó, se toma
  // como 'resuelta' (mismo criterio que usaba antes el filtro "Sin
  // responder"/"Todas": respuesta = caso cerrado). Duplicada en
  // consultas.js (mismo criterio ahí) — ver comentario allá.
  function inferirEstadoConsulta(c) {
    if (c.estado) return c.estado;
    if (c.leida_por_contador !== true) return 'iniciada';
    return c.respuesta ? 'resuelta' : 'pendiente';
  }

  function agregarComunicaciones(detalles) {
    const items = [];
    for (const d of detalles) {
      for (const c of d.consultas) {
        items.push({
          clienteId:  d.cliente.id,
          cliente:    d.cliente,
          consultaId: c._id,
          mensaje:    c.mensaje,
          fecha:      c.fecha,
          respuesta:  c.respuesta,
          estado:     inferirEstadoConsulta(c),
        });
      }
    }
    items.sort((a, b) => tsToMillis(b.fecha) - tsToMillis(a.fecha));
    return {
      iniciados:   items.filter(i => i.estado === 'iniciada'),
      pendientes:  items.filter(i => i.estado === 'pendiente'),
      finalizados: items.filter(i => i.estado === 'resuelta'),
    };
  }

  const DG_FOCO_ICONOS = {
    mensajes:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.9-.9L3 20.5l1.5-4.4A8.4 8.4 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/></svg>',
    vencimientos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    comprobantes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 9v4M12 17h.01M10.3 3.9L2.7 18a1.8 1.8 0 0 0 1.6 2.6h15.4a1.8 1.8 0 0 0 1.6-2.6L13.7 3.9a1.8 1.8 0 0 0-3.4 0z"/></svg>',
    cobrar:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v20M17 6.5c0-1.9-2.2-3.5-5-3.5s-5 1.6-5 3.5 2.2 3.2 5 3.5c2.8.3 5 1.6 5 3.5s-2.2 3.5-5 3.5-5-1.6-5-3.5"/></svg>',
    ok:           '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg>',
  };

  // "Para hoy" — el punto de entrada del panel. Se arma con los mismos datos
  // que los KPIs (no dispara ninguna query nueva), pero solo lista lo que
  // requiere acción y en orden de urgencia: mensajes sin responder, algo ya
  // vencido, período sin comprobantes, plata sin cobrar. Cada tarjeta lleva a
  // la sección donde se resuelve. Sin nada pendiente muestra una sola línea
  // en verde, no cuatro tarjetas en cero.
  function renderFoco(g, comms) {
    const el = document.getElementById('dg-foco');
    const sinResolver = [...comms.iniciados, ...comms.pendientes]
      .sort((a, b) => tsToMillis(a.fecha) - tsToMillis(b.fecha));

    const tarjetas = [];
    if (sinResolver.length) {
      tarjetas.push({
        icono: 'mensajes', tono: 'urgente', destino: 'dg-seccion-comms',
        valor: sinResolver.length,
        label: `mensaje${sinResolver.length !== 1 ? 's' : ''} sin responder — el más viejo, de ${esc(sinResolver[0].cliente.razon_social) || '—'}, ${formatRelativo(sinResolver[0].fecha)}`,
      });
    }
    if (g.conVencVencidos.length) {
      tarjetas.push({
        icono: 'vencimientos', tono: 'urgente', destino: 'dg-seccion-venc',
        valor: g.conVencVencidos.length,
        label: `cliente${g.conVencVencidos.length !== 1 ? 's' : ''} con vencimientos ya vencidos`,
      });
    }
    if (g.sinComprobantes.length) {
      tarjetas.push({
        icono: 'comprobantes', tono: 'avisa', destino: 'dg-seccion-sin-cbte',
        valor: g.sinComprobantes.length,
        label: 'sin comprobantes cargados en este período',
      });
    }
    const sinCobrar = g.pendientePeriodo + g.pendienteAnterior;
    if (sinCobrar > 0) {
      tarjetas.push({
        icono: 'cobrar', tono: 'info', destino: 'dg-seccion-honorarios',
        valor: '$ ' + fmtPeso(sinCobrar),
        label: g.pendienteAnterior > 0
          ? `sin cobrar — $ ${fmtPeso(g.pendienteAnterior)} son de períodos anteriores`
          : 'en honorarios del período pendientes de cobro',
      });
    }

    el.classList.toggle('esta-al-dia', tarjetas.length === 0);
    if (!tarjetas.length) {
      el.innerHTML = `
        <div class="dg-foco-head">
          <span class="dg-foco-titulo">Para hoy</span>
        </div>
        <div class="dg-foco-ok">
          <span class="dg-foco-icon" aria-hidden="true">${DG_FOCO_ICONOS.ok}</span>
          <span>No hay nada pendiente: los mensajes están respondidos, no hay vencimientos
            atrasados y los honorarios del período están cobrados.</span>
        </div>
      `;
      return;
    }

    el.innerHTML = `
      <div class="dg-foco-head">
        <span class="dg-foco-titulo">Para hoy</span>
        <span class="dg-foco-sub">${tarjetas.length} cosa${tarjetas.length !== 1 ? 's' : ''} que necesitan atención</span>
      </div>
      <div class="dg-foco-grid">
        ${tarjetas.map((t) => `
          <button type="button" class="dg-foco-card ${t.tono}" onclick="window._dgIrA('${t.destino}')">
            <span class="dg-foco-icon" aria-hidden="true">${DG_FOCO_ICONOS[t.icono]}</span>
            <span class="dg-foco-txt">
              <span class="dg-foco-valor">${t.valor}</span>
              <span class="dg-foco-label">${t.label}</span>
            </span>
            <span class="dg-foco-flecha" aria-hidden="true">→</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  // Lleva a la sección de la tarjeta clickeada. Si es la lista colapsable de
  // "sin comprobantes", la abre de paso — mandar a una sección cerrada sería
  // dejar al usuario mirando un título.
  function irASeccion(id) {
    if (id === 'dg-seccion-sin-cbte' && !sinCbteAbierto) toggleSinCbte();
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('dg-resaltada');
    setTimeout(() => el.classList.remove('dg-resaltada'), 1200);
    if (id === 'dg-seccion-honorarios') {
      setTimeout(() => document.getElementById('dg-honbusq-input')?.focus(), 350);
    }
  }

  const KANBAN_COLS = [
    { key: 'iniciados',   clase: 'iniciados',   titulo: 'Iniciados',   vacio: 'Sin mensajes nuevos.' },
    { key: 'pendientes',  clase: 'pendientes',  titulo: 'Pendientes',  vacio: 'Nada pendiente 🎉' },
    { key: 'finalizados', clase: 'finalizados', titulo: 'Finalizados', vacio: 'Todavía no hay consultas resueltas.' },
  ];

  function renderKanban() {
    const totalSinResolver = comunicaciones.iniciados.length + comunicaciones.pendientes.length;
    document.getElementById('dg-comms-count').textContent = `${totalSinResolver} sin resolver`;

    document.getElementById('dg-kanban').innerHTML = KANBAN_COLS.map(col => {
      const lista = comunicaciones[col.key].slice(0, 20);
      return `
        <div class="dg-kcol ${col.clase}">
          <div class="dg-kcol-head">
            <span class="dg-kcol-head-left">${col.titulo}</span>
            <span class="dg-kcol-count">${comunicaciones[col.key].length}</span>
          </div>
          <div class="dg-kcol-body">
            ${lista.length ? lista.map(i => renderKcard(i, col.key)).join('') : `<div class="dg-kcol-empty">${col.vacio}</div>`}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderKcard(i, colKey) {
    const nombre   = i.cliente.razon_social || '—';
    const preview  = String(i.mensaje || '').replace(/</g, '&lt;');
    const etiqueta = `${nombre} — ${formatRelativo(i.fecha)}: ${preview}`.replace(/"/g, '&quot;');
    const botones = [];
    if (colKey === 'pendientes') {
      botones.push(`<button type="button" class="dg-kbtn responder" onclick="window.irAConsultasCliente('${i.clienteId}')">Responder</button>`);
      botones.push(`<button type="button" class="dg-kbtn resolver" onclick="window._dgResolverConsulta('${i.clienteId}','${i.consultaId}')">✓ Resolver</button>`);
    }
    if (colKey === 'finalizados') {
      botones.push(`<button type="button" class="dg-kbtn reabrir" onclick="window._dgReabrirConsulta('${i.clienteId}','${i.consultaId}')">↺ Reabrir</button>`);
    }
    // "Recordatorio" (push manual a finnix-app, ver modules/clientes/recordatorio.js)
    // sale en las 3 columnas — no depende del estado de la consulta, es un
    // empujoncito aparte (IVA/IIBB/honorario) que tiene sentido mandar
    // aunque la consulta puntual ya esté resuelta.
    botones.push(`<button type="button" class="dg-kbtn recordatorio" onclick="window._dgAbrirRecordatorio('${i.clienteId}')">🔔 Recordatorio</button>`);
    return `
      <div class="dg-kcard">
        <button type="button" class="dg-kcard-open" onclick="window.irAConsultasCliente('${i.clienteId}')" aria-label="${etiqueta}">
          <div class="dg-kcard-top">
            <span class="dg-kavatar" aria-hidden="true">${iniciales(nombre)}</span>
            <span class="dg-kcard-cliente">${esc(nombre)}</span>
            <span class="dg-kcard-hora">${formatRelativo(i.fecha)}</span>
          </div>
          <div class="dg-kcard-msg">${preview}</div>
        </button>
        <div class="dg-kcard-acciones">${botones.join('')}</div>
      </div>
    `;
  }

  async function marcarConsultaResuelta(clienteId, consultaId) {
    try {
      await setDoc(doc(db, `clientes/${clienteId}/consultas`, consultaId), { estado: 'resuelta' }, { merge: true });
      window._toast('Consulta marcada como resuelta', 'ok');
      await cargar();
    } catch (e) {
      console.error(e);
      window._toast(window._mensajeError(e, 'Error al actualizar la consulta'), 'error');
    }
  }

  async function reabrirConsulta(clienteId, consultaId) {
    try {
      await setDoc(doc(db, `clientes/${clienteId}/consultas`, consultaId), { estado: 'pendiente' }, { merge: true });
      window._toast('Consulta reabierta', 'ok');
      await cargar();
    } catch (e) {
      console.error(e);
      window._toast(window._mensajeError(e, 'Error al reabrir la consulta'), 'error');
    }
  }

  // ── AGREGACIÓN POR CONTADOR ──────────────────────────────────
  function agregarPorContador(detalles, usersById) {
    const grupos  = new Map();
    const hoyStr  = new Date().toISOString().slice(0, 10);

    for (const d of detalles) {
      const uid = d.cliente.contador_uid || 'sin_asignar';
      if (!grupos.has(uid)) {
        const u = usersById.get(uid);
        grupos.set(uid, {
          uid,
          nombre: uid === 'sin_asignar' ? 'Sin asignar' : (u?.nombre || u?.email || uid),
          clientes: 0, ri: 0, mono: 0,
          liqPendientes: 0, liqPresentadas: 0,
          vencVencidos: 0, vencProximos: 0,
          consultasSinResponder: 0,
        });
      }
      const g = grupos.get(uid);
      g.clientes++;
      if (d.cliente.tipo === 'ri') g.ri++; else g.mono++;

      const impuestosAplicables = d.cliente.tipo !== 'mono' ? ['iva', 'iibb'] : ['iibb'];
      for (const imp of impuestosAplicables) {
        const liqDoc = d.liquidaciones.find(l => l.impuesto === imp);
        if (liqDoc && liqDoc.estado === 'presentada') g.liqPresentadas++;
        else g.liqPendientes++;
      }

      for (const v of d.vencimientos) {
        if (v.estado !== 'pendiente') continue;
        if (v.fecha < hoyStr) {
          g.vencVencidos++;
        } else {
          const dias = Math.ceil((new Date(v.fecha) - new Date(hoyStr)) / 86400000);
          if (dias <= 7) g.vencProximos++;
        }
      }

      g.consultasSinResponder += d.consultas.filter(c => !c.respuesta).length;
    }

    return [...grupos.values()].sort((a, b) => b.clientes - a.clientes);
  }

  // ── RENDER ───────────────────────────────────────────────────
  // Íconos de las tarjetas KPI — mismo trazo/estilo que los del rail en
  // index.html, así el vocabulario visual es consistente en todo el CRM.
  const DG_KPI_ICONOS = {
    honorarios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v20M17 6.5c0-1.9-2.2-3.5-5-3.5s-5 1.6-5 3.5 2.2 3.2 5 3.5c2.8.3 5 1.6 5 3.5s-2.2 3.5-5 3.5-5-1.6-5-3.5"/></svg>',
    comision:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 3v18h18M7 14l4-4 3 3 5-6"/></svg>',
    comprobantes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 9v4M12 17h.01M10.3 3.9L2.7 18a1.8 1.8 0 0 0 1.6 2.6h15.4a1.8 1.8 0 0 0 1.6-2.6L13.7 3.9a1.8 1.8 0 0 0-3.4 0z"/></svg>',
    vencimientos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 5h16v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 9h16M8 3v4M16 3v4M9 14l2 2 4-4"/></svg>',
    clientes:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.9"/></svg>',
  };

  // Los KPIs dejaron de repetir "sin comprobantes"/"vencimientos vencidos"
  // (31/08/2026): esos dos números ahora viven en "Para hoy", que además
  // lleva a la sección donde se resuelven. Acá quedó el estado del período —
  // cómo viene el mes — que es otra pregunta y no se respondía en ningún lado.
  function renderKPIsGlobales(g) {
    const facturado = g.facturadoPeriodo;
    const pctCobrado = facturado > 0 ? Math.round((g.cobradoPeriodo / facturado) * 100) : 0;
    const liqTotal = g.liqPresentadas + g.liqPendientes;
    const pctLiq = liqTotal > 0 ? Math.round((g.liqPresentadas / liqTotal) * 100) : 0;

    let kpis = [
      {
        icono: 'honorarios',
        label: 'Cobrado este período',
        valor: '$ ' + fmtPeso(g.cobradoPeriodo),
        sub:   `de $ ${fmtPeso(facturado)} facturado en el período`,
        pct:   pctCobrado,
        clase: pctCobrado >= 80 ? 'ok' : pctCobrado >= 40 ? 'warn' : 'danger',
        destacado: true,
        accion: "window._dgIrA('dg-seccion-honorarios')",
        verMas: 'Buscar y cobrar →',
      },
      {
        icono: 'vencimientos',
        label: 'Liquidaciones del período',
        valor: `${g.liqPresentadas} / ${liqTotal}`,
        sub:   'presentadas',
        pct:   pctLiq,
        clase: pctLiq >= 80 ? 'ok' : pctLiq >= 40 ? 'warn' : 'danger',
        accion: 'window.irDDJJ()',
        verMas: 'Ver quién falta →',
      },
      {
        icono: 'clientes',
        label: 'Clientes en cartera',
        valor: g.totalClientes,
        sub:   `${g.ri} R.I. · ${g.mono} Monotributo`,
        clase: 'neutro',
        accion: 'window.irClientes()',
        verMas: 'Ver cartera →',
      },
    ];
    // "Comisión Finnix" vivía acá (KPI destacado, admin/super_admin only)
    // hasta el 24/09/2026 — se mudó junto con toda la sección "Comisiones y
    // cobranza del período" al panel Suscripciones (modules/admin/
    // suscripciones-panel.js): es la economía de Finnix, no la operación
    // diaria del estudio (ver CLAUDE.md, reorganización Estudio/Finnix/.OS).
    // Con esto, el KPI row del admin queda con la misma forma que el del
    // contador (3 tiles) — dejó de hacer falta distinguirlos acá, así que
    // se sacó el parámetro `esContador` de esta función.
    document.getElementById('dg-kpis').innerHTML = kpis.map(k => `
      <button type="button" class="dg-kpi dg-kpi-${k.clase}${k.destacado ? ' dg-kpi-destacado' : ''}" onclick="${k.accion}">
        <span class="dg-kpi-icon" aria-hidden="true">${DG_KPI_ICONOS[k.icono]}</span>
        <span class="dg-kpi-label">${k.label}</span>
        <div class="dg-kpi-valor">${k.valor}</div>
        <div class="dg-kpi-sub">${k.sub}</div>
        ${k.pct === undefined ? '' : `
          <div class="dg-kpi-barra" role="img" aria-label="${k.pct}%">
            <span style="width:${k.pct}%"></span>
          </div>
        `}
        <span class="dg-kpi-flecha">${k.verMas}</span>
      </button>
    `).join('');
  }

  function renderHistorico(historico) {
    const el = document.getElementById('dg-historico');
    if (!historico.length) {
      el.innerHTML = `<div class="dg-empty-mini">Sin cobros registrados todavía.</div>`;
      return;
    }
    const max = Math.max(...historico.map(([, monto]) => monto), 1);
    el.innerHTML = historico.map(([periodo, monto]) => {
      const pct = Math.max(4, Math.round((monto / max) * 100));
      return `
        <div class="dg-hist-row${monto === max ? ' es-max' : ''}">
          <span class="dg-hist-periodo">${periodoLabel(periodo)}</span>
          <div class="dg-hist-barwrap"><div class="dg-hist-bar" style="width:${pct}%"></div></div>
          <span class="dg-hist-valor">$ ${fmtPeso(monto)}</span>
        </div>
      `;
    }).join('');
  }

  function renderTablaContadores(grupos) {
    const tbody = document.getElementById('dg-tbody-contadores');
    if (!grupos.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="dg-empty">Sin datos</td></tr>`;
      return;
    }
    // data-label en cada celda: en el celu la tabla se convierte en tarjetas
    // y cada valor muestra su etiqueta con ::before (ver el @media de abajo,
    // mismo truco que comprobantes.js/motor-iva.js).
    tbody.innerHTML = grupos.map(g => `
      <tr onclick="window._dgAbrirDetalleContador('${g.uid}')">
        <td data-label="Contador">${esc(g.nombre)}</td>
        <td class="num" data-label="Clientes">${g.clientes} <span style="color:var(--text-3)">(${g.ri} RI · ${g.mono} Mono)</span></td>
        <td class="num" data-label="Liq. pendientes">${g.liqPendientes}</td>
        <td class="num" data-label="Liq. presentadas">${g.liqPresentadas}</td>
        <td class="num ${g.vencVencidos > 0 ? 'dg-venc-vencido' : ''}" data-label="Venc. vencidos">${g.vencVencidos}</td>
        <td class="num" data-label="Venc. próx. 7d">${g.vencProximos}</td>
        <td class="num ${g.consultasSinResponder > 0 ? 'dg-consultas-pend' : ''}" data-label="Consultas s/resp.">${g.consultasSinResponder}</td>
      </tr>
    `).join('');
  }

  // Refleja sinCbteAbierto en el DOM — se llama tanto desde el toggle
  // (click del usuario) como después de cada renderListaClickeable (para
  // no perder el estado abierto/cerrado al cambiar de período).
  function aplicarEstadoSinCbte() {
    const btn = document.getElementById('dg-toggle-sin-cbte');
    const lista = document.getElementById('dg-lista-sin-cbte');
    if (!btn || !lista) return;
    btn.setAttribute('aria-expanded', String(sinCbteAbierto));
    lista.style.display = sinCbteAbierto ? '' : 'none';
    document.getElementById('dg-chevron-sin-cbte').textContent = sinCbteAbierto ? '▾' : '▸';
  }

  function toggleSinCbte() {
    sinCbteAbierto = !sinCbteAbierto;
    aplicarEstadoSinCbte();
  }

  // Cada fila decía solo el nombre y "R.I./Mono · <la misma frase del título>",
  // que no agregaba nada. Ahora dice de quién es el cliente y, en la lista de
  // vencidos, qué impuesto es y cuántos días lleva — que es lo que decide a
  // quién llamar primero, sin tener que abrir la ficha de cada uno.
  function renderListaClickeable(elId, lista, detalle) {
    const el = document.getElementById(elId);
    if (!lista.length) {
      el.innerHTML = `<div class="dg-empty">Ninguno 🎉</div>`;
      return;
    }
    el.innerHTML = lista.map(c => `
      <div class="dg-lista-item" onclick="window.seleccionarCliente('${c.id}')">
        <span class="dg-lista-item-nombre">
          ${esc(c.razon_social) || '—'}
          <span class="dg-lista-chip">${c.tipo === 'ri' ? 'R.I.' : 'Mono'}</span>
        </span>
        <span class="dg-lista-item-meta">
          <span class="dg-lista-contador">${esc(c.contador_nombre) || 'Sin contador asignado'}</span>
          ${detalle ? `<span class="dg-lista-detalle">${detalle(c)}</span>` : ''}
        </span>
      </div>
    `).join('');
  }

  const IMPUESTO_LABEL = {
    iva: 'IVA', iibb: 'IIBB', monotributo: 'Monotributo',
    ganancias: 'Ganancias', bienes_personales: 'BB.PP.', otro: 'Otro',
  };

  function detalleVencido(c) {
    const v = c._venc;
    if (!v) return '';
    const nombre = IMPUESTO_LABEL[v.impuesto] || v.descripcion || 'Vencimiento';
    const dias = c._vencDias === 0 ? 'vence hoy'
      : c._vencDias === 1 ? '1 día de atraso'
      : `${c._vencDias} días de atraso`;
    const otros = c._vencTotal > 1 ? ` · +${c._vencTotal - 1} más` : '';
    return `<span class="dg-lista-alerta">${nombre} — ${dias}</span>${otros}`;
  }

  // ── DETALLE POR CONTADOR (drill-down) ────────────────────────
  function abrirDetalleContador(uid) {
    const clientesDelContador = detalles.filter(d => (d.cliente.contador_uid || 'sin_asignar') === uid);
    const nombreContador = uid === 'sin_asignar'
      ? 'Sin asignar'
      : (usersById.get(uid)?.nombre || usersById.get(uid)?.email || uid);

    document.getElementById('dg-detalle-titulo').textContent = nombreContador;

    const opcionesContadores = ['<option value="">Sin asignar</option>']
      .concat([...usersById.entries()].map(([u2id, u2]) =>
        `<option value="${u2id}">${u2.nombre || u2.email || u2id}</option>`
      )).join('');

    document.getElementById('dg-detalle-body').innerHTML = clientesDelContador.length
      ? clientesDelContador.map(d => {
          const pendientes = d.honorarios.filter(h => h.estado === 'pendiente');
          const totalPend  = pendientes.reduce((s, h) => s + (h.monto || 0), 0);
          return `
            <div class="dg-cliente-card">
              <div class="dg-cliente-card-top">
                <div>
                  <div class="dg-cliente-nombre">${esc(d.cliente.razon_social) || '—'}</div>
                  <div class="dg-cliente-meta">${d.cliente.tipo === 'ri' ? 'R.I.' : 'Mono'} · ${totalPend > 0 ? `$ ${fmtPeso(totalPend)} pendiente` : 'Al día'}</div>
                </div>
              </div>
              <div class="dg-cliente-acciones">
                <button type="button" class="dg-btn-mini" onclick="window._dgVerCliente('${d.cliente.id}')">Ver ficha</button>
                <button type="button" class="dg-btn-mini" onclick="window._dgEditarCliente('${d.cliente.id}')">Editar datos</button>
                <select class="dg-select-mini" onchange="window._dgReasignar('${d.cliente.id}', this.value)">
                  ${opcionesContadores.replace(`value="${uid}"`, `value="${uid}" selected`)}
                </select>
              </div>
              ${pendientes.length ? `
                <div class="dg-hon-lista">
                  ${pendientes.map(h => `
                    <div class="dg-hon-row">
                      <span class="dg-hon-row-info">${h.concepto || h.periodo || '—'} · $ ${fmtPeso(h.monto)}</span>
                      <button type="button" class="dg-btn-mini" onclick="window._dgMarcarCobrado('${d.cliente.id}','${h._id}')">Marcar cobrado</button>
                    </div>
                  `).join('')}
                </div>
              ` : `<div class="dg-empty-mini">Sin honorarios pendientes.</div>`}
            </div>
          `;
        }).join('')
      : `<div class="dg-empty">Este contador no tiene clientes asignados.</div>`;

    document.getElementById('dg-detalle-modal-bg').style.display = 'flex';
  }

  function cerrarDetalle(e) {
    if (!e || e.target === document.getElementById('dg-detalle-modal-bg')) {
      document.getElementById('dg-detalle-modal-bg').style.display = 'none';
    }
  }

  async function marcarCobrado(clienteId, honorarioId) {
    try {
      await setDoc(doc(db, `clientes/${clienteId}/honorarios`, honorarioId), {
        estado: 'cobrado',
        fecha_cobro: new Date().toISOString(),
      }, { merge: true });
      window._toast('Honorario marcado como cobrado', 'ok');
      document.getElementById('dg-detalle-modal-bg').style.display = 'none';
      await cargar();
    } catch (e) {
      console.error(e);
      window._toast(window._mensajeError(e, 'Error al marcar el honorario'), 'error');
    }
  }

  // ── BÚSQUEDA DE HONORARIOS (buscar cliente → pago → comprobante) ────
  function buscarHonorarios() {
    const termino = (document.getElementById('dg-honbusq-input').value || '').trim().toLowerCase();
    const el = document.getElementById('dg-honbusq-resultados');

    if (!termino) {
      el.innerHTML = `<div class="dg-empty">Escribí el nombre o el CUIT de un cliente para ver sus
        honorarios, marcarlos cobrados y generar el comprobante.</div>`;
      return;
    }

    // Tope de 8 clientes en pantalla — un término de 1-2 letras en una
    // cartera grande podría matchear decenas, y esto es para encontrar UN
    // cliente puntual rápido, no para listar la cartera entera.
    const coincidencias = detalles.filter((d) =>
      (d.cliente.razon_social || '').toLowerCase().includes(termino) ||
      (d.cliente.cuit || '').includes(termino)
    ).slice(0, 8);

    if (!coincidencias.length) {
      el.innerHTML = '<div class="dg-empty">Sin resultados.</div>';
      return;
    }

    el.innerHTML = coincidencias.map((d) => {
      const honorarios = [...d.honorarios].sort((a, b) => (b.periodo || '').localeCompare(a.periodo || ''));
      return `
        <div class="dg-honbusq-cliente">
          <div class="dg-honbusq-cliente-nombre">
            ${d.cliente.razon_social || '—'}
            <span class="dg-honbusq-cliente-cuit">${d.cliente.cuit || ''}</span>
          </div>
          ${honorarios.length ? honorarios.map((h) => `
            <div class="dg-honbusq-row">
              <span>${periodoLabel(h.periodo)} · ${h.concepto || '—'} · $ ${fmtPeso(h.monto)}</span>
              <div class="dg-honbusq-row-acciones">
                <span class="dg-honbusq-badge ${h.estado === 'cobrado' ? 'is-cobrado' : 'is-pendiente'}">
                  ${h.estado === 'cobrado' ? 'Cobrado' : 'Pendiente'}
                </span>
                <button type="button" class="fx-btn-ghost is-small"
                        onclick="window._dgToggleCobradoHon('${d.cliente.id}','${h._id}',${h.estado !== 'cobrado'})">
                  ${h.estado === 'cobrado' ? '↺ Deshacer' : '✓ Marcar cobrado'}
                </button>
                ${h.estado !== 'cobrado' && COBRO_MP_HONORARIOS ? `
                  <button type="button" class="fx-btn-ghost is-small"
                          onclick="window._dgCobrarMPHon('${d.cliente.id}','${h._id}')">💳 Cobrar</button>
                ` : ''}
                <button type="button" class="fx-btn-ghost is-small"
                        onclick="window._dgComprobanteHon('${d.cliente.id}','${h._id}')">🧾 Comprobante</button>
                ${d.cliente.telefono ? `
                  <button type="button" class="fx-btn-ghost is-small"
                          onclick="window._dgWhatsappHon('${d.cliente.id}','${h._id}')">📱 WhatsApp</button>
                ` : ''}
              </div>
            </div>
          `).join('') : '<div class="dg-empty-mini">Sin honorarios cargados.</div>'}
        </div>
      `;
    }).join('');
  }

  // Actualiza en memoria (detalles) y re-renderiza solo los resultados de
  // la búsqueda — a diferencia de marcarCobrado() (drill-down por
  // contador), evita un cargar() completo: más rápido y no pierde lo que
  // el usuario tenía escrito en el buscador. Soporta las dos direcciones
  // (a diferencia de marcarCobrado(), que solo marca cobrado).
  async function toggleCobradoHonorario(clienteId, honorarioId, marcarComoCobrado) {
    try {
      const fechaCobro = marcarComoCobrado ? new Date().toISOString() : null;
      await setDoc(doc(db, `clientes/${clienteId}/honorarios`, honorarioId), {
        estado: marcarComoCobrado ? 'cobrado' : 'pendiente',
        fecha_cobro: fechaCobro,
      }, { merge: true });

      const d = detalles.find((x) => x.cliente.id === clienteId);
      const h = d?.honorarios.find((x) => x._id === honorarioId);
      if (h) {
        h.estado = marcarComoCobrado ? 'cobrado' : 'pendiente';
        h.fecha_cobro = fechaCobro;
      }

      window._toast(marcarComoCobrado ? 'Honorario marcado como cobrado' : 'Honorario marcado como pendiente', 'ok');
      buscarHonorarios();
    } catch (e) {
      console.error(e);
      window._toast(window._mensajeError(e, 'Error al actualizar el honorario'), 'error');
    }
  }

  // Comprobante — mismo mecanismo que exportar.js (ventana de impresión +
  // window.print(), sin librería de PDF: el contador elige "Guardar como
  // PDF" desde el diálogo de impresión del navegador). Colores neutros a
  // propósito, igual criterio que la DDJJ impresa — imprime bien en
  // blanco y negro.
  async function generarComprobanteHonorario(clienteId, honorarioId) {
    const d = detalles.find((x) => x.cliente.id === clienteId);
    const h = d?.honorarios.find((x) => x._id === honorarioId);
    if (!d || !h) { window._toast('No se encontró el honorario', 'error'); return; }
    // Sin valor fiscal y con el nombre del estudio (26/10/2026), el mismo de la ficha.
    const { imprimirComprobanteHonorario } = await import('../clientes/comprobante-honorario.js?v=' + window._appVersion);
    imprimirComprobanteHonorario({ cliente: d.cliente, honorario: h });
  }

  // WhatsApp — wa.me solo precarga texto, no puede adjuntar el PDF del
  // comprobante (limitación del propio link, no de este código): el
  // contador tiene que generarlo con el botón de al lado y adjuntarlo a
  // mano en la conversación que se abre acá. Deja de tener sentido este
  // paso manual el día que haya una integración real con la API de
  // WhatsApp Business — no la hay todavía, ver CLAUDE.md.
  function compartirWhatsappHonorario(clienteId, honorarioId) {
    const d = detalles.find((x) => x.cliente.id === clienteId);
    const h = d?.honorarios.find((x) => x._id === honorarioId);
    if (!d || !h) { window._toast('No se encontró el honorario', 'error'); return; }

    const telefono = (d.cliente.telefono || '').replace(/\D/g, '');
    if (!telefono) { window._toast('Este cliente no tiene teléfono cargado', 'error'); return; }

    const mensaje = `Hola${d.cliente.razon_social ? ' ' + d.cliente.razon_social : ''}, te comparto el comprobante de honorarios de ${periodoLabel(h.periodo)} (${h.concepto || 'honorarios'}) por $ ${fmtPeso(h.monto)}.`;
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank');
  }

  // Cobro con MercadoPago (functions/lib/honorarios-mercadopago.js) — crea
  // (o reusa, si ya existía) un link de pago real y lo manda directo por
  // WhatsApp si el cliente tiene teléfono cargado; si no, lo copia al
  // portapapeles. Requiere MP_ACCESS_TOKEN cargado en Secret Manager (ver
  // CLAUDE.md "Cobro de honorarios (MercadoPago)") — sin eso, la callable
  // corta con un error claro en vez de fallar oscuro, mismo criterio que
  // emitirFacturaElectronica con el certificado de ARCA.
  async function cobrarConMercadoPago(clienteId, honorarioId) {
    const d = detalles.find((x) => x.cliente.id === clienteId);
    const h = d?.honorarios.find((x) => x._id === honorarioId);
    if (!d || !h) { window._toast('No se encontró el honorario', 'error'); return; }

    try {
      const fn = window._httpsCallable(window._functions, 'crearLinkPagoHonorario');
      const res = await fn({ clienteId, honorarioId });
      const link = res.data.link;
      h.pago_mp_link = link; // evita pedir uno nuevo si se vuelve a tocar el botón

      const telefono = (d.cliente.telefono || '').replace(/\D/g, '');
      if (telefono) {
        const mensaje = `Hola${d.cliente.razon_social ? ' ' + d.cliente.razon_social : ''}, te paso el link para pagar tus honorarios de ${periodoLabel(h.periodo)} (${h.concepto || 'honorarios'}) por $ ${fmtPeso(h.monto)}: ${link}`;
        window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank');
      } else {
        try {
          await navigator.clipboard.writeText(link);
          window._toast('Link de pago copiado al portapapeles', 'ok');
        } catch {
          window._toast('Link de pago: ' + link, 'ok');
        }
      }
    } catch (e) {
      console.error('Error al generar el link de pago:', e);
      window._toast(window._mensajeError(e, 'No se pudo generar el link de pago'), 'error');
    }
  }

  async function reasignar(clienteId, nuevoContadorUid) {
    try {
      // Denormalizamos nombre/email igual que en alta.js — finnix-app lee
      // el contador asignado desde el propio doc de /clientes/, no desde
      // /crm_users/ (sin permiso para el rol cliente_app).
      const nuevoContador = nuevoContadorUid ? usersById.get(nuevoContadorUid) : null;
      await setDoc(doc(db, 'clientes', clienteId), {
        contador_uid:    nuevoContadorUid || null,
        contador_nombre: nuevoContador?.nombre || nuevoContador?.email || null,
        contador_email:  nuevoContador?.email || null,
      }, { merge: true });
      window._toast('Contador reasignado', 'ok');
      document.getElementById('dg-detalle-modal-bg').style.display = 'none';
      await cargar();
    } catch (e) {
      console.error(e);
      window._toast(window._mensajeError(e, 'Error al reasignar'), 'error');
    }
  }

  async function editarCliente(clienteId) {
    const d = detalles.find(x => x.cliente.id === clienteId);
    if (!d) return;
    // Cerrar el modal de detalle antes de abrir el de edición: el de
    // edición usa un z-index más bajo, quedaría tapado si no.
    document.getElementById('dg-detalle-modal-bg').style.display = 'none';
    const { initAltaCliente } = await import('../clientes/alta.js?v=' + window._appVersion);
    initAltaCliente(db, async () => {
      await cargar();
    }, d.cliente);
    window._altaAbrir();
  }

  // "🔔 Recordatorio" en una tarjeta del kanban de Comunicaciones — mismo
  // modal que el botón de la ficha del cliente (ver modules/clientes/
  // recordatorio.js), solo que se abre directo desde acá sin tener que
  // primero entrar a ese cliente. `d.cliente` ya lo tenemos en `detalles`
  // (mismo query que arma el kanban), no hace falta pedirlo de nuevo.
  async function abrirRecordatorioDesdeKanban(clienteId) {
    const d = detalles.find(x => x.cliente.id === clienteId);
    if (!d) return;
    const { initRecordatorio } = await import('../clientes/recordatorio.js?v=' + window._appVersion);
    initRecordatorio(d.cliente);
    window._recAbrir();
  }

  async function abrirImportarDDJJ() {
    const { initImportarDDJJ } = await import('../liquidacion/importar-ddjj.js?v=' + window._appVersion);
    initImportarDDJJ(db, async () => { await cargar(); });
    window._ddjjAbrir();
  }

  async function abrirImportarDeudas() {
    const { initImportarDeudas } = await import('../liquidacion/importar-deudas.js?v=' + window._appVersion);
    initImportarDeudas(db, async () => { await cargar(); });
    window._deuAbrir();
  }

  async function abrirImportarComprobantes() {
    const { initImportarComprobantesMasivo } = await import('../liquidacion/importar-comprobantes-masivo.js?v=' + window._appVersion);
    initImportarComprobantesMasivo(db, async () => { await cargar(); });
    window._cbtemAbrir();
  }

  function verCliente(clienteId) {
    document.getElementById('dg-detalle-modal-bg').style.display = 'none';
    window.seleccionarCliente(clienteId);
  }

  // ── UTILS ────────────────────────────────────────────────────
  function fmtPeso(n) {
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  }

  // ── EXPORTAR HONORARIOS (CSV, abre bien en Excel) ────────────────
  // "↓ Exportar honorarios (Excel)" en el header — vuelca los honorarios
  // del período elegido (los mismos ya cargados en `detalles`, sin
  // ningún query nuevo) para que el estudio los lleve a su propia
  // contabilidad. Disponible en las dos vistas (admin: toda la cartera;
  // contador: la suya) — a diferencia de "Cargar masivo", esto no toca
  // datos de otros contadores, solo lee lo que cada uno ya ve en pantalla.
  function csvEscape(v) {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportarHonorariosCSV(esAdmin = true) {
    const filas = [];
    detalles.forEach((d) => {
      d.honorarios.forEach((h) => {
        const fila = [
          d.cliente.razon_social || '',
          d.cliente.cuit || '',
          d.cliente.contador_nombre || '',
          h.periodo || '',
          h.concepto || '',
          fmtPeso(h.monto),
        ];
        // Solo incluir comisiones si es admin
        if (esAdmin) {
          fila.push(
            h.pct_finnix ?? '',
            fmtPeso(h.comision_finnix),
            fmtPeso(h.comision_estudio),
          );
        }
        fila.push(
          h.estado || '',
          h.fecha_cobro ? h.fecha_cobro.slice(0, 10) : '',
          h.origen || '',
        );
        filas.push(fila);
      });
    });

    if (!filas.length) {
      window._toast('Sin honorarios cargados en este período', 'error');
      return;
    }

    const headers = ['Cliente', 'CUIT', 'Contador', 'Período', 'Concepto', 'Monto'];
    if (esAdmin) {
      headers.push('% Finnix', 'Comisión Finnix', 'Comisión Estudio');
    }
    headers.push('Estado', 'Fecha cobro', 'Origen');

    const lineas = [headers, ...filas].map((fila) => fila.map(csvEscape).join(';'));
    // Separador ";" (no ",") y BOM UTF-8 al inicio: mismo criterio que el
    // export de ARCA en comprobantes.js — Excel en configuración regional
    // Argentina usa "," como separador decimal, así que interpreta un CSV
    // separado por comas como una sola columna; y sin el BOM, los acentos
    // y la "ñ" se rompen al abrirlo directo (doble click) en Windows.
    const contenido = '\ufeff' + lineas.join('\r\n');
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const periodo = document.getElementById('dg-periodo').value;
    const a = document.createElement('a');
    a.href = url;
    a.download = `honorarios_${periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    window._toast('Excel de honorarios generado', 'ok');
  }
  // `fecha` en /consultas/ es un Timestamp de Firestore (lo escribe
  // finnix-app) — mismo patrón .toDate() que ya usa consultas.js.
  function tsToMillis(fecha) {
    if (!fecha) return 0;
    if (typeof fecha.toDate === 'function') return fecha.toDate().getTime();
    const d = new Date(fecha);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  function formatRelativo(fecha) {
    const ms = tsToMillis(fecha);
    if (!ms) return '—';
    const diffMin = Math.floor((Date.now() - ms) / 60000);
    if (diffMin < 1)  return 'recién';
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `hace ${diffH} h`;
    const diffD = Math.floor(diffH / 24);
    return diffD === 1 ? 'hace 1 día' : `hace ${diffD} días`;
  }
  function iniciales(nombre) {
    return (nombre || '').split(/\s+/).filter(Boolean).slice(0, 2)
      .map(w => w[0].toUpperCase()).join('') || '—';
  }
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  function periodoLabel(p) {
    if (!p || p.length !== 6) return p || '—';
    return `${MESES[parseInt(p.slice(4,6))-1]} ${p.slice(0,4)}`;
  }
  function generarOpcionesPeriodos(defaultOffset = 0) {
    const opts = []; const hoy = new Date();
    for (let i = 0; i < 24; i++) {
      const d   = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const val = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
      const lbl = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      opts.push(`<option value="${val}" ${i === defaultOffset ? 'selected' : ''}>${lbl.charAt(0).toUpperCase() + lbl.slice(1)}</option>`);
    }
    return opts.join('');
  }

  // ── EXPONER GLOBAL ───────────────────────────────────────────
  window._dgCargar                 = cargar;
  window._dgAbrirDetalleContador   = abrirDetalleContador;
  window._dgDetalleCerrar          = cerrarDetalle;
  window._dgMarcarCobrado          = marcarCobrado;
  window._dgReasignar              = reasignar;
  window._dgEditarCliente          = editarCliente;
  window._dgVerCliente             = verCliente;
  window._dgAbrirImportarDDJJ      = abrirImportarDDJJ;
  window._dgAbrirImportarComprobantes = abrirImportarComprobantes;
  window._dgAbrirImportarDeudas    = abrirImportarDeudas;
  window._dgResolverConsulta       = marcarConsultaResuelta;
  window._dgReabrirConsulta        = reabrirConsulta;
  window._dgAbrirRecordatorio      = abrirRecordatorioDesdeKanban;
  window._dgIrA           = irASeccion;
  window._dgToggleSinCbte          = toggleSinCbte;
  window._dgExportarHonorarios     = () => exportarHonorariosCSV(!contadorUid);
  window._dgBuscarHonorarios       = buscarHonorarios;
  window._dgToggleCobradoHon       = toggleCobradoHonorario;
  window._dgComprobanteHon         = generarComprobanteHonorario;
  window._dgWhatsappHon            = compartirWhatsappHonorario;
  window._dgCobrarMPHon            = cobrarConMercadoPago;

  await cargar();
}
