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

// --- CONFIGURAÇÕES DE UPLOAD ---
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// --- BANCO DE DADOS ---
const DB_FILE = './database.json';
let campanhas = [];
let historicoVendas = [];

function carregarBanco() {
    try {
        if (fs.existsSync(DB_FILE)) {
            campanhas = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } else {
            campanhas = [{ 
                id: Date.now(), loja: "Cell Azul Acessórios", arquivo: "padrao.jpg", 
                cor: "#003399", qtd: 50, prefixo: "CELL", 
                premio1: "10% OFF", chance1: 90, premio2: "Capa Grátis", chance2: 10
            }];
            salvarBanco();
        }
    } catch (err) { console.error("Erro DB:", err); }
}
function salvarBanco() { fs.writeFileSync(DB_FILE, JSON.stringify(campanhas, null, 2)); }
carregarBanco();

function gerarCodigo(prefixo) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let res = '';
    for (let i = 0; i < 4; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
    return `${prefixo.toUpperCase()}-${res}`;
}

// --- ROTAS DE INTERFACE ---
app.get('/', (req, res) => res.redirect('/marketing'));

app.get('/marketing', (req, res) => {
    const html = `<!DOCTYPE html><html><head><title>Marketing Cell Azul</title><style>body{font-family:sans-serif;background:#f0f2f5;padding:20px;max-width:800px;margin:0 auto}.card{background:white;padding:20px;margin-bottom:15px;border-radius:8px;box-shadow:0 2px 5px rgba(0,0,0,0.1);border-left:10px solid #003399}input{padding:10px;margin:5px 0;width:100%;box-sizing:border-box}button{background:#003399;color:white;padding:12px;border:none;border-radius:5px;cursor:pointer;width:100%}</style></head>
    <body><h1>🛠️ Edição Cell Azul</h1><p><a href="/admin">📊 Admin</a> | <a href="/tv">📺 TV</a> | <a href="/caixa">📟 Caixa</a></p>
    ${campanhas.map(c => `<div class="card"><h3>${c.loja}</h3><form action="/salvar-marketing" method="POST" enctype="multipart/form-data"><input type="hidden" name="id" value="${c.id}"><label>Estoque:</label><input type="number" name="qtd" value="${c.qtd}"><label>Prêmio 1:</label><input type="text" name="premio1" value="${c.premio1}"><label>Prêmio 2:</label><input type="text" name="premio2" value="${c.premio2}"><button type="submit">SALVAR</button></form></div>`).join('')}</body></html>`;
    res.send(html);
});

app.get('/admin', (req, res) => res.send(`<h1>📊 Dados:</h1><pre>${JSON.stringify(historicoVendas, null, 2)}</pre>`));

app.get('/caixa', (req, res) => res.send(`<!DOCTYPE html><html><body><h1>📟 Validador</h1><input id="c"><button onclick="v()">Validar</button><script src="/socket.io/socket.io.js"></script><script>const socket=io();function v(){socket.emit('validar_cupom',document.getElementById('c').value.toUpperCase())}socket.on('resultado_validacao',d=>alert(d.msg))</script></body></html>`));

app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'publictv.html')));

// ROTA DO QR CODE (CORREÇÃO DA IMAGEM QUEBRADA)
app.get('/qrcode', async (req, res) => {
    try {
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const urlFinal = `${protocol}://${req.headers.host}/mobile`;
        const qrBuffer = await QRCode.toBuffer(urlFinal, { width: 400 });
        res.type('png').send(qrBuffer);
    } catch (err) { res.status(500).send("Erro"); }
});

app.post('/salvar-marketing', upload.single('imagemUpload'), (req, res) => {
    const { id, qtd, premio1, premio2 } = req.body;
    const idx = campanhas.findIndex(c => c.id == id);
    if (idx > -1) {
        campanhas[idx].qtd = parseInt(qtd);
        campanhas[idx].premio1 = premio1;
        campanhas[idx].premio2 = premio2;
        if (req.file) campanhas[idx].arquivo = req.file.filename;
        salvarBanco();
        io.emit('trocar_slide', { ...campanhas[idx], todasLojas: campanhas });
    }
    res.redirect('/marketing');
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    if (campanhas.length > 0) socket.emit('trocar_slide', { ...campanhas[0], todasLojas: campanhas });

    socket.on('resgatar_oferta', (dados) => {
        const c = campanhas[0];
        if (c && c.qtd > 0) {
            const cod = gerarCodigo(c.prefixo);
            const sorte = Math.random() * 100;
            let p = sorte > 90 ? c.premio2 : c.premio1;
            historicoVendas.push({ nome: dados.cliente.nome, zap: dados.cliente.zap, codigo: cod, premio: p, status: 'Emitido' });
            c.qtd--; salvarBanco();
            socket.emit('sucesso', { codigo: cod, produto: p });
            io.emit('aviso_vitoria_tv', { premio: p, loja: c.loja });
            io.emit('atualizar_qtd', { qtd: c.qtd });
        }
    });

    socket.on('validar_cupom', (cod) => {
        const cupom = historicoVendas.find(h => h.codigo === cod);
        if (!cupom) socket.emit('resultado_validacao', { msg: "❌ INVÁLIDO" });
        else if (cupom.status === 'Usado') socket.emit('resultado_validacao', { msg: "⚠️ JÁ USADO" });
        else { cupom.status = 'Usado'; socket.emit('resultado_validacao', { msg: "✅ VÁLIDO!" }); }
    });
});

server.listen(process.env.PORT || 3000, () => console.log("Cell Azul Online"));
