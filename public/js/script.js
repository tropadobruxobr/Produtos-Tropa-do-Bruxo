/* --- VARIÁVEIS GLOBAIS --- */
let produtosGlobais = [];
let carrinho = [];
let produtoSelecionado = null;
let variacaoSelecionada = null;
let descontoAtual = 0;
let categoriaAtual = 'todos'; 
let configLoja = {}; 

/* --- INJEÇÃO DE ESTILOS (PARA ORGANIZAÇÃO POR SEÇÃO) --- */
const styleSecoes = document.createElement('style');
styleSecoes.innerHTML = `
    .titulo-secao {
        width: 100%;
        color: var(--neon-orange);
        font-family: 'Russo One', sans-serif;
        font-size: 1.4rem;
        margin: 40px 0 15px 0;
        border-bottom: 2px solid #333;
        padding-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
    .sub-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        width: 100%;
        margin-bottom: 10px;
    }
    @media (min-width: 768px) {
        .sub-grid { grid-template-columns: repeat(5, 1fr); gap: 20px; }
    }
`;
document.head.appendChild(styleSecoes);

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
    verificarRevendedor(); // 3. Checa se tem revendedor na URL
    
    // Configura a busca dinâmica
    const buscaInput = document.getElementById('campo-busca') || document.getElementById('searchInput'); 
    if(buscaInput) {
        buscaInput.addEventListener('input', filtrarProdutos);
    }
});

/* --- SISTEMA DE REVENDEDORES --- */
function verificarRevendedor() {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref'); 

    if (ref) {
        localStorage.setItem('catalogo_ref', ref);
        console.log(`Revendedor capturado: ${ref}`);
    }
}

/* --- SISTEMA DE TEMAS E CONFIGURAÇÕES --- */
async function carregarTema() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error('Falha ao carregar config');
        
        const tema = await response.json();
        configLoja = tema; 

        if (tema.corDestaque) document.documentElement.style.setProperty('--neon-orange', tema.corDestaque);
        if (tema.fundoSite) document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.92), rgba(0,0,0,0.98)), url('../uploads/${tema.fundoSite}')`;
        if (tema.fundoHeader) {
            const header = document.querySelector('header');
            if (header) header.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url('../uploads/${tema.fundoHeader}')`;
        }
        if (tema.nomeLoja) {
            const titulo = document.querySelector('header h1');
            if (titulo) titulo.innerText = tema.nomeLoja;
            document.title = tema.nomeLoja + " | Loja Oficial";
        }
        if (tema.instagramLink) {
            const btnInsta = document.getElementById('link-insta');
            if(btnInsta) btnInsta.href = tema.instagramLink;
        }

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
        
        // Ordena produtos de A-Z (Geral)
        produtosGlobais.sort((a, b) => a.nome.localeCompare(b.nome));

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

    // Extrai categorias únicas e ordena A-Z
    const categoriasUnicas = [...new Set(produtosGlobais.map(p => p.categoria).filter(c => c))];
    categoriasUnicas.sort((a, b) => a.localeCompare(b));

    const categorias = ['todos', ...categoriasUnicas];

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

// 🔥 FUNÇÃO PRINCIPAL: CRIA SEÇÕES
function filtrarProdutos() {
    const buscaInput = document.getElementById('campo-busca') || document.getElementById('searchInput');
    const termo = buscaInput ? buscaInput.value.toLowerCase() : '';

    const container = document.getElementById('lista-produtos') || document.getElementById('product-list');
    if (!container) return;
    
    container.innerHTML = '';

    // 1. Filtro global (Busca + Ativo)
    let produtosFiltrados = produtosGlobais.filter(produto => {
        const matchNome = produto.nome.toLowerCase().includes(termo);
        const isAtivo = produto.ativo !== false; 
        return matchNome && isAtivo;
    });

    if (produtosFiltrados.length === 0) {
        container.style.display = 'block';
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">Nenhum produto encontrado.</p>';
        return;
    }

    // 2. LÓGICA DE EXIBIÇÃO
    if (categoriaAtual === 'todos') {
        // --- MODO SEÇÕES (CATEGORIAS SEPARADAS) ---
        container.style.display = 'block'; // Permite empilhar os blocos

        // Pega categorias presentes nos produtos filtrados
        const categoriasPresentes = [...new Set(produtosFiltrados.map(p => p.categoria).filter(c => c))];
        
        // Ordena Categorias A-Z
        categoriasPresentes.sort((a, b) => a.localeCompare(b));

        // Para cada categoria, cria um bloco
        categoriasPresentes.forEach(cat => {
            // Filtra produtos dessa categoria e ordena A-Z
            const produtosDaCategoria = produtosFiltrados.filter(p => p.categoria === cat);
            produtosDaCategoria.sort((a, b) => a.nome.localeCompare(b.nome));

            if (produtosDaCategoria.length > 0) {
                // Título da Seção
                const titulo = document.createElement('h2');
                titulo.className = 'titulo-secao';
                titulo.innerText = cat;
                container.appendChild(titulo);

                // Grid da Seção (Usa a classe injetada lá em cima)
                const gridDiv = document.createElement('div');
                gridDiv.className = 'sub-grid';
                
                // Renderiza os cards dentro do grid da seção
                produtosDaCategoria.forEach(p => {
                    const card = criarCardProduto(p);
                    gridDiv.appendChild(card);
                });

                container.appendChild(gridDiv);
            }
        });

    } else {
        // --- MODO CATEGORIA ÚNICA (PADRÃO) ---
        container.style.display = 'grid'; // Volta ao Grid original do CSS
        
        const produtosDaCategoria = produtosFiltrados.filter(p => p.categoria === categoriaAtual);
        produtosDaCategoria.sort((a, b) => a.nome.localeCompare(b.nome));

        if (produtosDaCategoria.length === 0) {
            container.style.display = 'block';
            container.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">Nenhum produto nesta categoria.</p>';
            return;
        }

        produtosDaCategoria.forEach(p => {
            const card = criarCardProduto(p);
            container.appendChild(card);
        });
    }
}

// Helper para criar o card (Evita repetir código)
function criarCardProduto(p) {
    let menorPreco = 0;
    let estoqueTotal = 0; // Variável para controlar o estoque
    let temVariacoes = p.variacoes && p.variacoes.length > 0;

    if (temVariacoes) {
        // Pega o menor preço das variações
        const precos = p.variacoes.map(v => v.preco_venda || v.preco); 
        menorPreco = Math.min(...precos);

        // Soma o estoque de todas as variações
        estoqueTotal = p.variacoes.reduce((acc, v) => acc + (parseInt(v.estoque) || 0), 0);
    } else {
        menorPreco = p.preco || 0;
        // Se não tiver variações, olha o estoque do produto. 
        // Se for undefined (não definido), assumimos 999 (disponível), senão pegamos o valor.
        estoqueTotal = p.estoque !== undefined ? parseInt(p.estoque) : 999;
    }

    const imgUrl = p.imagem ? p.imagem : 'https://via.placeholder.com/150';
    const esgotado = estoqueTotal <= 0; // Verifica se está esgotado

    const div = document.createElement('div');
    div.className = 'card product-card'; 
    
    // Define o HTML do botão ou do aviso
    let botaoAcao;
    
    // VERIFICAÇÃO DO "EM BREVE" (Tem prioridade sobre esgotado)
    if (p.emBreve) {
        botaoAcao = `
            <div class="btn-esgotado" style="
                color: #00ccff; 
                font-weight: 900; 
                border: 1px solid #00ccff; 
                padding: 6px; 
                border-radius: 4px; 
                text-align: center; 
                margin-top: 5px; 
                cursor: default; 
                text-shadow: 0 0 5px #00ccff;">
                EM BREVE 🚀
            </div>`;
    } 
    else if (esgotado) {
        botaoAcao = `<div class="btn-esgotado" style="color: red; font-weight: 900; border: 1px solid red; padding: 6px; border-radius: 4px; text-align: center; margin-top: 5px; cursor: default;">ESGOTADO</div>`;
    } 
    else {
        botaoAcao = `<button onclick="abrirModal('${p._id || p.id}')">COMPRAR</button>`;
    }
    
    // Evita abrir o modal se clicar especificamente no aviso de esgotado, mas permite clicar na imagem
    div.onclick = (e) => { 
        // Se clicar no botão ou for em breve/esgotado, não faz nada
        if(e.target.tagName !== 'BUTTON' && !e.target.classList.contains('btn-esgotado') && !p.emBreve) {
            abrirModal(p._id || p.id); 
        }
    };
    
    div.innerHTML = `
        <img src="${imgUrl}" alt="${p.nome}" loading="lazy">
        <div class="card-info">
            <h3>${p.nome}</h3>
            <div class="preco">${formatarMoeda(menorPreco)}</div>
            ${botaoAcao}
        </div>
    `;
    return div;
}

/* --- MODAL DE DETALHES --- */
function abrirModal(id) {
    produtoSelecionado = produtosGlobais.find(p => p.id == id || p._id == id);
    if(!produtoSelecionado) return;

    document.getElementById('modal-titulo').innerText = produtoSelecionado.nome;
    document.getElementById('modal-img').src = produtoSelecionado.imagem || 'https://via.placeholder.com/150';
    document.getElementById('modal-qtd').value = 1;
    
    // Reseta aviso de esgotado
    const overlay = document.getElementById('overlay-esgotado');
    if(overlay) overlay.style.display = 'none';

    // Ordena variações
    const variacoesOrdenadas = produtoSelecionado.variacoes ? [...produtoSelecionado.variacoes].sort((a, b) => {
        const marcaA = a.marca || a.tamanho || '';
        const marcaB = b.marca || b.tamanho || '';
        return marcaA.localeCompare(marcaB);
    }) : [];

    const lista = document.getElementById('modal-opcoes');
    lista.innerHTML = '';
    
    if (variacoesOrdenadas.length === 0) {
        // Produto único
        variacaoSelecionada = { 
            marca: 'Único', 
            preco_venda: produtoSelecionado.preco || 0, 
            estoque: produtoSelecionado.estoque !== undefined ? produtoSelecionado.estoque : 999 
        };
        lista.innerHTML = '<p style="color:#ccc">Produto único</p>';
        document.getElementById('modal-preco').innerText = formatarMoeda(produtoSelecionado.preco || 0);
        
        // Verifica estoque visual
        verificarEstoqueVisual(variacaoSelecionada.estoque);

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

            div.onclick = () => selVar(v, idx);

            if (semEstoque) {
                div.style.opacity = '0.6';
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
    const estoque = variacao.estoque !== undefined ? variacao.estoque : 99;

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

    verificarEstoqueVisual(estoque);
}

function verificarEstoqueVisual(qtd) {
    const overlay = document.getElementById('overlay-esgotado');
    const btnAdd = document.querySelector('.btn-whatsapp'); 
    
    if (qtd <= 0) {
        if(overlay) overlay.style.display = 'block'; 
        if(btnAdd) {
            btnAdd.style.opacity = '0.5';
            btnAdd.style.pointerEvents = 'none';
            btnAdd.innerText = "INDISPONÍVEL";
        }
    } else {
        if(overlay) overlay.style.display = 'none';
        if(btnAdd) {
            btnAdd.style.opacity = '1';
            btnAdd.style.pointerEvents = 'auto';
            btnAdd.innerText = "ADICIONAR AO CARRINHO";
        }
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

    const existente = carrinho.find(item => item.produto === produtoSelecionado.nome && item.marca === nomeVar);

    // [MODIFICAÇÃO] Agora salvamos também a categoria no objeto do carrinho
    if(existente) {
        if(existente.qtd + qtd > estoque) {
            return alert("Estoque limite atingido no carrinho.");
        }
        existente.qtd += qtd;
        existente.total = existente.qtd * existente.preco;
    } else {
        carrinho.push({
            produto: produtoSelecionado.nome,
            categoria: produtoSelecionado.categoria || 'Geral', // <-- ADICIONADO AQUI
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

/* --- FINALIZAR COMPRA --- */
async function finalizarCompra() {
    if(carrinho.length === 0) return alert("Seu carrinho está vazio!");
    
    const nomeInput = document.getElementById('nome-cliente');
    const nome = nomeInput ? nomeInput.value.trim() : '';
    
    if(!nome) {
        alert("Por favor, digite seu nome para identificarmos o pedido.");
        if(nomeInput) nomeInput.focus();
        return;
    }

    let totalBruto = carrinho.reduce((acc, item) => acc + (item.preco * item.qtd), 0);
    let totalFinal = totalBruto * (1 - descontoAtual/100);

    const representante = localStorage.getItem('catalogo_ref');

    const pedidoParaSalvar = {
        cliente: { nome: nome },
        produtos: carrinho, 
        total: totalFinal,
        representante: representante,
        data: new Date().toISOString()
    };

    try {
        const response = await fetch('/api/vendas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pedidoParaSalvar)
        });

        const resultado = await response.json();

        if (resultado.success || resultado.message) {
            let msg = `*NOVO PEDIDO - ${configLoja.nomeLoja || 'LOJA'}* 🛒\n\n`;
            msg += `*Cliente:* ${nome}\n`;
            if(resultado.id || resultado.pedidoId) msg += `*Pedido #:* ${resultado.id || resultado.pedidoId}\n`;
            msg += `------------------------------\n`;
            
            carrinho.forEach(item => {
                msg += `📦 ${item.qtd}x ${item.produto}\n`;
                // [MODIFICAÇÃO] Adicionando a Categoria (Marca) na mensagem
                msg += `   📂 Categoria: ${item.categoria || 'Geral'}\n`;
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

            let telefoneDestino = configLoja.whatsapp || configLoja.whatsappPedidos || "5511999999999";

            if (representante) {
                try {
                    const resRep = await fetch(`/api/revendedor/${representante}`);
                    const dadosRep = await resRep.json();
                    
                    if (dadosRep.valido && dadosRep.whatsapp) {
                        telefoneDestino = dadosRep.whatsapp;
                    }
                } catch (e) {
                    console.log("Erro ao buscar zap do revendedor, usando da loja.");
                }
            }

            const tel = telefoneDestino.replace(/\D/g, '');

            carrinho = [];
            descontoAtual = 0;
            salvarCarrinho();
            atualizarContador();
            fecharModal('modal-carrinho');
            if(nomeInput) nomeInput.value = '';

            setTimeout(() => {
                window.location.href = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
            }, 500);
            
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

window.onclick = function(event) {
    const modals = ['modal-produto', 'modal-carrinho'];
    modals.forEach(id => {
        const modal = document.getElementById(id);
        if (event.target == modal) {
            modal.style.display = "none";
        }
    });
}