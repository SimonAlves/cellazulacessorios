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

// --- 1. CONFIGURAÇÕES DE UPLOAD E PASTAS ---
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); 
    }
});
const upload = multer({ storage: storage });

// --- 2. BANCO DE DADOS E HISTÓRICO ---
const DB_FILE = './database.json';
let campanhas = [];
let historicoVendas = []; 

function carregarBanco() {
    try {
        if (fs.existsSync(DB_FILE)) {
            campanhas = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } else {
            campanhas = [{ 
                id: Date.now(), loja: "Criativo Zone", arquivo: "padrao.jpg", 
                cor: "#003399", qtd: 50, prefixo: "CRI", 
                premio1: "10% OFF", chance1: 90,
                premio2: "Brinde Especial", chance2: 10, ehSorteio: true 
            }];
            salvarBanco();
        }
    } catch (err) { console.error("Erro DB:", err); }
}
function salvarBanco() { fs.writeFileSync(DB_FILE, JSON.stringify(campanhas, null, 2)); }
carregarBanco();

function gerarCodigo(prefixo) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return `${prefixo.toUpperCase()}-${result}`;
}

// --- 3. TEMPLATES HTML INTEGRADOS ---

const renderMarketing = (lista) => `
<!DOCTYPE html><html><head><title>Marketing - Painel</title>
<style>body{font-family:sans-serif;background:#f0f2f5;padding:20px;max-width:900px;margin:0 auto}.card{background:white;padding:20px;margin-bottom:15px;border-radius:8px;box-shadow:0 2px 5px rgba(0,0,0,0.1);border-left:10px solid #003399}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}label{font-weight:bold;font-size:0.8rem;color:#666;display:block;margin:5px 0}input{padding:10px;border:1px solid #ddd;border-radius:5px;width:100%;box-sizing:border-box}button{background:#003399;color:white;padding:12px;border:none;border-radius:5px;cursor:pointer;font-weight:bold;width:100%;margin-top:10px}.btn-del{background:#dc3545;margin-top:10px}</style></head>
<body><h1>🛠️ Painel de Marketing e Promoções</h1><p><a href="/admin">📊 Admin Dados</a> | <a href="/tv">📺 Abrir TV</a></p>
<div class="card" style="border-top:5px solid #28a745"><h2>➕ Nova Campanha</h2>
<form action="/adicionar-loja" method="POST" enctype="multipart/form-data"><div class="grid">
<div><label>Loja:</label><input type="text" name="loja" required></div><div><label>Prefixo:</label><input type="text" name="prefixo" maxlength="4" required></div>
<div><label>Prêmio 1:</label><input type="text" name="premio1" value="10% OFF"></div><div><label>Chance 1 (%):</label><input type="number" name="chance1" value="90"></div>
<div><label>Prêmio 2:</label><input type="text" name="premio2" value="Brinde Especial"></div><div><label>Chance 2 (%):</label><input type="number" name="chance2" value="10"></div>
</div><label>Imagem:</label><input type="file" name="imagemUpload"><button type="submit">CRIAR AGORA</button></form></div>
${lista.map(loja => `<div class="card"><h3>Editando: ${loja.loja}</h3><form action="/salvar-marketing" method="POST" enctype="multipart/form-data"><input type="hidden" name="id" value="${loja.id}">
<div class="grid"><div><label>Prêmio 1:</label><input type="text" name="premio1" value="${loja.premio1}"></div><div><label>Chance 1:</label><input type="number" name="chance1" value="${loja.chance1}"></div>
<div><label>Prêmio 2:</label><input type="text" name="premio2" value="${loja.premio2}"></div><div><label>Chance 2:</label><input type="number" name="chance2" value="${loja.chance2}"></div>
<div><label>Estoque:</label><input type="number" name="qtd" value="${loja.qtd}"></div><div><label>Cor Tema:</label><input type="color" name="cor" value="${loja.cor}"></div>
</div><label>Trocar Imagem:</label><input type="file" name="imagemUpload"><button type="submit">SALVAR</button></form>
<form action="/deletar-loja" method="POST" onsubmit="return confirm('Excluir?')"><input type="hidden" name="id" value="${loja.id}"><button type="submit" class="btn-del">🗑️ DELETAR</button></form></div>`).join('')}
</body></html>`;

// --- 4. ROTAS ---
app.get('/', (req, res) => res.send('<h1>🚀 Sistema Ativo</h1><a href="/marketing">Marketing</a> | <a href="/admin">Admin</a> | <a href="/caixa">Caixa</a> | <a href="/tv">TV</a>'));
app.get('/marketing', (req, res) => res.send(renderMarketing(campanhas)));
app.get('/admin', (req, res) => res.send(htmlAdmin));
app.get('/caixa', (req, res) => res.send(htmlCaixa));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'publictv.html')));

app.get('/qrcode', (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const url = `${protocol}://${req.headers.host}/mobile`;
    QRCode.toDataURL(url, (e, s) => res.send(s));
});

// AÇÕES POST
app.post('/adicionar-loja', upload.single('imagemUpload'), (req, res) => {
    const { loja, prefixo, premio1, chance1, premio2, chance2, cor } = req.body;
    campanhas.push({ id: Date.now(), loja, arquivo: req.file ? req.file.filename : 'padrao.jpg', cor, prefixo: prefixo.toUpperCase(), premio1, chance1: parseFloat(chance1), premio2, chance2: parseFloat(chance2), qtd: 50 });
    salvarBanco(); res.redirect('/marketing');
});

app.post('/salvar-marketing', upload.single('imagemUpload'), (req, res) => {
    const { id, premio1, chance1, premio2, chance2, qtd, cor } = req.body;
    const idx = campanhas.findIndex(c => c.id == id);
    if (idx > -1) {
        campanhas[idx].premio1 = premio1;
        campanhas[idx].chance1 = parseFloat(chance1);
        campanhas[idx].premio2 = premio2;
        campanhas[idx].chance2 = parseFloat(chance2);
        campanhas[idx].qtd = parseInt(qtd);
        campanhas[idx].cor = cor;
        if (req.file) campanhas[idx].arquivo = req.file.filename;
        salvarBanco();
    }
    res.redirect('/marketing');
});

app.post('/deletar-loja', (req, res) => {
    campanhas = campanhas.filter(c => c.id != req.body.id);
    salvarBanco(); res.redirect('/marketing');
});

// --- 5. SOCKET.IO ---
io.on('connection', (socket) => {
    const campAtual = campanhas[0];
    if (campAtual) socket.emit('trocar_slide', { ...campAtual, todasLojas: campanhas });

    socket.on('resgatar_oferta', (dados) => {
        const camp = campanhas[0];
        if (camp && camp.qtd > 0) {
            const sorte = Math.random() * 100;
            let premio = (sorte <= camp.chance2) ? camp.premio2 : camp.premio1;
            const cod = gerarCodigo(camp.prefixo);
            historicoVendas.push({ data: new Date().toLocaleDateString(), codigo: cod, premio, status: 'Emitido', clienteNome: dados.cliente.nome, clienteZap: dados.cliente.zap });
            camp.qtd--; salvarBanco();
            socket.emit('sucesso', { codigo: cod, produto: premio, zap: dados.cliente.zap });
            io.emit('aviso_vitoria_tv', { premio, loja: camp.loja });
            io.emit('atualizar_qtd', { qtd: camp.qtd });
        }
    });

    socket.on('validar_cupom', (cod) => {
        const cupom = historicoVendas.find(h => h.codigo === cod.toUpperCase());
        if (!cupom) socket.emit('resultado_validacao', { sucesso: false, msg: "❌ INVÁLIDO" });
        else if (cupom.status === 'Usado') socket.emit('resultado_validacao', { sucesso: false, msg: "⚠️ JÁ USADO" });
        else { cupom.status = 'Usado'; socket.emit('resultado_validacao', { sucesso: true, msg: "✅ VÁLIDO!" }); }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
