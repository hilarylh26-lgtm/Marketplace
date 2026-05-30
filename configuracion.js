import { saveLocalPreferences } from './app-preferences.js';
import { requireUser, supabase, userErrorMessage } from './supabase-config.js';

let currentUser = null;
let currentProfile = null;

function setStatus(id, message, tone = 'muted') {
    const element = document.getElementById(id);
    if (!element) return;

    element.innerText = message;
    element.classList.toggle('text-green-600', tone === 'success');
    element.classList.toggle('text-red-600', tone === 'error');
    element.classList.toggle('text-slate-400', tone === 'muted');
}

function setDarkMode(enabled) {
    document.documentElement.classList.toggle('dark', enabled);
    const knob = document.getElementById('dark-mode-knob');
    knob.classList.toggle('left-7', enabled);
    knob.classList.toggle('left-1', !enabled);
    saveLocalPreferences({ dark_mode: enabled });
}

function profileDefaults() {
    return {
        id: currentUser.id,
        email: currentUser.email,
        nombre_empresa: currentProfile?.nombre_empresa || currentUser.email || 'Empresa registrada',
        RFC: currentProfile?.RFC || '',
        tipo_actividad: currentProfile?.tipo_actividad || 'No especificada',
        registro_padron: currentProfile?.registro_padron || ''
    };
}

async function saveProfilePatch(patch, successMessage) {
    if (!currentUser) return;

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
                ...profileDefaults(),
                ...patch
            })
            .select()
            .maybeSingle();
    }

    if (result.error) {
        alert('No se pudo guardar la configuración: ' + userErrorMessage(result.error));
        throw result.error;
    }

    currentProfile = result.data || { ...currentProfile, ...patch };
    if (successMessage) {
        alert(successMessage);
    }
}

async function loadSettings() {
    currentUser = await requireUser();
    if (!currentUser) return;

    const { data, error } = await supabase
        .from('perfiles')
        .select('nombre_empresa, RFC, tipo_actividad, registro_padron, email, ubicacion, estado_cuenta, dark_mode, idioma')
        .eq('id', currentUser.id)
        .maybeSingle();

    if (error) {
        alert('No se pudo cargar la configuración: ' + userErrorMessage(error));
        return;
    }

    currentProfile = data || {};
    document.getElementById('location-input').value = currentProfile.ubicacion || 'San Luis Potosí, México';
    document.getElementById('language-select').value = currentProfile.idioma || 'es-MX';
    setStatus('location-save-status', 'Sin cambios pendientes.', 'muted');

    saveLocalPreferences({
        dark_mode: Boolean(currentProfile.dark_mode),
        idioma: currentProfile.idioma || 'es-MX'
    });
    setDarkMode(Boolean(currentProfile.dark_mode));
}

async function toggleDarkModeSetting() {
    const nextValue = !document.documentElement.classList.contains('dark');
    setDarkMode(nextValue);
    await saveProfilePatch({ dark_mode: nextValue }, null);
}

async function saveLanguage() {
    const language = document.getElementById('language-select').value;
    saveLocalPreferences({ idioma: language });
    await saveProfilePatch({ idioma: language }, 'Idioma guardado.');
    window.location.reload();
}

async function saveLocation() {
    const button = document.getElementById('save-location');
    const locationInput = document.getElementById('location-input');
    const location = locationInput.value.trim();

    if (!location) {
        setStatus('location-save-status', 'La ubicación no puede estar vacía.', 'error');
        return;
    }

    button.disabled = true;
    setStatus('location-save-status', 'Guardando ubicación...', 'muted');

    try {
        await saveProfilePatch({ ubicacion: location }, null);
        locationInput.value = currentProfile.ubicacion || location;
        setStatus('location-save-status', 'Ubicación guardada correctamente.', 'success');
    } catch (error) {
        setStatus('location-save-status', userErrorMessage(error), 'error');
    } finally {
        button.disabled = false;
    }
}

async function suspendAccount() {
    const confirmed = confirm('¿Quieres suspender temporalmente tu cuenta? Podrás reactivarla desde soporte.');
    if (!confirmed) return;

    await saveProfilePatch({ estado_cuenta: 'suspendida' }, 'Cuenta marcada como suspendida.');
}

async function requestAccountDeletion() {
    const deleteButton = document.getElementById('delete-account-request');
    const confirmed = confirm('Esta accion eliminara permanentemente tu cuenta, perfil, publicaciones, favoritos, mensajes, transacciones e imagenes subidas. No se puede deshacer.');
    if (!confirmed) {
        return;
    }

    const typedConfirmation = prompt('Escribe ELIMINAR para confirmar la eliminacion permanente de tu cuenta.');
    if (typedConfirmation !== 'ELIMINAR') {
        alert('Eliminacion cancelada. La confirmacion no coincidio.');
        return;
    }

    deleteButton.disabled = true;
    deleteButton.innerText = 'Eliminando cuenta...';

    await Promise.allSettled([
        removeStorageFolder('logos', currentUser.id),
        removeStorageFolder('publicaciones', currentUser.id)
    ]);

    const { error } = await supabase.rpc('delete_current_user_account');
    if (error) {
        deleteButton.disabled = false;
        deleteButton.innerText = 'Eliminar Cuenta Permanentemente';
        alert('No se pudo eliminar la cuenta: ' + userErrorMessage(error));
        return;
    }

    try {
        await supabase.auth.signOut();
    } finally {
        localStorage.removeItem('rsu-preferences');
        localStorage.removeItem('rsu-local-favorites');
        sessionStorage.clear();
        alert('Tu cuenta fue eliminada permanentemente.');
        window.location.href = 'index.html';
    }
}

async function removeStorageFolder(bucket, folder) {
    const { data, error } = await supabase.storage
        .from(bucket)
        .list(folder, { limit: 1000 });

    if (error) {
        console.warn(`No se pudieron listar archivos de ${bucket}:`, error.message);
        return;
    }

    const paths = (data || [])
        .filter((item) => item.name && item.name !== '.emptyFolderPlaceholder')
        .map((item) => `${folder}/${item.name}`);

    if (paths.length === 0) {
        return;
    }

    const { error: removeError } = await supabase.storage
        .from(bucket)
        .remove(paths);

    if (removeError) {
        console.warn(`No se pudieron borrar archivos de ${bucket}:`, removeError.message);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    document.getElementById('dark-mode-toggle').addEventListener('click', toggleDarkModeSetting);
    document.getElementById('language-select').addEventListener('change', saveLanguage);
    document.getElementById('save-location').addEventListener('click', saveLocation);
    document.getElementById('location-input').addEventListener('input', () => {
        setStatus('location-save-status', 'Cambios pendientes. Pulsa Guardar.', 'muted');
    });
    document.getElementById('location-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            saveLocation();
        }
    });
    document.getElementById('suspend-account').addEventListener('click', suspendAccount);
    document.getElementById('delete-account-request').addEventListener('click', requestAccountDeletion);
});
