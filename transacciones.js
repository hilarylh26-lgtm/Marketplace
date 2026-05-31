import { formatCurrency, formatUnit, renderState, requireUser, supabase, userErrorMessage } from './supabase-config.js';

let currentUser = null;
let transactions = [];

const stateLabels = {
    pendiente_efectivo: 'Pendiente efectivo',
    confirmada: 'Confirmada',
    entregada: 'Entregada',
    cancelada: 'Cancelada'
};

function roleFor(transaction) {
    return transaction.comprador_id === currentUser.id ? 'comprador' : 'vendedor';
}

function counterpartName(transaction) {
    const role = roleFor(transaction);
    if (role === 'comprador') {
        return transaction.vendedor_nombre || transaction.publicaciones?.empresa || 'Vendedor registrado';
    }

    return transaction.comprador_nombre || 'Comprador registrado';
}

function chatUrl(transaction) {
    const role = roleFor(transaction);
    const peerId = role === 'comprador' ? transaction.vendedor_id : transaction.comprador_id;
    return `chat.html?publicacion=${encodeURIComponent(transaction.publicacion_id)}&peer=${encodeURIComponent(peerId)}`;
}

function matchesFilters(transaction) {
    const search = document.getElementById('transaction-search').value.toLowerCase();
    const roleFilter = document.getElementById('role-filter').value;
    const statusFilter = document.getElementById('status-filter').value;
    const publication = transaction.publicaciones || {};
    const role = roleFor(transaction);
    const searchable = [publication.titulo, publication.empresa, transaction.estado, transaction.metodo_pago, role].join(' ').toLowerCase();

    return (
        (roleFilter === 'all' || roleFilter === role) &&
        (statusFilter === 'all' || statusFilter === transaction.estado) &&
        searchable.includes(search)
    );
}

function actionButtons(transaction) {
    if (transaction.estado === 'entregada' || transaction.estado === 'cancelada') return '';

    const role = roleFor(transaction);
    const buttons = [];
    if (role === 'vendedor' && transaction.estado === 'pendiente_efectivo') {
        buttons.push(`<button onclick="updateTransactionState('${transaction.id}', 'confirmada')" class="glossy-btn text-blue-900 font-black px-4 py-2 rounded-full uppercase text-[9px] tracking-widest">Confirmar</button>`);
    }

    if (role === 'vendedor' && transaction.estado === 'confirmada') {
        buttons.push(`<button onclick="updateTransactionState('${transaction.id}', 'entregada')" class="glossy-btn text-blue-900 font-black px-4 py-2 rounded-full uppercase text-[9px] tracking-widest">Marcar entregada</button>`);
    }

    if (role === 'vendedor' || transaction.estado === 'pendiente_efectivo') {
        buttons.push(`<button onclick="updateTransactionState('${transaction.id}', 'cancelada')" class="bg-white/70 border border-red-200 text-red-600 font-black px-4 py-2 rounded-full uppercase text-[9px] tracking-widest hover:bg-white transition">Cancelar</button>`);
    }

    if (buttons.length === 0) return '';

    return `<div class="flex flex-wrap gap-2">${buttons.join('')}</div>`;
}

function transactionTemplate(transaction) {
    const publication = transaction.publicaciones || {};
    const role = roleFor(transaction);
    const status = stateLabels[transaction.estado] || transaction.estado;
    const quantity = `${publication.volumen_tons || 0} ${formatUnit(publication.unidad_medida)}`;
    const counterpartLabel = role === 'comprador' ? 'Vendedor' : 'Comprador';
    const counterpart = counterpartName(transaction);

    return `
        <article class="glass p-6 transaction-card" data-role="${role}" data-status="${transaction.estado}">
            <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                <div class="flex-1">
                    <div class="flex flex-wrap items-center gap-2 mb-3">
                        <span class="text-[9px] font-black text-white bg-blue-500 px-2 py-0.5 rounded-full uppercase">${role}</span>
                        <span class="text-[9px] font-black text-blue-700 bg-white/70 px-2 py-0.5 rounded-full uppercase">${status}</span>
                        <span class="text-[9px] font-black text-green-700 bg-green-100 px-2 py-0.5 rounded-full uppercase">Pago en efectivo</span>
                    </div>
                    <h2 class="text-2xl font-black text-blue-900 uppercase italic">${publication.titulo || 'Publicación no disponible'}</h2>
                    <p class="text-[10px] font-bold text-blue-400 uppercase mt-1">${counterpartLabel}: ${counterpart}</p>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 bg-white/40 rounded-2xl p-4 border border-white/50 shadow-inner">
                        <div><span class="block text-[9px] text-blue-400 font-black uppercase">Cantidad</span><span class="font-black text-blue-900">${quantity}</span></div>
                        <div><span class="block text-[9px] text-blue-400 font-black uppercase">Precio acordado</span><span class="font-black text-green-600">${formatCurrency(transaction.precio_acordado)}</span></div>
                        <div><span class="block text-[9px] text-blue-400 font-black uppercase">Método</span><span class="font-black text-blue-900 uppercase">${transaction.metodo_pago}</span></div>
                        <div><span class="block text-[9px] text-blue-400 font-black uppercase">Fecha</span><span class="font-black text-blue-900">${new Date(transaction.created_at).toLocaleDateString('es-MX')}</span></div>
                    </div>
                </div>
                <div class="lg:w-56 flex flex-col gap-3">
                    <button onclick="window.location.href='${chatUrl(transaction)}'" class="glossy-btn text-blue-900 font-black px-4 py-3 rounded-full uppercase text-[9px] tracking-widest">Abrir chat</button>
                    ${actionButtons(transaction)}
                </div>
            </div>
        </article>
    `;
}

function renderTransactions() {
    const list = document.getElementById('transactions-list');
    const visible = transactions.filter(matchesFilters);

    if (visible.length === 0) {
        renderState(list, 'No hay transacciones', 'Cuando confirmes un trato en efectivo desde el chat, aparecerá aquí.', {
            label: 'Ir al inicio',
            href: 'index.html'
        });
        return;
    }

    list.innerHTML = visible.map(transactionTemplate).join('');
}

async function loadTransactions() {
    currentUser = await requireUser();
    if (!currentUser) return;

    const { data, error } = await supabase
        .from('transacciones')
        .select('*, publicaciones(*)')
        .or(`comprador_id.eq.${currentUser.id},vendedor_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false });

    if (error) {
        renderState(document.getElementById('transactions-list'), 'No se pudieron cargar transacciones', userErrorMessage(error), {
            label: 'Reintentar',
            onClick: () => window.location.reload()
        });
        return;
    }

    transactions = data || [];
    renderTransactions();
}

window.updateTransactionState = async function(id, state) {
    const transaction = transactions.find((item) => item.id === id);
    if (!transaction) {
        alert('No se encontro la transaccion.');
        return;
    }

    const role = roleFor(transaction);
    const allowed =
        (role === 'vendedor' && transaction.estado === 'pendiente_efectivo' && ['confirmada', 'cancelada'].includes(state)) ||
        (role === 'vendedor' && transaction.estado === 'confirmada' && ['entregada', 'cancelada'].includes(state)) ||
        (role === 'comprador' && transaction.estado === 'pendiente_efectivo' && state === 'cancelada');

    if (!allowed) {
        alert('No tienes permiso para hacer este cambio de estado.');
        return;
    }

    const labels = {
        confirmada: 'confirmar esta transacción',
        entregada: 'marcar esta transacción como entregada',
        cancelada: 'cancelar esta transacción'
    };

    if (!confirm(`¿Quieres ${labels[state] || 'actualizar esta transacción'}?`)) return;

    const { error } = await supabase
        .from('transacciones')
        .update({ estado: state, updated_at: new Date().toISOString() })
        .eq('id', id)
        .or(`comprador_id.eq.${currentUser.id},vendedor_id.eq.${currentUser.id}`);

    if (error) {
        alert('No se pudo actualizar la transacción: ' + userErrorMessage(error));
        return;
    }

    await loadTransactions();
};

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('transaction-search').addEventListener('input', renderTransactions);
    document.getElementById('role-filter').addEventListener('change', renderTransactions);
    document.getElementById('status-filter').addEventListener('change', renderTransactions);
    await loadTransactions();
});
