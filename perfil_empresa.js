import { formatUnit, getCurrentUser, supabase, userErrorMessage } from './supabase-config.js';

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

function transactionTemplate(transaction) {
    const publication = transaction.publicaciones || {};
    const title = escapeHtml(publication.titulo || 'Material no disponible');
    const location = escapeHtml(publication.ubicacion || publication.direccion_google || 'Ubicacion no capturada');
    const quantityValue = transaction.cantidad_acordada ?? publication.volumen_tons ?? 0;
    const unit = transaction.unidad_acordada || publication.unidad_medida || 'tons';
    const quantity = `${quantityValue} ${formatUnit(unit)}`;

    return `
        <button type="button" onclick="window.location.href='transacciones.html'" class="w-full flex justify-between items-center gap-4 p-4 bg-white border border-slate-100 rounded-lg shadow-sm hover:border-rsu-gold transition text-left">
            <div>
                <p class="text-sm font-bold text-slate-700">${title}</p>
                <p class="text-[10px] text-slate-400">${formatDate(transaction.created_at)} - ${location}</p>
                <p class="text-[10px] text-slate-500 font-bold mt-1">${escapeHtml(transaction.estado || 'pendiente')}</p>
            </div>
            <span class="text-rsu-dark font-black text-xs whitespace-nowrap">${quantity}</span>
        </button>
    `;
}

function renderTransactions(transactions) {
    const container = document.getElementById('profile-publications');
    if (!container) return;

    if (!transactions.length) {
        container.innerHTML = `
            <div class="p-4 bg-white border border-slate-100 rounded-lg shadow-sm">
                <p class="text-sm font-bold text-slate-700">Sin actividad reciente.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = transactions.map(transactionTemplate).join('');
}

function trustScore(profile, transactions) {
    let score = 45;

    if (profile?.nombre_empresa) score += 15;
    if (profile?.registro_padron) score += 15;
    if (profile?.contacto || profile?.email) score += 10;
    if (profile?.ubicacion) score += 5;
    if (profile?.certificado) score += 10;
    if (transactions.length > 0) score += 5;

    return Math.min(score, 100);
}

function renderProfile(user, profile, transactions) {
    const companyName = profile?.nombre_empresa || user.email || 'Empresa registrada';
    const activity = profile?.tipo_actividad || 'Actividad no capturada';
    const registry = profile?.registro_padron || 'Sin registro capturado';
    const email = profile?.email || user.email || 'Sin correo';
    const location = profile?.ubicacion || 'Sin ubicacion capturada';
    const score = trustScore(profile, transactions);

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

    renderTransactions(transactions);
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

    const editLink = document.querySelector('a[href="crear-perfil.html"]');
    if (editLink) {
        editLink.href = 'login.html?next=crear-perfil.html';
        editLink.innerText = 'Iniciar sesión';
    }

    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.classList.add('hidden');
    }

    renderTransactions([]);
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

    const [profileResult, transactionsResult] = await Promise.all([
        supabase
            .from('perfiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle(),
        supabase
            .from('transacciones')
            .select('id, estado, cantidad_acordada, unidad_acordada, created_at, publicaciones(titulo, ubicacion, direccion_google, volumen_tons, unidad_medida)')
            .or(`comprador_id.eq.${user.id},vendedor_id.eq.${user.id}`)
            .order('created_at', { ascending: false })
            .limit(2)
    ]);

    if (profileResult.error || transactionsResult.error) {
        const error = profileResult.error || transactionsResult.error;
        renderTransactions([]);
        text('profile-company-name', 'No se pudo cargar el perfil');
        text('profile-activity', userErrorMessage(error));
        return;
    }

    renderProfile(user, profileResult.data, transactionsResult.data || []);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('logout-button').addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = 'login.html';
    });

    loadProfile();
});
