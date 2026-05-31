import { formatUnit, getCurrentUser, supabase, userErrorMessage } from './supabase-config.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatDate(value) {
    if (!value) return 'Sin fecha';

    return new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'medium'
    }).format(new Date(value));
}

function purchaseTemplate(transaction) {
    const publication = transaction.publicaciones || {};
    const material = publication.titulo || 'Material no disponible';
    const quantity = transaction.cantidad_acordada ?? publication.volumen_tons ?? 0;
    const unit = transaction.unidad_acordada || publication.unidad_medida || 'tons';
    const status = transaction.estado || 'pendiente';

    return `
        <div class="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
            <div class="flex justify-between items-start mb-2">
                <span class="text-[9px] font-black bg-slate-100 px-2 py-0.5 rounded text-slate-500 italic uppercase">ID #${escapeHtml(String(transaction.id || '').slice(0, 8))}</span>
                <span class="text-[9px] font-black text-rsu_accent uppercase">${escapeHtml(status)}</span>
            </div>
            <p class="text-sm font-bold text-slate-800">${escapeHtml(material)}</p>
            <p class="text-[10px] text-slate-400 font-medium">${escapeHtml(quantity)} ${formatUnit(unit)} · ${formatDate(transaction.created_at)}</p>
        </div>
    `;
}

async function loadRecentPurchases() {
    const section = document.getElementById('recent-purchases-section');
    const list = document.getElementById('recent-purchases-list');
    if (!section || !list) return;

    const user = await getCurrentUser();
    if (!user) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');

    const { data, error } = await supabase
        .from('transacciones')
        .select('id, estado, cantidad_acordada, unidad_acordada, created_at, publicaciones(titulo, volumen_tons, unidad_medida)')
        .eq('comprador_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3);

    if (error) {
        list.innerHTML = `
            <div class="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <p class="text-sm font-bold text-slate-700">${escapeHtml(userErrorMessage(error))}</p>
            </div>
        `;
        return;
    }

    if (!data?.length) {
        list.innerHTML = `
            <div class="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
                <p class="text-sm font-bold text-slate-700">Aún no tienes compras recientes.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = data.map(purchaseTemplate).join('');
}

document.addEventListener('DOMContentLoaded', loadRecentPurchases);
