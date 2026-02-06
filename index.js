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
    destination: (req, file, cb) => { cb(null, 'public/') },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); 
    }
});
const upload = multer({ storage: storage });

// ==================================================================
// BANCO DE DADOS E PERSISTÊNCIA
// ==================================================================
const DB_FILE = './database.json';
let campanhas = [];
let historicoVendas = []; 

function carregarBanco() {
    try {
        if (fs.existsSync(DB_FILE)) {
            campanhas = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } else {
            // Configuração padrão inicial
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
    } catch (err) { console.error("Erro DB:", err); }
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

// ==================================================================
// HTML - INTERFACES EMBUTIDAS (CAIXA E MOBILE)
// ==================================================================

const htmlCaixa = `<!DOCTYPE html><html><head><title>Validador Caixa</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:sans-serif;text-align:center;padding:20px;background:#eee}input{padding:15px;font-size:20px;width:80%;margin:20px 0;border-radius:10px;border:1px solid #ccc}button{padding:15px 30px;background:#333;color:white;border:none;border-radius:10px;font-weight:bold;cursor:pointer}.res{margin-top:20px;padding:20px;background:white;border-radius:10px;display:none}</style></head><body><h1>📟 Validador de Cupom</h1><input type="text" id="cod" placeholder="DIGITE O CÓDIGO"><br><button onclick="validar()">VERIFICAR</button><div id="box" class="res"><h2 id="msg"></h2><p id="det"></p></div><script src="/socket.io/socket.io.js"></script><script>const socket=io();function validar(){socket.emit('validar_cupom',document.getElementById('cod').value)}socket.on('resultado_validacao',d=>{const b=document.getElementById('box');b.style.display='block';document.getElementById('msg').innerText=d.msg;document.getElementById('msg').style.color=d.sucesso?'green':'red';document.getElementById('det').innerText=d.detalhe||''})</script></body></html>`;

// ==================================================================
// MOTOR DO SERVIDOR
// ==================================================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ROTAS DE NAVEGAÇÃO
app.get('/', (req, res) => res.redirect('/tv'));
app.get('/marketing', (req, res) => {
    // Renderiza a página de marketing (Pode ser uma função ou sendFile)
    res.send("Página de Marketing - Use a função renderMarketingPage aqui");
});
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'publictv.html')));
app.get('/caixa', (req, res) => res.send(htmlCaixa));
app.get('/mobile', (req, res) => {
    // Você pode criar um public/mobile.html ou usar res.send com o HTML que te enviei antes
    res.send("Interface Mobile - O cliente escaneia o QR Code e cai aqui.");
});

app.get('/qrcode', (req, res) => {
    const url = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/mobile`;
    QRCode.toDataURL(url, (e, s) => res.send(s));
});

// AÇÕES DO PAINEL (POST)
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
        qtd: 50,
        ehSorteio: true
    });
    salvarBanco();
    res.redirect('/marketing');
});

// COMUNICAÇÃO EM TEMPO REAL (SOCKET.IO)
io.on('connection', (socket) => {
    // Sorteio
    socket.on('resgatar_oferta', (dados) => {
        const camp = campanhas.find(c => c.id == dados.id);
        if (camp && camp.qtd > 0) {
            const sorte = Math.random() * 100;
            // Lógica 90/10 baseada no banco de dados
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

    // Validação no Caixa
    socket.on('validar_cupom', (cod) => {
        const cupom = historicoVendas.find(h => h.codigo === cod.toUpperCase());
        if (!cupom) {
            socket.emit('resultado_validacao', { sucesso: false, msg: "CÓDIGO INVÁLIDO" });
        } else if (cupom.status === 'Usado') {
            socket.emit('resultado_validacao', { sucesso: false, msg: "JÁ UTILIZADO!" });
        } else {
            cupom.status = 'Usado';
            socket.emit('resultado_validacao', { 
                sucesso: true, 
                msg: "✅ VÁLIDO!", 
                detalhe: `${cupom.premio} para ${cupom.clienteNome}` 
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sistema Cell Azul Ativo na porta ${PORT}`));
