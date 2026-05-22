import { formatCurrency, formatUnit, getCurrentUser, renderState, supabase, userErrorMessage } from './supabase-config.js';

const LOCAL_FAVORITES_KEY = 'rsu-local-favorites';

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function getLocalFavorites() {
    try {
        return JSON.parse(localStorage.getItem(LOCAL_FAVORITES_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveLocalFavorites(ids) {
    localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify([...new Set(ids)]));
}

async function syncLocalFavorites(user) {
    const localIds = getLocalFavorites();
    if (!user || localIds.length === 0) return;

    const rows = localIds.map((publicationId) => ({
        user_id: user.id,
        publicacion_id: publicationId
    }));

    const { error } = await supabase
        .from('favoritos')
        .upsert(rows, { onConflict: 'user_id,publicacion_id', ignoreDuplicates: true });

    if (!error) {
        localStorage.removeItem(LOCAL_FAVORITES_KEY);
    }
}

function favoriteTemplate(item) {
    const publication = item.publicaciones || item.publication;
    if (!publication) return '';

    const image = Array.isArray(publication.imagenes) && publication.imagenes[0]
        ? `<img src="${escapeHtml(publication.imagenes[0])}" class="w-full h-36 object-cover rounded mb-4 border border-slate-200" alt="${escapeHtml(publication.titulo)}">`
        : '';

    return `
        <article class="frutiger-card p-6 flex flex-col justify-between h-full product-card" id="favorite-${escapeHtml(item.id)}">
            <div>
                ${image}
                <div class="flex justify-between items-start gap-4 mb-4">
                    <h3 class="text-xl font-black text-blue-800">${escapeHtml(publication.titulo || 'Publicación')}</h3>
                    <div class="bg-white/80 p-2 rounded-full shadow-inner">
                        <i class="fas fa-heart text-red-500"></i>
                    </div>
                </div>
                <p class="text-sm font-bold text-green-700 italic mb-4">Vendido por: ${escapeHtml(publication.empresa || 'Empresa registrada')}</p>
                <div class="bg-white/40 rounded-lg p-3 border border-white/50 mb-4">
                    <div class="flex justify-between text-xs font-bold text-gray-500 uppercase">
                        <span>Cantidad</span>
                        <span>Precio sugerido</span>
                    </div>
                    <div class="flex justify-between gap-4 text-lg font-black text-gray-800">
                        <span>${Number(publication.volumen_tons || 0)} ${formatUnit(publication.unidad_medida)}</span>
                        <span>${formatCurrency(publication.precio)}</span>
                    </div>
                </div>
            </div>
            <div class="flex gap-3 mt-4">
                <button onclick="window.location.href='detalle_publicacion.html?publicacion=${encodeURIComponent(publication.id)}'" class="btn-glossy flex-1 text-sm">Ver detalle</button>
                <button onclick="eliminarFavorito('${escapeHtml(item.id)}', '${escapeHtml(publication.id)}', ${item.local ? 'true' : 'false'})" class="btn-glossy btn-remove px-4" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </article>
    `;
}

async function loadLocalFavoriteRows(ids) {
    if (ids.length === 0) return [];

    const { data, error } = await supabase
        .from('publicaciones')
        .select('*')
        .in('id', ids);

    if (error) throw error;

    return (data || []).map((publication) => ({
        id: publication.id,
        publication,
        local: true
    }));
}

async function loadRemoteFavoriteRows(user) {
    await syncLocalFavorites(user);

    const { data, error } = await supabase
        .from('favoritos')
        .select('id, publicaciones(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

function renderFavorites(rows) {
    const container = document.getElementById('favorites-container');
    const emptyMsg = document.getElementById('empty-message');

    if (rows.length === 0) {
        container.innerHTML = '';
        emptyMsg.classList.remove('hidden');
        return;
    }

    emptyMsg.classList.add('hidden');
    container.innerHTML = rows.map(favoriteTemplate).join('');
}

window.cargarFavoritos = async function() {
    const container = document.getElementById('favorites-container');
    renderState(container, 'Cargando favoritos', 'Estamos consultando tus publicaciones guardadas.');

    try {
        const user = await getCurrentUser();
        const rows = user
            ? await loadRemoteFavoriteRows(user)
            : await loadLocalFavoriteRows(getLocalFavorites());

        renderFavorites(rows);
    } catch (error) {
        renderState(container, 'No se pudieron cargar favoritos', userErrorMessage(error), {
            label: 'Reintentar',
            onClick: () => window.location.reload()
        });
    }
};

window.eliminarFavorito = async function(id, publicationId, isLocal) {
    if (!confirm('¿Seguro que quieres quitarlo de favoritos?')) {
        return;
    }

    if (isLocal) {
        saveLocalFavorites(getLocalFavorites().filter((item) => item !== publicationId));
        window.cargarFavoritos();
        return;
    }

    const { error } = await supabase
        .from('favoritos')
        .delete()
        .eq('id', id);

    if (error) {
        alert('No se pudo eliminar el favorito: ' + userErrorMessage(error));
        return;
    }

    window.cargarFavoritos();
};

document.addEventListener('DOMContentLoaded', window.cargarFavoritos);
