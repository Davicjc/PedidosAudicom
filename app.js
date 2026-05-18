// ═══════════════════════════════════════════════════════════════════════════
//  PEDIDOS AUDICOM — app.js
// ═══════════════════════════════════════════════════════════════════════════

// ─── FIREBASE ───────────────────────────────────────────────────────────────
let db, colPedidos, colAdm;

window.addEventListener('load', () => {
    // Mostra a UI primeiro — Firebase init não pode bloquear a tela
    initSignatures();
    showView('view-cpf');
    setTimeout(() => document.getElementById('inp-cpf')?.focus(), 100);

    try {
        db         = firebase.firestore();
        colPedidos = db.collection('pedidos');
        colAdm     = db.collection('usuarios_adm');
    } catch (e) {
        console.error('Firebase init error:', e);
        showToast('Erro ao conectar. Verifique sua conexão.', 'erro');
    }
});

// ─── STATE ──────────────────────────────────────────────────────────────────
const st = {
    cpf: '',
    pedido: null,
    adm: null,
    pedidos: [],
    _unsub: null,
};

// ─── NAVIGATION ─────────────────────────────────────────────────────────────
function showView(id) {
    document.querySelectorAll('.view').forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('view-active');
    });
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.add('view-active'));
    window.scrollTo(0, 0);
}

// ─── CPF / CNPJ ─────────────────────────────────────────────────────────────
function rawNum(v) { return (v || '').replace(/\D/g, ''); }

function maskDoc(v) {
    const n = rawNum(v).slice(0, 14);
    if (n.length <= 11)
        return n.replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    return n.replace(/^(\d{2})(\d)/, '$1.$2')
             .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
             .replace(/\.(\d{3})(\d)/, '.$1/$2')
             .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function onDocInput(el) {
    const cur = el.selectionStart;
    const prev = el.value.length;
    el.value = maskDoc(el.value);
    const diff = el.value.length - prev;
    el.setSelectionRange(cur + diff, cur + diff);
}

function validarCpf(s) {
    const n = rawNum(s);
    if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
    const dig = (l) => {
        let s = 0;
        for (let i = 0; i < l; i++) s += +n[i] * (l + 1 - i);
        const r = (s * 10) % 11; return r >= 10 ? 0 : r;
    };
    return dig(9) === +n[9] && dig(10) === +n[10];
}

function validarCnpj(s) {
    const n = rawNum(s);
    if (n.length !== 14 || /^(\d)\1{13}$/.test(n)) return false;
    const calc = (base) => {
        let s = 0, p = base.length - 7;
        for (let i = 0; i < base.length; i++) {
            s += +n[i] * p--;
            if (p < 2) p = 9;
        }
        const r = s % 11; return r < 2 ? 0 : 11 - r;
    };
    return calc(n.slice(0, 12)) === +n[12] && calc(n.slice(0, 13)) === +n[13];
}

function validarDoc(v) {
    const n = rawNum(v);
    if (n.length === 11) return validarCpf(n);
    if (n.length === 14) return validarCnpj(n);
    return false;
}

function tipoDoc(v) {
    const n = rawNum(v);
    if (n.length <= 11) return 'CPF';
    return 'CNPJ';
}

// ─── PHONE MASK ─────────────────────────────────────────────────────────────
function maskPhone(v) {
    const n = rawNum(v).slice(0, 11);
    if (n.length <= 10)
        return n.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
    return n.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}
function onPhoneInput(el) { el.value = maskPhone(el.value); }

// ─── CEP ────────────────────────────────────────────────────────────────────
let _cepTimer = {};

function onCepInput(el, prefix) {
    el.value = rawNum(el.value).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
    clearTimeout(_cepTimer[prefix]);
    if (rawNum(el.value).length === 8)
        _cepTimer[prefix] = setTimeout(() => buscarCep(el.value, prefix), 400);
}

async function buscarCep(cep, prefix) {
    const n = rawNum(cep);
    if (n.length !== 8) return;
    const spinner = document.getElementById(`${prefix}-cep-spin`);
    const erroEl  = document.getElementById(`${prefix}-cep-erro`);
    if (spinner) spinner.classList.remove('hidden');
    if (erroEl)  erroEl.classList.add('hidden');
    try {
        const r = await fetch(`https://viacep.com.br/ws/${n}/json/`);
        const d = await r.json();
        if (spinner) spinner.classList.add('hidden');
        if (d.erro) { if (erroEl) { erroEl.textContent = 'CEP não encontrado'; erroEl.classList.remove('hidden'); } return; }
        setVal(`${prefix}-end`,    d.logradouro || '');
        setVal(`${prefix}-bairro`, d.bairro     || '');
        setVal(`${prefix}-cidade`, d.localidade || '');
        setVal(`${prefix}-uf`,     d.uf         || '');
        document.getElementById(`${prefix}-num`)?.focus();
    } catch {
        if (spinner) spinner.classList.add('hidden');
        if (erroEl) { erroEl.textContent = 'Erro ao buscar CEP'; erroEl.classList.remove('hidden'); }
    }
}

function setVal(id, v) {
    const el = document.getElementById(id);
    if (el) { el.value = v; el.dispatchEvent(new Event('input')); }
}

// ─── MOEDA MASK ─────────────────────────────────────────────────────────────
function maskMoeda(el) {
    let v = rawNum(el.value);
    if (!v) { el.value = ''; return; }
    v = (parseInt(v, 10) / 100).toFixed(2);
    el.value = 'R$ ' + v.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ─── GPS ────────────────────────────────────────────────────────────────────
function pegarLocalizacao(prefix) {
    const btn = document.getElementById(`${prefix}-gps-btn`);
    if (!navigator.geolocation) { alert('GPS não disponível no seu dispositivo.'); return; }
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true; }
    navigator.geolocation.getCurrentPosition(pos => {
        const coords = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
        setVal(`${prefix}-coords`, coords);
        if (btn) { btn.innerHTML = '<i class="fas fa-map-pin"></i>'; btn.disabled = false; }
    }, () => {
        alert('Não foi possível obter localização.');
        if (btn) { btn.innerHTML = '<i class="fas fa-map-pin"></i>'; btn.disabled = false; }
    });
}

// ─── MESMO ENDEREÇO ─────────────────────────────────────────────────────────
function copiarEndereco() {
    const mapa = [
        ['inst-end','corr-end'], ['inst-num','corr-num'], ['inst-bairro','corr-bairro'],
        ['inst-cidade','corr-cidade'], ['inst-uf','corr-uf'], ['inst-cep','corr-cep'],
    ];
    mapa.forEach(([src, dst]) => {
        const s = document.getElementById(src);
        const d = document.getElementById(dst);
        if (s && d) d.value = s.value;
    });
    // expand section if currently collapsed
    const corrBody = document.getElementById('sec-corr-body');
    if (corrBody && corrBody.classList.contains('hidden')) toggleSec('sec-corr');
}

// ─── ACCORDION SECTIONS ─────────────────────────────────────────────────────
function toggleSec(id) {
    const body   = document.getElementById(id + '-body');
    const icon   = document.getElementById(id + '-icon');
    const closed = body.classList.toggle('hidden');
    if (icon) icon.style.transform = closed ? '' : 'rotate(180deg)';
}

// ─── IMAGE COMPRESSION ──────────────────────────────────────────────────────
async function comprimirBase64(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const MAX = 1280;
                let w = img.width, h = img.height;
                if (w > MAX || h > MAX) {
                    if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
                    else { w = Math.round(w * MAX / h); h = MAX; }
                }
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, w, h);
                let q = 0.82, b64;
                do { b64 = c.toDataURL('image/jpeg', q); q -= 0.08; }
                while (b64.length > 204800 && q > 0.1);
                resolve(b64);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ─── ASSINATURAS ────────────────────────────────────────────────────────────
const _sigs = {};

function initSignatures() {
    ['sig-cliente', 'sig-vendedor'].forEach(id => {
        const canvas = document.getElementById(id);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let drawing = false;

        function resize() {
            const data = canvas.toDataURL();
            canvas.width  = canvas.offsetWidth || 320;
            canvas.height = canvas.offsetHeight || 120;
            ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
            if (data !== 'data:,') { const i = new Image(); i.onload = () => ctx.drawImage(i, 0, 0); i.src = data; }
        }

        const getP = e => {
            const r = canvas.getBoundingClientRect();
            if (e.touches) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
            return { x: e.offsetX, y: e.offsetY };
        };

        canvas.addEventListener('mousedown',  e => { drawing = true; const p = getP(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
        canvas.addEventListener('mousemove',  e => { if (!drawing) return; const p = getP(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
        canvas.addEventListener('mouseup',    () => drawing = false);
        canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; const p = getP(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }, { passive: false });
        canvas.addEventListener('touchmove',  e => { e.preventDefault(); if (!drawing) return; const p = getP(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }, { passive: false });
        canvas.addEventListener('touchend',   () => drawing = false);

        _sigs[id] = { canvas, ctx, resize };
        setTimeout(resize, 50);
    });
    window.addEventListener('resize', () => Object.values(_sigs).forEach(s => s.resize()));
}

function limparSig(id) {
    const s = _sigs[id];
    if (s) s.ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
}

function getSig(id) {
    const s = _sigs[id];
    if (!s) return null;
    // return null if empty
    const data = s.canvas.toDataURL();
    if (data === 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==') return null;
    // check if canvas has any drawn pixels
    const pixels = s.ctx.getImageData(0, 0, s.canvas.width, s.canvas.height).data;
    for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] > 0) return data; }
    return null;
}

// ─── LANDING: CPF ENTRY ──────────────────────────────────────────────────────
function _setCpfErro(msg) {
    const el = document.getElementById('cpf-erro');
    if (!el) return;
    const span = el.querySelector('span');
    if (span) span.textContent = msg;
    else el.textContent = msg;
    el.classList.toggle('hidden', !msg);
}

function onLandingDocInput(el) {
    onDocInput(el);
    const n = rawNum(el.value);
    if (n.length >= 11) {
        _setCpfErro(!validarDoc(el.value) ? (tipoDoc(el.value) === 'CPF' ? 'CPF inválido' : 'CNPJ inválido') : '');
    } else _setCpfErro('');
}

function entrarCadastro() {
    const val = document.getElementById('inp-cpf').value;
    if (!validarDoc(val)) {
        _setCpfErro(`${tipoDoc(val)} inválido. Verifique os dígitos.`);
        document.getElementById('inp-cpf').focus();
        return;
    }
    st.cpf = rawNum(val);
    showView('view-form');
    // pre-fill CPF field in form
    setTimeout(() => {
        setVal('form-cpf', document.getElementById('inp-cpf').value);
        setVal('form-data', new Date().toLocaleDateString('pt-BR'));
        if (_sigs['sig-cliente']) _sigs['sig-cliente'].resize();
        if (_sigs['sig-vendedor']) _sigs['sig-vendedor'].resize();
    }, 100);
}

async function entrarStatus() {
    const val = document.getElementById('inp-cpf').value;
    if (!validarDoc(val)) {
        _setCpfErro(`${tipoDoc(val)} inválido. Verifique os dígitos.`);
        return;
    }
    st.cpf = rawNum(val);
    showView('view-status-loading');
    await carregarPedidoCliente();
}

async function carregarPedidoCliente() {
    if (!colPedidos) { showToast('Sem conexão com banco de dados.', 'erro'); showView('view-cpf'); return; }
    try {
        const snap = await colPedidos.where('cpf', '==', st.cpf).get();

        if (snap.empty) { showView('view-status-vazio'); return; }

        // ordena do mais recente para o mais antigo
        st.pedidos_cliente = snap.docs
            .sort((a, b) => (b.data().criadoEm?.toMillis?.() ?? 0) - (a.data().criadoEm?.toMillis?.() ?? 0))
            .map(d => ({ id: d.id, ...d.data() }));
        st.pedido_idx = 0;
        st.pedido = st.pedidos_cliente[0];
        renderStatusCliente();
        showView('view-status');
    } catch (err) {
        alert('Erro ao buscar pedido: ' + err.message);
        showView('view-cpf');
    }
}

function selecionarPedidoCliente(idx) {
    st.pedido_idx = idx;
    st.pedido = st.pedidos_cliente[idx];
    renderStatusCliente();
    document.getElementById('status-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── STATUS BADGE HELPERS ────────────────────────────────────────────────────
function statusLabel(s) {
    return { pendente:'Pendente', aceito:'Aceito', recusado:'Recusado', reaberto:'Reaberto pelo cliente', fechado:'Encerrado Definitivamente' }[s] || s;
}
function statusCls(s) {
    return {
        pendente: 'text-amber-400  bg-amber-500/15  border-amber-500/30',
        aceito:   'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
        recusado: 'text-rose-400   bg-rose-500/15   border-rose-500/30',
        reaberto: 'text-blue-400   bg-blue-500/15   border-blue-500/30',
        fechado:  'text-slate-400  bg-slate-800/60  border-slate-600/50',
    }[s] || 'text-slate-400 bg-slate-700 border-slate-600';
}
function statusIcon(s) {
    return { pendente:'fa-clock', aceito:'fa-circle-check', recusado:'fa-circle-xmark', reaberto:'fa-rotate-left', fechado:'fa-lock' }[s] || 'fa-circle';
}
function _sistemaColor(texto) {
    const t = (texto || '').toLowerCase();
    if (t.includes('aceito'))                   return { cor:'#34d399', bg:'rgba(16,185,129,0.12)',  brd:'rgba(16,185,129,0.3)' };
    if (t.includes('recusado'))                  return { cor:'#f87171', bg:'rgba(239,68,68,0.12)',   brd:'rgba(239,68,68,0.3)' };
    if (t.includes('definitivamente') || t.includes('encerrado') || t.includes('fechado'))
                                                 return { cor:'#fb923c', bg:'rgba(251,146,60,0.12)',  brd:'rgba(251,146,60,0.3)' };
    if (t.includes('pendente'))                  return { cor:'#fbbf24', bg:'rgba(251,191,36,0.12)',  brd:'rgba(251,191,36,0.3)' };
    if (t.includes('alterado') || t.includes('status')) return { cor:'#60a5fa', bg:'rgba(96,165,250,0.12)', brd:'rgba(96,165,250,0.3)' };
    return { cor:'#94a3b8', bg:'rgba(148,163,184,0.08)', brd:'rgba(148,163,184,0.2)' };
}

// ─── RENDER STATUS CLIENTE ───────────────────────────────────────────────────
function renderStatusCliente() {
    const p = st.pedido;
    if (!p) return;

    let pagerHtml = '';
    if (st.pedidos_cliente && st.pedidos_cliente.length > 1) {
        let options = st.pedidos_cliente.map((ped, i) => {
            const date = ped.criadoEm?.toDate ? ped.criadoEm.toDate().toLocaleDateString('pt-BR') : (ped.criadoEmStr || '—');
            return `<option value="${i}" ${i === st.pedido_idx ? 'selected' : ''}>Pedido (${date}) - ${escHtml(ped.nome || 'Sem Nome')}</option>`;
        }).join('');
        pagerHtml = `
            <div class="mb-4 bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2"><i class="fas fa-list-ul mr-1"></i>Outros Pedidos deste Documento</p>
                <select class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:border-violet-500" onchange="selecionarPedidoCliente(parseInt(this.value, 10))">
                    ${options}
                </select>
            </div>
        `;
    }

    const el = document.getElementById('status-card');
    const sCls  = statusCls(p.status);
    const sLbl  = statusLabel(p.status);
    const sIcon = statusIcon(p.status);

    const dataFmt = p.criadoEm?.toDate
        ? p.criadoEm.toDate().toLocaleString('pt-BR')
        : (p.criadoEmStr || '—');

    el.innerHTML = `
        ${pagerHtml}
        <div class="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <div>
                <p class="text-xs text-slate-500 uppercase tracking-widest font-bold mb-0.5">Pedido</p>
                <p class="font-black text-xl text-violet-300">${p.nome || '—'}</p>
                <p class="text-xs text-slate-500 mt-0.5"><i class="fas fa-id-card mr-1"></i>${maskDoc(p.cpf)}</p>
            </div>
            <span class="text-sm font-black px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${sCls}">
                <i class="fas ${sIcon}"></i>${sLbl}
            </span>
        </div>

        <div class="text-xs text-slate-500 mb-4"><i class="fas fa-clock mr-1"></i>Pedido em: ${dataFmt}</div>

        ${p.notaAtendente ? `
        <div class="bg-slate-800/60 border border-violet-500/20 rounded-xl p-4 mb-4">
            <p class="text-xs font-bold text-violet-400 uppercase tracking-wider mb-2"><i class="fas fa-comment-dots mr-1"></i>Nota do Atendente</p>
            <p class="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">${escHtml(p.notaAtendente)}</p>
        </div>` : ''}

        ${p.servico ? `
        <div class="bg-slate-800/40 rounded-xl p-4 mb-4 space-y-1.5">
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2"><i class="fas fa-wifi mr-1 text-violet-400"></i>Serviço Contratado</p>
            ${p.servico.planoMensal   ? row('Plano',        p.servico.planoMensal)   : ''}
            ${p.servico.pacote        ? row('Pacote',       p.servico.pacote)        : ''}
            ${p.servico.valorMensal   ? row('Mensalidade',  p.servico.valorMensal)   : ''}
            ${p.servico.dataInstalacao? row('Instalação',   p.servico.dataInstalacao + (p.servico.hora ? ' às ' + p.servico.hora : '')) : ''}
            ${p.servico.tecnico       ? row('Técnico',      p.servico.tecnico)       : ''}
        </div>` : ''}

        ${p.assinaturaCliente ? `
        <div class="bg-slate-800/40 rounded-xl p-4 mb-4">
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Sua Assinatura</p>
            <div class="bg-white rounded-lg p-2 inline-block"><img src="${p.assinaturaCliente}" class="max-h-12" alt="Assinatura Cliente"></div>
        </div>` : ''}

        <div class="border-t border-slate-700/60 pt-4 mt-4">
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3"><i class="fas fa-comments mr-1 text-violet-400"></i>Comentários</p>
            <div id="timeline-comentarios" class="space-y-3 mb-4">${renderComentarios(p.comentarios)}</div>

            ${p.status === 'fechado' ? `
            <div class="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
                <i class="fas fa-lock text-slate-500 text-xl mb-2 block"></i>
                <p class="text-sm font-bold text-slate-400">Este pedido foi encerrado definitivamente</p>
                <p class="text-xs text-slate-600 mt-1">Não é possível enviar novos comentários.</p>
            </div>` : `
            <div id="bloco-comentar">
                <textarea id="inp-comentario" rows="3" placeholder="Escreva um comentário ou dúvida para o atendente..." class="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm outline-none focus:border-violet-500 transition resize-none"></textarea>
                <button onclick="enviarComentarioCliente()" class="mt-2 w-full bg-violet-700 hover:bg-violet-600 text-white font-bold py-2.5 rounded-xl transition text-sm flex items-center justify-center gap-2"><i class="fas fa-paper-plane"></i> Enviar Comentário</button>
            </div>`}
        </div>
    `;
}

function row(label, val) {
    return `<div class="flex justify-between gap-2 text-xs"><span class="text-slate-500">${label}</span><span class="text-slate-200 font-semibold text-right">${escHtml(String(val))}</span></div>`;
}

function renderComentarios(lista) {
    if (!lista || !lista.length) return '<p class="text-xs text-slate-600 text-center py-2">Nenhum comentário ainda.</p>';
    return lista.map(c => {
        if (c.tipo === 'sistema') {
            const cl = _sistemaColor(c.texto);
            return `
            <div style="display:flex;align-items:center;gap:8px;padding:3px 0">
                <div style="flex:1;height:1px;background:${cl.brd}"></div>
                <span style="font-size:11px;font-weight:700;color:${cl.cor};text-align:center;line-height:1.5;padding:4px 12px;background:${cl.bg};border:1px solid ${cl.brd};border-radius:20px;max-width:70%">
                    ${escHtml(c.texto)}<br><span style="font-size:10px;font-weight:400;opacity:0.75">${c.data}</span>
                </span>
                <div style="flex:1;height:1px;background:${cl.brd}"></div>
            </div>`;
        }
        const isC = c.tipo === 'cliente';
        return `
        <div class="flex gap-2.5 ${isC ? 'flex-row-reverse' : ''}">
            <div class="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-black ${isC ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-300'}">
                <i class="fas ${isC ? 'fa-user' : 'fa-headset'}"></i>
            </div>
            <div class="flex-1 ${isC ? 'items-end' : 'items-start'} flex flex-col">
                <div class="text-[10px] text-slate-500 mb-0.5 ${isC ? 'text-right' : ''}">${isC ? 'Você' : (c.autor || 'Atendente')} · ${c.data || ''}</div>
                <div class="text-sm text-slate-200 bg-slate-800/60 rounded-xl px-3 py-2 max-w-[85%] leading-relaxed whitespace-pre-wrap border ${isC ? 'border-violet-500/20 rounded-tr-sm' : 'border-slate-700/50 rounded-tl-sm'}">${escHtml(c.texto)}</div>
            </div>
        </div>`;
    }).join('');
}

async function enviarComentarioCliente() {
    const texto = document.getElementById('inp-comentario')?.value?.trim();
    if (!texto || texto.length < 3) { alert('Escreva um comentário antes de enviar.'); return; }
    const btn = document.querySelector('#bloco-comentar button');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    const comentario = { tipo: 'cliente', texto, data: new Date().toLocaleString('pt-BR') };
    const atuais = st.pedido.comentarios || [];
    try {
        await colPedidos.doc(st.pedido.id).update({
            comentarios: [...atuais, comentario],
            status: 'reaberto',
        });
        st.pedido.comentarios = [...atuais, comentario];
        st.pedido.status = 'reaberto';
        document.getElementById('inp-comentario').value = '';
        renderStatusCliente();
    } catch (err) {
        alert('Erro: ' + err.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Comentário';
    }
}

// ─── FORMULÁRIO DE PEDIDO ────────────────────────────────────────────────────
function voltarCpf() {
    document.getElementById('inp-cpf').value = '';
    document.getElementById('cpf-erro').classList.add('hidden');
    st.cpf = '';
    showView('view-cpf');
    document.getElementById('inp-cpf').focus();
}

function coletarForm() {
    const g = id => (document.getElementById(id)?.value || '').trim();
    return {
        cpf:          st.cpf,
        tipoCpf:      rawNum(g('form-cpf')).length === 11 ? 'CPF' : 'CNPJ',
        dataEmissao:  g('form-data'),
        ac:           g('form-ac'),
        nome:         g('form-nome'),
        rg:           g('form-rg'),
        celular:      g('form-cel'),
        celularAlt:   g('form-cel2'),
        email:        g('form-email'),
        endInstalacao: {
            endereco:   g('inst-end'),
            numero:     g('inst-num'),
            bairro:     g('inst-bairro'),
            cidade:     g('inst-cidade'),
            uf:         g('inst-uf'),
            cep:        g('inst-cep'),
            coords:     g('inst-coords'),
            complemento:g('inst-comp'),
        },
        endCorrespondencia: {
            endereco:   g('corr-end'),
            numero:     g('corr-num'),
            bairro:     g('corr-bairro'),
            cidade:     g('corr-cidade'),
            uf:         g('corr-uf'),
            cep:        g('corr-cep'),
            complemento:g('corr-comp'),
        },
        servico: {
            planoMensal:      g('sv-plano'),
            pacote:           g('sv-pacote'),
            valorMensal:      g('sv-valor'),
            valorInstalacao:  g('sv-valor-inst'),
            pagamento:        g('sv-pagamento'),
            dataInstalacao:   g('sv-data-inst'),
            hora:             g('sv-hora'),
            tecnico:          g('sv-tecnico'),
            kit:              g('sv-kit'),
        },
        assinaturaCliente:  getSig('sig-cliente'),
        assinaturaVendedor: getSig('sig-vendedor'),
        status: 'pendente',
        notaAtendente: '',
        comentarios: [],
    };
}

function validarForm(data) {
    const erros = [];
    if (!data.nome)             erros.push({ campo: 'form-nome',  msg: 'Nome obrigatório' });
    if (!validarDoc(data.cpf))  erros.push({ campo: 'form-cpf',   msg: 'CPF/CNPJ inválido' });
    if (!data.celular)          erros.push({ campo: 'form-cel',   msg: 'Celular obrigatório' });
    if (!data.endInstalacao.endereco) erros.push({ campo: 'inst-end', msg: 'Endereço de instalação obrigatório' });
    if (!data.endInstalacao.cidade)   erros.push({ campo: 'inst-cidade', msg: 'Cidade de instalação obrigatória' });
    return erros;
}

function focarErro(campo, msg) {
    const el = document.getElementById(campo);
    if (!el) return;
    el.classList.add('border-rose-500');
    el.focus();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => el.classList.remove('border-rose-500'), 3000);
    showToast(msg, 'erro');
}

async function enviarPedido() {
    if (!colPedidos) { showToast('Sem conexão com banco de dados.', 'erro'); return; }
    const data = coletarForm();
    const erros = validarForm(data);
    if (erros.length) { focarErro(erros[0].campo, erros[0].msg); return; }

    const btn = document.getElementById('btn-enviar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Enviando...';

    try {
        data.criadoEm    = firebase.firestore.FieldValue.serverTimestamp();
        data.criadoEmStr = new Date().toLocaleString('pt-BR');
        await colPedidos.add(data);
        showView('view-sucesso');
    } catch (err) {
        alert('Erro ao enviar: ' + err.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Enviar Pedido';
    }
}

// ─── ADM LOGIN ────────────────────────────────────────────────────────────────
function _salvarAdmLocal(nome, senha) {
    try { localStorage.setItem('pedidos_adm_salvo', JSON.stringify({ nome, senha })); } catch(e) {}
}
function _limparAdmLocal() {
    try { localStorage.removeItem('pedidos_adm_salvo'); } catch(e) {}
}
function _carregarAdmLocal() {
    try { return JSON.parse(localStorage.getItem('pedidos_adm_salvo')); } catch(e) { return null; }
}

function voltarDaAdm() { showView('view-cpf'); }

function _admShowState(state) {
    ['adm-login-loading','adm-login-setup','adm-login-normal'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
    });
    document.getElementById(state)?.classList.remove('hidden');
}

async function abrirAdmLogin() {
    showView('view-adm-login');
    _admShowState('adm-login-loading');
    if (!colAdm) { _admShowState('adm-login-normal'); return; }
    try {
        const snap = await colAdm.limit(1).get();
        if (snap.empty) {
            _admShowState('adm-login-setup');
            const bs = document.getElementById('btn-adm-setup');
            if (bs) { bs.disabled = false; bs.innerHTML = '<i class="fas fa-key"></i>Criar e Entrar'; }
            document.getElementById('adm-setup-senha').value = '';
            document.getElementById('adm-setup-confirmar').value = '';
            document.getElementById('adm-setup-erro')?.classList.add('hidden');
            setTimeout(() => document.getElementById('adm-setup-senha')?.focus(), 80);
        } else {
            _admShowState('adm-login-normal');
            const bl = document.getElementById('btn-adm-login');
            if (bl) { bl.disabled = false; bl.innerHTML = '<i class="fas fa-sign-in-alt"></i>Entrar'; }
            document.getElementById('adm-login-erro')?.classList.add('hidden');
            const salvo = _carregarAdmLocal();
            if (salvo) {
                document.getElementById('adm-nome').value  = salvo.nome;
                document.getElementById('adm-senha').value = salvo.senha;
                document.getElementById('adm-salvar-check').checked = true;
                setTimeout(() => document.getElementById('btn-adm-login')?.focus(), 80);
            } else {
                document.getElementById('adm-nome').value  = '';
                document.getElementById('adm-senha').value = '';
                document.getElementById('adm-salvar-check').checked = false;
                setTimeout(() => document.getElementById('adm-nome')?.focus(), 80);
            }
        }
    } catch (err) {
        _admShowState('adm-login-normal');
    }
}

async function criarAdmMaster() {
    const senha = document.getElementById('adm-setup-senha').value;
    const conf  = document.getElementById('adm-setup-confirmar').value;
    const erroEl = document.getElementById('adm-setup-erro');
    const erroSpan = erroEl.querySelector('span');
    erroEl.classList.add('hidden');

    if (senha.length < 4) { erroSpan.textContent = 'Senha deve ter ao menos 4 caracteres.'; erroEl.classList.remove('hidden'); return; }
    if (senha !== conf)   { erroSpan.textContent = 'As senhas não coincidem.'; erroEl.classList.remove('hidden'); return; }

    const btn = document.getElementById('btn-adm-setup');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Salvando...';
    try {
        await colAdm.add({ nome: 'admin', senha, master: true, original: true, criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
        st.adm = { nome: 'admin', master: true };
        iniciarPainelAdm();
    } catch (err) {
        erroSpan.textContent = 'Erro ao salvar: ' + err.message;
        erroEl.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-key mr-2"></i>Criar e Entrar';
    }
}

async function loginAdm() {
    const nome  = document.getElementById('adm-nome').value.trim().toLowerCase();
    const senha = document.getElementById('adm-senha').value;
    const erroEl = document.getElementById('adm-login-erro');
    const erroSpan = erroEl.querySelector('span');
    erroEl.classList.add('hidden');

    if (!nome || !senha) { erroSpan.textContent = 'Preencha nome e senha.'; erroEl.classList.remove('hidden'); return; }

    const btn = document.getElementById('btn-adm-login');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Verificando...';

    try {
        const snap = await colAdm.get();
        const match = snap.docs.find(d => d.data().nome?.trim().toLowerCase() === nome && d.data().senha === senha);
        if (match) {
            if (document.getElementById('adm-salvar-check')?.checked) {
                _salvarAdmLocal(document.getElementById('adm-nome').value.trim(), senha);
            } else {
                _limparAdmLocal();
            }
            st.adm = { nome: match.data().nome, id: match.id, master: match.data().master === true };
            iniciarPainelAdm();
        } else {
            erroSpan.textContent = 'Nome ou senha incorretos.';
            erroEl.classList.remove('hidden');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Entrar';
        }
    } catch (err) {
        erroSpan.textContent = 'Erro: ' + err.message;
        erroEl.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Entrar';
    }
}

// ─── ADM PANEL ────────────────────────────────────────────────────────────────
let _filtroAdm = 'todos';
let _modalPedidoId = null;
let _modalEditMode = false;

function iniciarPainelAdm() {
    document.getElementById('adm-user-nome').textContent = st.adm.nome;
    document.getElementById('adm-avatar').textContent = (st.adm.nome || 'A')[0].toUpperCase();
    const roleEl = document.getElementById('adm-user-role');
    if (roleEl) roleEl.textContent = st.adm.master ? 'Admin' : 'Atendente';
    showView('view-adm');
    setFiltroAdm('todos');
    renderUsuariosAdm();
    if (st._unsub) st._unsub();
    st._unsub = colPedidos.orderBy('criadoEm', 'desc').onSnapshot(snap => {
        st.pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderListaAdm();
    });
}

function sairAdm() {
    if (st._unsub) { st._unsub(); st._unsub = null; }
    st.adm = null;
    st.pedidos = [];
    showView('view-cpf');
}

function setFiltroAdm(f) {
    _filtroAdm = f;
    ['todos','pendente','aceito','recusado','reaberto','fechado'].forEach(s => {
        const btn = document.getElementById('fadm-' + s);
        if (!btn) return;
        const ativo = s === f;
        btn.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap border ${
            ativo ? 'bg-violet-700 text-white border-violet-600' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
        }`;
    });
    renderListaAdm();
}

function renderListaAdm() {
    const el = document.getElementById('adm-lista');
    if (!el) return;
    let lista = _filtroAdm === 'todos' ? st.pedidos : st.pedidos.filter(p => p.status === _filtroAdm);

    const q = (document.getElementById('adm-busca')?.value || '').trim().toLowerCase();
    if (q) lista = lista.filter(p =>
        [p.nome, p.cpf, p.email, p.celular, p.servico?.planoMensal, p.servico?.tecnico]
            .filter(Boolean).join(' ').toLowerCase().includes(q)
    );

    // atualiza badges
    ['pendente','aceito','recusado','reaberto','fechado'].forEach(s => {
        const cnt = st.pedidos.filter(p => p.status === s).length;
        const b = document.getElementById('badge-' + s);
        if (b) b.textContent = cnt;
    });
    document.getElementById('badge-todos').textContent = st.pedidos.length;

    if (!lista.length) {
        el.innerHTML = `<div class="text-center py-16 text-slate-600"><i class="fas fa-inbox text-4xl mb-3 block opacity-20"></i><p class="text-sm">${q ? 'Nenhum resultado para "'+escHtml(q)+'"' : 'Nenhum pedido nesta categoria'}</p></div>`;
        return;
    }

    const accentBorder = { pendente:'#f59e0b', aceito:'#10b981', recusado:'#ef4444', reaberto:'#3b82f6', fechado:'#94a3b8' };
    const accentBg     = { pendente:'rgba(245,158,11,0.08)', aceito:'rgba(16,185,129,0.08)', recusado:'rgba(239,68,68,0.08)', reaberto:'rgba(59,130,246,0.08)', fechado:'rgba(100,116,139,0.08)' };

    el.innerHTML = lista.map(p => {
        const sLbl  = statusLabel(p.status);
        const sIcon = statusIcon(p.status);
        const sCls  = statusCls(p.status);
        const clientComents = (p.comentarios||[]).filter(c=>c.tipo==='cliente').length;
        const cor = accentBorder[p.status] || '#6b7280';
        const bg  = accentBg[p.status] || 'transparent';

        return `
        <div onclick="abrirPedidoModal('${p.id}')" class="rounded-2xl cursor-pointer active:scale-[0.98] transition-all" style="background:rgba(15,12,35,0.7);border:1px solid rgba(255,255,255,0.06);border-left:3px solid ${cor}">
            <div class="flex items-center gap-3 px-4 py-4">
                <div class="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style="background:${bg};border:1px solid ${cor}33">
                    <i class="fas ${sIcon} text-sm" style="color:${cor}"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-black text-sm text-white truncate leading-tight">${escHtml(p.nome || '—')}</p>
                    <p class="text-[11px] text-slate-500 font-mono mt-0.5">${maskDoc(p.cpf)}</p>
                    <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${sCls}">${sLbl}</span>
                        ${p.servico?.planoMensal ? `<span class="text-[10px] text-violet-300/70 font-semibold"><i class="fas fa-wifi mr-0.5 text-[8px]"></i>${escHtml(p.servico.planoMensal)}</span>` : ''}
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
                    ${clientComents ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-blue-300 bg-blue-500/15 border border-blue-500/25 px-1.5 py-0.5 rounded-full"><i class="fas fa-comment text-[8px]"></i>${clientComents}</span>` : ''}
                    <span class="text-[10px] text-slate-600">${p.criadoEmStr || '—'}</span>
                    <i class="fas fa-chevron-right text-slate-700 text-[10px]"></i>
                </div>
            </div>
        </div>`;
    }).join('');

    // atualiza modal se estiver aberto
    if (_modalPedidoId) _renderModalPedido();
}

function abrirPedidoModal(id) {
    _modalPedidoId = id;
    _modalEditMode = false;
    const modal = document.getElementById('modal-pedido');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    _renderModalPedido();
}

function fecharPedidoModal() {
    _modalPedidoId = null;
    _modalEditMode = false;
    const modal = document.getElementById('modal-pedido');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function _renderModalPedido() {
    if (!_modalPedidoId) return;
    const p = st.pedidos.find(x => x.id === _modalPedidoId);
    if (!p) { fecharPedidoModal(); return; }

    document.getElementById('modal-ped-nome').textContent = p.nome || '—';
    document.getElementById('modal-ped-cpf').textContent  = maskDoc(p.cpf);

    const btnEdit = document.getElementById('btn-edit-pedido');
    if (btnEdit) btnEdit.style.display = _modalEditMode ? 'none' : 'flex';

    const badge = document.getElementById('modal-ped-badge');
    badge.className   = `text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusCls(p.status)}`;
    badge.textContent = statusLabel(p.status);

    const accentBg     = { pendente:'rgba(245,158,11,0.15)', aceito:'rgba(16,185,129,0.15)', recusado:'rgba(239,68,68,0.12)', reaberto:'rgba(59,130,246,0.15)' };
    const accentBorder = { pendente:'#f59e0b', aceito:'#10b981', recusado:'#ef4444', reaberto:'#3b82f6' };
    const cor = accentBorder[p.status] || '#6b7280';
    const bg  = accentBg[p.status]    || 'rgba(100,100,100,0.15)';
    const iconEl = document.getElementById('modal-ped-icon');
    iconEl.style.background = bg;
    iconEl.style.border     = `1px solid ${cor}33`;
    iconEl.querySelector('i').style.color = cor;

    document.getElementById('modal-ped-body').innerHTML = renderAdmDetalhe(p);
}

function mostrarEditarPedido() {
    _modalEditMode = true;
    _renderModalPedido();
}

function cancelarEditarPedido() {
    _modalEditMode = false;
    _renderModalPedido();
}

async function salvarEdicaoPedido(id) {
    const g = eid => document.getElementById(eid)?.value?.trim() || '';
    const dados = {
        nome: g('ed-nome'),
        cpf: rawNum(g('ed-cpf')),
        rg: g('ed-rg'),
        celular: g('ed-cel'),
        email: g('ed-email'),
        endInstalacao: {
            endereco: g('ed-inst-end'),
            numero: g('ed-inst-num'),
            bairro: g('ed-inst-bairro'),
            cidade: g('ed-inst-cidade'),
            uf: g('ed-inst-uf'),
            cep: g('ed-inst-cep'),
            coords: g('ed-inst-gps')
        },
        servico: {
            planoMensal: g('ed-plano'),
            pacote: g('ed-pacote'),
            valorMensal: g('ed-mensal'),
            valorInstalacao: g('ed-vinst'),
            pagamento: g('ed-pagto'),
            dataInstalacao: g('ed-data'),
            hora: g('ed-hora'),
            tecnico: g('ed-tec'),
            kit: g('ed-kit')
        }
    };

    const btn = document.getElementById('btn-salvar-edicao');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    try {
        await colPedidos.doc(id).update(dados);
        showToast('Pedido atualizado com sucesso!', 'ok');
        _modalEditMode = false;
        _renderModalPedido(); // A listagem deve atualizar via onSnapshot
    } catch (err) {
        alert('Erro ao salvar: ' + err.message);
        if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar'; }
    }
}

function renderAdmDetalhe(p) {
    const R = (l, v) => v ? `<div class="pm-row"><span class="pm-lbl">${l}</span><span class="pm-val">${escHtml(String(v))}</span></div>` : '';

    if (_modalEditMode) {
        const I = (id, val, ph) => `<input id="${id}" value="${escHtml(String(val || ''))}" placeholder="${ph}" class="pm-sel" style="padding:6px 10px;font-size:13px;width:100%">`;
        
        return `
        <div class="pm-left" style="width:100%;border-right:none;flex-direction:column;">
            <div class="flex items-center justify-between mb-4">
                <h3 class="font-bold text-violet-400"><i class="fas fa-pen mr-2"></i>Editar Pedido</h3>
                <div class="flex gap-2">
                    <button onclick="cancelarEditarPedido()" class="pm-btn pm-btn-reject" style="width:auto;padding:8px 16px"><i class="fas fa-times"></i>Cancelar</button>
                    <button id="btn-salvar-edicao" onclick="salvarEdicaoPedido('${p.id}')" class="pm-btn pm-btn-accept" style="width:auto;padding:8px 16px"><i class="fas fa-save"></i>Salvar</button>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="pm-box">
                    <div class="pm-box-title"><i class="fas fa-user"></i>Cliente</div>
                    <div class="space-y-2">
                        ${I('ed-nome', p.nome, 'Nome')}
                        ${I('ed-cpf', maskDoc(p.cpf), 'CPF/CNPJ (exibição)')}
                        ${I('ed-rg', p.rg, 'RG')}
                        ${I('ed-cel', p.celular, 'Celular')}
                        ${I('ed-email', p.email, 'E-mail')}
                    </div>
                </div>

                <div class="pm-box">
                    <div class="pm-box-title"><i class="fas fa-map-pin"></i>Instalação</div>
                    <div class="space-y-2">
                        ${I('ed-inst-end', p.endInstalacao?.endereco, 'Endereço')}
                        <div class="flex gap-2">
                            ${I('ed-inst-num', p.endInstalacao?.numero, 'Nº')}
                            ${I('ed-inst-cep', p.endInstalacao?.cep, 'CEP')}
                        </div>
                        ${I('ed-inst-bairro', p.endInstalacao?.bairro, 'Bairro')}
                        <div class="flex gap-2">
                            ${I('ed-inst-cidade', p.endInstalacao?.cidade, 'Cidade')}
                            ${I('ed-inst-uf', p.endInstalacao?.uf, 'UF')}
                        </div>
                        ${I('ed-inst-gps', p.endInstalacao?.coords, 'GPS Coordenadas')}
                    </div>
                </div>

                <div class="pm-box md:col-span-2">
                    <div class="pm-box-title"><i class="fas fa-wifi"></i>Serviço / Plano</div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                        ${I('ed-plano', p.servico?.planoMensal, 'Plano')}
                        ${I('ed-pacote', p.servico?.pacote, 'Pacote')}
                        ${I('ed-mensal', p.servico?.valorMensal, 'Mensalidade')}
                        ${I('ed-vinst', p.servico?.valorInstalacao, 'Vlr Instalação')}
                        ${I('ed-pagto', p.servico?.pagamento, 'Pagamento')}
                        ${I('ed-data', p.servico?.dataInstalacao, 'Data Inst.')}
                        ${I('ed-hora', p.servico?.hora, 'Hora Inst.')}
                        ${I('ed-tec', p.servico?.tecnico, 'Técnico')}
                        ${I('ed-kit', p.servico?.kit, 'KIT')}
                    </div>
                </div>
            </div>
        </div>`;
    }

    const encerrado = p.status === 'aceito' || p.status === 'recusado';

    const timeline = (p.comentarios || []).map(c => {
        if (c.tipo === 'sistema') {
            const cl = _sistemaColor(c.texto);
            return `
            <div style="display:flex;align-items:center;gap:8px;padding:3px 0">
                <div style="flex:1;height:1px;background:${cl.brd}"></div>
                <span style="font-size:11px;font-weight:700;color:${cl.cor};text-align:center;line-height:1.5;padding:4px 12px;background:${cl.bg};border:1px solid ${cl.brd};border-radius:20px;white-space:nowrap;max-width:70%">
                    ${escHtml(c.texto)}<br><span style="font-size:10px;font-weight:400;opacity:0.75">${c.data}</span>
                </span>
                <div style="flex:1;height:1px;background:${cl.brd}"></div>
            </div>`;
        }
        const isC = c.tipo === 'cliente';
        return `
        <div class="pm-msg${isC ? ' pm-msg-r' : ''}">
            <div class="pm-av ${isC ? 'pm-av-c' : 'pm-av-s'}"><i class="fas ${isC ? 'fa-user' : 'fa-headset'}"></i></div>
            <div class="pm-msg-inner">
                <span class="pm-meta">${isC ? 'Cliente' : (c.autor || 'Atendente')} · ${c.data}</span>
                <div class="pm-bubble ${isC ? 'pm-bubble-c' : 'pm-bubble-s'}">${escHtml(c.texto)}</div>
            </div>
        </div>`;
    }).join('');

    return `
    <!-- coluna esquerda: apenas dados -->
    <div class="pm-left">

        <div class="pm-box">
            <div class="pm-box-title"><i class="fas fa-user"></i>Cliente</div>
            ${R('Nome',   p.nome)}
            ${R('Doc.',   maskDoc(p.cpf))}
            ${R('RG',     p.rg)}
            ${R('Cel.',   p.celular)}
            ${R('E-mail', p.email)}
        </div>

        <div class="pm-box">
            <div class="pm-box-title"><i class="fas fa-map-pin"></i>Instalação</div>
            ${R('End.',   [p.endInstalacao?.endereco, p.endInstalacao?.numero].filter(Boolean).join(', '))}
            ${R('Bairro', p.endInstalacao?.bairro)}
            ${R('Cidade', [p.endInstalacao?.cidade, p.endInstalacao?.uf].filter(Boolean).join(' / '))}
            ${R('CEP',    p.endInstalacao?.cep)}
            ${R('GPS',    p.endInstalacao?.coords)}
        </div>

        <div class="pm-box">
            <div class="pm-box-title"><i class="fas fa-wifi"></i>Serviço / Plano</div>
            <div class="pm-svc-grid">
                ${R('Plano',   p.servico?.planoMensal)}
                ${R('Pacote',  p.servico?.pacote)}
                ${R('Mensal.', p.servico?.valorMensal)}
                ${R('Inst.',   p.servico?.valorInstalacao)}
                ${R('Pagto.',  p.servico?.pagamento)}
                ${R('Data',    p.servico?.dataInstalacao ? p.servico.dataInstalacao + (p.servico?.hora ? ' ' + p.servico.hora : '') : null)}
                ${R('Técnico', p.servico?.tecnico)}
                ${R('KIT',     p.servico?.kit)}
            </div>
        </div>

        ${(p.assinaturaCliente || p.assinaturaVendedor) ? `
        <div class="pm-sig-row">
            ${p.assinaturaCliente  ? `<div><div style="font-size:12px;color:#64748b;margin-bottom:5px;font-weight:600">Assin. Cliente</div><div class="pm-sig-img"><img src="${p.assinaturaCliente}"></div></div>` : ''}
            ${p.assinaturaVendedor ? `<div><div style="font-size:12px;color:#64748b;margin-bottom:5px;font-weight:600">Assin. Vendedor</div><div class="pm-sig-img"><img src="${p.assinaturaVendedor}"></div></div>` : ''}
        </div>` : ''}

        ${st.adm?.master ? `<button onclick="deletarPedido('${p.id}')" class="pm-btn-del" style="margin-top:auto"><i class="fas fa-trash"></i>Apagar Pedido</button>` : ''}

    </div>

    <!-- coluna direita: chat + ações no fundo -->
    <div class="pm-right">
        <div class="pm-chat-head"><i class="fas fa-comments"></i>Histórico / Chat</div>
        <div class="pm-chat-msgs">
            ${timeline || '<div style="font-size:13px;color:#475569;text-align:center;padding:32px 0">Sem registros ainda.</div>'}
        </div>

        <!-- ações fixas no fundo do chat -->
        <div class="pm-actions-bar">

            ${p.status === 'fechado' ? `
            <div class="pm-status-chip">
                <i class="fas fa-lock" style="font-size:18px;color:#64748b"></i>
                <div>
                    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-weight:700">Status</div>
                    <div style="font-size:16px;font-weight:900;color:#94a3b8">Encerrado Definitivamente</div>
                </div>
            </div>
            ` : encerrado ? `
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                <div class="pm-status-chip" style="flex:1;min-width:180px">
                    <i class="fas ${statusIcon(p.status)}" style="font-size:18px;color:${p.status==='aceito'?'#34d399':'#f87171'}"></i>
                    <div>
                        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-weight:700">Status</div>
                        <div style="font-size:16px;font-weight:900;color:${p.status==='aceito'?'#34d399':'#f87171'}">${statusLabel(p.status)}</div>
                    </div>
                </div>
                <div class="pm-action-row" style="flex:1;min-width:200px">
                    <select id="mudar-status-${p.id}" class="pm-sel">
                        <option value="pendente">↩ Pendente</option>
                        <option value="aceito"   ${p.status==='aceito'  ?'selected':''}>✓ Aceito</option>
                        <option value="recusado" ${p.status==='recusado'?'selected':''}>✗ Recusado</option>
                    </select>
                    <button onclick="mudarStatusAdm('${p.id}')" class="pm-btn-alter"><i class="fas fa-rotate"></i>Alterar</button>
                </div>
            </div>
            ` : `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <button onclick="acaoAdm('${p.id}','aceito')"   class="pm-btn pm-btn-accept"><i class="fas fa-check"></i>Aceitar</button>
                <button onclick="acaoAdm('${p.id}','recusado')" class="pm-btn pm-btn-reject"><i class="fas fa-xmark"></i>Recusar</button>
            </div>
            `}

            ${p.status !== 'fechado' ? `
            <div style="display:flex;gap:8px;align-items:flex-end">
                <textarea id="nota-${p.id}" rows="2" placeholder="Mensagem ao cliente..." class="pm-textarea" style="flex:1">${escHtml(p.notaAtendente || '')}</textarea>
                <button onclick="responderAdm('${p.id}')" class="pm-btn pm-btn-send" style="width:auto;padding:10px 16px;white-space:nowrap;align-self:flex-end"><i class="fas fa-paper-plane"></i>Enviar</button>
            </div>

            <div id="fechar-def-zona-${p.id}">
                <button onclick="fecharDefinitivoAdm('${p.id}')" style="width:100%;padding:9px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;background:rgba(100,80,60,0.1);border:1px dashed rgba(251,191,36,0.28);display:flex;align-items:center;justify-content:center;gap:8px;color:rgba(251,191,36,0.6);transition:all .15s;font-family:inherit"
                    onmouseover="this.style.color='#fbbf24';this.style.borderColor='rgba(251,191,36,0.5)'"
                    onmouseout="this.style.color='rgba(251,191,36,0.6)';this.style.borderColor='rgba(251,191,36,0.28)'">
                    <i class="fas fa-lock"></i>Fechar Definitivo
                </button>
            </div>` : ''}

        </div>
    </div>`;
}

async function acaoAdm(id, novoStatus) {
    const nota  = document.getElementById('nota-' + id)?.value?.trim() || '';
    const pedido = st.pedidos.find(p => p.id === id);
    const logTexto = novoStatus === 'aceito'
        ? `Pedido aceito por ${st.adm?.nome || 'Atendente'}`
        : `Pedido recusado por ${st.adm?.nome || 'Atendente'}`;
    const logEntry = { tipo: 'sistema', texto: logTexto, data: new Date().toLocaleString('pt-BR') };
    const atuais = pedido?.comentarios || [];
    try {
        await colPedidos.doc(id).update({
            status: novoStatus,
            notaAtendente: nota,
            comentarios: [...atuais, logEntry],
        });
        showToast(novoStatus === 'aceito' ? 'Pedido aceito!' : 'Pedido recusado.', novoStatus === 'aceito' ? 'ok' : 'erro');
    } catch (err) { alert('Erro: ' + err.message); }
}

async function deletarPedido(id) {
    if (!st.adm?.master) return;
    if (!confirm('Apagar este pedido permanentemente? Esta ação não pode ser desfeita.')) return;
    try {
        await colPedidos.doc(id).delete();
        showToast('Pedido apagado.', 'erro');
    } catch (err) { alert('Erro: ' + err.message); }
}

async function mudarStatusAdm(id) {
    const novoStatus = document.getElementById('mudar-status-' + id)?.value;
    const pedido = st.pedidos.find(p => p.id === id);
    if (!novoStatus || novoStatus === pedido?.status) { showToast('Selecione um status diferente.', 'erro'); return; }
    const logTexto = `Status alterado para "${statusLabel(novoStatus)}" por ${st.adm?.nome || 'Atendente'}`;
    const logEntry = { tipo: 'sistema', texto: logTexto, data: new Date().toLocaleString('pt-BR') };
    const atuais = pedido?.comentarios || [];
    try {
        await colPedidos.doc(id).update({ status: novoStatus, comentarios: [...atuais, logEntry] });
        showToast('Status atualizado!', 'ok');
    } catch (err) { alert('Erro: ' + err.message); }
}

async function responderAdm(id) {
    const nota = document.getElementById('nota-' + id)?.value?.trim();
    const pedido = st.pedidos.find(p => p.id === id);
    if (!nota) { showToast('Escreva uma mensagem antes de enviar.', 'erro'); return; }
    const comentario = { tipo: 'atendente', autor: st.adm?.nome || 'Atendente', texto: nota, data: new Date().toLocaleString('pt-BR') };
    const atuais = pedido?.comentarios || [];
    try {
        await colPedidos.doc(id).update({ notaAtendente: nota, comentarios: [...atuais, comentario] });
        document.getElementById('nota-' + id).value = '';
        showToast('Resposta enviada!', 'ok');
    } catch (err) { alert('Erro: ' + err.message); }
}

// ─── FECHAR DEFINITIVO ───────────────────────────────────────────────────────
function fecharDefinitivoAdm(id) {
    const zona = document.getElementById('fechar-def-zona-' + id);
    if (!zona) return;
    zona.innerHTML = `
    <div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.3);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;gap:10px;align-items:flex-start">
            <i class="fas fa-triangle-exclamation" style="color:#fbbf24;font-size:20px;flex-shrink:0;margin-top:1px"></i>
            <div>
                <div style="font-size:14px;font-weight:800;color:#fbbf24;margin-bottom:4px">Fechar Definitivo</div>
                <div style="font-size:12px;color:#94a3b8;line-height:1.6">
                    O cliente <strong style="color:#e2e8f0">não poderá mais</strong> enviar comentários ou recorrer desta OS.<br>
                    <span style="color:#f87171;font-weight:600">⚠ Recomendado apenas para casos extremos ou cliente alterado.</span>
                </div>
            </div>
        </div>
        <textarea id="motivo-fechar-${id}" rows="2" placeholder="Motivo (opcional, ficará registrado no histórico)..." class="pm-textarea"></textarea>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <button onclick="_renderModalPedido()" style="padding:10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;font-family:inherit;transition:all .15s"
                onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                Cancelar
            </button>
            <button onclick="confirmarFecharDef('${id}')" style="padding:10px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;background:rgba(251,191,36,0.18);border:1px solid rgba(251,191,36,0.45);color:#fbbf24;font-family:inherit;transition:all .15s"
                onmouseover="this.style.background='rgba(251,191,36,0.28)'" onmouseout="this.style.background='rgba(251,191,36,0.18)'">
                <i class="fas fa-lock" style="font-size:11px;margin-right:5px"></i>Confirmar
            </button>
        </div>
    </div>`;
}

async function confirmarFecharDef(id) {
    const motivo = document.getElementById('motivo-fechar-' + id)?.value?.trim() || '';
    const pedido = st.pedidos.find(p => p.id === id);
    const logTexto = `OS encerrada definitivamente por ${st.adm?.nome || 'Atendente'}` + (motivo ? ` — Motivo: ${motivo}` : '');
    const logEntry = { tipo: 'sistema', texto: logTexto, data: new Date().toLocaleString('pt-BR') };
    const atuais = pedido?.comentarios || [];
    try {
        await colPedidos.doc(id).update({
            status: 'fechado',
            comentarios: [...atuais, logEntry],
        });
        showToast('OS encerrada definitivamente.', 'erro');
    } catch (err) { alert('Erro: ' + err.message); }
}

// ─── GESTÃO DE USUÁRIOS ADM ──────────────────────────────────────────────────
let _editandoUsuarioId = null;

async function renderUsuariosAdm() {
    const sec = document.getElementById('adm-usuarios-section');
    if (!sec) return;
    if (!st.adm?.master) { sec.classList.add('hidden'); return; }
    sec.classList.remove('hidden');
    const lista = document.getElementById('adm-usuarios-lista');
    if (!lista) return;
    try {
        const snap = await colAdm.get();
        const usuarios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!usuarios.length) { lista.innerHTML = '<p class="text-xs text-slate-600 text-center py-2">Nenhum usuário.</p>'; return; }
        lista.innerHTML = usuarios.map(u => {
            if (_editandoUsuarioId === u.id) return `
                <div class="bg-slate-800/80 rounded-xl px-3 py-3 border border-violet-500/40 space-y-2">
                    <input type="text"     id="eu-nome"      value="${escHtml(u.nome)}" placeholder="Nome *"                      class="inp text-xs">
                    <input type="password" id="eu-senha"                                placeholder="Nova senha (vazio = manter)" class="inp text-xs">
                    <input type="password" id="eu-confirmar"                            placeholder="Confirmar nova senha"        class="inp text-xs"
                        onkeydown="if(event.key==='Enter')salvarEdicaoUsuario('${u.id}')">
                    <p id="eu-erro" class="hidden text-rose-400 text-xs"><i class="fas fa-exclamation-circle mr-1"></i><span></span></p>
                    <div class="flex gap-2 pt-1">
                        <button onclick="fecharEditarUsuario()"           class="flex-1 py-1.5 rounded-lg bg-slate-700 text-xs font-bold">Cancelar</button>
                        <button onclick="salvarEdicaoUsuario('${u.id}')"  class="flex-1 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-xs font-bold transition">Salvar</button>
                    </div>
                </div>`;
            const protegido = u.original || u.nome?.trim().toLowerCase() === 'admin';
            const starBtn = protegido
                ? `<i class="fas fa-star text-amber-400 px-1.5 text-sm" title="Super Admin permanente"></i>`
                : u.master
                    ? `<button onclick="toggleMasterUsuario('${u.id}')" class="w-7 h-7 rounded-lg hover:bg-amber-500/20 text-amber-400 flex items-center justify-center transition" title="Remover Admin"><i class="fas fa-star text-sm"></i></button>`
                    : `<button onclick="toggleMasterUsuario('${u.id}')" class="w-7 h-7 rounded-lg hover:bg-amber-500/20 text-slate-500 hover:text-amber-400 flex items-center justify-center transition" title="Promover a Admin"><i class="far fa-star text-sm"></i></button>`;
            return `
            <div class="flex items-center justify-between bg-slate-800/60 rounded-xl px-3 py-2.5 border border-slate-700/60">
                <div class="min-w-0 flex-1">
                    <span class="text-sm font-bold truncate block">${escHtml(u.nome)}</span>
                    <span class="text-[10px] ${u.master ? 'text-amber-400' : 'text-slate-500'} font-semibold">${u.master ? 'Admin' : 'Usuário'}</span>
                </div>
                <div class="flex items-center gap-1 ml-2 flex-shrink-0">
                    ${starBtn}
                    ${!protegido ? `
                    <button onclick="abrirEditarUsuario('${u.id}')"  class="w-7 h-7 rounded-lg bg-violet-500/10 hover:bg-violet-500/30 text-violet-400 flex items-center justify-center transition"><i class="fas fa-pen text-xs"></i></button>
                    <button onclick="excluirUsuario('${u.id}')"      class="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/30 text-rose-400 flex items-center justify-center transition"><i class="fas fa-trash text-xs"></i></button>
                    ` : ''}
                </div>
            </div>`;
        }).join('');
        if (_editandoUsuarioId) setTimeout(() => document.getElementById('eu-nome')?.focus(), 30);
    } catch (e) { console.error('renderUsuariosAdm', e); }
}

function abrirFormNovoUsuario() {
    document.getElementById('form-novo-usuario').classList.remove('hidden');
    document.getElementById('btn-novo-usuario').classList.add('hidden');
    ['nu-nome','nu-senha','nu-confirmar'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('nu-erro').classList.add('hidden');
    setTimeout(() => document.getElementById('nu-nome').focus(), 30);
}
function fecharFormNovoUsuario() {
    document.getElementById('form-novo-usuario').classList.add('hidden');
    document.getElementById('btn-novo-usuario').classList.remove('hidden');
}

async function criarNovoUsuario() {
    const nome  = document.getElementById('nu-nome').value.trim();
    const senha = document.getElementById('nu-senha').value;
    const conf  = document.getElementById('nu-confirmar').value;
    const erroEl = document.getElementById('nu-erro'), erroSpan = erroEl.querySelector('span');
    erroEl.classList.add('hidden');
    if (!nome)            { erroSpan.textContent = 'Informe o nome.'; erroEl.classList.remove('hidden'); return; }
    if (senha.length < 4) { erroSpan.textContent = 'Senha mínima: 4 caracteres.'; erroEl.classList.remove('hidden'); return; }
    if (senha !== conf)   { erroSpan.textContent = 'As senhas não coincidem.'; erroEl.classList.remove('hidden'); return; }
    try {
        await colAdm.add({ nome, senha, master: false, criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
        fecharFormNovoUsuario();
        renderUsuariosAdm();
    } catch (e) { erroSpan.textContent = 'Erro: ' + e.message; erroEl.classList.remove('hidden'); }
}

function abrirEditarUsuario(id) {
    _editandoUsuarioId = id;
    fecharFormNovoUsuario();
    renderUsuariosAdm();
}
function fecharEditarUsuario() { _editandoUsuarioId = null; renderUsuariosAdm(); }

async function salvarEdicaoUsuario(id) {
    const nome = document.getElementById('eu-nome').value.trim();
    const nova  = document.getElementById('eu-senha').value;
    const conf  = document.getElementById('eu-confirmar').value;
    const erroEl = document.getElementById('eu-erro'), erroSpan = erroEl.querySelector('span');
    erroEl.classList.add('hidden');
    if (!nome)                   { erroSpan.textContent = 'Informe o nome.'; erroEl.classList.remove('hidden'); return; }
    if (nova && nova.length < 4) { erroSpan.textContent = 'Senha mínima: 4 caracteres.'; erroEl.classList.remove('hidden'); return; }
    if (nova && nova !== conf)   { erroSpan.textContent = 'As senhas não coincidem.'; erroEl.classList.remove('hidden'); return; }
    try {
        const updates = { nome }; if (nova) updates.senha = nova;
        await colAdm.doc(id).update(updates);
        _editandoUsuarioId = null;
        renderUsuariosAdm();
    } catch (e) { erroSpan.textContent = 'Erro: ' + e.message; erroEl.classList.remove('hidden'); }
}

async function toggleMasterUsuario(id) {
    try {
        const snap = await colAdm.doc(id).get();
        if (!snap.exists) return;
        const u = snap.data();
        if (u.original || u.nome?.trim().toLowerCase() === 'admin') return;
        await colAdm.doc(id).update({ master: !u.master });
        renderUsuariosAdm();
    } catch (e) { alert('Erro: ' + e.message); }
}

async function excluirUsuario(id) {
    if (!confirm('Remover este usuário?')) return;
    try { await colAdm.doc(id).delete(); renderUsuariosAdm(); }
    catch (e) { alert('Erro: ' + e.message); }
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let _toastTimer;
function showToast(msg, tipo = 'ok') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] px-5 py-2.5 rounded-full text-sm font-bold shadow-xl transition-all duration-300 ${tipo === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`;
    t.style.opacity = '1'; t.style.transform = 'translate(-50%, 0)';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translate(-50%, 8px)'; }, 2800);
}
