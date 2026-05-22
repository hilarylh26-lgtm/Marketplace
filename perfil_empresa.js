import { formatCurrency, formatUnit, getCurrentUser, supabase, userErrorMessage } from './supabase-config.js';

function text(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.innerHTML = value;
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatDate(value) {
    if (!value) return 'Fecha no disponible';

    return new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(new Date(value));
}

function publicationTemplate(publication) {
    const title = escapeHtml(publication.titulo || 'Publicacion sin titulo');
    const location = escapeHtml(publication.ubicacion || 'Ubicacion no capturada');
    const quantity = `${Number(publication.volumen_tons || 0)} ${formatUnit(publication.unidad_medida)}`;

    return `
        <button type="button" onclick="window.location.href='chat.html?publicacion=${publication.id}'" class="w-full flex justify-between items-center gap-4 p-4 bg-white border border-slate-100 rounded-lg shadow-sm hover:border-rsu-gold transition text-left">
            <div>
                <p class="text-sm font-bold text-slate-700">${title}</p>
                <p class="text-[10px] text-slate-400">${formatDate(publication.created_at)} - ${location}</p>
                <p class="text-[10px] text-slate-500 font-bold mt-1">${formatCurrency(publication.precio)} MXN</p>
            </div>
            <span class="text-rsu-dark font-black text-xs whitespace-nowrap">${quantity}</span>
        </button>
    `;
}

function renderPublications(publications) {
    const container = document.getElementById('profile-publications');
    if (!container) return;

    if (!publications.length) {
        container.innerHTML = `
            <div class="p-4 bg-white border border-slate-100 rounded-lg shadow-sm">
                <p class="text-sm font-bold text-slate-700">Todavia no tienes publicaciones.</p>
                <a href="publicar.html" class="inline-block mt-2 text-[10px] font-black uppercase text-rsu-accent hover:underline">Crear publicacion</a>
            </div>
        `;
        return;
    }

    container.innerHTML = publications.map(publicationTemplate).join('');
}

function trustScore(profile, publications) {
    let score = 45;

    if (profile?.nombre_empresa) score += 15;
    if (profile?.registro_padron) score += 15;
    if (profile?.contacto || profile?.email) score += 10;
    if (profile?.ubicacion) score += 5;
    if (profile?.certificado) score += 10;
    if (publications.length > 0) score += 5;

    return Math.min(score, 100);
}

function renderProfile(user, profile, publications) {
    const companyName = profile?.nombre_empresa || user.email || 'Empresa registrada';
    const activity = profile?.tipo_actividad || 'Actividad no capturada';
    const registry = profile?.registro_padron || 'Sin registro capturado';
    const email = profile?.email || user.email || 'Sin correo';
    const location = profile?.ubicacion || 'Sin ubicacion capturada';
    const score = trustScore(profile, publications);

    text('profile-company-name', escapeHtml(companyName));
    text('profile-activity', escapeHtml(activity));
    text('profile-registry', escapeHtml(registry));
    text('profile-email', `<i class="fas fa-envelope mr-2"></i> ${escapeHtml(email)}`);
    text('profile-location', `<i class="fas fa-map-marker-alt mr-2"></i> ${escapeHtml(location)}`);
    text('trust-label', `${score}% - ${score >= 80 ? 'Alta fiabilidad' : 'Perfil en construccion'}`);

    const trustBar = document.getElementById('trust-bar');
    if (trustBar) {
        trustBar.style.width = `${score}%`;
    }

    renderPublications(publications);
}

function renderLoginRequired() {
    text('profile-company-name', 'Inicia sesión');
    text('profile-activity', 'Tu perfil de empresa se carga con una cuenta activa.');
    text('profile-registry', 'Sesión requerida');
    text('profile-email', '<i class="fas fa-envelope mr-2"></i> Sin sesión activa');
    text('profile-location', '<i class="fas fa-map-marker-alt mr-2"></i> Sin ubicación cargada');
    text('trust-label', '0% - Inicia sesión para calcular confianza');

    const trustBar = document.getElementById('trust-bar');
    if (trustBar) {
        trustBar.style.width = '0%';
    }

    const editLink = document.querySelector('a[href="editar-perfil.html"]');
    if (editLink) {
        editLink.href = 'login.html?next=editar-perfil.html';
        editLink.innerText = 'Iniciar sesión';
    }

    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.classList.add('hidden');
    }

    renderPublications([]);
    const container = document.getElementById('profile-publications');
    if (container) {
        container.innerHTML = `
            <div class="p-4 bg-white border border-slate-100 rounded-lg shadow-sm">
                <p class="text-sm font-bold text-slate-700">No hay sesión activa.</p>
                <div class="flex flex-wrap gap-3 mt-3">
                    <a href="login.html?next=perfil_empresa.html" class="inline-block text-[10px] font-black uppercase text-rsu-accent hover:underline">Iniciar sesión</a>
                    <a href="registro.html" class="inline-block text-[10px] font-black uppercase text-rsu-accent hover:underline">Crear cuenta</a>
                </div>
            </div>
        `;
    }
}

async function loadProfile() {
    const user = await getCurrentUser();
    if (!user) {
        renderLoginRequired();
        return;
    }

    const [profileResult, publicationsResult] = await Promise.all([
        supabase
            .from('perfiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle(),
        supabase
            .from('publicaciones')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5)
    ]);

    if (profileResult.error || publicationsResult.error) {
        const error = profileResult.error || publicationsResult.error;
        renderPublications([]);
        text('profile-company-name', 'No se pudo cargar el perfil');
        text('profile-activity', userErrorMessage(error));
        return;
    }

    renderProfile(user, profileResult.data, publicationsResult.data || []);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('logout-button').addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = 'login.html';
    });

    loadProfile();
});
