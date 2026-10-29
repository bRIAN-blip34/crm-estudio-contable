// ── SECCIONES DEL ESTUDIO (25/09/2026, reorganizada el mismo día) ──
// Reemplaza a los botones que hasta el 24/09/2026 vivían en el rail
// global (Enlaces de Onboarding, Clientes Pendientes, Verificación,
// Monotributo, DDJJ, Seguimiento, Recursos Laborales) — pedido explícito
// del usuario: "se ve muy mezclado" y "ese índice al costado izquierdo me
// parece cargado". Se muestra siempre junto con dashboard-general.js en
// el Panel principal (ver irInicio()/mostrarApp() en index.html), nunca
// sola — dos módulos que arman dos partes de la misma pantalla.
//
// Segunda vuelta, mismo día: "Clientes" había quedado con los botones de
// alta/importación mezclados otra vez (el mismo problema, en otra
// pantalla) — "sale el tema de nuevo cliente y reasignación... tendría
// que estar en otra sección". Ahora:
// - "Clientes" es SOLO buscar y ver la ficha.
// - "Altas de clientes" (modules/admin/altas-clientes.js) agrupa las 4
//   acciones que antes vivían en el sidebar (alta individual, importar
//   Excel/CSV, reasignar contador masivo, cargar contactos masivo).
// - "Comprobantes"/"Deudas"/"DDJJ masivo" son 3 tarjetas propias — antes
//   una sola tarjeta ("Importar comprobantes / archivos") tapaba estas
//   tres cargas masivas distintas bajo un solo nombre confuso.
//
// Puramente de navegación, sin ninguna lectura a Firestore — mismo
// criterio que mundos.js: liviana, nada que pueda fallar al cargar. Cada
// tarjeta llama a una función ya existente en window (irClientes/
// irOnboardingLinks/etc., definidas en index.html) o abre un modal ya
// existente (Comprobantes/Deudas/DDJJ masivo, mismo mecanismo que ya usa
// dashboard-general.js) — no hay lógica de negocio nueva acá.
export function renderSeccionesEstudio(container, { rol, dueno, puedeLaboral, estudioFinnix = true }) {
  const esContador = rol === 'contador';

  // Agrupadas por tema con su nombre (11/10/2026, pedido de Aleja: "que no
  // se mezcle la información"): primero todo lo de clientes, después
  // impuestos y cargas masivas, al final seguimiento y avisos.
  const grupos = [
    // Día a día (12/10/2026): el panel con números pasó a ser una tarjeta
    // que se abre a pantalla completa, junto al tablero de tareas del mes.
    {
      nombre: 'Día a día',
      tintVar: '--violet-2',
      bg: 'rgba(167,139,250,.14)',
      cards: [
        {
          icono: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
          titulo: esContador ? 'Mi resumen' : 'Panel de administrador',
          desc: esContador ? 'Tus clientes, cobranza y consultas en números' : 'Toda la cartera en números: cobranza, consultas, alertas',
          onclick: 'window.irPanelAdmin()',
        },
        {
          icono: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="m8.5 14.5 2 2 4-4"/>',
          titulo: 'Tareas del mes',
          desc: 'Qué se presentó de cada cliente, quién lo hace, anotaciones y recordatorios',
          onclick: 'window.irTareas()',
        },
      ],
    },
    {
      nombre: 'Clientes',
      tintVar: '--accent-2',
      bg: 'rgba(91,139,255,.14)',
      cards: [
        {
          icono: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
          titulo: 'Clientes',
          desc: 'Buscar y ver la ficha de un cliente',
          onclick: 'window.irClientes()',
        },
        {
          icono: '<path d="M12 5v14"/><path d="M5 12h14"/>',
          titulo: 'Altas de clientes',
          desc: 'Alta individual, importar Excel/CSV, reasignar contador',
          onclick: 'window.irAltasClientes()',
        },
        // Contactos web y Servicios del estudio son del estudio de Finnix (los
        // pedidos de finnix.ar y su catálogo): un estudio en prueba no los tiene.
        ...(estudioFinnix ? [{
          icono: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>',
          titulo: 'Contactos web',
          desc: esContador ? 'Pedidos de finnix.ar asignados a vos' : 'Pedidos de finnix.ar, repartidos entre contadores',
          onclick: 'window.irContactosWeb()',
        }] : []),
        // Enlaces de Onboarding y Clientes Pendientes: para quien maneja
        // Finnix viven en Finnix — mi negocio → Altas (07/10/2026).
        ...(dueno ? [] : [{
          icono: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
          titulo: 'Enlaces de Onboarding',
          desc: 'Link público de alta para un prospecto nuevo',
          onclick: 'window.irOnboardingLinks()',
        }]),
        // Guías de Finnix (26/10/2026): para el contador y sus clientes, imprimibles.
        {
          icono: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
          titulo: 'Guías de Finnix',
          desc: 'Qué hace y qué no, facturación en ARCA, la app de tus clientes',
          onclick: 'window._abrirGuias()',
        },
        // Estudio en prueba (26/10/2026): su link de Terminal OS y su comisión.
        ...(estudioFinnix ? [] : [{
          icono: '<path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
          titulo: 'Recomendá Finnix y ganá',
          desc: 'Tu link de Terminal OS y lo que llevás ganado',
          onclick: 'window._abrirRecomendarEstudio()',
        }]),
        {
          icono: '<path d="M9 12l2 2 4-4"/><path d="M12 3l7.5 3.5v5c0 4.5-3 8.3-7.5 9.5-4.5-1.2-7.5-5-7.5-9.5v-5L12 3Z"/>',
          titulo: 'Verificación de datos',
          desc: 'Confirmaciones de clientes por revisar',
          onclick: 'window.irVerificacionDatos()',
        },
        ...(esContador || !estudioFinnix ? [] : [{
          icono: '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/>',
          titulo: 'Servicios del estudio',
          desc: 'Qué liquida el estudio y el honorario de cada servicio',
          onclick: 'window._seServiciosEstudio()',
        }]),
      ],
    },
    {
      nombre: 'Impuestos y cargas masivas',
      tintVar: '--warn-2',
      bg: 'rgba(255,176,61,.14)',
      cards: [
        {
          icono: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/><path d="M13 13l4 4M17 13l-4 4"/>',
          titulo: 'Carga masiva por Excel',
          desc: 'Honorarios, impuestos a pagar y deudas de muchos clientes de una vez',
          onclick: 'window._seCargaMasiva()',
        },
        {
          icono: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="M15.5 15.5l2 2 3-3" stroke-width="2.2"/>',
          titulo: 'DDJJ del período',
          desc: 'Quién liquidó IVA/IIBB de toda la cartera',
          onclick: 'window.irDDJJ()',
        },
        {
          icono: '<path d="M3 20h18"/><rect x="5" y="12" width="4" height="6"/><rect x="10" y="8" width="4" height="10"/><rect x="15" y="4" width="4" height="14"/>',
          titulo: 'Monotributo',
          desc: 'Quién está cerca de pasar de categoría',
          onclick: 'window.irMonotributo()',
        },
        ...(esContador ? [] : [
        {
          icono: '<path d="M21 15V6a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v9"/><path d="M12 12h.01"/><path d="M17 8h.01"/><rect x="3" y="9" width="6" height="9" rx="1"/>',
          titulo: 'Comprobantes',
          desc: 'Carga masiva — export de ARCA para toda la cartera',
          onclick: 'window._seImportarComprobantes()',
        },
        {
          icono: '<path d="M12 2v20"/><path d="M17 6.5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
          titulo: 'Deudas',
          desc: 'Carga masiva — CSV de ARCA/Rentas de scripts/deudas/',
          onclick: 'window._seImportarDeudas()',
        },
        {
          icono: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="M15.5 15.5l2 2 3-3" stroke-width="2.2"/>',
          titulo: 'Cargar DDJJ (masivo)',
          desc: 'Montos ya determinados, un período para toda la cartera',
          onclick: 'window._seImportarDDJJ()',
        },
        ]),
      ],
    },
    {
      nombre: 'Seguimiento y avisos',
      tintVar: '--teal-2',
      bg: 'rgba(53,224,200,.14)',
      cards: [
        {
          icono: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.3 12.2 2.4 2.4L16 9"/>',
          titulo: 'Seguimiento',
          desc: 'Campañas puntuales, cliente por cliente',
          onclick: 'window.irSeguimiento()',
        },
        // Quien maneja Finnix (admin/super_admin) avisa y ofrece desde
        // Finnix — mi negocio → Comunicación (07/10/2026): acá queda solo
        // para el contador.
        ...(dueno ? [] : [{
          icono: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
          titulo: 'Centro de Notificaciones',
          desc: 'Avisar a un cliente o a varios de una',
          onclick: 'window.irNotificaciones()',
        }]),
        ...(puedeLaboral ? [{
          icono: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
          titulo: 'Recursos Laborales',
          desc: 'Enlaces oficiales y paritarias',
          onclick: 'window.irRecursosLaborales()',
        }] : []),
      ],
    },
  ].filter((g) => g.cards.length > 0);

  const gruposHtml = grupos.map((g) => `
    <section class="se-grupo">
      <div class="se-grupo-nombre" style="--se-tint:var(${g.tintVar})">${g.nombre}</div>
      <div class="se-grid">${g.cards.map((c) => `
        <button type="button" class="se-card" style="--se-tint:var(${g.tintVar});--se-bg:${g.bg}" onclick="${c.onclick}">
          <div class="se-card-icono">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${c.icono}</svg>
          </div>
          <div class="se-card-texto">
            <div class="se-card-titulo">${c.titulo}</div>
            <div class="se-card-desc">${c.desc}</div>
          </div>
        </button>`).join('')}
      </div>
    </section>`).join('');

  container.innerHTML = `
    <div class="se-wrap">
      <div class="se-titulo">Secciones del estudio</div>
      ${gruposHtml}
    </div>
    <style>${ESTILOS}</style>
  `;
}

// "Comprobantes"/"Deudas"/"Cargar DDJJ (masivo)" (admin/super_admin —
// mismo corte que ya tenían estos 3 botones en dashboard-general.js, no
// ofrecidos a contador) abren el modal de carga masiva correspondiente
// directo, sin duplicar esos módulos — mismo mecanismo que ya usa
// dashboard-general.js (initImportarXxx + window._xxxAbrir, ver ese
// archivo). No recargan nada al cerrar (a diferencia de
// dashboard-general.js, que sí vuelve a pedir sus KPIs) — esta pantalla
// no tiene datos propios que puedan quedar desactualizados.
window._seImportarComprobantes = async function () {
  const { initImportarComprobantesMasivo } = await import('../liquidacion/importar-comprobantes-masivo.js?v=' + window._appVersion);
  initImportarComprobantesMasivo(window._db, async () => {});
  window._cbtemAbrir();
};

window._seImportarDeudas = async function () {
  const { initImportarDeudas } = await import('../liquidacion/importar-deudas.js?v=' + window._appVersion);
  initImportarDeudas(window._db, async () => {});
  window._deuAbrir();
};

// Servicios del estudio (12/10/2026): catálogo de lo que liquida el estudio,
// separado de los sistemas Finnix. Ver servicios-config.js.
window._seServiciosEstudio = async function () {
  const { initServiciosConfig } = await import('./servicios-config.js?v=' + window._appVersion);
  initServiciosConfig(window._db);
};

// Carga masiva por Excel (12/10/2026): honorarios, impuestos a pagar,
// deudas y trabajos extra. Ver liquidacion/carga-masiva.js.
window._seCargaMasiva = async function () {
  const { initCargaMasiva } = await import('../liquidacion/carga-masiva.js?v=' + window._appVersion);
  initCargaMasiva(window._db);
};

window._seImportarDDJJ = async function () {
  const { initImportarDDJJ } = await import('../liquidacion/importar-ddjj.js?v=' + window._appVersion);
  initImportarDDJJ(window._db, async () => {});
  window._ddjjAbrir();
};

const ESTILOS = `
  .se-wrap { display:flex; flex-direction:column; gap:14px; padding-bottom:22px; border-bottom:1px solid var(--border); }
  .se-titulo {
    font-size:12px; font-weight:600; color:var(--text-3); text-transform:uppercase;
    letter-spacing:.04em;
  }
  .se-grupo { display:flex; flex-direction:column; gap:10px; }
  .se-grupo-nombre { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:600; color:var(--text); }
  .se-grupo-nombre::before { content:""; width:8px; height:8px; border-radius:50%; background:var(--se-tint); }
  .se-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%,250px), 1fr)); gap:10px; }
  .se-card {
    background:var(--surface); border:1px solid var(--border); border-radius:10px;
    padding:12px 14px; display:flex; gap:12px; align-items:flex-start; text-align:left;
    cursor:pointer; font-family:var(--sans); width:100%;
    transition:border-color .12s, transform .12s;
  }
  .se-card:hover { border-color:var(--border-2); transform:translateY(-2px); }
  .se-card-icono {
    width:36px; height:36px; border-radius:9px; display:flex; align-items:center; justify-content:center;
    background:var(--se-bg, var(--surface2)); color:var(--se-tint, var(--accent-2)); flex-shrink:0;
  }
  .se-card-icono svg { width:18px; height:18px; }
  .se-card-titulo { font-size:14px; font-weight:600; color:var(--text); }
  .se-card-desc { font-size:11.5px; color:var(--text-3); margin-top:2px; line-height:1.4; }

  @media (max-width: 768px) {
    .se-grid { grid-template-columns:1fr; }
  }
`;
