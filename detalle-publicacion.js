import { supabase, userErrorMessage } from './supabase-config.js';

const params = new URLSearchParams(window.location.search);
const publicationId = params.get('publicacion');

let currentPublication = null;

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
        tons: 'tons',
        kg: 'kg',
        lt: 'lt',
        m3: 'm³'
    };

    return units[unit] || 'tons';
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
        title: row.titulo || 'Publicación RSU',
        company: row.empresa || 'Usuario registrado',
        status: row.estado || 'available',
        certified: Boolean(row.certificado),
        volume: Number(row.volumen_tons || 0),
        unit: row.unidad_medida || 'tons',
        price: Number(row.precio || 0),
        location: row.direccion_google || row.ubicacion || 'San Luis Potosí, SLP',
        latitude: parseCoordinate(row.latitud),
        longitude: parseCoordinate(row.longitud),
        presentation: row.presentacion || 'Lote industrial',
        purity: Number(row.pureza || 100),
        description: row.descripcion || '',
        requiresFreight: Boolean(row.requiere_flete),
        hasForklift: Boolean(row.tiene_montacargas),
        images: Array.isArray(row.imagenes) ? row.imagenes : []
    };
}

function initials(name) {
    return String(name || 'RS')
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
}

function staticMapUrl(item) {
    if (item.latitude !== null && item.longitude !== null) {
        const center = `${item.latitude},${item.longitude}`;
        return `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(center)}&zoom=12&size=720x260&maptype=mapnik`;
    }

    return '';
}

function renderHero(item) {
    if (item.images[0]) {
        return `<div class="hero"><img src="${escapeHtml(item.images[0])}" alt="${escapeHtml(item.title)}"></div>`;
    }

    return `
        <div class="hero">
            <div class="hero-fallback"><i class="fas fa-recycle"></i></div>
        </div>
    `;
}

function renderMap(item) {
    const mapUrl = staticMapUrl(item);
    const mapImage = mapUrl
        ? `<img src="${escapeHtml(mapUrl)}" alt="Ubicación aproximada">`
        : '';

    return `
        <div class="map-card">
            ${mapImage}
            <div class="map-label">San Luis<br>Potosí</div>
            <div class="approx-circle"></div>
            <div class="info-dot">i</div>
        </div>
        <div class="location-text">${escapeHtml(item.location)}</div>
        <div class="muted">La ubicación es aproximada</div>
    `;
}

function relatedTemplate(item) {
    const image = item.images[0]
        ? `<img src="${escapeHtml(item.images[0])}" alt="${escapeHtml(item.title)}">`
        : '<div class="related-fallback"><i class="fas fa-recycle"></i></div>';

    return `
        <article class="related-card" onclick="window.location.href='detalle_publicacion.html?publicacion=${encodeURIComponent(item.id)}'">
            ${image}
            <div class="related-title">${escapeHtml(item.title)}</div>
            <div class="muted">${formatCurrency(item.price)}</div>
        </article>
    `;
}

function renderDetail(item, related) {
    const root = document.getElementById('detail-root');
    root.innerHTML = `
        ${renderHero(item)}
        <section class="section">
            <div class="title-row">
                <div>
                    <h1>${escapeHtml(item.title)}</h1>
                    <div class="price">${formatCurrency(item.price)}</div>
                    <div class="muted">${item.volume} ${formatUnit(item.unit)} · ${escapeHtml(item.presentation)}</div>
                </div>
                <button class="icon-btn" onclick="sharePublication()" aria-label="Compartir">
                    <i class="fas fa-share-nodes"></i>
                </button>
            </div>
            <div class="seller">
                <div class="seller-avatar">${escapeHtml(initials(item.company))}</div>
                <div>
                    <strong>${escapeHtml(item.company)}</strong>
                    <div class="muted">${item.certified ? 'Empresa certificada' : 'Vendedor registrado'}</div>
                </div>
            </div>
            <dl class="details">
                <dt>Cantidad</dt><dd>${item.volume} ${formatUnit(item.unit)}</dd>
                <dt>Pureza</dt><dd>${item.purity}% estimado</dd>
                <dt>Estado</dt><dd>${item.status === 'available' ? 'Disponible' : 'Por confirmar'}</dd>
                <dt>Flete</dt><dd>${item.requiresFreight ? 'Requiere flete' : 'No requerido'}</dd>
                <dt>Montacargas</dt><dd>${item.hasForklift ? 'Disponible' : 'No indicado'}</dd>
            </dl>
        </section>
        <section class="section">
            <h2>Descripción</h2>
            <p class="muted">${escapeHtml(item.description || 'El vendedor no agregó una descripción adicional.')}</p>
        </section>
        <section class="section">
            <h2>Ubicación</h2>
            ${renderMap(item)}
        </section>
        <section class="section">
            <div class="related-head">
                <div>
                    <h2>Productos relacionados</h2>
                    <div class="muted">Publicaciones</div>
                </div>
                <a href="index.html">Ver más</a>
            </div>
            <div class="related-grid">
                ${related.length ? related.map(relatedTemplate).join('') : '<p class="muted">No hay más publicaciones por ahora.</p>'}
            </div>
        </section>
    `;
}
function renderError(message) {
    document.getElementById('detail-root').innerHTML = `
        <section class="section">
            <h1>No se pudo abrir la publicación</h1>
            <p class="muted">${escapeHtml(message)}</p>
            <button class="see-more" onclick="window.location.href='index.html'">Volver al inicio</button>
        </section>
    `;
}

async function fetchPublications() {
    const { data, error } = await supabase
        .from('publicaciones')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        throw error;
    }

    return data || [];
}

function openChat(event) {
    event.preventDefault();
    if (!currentPublication) return;

    const message = document.getElementById('message-input').value.trim();
    if (message) {
        sessionStorage.setItem(`rsu-chat-draft-${currentPublication.id}`, message);
    }
    window.location.href = `chat.html?publicacion=${encodeURIComponent(currentPublication.id)}`;
}

window.sharePublication = async function() {
    if (!currentPublication) return;

    if (navigator.share) {
        await navigator.share({
            title: currentPublication.title,
            url: window.location.href
        });
        return;
    }

    await navigator.clipboard.writeText(window.location.href);
    alert('Enlace copiado.');
};

async function initDetail() {
    if (!publicationId) {
        renderError('Falta el identificador de la publicación.');
        return;
    }

    try {
        const rows = await fetchPublications();
        const publications = rows.map(normalizePublication);
        currentPublication = publications.find((item) => item.id === publicationId);

        if (!currentPublication) {
            renderError('La publicación ya no está disponible.');
            return;
        }

        const related = publications
            .filter((item) => item.id !== publicationId)
            .slice(0, 4);

        renderDetail(currentPublication, related);
    } catch (error) {
        renderError(userErrorMessage(error));
    }
}

document.getElementById('message-form').addEventListener('submit', openChat);
document.getElementById('whatsapp-button').addEventListener('click', () => {
    if (!currentPublication) return;
    window.location.href = `chat.html?publicacion=${encodeURIComponent(currentPublication.id)}`;
});
document.addEventListener('DOMContentLoaded', initDetail);

