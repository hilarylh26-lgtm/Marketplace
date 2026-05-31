import { requireUser, supabase, uploadImage, userErrorMessage } from './supabase-config.js';

let currentUser = null;
let currentProfile = null;

function setLogoPreview(url) {
    const preview = document.getElementById('profile-logo-preview');
    const placeholder = document.getElementById('profile-logo-placeholder');
    if (!url) return;

    preview.src = url;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
}

function setLogoStatus(message) {
    document.getElementById('profile-logo-status').innerText = message;
}

function fillForm(profile) {
    document.getElementById('public-name').value = profile?.nombre_usuario || currentUser.user_metadata?.nombre_usuario || '';
    document.getElementById('company-name').value = profile?.nombre_empresa || currentUser.user_metadata?.nombre_empresa || '';
    document.getElementById('public-location').value = profile?.ubicacion || 'San Luis Potosí, México';
    document.getElementById('public-contact').value = profile?.contacto || '';
    document.getElementById('public-activity').value = profile?.tipo_actividad || currentUser.user_metadata?.tipo_actividad || 'Generador';
    setLogoPreview(profile?.logo_url);
}

async function loadProfile() {
    const { data, error } = await supabase
        .from('perfiles')
        .select('nombre_usuario, nombre_empresa, tipo_actividad, ubicacion, contacto, logo_url, logo_path, RFC, registro_padron, email')
        .eq('id', currentUser.id)
        .maybeSingle();

    if (error) {
        alert('No se pudo cargar tu perfil: ' + userErrorMessage(error));
        return;
    }

    currentProfile = data || {};
    fillForm(currentProfile);
}

async function saveProfilePatch(patch) {
    const payload = {
        id: currentUser.id,
        email: currentUser.email,
        RFC: currentProfile?.RFC || currentUser.user_metadata?.RFC || currentUser.user_metadata?.rfc || '',
        registro_padron: currentProfile?.registro_padron || currentUser.user_metadata?.registro_padron || '',
        ...currentProfile,
        ...patch
    };

    const { data, error } = await supabase
        .from('perfiles')
        .upsert(payload, { onConflict: 'id' })
        .select()
        .maybeSingle();

    if (error) {
        throw error;
    }

    currentProfile = data || payload;
}

async function handleLogoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLogoStatus('Subiendo imagen...');

    try {
        const uploaded = await uploadImage('logos', currentUser.id, file, { maxSizeMb: 2 });
        await saveProfilePatch({
            logo_url: uploaded.url,
            logo_path: uploaded.path
        });
        setLogoPreview(uploaded.url);
        setLogoStatus('Imagen guardada correctamente.');
    } catch (error) {
        setLogoStatus(userErrorMessage(error));
    }
}

async function handleSubmit(event) {
    event.preventDefault();

    const submitButton = event.submitter;
    submitButton.disabled = true;
    submitButton.innerText = 'Guardando...';

    try {
        await saveProfilePatch({
            nombre_usuario: document.getElementById('public-name').value.trim(),
            nombre_empresa: document.getElementById('company-name').value.trim(),
            ubicacion: document.getElementById('public-location').value.trim(),
            contacto: document.getElementById('public-contact').value.trim(),
            tipo_actividad: document.getElementById('public-activity').value
        });

        window.location.href = 'perfil_empresa.html';
    } catch (error) {
        alert('No se pudo guardar el perfil: ' + userErrorMessage(error));
    } finally {
        submitButton.disabled = false;
        submitButton.innerText = 'Guardar perfil';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await requireUser();
    if (!currentUser) return;

    document.getElementById('profile-logo-input').addEventListener('change', handleLogoUpload);
    document.getElementById('create-profile-form').addEventListener('submit', handleSubmit);
    await loadProfile();
});
