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
            campanhas = [{ 
                id: Date.now(), 
                loja: "Criativo Zone", 
                arquivo: "padrao.jpg", 
                cor: "#333", 
                qtd: 100, 
                prefixo: "CZ", 
                premio1: "10% OFF", 
                chance1: 90,
                premio2: "Smartwatch", 
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
// FUNÇÕES AUXILIARES
// ==================================================================
function gerarCodigo(prefixo) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return `${prefixo}-${result}`;
}

const getDadosComBaixas = () => {
    return campanhas.map(c => {
        const qtdBaixas = historicoVendas.filter(h => h.loja === c.loja && h.status === 'Usado').length;
        return { ...c, baixas: qtdBaixas };
    });
};

// ==================================================================
// HTML - PAINEL DE MARKETING
// ==================================================================
const renderMarketingPage = (lista) => `
<!DOCTYPE html>
<html>
<head>
    <title>Painel de Marketing</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Roboto', sans-serif; background: #f0f2f5; padding: 20px; max-width: 900px; margin: 0 auto; }
        .card { background: white; padding: 20px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); border-left: 10px solid #ccc; }
        .card-new { background: #e3f2fd; padding: 20px; border-radius: 10px; border: 2px dashed #007bff; margin-bottom: 30px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 10px; }
        label { font-weight: bold; font-size: 0.8rem; color: #666; display: block; margin-bottom: 5px; }
        input { padding: 10px; border: 1px solid #ddd; border-radius: 5px; width: 100%; box-sizing: border-box; }
        .btn { padding: 12px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; text-transform: uppercase; width: 100%; }
        .btn-add { background: #28a745; color: white; }
        .btn-save { background: #007bff; color: white; margin-top: 10px; }
        .btn-del { background: #dc3545; color: white; width: 50px; margin-top: 10px; }
    </style>
</head>
<body>
    <h1>🛠️ Gestão Criativo Zone</h1>
    
    <div class="card-new">
        <h2>➕ Cadastrar Nova Campanha</h2>
        <form action="/adicionar-loja" method="POST" enctype="multipart/form-data">
            <div class="grid">
                <div><label>Nome da Loja:</label><input type="text" name="loja" required></div>
                <div><label>Prefixo (3-4 letras):</label><input type="text" name="prefixo" maxlength="4" style="text-transform:uppercase" required></div>
                <div><label>Prêmio 1 (90%):</label><input type="text" name="premio1" value="10% OFF" required></div>
                <div><label>Chance Prêmio 1 (%):</label><input type="number" name="chance1" value="90" required></div>
                <div><label>Prêmio 2 (10%):</label><input type="text" name="premio2" value="Relógio Smart" required></div>
                <div><label>Chance Prêmio 2 (%):</label><input type="number" name="chance2" value="10" required></div>
                <div><label>Cor do Tema:</label><input type="color" name="cor" value="#ff0000"></div>
                <div><label>Banner/Imagem:</label><input type="file" name="imagemUpload" required></div>
            </div>
            <button type="submit" class="btn btn-add">CRIAR AGORA</button>
        </form>
    </div>

    <h2>🖊️ Campanhas Ativas</h2>
    ${lista.map(loja => `
        <div class="card" style="border-left-color: ${loja.cor}">
            <form action="/salvar-marketing" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="id" value="${loja.id}">
                <input type="hidden" name="arquivoAtual" value="${loja.arquivo}">
                <div class="grid">
                    <div><label>Loja:</label><input type="text" name="loja" value="${loja.loja}"></div>
                    <div><label>Prêmio 1:</label><input type="text" name="premio1" value="${loja.premio1}"></div>
                    <div><label>Chance 1 (%):</label><input type="number" name="chance1" value="${loja.chance1}"></div>
                    <div><label>Prêmio 2:</label><input type="text" name="premio2" value="${loja.premio2}"></div>
                    <div><label>Chance 2 (%):</label><input type="number" name="chance2" value="${loja.chance2}"></div>
                    <div><label>Qtd Disponível:</label><input type="number" name="qtd" value="${loja.qtd}"></div>
                </div>
                <button type="submit" class="btn btn-save">💾 SALVAR ALTERAÇÕES</button>
            </form>
            <form action="/deletar-loja" method="POST" onsubmit="return confirm('Excluir esta campanha?');">
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

let slideAtual = 0;

// Loop da TV
setInterval(() => { 
    if (campanhas.length > 0) { 
        slideAtual++; 
        if (slideAtual >= campanhas.length) slideAtual = 0; 
        io.emit('trocar_slide', { ...campanhas[slideAtual], todasLojas: campanhas });
    }
}, 20000);

// ROTAS
app.get('/marketing', (req, res) => res.send(renderMarketingPage(campanhas)));
app.get('/qrcode', (req, res) => {
    const url = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/mobile`;
    QRCode.toDataURL(url, (e, s) => res.send(s));
});

// ADICIONAR
app.post('/adicionar-loja', upload.single('imagemUpload'), (req, res) => {
    const { loja, cor, prefixo, premio1, premio2, chance1, chance2 } = req.body;
    const nova = {
        id: Date.now(),
        loja,
        arquivo: req.file ? req.file.filename : 'padrao.jpg',
        cor,
        prefixo: prefixo.toUpperCase(),
        premio1,
        chance1: parseFloat(chance1),
        premio2,
        chance2: parseFloat(chance2),
        qtd: 100,
        ehSorteio: true
    };
    campanhas.push(nova);
    salvarBanco();
    res.redirect('/marketing');
});

// SALVAR EDIÇÃO
app.post('/salvar-marketing', upload.single('imagemUpload'), (req, res) => {
    const { id, loja, premio1, chance1, premio2, chance2, qtd } = req.body;
    const idx = campanhas.findIndex(c => c.id == id);
    if (idx > -1) {
        campanhas[idx].loja = loja;
        campanhas[idx].premio1 = premio1;
        campanhas[idx].chance1 = parseFloat(chance1);
        campanhas[idx].premio2 = premio2;
        campanhas[idx].chance2 = parseFloat(chance2);
        campanhas[idx].qtd = parseInt(qtd);
        if (req.file) campanhas[idx].arquivo = req.file.filename;
        salvarBanco();
    }
    res.redirect('/marketing');
});

// SOCKET - SORTEIO E VALIDAÇÃO
io.on('connection', (socket) => {
    socket.on('resgatar_oferta', (dados) => {
        const camp = campanhas.find(c => c.id == dados.id);
        if (camp && camp.qtd > 0) {
            const sorte = Math.random() * 100;
            let premioFinal = "";
            let gold = false;

            // Lógica de Probabilidade Editável
            if (sorte <= camp.chance2) {
                premioFinal = camp.premio2;
                gold = true;
            } else {
                premioFinal = camp.premio1;
            }

            const cod = gerarCodigo(camp.prefixo);
            
            // Grava no histórico para o CAIXA validar
            historicoVendas.push({
                data: new Date().toLocaleDateString('pt-BR'),
                hora: new Date().toLocaleTimeString('pt-BR'),
                loja: camp.loja,
                codigo: cod,
                premio: premioFinal,
                status: 'Emitido',
                clienteNome: dados.cliente.nome,
                clienteZap: dados.cliente.zap
            });

            camp.qtd--;
            salvarBanco();

            socket.emit('sucesso', { codigo: cod, produto: premioFinal, isGold: gold, loja: camp.loja });
            io.emit('aviso_vitoria_tv', { loja: camp.loja, premio: premioFinal });
        }
    });

    socket.on('validar_cupom', (cod) => {
        const cupom = historicoVendas.find(h => h.codigo === cod.toUpperCase());
        if (!cupom) {
            socket.emit('resultado_validacao', { sucesso: false, msg: "INVÁLIDO" });
        } else if (cupom.status === 'Usado') {
            socket.emit('resultado_validacao', { sucesso: false, msg: "JÁ USADO" });
        } else {
            cupom.status = 'Usado';
            socket.emit('resultado_validacao', { sucesso: true, msg: "VÁLIDO!", detalhe: `${cupom.premio} - ${cupom.clienteNome}` });
        }
    });
});

// Iniciar
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
