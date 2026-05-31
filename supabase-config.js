import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const supabaseUrl = 'https://nwlbwjeoaqpjyjkohpcr.supabase.co';
export const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53bGJ3amVvYXFwanlqa29ocGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNTA2NDgsImV4cCI6MjA5MTYyNjY0OH0.VGWqD-K38HBDLQZYGW7mKb12qroON9zW6X5G0j6e_Nc';
export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage
    }
});

window.supabase = supabase;

export async function getCurrentSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
        return null;
    }

    return data.session;
}

export async function getCurrentUser() {
    const session = await getCurrentSession();
    if (!session?.user) {
        return null;
    }

    return session.user;
}

export async function requireUser() {
    const user = await getCurrentUser();
    if (!user) {
        const next = encodeURIComponent(window.location.pathname.split('/').pop() + window.location.search);
        window.location.href = `login.html?next=${next}`;
        return null;
    }

    return user;
}

export function userErrorMessage(error) {
    if (!navigator.onLine) {
        return 'Sin conexi\u00f3n a internet. Revisa tu red e intenta de nuevo.';
    }

    const message = error?.message || String(error || '');

    if (message.includes('JWT') || message.includes('not authenticated') || message.includes('Auth session missing')) {
        return 'Tu sesi\u00f3n expir\u00f3. Inicia sesi\u00f3n nuevamente.';
    }

    if (message.includes('permission denied') || message.includes('row-level security') || message.includes('violates row-level security')) {
        return 'No tienes permisos para ver o modificar estos datos.';
    }

    if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('fetch')) {
        return 'No se pudo conectar con Supabase. Intenta de nuevo en unos segundos.';
    }

    return message || 'Ocurri\u00f3 un error inesperado.';
}

export function renderState(container, title, message, action = null) {
    if (!container) return;

    container.replaceChildren();

    const wrapper = document.createElement('div');
    wrapper.className = 'glass p-8 text-center';

    const heading = document.createElement('h2');
    heading.className = 'font-black text-blue-900 uppercase';
    heading.textContent = title;
    wrapper.appendChild(heading);

    const copy = document.createElement('p');
    copy.className = 'text-xs text-blue-700 mt-2';
    copy.textContent = message;
    wrapper.appendChild(copy);

    if (action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'glossy-btn text-blue-900 font-black px-5 py-3 rounded-full uppercase text-[10px] tracking-widest mt-5';
        button.textContent = action.label || 'Continuar';

        if (typeof action.onClick === 'function') {
            button.addEventListener('click', action.onClick);
        } else if (action.href) {
            button.addEventListener('click', () => {
                window.location.href = action.href;
            });
        }

        wrapper.appendChild(button);
    }

    container.appendChild(wrapper);
}

export function validateImageFile(file, maxSizeMb = 5) {
    if (!file) {
        return 'Selecciona un archivo.';
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        return 'Solo se permiten im\u00e1genes JPG, PNG o WEBP.';
    }

    if (file.size > maxSizeMb * 1024 * 1024) {
        return `La imagen no debe superar ${maxSizeMb} MB.`;
    }

    return null;
}

export async function uploadImage(bucket, folder, file, options = {}) {
    const validationError = validateImageFile(file, options.maxSizeMb || 5);
    if (validationError) {
        throw new Error(validationError);
    }

    const extension = file.name.split('.').pop().toLowerCase();
    const filename = `${crypto.randomUUID()}.${extension}`;
    const path = `${folder}/${filename}`;

    const { error } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
            cacheControl: '3600',
            upsert: false
        });

    if (error) {
        throw error;
    }

    const { data } = supabase.storage
        .from(bucket)
        .getPublicUrl(path);

    return {
        path,
        url: data.publicUrl
    };
}

export function formatCurrency(value) {
    return '$' + Number(value || 0).toLocaleString('es-MX');
}

export function formatUnit(unit) {
    const units = {
        tons: 'TONS',
        kg: 'KG',
        lt: 'LT',
        m3: 'M\u00b3'
    };

    return units[unit] || 'TONS';
}

export function normalizePublication(row) {
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
        location: row.ubicacion || 'San Luis Potos\u00ed',
        presentation: row.presentacion || 'Lote industrial',
        purity: row.pureza || 100,
        description: row.descripcion || '',
        images: row.imagenes || []
    };
}
