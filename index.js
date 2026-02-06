const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- CONFIGURAÇÕES DE PASTAS ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// --- BANCO DE DADOS SIMPLIFICADO ---
const DB_FILE = './database.json';
let campanhas = [];
let historicoVendas = [];

function carregarBanco() {
    if (fs.existsSync(DB_FILE)) {
        const dados = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        campanhas = dados.campanhas || [];
        historicoVendas = dados.historicoVendas || [];
    } else {
        campanhas = [{ 
            id: 1, loja: "Cell Azul Acessórios", arquivo: "padrao.jpg", 
            cor: "#003399", qtd: 50, prefixo: "CELL", 
            premio1: "10% OFF", chance1: 90, premio2: "Capa Grátis", chance2: 10
        }];
        salvarBanco();
    }
}
function salvarBanco() { 
    fs.writeFileSync(DB_FILE, JSON.stringify({ campanhas, historicoVendas }, null, 2)); 
}
carregarBanco();

// --- ROTAS DE ARQUIVOS (CORREÇÃO DO "CANNOT GET") ---

// Rota para o Cliente (Celular)
app.get('/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

// Rota para a TV da Loja
app.get('/tv', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'publictv.html'));
});

// Rota para o Painel de Marketing
app.get('/marketing', (req, res) => {
    let html = `<h1>Painel Marketing</h1><a href="/tv">Abrir TV</a><br><br>`;
    campanhas.forEach(c => {
        html += `<div style="border:1px solid #ccc; padding:10px; margin-bottom:10px;">
            <h3>${c.loja}</h3>
            <form action="/salvar" method="POST">
                <input type="hidden" name="id" value="${c.id}">
                Estoque: <input type="number" name="qtd" value="${c.qtd}">
                <button type="submit">Atualizar Estoque</button>
            </form>
        </div>`;
    });
    res.send(html);
});

// GERADOR DE QR CODE ESTÁVEL
app.get('/qrcode', async (req, res) => {
    try {
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const linkMobile = `${protocol}://${req.get('host')}/mobile`;
        const buffer = await QRCode.toBuffer(linkMobile, { width: 400 });
        res.type('png').send(buffer);
    } catch (err) { res.status(500).send("Erro ao gerar QR"); }
});

app.post('/salvar', (req, res) => {
    const { id, qtd } = req.body;
    const idx = campanhas.findIndex(c => c.id == id);
    if(idx > -1) {
        campanhas[idx].qtd = parseInt(qtd);
        salvarBanco();
        io.emit('atualizar_qtd', { qtd: campanhas[idx].qtd });
    }
    res.redirect('/marketing');
});

// --- COMUNICAÇÃO EM TEMPO REAL ---
io.on('connection', (socket) => {
    if (campanhas.length > 0) {
        socket.emit('trocar_slide', { ...campanhas[0] });
    }

    socket.on('resgatar_oferta', (dados) => {
        const c = campanhas[0];
        if (c && c.qtd > 0) {
            const sorte = Math.random() * 100;
            const premio = sorte > 90 ? c.premio2 : c.premio1;
            const codigo = `${c.prefixo}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
            
            historicoVendas.push({ ...dados, codigo, premio, data: new Date() });
            c.qtd--;
            salvarBanco();

            socket.emit('sucesso', { codigo, produto: premio });
            io.emit('aviso_vitoria_tv', { premio, loja: c.loja });
            io.emit('atualizar_qtd', { qtd: c.qtd });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Cell Azul rodando na porta ${PORT}`));
