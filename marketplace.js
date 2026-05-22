import { getCurrentUser, renderState, supabase, userErrorMessage } from './supabase-config.js';

const params = new URLSearchParams(window.location.search);
const publishedPublicationId = params.get('publicacion');
const LOCAL_FAVORITES_KEY = 'rsu-local-favorites';
const REQUEST_TIMEOUT_MS = 12000;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatCurrency(value) {
    return '$' + Number(value || 0).toLocaleString('es-MX');
}

function formatUnit(unit) {
    const units = {
        tons: 'TONS',
        kg: 'KG',
        lt: 'LT',
        m3: 'M\u00b3'
    };

    return units[unit] || 'TONS';
}

function parseCoordinate(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;

    const coordinate = Number(text);
    return Number.isFinite(coordinate) ? coordinate : null;
}

function normalizePublication(row) {
    return {
        id: row.id,
        title: row.titulo,
        company: row.empresa || 'Usuario registrado',
        category: row.categoria || 'material',
        status: row.estado || 'available',
        certified: Boolean(row.certificado),
        volume: Number(row.volumen_tons || 0),
        unit: row.unidad_medida || 'tons',
        price: Number(row.precio || 0),
        distance: Number(row.distancia_km || 0),
        location: row.direccion_google || row.ubicacion || 'San Luis Potos\u00ed',
        latitude: parseCoordinate(row.latitud),
        longitude: parseCoordinate(row.longitud),
        description: row.descripcion || '',
        presentation: row.presentacion || '',
        purity: Number(row.pureza || 0),
        requiresFreight: Boolean(row.requiere_flete),
        hasForklift: Boolean(row.tiene_montacargas),
        images: Array.isArray(row.imagenes) ? row.imagenes : []
    };
}

function getLocalFavorites() {
    try {
        return JSON.parse(localStorage.getItem(LOCAL_FAVORITES_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveLocalFavorites(favorites) {
    localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify([...favorites]));
}

function saveLocalFavorite(publicationId) {
    const favorites = new Set(getLocalFavorites());
    favorites.add(publicationId);
    saveLocalFavorites(favorites);
    updateFavoriteBadge([...favorites].length);
}

function removeLocalFavorite(publicationId) {
    const favorites = new Set(getLocalFavorites());
    favorites.delete(publicationId);
    saveLocalFavorites(favorites);
    updateFavoriteBadge([...favorites].length);
}

function updateFavoriteBadge(count) {
    const counter = document.getElementById('favorites-count');
    if (counter) {
        counter.innerText = String(count || 0);
    }
}

function cardTemplate(item) {
    const statusLabel = item.status === 'logistics' ? 'LOGISTICA' : 'DISPONIBLE';
    const statusColor = item.status === 'logistics' ? 'bg-blue-500' : 'bg-green-500';
    const priceLabel = item.category === 'logistics' ? 'Tarifa' : 'Cotizaci\u00f3n';
    const volumeLabel = item.category === 'logistics' ? 'Capacidad' : 'Volumen';
    const certifiedBadge = item.certified
        ? '<span class="text-[9px] font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">CERTIFICADO</span>'
        : '';
    const imagePreview = item.images[0]
        ? `<img src="${escapeHtml(item.images[0])}" class="w-full h-36 object-cover rounded-2xl border border-white/60 mb-4" alt="${escapeHtml(item.title)}">`
        : '';
    const hasMap = item.latitude !== null && item.longitude !== null;
    const mapsUrl = hasMap
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.latitude},${item.longitude}`)}`
        : '';

    return `
        <div class="product-card glass p-6 hover:translate-y-[-5px] transition-all group overflow-hidden relative"
            data-id="${escapeHtml(item.id)}"
            data-price="${item.price}"
            data-distance="${item.distance}"
            data-category="${escapeHtml(item.category)}"
            data-status="${escapeHtml(item.status)}"
            data-certified="${item.certified}"
            data-volume="${item.volume}"
            data-unit="${escapeHtml(item.unit)}">
            <div class="absolute -top-10 -right-10 w-32 h-32 bg-green-400/10 rounded-full blur-2xl"></div>
            ${imagePreview}
            <div class="mb-4 relative cursor-pointer" onclick="window.location.href='detalle_publicacion.html?publicacion=${encodeURIComponent(item.id)}'">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-[9px] font-black text-white ${statusColor} px-2 py-0.5 rounded-full shadow-sm">${statusLabel}</span>
                    ${certifiedBadge}
                </div>
                <h3 class="product-title font-black text-2xl text-blue-900 leading-tight uppercase italic">${escapeHtml(item.title)}</h3>
                <p class="company-name text-[10px] font-bold text-blue-400 mt-1 uppercase">${escapeHtml(item.company)}</p>
            </div>
            <div class="grid grid-cols-2 gap-4 mb-6 bg-white/40 rounded-2xl p-4 border border-white/50 shadow-inner">
                <div class="flex flex-col">
                    <span class="text-[9px] text-blue-400 font-black uppercase">${volumeLabel}</span>
                    <span class="font-black text-lg text-blue-900">${item.volume} ${formatUnit(item.unit)}</span>
                </div>
                <div class="flex flex-col text-right">
                    <span class="text-[9px] text-blue-400 font-black uppercase">${priceLabel}</span>
                    <span class="font-black text-lg text-green-600">${formatCurrency(item.price)}</span>
                </div>
            </div>
            <p class="text-[9px] text-blue-700 font-bold uppercase mb-5 truncate"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(item.location)}</p>
            <div class="flex gap-3 relative">
                <button onclick="window.location.href='detalle_publicacion.html?publicacion=${encodeURIComponent(item.id)}'" class="flex-1 glossy-btn text-blue-900 font-black py-3 rounded-full uppercase text-[10px] tracking-widest shadow-md">Ver información</button>
                ${hasMap ? `<button onclick="window.open('${mapsUrl}', '_blank', 'noopener')" class="w-12 glass flex items-center justify-center text-blue-500 hover:text-green-500 transition-colors" title="Ver ubicaci\u00f3n en Google Maps">
                    <i class="fas fa-map-location-dot"></i>
                </button>` : ''}
                <button onclick="toggleFavorite('${escapeHtml(item.id)}')" class="favorite-button w-12 glass flex items-center justify-center text-blue-500 hover:text-red-400 transition-colors" data-publication-id="${escapeHtml(item.id)}" title="Agregar a favoritos">
                    <i class="fas fa-heart"></i>
                </button>
            </div>
        </div>
    `;
}

function clearMarketplaceFilters() {
    const searchInput = document.getElementById('main-search');
    const priceFilter = document.getElementById('price-filter');
    const volumeFilter = document.getElementById('volume-filter');

    if (searchInput) searchInput.value = '';
    document.getElementById('category-filter').value = 'all';
    document.getElementById('status-filter').value = 'all';
    document.getElementById('unit-filter').value = 'all';
    document.getElementById('certified-filter').checked = false;
    document.getElementById('sort-filter').value = 'distance';
    if (priceFilter) priceFilter.value = priceFilter.max;
    if (volumeFilter) volumeFilter.value = '0';
}

function revealPublishedCard() {
    if (!publishedPublicationId) return;

    const safeId = window.CSS?.escape ? CSS.escape(publishedPublicationId) : publishedPublicationId.replace(/"/g, '\\"');
    const card = document.querySelector(`.product-card[data-id="${safeId}"]`);
    if (!card) return;

    card.classList.remove('hidden-card');
    card.classList.add('ring-4', 'ring-green-300', 'ring-offset-2', 'ring-offset-transparent');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
        card.classList.remove('ring-4', 'ring-green-300', 'ring-offset-2', 'ring-offset-transparent');
    }, 4000);
}

async function fetchPublications() {
    const request = supabase
        .from('publicaciones')
        .select('*')
        .order('created_at', { ascending: false });

    const timeout = new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('La consulta a Supabase tardó demasiado. Revisa la conexión o que la tabla publicaciones exista.')), REQUEST_TIMEOUT_MS);
    });

    const { data, error } = await Promise.race([request, timeout]);
    if (error) {
        throw error;
    }

    return data || [];
}

async function updateFavoriteCount() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            updateFavoriteBadge(getLocalFavorites().length);
            return;
        }

        const { count, error } = await supabase
            .from('favoritos')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id);

        updateFavoriteBadge(error ? getLocalFavorites().length : (count || 0));
    } catch {
        updateFavoriteBadge(getLocalFavorites().length);
    }
}

function markFavoriteButtons(ids) {
    const favorites = new Set(ids || []);
    document.querySelectorAll('.favorite-button').forEach((button) => {
        const isFavorite = favorites.has(button.dataset.publicationId);
        button.classList.toggle('text-red-500', isFavorite);
        button.classList.toggle('text-blue-500', !isFavorite);
        button.title = isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos';
        button.setAttribute('aria-pressed', String(isFavorite));
    });
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

async function refreshFavoriteState() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            const localIds = getLocalFavorites();
            markFavoriteButtons(localIds);
            updateFavoriteBadge(localIds.length);
            return;
        }

        await syncLocalFavorites(user);

        const { data, error } = await supabase
            .from('favoritos')
            .select('publicacion_id')
            .eq('user_id', user.id);

        const ids = error ? [] : (data || []).map((item) => item.publicacion_id);
        markFavoriteButtons(ids);
        updateFavoriteBadge(ids.length);
    } catch {
        const localIds = getLocalFavorites();
        markFavoriteButtons(localIds);
        updateFavoriteBadge(localIds.length);
    }
}

async function ensureUserProfile(supabase, user) {
    const { error } = await supabase
        .from('perfiles')
        .upsert({
            id: user.id,
            email: user.email,
            nombre_empresa: user.user_metadata?.nombre_empresa || user.email || 'Empresa registrada',
            RFC: user.user_metadata?.RFC || user.user_metadata?.rfc || '',
            tipo_actividad: user.user_metadata?.tipo_actividad || 'No especificada',
            registro_padron: user.user_metadata?.registro_padron || ''
        }, { onConflict: 'id' });

    if (error) {
        console.warn('No se pudo asegurar el perfil antes de favorito:', error.message);
    }
}

async function loadPublications() {
    const grid = document.getElementById('product-grid');
    renderState(grid, 'Cargando publicaciones', 'Estamos consultando Inicio en tiempo real.');

    let rows = [];
    try {
        rows = await fetchPublications();
    } catch (error) {
        renderState(grid, 'No se pudieron cargar las publicaciones', userErrorMessage(error), {
            label: 'Reintentar',
            onClick: () => window.location.reload()
        });
        return;
    }

    const publications = rows.map(normalizePublication);

    if (publications.length === 0) {
        renderState(grid, 'Aún no hay publicaciones', 'Crea el primer lote desde la página Publicar.', {
            label: 'Publicar lote',
            href: 'publicar.html'
        });
        return;
    }

    grid.innerHTML = publications.map(cardTemplate).join('');

    const maxPrice = Math.max(...publications.map((item) => item.price), 1);
    const maxVolume = Math.max(...publications.map((item) => item.volume), 1);
    const priceFilter = document.getElementById('price-filter');
    const volumeFilter = document.getElementById('volume-filter');
    priceFilter.step = '1';
    priceFilter.max = String(Math.ceil(maxPrice));
    priceFilter.value = String(Math.ceil(maxPrice));
    volumeFilter.max = String(Math.ceil(maxVolume));

    clearMarketplaceFilters();
    window.applyFilters();
    revealPublishedCard();
    refreshFavoriteState();
}

window.toggleFavorite = async function(publicationId) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            const favorites = new Set(getLocalFavorites());
            if (favorites.has(publicationId)) {
                removeLocalFavorite(publicationId);
            } else {
                saveLocalFavorite(publicationId);
            }
            markFavoriteButtons(getLocalFavorites());
            return;
        }

        await ensureUserProfile(supabase, user);

        const { data: existing, error: lookupError } = await supabase
            .from('favoritos')
            .select('id')
            .eq('user_id', user.id)
            .eq('publicacion_id', publicationId)
            .maybeSingle();

        if (lookupError) throw lookupError;

        if (existing?.id) {
            const { error } = await supabase
                .from('favoritos')
                .delete()
                .eq('id', existing.id);

            if (error) throw error;
            await refreshFavoriteState();
            return;
        }

        const { error } = await supabase
            .from('favoritos')
            .insert({ user_id: user.id, publicacion_id: publicationId });

        if (error) {
            if (error.code === '23505' || error.message?.includes('duplicate key')) {
                await refreshFavoriteState();
                return;
            }

            saveLocalFavorite(publicationId);
            console.warn('No se pudo sincronizar favorito en Supabase:', userErrorMessage(error));
            markFavoriteButtons(getLocalFavorites());
            return;
        }

        localStorage.removeItem(LOCAL_FAVORITES_KEY);
        await refreshFavoriteState();
    } catch (error) {
        saveLocalFavorite(publicationId);
        markFavoriteButtons(getLocalFavorites());
    }
};

async function loadHeaderSession() {
    const profileLink = document.querySelector('a[href="perfil_empresa.html"]');
    if (!profileLink) return;

    const user = await getCurrentUser();
    if (!user) {
        profileLink.outerHTML = `
            <div class="flex items-center gap-2">
                <a href="login.html" class="glossy-btn text-blue-900 px-4 py-2 rounded-full transition flex items-center gap-2 font-black">
                    <i class="fas fa-right-to-bracket"></i> Entrar
                </a>
                <a href="registro.html" class="hidden sm:inline hover:scale-110 transition">Registro</a>
            </div>
        `;
        return;
    }

    document.querySelectorAll('.auth-link').forEach((link) => link.remove());

    const label = user.user_metadata?.nombre_usuario || user.user_metadata?.nombre_empresa || user.email?.split('@')[0] || 'Perfil';
    const labelElement = profileLink.querySelector('span');
    if (labelElement) {
        labelElement.innerText = label;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadHeaderSession();
    await loadPublications();
});
