const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

// ==================================================================
// CONFIGURAÇÃO DE UPLOAD
// ==================================================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, 'public/') },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); 
    }
});
const upload = multer({ storage: storage });

// ==================================================================
// BANCO DE DADOS
// ==================================================================
const DB_FILE = './database.json';
let campanhas = [];
let historicoVendas = []; 

function carregarBanco() {
    try {
        if (fs.existsSync(DB_FILE)) {
            campanhas = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } else {
            campanhas = [{ id: 0, loja: "Cell Azul", arquivo: "cell azul capa.jpg", modo: "sorte", cor: "#003399", qtd: 50, prefixo: "CELL", premio1: "10% OFF", premio2: "50% OFF", ehSorteio: true }];
            salvarBanco();
        }
    } catch (err) { console.error("Erro DB:", err); campanhas = []; }
}

function salvarBanco() {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(campanhas, null, 2)); } 
    catch (err) { console.error("Erro Save:", err); }
}
carregarBanco();

// ==================================================================
// INTERFACES HTML (MARKETING, ADMIN, CAIXA, TV, MOBILE)
// ==================================================================

// 1. VOUCHER VISUAL "LINDO" (Página que o cliente abre via WhatsApp)
const renderVoucherVisual = (cupom) => `
<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
    body { background: #f0f2f5; font-family: sans-serif; display: flex; justify-content: center; padding-top: 40px; margin: 0; }
    .ticket { background: white; width: 320px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border: 3px solid #003399; overflow: hidden; text-align: center; }
    .header { background: #003399; color: white; padding: 20px; }
    .premio { font-size: 1.8rem; font-weight: bold; color: #003399; margin: 20px 0; padding: 0 10px; }
    .cod { font-size: 2.2rem; border: 2px dashed #003399; padding: 10px; margin: 20px; font-family: monospace; background: #f9f9f9; color: #d32f2f; }
    .footer { font-size: 0.8rem; color: #777; margin-bottom: 20px; }
</style></head>
<body><div class="ticket"><div class="header"><h2>CELL AZUL</h2><small>VOUCHER OFICIAL</small></div>
<div class="premio">${cupom.premio}</div><div class="cod">${cupom.codigo}</div>
<p>Apresente no caixa para resgatar!</p><div class="footer">Gerado em: ${cupom.data}</div></div></body></html>`;

// (Os outros HTMLs como htmlTV, htmlMobile e htmlCaixa foram integrados nas rotas abaixo)

// ==================================================================
// MOTOR DO SERVIDOR
// ==================================================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); 

let slideAtual = 0;
setInterval(() => { 
    if (campanhas.length > 0) { 
        slideAtual = (slideAtual + 1) % campanhas.length;
        io.emit('trocar_slide', { ...campanhas[slideAtual], todasLojas: campanhas });
    }
}, 30000);

function gerarCodigo(prefixo) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return `${prefixo.toUpperCase()}-${result}`;
}

// ROTAS
app.get('/marketing', (req, res) => res.send(renderMarketingPage(campanhas)));
app.get('/tv', (req, res) => res.send(htmlTV)); 
app.get('/mobile', (req, res) => res.send(htmlMobile));
app.get('/caixa', (req, res) => res.send(htmlCaixa));
app.get('/admin', (req, res) => res.send(htmlAdmin));

// Rota para o Voucher Visual que o WhatsApp envia
app.get('/ver-voucher/:codigo', (req, res) => {
    const cupom = historicoVendas.find(h => h.codigo === req.params.codigo.toUpperCase());
    if (!cupom) return res.send("Voucher não encontrado.");
    res.send(renderVoucherVisual(cupom));
});

app.get('/qrcode', (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const url = `${protocol}://${req.headers.host}/mobile`;
    QRCode.toDataURL(url, (e, s) => res.send(s));
});

// AÇÕES DO SISTEMA
app.post('/adicionar-loja', upload.single('imagemUpload'), (req, res) => {
    const { loja, cor, prefixo, premio1, premio2 } = req.body;
    const novo = { id: Date.now(), loja, arquivo: req.file ? req.file.filename : 'padrao.jpg', cor, qtd: 50, prefixo: prefixo.toUpperCase(), premio1, premio2, ehSorteio: true };
    campanhas.push(novo);
    salvarBanco();
    res.redirect('/marketing');
});

// SOCKET.IO (LÓGICA DE SORTEIO E VALIDAÇÃO)
io.on('connection', (socket) => {
    socket.on('resgatar_oferta', (dados) => {
        const camp = campanhas[0]; // Exemplo usando a primeira campanha ativa
        if (camp && camp.qtd > 0) {
            const sorte = Math.random() * 100;
            let premio = (sorte > 95) ? camp.premio2 : camp.premio1;
            const cod = gerarCodigo(camp.prefixo);
            
            const novoVoucher = { 
                codigo: cod, loja: camp.loja, premio: premio, status: 'Emitido', 
                clienteNome: dados.cliente.nome, clienteZap: dados.cliente.zap,
                data: new Date().toLocaleDateString('pt-BR'), hora: new Date().toLocaleTimeString('pt-BR')
            };
            historicoVendas.push(novoVoucher);
            
            // Link que será enviado para o WhatsApp
            const host = socket.handshake.headers.host;
            const protocol = socket.handshake.headers['x-forwarded-proto'] || 'http';
            const linkVoucher = `${protocol}://${host}/ver-voucher/${cod}`;

            camp.qtd--;
            salvarBanco();
            socket.emit('sucesso', { codigo: cod, produto: premio, loja: camp.loja, zap: dados.cliente.zap, link: linkVoucher });
            io.emit('aviso_vitoria_tv', { loja: camp.loja, premio: premio });
        }
    });

    socket.on('validar_cupom', (cod) => {
        const cupom = historicoVendas.find(h => h.codigo === cod.toUpperCase());
        if (!cupom) socket.emit('resultado_validacao', { sucesso: false, msg: "❌ Código Inválido!" });
        else if (cupom.status === 'Usado') socket.emit('resultado_validacao', { sucesso: false, msg: "⚠️ Já foi Utilizado!" });
        else {
            cupom.status = 'Usado';
            socket.emit('resultado_validacao', { sucesso: true, msg: "✅ VÁLIDO!", detalhe: `Liberar: ${cupom.premio}` });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sistema Cell Azul rodando na porta ${PORT}`));
