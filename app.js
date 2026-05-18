// ══════════════════════════════════════════════════════
//  AUDICOM — app.js  (reescrito do zero)
// ══════════════════════════════════════════════════════

// ── FIREBASE ──────────────────────────────────────────
let db, colPedidos, colAdm, auth;

// Garante que há um usuário autenticado (admin salvo OU anônimo).
// Verifica sessão existente ANTES de tentar login anônimo —
// evita sobrescrever sessões de atendentes com persistência LOCAL.
function _garantirAuth() {
  return new Promise((resolve, reject) => {
    const unsub = auth.onAuthStateChanged(async user => {
      unsub();
      if (user) {
        // Já autenticado (admin com sessão salva ou anônimo anterior)
        resolve(user);
      } else {
        // Sem sessão — entra anonimamente
        try {
          const cred = await auth.signInAnonymously();
          await cred.user.getIdToken(); // garante token propagado ao Firestore
          resolve(cred.user);
        } catch (e) {
          reject(e);
        }
      }
    });
  });
}

window.addEventListener('load', () => {
  initSignatures();
  showView('view-cpf');
  setTimeout(() => document.getElementById('inp-cpf')?.focus(), 120);
  _capturarIP();

  try {
    auth       = firebase.auth();
    db         = firebase.firestore();
    colPedidos = db.collection('pedidos');
    colAdm     = db.collection('usuarios_adm');

    // Autentica no carregamento. Se admin tiver sessão salva, usa ela;
    // caso contrário entra anonimamente.
    _garantirAuth().catch(e => {
      console.error('Firebase auth:', e);
      toast('Erro ao conectar. Verifique sua conexão.', 'err');
    });
  } catch (e) {
    console.error('Firebase init:', e);
    toast('Erro ao conectar. Verifique sua conexão.', 'err');
  }
});

// ── AUDIT LOG ─────────────────────────────────────────
const _auditLogs = [];
function _addLog(acao) {
  _auditLogs.push({ acao, ts: new Date().toISOString() });
}

// ── IP CAPTURE ────────────────────────────────────────
let _clienteIP = 'coletando...';
async function _capturarIP() {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const j = await r.json();
    _clienteIP = j.ip;
  } catch { _clienteIP = 'indisponível'; }
}

// ── SELFIE / CAMERA ───────────────────────────────────
let _cameraStream = null;
let _selfieBase64 = null;
let _dadosPendentes = null;

function _setSelfieState(estado) {
  ['inicial','camera','foto'].forEach(s =>
    document.getElementById('selfie-estado-' + s)?.classList.add('hidden')
  );
  document.getElementById('selfie-estado-' + estado)?.classList.remove('hidden');
}

async function iniciarCamera() {
  try {
    _cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    const video = document.getElementById('selfie-video');
    video.srcObject = _cameraStream;
    await video.play();
    _setSelfieState('camera');
    _addLog('camera_ativada');
  } catch (err) {
    const msg = err.name === 'NotAllowedError'
      ? 'Permissão de câmera negada. Habilite nas configurações do navegador.'
      : 'Câmera indisponível: ' + err.message;
    toast(msg, 'err');
  }
}

function tirarFoto() {
  const video  = document.getElementById('selfie-video');
  const canvas = document.getElementById('selfie-canvas');

  // Redimensiona para no máximo 480×360 mantendo proporção
  const MAX_W = 480, MAX_H = 360;
  const vw = video.videoWidth  || 640;
  const vh = video.videoHeight || 480;
  const ratio = Math.min(MAX_W / vw, MAX_H / vh, 1); // nunca ampliar
  canvas.width  = Math.round(vw * ratio);
  canvas.height = Math.round(vh * ratio);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  _selfieBase64 = canvas.toDataURL('image/jpeg', 0.70); // JPEG 70% ≈ 25–50 KB

  const img = document.getElementById('selfie-preview');
  img.src = _selfieBase64;
  img.style.transform = 'scaleX(-1)'; // espelha a preview para combinar com o que o usuário viu

  _pararCamera();
  _setSelfieState('foto');
  document.getElementById('selfie-badge-ok')?.classList.remove('hidden');
  _addLog('selfie_capturado');
  toast('Foto registrada.', 'ok');
}

function refazerFoto() {
  _selfieBase64 = null;
  document.getElementById('selfie-badge-ok')?.classList.add('hidden');
  _addLog('selfie_refeito');
  iniciarCamera();
}

function _pararCamera() {
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(t => t.stop());
    _cameraStream = null;
  }
}

function _pararCameraUI() {
  _pararCamera();
  _setSelfieState('inicial');
}

// ── MODAL TERMOS ──────────────────────────────────────
function _rlinha(label, valor) {
  return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04)">
    <span style="color:var(--text3)">${label}</span>
    <span style="color:var(--text);font-weight:600">${esc(String(valor || '—'))}</span>
  </div>`;
}

function _erow(icon, label, valor, ok) {
  const cor = ok ? '#34d399' : '#94a3b8';
  return `<div class="ev-row">
    <i class="fas ${icon}" style="color:${cor};width:14px;text-align:center;flex-shrink:0"></i>
    <span style="color:var(--text3);flex:1">${label}</span>
    <span style="color:${cor};font-weight:600;font-size:11px;text-align:right;max-width:55%">${esc(String(valor || '—'))}</span>
  </div>`;
}

function abrirModalTermos(data) {
  const el = document.getElementById('modal-resumo');
  el.innerHTML = `
    <p style="font-size:10px;font-weight:700;color:var(--blue-l);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px"><i class="fas fa-file-alt" style="margin-right:5px"></i>Resumo do Pedido</p>
    ${_rlinha('Cliente', data.nome)}
    ${_rlinha('CPF/CNPJ', maskDoc(data.cpf))}
    ${_rlinha('Celular', data.celular)}
    ${data.servico.planoMensal ? _rlinha('Plano', data.servico.planoMensal) : ''}
    ${data.servico.valorMensal ? _rlinha('Mensalidade', data.servico.valorMensal) : ''}
    ${data.endInstalacao.cidade ? _rlinha('Cidade/UF', data.endInstalacao.cidade + (data.endInstalacao.uf ? '/' + data.endInstalacao.uf : '')) : ''}
  `;

  const now = new Date().toLocaleString('pt-BR');
  const ev  = document.getElementById('modal-evidencias');
  ev.innerHTML =
    _erow('fa-clock',         'Data e Horário',      now, true) +
    _erow('fa-network-wired', 'Endereço IP',         _clienteIP, _clienteIP !== 'indisponível') +
    _erow('fa-camera',        'Foto do Rosto',       _selfieBase64 ? `Capturada ✓ (${Math.round(_selfieBase64.length*0.75/1024)} KB)` : 'Não capturada', !!_selfieBase64) +
    _erow('fa-signature',     'Ass. do Cliente',     data.assinaturaCliente ? 'Registrada ✓' : 'Não registrada', !!data.assinaturaCliente) +
    _erow('fa-map-pin',       'Geolocalização',      data.endInstalacao.coords || 'Não capturada', !!data.endInstalacao.coords) +
    _erow('fa-laptop',        'Dispositivo',         (navigator.userAgent.match(/\((.*?)\)/)?.[1] || navigator.platform || 'Desconhecido').slice(0, 40), true);

  const chk = document.getElementById('chk-termos');
  chk.checked = false;
  _onTermosChange(chk);

  _dadosPendentes = data;
  document.getElementById('modal-termos').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  _addLog('modal_termos_aberto');
}

function fecharModalTermos() {
  document.getElementById('modal-termos')?.classList.add('hidden');
  document.body.style.overflow = '';
  _addLog('modal_termos_cancelado');
}

function _onTermosChange(chk) {
  const btn = document.getElementById('btn-confirmar-envio');
  btn.disabled          = !chk.checked;
  btn.style.opacity     = chk.checked ? '1' : '.4';
  btn.style.cursor      = chk.checked ? 'pointer' : 'not-allowed';
  btn.style.pointerEvents = chk.checked ? 'auto' : 'none';
}

async function confirmarEnvioFinal() {
  if (!colPedidos) { toast('Sem conexão.', 'err'); return; }
  const btn = document.getElementById('btn-confirmar-envio');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>Enviando...';
  btn.style.opacity = '.7';

  _addLog('termos_aceitos');
  _addLog('pedido_enviado');

  const data = _dadosPendentes;
  data.evidencias = {
    ip:              _clienteIP,
    userAgent:       navigator.userAgent,
    platform:        navigator.platform || 'desconhecido',
    fotoRosto:       _selfieBase64 || null,
    aceitouTermos:   true,
    aceitouTermosEm: new Date().toISOString(),
    dataAssinatura:  new Date().toISOString(),
    logs:            [..._auditLogs],
  };

  try {
    // Re-garante auth caso o usuário anônimo tenha sido deslogado
    await _garantirAuth();
    data.criadoEm    = firebase.firestore.FieldValue.serverTimestamp();
    data.criadoEmStr = new Date().toLocaleString('pt-BR');
    await colPedidos.add(data);
    fecharModalTermos();
    _pararCamera();
    _selfieBase64 = null;
    showView('view-sucesso');
  } catch (err) {
    toast('Erro ao enviar: ' + err.message, 'err');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-circle-check"></i>Confirmar e Enviar Pedido';
    btn.style.opacity = '1';
  }
}

// ── STATE ─────────────────────────────────────────────
const st = {
  cpf: '',
  pedido: null,
  adm: null,
  pedidos: [],
  pedidosCliente: [],
  pedidoIdx: 0,
  _unsub: null,
  _filtro: 'todos',
  _panelId: null,
  _editMode: false,
};

// ── NAVIGATION ────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.style.display = '';
  });
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('active');
  window.scrollTo(0, 0);
}

// ── HELPERS: MASKS & VALIDATION ───────────────────────
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
  try { el.setSelectionRange(cur + diff, cur + diff); } catch (_) {}
}

function validarCpf(s) {
  const n = rawNum(s);
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  const dig = l => {
    let sum = 0;
    for (let i = 0; i < l; i++) sum += +n[i] * (l + 1 - i);
    const r = (sum * 10) % 11; return r >= 10 ? 0 : r;
  };
  return dig(9) === +n[9] && dig(10) === +n[10];
}

function validarCnpj(s) {
  const n = rawNum(s);
  if (n.length !== 14 || /^(\d)\1{13}$/.test(n)) return false;
  const calc = base => {
    let sum = 0, p = base.length - 7;
    for (let i = 0; i < base.length; i++) { sum += +n[i] * p--; if (p < 2) p = 9; }
    const r = sum % 11; return r < 2 ? 0 : 11 - r;
  };
  return calc(n.slice(0, 12)) === +n[12] && calc(n.slice(0, 13)) === +n[13];
}

function validarDoc(v) {
  const n = rawNum(v);
  if (n.length === 11) return validarCpf(n);
  if (n.length === 14) return validarCnpj(n);
  return false;
}

function tipoDoc(v) { return rawNum(v).length <= 11 ? 'CPF' : 'CNPJ'; }

function maskPhone(v) {
  const n = rawNum(v).slice(0, 11);
  if (n.length <= 10) return n.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return n.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}
function onPhoneInput(el) { el.value = maskPhone(el.value); }

let _cepTimers = {};
function onCepInput(el, prefix) {
  el.value = rawNum(el.value).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
  clearTimeout(_cepTimers[prefix]);
  if (rawNum(el.value).length === 8)
    _cepTimers[prefix] = setTimeout(() => buscarCep(el.value, prefix), 420);
}

async function buscarCep(cep, prefix) {
  const n = rawNum(cep);
  if (n.length !== 8) return;
  const spin = document.getElementById(`${prefix}-cep-spin`);
  const erroEl = document.getElementById(`${prefix}-cep-erro`);
  if (spin) spin.classList.remove('hidden');
  if (erroEl) erroEl.classList.add('hidden');
  try {
    const r = await fetch(`https://viacep.com.br/ws/${n}/json/`);
    const d = await r.json();
    if (spin) spin.classList.add('hidden');
    if (d.erro) { if (erroEl) { erroEl.textContent = 'CEP não encontrado'; erroEl.classList.remove('hidden'); } return; }
    setVal(`${prefix}-end`,    d.logradouro || '');
    setVal(`${prefix}-bairro`, d.bairro     || '');
    setVal(`${prefix}-cidade`, d.localidade || '');
    setVal(`${prefix}-uf`,     d.uf         || '');
    document.getElementById(`${prefix}-num`)?.focus();
  } catch {
    if (spin) spin.classList.add('hidden');
    if (erroEl) { erroEl.textContent = 'Erro ao buscar CEP'; erroEl.classList.remove('hidden'); }
  }
}

function setVal(id, v) {
  const el = document.getElementById(id);
  if (el) { el.value = v; el.dispatchEvent(new Event('input')); }
}

function maskMoeda(el) {
  let v = rawNum(el.value);
  if (!v) { el.value = ''; return; }
  v = (parseInt(v, 10) / 100).toFixed(2);
  el.value = 'R$ ' + v.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function pegarLocalizacao(prefix) {
  const btn = document.getElementById(`${prefix}-gps-btn`);
  if (!navigator.geolocation) { alert('GPS não disponível.'); return; }
  if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true; }
  navigator.geolocation.getCurrentPosition(pos => {
    const c = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
    setVal(`${prefix}-coords`, c);
    if (btn) { btn.innerHTML = '<i class="fas fa-crosshairs"></i>'; btn.disabled = false; }
  }, () => {
    alert('Não foi possível obter localização.');
    if (btn) { btn.innerHTML = '<i class="fas fa-crosshairs"></i>'; btn.disabled = false; }
  });
}

// ── ACCORDION SECTIONS ────────────────────────────────
function toggleSection(id) {
  const body  = document.getElementById(id + '-body');
  const chev  = document.getElementById(id + '-chev');
  if (!body) return;
  const isHidden = body.classList.toggle('hidden');
  if (chev) chev.classList.toggle('open', !isHidden);
}

// ── SAME ADDRESS ──────────────────────────────────────
function copiarEndereco() {
  [['inst-end','corr-end'],['inst-num','corr-num'],['inst-bairro','corr-bairro'],
   ['inst-cidade','corr-cidade'],['inst-uf','corr-uf'],['inst-cep','corr-cep']]
  .forEach(([s, d]) => {
    const se = document.getElementById(s), de = document.getElementById(d);
    if (se && de) de.value = se.value;
  });
  const body = document.getElementById('s-corr-body');
  if (body?.classList.contains('hidden')) toggleSection('s-corr');
}

// ── SIGNATURES ────────────────────────────────────────
const _sigs = {};

function initSignatures() {
  ['sig-cliente', 'sig-vendedor'].forEach(id => {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let drawing = false;

    function resize() {
      const data = canvas.toDataURL();
      canvas.width  = canvas.offsetWidth  || 320;
      canvas.height = canvas.offsetHeight || 120;
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (data !== 'data:,') { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = data; }
    }

    const getP = e => {
      const r = canvas.getBoundingClientRect();
      if (e.touches) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
      return { x: e.offsetX, y: e.offsetY };
    };

    canvas.addEventListener('mousedown',  e => { drawing = true; const p = getP(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('mousemove',  e => { if (!drawing) return; const p = getP(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    canvas.addEventListener('mouseup',    () => drawing = false);
    canvas.addEventListener('mouseleave', () => drawing = false);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; const p = getP(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }, { passive: false });
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); if (!drawing) return; const p = getP(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }, { passive: false });
    canvas.addEventListener('touchend',   () => drawing = false);

    _sigs[id] = { canvas, ctx, resize };
    setTimeout(resize, 60);
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
  const pixels = s.ctx.getImageData(0, 0, s.canvas.width, s.canvas.height).data;
  let hasInk = false;
  for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] > 0) { hasInk = true; break; } }
  if (!hasInk) return null;

  // Converte para JPEG com fundo branco (PNG seria maior para este uso)
  const tmp = document.createElement('canvas');
  tmp.width  = s.canvas.width;
  tmp.height = s.canvas.height;
  const ctx = tmp.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(s.canvas, 0, 0);
  return tmp.toDataURL('image/jpeg', 0.80); // ≈ 10–20 KB por assinatura
}

// ── LANDING ───────────────────────────────────────────
function _setCpfErro(msg) {
  const el = document.getElementById('cpf-erro');
  if (!el) return;
  el.querySelector('span').textContent = msg;
  el.classList.toggle('hidden', !msg);
}

function onLandingDocInput(el) {
  onDocInput(el);
  const n = rawNum(el.value);
  if (n.length >= 11) {
    _setCpfErro(!validarDoc(el.value) ? `${tipoDoc(el.value)} inválido` : '');
  } else _setCpfErro('');
}

function entrarCadastro() {
  const val = document.getElementById('inp-cpf').value;
  if (!validarDoc(val)) { _setCpfErro(`${tipoDoc(val)} inválido. Verifique os dígitos.`); document.getElementById('inp-cpf').focus(); return; }
  st.cpf = rawNum(val);
  // reset selfie state ao abrir novo formulário
  _selfieBase64 = null;
  _pararCamera();
  _setSelfieState('inicial');
  document.getElementById('selfie-badge-ok')?.classList.add('hidden');
  _auditLogs.length = 0;
  _addLog('formulario_aberto');
  showView('view-form');
  setWizardStep(1);
  setTimeout(() => {
    setVal('form-cpf', val);
    setVal('form-data', new Date().toLocaleDateString('pt-BR'));
    document.getElementById('form-cpf-label').textContent = val;
  }, 80);
}

async function entrarStatus() {
  const val = document.getElementById('inp-cpf').value;
  if (!validarDoc(val)) { _setCpfErro(`${tipoDoc(val)} inválido.`); return; }
  st.cpf = rawNum(val);
  showView('view-status-loading');
  await carregarStatusCliente();
}

function voltarCpf() {
  _pararCamera();
  fecharModalTermos();
  document.getElementById('inp-cpf').value = '';
  _setCpfErro('');
  st.cpf = '';
  showView('view-cpf');
  setTimeout(() => document.getElementById('inp-cpf')?.focus(), 80);
}

// ── WIZARD MULTI-ETAPAS ───────────────────────────────
let _wizardStep = 1;
const _wizardTotal = 6;
const _wizardTitles = ['Cabeçalho', 'Dados do Cliente', 'Endereço', 'Plano / Serviço', 'Assinaturas e Selfie', 'Resumo e Confirmação'];

function setWizardStep(step) {
  _wizardStep = Math.max(1, Math.min(step, _wizardTotal));
  
  for (let i = 1; i <= _wizardTotal; i++) {
    const el = document.getElementById(`wizard-step-${i}`);
    if (el) el.classList.toggle('hidden', i !== _wizardStep);
  }
  
  const pct = (_wizardStep / _wizardTotal) * 100;
  document.getElementById('wizard-progress').style.width = pct + '%';
  document.getElementById('wizard-step-num').textContent = `${_wizardStep} / ${_wizardTotal}`;
  document.getElementById('wizard-step-title').textContent = _wizardTitles[_wizardStep - 1] || 'Novo Pedido';
  
  const btnPrev = document.getElementById('wizard-prev');
  if (btnPrev) btnPrev.style.display = _wizardStep > 1 ? 'inline-flex' : 'none';
  
  const btnNextLabel = document.getElementById('wizard-next-label');
  const btnNextIcon = document.getElementById('wizard-next-icon');
  const btnNext = document.getElementById('wizard-next');
  
  if (_wizardStep === _wizardTotal) {
    if (btnNextLabel) btnNextLabel.textContent = 'Enviar Pedido';
    if (btnNextIcon) btnNextIcon.className = 'fas fa-paper-plane';
    if (btnNext) {
      btnNext.onclick = enviarPedido;
      btnNext.className = 'btn';
      btnNext.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    }
    renderWizardResumo();
  } else {
    if (btnNextLabel) btnNextLabel.textContent = 'Próximo';
    if (btnNextIcon) btnNextIcon.className = 'fas fa-arrow-right';
    if (btnNext) {
      btnNext.onclick = wizardNext;
      btnNext.className = 'btn';
      btnNext.style.background = 'linear-gradient(135deg, #2563eb, #1d4ed8)';
    }
  }
  
  // Resize canvas when reaching Step 5
  if (_wizardStep === 5) {
    setTimeout(() => {
      Object.values(_sigs).forEach(s => s.resize());
    }, 100);
  }
  
  // scroll content to top
  const wc = document.getElementById('wizard-content');
  if (wc) wc.scrollTo({ top: 0, behavior: 'smooth' });
  else window.scrollTo(0, 0);
}

function wizardNext() {
  const data = coletarForm();
  let erro = null;
  
  if (_wizardStep === 2) {
    if (!data.nome) erro = { campo: 'form-nome', msg: 'Nome obrigatório' };
    else if (!validarDoc(data.cpf)) erro = { campo: 'form-cpf', msg: 'CPF/CNPJ inválido' };
    else if (!data.celular) erro = { campo: 'form-cel', msg: 'Celular obrigatório' };
  } else if (_wizardStep === 3) {
    if (!data.endInstalacao.endereco) erro = { campo: 'inst-end', msg: 'Endereço obrigatório' };
    else if (!data.endInstalacao.numero) erro = { campo: 'inst-num', msg: 'Número obrigatório' };
    else if (!data.endInstalacao.cidade) erro = { campo: 'inst-cidade', msg: 'Cidade obrigatória' };
  } else if (_wizardStep === 5) {
    if (!_selfieBase64) erro = { msg: 'Verificação com selfie é obrigatória.' };
  }
  
  if (erro) {
    if (erro.campo) destacarCampo(erro.campo, erro.msg);
    else toast(erro.msg, 'err');
    return;
  }
  
  setWizardStep(_wizardStep + 1);
}

function wizardPrev() {
  if (_wizardStep > 1) {
    setWizardStep(_wizardStep - 1);
  } else {
    voltarCpf();
  }
}

function renderWizardResumo() {
  const d = coletarForm();
  const el = document.getElementById('resumo-content');
  if (!el) return;
  
  const R = (lbl, val) => val ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px"><span style="color:var(--text2)">${lbl}</span><span style="color:#fff;font-weight:600;text-align:right">${esc(val)}</span></div>` : '';
  const S = (lbl, img) => img ? `<div style="margin-top:10px"><span style="color:var(--text2);font-size:11px;display:block;margin-bottom:4px">${lbl}</span><div style="background:#fff;border-radius:6px;padding:4px;display:inline-block"><img style="max-height:48px;display:block" src="${img}"></div></div>` : '';
  
  let enderecoFmt = `${d.endInstalacao.endereco}, ${d.endInstalacao.numero}`;
  if (d.endInstalacao.bairro) enderecoFmt += ` - ${d.endInstalacao.bairro}`;
  
  el.innerHTML = `
    <div style="margin-bottom:16px">
      <p style="font-size:11px;color:var(--blue-l);font-weight:700;text-transform:uppercase;margin-bottom:4px">Cliente</p>
      ${R('Nome', d.nome)}
      ${R('Documento', d.cpf)}
      ${R('Celular', d.celular)}
      ${R('E-mail', d.email)}
    </div>
    <div style="margin-bottom:16px">
      <p style="font-size:11px;color:var(--blue-l);font-weight:700;text-transform:uppercase;margin-bottom:4px">Instalação</p>
      ${R('CEP', d.endInstalacao.cep)}
      ${R('Endereço', enderecoFmt)}
      ${R('Cidade/UF', `${d.endInstalacao.cidade}/${d.endInstalacao.uf}`)}
      ${R('GPS', d.endInstalacao.coords)}
    </div>
    <div style="margin-bottom:16px">
      <p style="font-size:11px;color:var(--blue-l);font-weight:700;text-transform:uppercase;margin-bottom:4px">Serviço</p>
      ${R('Plano', d.servico.planoMensal)}
      ${R('Pacote', d.servico.pacote)}
      ${R('Mensalidade', d.servico.valorMensal)}
      ${R('Data Instal.', d.servico.dataInstalacao)}
    </div>
    <div>
      <p style="font-size:11px;color:var(--blue-l);font-weight:700;text-transform:uppercase;margin-bottom:4px">Validação</p>
      ${S('Foto / Identidade', _selfieBase64)}
      ${S('Assin. Cliente', d.assinaturaCliente)}
      ${S('Assin. Vendedor', d.assinaturaVendedor)}
    </div>
  `;
}

// ── STATUS (CLIENT) ───────────────────────────────────
async function carregarStatusCliente() {
  try {
    // _garantirAuth() verifica sessão existente e re-autentica
    // anonimamente se necessário (ex: após signOut do painel admin)
    await _garantirAuth();
    if (!colPedidos) { toast('Sem conexão.', 'err'); showView('view-cpf'); return; }
    const snap = await colPedidos.where('cpf', '==', st.cpf).get();
    if (snap.empty) { showView('view-status-vazio'); return; }
    st.pedidosCliente = snap.docs
      .sort((a, b) => (b.data().criadoEm?.toMillis?.() ?? 0) - (a.data().criadoEm?.toMillis?.() ?? 0))
      .map(d => ({ id: d.id, ...d.data() }));
    st.pedidoIdx = 0;
    st.pedido = st.pedidosCliente[0];
    renderStatusCliente();
    showView('view-status');
  } catch (err) {
    alert('Erro: ' + err.message);
    showView('view-cpf');
  }
}

function selecionarPedidoCliente(idx) {
  st.pedidoIdx = idx;
  st.pedido = st.pedidosCliente[idx];
  renderStatusCliente();
}

function statusLabel(s) {
  return { pendente:'Pendente', aceito:'Aceito', recusado:'Recusado', reaberto:'Reaberto', fechado:'Encerrado' }[s] || s;
}
function statusIcon(s) {
  return { pendente:'fa-clock', aceito:'fa-circle-check', recusado:'fa-circle-xmark', reaberto:'fa-rotate-left', fechado:'fa-lock' }[s] || 'fa-circle';
}
function statusAccent(s) {
  return {
    pendente: { color:'#fbbf24', bg:'rgba(245,158,11,.12)', border:'rgba(245,158,11,.3)' },
    aceito:   { color:'#34d399', bg:'rgba(16,185,129,.12)', border:'rgba(16,185,129,.3)' },
    recusado: { color:'#f87171', bg:'rgba(239,68,68,.12)',  border:'rgba(239,68,68,.3)' },
    reaberto: { color:'#60a5fa', bg:'rgba(59,130,246,.12)', border:'rgba(59,130,246,.3)' },
    fechado:  { color:'#94a3b8', bg:'rgba(100,116,139,.12)',border:'rgba(100,116,139,.3)' },
  }[s] || { color:'#94a3b8', bg:'rgba(100,116,139,.12)', border:'rgba(100,116,139,.3)' };
}
function sysColor(texto) {
  const t = (texto || '').toLowerCase();
  if (t.includes('aceito'))   return { cor:'#34d399', bg:'rgba(16,185,129,.12)',  brd:'rgba(16,185,129,.3)' };
  if (t.includes('recusado')) return { cor:'#f87171', bg:'rgba(239,68,68,.12)',   brd:'rgba(239,68,68,.3)' };
  if (t.includes('encerrado') || t.includes('definitiv') || t.includes('fechado'))
                               return { cor:'#fb923c', bg:'rgba(251,146,60,.12)',  brd:'rgba(251,146,60,.3)' };
  if (t.includes('pendente')) return { cor:'#fbbf24', bg:'rgba(251,191,36,.12)',  brd:'rgba(251,191,36,.3)' };
  if (t.includes('alterado') || t.includes('status')) return { cor:'#60a5fa', bg:'rgba(96,165,250,.12)', brd:'rgba(96,165,250,.3)' };
  return { cor:'#94a3b8', bg:'rgba(148,163,184,.08)', brd:'rgba(148,163,184,.2)' };
}

function renderComentarios(lista) {
  if (!lista?.length) return `<p style="font-size:12px;color:#475569;text-align:center;padding:20px 0">Nenhum comentário ainda.</p>`;
  return lista.map(c => {
    if (c.tipo === 'sistema') {
      const cl = sysColor(c.texto);
      return `<div class="t-divider"><hr style="background:${cl.brd}"><div class="t-divider-label" style="color:${cl.cor};background:${cl.bg};border-color:${cl.brd}">${esc(c.texto)}<br><span style="font-size:10px;opacity:.7">${c.data}</span></div><hr style="background:${cl.brd}"></div>`;
    }
    const isC = c.tipo === 'cliente';
    return `<div class="timeline-msg ${isC ? 'mine' : ''}">
      <div class="t-av ${isC ? 't-av-c' : 't-av-s'}"><i class="fas ${isC ? 'fa-user' : 'fa-headset'}" style="font-size:10px"></i></div>
      <div style="flex:1;display:flex;flex-direction:column;${isC ? 'align-items:flex-end' : ''}">
        <p style="font-size:10px;color:#475569;margin-bottom:3px">${isC ? 'Você' : (c.autor || 'Atendente')} · ${c.data}</p>
        <div class="t-bubble ${isC ? 't-bubble-c' : 't-bubble-s'}">${esc(c.texto)}</div>
      </div>
    </div>`;
  }).join('');
}

function renderStatusCliente() {
  const p = st.pedido;
  if (!p) return;
  const a = statusAccent(p.status);
  const dataFmt = p.criadoEm?.toDate ? p.criadoEm.toDate().toLocaleString('pt-BR') : (p.criadoEmStr || '—');
  const el = document.getElementById('status-card');

  let pagerHtml = '';
  if (st.pedidosCliente.length > 1) {
    const opts = st.pedidosCliente.map((ped, i) => {
      const d = ped.criadoEm?.toDate ? ped.criadoEm.toDate().toLocaleDateString('pt-BR') : (ped.criadoEmStr || '—');
      return `<option value="${i}" ${i === st.pedidoIdx ? 'selected' : ''}>${esc(ped.nome || 'Pedido')} — ${d}</option>`;
    }).join('');
    pagerHtml = `<div style="background:rgba(7,18,45,.7);border:1px solid rgba(59,130,246,.15);border-radius:12px;padding:14px 16px;margin-bottom:14px">
      <p style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px"><i class="fas fa-list-ul" style="margin-right:5px"></i>Pedidos Anteriores</p>
      <select onchange="selecionarPedidoCliente(parseInt(this.value))" style="width:100%;background:rgba(4,10,28,.9);border:1px solid rgba(59,130,246,.2);border-radius:8px;padding:8px 10px;color:#e2e8f0;font-size:13px;outline:none;font-family:Inter,sans-serif">${opts}</select>
    </div>`;
  }

  // Bloco de informações (usado em ambas as colunas)
  const infoBloco = `
    ${pagerHtml}
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <div>
        <p style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.07em;font-weight:700;margin-bottom:4px">Pedido</p>
        <p style="font-size:22px;font-weight:900;color:#fff">${esc(p.nome || '—')}</p>
        <p style="font-size:12px;color:#475569;margin-top:3px;font-family:monospace"><i class="fas fa-id-card" style="margin-right:5px"></i>${maskDoc(p.cpf)}</p>
      </div>
      <span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:6px 14px;border-radius:999px;color:${a.color};background:${a.bg};border:1px solid ${a.border}">
        <i class="fas ${statusIcon(p.status)}"></i>${statusLabel(p.status)}
      </span>
    </div>
    <p style="font-size:11px;color:#475569;margin-bottom:16px"><i class="fas fa-clock" style="margin-right:5px"></i>Solicitado em: ${dataFmt}</p>
    ${p.notaAtendente ? `<div style="background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.2);border-radius:12px;padding:14px 16px;margin-bottom:16px">
      <p style="font-size:10px;font-weight:700;color:var(--blue-l);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px"><i class="fas fa-comment-dots" style="margin-right:5px"></i>Nota do Atendente</p>
      <p style="font-size:13px;color:#e2e8f0;line-height:1.6;white-space:pre-wrap">${esc(p.notaAtendente)}</p>
    </div>` : ''}
    ${p.servico ? `<div style="background:rgba(7,18,45,.7);border:1px solid rgba(59,130,246,.12);border-radius:12px;padding:14px 16px;margin-bottom:16px">
      <p style="font-size:10px;font-weight:700;color:var(--blue-l);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px"><i class="fas fa-wifi" style="margin-right:5px"></i>Serviço Contratado</p>
      ${p.servico.planoMensal ? `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)"><span style="color:#64748b">Plano</span><span style="color:#e2e8f0;font-weight:600">${esc(p.servico.planoMensal)}</span></div>` : ''}
      ${p.servico.pacote ? `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)"><span style="color:#64748b">Pacote</span><span style="color:#e2e8f0;font-weight:600">${esc(p.servico.pacote)}</span></div>` : ''}
      ${p.servico.valorMensal ? `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)"><span style="color:#64748b">Mensalidade</span><span style="color:#e2e8f0;font-weight:600">${esc(p.servico.valorMensal)}</span></div>` : ''}
      ${p.servico.pagamento ? `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)"><span style="color:#64748b">Pagamento</span><span style="color:#e2e8f0;font-weight:600">${esc(p.servico.pagamento)}</span></div>` : ''}
      ${p.servico.dataInstalacao ? `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span style="color:#64748b">Instalação</span><span style="color:#e2e8f0;font-weight:600">${esc(p.servico.dataInstalacao)}${p.servico.hora ? ' às ' + esc(p.servico.hora) : ''}</span></div>` : ''}
    </div>` : ''}`;

  // Bloco de comentários
  const comentariosBloco = `
    <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px;display:flex;align-items:center;gap:6px"><i class="fas fa-comments" style="color:var(--blue-l)"></i>Comentários</p>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px">${renderComentarios(p.comentarios)}</div>
    ${p.status === 'fechado' ? `<div style="background:rgba(100,116,139,.08);border:1px solid rgba(100,116,139,.2);border-radius:12px;padding:16px;text-align:center">
      <i class="fas fa-lock" style="font-size:20px;color:#64748b;display:block;margin-bottom:8px"></i>
      <p style="font-size:13px;font-weight:700;color:#94a3b8">Este pedido foi encerrado</p>
      <p style="font-size:11px;color:#475569;margin-top:4px">Não é possível enviar novos comentários.</p>
    </div>` : `<div>
      <textarea id="inp-comentario" rows="3" placeholder="Escreva um comentário ou dúvida..." style="width:100%;background:rgba(7,18,45,.8);border:1.5px solid rgba(59,130,246,.15);border-radius:10px;padding:10px 12px;font-size:16px;color:#e2e8f0;font-family:Inter,sans-serif;outline:none;resize:none;transition:border-color .2s;margin-bottom:8px" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='rgba(59,130,246,.15)'"></textarea>
      <button onclick="enviarComentarioCliente()" style="width:100%;padding:11px;border-radius:10px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;font-weight:700;font-size:14px;border:none;cursor:pointer;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .2s" onmouseover="this.style.background='linear-gradient(135deg,#3b82f6,#2563eb)'" onmouseout="this.style.background='linear-gradient(135deg,#2563eb,#1d4ed8)'">
        <i class="fas fa-paper-plane"></i>Enviar Comentário
      </button>
    </div>`}`;

  el.innerHTML = `<div class="status-layout">
    <div class="status-col-left">${infoBloco}</div>
    <div class="status-col-right">
      <div class="status-chat-scroll status-col-right-inner">${comentariosBloco}</div>
    </div>
  </div>`;
}

async function enviarComentarioCliente() {
  const texto = document.getElementById('inp-comentario')?.value?.trim();
  if (!texto || texto.length < 3) { alert('Escreva um comentário antes de enviar.'); return; }
  const btn = document.querySelector('#inp-comentario + button') || document.querySelector('[onclick="enviarComentarioCliente()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...'; }
  const comentario = { tipo: 'cliente', texto, data: new Date().toLocaleString('pt-BR') };
  const atuais = st.pedido.comentarios || [];
  try {
    await colPedidos.doc(st.pedido.id).update({ comentarios: [...atuais, comentario], status: 'reaberto' });
    st.pedido.comentarios = [...atuais, comentario];
    st.pedido.status = 'reaberto';
    document.getElementById('inp-comentario').value = '';
    renderStatusCliente();
  } catch (err) {
    alert('Erro: ' + err.message);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i>Enviar Comentário'; }
  }
}

// ── FORM ──────────────────────────────────────────────
function coletarForm() {
  const g = id => (document.getElementById(id)?.value || '').trim();
  return {
    cpf: st.cpf,
    tipoCpf: rawNum(g('form-cpf')).length === 11 ? 'CPF' : 'CNPJ',
    dataEmissao: g('form-data'), ac: g('form-ac'),
    nome: g('form-nome'), rg: g('form-rg'),
    celular: g('form-cel'), celularAlt: g('form-cel2'), email: g('form-email'),
    endInstalacao: { endereco: g('inst-end'), numero: g('inst-num'), bairro: g('inst-bairro'), cidade: g('inst-cidade'), uf: g('inst-uf'), cep: g('inst-cep'), coords: g('inst-coords'), complemento: g('inst-comp') },
    endCorrespondencia: { endereco: g('corr-end'), numero: g('corr-num'), bairro: g('corr-bairro'), cidade: g('corr-cidade'), uf: g('corr-uf'), cep: g('corr-cep'), complemento: g('corr-comp') },
    servico: { planoMensal: g('sv-plano'), pacote: g('sv-pacote'), valorMensal: g('sv-valor'), valorInstalacao: g('sv-valor-inst'), pagamento: g('sv-pagamento'), dataInstalacao: g('sv-data-inst'), hora: g('sv-hora'), tecnico: g('sv-tecnico'), kit: g('sv-kit') },
    assinaturaCliente: getSig('sig-cliente'),
    assinaturaVendedor: getSig('sig-vendedor'),
    status: 'pendente', notaAtendente: '', comentarios: [],
  };
}

function validarForm(d) {
  const erros = [];
  if (!d.nome)                         erros.push({ campo: 'form-nome',   msg: 'Nome obrigatório' });
  if (!validarDoc(d.cpf))              erros.push({ campo: 'form-cpf',    msg: 'CPF/CNPJ inválido' });
  if (!d.celular)                      erros.push({ campo: 'form-cel',    msg: 'Celular obrigatório' });
  if (!d.endInstalacao.endereco)       erros.push({ campo: 'inst-end',    msg: 'Endereço obrigatório' });
  if (!d.endInstalacao.cidade)         erros.push({ campo: 'inst-cidade', msg: 'Cidade obrigatória' });
  return erros;
}

function destacarCampo(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.borderColor = '#ef4444';
  el.focus();
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => el.style.borderColor = '', 3000);
  toast(msg, 'err');
}

async function enviarPedido() {
  if (!colPedidos) { toast('Sem conexão.', 'err'); return; }
  const data = coletarForm();
  const erros = validarForm(data);
  if (erros.length) { destacarCampo(erros[0].campo, erros[0].msg); return; }

  if (!_selfieBase64) {
    toast('Foto do cliente é obrigatória. Acesse "Verificação de Identidade".', 'err');
    setWizardStep(5);
    document.getElementById('selfie-estado-inicial')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  _addLog('formulario_validado');

  // Estima tamanho total das imagens em base64 (limite Firestore: 1 MB por documento)
  const bytesImg = [_selfieBase64, data.assinaturaCliente, data.assinaturaVendedor]
    .filter(Boolean)
    .reduce((acc, b64) => acc + Math.round(b64.length * 0.75), 0); // base64 → bytes reais
  if (bytesImg > 700_000) {
    toast(`Imagens muito grandes (${Math.round(bytesImg/1024)} KB). Tente refazer a selfie com câmera frontal.`, 'err');
    return;
  }

  abrirModalTermos(data);
}

// ── ADM LOGIN ─────────────────────────────────────────
// Converte nome em pseudo-email para Firebase Auth
function _toEmail(nome) {
  return nome.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
    + '@audicom.local';
}

// Rate limiting (complementa o bloqueio automático do Firebase Auth)
const _loginLock = { count: 0, lockedUntil: 0 };

// Cria usuário no Firebase Auth via app secundário (sem fazer logout do admin atual)
async function _criarAuthUsuario(email, senha) {
  const opts = firebase.app().options;
  let aux = firebase.apps.find(a => a.name === '_aux_');
  if (!aux) aux = firebase.initializeApp(opts, '_aux_');
  const auxAuth = aux.auth();
  const cred = await auxAuth.createUserWithEmailAndPassword(email, senha);
  const uid  = cred.user.uid;
  await auxAuth.signOut();
  return uid;
}

function voltarDaAdm() { showView('view-cpf'); }

function _admState(state) {
  ['adm-login-loading','adm-login-setup','adm-login-normal'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
  document.getElementById(state)?.classList.remove('hidden');
}

async function abrirAdmLogin() {
  showView('view-adm-login');
  _admState('adm-login-loading');

  // Aguarda Firebase Auth determinar o estado da sessão
  await new Promise(resolve => {
    const unsub = auth.onAuthStateChanged(u => { unsub(); resolve(u); });
  });

  // Sessão ativa → restaura painel automaticamente
  const user = auth.currentUser;
  if (user) {
    try {
      const doc = await colAdm.doc(user.uid).get({ source: 'server' });
      if (doc.exists && !doc.data().disabled) {
        st.adm = { nome: doc.data().nome, id: user.uid, master: doc.data().master === true };
        iniciarPainel();
        return;
      }
    } catch {}
    await auth.signOut();
  }

  // Sempre confirma com o servidor — localStorage é apenas cache de UX
  try {
    const snap = await colAdm.limit(1).get({ source: 'server' });
    if (snap.empty) {
      localStorage.removeItem('aud_has_admin');
      _admState('adm-login-setup');
      document.getElementById('adm-setup-senha').value = '';
      document.getElementById('adm-setup-conf').value  = '';
      document.getElementById('adm-setup-erro')?.classList.add('hidden');
      setTimeout(() => document.getElementById('adm-setup-senha')?.focus(), 80);
    } else {
      localStorage.setItem('aud_has_admin', '1');
      _mostrarLoginNormal();
    }
  } catch {
    // Se offline ou erro de regras, usa o cache local como fallback
    if (localStorage.getItem('aud_has_admin') === '1') {
      _mostrarLoginNormal();
    } else {
      _admState('adm-login-setup');
      setTimeout(() => document.getElementById('adm-setup-senha')?.focus(), 80);
    }
  }
}

function _mostrarLoginNormal() {
  _admState('adm-login-normal');
  document.getElementById('adm-login-erro')?.classList.add('hidden');
  document.getElementById('adm-nome').value  = '';
  document.getElementById('adm-senha').value = '';
  setTimeout(() => document.getElementById('adm-nome')?.focus(), 80);
}

async function criarAdmMaster() {
  const senha  = document.getElementById('adm-setup-senha').value;
  const conf   = document.getElementById('adm-setup-conf').value;
  const erroEl = document.getElementById('adm-setup-erro');
  erroEl.classList.add('hidden');
  if (senha.length < 6) { erroEl.querySelector('span').textContent = 'Mínimo 6 caracteres.'; erroEl.classList.remove('hidden'); return; }
  if (senha !== conf)   { erroEl.querySelector('span').textContent = 'As senhas não coincidem.';  erroEl.classList.remove('hidden'); return; }
  const btn = document.getElementById('btn-adm-setup');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>Salvando...';
  try {
    // Firebase Auth gerencia hash, salt e armazenamento seguro da senha
    const cred = await auth.createUserWithEmailAndPassword('admin@audicom.local', senha);
    await colAdm.doc(cred.user.uid).set({
      nome: 'admin', master: true, original: true,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
    localStorage.setItem('aud_has_admin', '1');
    st.adm = { nome: 'admin', master: true, id: cred.user.uid };
    iniciarPainel();
  } catch (err) {
    const msg = err.code === 'auth/email-already-in-use'
      ? 'Master já existe. Use o login normal.'
      : 'Erro: ' + err.message;
    erroEl.querySelector('span').textContent = msg;
    erroEl.classList.remove('hidden');
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-key"></i>Criar e Entrar';
  }
}

async function loginAdm() {
  // Bloqueio por tentativas excessivas (client-side — Firebase Auth também bloqueia server-side)
  if (Date.now() < _loginLock.lockedUntil) {
    const s = Math.ceil((_loginLock.lockedUntil - Date.now()) / 1000);
    toast(`Muitas tentativas. Aguarde ${s}s.`, 'err');
    return;
  }

  const nome   = document.getElementById('adm-nome').value.trim();
  const senha  = document.getElementById('adm-senha').value;
  const salvar = document.getElementById('adm-salvar-check')?.checked;
  const erroEl = document.getElementById('adm-login-erro');
  erroEl.classList.add('hidden');
  if (!nome || !senha) { erroEl.querySelector('span').textContent = 'Preencha nome e senha.'; erroEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('btn-adm-login');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>Verificando...';

  try {
    // Persistência: LOCAL = sobrevive ao fechamento do browser | SESSION = só esta aba
    await auth.setPersistence(
      salvar ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION
    );
    const cred = await auth.signInWithEmailAndPassword(_toEmail(nome), senha);

    const doc = await colAdm.doc(cred.user.uid).get();
    if (!doc.exists || doc.data().disabled) {
      await auth.signOut();
      erroEl.querySelector('span').textContent = 'Acesso revogado. Fale com o administrador.';
      erroEl.classList.remove('hidden');
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i>Entrar';
      return;
    }

    _loginLock.count = 0;
    st.adm = { nome: doc.data().nome, id: cred.user.uid, master: doc.data().master === true };
    iniciarPainel();
  } catch (err) {
    _loginLock.count++;
    if (_loginLock.count >= 5) {
      _loginLock.lockedUntil = Date.now() + 30_000;
      _loginLock.count = 0;
      toast('Conta bloqueada por 30 segundos.', 'err');
    }
    const msg = ['auth/user-not-found','auth/wrong-password','auth/invalid-credential'].includes(err.code)
      ? 'Nome ou senha incorretos.'
      : 'Erro: ' + err.message;
    erroEl.querySelector('span').textContent = msg;
    erroEl.classList.remove('hidden');
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i>Entrar';
  }
}

// ── ADM PANEL ─────────────────────────────────────────
function iniciarPainel() {
  const nome = st.adm.nome;
  const inicial = (nome || 'A')[0].toUpperCase();
  const role = st.adm.master ? 'Admin' : 'Atendente';

  document.getElementById('sidebar-nome').textContent = nome;
  document.getElementById('sidebar-role').textContent = role;
  document.getElementById('sidebar-avatar').textContent = inicial;
  document.getElementById('topbar-nome').textContent = nome;
  document.getElementById('topbar-role').textContent = role;
  document.getElementById('topbar-avatar').textContent = inicial;
  document.getElementById('mobile-avatar').textContent = inicial;

  showView('view-adm');
  setAdmTab('pedidos');

  if (st._unsub) st._unsub();
  st._unsub = colPedidos.orderBy('criadoEm', 'desc').onSnapshot(snap => {
    st.pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLista();
    if (st._panelId) _renderPanel();
  });
}

async function sairAdm() {
  if (st._unsub) { st._unsub(); st._unsub = null; }
  fecharPanel();
  try { await auth?.signOut(); } catch {}
  st.adm = null; st.pedidos = [];
  showView('view-cpf');
}

function setAdmTab(tab) {
  // sidebar nav
  document.getElementById('nav-pedidos')?.classList.toggle('active', tab === 'pedidos');
  document.getElementById('nav-usuarios')?.classList.toggle('active', tab === 'usuarios');
  // bottom nav
  document.getElementById('bnav-pedidos')?.classList.toggle('active', tab === 'pedidos');
  document.getElementById('bnav-usuarios')?.classList.toggle('active', tab === 'usuarios');
  // content
  document.getElementById('adm-tab-pedidos')?.classList.toggle('hidden', tab !== 'pedidos');
  document.getElementById('adm-tab-usuarios')?.classList.toggle('hidden', tab !== 'usuarios');
  // titles
  const titulo = tab === 'pedidos' ? 'Pedidos' : 'Usuários';
  document.getElementById('adm-topbar-title').textContent = titulo;
  document.getElementById('adm-mobile-title').textContent = titulo;

  if (tab === 'usuarios') renderUsuarios();
}

// ── ORDER LIST ────────────────────────────────────────
function setFiltro(f) {
  st._filtro = f;
  ['todos','pendente','aceito','recusado','reaberto','fechado'].forEach(s => {
    document.getElementById('chip-' + s)?.classList.toggle('active', s === f);
  });
  renderLista();
}

const BORDER = { pendente:'#f59e0b', aceito:'#10b981', recusado:'#ef4444', reaberto:'#3b82f6', fechado:'#64748b' };
const BG     = { pendente:'rgba(245,158,11,.08)', aceito:'rgba(16,185,129,.08)', recusado:'rgba(239,68,68,.07)', reaberto:'rgba(59,130,246,.08)', fechado:'rgba(100,116,139,.07)' };

function renderLista() {
  const el = document.getElementById('adm-lista');
  if (!el) return;

  // update stats
  ['pendente','aceito','recusado','reaberto','fechado'].forEach(s => {
    const cnt = st.pedidos.filter(p => p.status === s).length;
    const b = document.getElementById('stat-' + s);
    if (b) b.textContent = cnt;
  });
  document.getElementById('stat-total').textContent = st.pedidos.length;

  let lista = st._filtro === 'todos' ? st.pedidos : st.pedidos.filter(p => p.status === st._filtro);
  const q = (document.getElementById('adm-busca')?.value || '').trim().toLowerCase();
  if (q) lista = lista.filter(p =>
    [p.nome, p.cpf, p.email, p.celular, p.servico?.planoMensal, p.servico?.tecnico]
      .filter(Boolean).join(' ').toLowerCase().includes(q)
  );

  if (!lista.length) {
    el.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#475569">
      <i class="fas fa-inbox" style="font-size:36px;opacity:.2;display:block;margin-bottom:14px"></i>
      <p style="font-size:14px">${q ? `Sem resultados para "${esc(q)}"` : 'Nenhum pedido nesta categoria'}</p>
    </div>`;
    return;
  }

  el.innerHTML = lista.map(p => {
    const sLbl = statusLabel(p.status);
    const a = statusAccent(p.status);
    const border = BORDER[p.status] || '#64748b';
    const bg     = BG[p.status]     || 'transparent';
    const clientComents = (p.comentarios || []).filter(c => c.tipo === 'cliente').length;
    const data = p.criadoEmStr || '—';
    return `
    <div class="order-card" style="border-left-color:${border}" onclick="abrirPanel('${p.id}')">
      <div class="order-icon" style="background:${bg};border:1px solid ${border}33">
        <i class="fas ${statusIcon(p.status)}" style="color:${border}"></i>
      </div>
      <div class="order-info">
        <p class="order-name">${esc(p.nome || '—')}</p>
        <p class="order-doc"><i class="fas fa-id-card" style="margin-right:4px"></i>${maskDoc(p.cpf)}</p>
        <div class="order-meta">
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:2px 9px;border-radius:999px;color:${a.color};background:${a.bg};border:1px solid ${a.border}">${sLbl}</span>
          ${p.servico?.planoMensal ? `<span style="font-size:11px;color:#64748b"><i class="fas fa-wifi" style="margin-right:3px;font-size:9px"></i>${esc(p.servico.planoMensal)}</span>` : ''}
        </div>
      </div>
      <div class="order-right">
        ${clientComents ? `<span style="font-size:10px;font-weight:700;color:#60a5fa;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.25);padding:2px 8px;border-radius:999px"><i class="fas fa-comment" style="margin-right:3px;font-size:8px"></i>${clientComents}</span>` : ''}
        <span style="font-size:10px;color:#475569">${data}</span>
        <i class="fas fa-chevron-right" style="color:#334155;font-size:10px"></i>
      </div>
    </div>`;
  }).join('');
}

// ── ORDER PANEL ───────────────────────────────────────
function abrirPanel(id) {
  st._panelId = id;
  st._editMode = false;
  const panel = document.getElementById('panel-pedido');
  panel.style.display = 'flex';
  setTimeout(() => panel.classList.add('open'), 10);
  _renderPanel();
}

function fecharPanel() {
  const panel = document.getElementById('panel-pedido');
  panel.classList.remove('open');
  setTimeout(() => { panel.style.display = ''; st._panelId = null; st._editMode = false; }, 340);
}

function _renderPanel() {
  if (!st._panelId) return;
  const p = st.pedidos.find(x => x.id === st._panelId);
  if (!p) { fecharPanel(); return; }

  const a = statusAccent(p.status);
  document.getElementById('panel-nome').textContent = p.nome || '—';
  document.getElementById('panel-cpf').textContent  = maskDoc(p.cpf);
  const badge = document.getElementById('panel-badge');
  badge.textContent = statusLabel(p.status);
  badge.className   = 'badge badge-' + p.status;
  const iconEl = document.getElementById('panel-icon');
  iconEl.style.background = a.bg;
  iconEl.style.border     = `1px solid ${a.border}`;
  iconEl.querySelector('i').style.color = a.color;

  const editBtn = document.getElementById('btn-panel-edit');
  if (editBtn) editBtn.style.display = st._editMode ? 'none' : 'flex';

  document.getElementById('panel-body').innerHTML = st._editMode ? renderEdicao(p) : renderDetalhe(p);
}

function renderDetalhe(p) {
  const R = (l, v) => v ? `<div class="data-row"><span class="data-lbl">${l}</span><span class="data-val">${esc(String(v))}</span></div>` : '';
  const encerrado = p.status === 'aceito' || p.status === 'recusado';

  const timeline = (p.comentarios || []).map(c => {
    if (c.tipo === 'sistema') {
      const cl = sysColor(c.texto);
      return `<div class="t-divider"><hr style="background:${cl.brd}"><div class="t-divider-label" style="color:${cl.cor};background:${cl.bg};border-color:${cl.brd};max-width:70%">${esc(c.texto)}<br><span style="font-size:10px;opacity:.7">${c.data}</span></div><hr style="background:${cl.brd}"></div>`;
    }
    const isC = c.tipo === 'cliente';
    return `<div class="timeline-msg ${isC ? 'mine' : ''}">
      <div class="t-av ${isC ? 't-av-c' : 't-av-s'}"><i class="fas ${isC ? 'fa-user' : 'fa-headset'}" style="font-size:10px"></i></div>
      <div style="flex:1;display:flex;flex-direction:column;${isC ? 'align-items:flex-end' : ''}">
        <p style="font-size:10px;color:#475569;margin-bottom:3px">${isC ? 'Cliente' : (c.autor || 'Atendente')} · ${c.data}</p>
        <div class="t-bubble ${isC ? 't-bubble-c' : 't-bubble-s'}">${esc(c.texto)}</div>
      </div>
    </div>`;
  }).join('');

  return `
  <div class="panel-left">
    <div class="data-box">
      <div class="data-box-title"><i class="fas fa-user"></i>Cliente</div>
      ${R('Nome', p.nome)}${R('Doc.', maskDoc(p.cpf))}${R('RG', p.rg)}${R('Cel.', p.celular)}${R('E-mail', p.email)}
    </div>
    <div class="data-box">
      <div class="data-box-title"><i class="fas fa-map-pin"></i>Instalação</div>
      ${R('End.', [p.endInstalacao?.endereco, p.endInstalacao?.numero].filter(Boolean).join(', '))}
      ${R('Bairro', p.endInstalacao?.bairro)}
      ${R('Cidade', [p.endInstalacao?.cidade, p.endInstalacao?.uf].filter(Boolean).join(' / '))}
      ${R('CEP', p.endInstalacao?.cep)}
      ${R('GPS', p.endInstalacao?.coords)}
    </div>
    <div class="data-box">
      <div class="data-box-title"><i class="fas fa-wifi"></i>Serviço</div>
      ${R('Plano', p.servico?.planoMensal)}${R('Pacote', p.servico?.pacote)}
      ${R('Mensal.', p.servico?.valorMensal)}${R('Inst.', p.servico?.valorInstalacao)}
      ${R('Pagto.', p.servico?.pagamento)}
      ${R('Data', p.servico?.dataInstalacao ? p.servico.dataInstalacao + (p.servico?.hora ? ' ' + p.servico.hora : '') : null)}
      ${R('Técnico', p.servico?.tecnico)}${R('KIT', p.servico?.kit)}
    </div>
    ${(p.assinaturaCliente || p.assinaturaVendedor) ? `<div class="data-box">
      <div class="data-box-title"><i class="fas fa-signature"></i>Assinaturas</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:6px">
        ${p.assinaturaCliente  ? `<div><p style="font-size:10px;color:#64748b;margin-bottom:4px">Cliente</p><div style="background:#fff;border-radius:7px;padding:4px;display:inline-block"><img src="${p.assinaturaCliente}"  style="max-height:44px;display:block;border-radius:4px"></div></div>` : ''}
        ${p.assinaturaVendedor ? `<div><p style="font-size:10px;color:#64748b;margin-bottom:4px">Vendedor</p><div style="background:#fff;border-radius:7px;padding:4px;display:inline-block"><img src="${p.assinaturaVendedor}" style="max-height:44px;display:block;border-radius:4px"></div></div>` : ''}
      </div>
    </div>` : ''}
    ${p.evidencias ? `<div class="data-box">
      <div class="data-box-title"><i class="fas fa-shield-halved"></i>Evidências Jurídicas</div>
      ${p.evidencias.fotoRosto ? `<div style="margin-bottom:10px">
        <p style="font-size:10px;color:#64748b;margin-bottom:5px;font-weight:600"><i class="fas fa-camera" style="margin-right:4px"></i>Foto do Cliente no Ato da Assinatura</p>
        <img src="${p.evidencias.fotoRosto}" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;display:block;transform:scaleX(-1)">
      </div>` : ''}
      <div style="display:flex;flex-direction:column;gap:4px;font-size:12px">
        ${p.evidencias.ip ? `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)"><span style="color:#64748b"><i class="fas fa-network-wired" style="width:14px;margin-right:5px"></i>IP</span><span style="color:#e2e8f0;font-family:monospace">${esc(p.evidencias.ip)}</span></div>` : ''}
        ${p.evidencias.aceitouTermosEm ? `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)"><span style="color:#64748b"><i class="fas fa-clock" style="width:14px;margin-right:5px"></i>Aceite</span><span style="color:#34d399;font-weight:600">${new Date(p.evidencias.aceitouTermosEm).toLocaleString('pt-BR')}</span></div>` : ''}
        ${p.evidencias.aceitouTermos ? `<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)"><span style="color:#34d399;font-size:11px"><i class="fas fa-circle-check" style="margin-right:5px"></i>Termos aceitos expressamente pelo contratante</span></div>` : ''}
        ${p.evidencias.platform ? `<div style="padding:4px 0;color:#64748b;font-size:11px;word-break:break-all"><i class="fas fa-laptop" style="width:14px;margin-right:5px"></i>${esc(p.evidencias.platform)}</div>` : ''}
        ${p.evidencias.logs?.length ? `<details style="margin-top:6px"><summary style="font-size:10px;color:#475569;cursor:pointer;user-select:none"><i class="fas fa-list-ul" style="margin-right:4px"></i>Log de Auditoria (${p.evidencias.logs.length} eventos)</summary><div style="margin-top:6px;display:flex;flex-direction:column;gap:3px">${p.evidencias.logs.map(l => `<div style="font-size:10px;color:#475569;font-family:monospace">${l.ts.replace('T',' ').slice(0,19)} → ${esc(l.acao)}</div>`).join('')}</div></details>` : ''}
      </div>
    </div>` : ''}
    ${st.adm?.master ? `<button onclick="deletarPedido('${p.id}')" style="width:100%;margin-top:auto;padding:9px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;background:transparent;border:1px dashed rgba(239,68,68,.2);color:rgba(239,68,68,.5);font-family:Inter,sans-serif;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:6px" onmouseover="this.style.color='#f87171';this.style.borderColor='rgba(239,68,68,.5)'" onmouseout="this.style.color='rgba(239,68,68,.5)';this.style.borderColor='rgba(239,68,68,.2)'"><i class="fas fa-trash" style="font-size:11px"></i>Apagar Pedido</button>` : ''}
  </div>

  <div class="panel-right">
    <div style="padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.05);font-size:10px;font-weight:800;color:var(--blue-l);text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:6px;flex-shrink:0">
      <i class="fas fa-comments"></i>Histórico / Chat
    </div>
    <div class="panel-chat">
      ${timeline || '<p style="font-size:13px;color:#334155;text-align:center;padding:30px 0">Sem registros ainda.</p>'}
    </div>
    <div class="panel-actions">
      ${p.status === 'fechado' ? `<div style="display:flex;align-items:center;gap:10px;background:rgba(100,116,139,.08);border:1px solid rgba(100,116,139,.2);border-radius:10px;padding:12px 14px">
        <i class="fas fa-lock" style="color:#64748b;font-size:16px"></i>
        <div><p style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-weight:700">Status</p><p style="font-size:15px;font-weight:800;color:#94a3b8">Encerrado Definitivamente</p></div>
      </div>` : encerrado ? `<div style="display:flex;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:160px;display:flex;align-items:center;gap:10px;background:rgba(7,18,45,.7);border:1px solid var(--border);border-radius:10px;padding:10px 14px">
          <i class="fas ${statusIcon(p.status)}" style="font-size:16px;color:${statusAccent(p.status).color}"></i>
          <div><p style="font-size:10px;color:#64748b;text-transform:uppercase;font-weight:700">Status</p><p style="font-size:15px;font-weight:800;color:${statusAccent(p.status).color}">${statusLabel(p.status)}</p></div>
        </div>
        <div style="display:flex;gap:8px;flex:1;min-width:200px;align-items:center">
          <select id="mudar-status-${p.id}" class="action-select">
            <option value="pendente">↩ Pendente</option>
            <option value="aceito"   ${p.status==='aceito'?'selected':''}>✓ Aceito</option>
            <option value="recusado" ${p.status==='recusado'?'selected':''}>✗ Recusado</option>
          </select>
          <button onclick="mudarStatus('${p.id}')" class="btn-sm" style="padding:9px 14px;white-space:nowrap"><i class="fas fa-rotate"></i>Alterar</button>
        </div>
      </div>` : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button onclick="acaoAdm('${p.id}','aceito')"   class="btn-success"><i class="fas fa-check"></i>Aceitar</button>
        <button onclick="acaoAdm('${p.id}','recusado')" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);color:#f87171;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:6px;justify-content:center" onmouseover="this.style.background='rgba(239,68,68,.2)'" onmouseout="this.style.background='rgba(239,68,68,.1)'"><i class="fas fa-xmark"></i>Recusar</button>
      </div>`}

      ${p.status !== 'fechado' ? `
      <div style="display:flex;gap:8px;align-items:flex-end">
        <textarea id="nota-${p.id}" rows="2" placeholder="Mensagem ao cliente..." class="panel-textarea" style="flex:1">${esc(p.notaAtendente || '')}</textarea>
        <button onclick="responderAdm('${p.id}')" style="padding:9px 14px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.3);color:var(--blue-l);font-family:Inter,sans-serif;transition:all .15s;display:flex;align-items:center;gap:6px;white-space:nowrap;align-self:flex-end" onmouseover="this.style.background='rgba(59,130,246,.22)'" onmouseout="this.style.background='rgba(59,130,246,.12)'"><i class="fas fa-paper-plane"></i>Enviar</button>
      </div>
      <div id="zona-fechar-${p.id}">
        <button onclick="mostrarFecharDef('${p.id}')" style="width:100%;padding:9px;border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;background:transparent;border:1px dashed rgba(251,191,36,.2);color:rgba(251,191,36,.55);font-family:Inter,sans-serif;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:6px" onmouseover="this.style.color='#fbbf24';this.style.borderColor='rgba(251,191,36,.5)'" onmouseout="this.style.color='rgba(251,191,36,.55)';this.style.borderColor='rgba(251,191,36,.2)'">
          <i class="fas fa-lock" style="font-size:11px"></i>Fechar Definitivo
        </button>
      </div>` : ''}
    </div>
  </div>`;
}

function renderEdicao(p) {
  const I = (id, val, ph) => `<input id="${id}" value="${esc(String(val || ''))}" placeholder="${ph}" class="edit-inp">`;
  return `
  <div style="width:100%;padding:20px;overflow-y:auto">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <h3 style="font-size:15px;font-weight:700;color:var(--blue-l);display:flex;align-items:center;gap:8px"><i class="fas fa-pen"></i>Editar Pedido</h3>
      <div style="display:flex;gap:8px">
        <button onclick="cancelarEdicao()" style="padding:8px 16px;border-radius:9px;background:rgba(255,255,255,.05);border:1px solid var(--border);color:var(--text2);font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif"><i class="fas fa-times"></i> Cancelar</button>
        <button id="btn-salvar" onclick="salvarEdicao('${p.id}')" class="btn-sm" style="padding:8px 16px"><i class="fas fa-save"></i>Salvar</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
      <div class="data-box">
        <div class="data-box-title"><i class="fas fa-user"></i>Cliente</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${I('ed-nome', p.nome, 'Nome')}
          ${I('ed-cpf', maskDoc(p.cpf), 'CPF/CNPJ')}
          ${I('ed-rg', p.rg, 'RG')}
          ${I('ed-cel', p.celular, 'Celular')}
          ${I('ed-email', p.email, 'E-mail')}
        </div>
      </div>
      <div class="data-box">
        <div class="data-box-title"><i class="fas fa-map-pin"></i>Instalação</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${I('ed-end', p.endInstalacao?.endereco, 'Endereço')}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${I('ed-num', p.endInstalacao?.numero, 'Nº')}${I('ed-cep', p.endInstalacao?.cep, 'CEP')}</div>
          ${I('ed-bairro', p.endInstalacao?.bairro, 'Bairro')}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${I('ed-cidade', p.endInstalacao?.cidade, 'Cidade')}${I('ed-uf', p.endInstalacao?.uf, 'UF')}</div>
          ${I('ed-gps', p.endInstalacao?.coords, 'GPS')}
        </div>
      </div>
      <div class="data-box" style="grid-column:1/-1">
        <div class="data-box-title"><i class="fas fa-wifi"></i>Serviço / Plano</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">
          ${I('ed-plano', p.servico?.planoMensal, 'Plano')}
          ${I('ed-pacote', p.servico?.pacote, 'Pacote')}
          ${I('ed-mensal', p.servico?.valorMensal, 'Mensalidade')}
          ${I('ed-vinst', p.servico?.valorInstalacao, 'Vlr Instalação')}
          ${I('ed-pagto', p.servico?.pagamento, 'Pagamento')}
          ${I('ed-data', p.servico?.dataInstalacao, 'Data Inst.')}
          ${I('ed-hora', p.servico?.hora, 'Hora')}
          ${I('ed-tec', p.servico?.tecnico, 'Técnico')}
          ${I('ed-kit', p.servico?.kit, 'KIT')}
        </div>
      </div>
    </div>
  </div>`;
}

function ativarEdicao()  { st._editMode = true;  _renderPanel(); }
function cancelarEdicao(){ st._editMode = false; _renderPanel(); }

async function salvarEdicao(id) {
  const g = eid => document.getElementById(eid)?.value?.trim() || '';
  const dados = {
    nome: g('ed-nome'), cpf: rawNum(g('ed-cpf')), rg: g('ed-rg'), celular: g('ed-cel'), email: g('ed-email'),
    endInstalacao: { endereco: g('ed-end'), numero: g('ed-num'), bairro: g('ed-bairro'), cidade: g('ed-cidade'), uf: g('ed-uf'), cep: g('ed-cep'), coords: g('ed-gps') },
    servico: { planoMensal: g('ed-plano'), pacote: g('ed-pacote'), valorMensal: g('ed-mensal'), valorInstalacao: g('ed-vinst'), pagamento: g('ed-pagto'), dataInstalacao: g('ed-data'), hora: g('ed-hora'), tecnico: g('ed-tec'), kit: g('ed-kit') },
  };
  const btn = document.getElementById('btn-salvar');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
  try {
    await colPedidos.doc(id).update(dados);
    toast('Pedido atualizado!', 'ok');
    st._editMode = false;
  } catch (err) {
    alert('Erro: ' + err.message);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i>Salvar'; }
  }
}

// ── ADM ACTIONS ───────────────────────────────────────
async function acaoAdm(id, novoStatus) {
  const nota = document.getElementById('nota-' + id)?.value?.trim() || '';
  const p = st.pedidos.find(x => x.id === id);
  const logTxt = novoStatus === 'aceito'
    ? `Pedido aceito por ${st.adm?.nome || 'Atendente'}`
    : `Pedido recusado por ${st.adm?.nome || 'Atendente'}`;
  const log = { tipo: 'sistema', texto: logTxt, data: new Date().toLocaleString('pt-BR') };
  try {
    await colPedidos.doc(id).update({ status: novoStatus, notaAtendente: nota, comentarios: [...(p?.comentarios || []), log] });
    toast(novoStatus === 'aceito' ? 'Pedido aceito!' : 'Pedido recusado.', novoStatus === 'aceito' ? 'ok' : 'err');
  } catch (err) { alert('Erro: ' + err.message); }
}

async function mudarStatus(id) {
  const novoStatus = document.getElementById('mudar-status-' + id)?.value;
  const p = st.pedidos.find(x => x.id === id);
  if (!novoStatus || novoStatus === p?.status) { toast('Selecione um status diferente.', 'err'); return; }
  const log = { tipo: 'sistema', texto: `Status alterado para "${statusLabel(novoStatus)}" por ${st.adm?.nome || 'Atendente'}`, data: new Date().toLocaleString('pt-BR') };
  try {
    await colPedidos.doc(id).update({ status: novoStatus, comentarios: [...(p?.comentarios || []), log] });
    toast('Status atualizado!', 'ok');
  } catch (err) { alert('Erro: ' + err.message); }
}

async function responderAdm(id) {
  const nota = document.getElementById('nota-' + id)?.value?.trim();
  const p = st.pedidos.find(x => x.id === id);
  if (!nota) { toast('Escreva uma mensagem primeiro.', 'err'); return; }
  const comentario = { tipo: 'atendente', autor: st.adm?.nome || 'Atendente', texto: nota, data: new Date().toLocaleString('pt-BR') };
  try {
    await colPedidos.doc(id).update({ notaAtendente: nota, comentarios: [...(p?.comentarios || []), comentario] });
    document.getElementById('nota-' + id).value = '';
    toast('Mensagem enviada!', 'ok');
  } catch (err) { alert('Erro: ' + err.message); }
}

async function deletarPedido(id) {
  if (!st.adm?.master) return;
  if (!confirm('Apagar este pedido permanentemente? Não há como desfazer.')) return;
  try {
    await colPedidos.doc(id).delete();
    fecharPanel();
    toast('Pedido apagado.', 'err');
  } catch (err) { alert('Erro: ' + err.message); }
}

function mostrarFecharDef(id) {
  const zona = document.getElementById('zona-fechar-' + id);
  if (!zona) return;
  zona.innerHTML = `
  <div style="background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.25);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;gap:10px;align-items:flex-start">
      <i class="fas fa-triangle-exclamation" style="color:#fbbf24;font-size:18px;flex-shrink:0;margin-top:1px"></i>
      <div>
        <p style="font-size:14px;font-weight:800;color:#fbbf24;margin-bottom:4px">Fechar Definitivo</p>
        <p style="font-size:12px;color:#94a3b8;line-height:1.6">O cliente <strong style="color:#e2e8f0">não poderá mais</strong> enviar comentários neste pedido.</p>
      </div>
    </div>
    <textarea id="motivo-${id}" rows="2" placeholder="Motivo (opcional)..." class="panel-textarea"></textarea>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button onclick="_renderPanel()" style="padding:9px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;background:rgba(255,255,255,.05);border:1px solid var(--border);color:var(--text2);font-family:Inter,sans-serif">Cancelar</button>
      <button onclick="confirmarFechar('${id}')" style="padding:9px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.4);color:#fbbf24;font-family:Inter,sans-serif"><i class="fas fa-lock" style="font-size:11px;margin-right:4px"></i>Confirmar</button>
    </div>
  </div>`;
}

async function confirmarFechar(id) {
  const motivo = document.getElementById('motivo-' + id)?.value?.trim() || '';
  const p = st.pedidos.find(x => x.id === id);
  const logTxt = `OS encerrada definitivamente por ${st.adm?.nome || 'Atendente'}` + (motivo ? ` — ${motivo}` : '');
  const log = { tipo: 'sistema', texto: logTxt, data: new Date().toLocaleString('pt-BR') };
  try {
    await colPedidos.doc(id).update({ status: 'fechado', comentarios: [...(p?.comentarios || []), log] });
    toast('OS encerrada definitivamente.', 'err');
  } catch (err) { alert('Erro: ' + err.message); }
}

// ── USER MANAGEMENT ───────────────────────────────────
let _editUserId = null;

async function renderUsuarios() {
  const sec = document.getElementById('adm-tab-usuarios');
  if (!sec) return;
  if (!st.adm?.master) {
    sec.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#475569"><i class="fas fa-shield-halved" style="font-size:36px;display:block;margin-bottom:14px;opacity:.2"></i><p>Apenas administradores podem gerenciar usuários.</p></div>`;
    return;
  }
  const grid = document.getElementById('users-grid');
  if (!grid) return;
  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px 0;color:#475569"><i class="fas fa-spinner fa-spin" style="font-size:20px"></i></div>`;
  try {
    const snap = await colAdm.get();
    const usuarios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!usuarios.length) { grid.innerHTML = '<p style="font-size:13px;color:#475569;grid-column:1/-1;text-align:center;padding:20px 0">Nenhum usuário.</p>'; return; }

    grid.innerHTML = usuarios.map(u => {
      const isProtected = u.original || u.nome?.trim().toLowerCase() === 'admin';
      const roleColor = u.master ? '#60a5fa' : '#64748b';
      const roleLabel = u.master ? (isProtected ? 'Super Admin' : 'Admin') : 'Atendente';
      const avatarBg  = u.master ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : 'linear-gradient(135deg,#334155,#1e293b)';

      if (_editUserId === u.id) {
        const isOwn = u.id === auth?.currentUser?.uid;
        return `<div class="user-card" style="border-color:rgba(59,130,246,.35)">
          <div class="user-avatar" style="background:${avatarBg};color:#fff">${(u.nome||'U')[0].toUpperCase()}</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <input id="eu-nome" class="inp" type="text" value="${esc(u.nome)}" placeholder="Nome" style="font-size:13px">
            ${isOwn ? `
            <input id="eu-senha" class="inp" type="password" placeholder="Nova senha (vazio=manter)" style="font-size:13px">
            <input id="eu-conf"  class="inp" type="password" placeholder="Confirmar nova senha" style="font-size:13px" onkeydown="if(event.key==='Enter')salvarUsuario('${u.id}')">
            ` : `<p style="font-size:11px;color:#475569;padding:3px 0"><i class="fas fa-info-circle" style="margin-right:4px;color:#60a5fa"></i>Senha: gerenciar via Firebase Console</p>`}
            <p id="eu-erro-${u.id}" class="hidden" style="font-size:11px;color:#f87171"></p>
            <div style="display:flex;gap:6px">
              <button onclick="_editUserId=null;renderUsuarios()" style="flex:1;padding:7px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;background:rgba(255,255,255,.05);border:1px solid var(--border);color:var(--text2);font-family:Inter,sans-serif">Cancelar</button>
              <button onclick="salvarUsuario('${u.id}')" class="btn-sm" style="flex:1;padding:7px"><i class="fas fa-save"></i>Salvar</button>
            </div>
          </div>
        </div>`;
      }

      return `<div class="user-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
          <div class="user-avatar" style="background:${avatarBg};color:#fff;margin-bottom:0">${(u.nome||'U')[0].toUpperCase()}</div>
          <div style="display:flex;gap:4px">
            ${!isProtected ? `
              <button onclick="toggleMaster('${u.id}')" title="${u.master ? 'Remover Admin' : 'Promover a Admin'}"
                style="width:28px;height:28px;border-radius:7px;border:none;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;background:rgba(245,158,11,.1);color:${u.master?'#fbbf24':'#64748b'};transition:all .15s"
                onmouseover="this.style.background='rgba(245,158,11,.2)'" onmouseout="this.style.background='rgba(245,158,11,.1)'">
                <i class="fas fa-star"></i>
              </button>
              <button onclick="_editUserId='${u.id}';renderUsuarios()"
                style="width:28px;height:28px;border-radius:7px;border:none;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;background:rgba(59,130,246,.1);color:var(--blue-l);transition:all .15s"
                onmouseover="this.style.background='rgba(59,130,246,.2)'" onmouseout="this.style.background='rgba(59,130,246,.1)'">
                <i class="fas fa-pen"></i>
              </button>
              <button onclick="excluirUsuario('${u.id}')"
                style="width:28px;height:28px;border-radius:7px;border:none;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;background:rgba(239,68,68,.1);color:#f87171;transition:all .15s"
                onmouseover="this.style.background='rgba(239,68,68,.2)'" onmouseout="this.style.background='rgba(239,68,68,.1)'">
                <i class="fas fa-trash"></i>
              </button>
            ` : `<span style="font-size:18px;color:#fbbf24" title="Conta protegida"><i class="fas fa-star"></i></span>`}
          </div>
        </div>
        <p class="user-name">${esc(u.nome)}</p>
        <p class="user-role" style="color:${roleColor}">${roleLabel}</p>
      </div>`;
    }).join('');

    if (_editUserId) setTimeout(() => document.getElementById('eu-nome')?.focus(), 30);
  } catch (e) { console.error(e); }
}

function toggleAddUserForm() {
  const wrap = document.getElementById('add-user-form-wrap');
  const btn  = document.getElementById('btn-add-user');
  if (wrap.classList.contains('hidden')) {
    wrap.classList.remove('hidden');
    btn.innerHTML = '<i class="fas fa-times"></i>Cancelar';
    setTimeout(() => document.getElementById('nu-nome')?.focus(), 30);
  } else {
    cancelarAddUser();
  }
}

function cancelarAddUser() {
  document.getElementById('add-user-form-wrap')?.classList.add('hidden');
  const btn = document.getElementById('btn-add-user');
  if (btn) btn.innerHTML = '<i class="fas fa-user-plus"></i>Novo Usuário';
  ['nu-nome','nu-senha','nu-conf'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('nu-erro')?.classList.add('hidden');
}

async function criarNovoUsuario() {
  const nome   = document.getElementById('nu-nome').value.trim();
  const senha  = document.getElementById('nu-senha').value;
  const conf   = document.getElementById('nu-conf').value;
  const erroEl = document.getElementById('nu-erro');
  erroEl.classList.add('hidden');
  if (!nome)            { erroEl.querySelector('span').textContent = 'Informe o nome.'; erroEl.classList.remove('hidden'); return; }
  if (senha.length < 6) { erroEl.querySelector('span').textContent = 'Mínimo 6 caracteres.'; erroEl.classList.remove('hidden'); return; }
  if (senha !== conf)   { erroEl.querySelector('span').textContent = 'As senhas não coincidem.'; erroEl.classList.remove('hidden'); return; }
  const btns = document.querySelectorAll('#add-user-form-wrap .btn');
  btns.forEach(b => { b.disabled = true; });
  try {
    // App auxiliar: cria usuário sem fazer logout do admin atual
    const email = _toEmail(nome);
    const uid   = await _criarAuthUsuario(email, senha);
    await colAdm.doc(uid).set({ nome, master: false, criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
    cancelarAddUser();
    renderUsuarios();
    toast(`Usuário "${nome}" criado!`, 'ok');
  } catch (e) {
    const msg = e.code === 'auth/email-already-in-use' ? `Usuário "${nome}" já existe.` : 'Erro: ' + e.message;
    erroEl.querySelector('span').textContent = msg;
    erroEl.classList.remove('hidden');
    btns.forEach(b => { b.disabled = false; });
  }
}

async function salvarUsuario(id) {
  const nome   = document.getElementById('eu-nome').value.trim();
  const nova   = document.getElementById('eu-senha')?.value || '';
  const conf   = document.getElementById('eu-conf')?.value  || '';
  const erroEl = document.getElementById('eu-erro-' + id);
  if (erroEl) erroEl.classList.add('hidden');
  if (!nome)                   { if (erroEl) { erroEl.textContent = 'Informe o nome.'; erroEl.classList.remove('hidden'); } return; }
  if (nova && nova.length < 6) { if (erroEl) { erroEl.textContent = 'Mínimo 6 caracteres.'; erroEl.classList.remove('hidden'); } return; }
  if (nova && nova !== conf)   { if (erroEl) { erroEl.textContent = 'As senhas não coincidem.'; erroEl.classList.remove('hidden'); } return; }

  const isOwn = id === auth?.currentUser?.uid;
  try {
    await colAdm.doc(id).update({ nome });
    if (nova) {
      if (isOwn) {
        try {
          await auth.currentUser.updatePassword(nova);
        } catch (e) {
          if (e.code === 'auth/requires-recent-login') {
            toast('Para trocar sua senha: saia, entre novamente e repita.', 'err');
          } else throw e;
        }
      } else {
        // Não é possível alterar senha de outro usuário via client SDK
        toast('Nome atualizado. Senha de outros usuários só pelo Firebase Console.', 'ok');
        _editUserId = null; renderUsuarios(); return;
      }
    }
    _editUserId = null;
    renderUsuarios();
    toast('Usuário atualizado!', 'ok');
  } catch (e) { if (erroEl) { erroEl.textContent = 'Erro: ' + e.message; erroEl.classList.remove('hidden'); } }
}

async function toggleMaster(id) {
  try {
    const snap = await colAdm.doc(id).get();
    if (!snap.exists) return;
    const u = snap.data();
    if (u.original || u.nome?.trim().toLowerCase() === 'admin') return;
    await colAdm.doc(id).update({ master: !u.master });
    renderUsuarios();
    toast(u.master ? 'Admin removido.' : 'Promovido a Admin!', 'ok');
  } catch (e) { alert('Erro: ' + e.message); }
}

async function excluirUsuario(id) {
  if (!confirm('Remover este usuário? O acesso será bloqueado imediatamente.\n\nObs: a conta no Firebase Authentication deve ser excluída manualmente no Console.')) return;
  if (id === auth?.currentUser?.uid) { toast('Você não pode remover a própria conta.', 'err'); return; }
  try {
    // Deleta o doc do Firestore — login falha mesmo se conta Auth ainda existir
    await colAdm.doc(id).delete();
    renderUsuarios();
    toast('Usuário removido. Delete a conta no Firebase Console para revogar completamente.', 'ok');
  } catch (e) { alert('Erro: ' + e.message); }
}

// ── UTILS ─────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let _toastTimer;
function toast(msg, tipo = 'ok') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.background = tipo === 'ok' ? '#059669' : '#dc2626';
  el.style.color = '#fff';
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
