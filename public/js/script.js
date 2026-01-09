/* --- VARIÁVEIS GLOBAIS --- */
let produtosGlobais = [];
let carrinho = [];
let produtoSelecionado = null;
let variacaoSelecionada = null;
let descontoAtual = 0;
let categoriaAtual = 'todos'; 
let configLoja = {}; 

/* --- UTILITÁRIOS (Formatação de Dinheiro) --- */
const formatarMoeda = (valor) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
};

/* --- INICIALIZAÇÃO (Ao carregar a página) --- */
document.addEventListener('DOMContentLoaded', () => {
    carregarTema();      // 1. Aplica as cores, imagens e LINKS
    carregarProdutos();  // 2. Busca e exibe os produtos
    carregarCarrinhoLocal();
    atualizarContador();
    verificarRevendedor(); // 3. NOVA FUNÇÃO: Checa se tem revendedor na URL
    
    // Configura a busca dinâmica
    const buscaInput = document.getElementById('campo-busca') || document.getElementById('searchInput'); // Suporta ambos os nomes
    if(buscaInput) {
        buscaInput.addEventListener('input', filtrarProdutos);
    }
});

/* --- SISTEMA DE REVENDEDORES (CORRIGIDO E SIMPLIFICADO) --- */
function verificarRevendedor() {
    // 🛡️ MUDANÇA: Captura imediata. Se tem ref na URL, salva no navegador.
    // Isso garante que o revendedor seja pego mesmo se a internet oscilar.
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref'); 

    if (ref) {
        localStorage.setItem('catalogo_ref', ref);
        console.log(`Revendedor capturado: ${ref}`);
        
        // (Opcional) Limpa a URL para ficar mais bonita, mas mantendo o ref salvo
        // window.history.replaceState({}, document.title, "/");
    }
}

/* --- SISTEMA DE TEMAS E CONFIGURAÇÕES --- */
async function carregarTema() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error('Falha ao carregar config');
        
        const tema = await response.json();
        configLoja = tema; 

        // 1. Aplica a Cor Neon
        if (tema.corDestaque) {
            document.documentElement.style.setProperty('--neon-orange', tema.corDestaque);
        }

        // 2. Aplica o Fundo do Site
        if (tema.fundoSite) {
            document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.92), rgba(0,0,0,0.98)), url('../uploads/${tema.fundoSite}')`;
        }

        // 3. Aplica o Fundo do Header
        if (tema.fundoHeader) {
            const header = document.querySelector('header');
            if (header) {
                header.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url('../uploads/${tema.fundoHeader}')`;
            }
        }

        // 4. Atualiza o Título
        if (tema.nomeLoja) {
            const titulo = document.querySelector('header h1');
            if (titulo) titulo.innerText = tema.nomeLoja;
            document.title = tema.nomeLoja + " | Loja Oficial";
        }

        // 5. Atualiza Redes Sociais
        if (tema.instagramLink) {
            const btnInsta = document.getElementById('link-insta');
            if(btnInsta) btnInsta.href = tema.instagramLink;
        }

        // Configura o botão flutuante do WhatsApp
        const btnWhats = document.getElementById('link-whats-float');
        if (btnWhats) {
            const numeroFloat = tema.whatsappFlutuante || tema.whatsapp || tema.whatsappPedidos;
            if (numeroFloat) {
                const numLimpo = numeroFloat.replace(/\D/g, ''); 
                btnWhats.href = `https://wa.me/${numLimpo}?text=Olá, vim pelo site e tenho uma dúvida.`;
            }
        }

    } catch (error) {
        console.log("Usando configurações padrão (Erro ao carregar tema):", error);
    }
}

/* --- MENU LATERAL (HAMBÚRGUER) --- */
function toggleMenu() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.menu-overlay');
    
    if(sidebar && overlay) {
        sidebar.classList.toggle('aberto');
        overlay.classList.toggle('aberto');
    }
}

/* --- LÓGICA DE PRODUTOS --- */
async function carregarProdutos() {
    try {
        const res = await fetch('/api/produtos');
        produtosGlobais = await res.json();
        
        renderizarCategorias(); 
        filtrarProdutos();      
    } catch (erro) {
        console.error("Erro ao carregar:", erro);
        const lista = document.getElementById('lista-produtos') || document.getElementById('product-list');
        if(lista) lista.innerHTML = '<p style="color:white; text-align:center; padding: 20px;">Erro ao carregar loja. Verifique a conexão.</p>';
    }
}

function renderizarCategorias() {
    const container = document.getElementById('menu-categorias');
    if(!container) return;

    const categorias = ['todos', ...new Set(produtosGlobais.map(p => p.categoria).filter(c => c))];

    container.innerHTML = '';

    categorias.forEach(cat => {
        const btn = document.createElement('button');
        btn.innerText = cat === 'todos' ? '🔥 VER TUDO' : '👉 ' + cat.toUpperCase();
        btn.className = cat === categoriaAtual ? 'btn-categoria ativo' : 'btn-categoria';
        
        btn.onclick = () => {
            categoriaAtual = cat;
            renderizarCategorias(); 
            toggleMenu();           
            filtrarProdutos();      
        };
        
        container.appendChild(btn);
    });
}

function filtrarProdutos() {
    const buscaInput = document.getElementById('campo-busca') || document.getElementById('searchInput');
    const termo = buscaInput ? buscaInput.value.toLowerCase() : '';

    const container = document.getElementById('lista-produtos') || document.getElementById('product-list');
    if (!container) return;
    
    container.innerHTML = '';

    const filtrados = produtosGlobais.filter(produto => {
        const matchCategoria = categoriaAtual === 'todos' || produto.categoria === categoriaAtual;
        const matchNome = produto.nome.toLowerCase().includes(termo);
        const isAtivo = produto.ativo !== false; 
        return matchCategoria && matchNome && isAtivo;
    });

    if (filtrados.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding:20px; color:#888;">Nenhum produto encontrado.</p>';
        return;
    }

    filtrados.forEach(p => {
        // Lógica de preço: pega o menor da variação ou o preço base
        let menorPreco = 0;
        if (p.variacoes && p.variacoes.length > 0) {
            const precos = p.variacoes.map(v => v.preco_venda || v.preco); // Suporta 'preco_venda' ou 'preco'
            menorPreco = Math.min(...precos);
        } else {
            menorPreco = p.preco || 0;
        }

        const imgUrl = p.imagem ? p.imagem : 'https://via.placeholder.com/150';

        const div = document.createElement('div');
        div.className = 'card product-card'; // Adicionado classes extras para compatibilidade CSS
        div.onclick = (e) => { if(e.target.tagName !== 'BUTTON') abrirModal(p.id); };
        
        div.innerHTML = `
            <img src="${imgUrl}" alt="${p.nome}" loading="lazy">
            <div class="card-info">
                <h3>${p.nome}</h3>
                <div class="preco">${formatarMoeda(menorPreco)}</div>
                <button onclick="abrirModal('${p._id || p.id}')">COMPRAR</button>
            </div>
        `;
        container.appendChild(div);
    });
}

/* --- MODAL DE DETALHES --- */
function abrirModal(id) {
    // Tenta encontrar pelo ID numérico ou String (Mongo ID)
    produtoSelecionado = produtosGlobais.find(p => p.id == id || p._id == id);
    if(!produtoSelecionado) return;

    document.getElementById('modal-titulo').innerText = produtoSelecionado.nome;
    document.getElementById('modal-img').src = produtoSelecionado.imagem || 'https://via.placeholder.com/150';
    document.getElementById('modal-qtd').value = 1;
    
    // Ordena variações
    const variacoesOrdenadas = produtoSelecionado.variacoes ? [...produtoSelecionado.variacoes].sort((a, b) => {
        const marcaA = a.marca || a.tamanho || '';
        const marcaB = b.marca || b.tamanho || '';
        return marcaA.localeCompare(marcaB);
    }) : [];

    const lista = document.getElementById('modal-opcoes');
    lista.innerHTML = '';
    
    if (variacoesOrdenadas.length === 0) {
        // Caso produto simples sem variação
        variacaoSelecionada = { 
            marca: 'Único', 
            preco_venda: produtoSelecionado.preco || 0, 
            estoque: produtoSelecionado.estoque || 999 
        };
        lista.innerHTML = '<p style="color:#ccc">Produto único</p>';
        document.getElementById('modal-preco').innerText = formatarMoeda(produtoSelecionado.preco || 0);
    } else {
        // Com variações
        selVar(variacoesOrdenadas[0], 0);

        variacoesOrdenadas.forEach((v, idx) => {
            const div = document.createElement('div');
            div.className = 'opcao-item';
            div.id = `var-btn-${idx}`;
            
            const estoque = v.estoque !== undefined ? v.estoque : 99;
            const semEstoque = estoque <= 0;
            const preco = v.preco_venda || v.preco || 0;
            const nomeVar = v.marca || v.tamanho || 'Padrão';
            
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <strong>${nomeVar}</strong>
                    <span>${formatarMoeda(preco)}</span>
                </div>
                ${semEstoque ? '<small style="color:red; font-size:0.7em">(Esgotado)</small>' : ''}
            `;

            if (!semEstoque) {
                div.onclick = () => selVar(v, idx);
            } else {
                div.style.opacity = '0.5';
                div.style.cursor = 'not-allowed';
            }
            
            lista.appendChild(div);
        });
    }

    const modal = document.getElementById('modal-produto');
    if(modal) modal.style.display = 'flex';
}

function selVar(variacao, idx) {
    variacaoSelecionada = variacao;
    const preco = variacao.preco_venda || variacao.preco || 0;
    document.getElementById('modal-preco').innerText = formatarMoeda(preco);
    
    const todos = document.querySelectorAll('.opcao-item');
    todos.forEach(el => { 
        el.style.borderColor = '#333'; 
        el.style.color = '#ccc'; 
        el.style.background = '#1a1a1a';
    });
    
    const atual = document.getElementById(`var-btn-${idx}`);
    if(atual) {
        atual.style.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--neon-orange') || '#ff6600';
        atual.style.color = 'white';
        atual.style.background = '#333';
    }
}

function adicionarAoCarrinhoModal() {
    if(!variacaoSelecionada) return alert("Selecione uma opção!");
    
    const qtd = parseInt(document.getElementById('modal-qtd').value) || 1;
    const estoque = variacaoSelecionada.estoque !== undefined ? variacaoSelecionada.estoque : 999;

    if(qtd > estoque) {
        return alert(`Apenas ${estoque} unidades disponíveis!`);
    }

    const preco = variacaoSelecionada.preco_venda || variacaoSelecionada.preco || 0;
    const nomeVar = variacaoSelecionada.marca || variacaoSelecionada.tamanho || 'Único';

    // Verifica se já existe no carrinho para somar
    const existente = carrinho.find(item => item.produto === produtoSelecionado.nome && item.marca === nomeVar);

    if(existente) {
        if(existente.qtd + qtd > estoque) {
            return alert("Estoque limite atingido no carrinho.");
        }
        existente.qtd += qtd;
        existente.total = existente.qtd * existente.preco;
    } else {
        carrinho.push({
            produto: produtoSelecionado.nome,
            marca: nomeVar,
            preco: preco,
            qtd: qtd,
            total: preco * qtd
        });
    }

    salvarCarrinho();
    atualizarContador();
    fecharModal('modal-produto');
    
    const btn = document.querySelector('.botao-flutuante');
    if(btn) { 
        btn.style.transform = 'scale(1.2)'; 
        setTimeout(()=> btn.style.transform='scale(1)', 200);
    }
}

/* --- CARRINHO E CHECKOUT --- */
function abrirCarrinho() {
    const lista = document.getElementById('itens-carrinho');
    lista.innerHTML = '';
    let total = 0;

    if(carrinho.length === 0) {
        lista.innerHTML = '<p style="text-align:center; color:#888; margin-top:20px;">Seu carrinho está vazio.</p>';
    }

    carrinho.forEach((item, idx) => {
        total += item.preco * item.qtd;
        item.total = item.preco * item.qtd;
        
        lista.innerHTML += `
            <div class="item-carrinho" style="border-bottom:1px solid #333; padding:10px; color:white;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${item.qtd}x ${item.produto}</strong><br>
                        <small style="color:#ccc;">${item.marca}</small>
                    </div>
                    <div style="text-align:right;">
                        <span style="color:var(--neon-orange); font-weight:bold;">${formatarMoeda(item.total)}</span><br>
                        <button onclick="rmItem(${idx})" style="color:#ff4444; background:none; border:none; cursor:pointer; font-size:0.8em; margin-top:5px;">Excluir</button>
                    </div>
                </div>
            </div>`;
    });

    let totalFinal = total;
    let htmlTotal = `Total: ${formatarMoeda(total)}`;

    if(descontoAtual > 0) {
        totalFinal = total * (1 - descontoAtual/100);
        htmlTotal = `
            <span style="text-decoration: line-through; font-size: 0.8em; color: #999;">${formatarMoeda(total)}</span><br>
            <span style="color:#00ff88; font-size:1.2em; font-weight:bold;">${formatarMoeda(totalFinal)}</span> 
            <small style="color:#00ff88">(${descontoAtual}% OFF)</small>
        `;
    }

    document.getElementById('total-carrinho').innerHTML = htmlTotal;
    document.getElementById('modal-carrinho').style.display = 'flex';
}

function rmItem(idx) {
    carrinho.splice(idx, 1);
    salvarCarrinho();
    atualizarContador();
    abrirCarrinho();
}

async function aplicarCupom() {
    const codInput = document.getElementById('cupom-codigo');
    const cod = codInput ? codInput.value.trim() : '';
    
    if(!cod) return alert("Digite um código de cupom.");

    try {
        const res = await fetch(`/api/cupom/${cod}`);
        const data = await res.json();

        if(data.valido) {
            descontoAtual = data.desconto;
            alert(`Sucesso! Desconto de ${data.desconto}% aplicado.`);
            abrirCarrinho();
        } else {
            descontoAtual = 0;
            alert("Cupom inválido ou expirado.");
            abrirCarrinho();
        }
    } catch(e) { 
        console.error(e);
        alert("Erro ao validar cupom.");
    }
}

/* --- FINALIZAR COMPRA (ATUALIZADO COM REVENDEDOR) --- */
async function finalizarCompra() {
    if(carrinho.length === 0) return alert("Seu carrinho está vazio!");
    
    const nomeInput = document.getElementById('nome-cliente');
    const nome = nomeInput ? nomeInput.value.trim() : '';
    
    if(!nome) {
        alert("Por favor, digite seu nome para identificarmos o pedido.");
        if(nomeInput) nomeInput.focus();
        return;
    }

    // Cálculos
    let totalBruto = carrinho.reduce((acc, item) => acc + (item.preco * item.qtd), 0);
    let totalFinal = totalBruto * (1 - descontoAtual/100);

    // Recupera Revendedor Salvo (Se houver)
    const representante = localStorage.getItem('catalogo_ref');

    // Preparar dados para o Servidor (Conforme novo Schema)
    const pedidoParaSalvar = {
        cliente: { nome: nome }, // Ajustado para bater com o Schema
        produtos: carrinho, 
        total: totalFinal,
        representante: representante, // <--- CAMPO NOVO IMPORTANTE
        data: new Date().toISOString()
    };

    try {
        // 1. Envia para o servidor e ESPERA a resposta
        const response = await fetch('/api/vendas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pedidoParaSalvar)
        });

        const resultado = await response.json();

        if (resultado.success || resultado.message) {
            // 2. Se salvou, monta a mensagem do WhatsApp
            let msg = `*NOVO PEDIDO - ${configLoja.nomeLoja || 'LOJA'}* 🛒\n\n`;
            msg += `*Cliente:* ${nome}\n`;
            if(resultado.id || resultado.pedidoId) msg += `*Pedido #:* ${resultado.id || resultado.pedidoId}\n`;
            msg += `------------------------------\n`;
            
            carrinho.forEach(item => {
                msg += `📦 ${item.qtd}x ${item.produto}\n`;
                msg += `   Opção: ${item.marca}\n`;
                msg += `   Valor: ${formatarMoeda(item.preco * item.qtd)}\n`;
            });
            
            msg += `------------------------------\n`;

            if(descontoAtual > 0) {
                msg += `Subtotal: ${formatarMoeda(totalBruto)}\n`;
                msg += `Desconto: -${descontoAtual}%\n`;
                msg += `*TOTAL: ${formatarMoeda(totalFinal)}* ✅\n\n`;
            } else {
                msg += `*TOTAL: ${formatarMoeda(totalBruto)}* ✅\n\n`;
            }
            
            if (representante) {
                msg += `(Venda via representante: ${representante})\n`;
            }

            msg += `Aguardo instruções de pagamento!`;

            // --- LÓGICA DE TELEFONE (REVENDEDOR OU LOJA) ---
            let telefoneDestino = configLoja.whatsapp || configLoja.whatsappPedidos || "5511999999999";

            // Se tiver um representante, tenta buscar o zap dele
            if (representante) {
                try {
                    const resRep = await fetch(`/api/revendedor/${representante}`);
                    const dadosRep = await resRep.json();
                    
                    if (dadosRep.valido && dadosRep.whatsapp) {
                        telefoneDestino = dadosRep.whatsapp;
                        // console.log("Direcionando para Revendedor:", dadosRep.nome);
                    }
                } catch (e) {
                    console.log("Erro ao buscar zap do revendedor, usando da loja.");
                }
            }

            const tel = telefoneDestino.replace(/\D/g, '');
            // -----------------------------------------------

            // Limpa Carrinho
            carrinho = [];
            descontoAtual = 0;
            salvarCarrinho();
            atualizarContador();
            fecharModal('modal-carrinho');
            if(nomeInput) nomeInput.value = '';

            // Redireciona para o WhatsApp
            window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
        } else {
            alert("Erro ao salvar pedido no sistema. Tente novamente.");
        }

    } catch (erro) {
        console.error(erro);
        alert("Erro de conexão. Verifique sua internet.");
    }
}

/* --- FUNÇÕES AUXILIARES --- */
function fecharModal(id) { 
    const el = document.getElementById(id);
    if(el) el.style.display = 'none'; 
}

function salvarCarrinho() { 
    localStorage.setItem('carrinho_tropa', JSON.stringify(carrinho)); 
}

function carregarCarrinhoLocal() { 
    const d = localStorage.getItem('carrinho_tropa'); 
    if(d) carrinho = JSON.parse(d); 
}

function atualizarContador() { 
    const contador = document.getElementById('contador-carrinho');
    const qtdTotal = carrinho.reduce((acc, item) => acc + item.qtd, 0);
    if(contador) contador.innerText = qtdTotal; 
}

// Fecha modal ao clicar fora
window.onclick = function(event) {
    const modals = ['modal-produto', 'modal-carrinho'];
    modals.forEach(id => {
        const modal = document.getElementById(id);
        if (event.target == modal) {
            modal.style.display = "none";
        }
    });
}