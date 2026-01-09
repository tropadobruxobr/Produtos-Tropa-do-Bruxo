const mongoose = require('mongoose');

const PedidoSchema = new mongoose.Schema({
  cliente: {
    nome: String,
    whatsapp: String,
    endereco: String,
    metodoPagamento: String
  },
  itens: [
    {
      produto: String,
      quantidade: Number,
      variacao: String,
      preco: Number
    }
  ],
  total: Number,
  representante: { type: String, default: null }, // Aqui salvamos quem indicou!
  status: { 
    type: String, 
    enum: ['Pendente', 'Aprovado', 'Cancelado'], 
    default: 'Pendente' 
  },
  data: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Pedido', PedidoSchema);