import { requireUser, supabase, uploadImage, userErrorMessage } from './supabase-config.js';

let currentUser = null;
let currentProfile = null;

function setLogoPreview(url) {
    const preview = document.getElementById('logo-preview');
    const placeholder = document.getElementById('logo-placeholder');

    if (!url) return;

    preview.src = url;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
}

function setStatus(message) {
    const status = document.getElementById('logo-status');
    if (status) {
        status.innerText = message;
    }
}

function fillProfileForm(profile) {
    document.getElementById('profile-representative').value = profile?.nombre_usuario || '';
    document.getElementById('profile-activity').value = profile?.tipo_actividad || '';
    document.getElementById('profile-rfc').value = profile?.RFC || profile?.rfc || '';
    document.getElementById('profile-location').value = profile?.ubicacion || 'San Luis Potosí, México';
    setLogoPreview(profile?.logo_url);
}

async function loadProfile() {
    const { data, error } = await supabase
        .from('perfiles')
        .select('nombre_usuario, nombre_empresa, RFC, tipo_actividad, registro_padron, ubicacion, logo_url')
        .eq('id', currentUser.id)
        .maybeSingle();

    if (error) {
        setStatus(userErrorMessage(error));
        return;
    }

    currentProfile = data || {};
    fillProfileForm(currentProfile);
}

async function saveProfilePatch(patch) {
    let result = await supabase
        .from('perfiles')
        .update(patch)
        .eq('id', currentUser.id)
        .select()
        .maybeSingle();

    if (!result.error && !result.data) {
        result = await supabase
            .from('perfiles')
            .insert({
                id: currentUser.id,
                email: currentUser.email,
                nombre_empresa: currentProfile?.nombre_empresa || currentUser.email || 'Empresa registrada',
                RFC: currentProfile?.RFC || '',
                tipo_actividad: currentProfile?.tipo_actividad || 'No especificada',
                registro_padron: currentProfile?.registro_padron || '',
                ...patch
            })
            .select()
            .maybeSingle();
    }

    if (result.error) {
        throw result.error;
    }

    currentProfile = result.data || { ...currentProfile, ...patch };
}

async function handleLogoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus('Subiendo logotipo...');

    try {
        const uploaded = await uploadImage('logos', currentUser.id, file, { maxSizeMb: 2 });
        await saveProfilePatch({
            logo_url: uploaded.url,
            logo_path: uploaded.path
        });

        setLogoPreview(uploaded.url);
        setStatus('Logotipo guardado correctamente.');
    } catch (error) {
        setStatus(userErrorMessage(error));
    }
}

async function handleProfileSubmit(event) {
    event.preventDefault();

    const submitButton = event.submitter;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerText = 'Guardando...';
    }

    try {
        await saveProfilePatch({
            nombre_usuario: document.getElementById('profile-representative').value.trim(),
            tipo_actividad: document.getElementById('profile-activity').value.trim(),
            ubicacion: document.getElementById('profile-location').value.trim()
        });

        window.location.href = 'perfil_empresa.html';
    } catch (error) {
        alert('No se pudo guardar el perfil: ' + userErrorMessage(error));
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerText = 'Guardar Cambios';
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await requireUser();
    if (!currentUser) return;

    document.getElementById('logo-input').addEventListener('change', handleLogoUpload);
    document.getElementById('profile-form').addEventListener('submit', handleProfileSubmit);
    await loadProfile();
});
