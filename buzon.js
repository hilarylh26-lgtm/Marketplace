import { renderState, requireUser, supabase, userErrorMessage } from './supabase-config.js';

let currentUser = null;
let conversations = [];
let peerProfiles = new Map();

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatTime(value) {
    const date = new Date(value);
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();

    if (sameDay) {
        return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function initials(name) {
    return String(name || 'RS')
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
}

function peerIdFor(message) {
    return message.sender_id === currentUser.id ? message.receiver_id : message.sender_id;
}

function conversationKey(message) {
    return `${message.publicacion_id}:${peerIdFor(message)}`;
}

function profileName(profile) {
    return profile?.nombre_usuario || profile?.nombre_empresa || profile?.email || '';
}

async function loadPeerProfiles(messages) {
    const peerIds = [...new Set(messages.map(peerIdFor).filter(Boolean))];
    if (peerIds.length === 0) {
        peerProfiles = new Map();
        return;
    }

    const { data, error } = await supabase
        .from('perfiles')
        .select('id, nombre_usuario, nombre_empresa, email')
        .in('id', peerIds);

    if (error) {
        peerProfiles = new Map();
        return;
    }

    peerProfiles = new Map((data || []).map((profile) => [profile.id, profile]));
}

function buildConversations(messages) {
    const grouped = new Map();

    messages.forEach((message) => {
        const peerId = peerIdFor(message);
        if (!peerId) return;

        const key = conversationKey(message);
        const publication = message.publicaciones || {};
        const isSeller = publication.user_id === currentUser.id;
        const peerProfile = peerProfiles.get(peerId);
        const peerName = isSeller
            ? profileName(peerProfile) || 'Comprador registrado'
            : profileName(peerProfile) || publication.empresa || 'Vendedor registrado';
        const existing = grouped.get(key);

        if (!existing) {
            grouped.set(key, {
                key,
                peerId,
                publicationId: message.publicacion_id,
                title: publication.titulo || 'Publicación no disponible',
                company: publication.empresa || 'Empresa registrada',
                peerName,
                role: isSeller ? 'seller' : 'buyer',
                messages: [message],
                lastMessage: message
            });
            return;
        }

        existing.messages.push(message);
        if (new Date(message.created_at) > new Date(existing.lastMessage.created_at)) {
            existing.lastMessage = message;
        }
    });

    return [...grouped.values()].sort((first, second) => {
        return new Date(second.lastMessage.created_at) - new Date(first.lastMessage.created_at);
    });
}

function matchesFilters(conversation) {
    const search = document.getElementById('inbox-search').value.toLowerCase();
    const roleFilter = document.getElementById('inbox-role-filter').value;
    const lastMessage = conversation.lastMessage?.contenido || '';
    const searchable = [
        conversation.title,
        conversation.company,
        conversation.peerName,
        conversation.peerId,
        conversation.role,
        lastMessage
    ].join(' ').toLowerCase();

    return (
        (roleFilter === 'all' || roleFilter === conversation.role) &&
        searchable.includes(search)
    );
}

function conversationTemplate(conversation) {
    const lastMessage = conversation.lastMessage || {};
    const mine = lastMessage.sender_id === currentUser.id;
    const label = conversation.role === 'seller' ? 'Comprador' : 'Vendedor';
    const peerName = conversation.peerName || (conversation.role === 'seller' ? 'Comprador registrado' : conversation.company);
    const chatUrl = `chat.html?publicacion=${encodeURIComponent(conversation.publicationId)}&peer=${encodeURIComponent(conversation.peerId)}`;

    return `
        <article class="glass p-5 hover:border-blue-200 transition">
            <button type="button" onclick="window.location.href='${chatUrl}'" class="w-full text-left flex flex-col md:flex-row md:items-center gap-4">
                <div class="w-12 h-12 flex-none rounded-full bg-rsu_accent text-white font-black flex items-center justify-center">
                    ${escapeHtml(initials(peerName))}
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2 mb-1">
                        <span class="text-[9px] font-black text-white bg-blue-500 px-2 py-0.5 rounded-full uppercase">${label}</span>
                        <span class="text-[9px] font-black text-blue-700 bg-white/70 px-2 py-0.5 rounded-full uppercase">${conversation.messages.length} mensajes</span>
                    </div>
                    <h2 class="text-xl font-black text-blue-900 uppercase">${escapeHtml(conversation.title)}</h2>
                    <p class="text-[10px] font-bold text-blue-400 uppercase mt-1">${escapeHtml(peerName)}</p>
                    <p class="text-sm text-slate-600 mt-3 truncate">${mine ? 'Tu: ' : ''}${escapeHtml(lastMessage.contenido || '')}</p>
                </div>
                <div class="flex-none text-left md:text-right">
                    <p class="text-[10px] font-black text-slate-400 uppercase">${formatTime(lastMessage.created_at)}</p>
                    <span class="inline-flex mt-3 glossy-btn text-blue-900 font-black px-4 py-2 rounded-full uppercase text-[9px] tracking-widest">Abrir chat</span>
                </div>
            </button>
        </article>
    `;
}

function renderConversations() {
    const list = document.getElementById('inbox-list');
    const visible = conversations.filter(matchesFilters);

    if (visible.length === 0) {
        renderState(list, 'No hay conversaciones', 'Cuando envies o recibas mensajes desde una publicacion, apareceran aqui.', {
            label: 'Ir al inicio',
            href: 'index.html'
        });
        return;
    }

    list.innerHTML = visible.map(conversationTemplate).join('');
}

async function loadInbox() {
    currentUser = await requireUser();
    if (!currentUser) return;

    const { data, error } = await supabase
        .from('mensajes')
        .select('*, publicaciones(*)')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false });

    if (error) {
        renderState(document.getElementById('inbox-list'), 'No se pudo cargar el buzon', userErrorMessage(error), {
            label: 'Reintentar',
            onClick: () => window.location.reload()
        });
        return;
    }

    await loadPeerProfiles(data || []);
    conversations = buildConversations(data || []);
    renderConversations();
}

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('inbox-search').addEventListener('input', renderConversations);
    document.getElementById('inbox-role-filter').addEventListener('change', renderConversations);
    await loadInbox();
});
