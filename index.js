const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

// ==================================================================
// 1. CONFIGURAÇÕES INICIAIS E UPLOAD
// ==================================================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); 
    }
});
const upload = multer({ storage: storage });

// ==================================================================
// 2. BANCO DE DADOS E HISTÓRICO
// ==================================================================
const DB_FILE = './database.json';
let campanhas = [];
let historicoVendas = []; 

function carregarBanco() {
    try {
        if (fs.existsSync(DB_FILE)) {
            campanhas = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } else {
            // Campanha padrão Cell Azul
            campanhas = [{ 
                id: 0, loja: "Cell Azul Acessórios", arquivo: "cell azul capa.jpg", 
                cor: "#003399", qtd: 50, prefixo: "CELL", 
                premio1: "10% OFF", chance1: 90,
                premio2: "Relógio Smart", chance2: 10, ehSorteio: true 
            }];
            salvarBanco();
        }
    } catch (err) { console.error("Erro ao carregar banco:", err); }
}

function salvarBanco() {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(campanhas, null, 2)); } 
    catch (err) { console.error("Erro ao salvar banco:", err); }
}
carregarBanco();

function gerarCodigo(prefixo) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return `${prefixo.toUpperCase()}-${result}`;
}

// ==================================================================
// 3. TEMPLATES HTML INTEGRADOS
// ==================================================================

// MARKETING - Painel de Edição
const renderMarketing = (lista) => `
<!DOCTYPE html><html><head><title>Marketing - Cell Azul</title><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:sans-serif;background:#f0f2f5;padding:20px;max-width:800px;margin:0 auto}.card{background:white;padding:20px;margin-bottom:15px;border-radius:8px;box-shadow:0 2px 5px rgba(0,0,0,0.1);border-left:10px solid #003399}input{padding:10px;margin:5px 0;width:100%;box-sizing:border-box}.btn{background:#003399;color:white;padding:10px;border:none;border-radius:5px;cursor:pointer;font-weight:bold}</style></head>
<body><h1>🛠️ Painel de Edição</h1><p><a href="/admin">📊 Ver Dados de Clientes</a> | <a href="/tv">📺 Ver TV</a></p>
${lista.map(loja => `<div class="card"><h3>${loja.loja}</h3><form action="/salvar-marketing" method="POST"><input type="hidden" name="id" value="${loja.id}"><label>Qtd Estoque:</label><input type="number" name="qtd" value="${loja.qtd}"><button type="submit" class="btn">SALVAR</button></form></div>`).join('')}
</body></html>`;

// ADMIN - Relatório de Clientes e LGPD
const htmlAdmin = `<!DOCTYPE html><html><head><title>Admin - Cell Azul</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}th{background:#003399;color:white}</style></head>
<body><h1>📊 Relatório de Leads</h1><p><a href="/marketing">← Voltar</a></p>
<table border="1"><thead><tr><th>Data</th><th>Nome</th><th>WhatsApp</th><th>Prêmio</th><th>Cupom</th><th>Status</th></tr></thead><tbody id="lista"></tbody></table>
<script src="/socket.io/socket.io.js"></script><script>const socket=io();socket.on('dados_admin',d=>{document.getElementById('lista').innerHTML=d.map(h=>"<tr><td>"+h.data+"</td><td>"+h.clienteNome+"</td><td>"+h.clienteZap+"</td><td>"+h.premio+"</td><td><b>"+h.codigo+"</b></td><td>"+h.status+"</td></tr>").reverse().join("");});</script></body></html>`;

// CAIXA - Validador de Cupom Único
const htmlCaixa = `<!DOCTYPE html><html><head><title>Caixa - Cell Azul</title><style>body{font-family:sans-serif;text-align:center;padding:50px}input{padding:15px;font-size:1.5rem;width:80%;max-width:300px;border-radius:10px;border:2px solid #ddd}button{padding:15px;background:#003399;color:white;border:none;border-radius:10px;cursor:pointer;font-weight:bold}</style></head>
<body><h1>📟 Validador de Caixa</h1><input type="text" id="c" placeholder="CÓDIGO VOUCHER"><br><br><button onclick="v()">VALIDAR VOUCHER</button><h2 id="r"></h2>
<script src="/socket.io/socket.io.js"></script><script>const socket=io();function v(){socket.emit('validar_cupom',document.getElementById('c').value.toUpperCase())}socket.on('resultado_validacao',d=>{const r=document.getElementById('r');r.innerText=d.msg;r.style.color=d.sucesso?'green':'red';});</script></body></html>`;

// ==================================================================
// 4. MOTOR DO SERVIDOR E ROTAS
// ==================================================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => res.send('<h1>🚀 Cell Azul Online</h1><a href="/marketing">Marketing</a> | <a href="/admin">Admin</a> | <a href="/caixa">Caixa</a> | <a href="/tv">TV</a>'));
app.get('/marketing', (req, res) => res.send(renderMarketing(campanhas)));
app.get('/admin', (req, res) => res.send(htmlAdmin));
app.get('/caixa', (req, res) => res.send(htmlCaixa));
app.get('/mobile', (req, res) => res.sendFile(path.join(__dirname, 'public', 'mobile.html')));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'publictv.html')));

app.get('/qrcode', (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const url = `${protocol}://${req.headers.host}/mobile`;
    QRCode.toDataURL(url, (e, s) => res.send(s));
});

// Rota para o Voucher Visual Bonito
app.get('/ver-voucher/:codigo', (req, res) => {
    const cupom = historicoVendas.find(h => h.codigo === req.params.codigo.toUpperCase());
    if (!cupom) return res.send("Voucher não encontrado.");
    res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{background:#f0f2f5;font-family:sans-serif;display:flex;justify-content:center;padding-top:50px}.ticket{background:white;width:300px;border-radius:15px;box-shadow:0 10px 30px rgba(0,0,0,0.1);border:2px solid #003399;overflow:hidden;text-align:center}.header{background:#003399;color:white;padding:15px}.codigo{font-size:2rem;border:2px dashed #003399;margin:15px;padding:10px;font-family:monospace}</style></head>
    <body><div class="ticket"><div class="header"><h2>CELL AZUL</h2></div><div style="padding:20px"><p>Parabéns, <b>${cupom.clienteNome}</b>!</p><div style="font-size:1.5rem;color:#003399;font-weight:bold">${cupom.premio}</div><div class="codigo">${cupom.codigo}</div><p>Apresente no caixa para validar.</p></div></div></body></html>`);
});

app.post('/salvar-marketing', (req, res) => {
    const { id, qtd } = req.body;
    const idx = campanhas.findIndex(c => c.id == id);
    if (idx > -1) { campanhas[idx].qtd = parseInt(qtd); salvarBanco(); }
    res.redirect('/marketing');
});

// ==================================================================
// 5. LÓGICA SOCKET.IO (TEMPO REAL E SEGURANÇA)
// ==================================================================
io.on('connection', (socket) => {
    socket.emit('dados_admin', historicoVendas);
    
    // Resgate de Oferta com Validação de LGPD e Filtro
    socket.on('resgatar_oferta', (dados) => {
        const camp = campanhas[0];
        if (camp && camp.qtd > 0) {
            const sorte = Math.random() * 100;
            let premio = (sorte <= camp.chance2) ? camp.premio2 : camp.premio1;
            const cod = gerarCodigo(camp.prefixo);
            
            historicoVendas.push({ 
                data: new Date().toLocaleDateString('pt-BR'), 
                codigo: cod, 
                premio, 
                status: 'Emitido', 
                clienteNome: dados.cliente.nome, 
                clienteZap: dados.cliente.zap 
            });

            camp.qtd--; 
            salvarBanco();

            socket.emit('sucesso', { codigo: cod, produto: premio, zap: dados.cliente.zap });
            io.emit('aviso_vitoria_tv', { premio, loja: camp.loja }); // Toca som e mostra na TV
            io.emit('dados_admin', historicoVendas);
        }
    });

    // Validação no Caixa e Bloqueio de Reuso
    socket.on('validar_cupom', (cod) => {
        const cupom = historicoVendas.find(h => h.codigo === cod.toUpperCase());
        if (!cupom) socket.emit('resultado_validacao', { sucesso: false, msg: "❌ INVÁLIDO" });
        else if (cupom.status === 'Usado') socket.emit('resultado_validacao', { sucesso: false, msg: "⚠️ JÁ UTILIZADO" });
        else {
            cupom.status = 'Usado';
            socket.emit('resultado_validacao', { sucesso: true, msg: "✅ VÁLIDO!", detalhe: `Liberar: ${cupom.premio}` });
            io.emit('dados_admin', historicoVendas);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
