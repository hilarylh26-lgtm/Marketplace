import { getCurrentUser, requireUser, supabase, uploadImage, userErrorMessage, validateImageFile } from './supabase-config.js';

const GOOGLE_MAPS_API_KEY = 'AIzaSyAnlzb6VB-LgdK5yy2W2RSyVE25XOTEY2k';
const DEFAULT_MAP_CENTER = { lat: 22.1565, lng: -100.9855 };
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

let selectedEvidenceFiles = [];
let locationMap = null;
let locationMarker = null;
let geocoder = null;
let fallbackMapActive = false;

function getLocationElements() {
    return {
        input: document.getElementById('ubicacion'),
        googleAddress: document.getElementById('direccion-google'),
        latitude: document.getElementById('latitud'),
        longitude: document.getElementById('longitud'),
        status: document.getElementById('location-status')
    };
}

function parseCoordinate(value) {
    const trimmedValue = String(value || '').trim();
    if (!trimmedValue) return null;

    const coordinate = Number(trimmedValue);
    return Number.isFinite(coordinate) ? coordinate : null;
}

async function getProfile(userId) {
    const { data } = await supabase
        .from('perfiles')
        .select('nombre_usuario, nombre_empresa, certificado')
        .eq('id', userId)
        .maybeSingle();

    return data;
}

async function handlePublicationSubmit(event) {
    event.preventDefault();

    const user = await getCurrentUser();
    if (!user) {
        window.location.href = 'login.html?redirect=publicar.html';
        return;
    }

    const profile = await getProfile(user.id);
    const material = document.getElementById('material').value;
    const title = document.getElementById('titulo-publicacion').value.trim();
    const description = document.getElementById('descripcion').value.trim();
    const submitButton = event.submitter;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerText = 'Publicando...';
    }

    const evidenceStatus = document.getElementById('evidence-status');
    evidenceStatus.innerText = selectedEvidenceFiles.length > 0 ? 'Subiendo evidencias...' : 'Sin evidencias seleccionadas.';

    let imageUrls = [];
    try {
        const uploads = await Promise.all(
            selectedEvidenceFiles.map((file) => uploadImage('publicaciones', user.id, file, { maxSizeMb: 5 }))
        );
        imageUrls = uploads.map((item) => item.url);
    } catch (error) {
        alert('No se pudieron subir las imágenes: ' + userErrorMessage(error));
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerText = 'Publicar Lote';
        }
        return;
    }

    await ensureTypedAddressCoordinates();

    const locationFields = getLocationElements();
    const typedAddress = locationFields.input.value.trim();
    const latitude = parseCoordinate(locationFields.latitude.value);
    const longitude = parseCoordinate(locationFields.longitude.value);
    const googleAddress = locationFields.googleAddress.value.trim();

    if (!typedAddress) {
        alert('Escribe una dirección o referencia de recolección antes de publicar.');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerText = 'Publicar Lote';
        }
        return;
    }

    const publication = {
        user_id: user.id,
        uid: user.id,
        titulo: title || material,
        empresa: profile?.nombre_usuario || profile?.nombre_empresa || user.user_metadata?.nombre_usuario || user.email,
        categoria: 'material',
        estado: 'available',
        certificado: Boolean(profile?.certificado),
        volumen_tons: Number(document.getElementById('volumen').value),
        unidad_medida: document.getElementById('unidad-medida').value,
        precio: Number(document.getElementById('precio').value),
        distancia_km: 0,
        ubicacion: typedAddress,
        direccion_google: googleAddress || typedAddress,
        latitud: latitude,
        longitud: longitude,
        presentacion: document.getElementById('presentacion').value,
        pureza: Number(document.getElementById('pureza').value),
        descripcion: description,
        imagenes: imageUrls,
        requiere_flete: document.getElementById('requiere-flete').checked,
        tiene_montacargas: document.getElementById('montacargas').checked
    };

    let { data, error } = await supabase
        .from('publicaciones')
        .insert(publication)
        .select('id')
        .single();

    if (error && (error.message?.includes('direccion_google') || error.message?.includes('latitud') || error.message?.includes('longitud'))) {
        const fallbackPublication = { ...publication };
        delete fallbackPublication.direccion_google;
        delete fallbackPublication.latitud;
        delete fallbackPublication.longitud;

        const fallbackResult = await supabase
            .from('publicaciones')
            .insert(fallbackPublication)
            .select('id')
            .single();

        data = fallbackResult.data;
        error = fallbackResult.error;
    }

    if (error) {
        alert('No se pudo publicar el lote: ' + userErrorMessage(error));
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerText = 'Publicar Lote';
        }
        return;
    }

    alert('Publicación guardada correctamente.');
    const publishedId = data?.id ? `&publicacion=${encodeURIComponent(data.id)}` : '';
    window.location.href = `index.html?published=1${publishedId}`;
}

function setSelectedLocation({ address, lat, lng }) {
    const fields = getLocationElements();
    fields.input.value = address;
    fields.googleAddress.value = address;
    fields.latitude.value = String(lat);
    fields.longitude.value = String(lng);
    fields.status.innerText = 'Ubicaci\u00f3n exacta guardada para esta publicaci\u00f3n.';

    if (fallbackMapActive) {
        renderFallbackMap({ address, lat, lng });
        return;
    }

    if (!locationMap || !locationMarker) return;

    const position = { lat, lng };
    locationMap.setCenter(position);
    locationMap.setZoom(15);
    locationMarker.setPosition(position);
}

function addressFromGeocoderResult(result) {
    return result?.formatted_address || '';
}

function coordinatesLabel(latLng) {
    return latLng.lat().toFixed(6) + ', ' + latLng.lng().toFixed(6);
}

function selectedAddressFallback(latLng) {
    const fields = getLocationElements();
    const typedAddress = fields.input.value.trim();
    return typedAddress || `Punto seleccionado en mapa (${coordinatesLabel(latLng)})`;
}

async function reverseGeocodeLocation(latLng) {
    if (!geocoder) return;

    const fields = getLocationElements();
    fields.status.innerText = 'Buscando direcci\u00f3n del punto seleccionado...';

    try {
        const { results } = await geocoder.geocode({ location: latLng });
        const fallbackAddress = selectedAddressFallback(latLng);
        const address = addressFromGeocoderResult(results?.[0]) || fallbackAddress;
        setSelectedLocation({
            address,
            lat: latLng.lat(),
            lng: latLng.lng()
        });
    } catch (error) {
        console.warn('No se pudo obtener la dirección automática:', error);
        const address = selectedAddressFallback(latLng);
        setSelectedLocation({
            address,
            lat: latLng.lat(),
            lng: latLng.lng()
        });
        fields.status.innerText = fields.input.value.trim()
            ? 'Punto guardado con la dirección escrita.'
            : 'Punto guardado con coordenadas. Puedes escribir una referencia antes de publicar.';
    }
}

async function ensureTypedAddressCoordinates() {
    const fields = getLocationElements();
    const typedAddress = fields.input.value.trim();
    const hasCoordinates = parseCoordinate(fields.latitude.value) !== null && parseCoordinate(fields.longitude.value) !== null;

    if (!typedAddress || hasCoordinates) {
        return;
    }

    if (!geocoder) {
        await searchAddressWithOpenStreetMap(typedAddress);
        return;
    }

    fields.status.innerText = 'Validando direcci\u00f3n en Google Maps...';

    try {
        const { results } = await geocoder.geocode({
            address: typedAddress,
            componentRestrictions: { country: 'MX' }
        });
        const result = results?.[0];
        const location = result?.geometry?.location;
        if (!location) return;

        setSelectedLocation({
            address: result.formatted_address || typedAddress,
            lat: location.lat(),
            lng: location.lng()
        });
    } catch (error) {
        await searchAddressWithOpenStreetMap(typedAddress);
    }
}

function fallbackMapEmbedUrl(lat, lng) {
    const delta = 0.01;
    const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(',');
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

function renderFallbackMap(location = null) {
    const mapElement = document.getElementById('location-map');
    if (!mapElement) return;

    const hasLocation = Number.isFinite(location?.lat) && Number.isFinite(location?.lng);
    const address = location?.address || 'San Luis Potosí, México';

    mapElement.innerHTML = `
        <div class="h-full flex flex-col bg-slate-100">
            <div class="flex flex-wrap gap-2 p-3 border-b border-slate-200 bg-white">
                <button id="location-search-button" type="button" class="bg-rsu_dark text-white px-3 py-2 rounded text-[10px] font-black uppercase">Buscar dirección</button>
                <button id="location-current-button" type="button" class="bg-white border border-slate-200 px-3 py-2 rounded text-[10px] font-black uppercase">Usar mi ubicación</button>
            </div>
            <div class="flex-1 min-h-0">
                ${hasLocation
                    ? `<iframe title="Mapa de punto de recolección" src="${fallbackMapEmbedUrl(location.lat, location.lng)}" class="w-full h-full border-0"></iframe>`
                    : `<div class="h-full grid place-items-center text-center p-5">
                        <div>
                            <i class="fas fa-map-location-dot text-3xl text-slate-400 mb-3"></i>
                            <p class="text-[10px] font-black uppercase text-slate-500">Busca una dirección o usa tu ubicación actual</p>
                            <p class="text-[10px] text-slate-400 mt-1">${address}</p>
                        </div>
                    </div>`
                }
            </div>
        </div>
    `;

    document.getElementById('location-search-button')?.addEventListener('click', () => {
        const query = getLocationElements().input.value.trim();
        if (!query) {
            getLocationElements().status.innerText = 'Escribe una dirección o referencia para buscarla.';
            return;
        }
        searchAddressWithOpenStreetMap(query);
    });

    document.getElementById('location-current-button')?.addEventListener('click', useBrowserLocation);
}

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: {
            Accept: 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Error ${response.status}`);
    }

    return response.json();
}

async function searchAddressWithOpenStreetMap(query) {
    const fields = getLocationElements();
    fields.status.innerText = 'Buscando dirección con OpenStreetMap...';

    try {
        const url = new URL(NOMINATIM_SEARCH_URL);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('limit', '1');
        url.searchParams.set('countrycodes', 'mx');
        url.searchParams.set('q', `${query}, San Luis Potosí, México`);

        const results = await fetchJson(url);
        const result = results?.[0];
        if (!result) {
            fields.status.innerText = 'No se encontró la dirección. Puedes guardar la referencia escrita.';
            return;
        }

        setSelectedLocation({
            address: result.display_name || query,
            lat: Number(result.lat),
            lng: Number(result.lon)
        });
    } catch (error) {
        fields.status.innerText = 'No se pudo buscar la dirección. Puedes guardar la referencia escrita.';
    }
}

async function reverseGeocodeWithOpenStreetMap(lat, lng) {
    const fields = getLocationElements();
    fields.status.innerText = 'Obteniendo dirección aproximada...';

    try {
        const url = new URL(NOMINATIM_REVERSE_URL);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('lat', String(lat));
        url.searchParams.set('lon', String(lng));

        const result = await fetchJson(url);
        setSelectedLocation({
            address: result.display_name || `Punto seleccionado (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
            lat,
            lng
        });
    } catch (error) {
        setSelectedLocation({
            address: `Punto seleccionado (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
            lat,
            lng
        });
    }
}

function useBrowserLocation() {
    const fields = getLocationElements();
    if (!navigator.geolocation) {
        fields.status.innerText = 'Este navegador no permite geolocalización.';
        return;
    }

    fields.status.innerText = 'Solicitando ubicación del dispositivo...';
    navigator.geolocation.getCurrentPosition(
        (position) => {
            reverseGeocodeWithOpenStreetMap(position.coords.latitude, position.coords.longitude);
        },
        () => {
            fields.status.innerText = 'No se pudo obtener tu ubicación. Revisa permisos del navegador.';
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        }
    );
}

function initFallbackLocationPicker(message = 'Mapa alternativo listo con OpenStreetMap.') {
    fallbackMapActive = true;
    locationMap = null;
    locationMarker = null;
    geocoder = null;

    const fields = getLocationElements();
    fields.status.innerText = message;
    renderFallbackMap();

    fields.input.addEventListener('input', () => {
        fields.latitude.value = '';
        fields.longitude.value = '';
        fields.googleAddress.value = '';
        fields.status.innerText = 'Pulsa Buscar dirección para guardar coordenadas aproximadas.';
    });
    fields.input.addEventListener('blur', ensureTypedAddressCoordinates);
}

function initGooglePlaces() {
    const mapElement = document.getElementById('location-map');
    const input = document.getElementById('ubicacion');

    if (!window.google?.maps?.places || !mapElement || !input) {
        initFallbackLocationPicker('Google Maps no está disponible. Usando OpenStreetMap.');
        return;
    }

    fallbackMapActive = false;
    locationMap = new google.maps.Map(mapElement, {
        center: DEFAULT_MAP_CENTER,
        zoom: 12,
        clickableIcons: false,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
    });

    geocoder = new google.maps.Geocoder();

    locationMarker = new google.maps.Marker({
        map: locationMap,
        position: DEFAULT_MAP_CENTER,
        draggable: true
    });

    const autocomplete = new google.maps.places.Autocomplete(input, {
        componentRestrictions: { country: 'mx' },
        fields: ['formatted_address', 'geometry', 'name']
    });

    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        const location = place.geometry?.location;
        if (!location) {
            document.getElementById('location-status').innerText = 'Selecciona una sugerencia de Google Maps para guardar coordenadas.';
            return;
        }

        setSelectedLocation({
            address: place.formatted_address || place.name || input.value,
            lat: location.lat(),
            lng: location.lng()
        });
    });

    input.addEventListener('input', () => {
        const fields = getLocationElements();
        fields.latitude.value = '';
        fields.longitude.value = '';
        fields.googleAddress.value = '';
        fields.status.innerText = 'Selecciona una sugerencia de Google Maps o toca el mapa para guardar el punto exacto.';
    });

    input.addEventListener('blur', ensureTypedAddressCoordinates);

    locationMap.addListener('click', (event) => {
        if (!event.latLng) return;
        reverseGeocodeLocation(event.latLng);
    });

    locationMarker.addListener('dragend', () => {
        const position = locationMarker.getPosition();
        if (!position) return;
        reverseGeocodeLocation(position);
    });
}
function loadGoogleMaps() {
    if (window.google?.maps) {
        initGooglePlaces();
        return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = initGooglePlaces;
    script.onerror = () => {
        initFallbackLocationPicker('No se pudo cargar Google Maps. Usando OpenStreetMap.');
        const status = document.getElementById('location-status');
        if (status) {
            status.innerText = 'No se pudo cargar Google Maps. Puedes escribir la ubicación manualmente.';
        }
    };
    document.head.appendChild(script);

    window.setTimeout(() => {
        if (!window.google?.maps && !fallbackMapActive) {
            initFallbackLocationPicker('Google Maps tardó demasiado. Usando OpenStreetMap.');
        }
    }, 5000);
}

function renderEvidencePreview() {
    const preview = document.getElementById('evidence-preview');
    const status = document.getElementById('evidence-status');

    preview.innerHTML = selectedEvidenceFiles.map((file) => `
        <div class="bg-white/60 rounded-lg overflow-hidden border border-white/70">
            <img src="${URL.createObjectURL(file)}" class="w-full h-24 object-cover" alt="${file.name}">
            <p class="text-[8px] font-bold text-slate-500 p-1 truncate">${file.name}</p>
        </div>
    `).join('');

    status.innerText = selectedEvidenceFiles.length
        ? `${selectedEvidenceFiles.length} imagen(es) listas para subir.`
        : 'JPG, PNG o WEBP. Máximo 5MB por imagen.';
}

function handleEvidenceSelection(event) {
    const files = Array.from(event.target.files || []);
    const invalid = files
        .map((file) => validateImageFile(file, 5))
        .find(Boolean);

    if (invalid) {
        alert(invalid);
        event.target.value = '';
        selectedEvidenceFiles = [];
        renderEvidencePreview();
        return;
    }

    selectedEvidenceFiles = files;
    renderEvidencePreview();
}

document.addEventListener('DOMContentLoaded', async () => {
    await requireUser();
    loadGoogleMaps();
    document.getElementById('publication-form').addEventListener('submit', handlePublicationSubmit);
    document.getElementById('evidence-dropzone').addEventListener('click', () => {
        document.getElementById('evidence-input').click();
    });
    document.getElementById('evidence-input').addEventListener('change', handleEvidenceSelection);
});
