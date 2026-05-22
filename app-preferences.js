import { getCurrentUser, supabase } from './supabase-config.js';

const STORAGE_KEY = 'rsu-preferences';

const translations = {
    'Marketplace': 'Marketplace',
    'Inicio': 'Home',
    'Mi Perfil': 'My Profile',
    'Salir': 'Sign Out',
    'Publicar': 'Publish',
    'Cancelar': 'Cancel',
    'Configuración': 'Settings',
    'Configuración del Sistema': 'System Settings',
    'Apariencia e Idioma': 'Appearance and Language',
    'Modo Oscuro': 'Dark Mode',
    'Reduce el cansancio visual en entornos de poca luz.': 'Reduce eye strain in low-light environments.',
    'Idioma de la Interfaz': 'Interface Language',
    'Selecciona tu lenguaje preferido.': 'Select your preferred language.',
    'Ubicación y Región': 'Location and Region',
    'Tu ubicación actual se usa para filtrar los residuos más cercanos.': 'Your current location is used to filter nearby waste listings.',
    'Guardar': 'Save',
    'Estado de la Cuenta': 'Account Status',
    'Editar Perfil Público': 'Edit Public Profile',
    'Ver Transacciones': 'View Transactions',
    'Suspender Cuenta Temporalmente': 'Temporarily Suspend Account',
    'Eliminar Cuenta Permanentemente': 'Permanently Delete Account',
    'Volver al Panel': 'Back to Dashboard',
    'Filtros': 'Filters',
    'Tipo de oferta': 'Offer Type',
    'Todas': 'All',
    'Materiales': 'Materials',
    'Logística': 'Logistics',
    'Estado': 'Status',
    'Todos': 'All',
    'Disponible': 'Available',
    'Servicio logístico': 'Logistics Service',
    'Unidad': 'Unit',
    'Solo certificados': 'Certified Only',
    'Ordenar por': 'Sort By',
    'Más cercanos': 'Nearest',
    'Precio: Menor a Mayor': 'Price: Low to High',
    'Precio Máximo': 'Max Price',
    'Volumen mínimo': 'Minimum Volume',
    'Actualizar Vista': 'Update View',
    'Limpiar Filtros': 'Clear Filters',
    'Mercado': 'Market',
    'Región San Luis Potosí': 'San Luis Potosi Region',
    'Sistemas Activos': 'Active Systems',
    'Cargando publicaciones': 'Loading Listings',
    'Estamos consultando el mercado en tiempo real.': 'Checking the marketplace in real time.',
    'Iniciar Chat': 'Start Chat',
    'Agregar a favoritos': 'Add to Favorites',
    'Publicar Lote': 'Publish Lot',
    'Nueva Publicación': 'New Listing',
    'Registro de residuos sólidos urbanos (RSU)': 'Municipal solid waste registry (MSW)',
    'Subir evidencia visual': 'Upload Visual Evidence',
    'Tipo de Material': 'Material Type',
    'Presentación': 'Presentation',
    'Cantidad': 'Quantity',
    'Precio': 'Price',
    'Pureza Est. (%)': 'Estimated Purity (%)',
    'Punto de Recolección (SLP)': 'Pickup Point (SLP)',
    '¿Cuenta con montacargas?': 'Has forklift?',
    '¿Requiere flete?': 'Requires freight?',
    'Editar Perfil': 'Edit Profile',
    'Nivel de Confianza': 'Trust Level',
    'Registro Ambiental': 'Environmental Registry',
    'Contacto': 'Contact',
    'Actividad en el Marketplace': 'Marketplace Activity',
    'Ver historial completo': 'View Full History',
    'Cargando empresa...': 'Loading company...',
    'Cargando actividad...': 'Loading activity...',
    'Calculando...': 'Calculating...',
    'Sin registro cargado': 'No registry loaded',
    'Cargando...': 'Loading...',
    'Ayuda': 'Help',
    'Favoritos': 'Favorites',
    'Transacciones': 'Transactions',
    'Dashboard': 'Dashboard',
    'Iniciar Sesión': 'Sign In',
    'Registrarse': 'Sign Up'
};

function readStoredPreferences() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
        return {};
    }
}

export function saveLocalPreferences(patch) {
    const next = { ...readStoredPreferences(), ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    applyPreferences(next);
}

function normalize(text) {
    return text.replace(/\s+/g, ' ').trim();
}

function translateTextNodes(language) {
    if (language !== 'en-US') return;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];

    while (walker.nextNode()) {
        nodes.push(walker.currentNode);
    }

    nodes.forEach((node) => {
        const original = normalize(node.nodeValue);
        if (!original || !translations[original]) return;
        node.nodeValue = node.nodeValue.replace(original, translations[original]);
    });
}

function translateAttributes(language) {
    if (language !== 'en-US') return;

    document.querySelectorAll('[placeholder], [title]').forEach((element) => {
        ['placeholder', 'title'].forEach((attribute) => {
            const value = element.getAttribute(attribute);
            if (value && translations[normalize(value)]) {
                element.setAttribute(attribute, translations[normalize(value)]);
            }
        });
    });
}

function watchDynamicTranslations() {
    if (!document.body || window.rsuTranslationObserver) return;

    window.rsuTranslationObserver = new MutationObserver(() => {
        const preferences = readStoredPreferences();
        if ((preferences.idioma || 'es-MX') === 'en-US') {
            translateTextNodes('en-US');
            translateAttributes('en-US');
        }
    });

    window.rsuTranslationObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

export function applyPreferences(preferences = readStoredPreferences()) {
    const darkMode = Boolean(preferences.dark_mode);
    const language = preferences.idioma || 'es-MX';

    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.lang = language === 'en-US' ? 'en' : 'es';

    if (document.body) {
        translateTextNodes(language);
        translateAttributes(language);
        watchDynamicTranslations();
    }
}

async function syncPreferences() {
    applyPreferences();

    const user = await getCurrentUser();
    if (!user) return;

    const { data, error } = await supabase
        .from('perfiles')
        .select('dark_mode, idioma')
        .eq('id', user.id)
        .maybeSingle();

    if (error || !data) return;

    saveLocalPreferences({
        dark_mode: Boolean(data.dark_mode),
        idioma: data.idioma || 'es-MX'
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncPreferences);
} else {
    syncPreferences();
}
