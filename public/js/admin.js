// ==========================================
// 0. CONFIGURAÇÕES VISUAIS (SWEETALERT2)
// ==========================================
const API_URL = ""; 

// Configuração do Modal Escuro (Dark Theme)
const swalDark = Swal.mixin({
    background: '#121212',
    color: '#ffffff',
    confirmButtonColor: '#ff5e00',
    cancelButtonColor: '#d33',
    iconColor: '#ff5e00',
    customClass: {
        popup: 'border-neon' 
    }
});

// Configuração do Toast (Notificação rápida no canto)
const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    background: '#1a1a1a',
    color: '#fff',
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer)
        toast.addEventListener('mouseleave', Swal.resumeTimer)
    }
});

// ==========================================
// FUNÇÕES DE NAVEGAÇÃO
// ==========================================
window.openTab = function(aba) {
    console.log("Navegando para:", aba);

    // 1. Esconde todas as seções
    const secoes = document.querySelectorAll('section, .tab-content');
    secoes.forEach(s => s.style.display = 'none');

    // 2. Remove classe ativo dos botões
    const botoes = document.querySelectorAll('.btn-nav');
    botoes.forEach(b => b.classList.remove('ativo'));

    // 3. Mostra a aba certa
    let abaAlvo = document.getElementById(aba);
    if (!abaAlvo) abaAlvo = document.getElementById('aba-' + aba);
    
    if (abaAlvo) {
        abaAlvo.style.display = 'block';
        abaAlvo.classList.add('active'); 
    }

    // 4. Ativa o botão no menu
    const btnAlvo = document.getElementById('nav-' + aba) || document.querySelector(`button[onclick*="'${aba}'"]`);
    if(btnAlvo) btnAlvo.classList.add('ativo');

    // 5. Carrega dados específicos
    try {
        if (aba === 'dashboard') carregarDashboard();
        if (aba === 'pedidos') carregarVendas();
        if (aba === 'produtos') carregarListaAdmin();
        if (aba === 'revendedores') carregarRevendedores();
        if (aba === 'config' || aba === 'social') carregarConfiguracoesNoForm();
    } catch (e) {
        console.error("Erro ao carregar aba:", e);
    }
};

window.mostrarAba = window.openTab;

window.logout = function() {
    swalDark.fire({
        title: 'Sair?',
        text: "Deseja encerrar a sessão?",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sim, sair',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            window.location.href = '/logout';
        }
    });
};

window.toggleAdminMenu = function() {
    const sidebar = document.getElementById('sidebarAdmin');
    const overlay = document.getElementById('overlayAdmin');
    if (sidebar) sidebar.classList.toggle('aberto');
    if (overlay) overlay.classList.toggle('aberto');
};

// ==========================================
// 1. INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("Admin JS Iniciado com sucesso ✅");

    try { carregarDashboard(); } catch(e) { console.warn("Dash offline no inicio", e); }
    
    // Inicializa a primeira linha de variação visual
    const containerVars = document.getElementById('container-variacoes');
    if (containerVars) adicionarLinhaVariacao();

    carregarVendas();
    carregarListaAdmin();
    carregarCupons();
    
    const addListener = (id, func) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('submit', func);
    };

    addListener('form-tema', salvarConfigGeneric);
    addListener('form-social', salvarConfigGeneric);
    addListener('form-config', salvarConfigGeneric);
    addListener('form-produto', salvarProduto);
    addListener('form-cupom', salvarCupom);
    addListener('form-revendedor', salvarRevendedor);

    openTab('dashboard');
});

// ==========================================
// 2. DASHBOARD & RELATÓRIOS
// ==========================================
let chartInstance = null; 

async function carregarDashboard() {
    try {
        const elPeriodo = document.getElementById('filtro-periodo');
        const periodo = elPeriodo ? elPeriodo.value : '7dias';
        
        const res = await fetch(`${API_URL}/api/vendas`);
        const todasVendas = await res.json();
        
        const resDash = await fetch(`${API_URL}/api/dashboard`);
        const dataDash = await resDash.json();

        const hoje = new Date();
        let faturamento = 0;
        let pendentes = 0;
        let aprovados = 0;
        let ticketSoma = 0;
        
        const vendasFiltradas = todasVendas.filter(v => {
            if (v.status === 'Pendente') pendentes++; 
            if (v.status !== 'Aprovado') return false;

            const dataVenda = new Date(v.data);
            const diffTime = Math.abs(hoje - dataVenda);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

            if (periodo === 'hoje') return diffDays <= 1;
            if (periodo === '7dias') return diffDays <= 7;
            if (periodo === '30dias') return diffDays <= 30;
            return true;
        });

        vendasFiltradas.forEach(v => {
            const val = parseFloat(v.total) || 0;
            faturamento += val;
            aprovados++;
            ticketSoma += val;
        });

        const ticketMedio = aprovados > 0 ? ticketSoma / aprovados : 0;

        const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
        
        setTxt('dash-faturamento', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(faturamento));
        setTxt('dash-pendentes', pendentes);
        setTxt('dash-vendas-qtd', aprovados);
        setTxt('dash-ticket', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ticketMedio));

        if(dataDash.grafico) renderizarGrafico(dataDash.grafico.labels, dataDash.grafico.valores);

        // --- Alerta de Estoque Baixo (MODIFICADO: Agrupado por Categoria) ---
        const divEstoque = document.getElementById('card-estoque-baixo');
        const listaEstoque = document.getElementById('lista-estoque-baixo');
        
        if (listaEstoque && dataDash.estoqueBaixo) {
            listaEstoque.innerHTML = '';
            
            if (dataDash.estoqueBaixo.length > 0) {
                if(divEstoque) divEstoque.style.display = 'block';

                // 1. Agrupar itens por categoria
                const itensPorCategoria = {};
                
                dataDash.estoqueBaixo.forEach(item => {
                    const cat = item.categoria || 'Geral'; 
                    if (!itensPorCategoria[cat]) {
                        itensPorCategoria[cat] = [];
                    }
                    itensPorCategoria[cat].push(item);
                });

                // 2. Ordenar as Categorias alfabeticamente
                const categoriasOrdenadas = Object.keys(itensPorCategoria).sort((a, b) => a.localeCompare(b));

                // 3. Renderizar
                categoriasOrdenadas.forEach(cat => {
                    // Título da Categoria
                    listaEstoque.innerHTML += `
                        <div style="color:var(--neon-orange, #ff5e00); font-weight:bold; margin: 15px 0 5px 0; border-bottom:1px solid #333; font-size:0.95em; text-transform: uppercase;">
                            ${cat}
                        </div>
                    `;

                    // Ordenar produtos dentro da categoria (Alfabeticamente pelo nome)
                    const produtosOrdenados = itensPorCategoria[cat].sort((a, b) => a.nome.localeCompare(b.nome));

                    produtosOrdenados.forEach(item => {
                        listaEstoque.innerHTML += `
                            <div style="background:rgba(50,0,0,0.5); color:#ffaaaa; padding:8px; margin-bottom:5px; border-left:3px solid red; border-radius:4px; font-size:0.9em; display:flex; justify-content:space-between; align-items:center;">
                                <span><b>${item.nome}</b> <small>(${item.marca})</small></span>
                                <span style="background:#500; padding:2px 6px; border-radius:4px; font-weight:bold;">${item.estoque} un.</span>
                            </div>`;
                    });
                });

            } else {
                listaEstoque.innerHTML = '<p style="color:#00ff88; padding:5px; text-align:center;">Estoque saudável! ✅</p>';
            }
        }

    } catch (error) {
        console.error("Erro dashboard:", error);
    }
}

function renderizarGrafico(labels, valores) {
    const ctxElement = document.getElementById('graficoVendas');
    if(!ctxElement) return;
    
    const ctx = ctxElement.getContext('2d');
    if (chartInstance) chartInstance.destroy();

    const labelsFmt = labels.map(d => d.split('-').slice(1).reverse().join('/'));

    chartInstance = new Chart(ctx, {
        type: 'line', 
        data: {
            labels: labelsFmt,
            datasets: [{
                label: 'Vendas (R$)',
                data: valores,
                borderColor: '#ff5e00',
                backgroundColor: 'rgba(255, 94, 0, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4 
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }, 
            scales: {
                y: { beginAtZero: true, grid: { color: '#222' }, ticks: { color: '#666' } },
                x: { grid: { display: false }, ticks: { color: '#666' } }
            }
        }
    });
}

// ==========================================
// 3. PRODUTOS & VARIAÇÕES (COM BLOCOS VISUAIS)
// ==========================================

window.adicionarLinhaVariacao = function(dados = {}) {
    const container = document.getElementById('container-variacoes');
    if (!container) return; 

    const div = document.createElement('div');
    div.className = 'variacao-row'; 
    div.style.cssText = "background: #1a1a1a; padding: 15px; margin-bottom: 10px; border-radius: 8px; border: 1px solid #333;";
    
    div.innerHTML = `
        <div class="form-group" style="margin-bottom:10px;">
            <label style="font-size:0.8em; color:#888;">Descrição da Opção (Marca/Tamanho)</label>
            <input type="text" placeholder="Ex: Tamanho G, Azul, 110v" class="var-marca" value="${dados.marca || dados.tamanho || ''}" required style="width:100%; padding:10px; background:#000; border:1px solid #444; color:white; border-radius:4px;">
        </div>
        <div style="display:flex; gap:10px;">
            <div style="flex:1;">
                <label style="font-size:0.8em; color:#888;">Preço (R$)</label>
                <input type="number" placeholder="0.00" class="var-preco" value="${dados.preco_venda || dados.preco || ''}" step="0.01" required style="width:100%; padding:10px; background:#000; border:1px solid #444; color:white; border-radius:4px;">
            </div>
            <div style="flex:1;">
                <label style="font-size:0.8em; color:#888;">Estoque (Qtd)</label>
                <input type="number" placeholder="0" class="var-estoque" value="${dados.estoque !== undefined ? dados.estoque : ''}" required style="width:100%; padding:10px; background:#000; border:1px solid #444; color:white; border-radius:4px;">
            </div>
        </div>
        <button type="button" class="btn-remove" onclick="this.parentElement.remove()" style="margin-top:10px; width:100%; border:1px solid #ff4444; background:transparent; color:#ff4444; padding:8px; border-radius:4px; cursor:pointer; font-weight:bold;">
            <i class="fas fa-trash"></i> Remover esta Opção
        </button>
    `;
    container.appendChild(div);
};

async function salvarProduto(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    
    // ATUALIZAÇÃO: Enviar o status de "Em Breve"
    if(document.getElementById('prod-embreve')) {
        formData.set('emBreve', document.getElementById('prod-embreve').checked);
    }
    
    const idEdicao = document.getElementById('id-produto-editando').value;

    const variacoes = [];
    document.querySelectorAll('.variacao-row').forEach(row => {
        variacoes.push({
            marca: row.querySelector('.var-marca').value,
            preco: parseFloat(row.querySelector('.var-preco').value) || 0,
            estoque: parseInt(row.querySelector('.var-estoque').value) || 0
        });
    });

    if (variacoes.length > 0) {
        formData.set('variacoes', JSON.stringify(variacoes));
    } else {
        formData.set('variacoes', '[]');
    }

    // Feedback de carregamento
    const btnSubmit = form.querySelector('button[type="submit"]');
    const txtOriginal = btnSubmit ? btnSubmit.innerText : 'Salvar';
    if(btnSubmit) { btnSubmit.innerText = "Salvando..."; btnSubmit.disabled = true; }

    try {
        let url = `${API_URL}/api/produtos`;
        let method = 'POST';
        if(idEdicao) {
            url += `/${idEdicao}`;
            method = 'PUT';
        }

        const res = await fetch(url, { method, body: formData });
        if(res.ok) {
            Toast.fire({ icon: 'success', title: 'Produto salvo com sucesso!' });
            cancelarEdicao();
            carregarListaAdmin();
        } else {
            const err = await res.json();
            swalDark.fire('Erro!', err.error || err.message, 'error');
        }
    } catch(e) { 
        swalDark.fire('Erro!', 'Falha de conexão.', 'error');
    } finally {
        if(btnSubmit) { btnSubmit.innerText = txtOriginal; btnSubmit.disabled = false; }
    }
}

window.prepararEdicao = function(id) {
    const produto = window.todosProdutos?.find(p => p.id == id || p._id == id);
    if(produto) {
        iniciarEdicao(produto);
        openTab('produtos');
    }
};

function iniciarEdicao(produto) {
    const form = document.getElementById('form-produto');
    if(!form) return;

    document.getElementById('id-produto-editando').value = produto._id || produto.id;
    if(form.nome) form.nome.value = produto.nome;
    if(form.categoria) form.categoria.value = produto.categoria;
    if(form.preco) form.preco.value = produto.preco;

    // ATUALIZAÇÃO: Carregar checkbox "Em Breve"
    if(document.getElementById('prod-embreve')) {
        document.getElementById('prod-embreve').checked = produto.emBreve === true;
    }

    const container = document.getElementById('container-variacoes');
    if(container) {
        container.innerHTML = '';
        if(produto.variacoes && Array.isArray(produto.variacoes) && produto.variacoes.length > 0) {
            produto.variacoes.forEach(v => adicionarLinhaVariacao(v));
        } else {
            adicionarLinhaVariacao(); 
        }
    }

    const btn = form.querySelector('button[type="submit"]');
    if(btn) { btn.innerText = "ATUALIZAR PRODUTO"; btn.style.background = "#9d00ff"; }
    
    const btnCancel = document.getElementById('btn-cancelar');
    if(btnCancel) btnCancel.style.display = 'block';
    
    form.scrollIntoView({ behavior: 'smooth' });
}

window.cancelarEdicao = function() {
    const form = document.getElementById('form-produto');
    if(!form) return;
    form.reset();
    document.getElementById('id-produto-editando').value = '';
    
    // ATUALIZAÇÃO: Resetar checkbox "Em Breve"
    if(document.getElementById('prod-embreve')) {
        document.getElementById('prod-embreve').checked = false;
    }
    
    const container = document.getElementById('container-variacoes');
    if(container) { 
        container.innerHTML = ''; 
        adicionarLinhaVariacao(); 
    }

    const btn = form.querySelector('button[type="submit"]');
    if(btn) { btn.innerText = "SALVAR PRODUTO"; btn.style.background = ""; }
    
    const btnCancel = document.getElementById('btn-cancelar');
    if(btnCancel) btnCancel.style.display = 'none';
};

window.deletarProduto = function(id) {
    swalDark.fire({
        title: 'Tem certeza?',
        text: "Você não poderá reverter isso!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim, excluir!',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await fetch(`${API_URL}/api/produtos/${id}`, { method: 'DELETE' });
                Toast.fire({ icon: 'success', title: 'Produto excluído.' });
                carregarListaAdmin();
                carregarDashboard();
            } catch (e) {
                swalDark.fire('Erro', 'Não foi possível excluir.', 'error');
            }
        }
    });
};

async function carregarListaAdmin() {
    const container = document.getElementById('lista-produtos-admin');
    if(!container) return;
    try {
        const res = await fetch(`${API_URL}/api/produtos`);
        const produtos = await res.json();
        window.todosProdutos = produtos; 

        // Se não tiver produtos
        if (produtos.length === 0) {
            container.innerHTML = '<p style="color:#888; text-align:center; padding:20px;">Nenhum produto cadastrado.</p>';
            return;
        }

        // 1. Agrupar produtos por categoria
        const produtosPorCategoria = {};
        
        produtos.forEach(p => {
            // Se não tiver categoria, define como "Geral"
            const cat = p.categoria && p.categoria.trim() !== "" ? p.categoria : 'Geral'; 
            
            if (!produtosPorCategoria[cat]) {
                produtosPorCategoria[cat] = [];
            }
            produtosPorCategoria[cat].push(p);
        });

        // 2. Ordenar as Categorias (A-Z)
        const categoriasOrdenadas = Object.keys(produtosPorCategoria).sort((a, b) => a.localeCompare(b));

        // 3. Renderizar HTML (COM ACORDEÃO)
        container.innerHTML = '';

        categoriasOrdenadas.forEach((cat, index) => {
            const catId = `cat-group-${index}`; // ID único para o grupo
            const produtosDaCat = produtosPorCategoria[cat].sort((a, b) => a.nome.localeCompare(b.nome));

            // --- CABEÇALHO DA CATEGORIA (CLICÁVEL) ---
            container.innerHTML += `
                <div onclick="toggleCategoria('${catId}')" style="
                    background: #252525; 
                    color: #fff; 
                    padding: 10px 15px; 
                    margin-top: 15px; 
                    border-left: 4px solid #ff5e00; 
                    border-radius: 4px;
                    font-weight: bold;
                    text-transform: uppercase;
                    font-size: 0.95rem;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    cursor: pointer;
                    user-select: none;
                    transition: background 0.2s;
                " onmouseover="this.style.background='#333'" onmouseout="this.style.background='#252525'">
                    <i id="icon-${catId}" class="fas fa-folder" style="transition:0.3s;"></i> 
                    <span>${cat}</span>
                    <span style="margin-left:auto; font-size:0.8em; background:#333; padding:2px 8px; border-radius:10px; color:#aaa;">
                        ${produtosDaCat.length} itens
                    </span>
                    <i class="fas fa-chevron-down" style="font-size:0.8em; color:#666;"></i>
                </div>
            `;

            // --- CONTAINER DOS ITENS (INICIA FECHADO: display: none) ---
            let itensHtml = `<div id="${catId}" style="display: none; animation: fadeIn 0.3s;">`;

            produtosDaCat.forEach(p => {
                itensHtml += `
                    <div style="background:#1a1a1a; padding:10px; margin-bottom:5px; margin-left:15px; border-radius:5px; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center; border-left: 2px solid #444;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${p.imagem || ''}" style="width:40px; height:40px; border-radius:4px; object-fit:cover; background:#333;">
                            <div>
                                <div style="font-weight:bold; color:white;">${p.nome}</div>
                                <div style="font-size:0.8em; color:#888;">
                                    ${p.variacoes ? p.variacoes.length + ' opções' : 'Único'} 
                                    ${p.emBreve ? '<span style="color:#00ccff; margin-left:5px;">(Em Breve)</span>' : ''}
                                </div>
                            </div>
                        </div>
                        <div>
                            <button onclick="prepararEdicao('${p._id || p.id}')" style="background:none; border:1px solid #ffcc00; color:#ffcc00; border-radius:4px; cursor:pointer; margin-right:5px; padding:5px 8px;" title="Editar">✏️</button>
                            <button onclick="deletarProduto('${p._id || p.id}')" style="background:none; border:1px solid #ff4444; color:#ff4444; border-radius:4px; cursor:pointer; padding:5px 8px;" title="Excluir">🗑️</button>
                        </div>
                    </div>
                `;
            });

            itensHtml += `</div>`; // Fecha container dos itens
            container.innerHTML += itensHtml;
        });

    } catch(e) { console.error("Erro lista produtos", e); }
}
// ==========================================
// FUNÇÃO NOVA: ACORDEÃO DE CATEGORIAS
// ==========================================
window.toggleCategoria = function(id) {
    const conteudo = document.getElementById(id);
    const icone = document.getElementById('icon-' + id);
    
    if (conteudo.style.display === 'none') {
        // ABRIR
        conteudo.style.display = 'block';
        if(icone) {
            icone.classList.remove('fa-folder');
            icone.classList.add('fa-folder-open');
            icone.style.color = '#ffcc00'; // Muda cor para amarelo ao abrir
        }
    } else {
        // FECHAR
        conteudo.style.display = 'none';
        if(icone) {
            icone.classList.remove('fa-folder-open');
            icone.classList.add('fa-folder');
            icone.style.color = ''; // Volta a cor original
        }
    }
};

// ==========================================
// 4. VENDAS
// ==========================================
let todasAsVendasCache = []; 

async function carregarVendas() {
    const tbody = document.getElementById('tabela-vendas'); 
    const divLista = document.getElementById('lista-vendas'); 
    
    try {
        const res = await fetch(`${API_URL}/api/vendas`);
        const vendas = await res.json();
        todasAsVendasCache = vendas; // Atualiza o cache global

        const renderRows = (lista) => lista.map(v => {
            const badgeClass = v.status === 'Aprovado' ? 'badge-aprovado' : (v.status === 'Cancelado' ? 'badge-cancelado' : 'badge-pendente');
            const statusColor = v.status === 'Aprovado' ? '#00cc66' : (v.status === 'Pendente' ? '#ffaa00' : '#ff4444');
            
            // Botões de Ação
            let acoes = '';

            // Se for Pendente, mostra Aprovar/Recusar
            if (v.status === 'Pendente') {
                acoes += `
                <button onclick="confirmarVenda('${v._id || v.id_pedido}')" title="Aprovar" style="background:none; border:1px solid #00cc66; color:#00cc66; padding:5px 8px; cursor:pointer; margin-right:5px; border-radius:4px;">✔</button>
                <button onclick="cancelarVenda('${v._id || v.id_pedido}')" title="Recusar" style="background:none; border:1px solid #ff4444; color:#ff4444; padding:5px 8px; cursor:pointer; border-radius:4px; margin-right:5px;">✖</button>
                `;
            }

            // Botão de EXCLUIR (Lixeira) - Aparece para TODOS os pedidos
            acoes += `
                <button onclick="deletarPedido('${v._id || v.id_pedido}')" title="Excluir do Histórico" style="background:none; border:none; color:#666; cursor:pointer; font-size:1.1em; vertical-align:middle;">
                    🗑️
                </button>
            `;

            return `<tr>
                <td style="color:#aaa;">#${String(v.id_pedido || v._id).slice(-4)}</td>
                <td>${v.cliente.nome || v.cliente}</td>
                <td style="color:cyan">${v.representante ? v.representante : '-'}</td>
                <td style="font-weight:bold;">R$ ${parseFloat(v.total).toFixed(2)}</td>
                <td><span class="badge ${badgeClass}" style="padding:2px 6px; border-radius:4px; background:${statusColor}; color:${v.status==='Pendente'?'black':'white'}">${v.status}</span></td>
                <td style="white-space:nowrap;">${acoes}</td>
            </tr>`;
        }).join('');

        if (tbody) tbody.innerHTML = vendas.length ? renderRows(vendas) : '<tr><td colspan="6" style="text-align:center; padding:20px;">Sem pedidos registrados.</td></tr>';
        
    } catch (e) { console.error("Erro vendas", e); }
}

// --- FUNÇÃO ADICIONADA: APROVAR VENDA ---
window.confirmarVenda = function(id) {
    swalDark.fire({
        title: 'Aprovar Pedido?',
        text: "Isso confirmará o pagamento e baixará o estoque.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sim, aprovar',
        confirmButtonColor: '#00cc66',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const res = await fetch(`${API_URL}/api/venda/${id}/confirmar`, { method: 'POST' });
                const data = await res.json();
                
                if (res.ok) {
                    Toast.fire({ icon: 'success', title: 'Pedido Aprovado!' });
                    carregarVendas();     // Atualiza a tabela
                    carregarDashboard();  // Atualiza os números
                } else {
                    swalDark.fire('Erro', data.message || 'Erro ao aprovar.', 'error');
                }
            } catch (e) {
                swalDark.fire('Erro', 'Erro de conexão.', 'error');
            }
        }
    });
};

// --- NOVA FUNÇÃO PARA EXCLUIR MANUALMENTE ---
window.deletarPedido = function(id) {
    swalDark.fire({
        title: 'Tem certeza?',
        text: "Isso removerá este pedido do histórico permanentemente.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim, apagar',
        confirmButtonColor: '#d33',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const res = await fetch(`${API_URL}/api/venda/${id}`, { method: 'DELETE' });
                const data = await res.json();
                
                if (data.success) {
                    Toast.fire({ icon: 'success', title: 'Pedido removido.' });
                    carregarVendas();
                    carregarDashboard();
                } else {
                    swalDark.fire('Erro', 'Não foi possível excluir.', 'error');
                }
            } catch (e) {
                swalDark.fire('Erro', 'Erro de conexão.', 'error');
            }
        }
    });
};

window.cancelarVenda = function(id) {
    swalDark.fire({
        title: 'Recusar e Excluir?',
        text: "Este pedido será APAGADO permanentemente do banco de dados.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim, excluir',
        confirmButtonColor: '#ff4444',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const res = await fetch(`${API_URL}/api/venda/${id}/cancelar`, { method: 'POST' });
                
                if (res.ok) {
                    Toast.fire({ icon: 'success', title: 'Pedido excluído!' });
                    carregarVendas(); // Recarrega a lista para sumir com o pedido
                    carregarDashboard(); // Atualiza os números do dashboard
                } else {
                    swalDark.fire('Erro', 'Não foi possível excluir.', 'error');
                }
            } catch (e) {
                swalDark.fire('Erro', 'Erro de conexão.', 'error');
            }
        }
    });
};

// NOVA FUNÇÃO: ZERAR HISTÓRICO DE PEDIDOS
window.limparHistoricoPedidos = function() {
    swalDark.fire({
        title: 'CUIDADO! ⚠️',
        text: "Isso apagará TODOS os pedidos do histórico para sempre. Tem certeza?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim, APAGAR TUDO',
        confirmButtonColor: '#d33',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const res = await fetch(`${API_URL}/api/vendas/limpar`, { method: 'DELETE' });
                const data = await res.json();
                
                if (data.success) {
                    Toast.fire({ icon: 'success', title: 'Histórico limpo!' });
                    carregarVendas();
                    carregarDashboard();
                } else {
                    swalDark.fire('Erro', 'Não foi possível limpar.', 'error');
                }
            } catch (e) {
                swalDark.fire('Erro', 'Erro de conexão.', 'error');
            }
        }
    });
};

window.filtrarPedidos = function(filtro) {
    const tbody = document.getElementById('tabela-vendas');
    const divLista = document.getElementById('lista-vendas');
    
    let filtradas = todasAsVendasCache;
    if (filtro !== 'todos') {
        filtradas = todasAsVendasCache.filter(v => v.status === filtro);
    }

    const renderRows = (lista) => lista.map(v => {
        const badgeClass = v.status === 'Aprovado' ? 'badge-aprovado' : (v.status === 'Cancelado' ? 'badge-cancelado' : 'badge-pendente');
        const statusColor = v.status === 'Aprovado' ? '#00cc66' : (v.status === 'Pendente' ? '#ffaa00' : '#ff4444');
        return `<tr>
            <td>#${String(v.id_pedido || v._id).slice(-4)}</td>
            <td>${v.cliente.nome || v.cliente}</td>
            <td>${v.representante || '-'}</td>
            <td>R$ ${parseFloat(v.total).toFixed(2)}</td>
            <td><span style="background:${statusColor}; padding:2px 6px; border-radius:4px; color:${v.status==='Pendente'?'black':'white'}">${v.status}</span></td>
            <td>-</td>
        </tr>`;
    }).join('');

    if (tbody) {
        tbody.innerHTML = filtradas.length ? renderRows(filtradas) : '<tr><td colspan="6">Vazio</td></tr>';
    } else if (divLista) {
        divLista.innerHTML = filtradas.length ? filtradas.map(v => renderVendaCard(v)).join('') : 'Vazio';
    }
};

// ==========================================
// 5. REVENDEDORES
// ==========================================
async function carregarRevendedores() {
    const tbody = document.getElementById('tabela-revendedores');
    if (!tbody) return;

    try {
        const res = await fetch(`${API_URL}/api/revendedores`);
        const reps = await res.json();
        
        tbody.innerHTML = reps.map(r => {
            const isAtivo = r.ativo !== false; 
            const btnCor = isAtivo ? 'red' : 'green';
            const btnTexto = isAtivo ? 'Bloquear' : 'Desbloquear';
            const btnOpacity = isAtivo ? '0.5' : '1';

            return `
            <tr>
                <td style="color:white;">
                    ${r.nome} 
                    ${!isAtivo ? '<span style="color:red; font-size:0.8em; margin-left:5px;">(BLOQUEADO)</span>' : ''}
                </td>
                <td>
                    <span style="background:#222; color:#00ff88; padding:2px 5px; font-family:monospace; border-radius:3px;">?ref=${r.slug}</span>
                    <button onclick="copiarLink('${r.slug}')" style="border:none; background:none; cursor:pointer; font-size:1.2em; color:cyan; margin-left:5px;">📋</button>
                </td>
                <td style="color:#aaa;">${r.whatsapp || '-'}</td>
                <td style="display:flex; gap: 5px; align-items: center;">
                    <button onclick="toggleRevendedor('${r._id}')" style="color:${btnCor}; background:none; border:1px solid ${btnCor}; padding:5px 10px; border-radius:4px; cursor:pointer; opacity:${btnOpacity}; font-weight:bold;">
                        ${btnTexto}
                    </button>
                    <button onclick="deletarRevendedor('${r._id}')" style="background:none; border:1px solid #ff4444; color:#ff4444; padding:5px 10px; border-radius:4px; cursor:pointer;" title="Excluir Permanentemente">
                        🗑️
                    </button>
                </td>
            </tr>
        `}).join('');
    } catch (e) { console.error("Erro reps", e); }
}

window.toggleRevendedor = function(id) {
    swalDark.fire({
        title: 'Alterar Status?',
        text: "Deseja bloquear/desbloquear este revendedor?",
        icon: 'question',
        showCancelButton: true
    }).then(async (result) => {
        if(result.isConfirmed) {
            try {
                const res = await fetch(`${API_URL}/api/revendedores/${id}/toggle`, { method: 'POST' });
                const data = await res.json();
                if(data.success) {
                    Toast.fire({ icon: 'success', title: 'Status atualizado!' });
                    carregarRevendedores();
                } else {
                    swalDark.fire('Erro', data.error, 'error');
                }
            } catch(e) { swalDark.fire('Erro', 'Conexão falhou', 'error'); }
        }
    });
};

window.deletarRevendedor = function(id) {
    swalDark.fire({
        title: 'Tem certeza?',
        text: "Isso removerá o revendedor e o link dele deixará de funcionar.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim, excluir',
        confirmButtonColor: '#d33'
    }).then(async (result) => {
        if(result.isConfirmed) {
            try {
                const res = await fetch(`${API_URL}/api/revendedores/${id}`, { method: 'DELETE' });
                const data = await res.json();
                
                if(res.ok && data.success) {
                    Toast.fire({ icon: 'success', title: 'Revendedor excluído.' });
                    carregarRevendedores();
                } else {
                    swalDark.fire('Erro', data.error, 'error');
                }
            } catch(e) { swalDark.fire('Erro', 'Conexão falhou', 'error'); }
        }
    });
};

async function salvarRevendedor(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    try {
        const res = await fetch(`${API_URL}/api/revendedores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        
        if(result.success) {
            swalDark.fire({
                title: 'Sucesso!',
                text: 'Revendedor cadastrado.',
                icon: 'success'
            });
            e.target.reset();
            carregarRevendedores();
        } else {
            swalDark.fire('Ops!', result.error || 'Erro ao criar', 'error');
        }
    } catch(err) { swalDark.fire('Erro', 'Conexão falhou', 'error'); }
}

window.copiarLink = function(slug) {
    const url = `${window.location.origin}/?ref=${slug}`;
    navigator.clipboard.writeText(url).then(() => {
        Toast.fire({ icon: 'success', title: 'Link copiado!' });
    });
};

// ==========================================
// 6. CONFIGURAÇÕES & CUPONS
// ==========================================
async function carregarConfiguracoesNoForm() {
    try {
        const res = await fetch(`${API_URL}/api/config`);
        const conf = await res.json();
        
        if(document.getElementById('config-nome')) document.getElementById('config-nome').value = conf.nomeLoja || '';
        if(document.getElementById('config-cor')) document.getElementById('config-cor').value = conf.corDestaque || '#ff6600';
        if(document.getElementById('social-zap-pedidos')) document.getElementById('social-zap-pedidos').value = conf.whatsapp || '';
        
        // NOVO: Carrega o link do Instagram
        if(document.getElementById('social-insta')) document.getElementById('social-insta').value = conf.instagramLink || '';
        
        carregarCupons();
    } catch(e) {}
}

async function salvarConfigGeneric(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const originalText = btn ? btn.innerText : 'Salvar';
    if(btn) { btn.innerText = "Salvando..."; btn.disabled = true; }

    try {
        await fetch(`${API_URL}/api/config`, { method: 'POST', body: new FormData(e.target) });
        Toast.fire({ icon: 'success', title: 'Configurações salvas!' });
    } catch (error) {
        swalDark.fire('Erro', 'Não foi possível salvar', 'error');
    } finally {
        if(btn) { btn.innerText = originalText; btn.disabled = false; }
    }
}

async function carregarCupons() {
    const div = document.getElementById('lista-cupons');
    if(!div) return;
    try {
        const res = await fetch(`${API_URL}/api/cupons`);
        const lista = await res.json();
        div.innerHTML = lista.map(c => `
            <div style="background:#1a1a1a; padding:10px; margin-bottom:5px; border-radius:4px; display:flex; justify-content:space-between; border:1px solid #333;">
                <span style="color:white;"><b>${c.codigo}</b> (${c.desconto}%)</span>
                <button onclick="deletarCupom('${c.codigo}')" style="color:red; background:none; border:none; cursor:pointer;">🗑️</button>
            </div>
        `).join('');
    } catch(e){}
}

async function salvarCupom(e) {
    e.preventDefault();
    const codigo = document.getElementById('cupom-codigo').value;
    const desconto = document.getElementById('cupom-valor').value;
    
    await fetch(`${API_URL}/api/cupons`, { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify({ codigo, desconto }) 
    });
    Toast.fire({ icon: 'success', title: 'Cupom criado!' });
    carregarCupons();
    e.target.reset();
}

window.deletarCupom = function(cod) {
    swalDark.fire({
        title: 'Excluir Cupom?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim, excluir'
    }).then(async (result) => {
        if(result.isConfirmed) {
            await fetch(`${API_URL}/api/cupons/${cod}`, { method: 'DELETE' });
            Toast.fire({ icon: 'success', title: 'Cupom removido.' });
            carregarCupons();
        }
    });
};