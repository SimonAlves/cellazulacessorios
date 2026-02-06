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
            // Configuração inicial baseada na sua imagem cell azul capa.jpg
            campanhas = [{ 
                id: 0, 
                loja: "Cell Azul Acessórios", 
                arquivo: "cell azul capa.jpg", 
                cor: "#FFD700", 
                qtd: 20, 
                prefixo: "CELL", 
                premio1: "10% OFF", 
                chance1: 90,
                premio2: "Relógio Smart", 
                chance2: 10,
                ehSorteio: true 
            }];
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
// FUNÇÕES DE APOIO
// ==================================================================
function gerarCodigo(prefixo) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return `${prefixo.toUpperCase()}-${result}`;
}

const getDadosComBaixas = () => {
    return campanhas.map(c => {
        const qtdBaixas = historicoVendas.filter(h => h.loja === c.loja && h.status === 'Usado').length;
        return { ...c, baixas: qtdBaixas };
    });
};

// ==================================================================
// HTML PAINEL DE MARKETING
// ==================================================================
const renderMarketingPage = (lista) => `
<!DOCTYPE html>
<html>
<head>
    <title>Painel Cell Azul</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: sans-serif; background: #f0f2f5; padding: 20px; max-width: 900px; margin: 0 auto; }
        .card { background: white; padding: 20px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); border-left: 10px solid #ccc; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        label { font-weight: bold; font-size: 0.8rem; color: #666; display: block; margin: 5px 0; }
        input { padding: 10px; border: 1px solid #ddd; border-radius: 5px; width: 100%; box-sizing: border-box; }
        .btn { padding: 12px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; text-transform: uppercase; width: 100%; margin-top: 10px; }
        .btn-add { background: #28a745; color: white; }
        .btn-save { background: #007bff; color: white; }
        .btn-del { background: #dc3545; color: white; width: auto; padding: 5px 10px; }
    </style>
</head>
<body>
    <h1>⚙️ Gestão de Campanhas - Cell Azul</h1>
    <div class="card" style="border-top: 5px solid #28a745">
        <h2>➕ Nova Campanha</h2>
        <form action="/adicionar-loja" method="POST" enctype="multipart/form-data">
            <div class="grid">
                <div><label>Loja:</label><input type="text" name="loja" required></div>
                <div><label>Prefixo Cupom:</label><input type="text" name="prefixo" maxlength="4" required></div>
                <div><label>Prêmio 1:</label><input type="text" name="premio1" value="10% OFF"></div>
                <div><label>Chance 1 (%):</label><input type="number" name="chance1" value="90"></div>
                <div><label>Prêmio 2:</label><input type="text" name="premio2" value="Relógio Smart"></div>
                <div><label>Chance 2 (%):</label><input type="number" name="chance2" value="10"></div>
            </div>
            <label>Imagem (Vazio usa "cell azul capa.jpg"):</label>
            <input type="file" name="imagemUpload">
            <button type="submit" class="btn btn-add">CRIAR AGORA</button>
        </form>
    </div>

    ${lista.map(loja => `
        <div class="card" style="border-left-color: ${loja.cor}">
            <form action="/salvar-marketing" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="id" value="${loja.id}">
                <h3>Campanha: ${loja.loja}</h3>
                <div class="grid">
                    <div><label>Prêmio 1:</label><input type="text" name="premio1" value="${loja.premio1}"></div>
                    <div><label>Chance 1 (%):</label><input type="number" name="chance1" value="${loja.chance1}"></div>
                    <div><label>Prêmio 2:</label><input type="text" name="premio2" value="${loja.premio2}"></div>
                    <div><label>Chance 2 (%):</label><input type="number" name="chance2" value="${loja.chance2}"></div>
                    <div><label>Qtd Restante:</label><input type="number" name="qtd" value="${loja.qtd}"></div>
                </div>
                <button type="submit" class="btn btn-save">SALVAR MUDANÇAS</button>
            </form>
            <form action="/deletar-loja" method="POST" onsubmit="return confirm('Excluir?')">
                <input type="hidden" name="id" value="${loja.id}">
                <button type="submit" class="btn btn-del">🗑️</button>
            </form>
        </div>
    `).join('')}
</body></html>`;

// ==================================================================
// MOTOR DO SERVIDOR
// ==================================================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Rotas principais
app.get('/marketing', (req, res) => res.send(renderMarketingPage(campanhas)));
app.get('/qrcode', (req, res) => {
    const url = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/mobile`;
    QRCode.toDataURL(url, (e, s) => res.send(s));
});

// Ações do Painel
app.post('/adicionar-loja', upload.single('imagemUpload'), (req, res) => {
    const { loja, prefixo, premio1, premio2, chance1, chance2 } = req.body;
    campanhas.push({
        id: Date.now(),
        loja,
        arquivo: req.file ? req.file.filename : "cell azul capa.jpg",
        cor: "#FFD700",
        prefixo: prefixo.toUpperCase(),
        premio1,
        chance1: parseFloat(chance1),
        premio2,
        chance2: parseFloat(chance2),
        qtd: 100,
        ehSorteio: true
    });
    salvarBanco();
    res.redirect('/marketing');
});

app.post('/salvar-marketing', upload.single('imagemUpload'), (req, res) => {
    const { id, premio1, chance1, premio2, chance2, qtd } = req.body;
    const idx = campanhas.findIndex(c => c.id == id);
    if (idx > -1) {
        campanhas[idx].premio1 = premio1;
        campanhas[idx].chance1 = parseFloat(chance1);
        campanhas[idx].premio2 = premio2;
        campanhas[idx].chance2 = parseFloat(chance2);
        campanhas[idx].qtd = parseInt(qtd);
        salvarBanco();
    }
    res.redirect('/marketing');
});

app.post('/deletar-loja', (req, res) => {
    campanhas = campanhas.filter(c => c.id != req.body.id);
    salvarBanco();
    res.redirect('/marketing');
});

// Comunicação em tempo real
io.on('connection', (socket) => {
    socket.on('resgatar_oferta', (dados) => {
        const camp = campanhas.find(c => c.id == dados.id);
        if (camp && camp.qtd > 0) {
            const sorte = Math.random() * 100;
            let premioFinal = (sorte <= camp.chance2) ? camp.premio2 : camp.premio1;
            let isGold = (sorte <= camp.chance2);
            const cod = gerarCodigo(camp.prefixo);
            
            historicoVendas.push({
                codigo: cod,
                loja: camp.loja,
                premio: premioFinal,
                status: 'Emitido',
                clienteNome: dados.cliente.nome,
                clienteZap: dados.cliente.zap,
                data: new Date().toLocaleString()
            });

            camp.qtd--;
            salvarBanco();

            socket.emit('sucesso', { codigo: cod, produto: premioFinal, isGold, loja: camp.loja });
            io.emit('aviso_vitoria_tv', { loja: camp.loja, premio: premioFinal });
        }
    });

    socket.on('validar_cupom', (cod) => {
        const cupom = historicoVendas.find(h => h.codigo === cod.toUpperCase());
        if (!cupom) socket.emit('resultado_validacao', { sucesso: false, msg: "INVÁLIDO" });
        else if (cupom.status === 'Usado') socket.emit('resultado_validacao', { sucesso: false, msg: "JÁ UTILIZADO" });
        else {
            cupom.status = 'Usado';
            socket.emit('resultado_validacao', { sucesso: true, msg: "VÁLIDO!", detalhe: `${cupom.premio} - ${cupom.clienteNome}` });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Cell Azul rodando na porta ${PORT}`));
