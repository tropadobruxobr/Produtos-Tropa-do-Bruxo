require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const mongoose = require('mongoose');

// --- IMPORTS DO CLOUDINARY ---
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Biblioteca de sessão
const MongoDBStore = require('connect-mongodb-session')(session);

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONEXÃO COM MONGODB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Conectado ao MongoDB com sucesso!'))
    .catch(err => console.error('❌ Erro ao conectar no Mongo:', err));

// --- CONFIGURAÇÃO DA SESSÃO NO BANCO ---
const store = new MongoDBStore({
    uri: process.env.MONGO_URI,
    collection: 'sessions'
});

store.on('error', function(error) {
    console.log('Erro na sessão:', error);
});

app.use(session({
    secret: process.env.SESSION_SECRET || 'chave-secreta-sistema-loja',
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 1 semana
        secure: false // Mantido false para evitar erros de login no Render sem proxy trust
    },
    store: store,
    resave: true,
    saveUninitialized: true
}));

// ========================================================
// 🗂️ DEFINIÇÃO DOS MODELOS (SCHEMAS)
// ========================================================

const ProdutoSchema = new mongoose.Schema({
    nome: String,
    categoria: String,
    preco: Number,
    imagem: String,
    variacoes: [Object], 
    ativo: { type: Boolean, default: true },
    visivel: { type: Boolean, default: true }, // <--- NOVO CAMPO (OCULTAR PRODUTO)
    emBreve: { type: Boolean, default: false },
    dataCriacao: { type: Date, default: Date.now }
});
const Produto = mongoose.model('Produto', ProdutoSchema);

const RevendedorSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    slug: { type: String, required: true, unique: true }, 
    whatsapp: String,
    chavePix: String,
    ativo: { type: Boolean, default: true }
});
const Representante = mongoose.model('Representante', RevendedorSchema);

const VendaSchema = new mongoose.Schema({
    id_pedido: { type: Number, default: () => Date.now() }, 
    cliente: { type: Object }, 
    produtos: [Object], 
    total: Number,
    representante: { type: String, default: null }, // Campo do representante
    status: { type: String, default: 'Pendente' },
    data: { type: Date, default: Date.now },
    dataCancelamento: { type: Date } 
});

// Configura o índice TTL (Time To Live). 
VendaSchema.index({ dataCancelamento: 1 }, { expireAfterSeconds: 2592000 });

const Venda = mongoose.model('Venda', VendaSchema);

const CupomSchema = new mongoose.Schema({
    codigo: { type: String, unique: true, uppercase: true },
    desconto: Number
});
const Cupom = mongoose.model('Cupom', CupomSchema);

const ConfigSchema = new mongoose.Schema({
    nomeLoja: String,
    whatsapp: String,
    fundoSite: String,
    fundoHeader: String,
    // banner1: String, 
    banner2: String,
    banner3: String,
    corDestaque: String,
    whatsappFlutuante: String,
    instagramLink: String,
    categoriaDestaque: String // <--- NOVO CAMPO (CATEGORIA DESTAQUE)
}, { strict: false }); 
const Config = mongoose.model('Config', ConfigSchema);


// --- CONFIGURAÇÕES BÁSICAS DO EXPRESS ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// --- CONFIGURAÇÃO CLOUDINARY ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'catalogo-digital',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    },
});

const upload = multer({ storage: storage });


// ========================================================
// 🔐 ÁREA DE SEGURANÇA (LOGIN)
// ========================================================

app.post('/api/login', (req, res) => {
    const user = req.body.user;
    const senha = req.body.senha || req.body.pass;

    // Pega as senhas do Render (ou usa o padrão se não tiver configurado)
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASS || '123456'; 

    // ✅ CORREÇÃO APLICADA:
    // Removemos o "|| senha === 'admin123'", agora ele SÓ aceita a senha do Render/Env
    if (user === adminUser && senha === adminPass) {
        req.session.usuarioLogado = true;
        req.session.save(); 
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Senha incorreta' });
    }
});

function isAuthenticated(req, res, next) {
    if (req.session.usuarioLogado) return next();
    res.redirect('/login.html'); 
}

app.get('/admin', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});

app.get('/check-auth', (req, res) => {
    res.json({ authenticated: !!req.session.usuarioLogado });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// ========================================================
// 📊 DASHBOARD
// ========================================================

app.get('/api/dashboard', async (req, res) => {
    try {
        const vendas = await Venda.find();
        const produtos = await Produto.find();

        const hoje = new Date().toISOString().split('T')[0]; 

        let faturamentoHoje = 0;
        let pendentes = 0;
        let totalVendasAprovadas = 0;
        let valorTotalAprovado = 0;

        // Mapa para o Gráfico
        const vendasPorDia = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dataStr = d.toISOString().split('T')[0];
            vendasPorDia[dataStr] = 0;
        }

        vendas.forEach(v => {
            let dataVenda = '';
            if (v.data) dataVenda = new Date(v.data).toISOString().split('T')[0];

            if (v.status === 'Pendente') {
                pendentes++;
            } else if (v.status === 'Aprovado') {
                const val = parseFloat(v.total) || 0;
                valorTotalAprovado += val;
                totalVendasAprovadas++;

                if (dataVenda === hoje) {
                    faturamentoHoje += val;
                }

                if (vendasPorDia[dataVenda] !== undefined) {
                    vendasPorDia[dataVenda] += val;
                }
            }
        });

        const ticketMedio = totalVendasAprovadas > 0 ? (valorTotalAprovado / totalVendasAprovadas) : 0;

        // Estoque Baixo
        // Estoque Baixo
        const estoqueBaixo = [];
        produtos.forEach(p => {
            if (p.variacoes && Array.isArray(p.variacoes)) {
                p.variacoes.forEach(v => {
                    const qtd = parseInt(v.estoque || 0);
                    if (qtd < 5) {
                        estoqueBaixo.push({
                            nome: p.nome,
                            categoria: p.categoria || 'Sem Categoria', // ADICIONADO: Envia a categoria
                            marca: v.marca || v.tamanho || 'Padrão',
                            estoque: qtd
                        });
                    }
                });
            }
        });

        res.json({
            faturamentoHoje,
            pendentes,
            ticketMedio,
            totalVendas: totalVendasAprovadas,
            estoqueBaixo,
            grafico: {
                labels: Object.keys(vendasPorDia),
                valores: Object.values(vendasPorDia)
            }
        });

    } catch (error) {
        console.error("Erro dashboard:", error);
        res.status(500).json({ error: "Erro ao calcular dashboard" });
    }
});

// ========================================================
// 👥 API DE REVENDEDORES
// ========================================================

app.get('/api/revendedores', async (req, res) => {
    try {
        const reps = await Representante.find();
        res.json(reps);
    } catch (e) {
        res.status(500).json({ error: 'Erro ao buscar revendedores' });
    }
});

app.get('/api/revendedor/:slug', async (req, res) => {
    try {
        const rep = await Representante.findOne({ slug: req.params.slug, ativo: true });
        if (rep) res.json({ valido: true, nome: rep.nome, whatsapp: rep.whatsapp });
        else res.json({ valido: false });
    } catch (e) {
        res.json({ valido: false });
    }
});

app.post('/api/revendedores', isAuthenticated, async (req, res) => {
    try {
        await Representante.create(req.body);
        res.json({ success: true, message: 'Revendedor criado!' });
    } catch (e) {
        res.status(400).json({ error: 'Erro. Verifique se o código (slug) já existe.' });
    }
});

app.post('/api/revendedores/:id/toggle', isAuthenticated, async (req, res) => {
    try {
        const rep = await Representante.findById(req.params.id);
        if (!rep) return res.status(404).json({ error: 'Revendedor não encontrado' });

        rep.ativo = !rep.ativo; 
        await rep.save();

        res.json({ success: true, novoStatus: rep.ativo });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erro ao atualizar status' });
    }
});

app.delete('/api/revendedores/:id', isAuthenticated, async (req, res) => {
    try {
        const id = req.params.id;
        const removido = await Representante.findByIdAndDelete(id);

        if (!removido) {
            return res.status(404).json({ error: 'Revendedor não encontrado' });
        }

        res.json({ success: true, message: 'Revendedor excluído com sucesso!' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erro ao excluir revendedor' });
    }
});

// ========================================================
// 📦 API DE PRODUTOS
// ========================================================

app.get('/api/produtos', async (req, res) => {
    try {
        // MUDANÇA AQUI: Ordenação alfabética (A-Z) -> { nome: 1 }
        const produtos = await Produto.find().sort({ nome: 1 });
        res.json(produtos);
    } catch (e) {
        res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
});

app.post('/api/produtos', isAuthenticated, upload.single('imagem'), async (req, res) => {
    try {
        let variacoes = [];
        if (typeof req.body.variacoes === 'string') {
            try { variacoes = JSON.parse(req.body.variacoes); } catch (e) { variacoes = []; }
        } else {
            variacoes = req.body.variacoes || [];
        }

        const precoBase = variacoes.length > 0 
            ? Math.min(...variacoes.map(v => parseFloat(v.preco || v.preco_venda || 0))) 
            : (parseFloat(req.body.preco) || 0);

        const novoProduto = await Produto.create({
            nome: req.body.nome,
            categoria: req.body.categoria,
            imagem: req.file ? req.file.path : '', 
            variacoes: variacoes,
            ativo: true,
            visivel: req.body.visivel === 'true', // <--- SALVA O STATUS VISÍVEL
            emBreve: req.body.emBreve === 'true',
            preco: precoBase
        });

        res.json({ message: 'Produto cadastrado!', produto: novoProduto });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ error: "Erro interno ao criar produto" });
    }
});

app.put('/api/produtos/:id', isAuthenticated, upload.single('imagem'), async (req, res) => {
    try {
        const id = req.params.id;
        const produtoAtual = await Produto.findById(id);
        if (!produtoAtual) return res.status(404).json({ message: "Produto não encontrado" });

        let variacoes = [];
        if (typeof req.body.variacoes === 'string') {
            try { variacoes = JSON.parse(req.body.variacoes); } catch (e) { variacoes = []; }
        } else {
            variacoes = req.body.variacoes || [];
        }

        const imagemFinal = req.file ? req.file.path : produtoAtual.imagem;
        
        const precoBase = variacoes.length > 0 
            ? Math.min(...variacoes.map(v => parseFloat(v.preco || v.preco_venda || 0))) 
            : (parseFloat(req.body.preco) || 0);

        await Produto.findByIdAndUpdate(id, {
            nome: req.body.nome,
            categoria: req.body.categoria,
            imagem: imagemFinal,
            variacoes: variacoes,
            visivel: req.body.visivel === 'true', // <--- ATUALIZA O STATUS VISÍVEL
            emBreve: req.body.emBreve === 'true',
            preco: precoBase
        });

        res.json({ message: 'Produto atualizado com sucesso!' });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ error: "Erro ao atualizar" });
    }
});

app.delete('/api/produtos/:id', isAuthenticated, async (req, res) => {
    try {
        const id = req.params.id;
        await Produto.findByIdAndDelete(id);
        res.json({ message: 'Produto deletado!' });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao deletar' });
    }
});

// ========================================================
// 🎟️ API DE CUPONS
// ========================================================

app.get('/api/cupons', async (req, res) => {
    const cupons = await Cupom.find();
    res.json(cupons);
});

app.post('/api/cupons', isAuthenticated, async (req, res) => {
    try {
        const { codigo, desconto } = req.body;
        await Cupom.create({ codigo: codigo.toUpperCase(), desconto: parseInt(desconto) });
        res.json({ message: 'Cupom criado' });
    } catch (e) {
        res.status(400).json({ message: 'Erro ao criar cupom' });
    }
});

app.delete('/api/cupons/:codigo', isAuthenticated, async (req, res) => {
    await Cupom.findOneAndDelete({ codigo: req.params.codigo.toUpperCase() });
    res.json({ message: 'Cupom deletado' });
});

app.get('/api/cupom/:codigo', async (req, res) => {
    const cupom = await Cupom.findOne({ codigo: req.params.codigo.toUpperCase() });
    if (cupom) res.json({ valido: true, desconto: cupom.desconto });
    else res.json({ valido: false });
});

// ========================================================
// 💰 VENDAS E ESTOQUE
// ========================================================

app.get('/api/vendas', isAuthenticated, async (req, res) => {
    const vendas = await Venda.find().sort({ data: -1 });
    res.json(vendas);
});

app.post('/api/vendas', async (req, res) => {
    try {
        const corpo = req.body;
        const listaProdutos = corpo.produtos || corpo.itens || [];

        if (!listaProdutos || listaProdutos.length === 0) {
            return res.status(400).json({ success: false, message: "Pedido vazio." });
        }

        const novaVenda = await Venda.create({
            cliente: corpo.cliente || { nome: 'Cliente Site' },
            produtos: listaProdutos,
            total: parseFloat(corpo.total) || 0,
            representante: corpo.representante || null, // Salva o nome do representante (que vem do front)
            status: 'Pendente'
        });

        console.log(`[VENDA] Nova venda registrada: ${novaVenda.id_pedido}`);
        res.json({ success: true, message: 'Pedido registrado!', id: novaVenda.id_pedido });

    } catch (err) {
        console.error("Erro venda:", err);
        res.status(500).json({ success: false, message: "Erro interno." });
    }
});

app.post('/api/venda/:id/confirmar', isAuthenticated, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        let venda;
        const idParam = req.params.id;

        if (!isNaN(idParam)) {
            venda = await Venda.findOne({ id_pedido: idParam }).session(session);
        } else if (mongoose.Types.ObjectId.isValid(idParam)) {
            venda = await Venda.findById(idParam).session(session);
        }

        if (!venda) throw new Error('Venda não encontrada');
        if (venda.status === 'Aprovado') throw new Error('Já aprovada');

        for (const item of venda.produtos) {
            const produto = await Produto.findOne({ nome: item.produto }).session(session);

            if (produto && produto.variacoes) {
                const indexVar = produto.variacoes.findIndex(v => 
                    (v.marca && v.marca === item.marca) ||
                    (v.tamanho && v.tamanho === item.marca) || 
                    (v.marca === item.tamanho) 
                );

                if (indexVar !== -1) {
                    const qtd = parseInt(item.qtd || item.quantidade || 1);
                    if (produto.variacoes[indexVar].estoque >= qtd) {
                        produto.variacoes[indexVar].estoque -= qtd;
                        produto.markModified('variacoes'); 
                        await produto.save({ session });
                    } else {
                        throw new Error(`Estoque insuficiente: ${produto.nome}`);
                    }
                }
            }
        }

        venda.status = 'Aprovado';
        await venda.save({ session });

        await session.commitTransaction();
        res.json({ message: 'Venda confirmada e estoque atualizado!' });

    } catch (error) {
        await session.abortTransaction();
        console.error(error);
        res.status(400).json({ message: error.message || 'Erro ao processar' });
    } finally {
        session.endSession();
    }
});

app.post('/api/venda/:id/cancelar', isAuthenticated, async (req, res) => {
    try {
        let filtro = { id_pedido: req.params.id };
        if (mongoose.Types.ObjectId.isValid(req.params.id)) filtro = { _id: req.params.id };

        // ALTERAÇÃO: Usamos findOneAndDelete para remover do banco imediatamente
        const vendaRemovida = await Venda.findOneAndDelete(filtro);

        if (!vendaRemovida) {
            return res.status(404).json({ message: 'Venda não encontrada' });
        }

        res.json({ message: 'Pedido excluído permanentemente!' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Erro ao excluir pedido' });
    }
    
});
// Rota para EXCLUIR um pedido individualmente (Qualquer status)
app.delete('/api/venda/:id', isAuthenticated, async (req, res) => {
    try {
        let filtro = { id_pedido: req.params.id };
        
        // Verifica se é ID do Mongo ou ID numérico
        if (mongoose.Types.ObjectId.isValid(req.params.id)) {
            filtro = { _id: req.params.id };
        }

        const deletado = await Venda.findOneAndDelete(filtro);

        if (deletado) {
            res.json({ success: true, message: 'Pedido excluído.' });
        } else {
            res.status(404).json({ error: 'Pedido não encontrado.' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Erro ao excluir.' });
    }
});
// 3. NOVA ROTA PARA LIMPAR PEDIDOS (Adicione onde estão as rotas de venda)
app.delete('/api/vendas/limpar', isAuthenticated, async (req, res) => {
    try {
        await Venda.deleteMany({}); // Apaga TUDO da coleção de vendas
        res.json({ success: true, message: 'Histórico limpo com sucesso!' });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao limpar histórico.' });
    }
});

// ========================================================
// 🎨 CONFIGURAÇÕES
// ========================================================

app.get('/api/config', async (req, res) => {
    const config = await Config.findOne() || {};
    res.json(config);
});

// Campos de upload
const configUpload = upload.fields([
    { name: 'fundoSite', maxCount: 1 },
    { name: 'fundoHeader', maxCount: 1 },
    // { name: 'banner1', maxCount: 1 }, // DESATIVADO
    { name: 'banner2', maxCount: 1 },
    { name: 'banner3', maxCount: 1 }
]);

app.post('/api/config', isAuthenticated, configUpload, async (req, res) => {
    try {
        let configData = { ...req.body };

        if (req.files['fundoSite']) configData.fundoSite = req.files['fundoSite'][0].path;
        if (req.files['fundoHeader']) configData.fundoHeader = req.files['fundoHeader'][0].path;
        
        if (req.files['banner2']) configData.banner2 = req.files['banner2'][0].path;
        if (req.files['banner3']) configData.banner3 = req.files['banner3'][0].path;

        const config = await Config.findOneAndUpdate({}, configData, { new: true, upsert: true });

        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
            res.json({ message: 'Salvo!', config });
        } else {
            res.redirect('/admin');
        }

    } catch (error) {
        console.error("Erro config:", error);
        res.status(500).json({ erro: 'Erro ao salvar' });
    }
});

// Iniciar Servidor
app.listen(PORT, () => {
    console.log(`✅ Sistema rodando na porta ${PORT}`);
});