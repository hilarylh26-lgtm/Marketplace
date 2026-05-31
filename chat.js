import { formatCurrency, formatUnit, renderState, requireUser, supabase, userErrorMessage } from './supabase-config.js';

const params = new URLSearchParams(window.location.search);
const publicationId = params.get('publicacion');
const requestedPeerId = params.get('peer');
let currentUser = null;
let currentProfile = null;
let publication = null;
let conversationPeerId = null;

function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function initials(name) {
    return (name || 'RS')
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
}

function renderPublication() {
    document.getElementById('chat-company').innerText = publication.empresa || 'Empresa registrada';
    document.getElementById('chat-avatar').innerText = initials(publication.empresa);
    document.getElementById('chat-product').innerText = `${publication.titulo} (${publication.volumen_tons} ${formatUnit(publication.unidad_medida)})`;
    document.getElementById('deal-price').innerHTML = `${formatCurrency(publication.precio)} <small class="text-[10px] text-slate-500">MXN</small>`;
    document.getElementById('deal-shipping').innerText = publication.requiere_flete ? 'Requiere flete por negociar' : 'Flete no requerido por el publicador';
    document.getElementById('deal-status').innerText = publication.estado === 'available' ? 'Disponible' : 'Servicio / estado por confirmar';

    if (publication.user_id === currentUser.id) {
        const dealButton = document.getElementById('cash-deal-button');
        dealButton.disabled = true;
        dealButton.innerText = 'Esperando comprador';
        dealButton.classList.add('opacity-60', 'cursor-not-allowed');
    }
}

function messageTemplate(message) {
    const mine = message.sender_id === currentUser.id;
    const wrapperClass = mine ? 'items-end ml-auto' : 'items-start';
    const bubbleClass = mine
        ? 'bg-rsu_dark text-white rounded-tr-none'
        : 'bg-slate-100 text-slate-700 rounded-tl-none';
    const time = new Date(message.created_at).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit'
    });

    const safeContent = message.contenido
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

    return `
        <div class="flex flex-col ${wrapperClass} max-w-[80%]">
            <div class="${bubbleClass} p-4 rounded-2xl text-sm font-medium leading-relaxed shadow-sm">
                ${safeContent}
            </div>
            <span class="text-[9px] text-slate-400 font-bold uppercase mt-1">${time}</span>
        </div>
    `;
}

async function loadPublication() {
    if (!publicationId) {
        document.getElementById('messages-list').innerHTML = `
            <div class="text-center text-xs font-bold text-red-500 uppercase">No se indicó una publicación para el chat.</div>
        `;
        return false;
    }

    const { data, error } = await supabase
        .from('publicaciones')
        .select('*')
        .eq('id', publicationId)
        .single();

    if (error) {
        renderState(document.getElementById('messages-list'), 'No se pudo cargar la publicacion', userErrorMessage(error), {
            label: 'Volver al mercado',
            href: 'index.html'
        });
        return false;
    }

    publication = data;

    if (isUuid(requestedPeerId) && requestedPeerId !== currentUser.id) {
        conversationPeerId = requestedPeerId;
    } else if (publication.user_id !== currentUser.id) {
        conversationPeerId = publication.user_id;
    } else {
        conversationPeerId = null;
    }

    if (!publication.user_id) {
        renderState(document.getElementById('messages-list'), 'Publicación sin vendedor', 'Esta publicación no tiene un vendedor asociado y no puede iniciar una transacción.', {
            label: 'Volver al inicio',
            href: 'index.html'
        });
        return false;
    }

    renderPublication();
    return true;
}

async function loadCurrentProfile() {
    const { data } = await supabase
        .from('perfiles')
        .select('nombre_usuario, nombre_empresa')
        .eq('id', currentUser.id)
        .maybeSingle();

    currentProfile = data;
}

function currentDisplayName() {
    return currentProfile?.nombre_usuario
        || currentProfile?.nombre_empresa
        || currentUser.user_metadata?.nombre_usuario
        || currentUser.email
        || 'Usuario registrado';
}

function parseQuantity(value) {
    const normalized = String(value || '').replace(',', '.').trim();
    const quantity = Number(normalized);
    return Number.isFinite(quantity) ? quantity : 0;
}

async function loadMessages() {
    const list = document.getElementById('messages-list');

    if (!conversationPeerId) {
        renderState(list, 'Selecciona una conversacion', 'Abre el chat desde una transaccion para responder a un comprador especifico.', {
            label: 'Ver transacciones',
            href: 'transacciones.html'
        });
        return;
    }

    const { data, error } = await supabase
        .from('mensajes')
        .select('*')
        .eq('publicacion_id', publicationId)
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${conversationPeerId}),and(sender_id.eq.${conversationPeerId},receiver_id.eq.${currentUser.id})`)
        .order('created_at', { ascending: true });

    if (error) {
        renderState(list, 'No se pudieron cargar mensajes', userErrorMessage(error), {
            label: 'Reintentar',
            onClick: () => window.location.reload()
        });
        return;
    }

    if (data.length === 0) {
        list.innerHTML = `
            <div class="text-center text-xs font-bold text-slate-400 uppercase">Aún no hay mensajes. Inicia la negociación.</div>
        `;
        return;
    }

    list.innerHTML = data.map(messageTemplate).join('');
    list.scrollTop = list.scrollHeight;
}

async function sendMessage(event) {
    event.preventDefault();

    const input = document.getElementById('message-input');
    const content = input.value.trim();
    if (!content) {
        return;
    }

    if (!conversationPeerId || conversationPeerId === currentUser.id) {
        alert('Todavía no hay otra persona en esta conversación. Comparte la publicación para que un comprador inicie el chat.');
        return;
    }

    const { error } = await supabase
        .from('mensajes')
        .insert({
            publicacion_id: publicationId,
            sender_id: currentUser.id,
            receiver_id: conversationPeerId,
            contenido: content
        });

    if (error) {
        alert('No se pudo enviar el mensaje: ' + userErrorMessage(error));
        return;
    }

    input.value = '';
    await loadMessages();
}

async function confirmCashDeal() {
    if (!publication) {
        return;
    }

    const dealButton = document.getElementById('cash-deal-button');

    if (publication.user_id === currentUser.id) {
        alert('El vendedor no puede crear el trato como comprador. Espera a que el comprador confirme el trato en efectivo.');
        return;
    }

    if (!publication.user_id) {
        alert('Esta publicación no tiene un vendedor asociado.');
        return;
    }

    const publishedQuantity = Number(publication.volumen_tons || 0);
    const unit = publication.unidad_medida || 'tons';
    const quantityInput = prompt(`Cantidad acordada (${formatUnit(unit)}):`, String(publishedQuantity || 1));
    if (quantityInput === null) {
        return;
    }

    const agreedQuantity = parseQuantity(quantityInput);
    if (agreedQuantity <= 0) {
        alert('La cantidad acordada debe ser mayor a cero.');
        return;
    }

    if (publishedQuantity > 0 && agreedQuantity > publishedQuantity) {
        alert('La cantidad acordada no puede ser mayor al volumen publicado.');
        return;
    }

    const confirmed = confirm('¿Confirmas que este trato se pagará únicamente en efectivo al entregar o recolectar el material?');
    if (!confirmed) {
        return;
    }

    dealButton.disabled = true;
    dealButton.innerText = 'Registrando trato...';

    const { data: existingTransaction, error: lookupError } = await supabase
        .from('transacciones')
        .select('id')
        .eq('publicacion_id', publication.id)
        .eq('comprador_id', currentUser.id)
        .neq('estado', 'cancelada')
        .maybeSingle();

    if (lookupError) {
        dealButton.disabled = false;
        dealButton.innerText = 'Confirmar trato en efectivo';
        alert('No se pudo revisar si el trato ya existe: ' + userErrorMessage(lookupError));
        return;
    }

    if (existingTransaction) {
        alert('Este trato ya estaba registrado. Puedes revisarlo en Transacciones.');
        window.location.href = 'transacciones.html';
        return;
    }

    const transactionPayload = {
        publicacion_id: publication.id,
        comprador_id: currentUser.id,
        vendedor_id: publication.user_id,
        precio_acordado: Number(publication.precio || 0),
        cantidad_acordada: agreedQuantity,
        unidad_acordada: unit,
        metodo_pago: 'efectivo',
        estado: 'pendiente_efectivo',
        notas: 'Pago en efectivo acordado desde el chat.',
        comprador_nombre: currentDisplayName(),
        vendedor_nombre: publication.empresa || 'Usuario registrado'
    };

    let { error } = await supabase
        .from('transacciones')
        .insert(transactionPayload);

    if (error && (error.message?.includes('comprador_nombre') || error.message?.includes('vendedor_nombre'))) {
        const fallbackPayload = { ...transactionPayload };
        delete fallbackPayload.comprador_nombre;
        delete fallbackPayload.vendedor_nombre;

        const fallbackResult = await supabase
            .from('transacciones')
            .insert(fallbackPayload);

        error = fallbackResult.error;
    }

    if (error) {
        if (error.code === '23505' || error.message?.includes('duplicate key')) {
            alert('Este trato ya estaba registrado. Puedes revisarlo en Transacciones.');
            window.location.href = 'transacciones.html';
            return;
        }

        if (error.message?.includes('transaccion activa')) {
            alert('Esta publicacion ya tiene una transaccion activa. No se puede vender el mismo lote dos veces.');
            window.location.href = 'transacciones.html';
            return;
        }

        dealButton.disabled = false;
        dealButton.innerText = 'Confirmar trato en efectivo';
        alert('No se pudo registrar el trato en efectivo: ' + userErrorMessage(error));
        return;
    }

    alert('Trato en efectivo registrado. Coordina entrega, recolección y comprobante dentro del chat.');
    window.location.href = 'transacciones.html';
}

async function initChat() {
    currentUser = await requireUser();
    if (!currentUser) {
        return;
    }

    const loaded = await loadPublication();
    if (!loaded) {
        return;
    }

    await loadCurrentProfile();

    document.getElementById('message-form').addEventListener('submit', sendMessage);
    document.getElementById('cash-deal-button').addEventListener('click', confirmCashDeal);
    const draft = sessionStorage.getItem(`rsu-chat-draft-${publicationId}`);
    if (draft) {
        document.getElementById('message-input').value = draft;
        sessionStorage.removeItem(`rsu-chat-draft-${publicationId}`);
    }
    await loadMessages();
    setInterval(loadMessages, 5000);
}

document.addEventListener('DOMContentLoaded', initChat);
