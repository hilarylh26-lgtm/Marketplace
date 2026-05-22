import { formatCurrency, formatUnit, renderState, requireUser, supabase, userErrorMessage } from './supabase-config.js';

let currentUser = null;
let profile = null;
let transactions = [];
let publications = [];
let metrics = {
    managedTons: 0,
    activeDeals: 0,
    revenue: 0,
    co2Kg: 0,
    avoidedM3: 0,
    activePublications: 0
};

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function unitToTons(value, unit) {
    const amount = Number(value || 0);
    if (unit === 'kg') return amount / 1000;
    if (unit === 'tons') return amount;
    return 0;
}

function statusLabel(status) {
    const labels = {
        pendiente_efectivo: 'Pendiente efectivo',
        confirmada: 'Confirmada',
        entregada: 'Entregada',
        cancelada: 'Cancelada',
        available: 'Disponible',
        logistics: 'Logística'
    };
    return labels[status] || status || 'Sin estado';
}

function progressFor(status) {
    if (status === 'pendiente_efectivo') return 'w-1/3';
    if (status === 'confirmada') return 'w-2/3';
    if (status === 'entregada') return 'w-full';
    return 'w-1/6';
}

function calculateMetrics() {
    const relevantTransactions = transactions.filter((tx) => tx.estado !== 'cancelada');
    const completedTransactions = transactions.filter((tx) => tx.estado === 'entregada');
    const activeTransactions = transactions.filter((tx) => ['pendiente_efectivo', 'confirmada'].includes(tx.estado));

    const managedTons = relevantTransactions.reduce((sum, tx) => {
        const pub = tx.publicaciones || {};
        return sum + unitToTons(pub.volumen_tons, pub.unidad_medida);
    }, 0);

    const revenue = completedTransactions.reduce((sum, tx) => {
        if (tx.vendedor_id !== currentUser.id) return sum;
        return sum + Number(tx.precio_acordado || 0);
    }, 0);

    metrics = {
        managedTons,
        activeDeals: activeTransactions.length,
        revenue,
        co2Kg: managedTons * 300,
        avoidedM3: managedTons * 5,
        activePublications: publications.filter((item) => item.estado !== 'archived').length
    };
}

function renderKpis() {
    document.getElementById('kpi-grid').innerHTML = `
        <div class="bg-white p-5 rounded-xl border border-rsu_base stat-card shadow-sm">
            <p class="text-[10px] font-black text-slate-400 uppercase">Volumen Gestionado</p>
            <p class="text-2xl font-black text-rsu_dark italic">${metrics.managedTons.toFixed(2)} <small class="text-xs">Tons</small></p>
        </div>
        <div class="bg-white p-5 rounded-xl border border-rsu_base stat-card shadow-sm">
            <p class="text-[10px] font-black text-slate-400 uppercase">Tratos Activos</p>
            <p class="text-2xl font-black text-rsu_dark italic">${metrics.activeDeals} <small class="text-xs">Tratos</small></p>
        </div>
        <div class="bg-white p-5 rounded-xl border border-rsu_base stat-card shadow-sm">
            <p class="text-[10px] font-black text-slate-400 uppercase">Publicaciones</p>
            <p class="text-2xl font-black text-rsu_dark italic">${metrics.activePublications}</p>
        </div>
        <div class="bg-white p-5 rounded-xl border border-rsu_base stat-card shadow-sm">
            <p class="text-[10px] font-black text-slate-400 uppercase">Ingresos Cerrados</p>
            <p class="text-2xl font-black text-rsu_accent italic">${formatCurrency(metrics.revenue)}</p>
        </div>
    `;
}

function operationTemplate(tx) {
    const pub = tx.publicaciones || {};
    const quantity = `${pub.volumen_tons || 0} ${formatUnit(pub.unidad_medida)}`;
    const role = tx.vendedor_id === currentUser.id ? 'Venta' : 'Compra';

    return `
        <article class="bg-white rounded-xl border border-rsu_base overflow-hidden shadow-sm">
            <div class="p-6">
                <div class="flex justify-between items-start mb-4 gap-4">
                    <div>
                        <span class="bg-rsu_gold/20 text-rsu_dark text-[9px] font-black px-2 py-1 rounded uppercase">${statusLabel(tx.estado)}</span>
                        <h3 class="text-xl font-black text-rsu_dark mt-2 uppercase italic">${escapeHtml(quantity)} ${escapeHtml(pub.titulo || 'Publicación')}</h3>
                        <p class="text-[10px] font-bold text-slate-400 uppercase"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(pub.ubicacion || profile?.ubicacion || 'Sin ubicación')}</p>
                        <p class="text-[10px] font-bold text-slate-400 uppercase mt-1">${role} en efectivo</p>
                    </div>
                    <div class="text-right">
                        <p class="text-lg font-black text-rsu_dark">${formatCurrency(tx.precio_acordado)}</p>
                        <p class="text-[9px] font-bold text-slate-400 uppercase">ID: ${escapeHtml(tx.id.slice(0, 8))}</p>
                    </div>
                </div>
                <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-6">
                    <div class="bg-rsu_gold ${progressFor(tx.estado)} h-full"></div>
                </div>
                <div class="flex flex-col md:flex-row gap-4">
                    <button onclick="window.location.href='transacciones.html'" class="flex-1 bg-rsu_dark text-white font-black py-3 rounded text-[10px] uppercase tracking-widest hover:bg-rsu_accent transition">Ver Transacción</button>
                    <button onclick="window.location.href='chat.html?publicacion=${encodeURIComponent(tx.publicacion_id)}'" class="flex-1 border-2 border-rsu_dark text-rsu_dark font-black py-3 rounded text-[10px] uppercase tracking-widest hover:bg-slate-50 transition">Abrir Chat</button>
                </div>
            </div>
        </article>
    `;
}

function publicationTemplate(publication) {
    return `
        <article class="bg-white rounded-xl border border-rsu_base p-5 shadow-sm">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <span class="text-[9px] font-black text-rsu_dark bg-rsu_gold/20 px-2 py-1 rounded uppercase">${statusLabel(publication.estado)}</span>
                    <h3 class="text-lg font-black text-rsu_dark mt-2 uppercase">${escapeHtml(publication.titulo || 'Publicación')}</h3>
                    <p class="text-[10px] text-slate-400 font-bold uppercase">${escapeHtml(publication.ubicacion || profile?.ubicacion || 'Sin ubicación')}</p>
                </div>
                <div class="text-left md:text-right">
                    <p class="text-sm font-black text-rsu_dark">${Number(publication.volumen_tons || 0)} ${formatUnit(publication.unidad_medida)}</p>
                    <p class="text-sm font-black text-rsu_accent">${formatCurrency(publication.precio)}</p>
                </div>
            </div>
        </article>
    `;
}

function renderOperations() {
    const activeTransactions = transactions
        .filter((tx) => ['pendiente_efectivo', 'confirmada'].includes(tx.estado))
        .slice(0, 5);

    const list = document.getElementById('operations-list');

    if (activeTransactions.length > 0) {
        list.innerHTML = activeTransactions.map(operationTemplate).join('');
        return;
    }

    if (publications.length > 0) {
        list.innerHTML = publications.slice(0, 5).map(publicationTemplate).join('');
        return;
    }

    renderState(list, 'Tu panel está listo', 'Publica tu primer lote para empezar a recibir negociaciones.', {
        label: 'Crear publicación',
        href: 'publicar.html'
    });
}

function renderAlerts() {
    const alerts = [];
    const pending = transactions.filter((tx) => tx.estado === 'pendiente_efectivo').length;

    if (pending > 0) {
        alerts.push(`
            <div class="bg-rsu_accent/5 border border-rsu_accent/20 p-4 rounded-lg">
                <p class="text-[10px] font-black text-rsu_accent uppercase mb-1">Tratos pendientes</p>
                <p class="text-xs font-medium text-slate-700">Tienes ${pending} trato(s) en efectivo pendientes de confirmar o coordinar.</p>
                <a href="transacciones.html" class="text-[9px] font-black text-rsu_accent uppercase mt-2 block hover:underline">Revisar transacciones</a>
            </div>
        `);
    }

    if (publications.length === 0) {
        alerts.push(`
            <div class="bg-slate-100 p-4 rounded-lg border border-rsu_base">
                <p class="text-[10px] font-black text-rsu_dark uppercase mb-1">Sin publicaciones activas</p>
                <p class="text-xs font-medium text-slate-700">Publica un lote para empezar a recibir negociaciones.</p>
                <a href="publicar.html" class="text-[9px] font-black text-rsu_accent uppercase mt-2 block hover:underline">Crear publicación</a>
            </div>
        `);
    }

    if (!profile?.ubicacion) {
        alerts.push(`
            <div class="bg-slate-100 p-4 rounded-lg border border-rsu_base">
                <p class="text-[10px] font-black text-rsu_dark uppercase mb-1">Ubicación pendiente</p>
                <p class="text-xs font-medium text-slate-700">Configura tu región para mejorar el filtrado de operaciones cercanas.</p>
                <a href="configuracion.html" class="text-[9px] font-black text-rsu_accent uppercase mt-2 block hover:underline">Abrir configuración</a>
            </div>
        `);
    }

    if (alerts.length === 0) {
        alerts.push(`
            <div class="bg-slate-100 p-4 rounded-lg border border-rsu_base">
                <p class="text-[10px] font-black text-rsu_dark uppercase mb-1">Todo en orden</p>
                <p class="text-xs font-medium text-slate-700">No hay alertas urgentes para tu cuenta.</p>
            </div>
        `);
    }

    document.getElementById('alerts-list').innerHTML = alerts.join('');
}

function renderImpact() {
    document.getElementById('impact-summary').innerText =
        `Has evitado aproximadamente ${metrics.avoidedM3.toFixed(1)} m3 de residuos en vertedero y mitigado ${metrics.co2Kg.toFixed(1)} kg/eq de CO2 con tus transacciones registradas.`;
}

function renderDashboardError(error) {
    calculateMetrics();
    renderKpis();
    renderState(document.getElementById('operations-list'), 'No se pudo cargar el dashboard', userErrorMessage(error), {
        label: 'Reintentar',
        onClick: () => window.location.reload()
    });
    document.getElementById('alerts-list').innerHTML = `
        <div class="bg-slate-100 p-4 rounded-lg border border-rsu_base">
            <p class="text-[10px] font-black text-rsu_dark uppercase mb-1">Error de conexión</p>
            <p class="text-xs font-medium text-slate-700">${escapeHtml(userErrorMessage(error))}</p>
        </div>
    `;
    renderImpact();
}

function downloadEnvironmentalReport() {
    const content = [
        'Reporte Ambiental RSU',
        `Usuario: ${profile?.nombre_empresa || currentUser.email}`,
        `Ubicación: ${profile?.ubicacion || 'Sin ubicación'}`,
        `Publicaciones activas: ${metrics.activePublications}`,
        `Volumen gestionado: ${metrics.managedTons.toFixed(2)} Tons`,
        `Tratos activos: ${metrics.activeDeals}`,
        `Ingresos cerrados: ${formatCurrency(metrics.revenue)}`,
        `CO2 mitigado estimado: ${metrics.co2Kg.toFixed(1)} kg/eq`,
        `Residuos evitados estimados: ${metrics.avoidedM3.toFixed(1)} m3`
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'reporte-ambiental-rsu.txt';
    link.click();
    URL.revokeObjectURL(link.href);
}

async function loadDashboard() {
    currentUser = await requireUser();
    if (!currentUser) return;

    const [profileResult, transactionsResult, publicationsResult] = await Promise.all([
        supabase
            .from('perfiles')
            .select('nombre_empresa, ubicacion')
            .eq('id', currentUser.id)
            .maybeSingle(),
        supabase
            .from('transacciones')
            .select('*, publicaciones(*)')
            .or(`comprador_id.eq.${currentUser.id},vendedor_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false }),
        supabase
            .from('publicaciones')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
    ]);

    if (profileResult.error || transactionsResult.error || publicationsResult.error) {
        renderDashboardError(profileResult.error || transactionsResult.error || publicationsResult.error);
        return;
    }

    profile = profileResult.data || {};
    transactions = transactionsResult.data || [];
    publications = publicationsResult.data || [];

    document.getElementById('dashboard-user').innerText = profile.nombre_empresa || currentUser.email;
    document.getElementById('dashboard-region').innerText = `Panel de control operativo | ${profile.ubicacion || 'Sin ubicación'}`;

    calculateMetrics();
    renderKpis();
    renderOperations();
    renderAlerts();
    renderImpact();
}

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('download-report').addEventListener('click', downloadEnvironmentalReport);
    await loadDashboard();
});
