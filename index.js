const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

// ==================================================================
// CONFIGURAÇÃO DE DIRETÓRIOS E UPLOAD
// ==================================================================
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); 
    }
});
const upload = multer({ storage: storage });

// ==================================================================
// BANCO DE DADOS E HISTÓRICO
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
                id: 0, loja: "Cell Azul Acessórios", arquivo: "cell azul capa.jpg", 
                cor: "#003399", qtd: 50, prefixo: "CELL", 
                premio1: "10% OFF", chance1: 90,
                premio2: "Relógio Smart", chance2: 10, ehSorteio: true 
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

function gerarCodigo(prefixo) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return `${prefixo.toUpperCase()}-${result}`;
}

// ==================================================================
// INTERFACES HTML (MARKETING, ADMIN, CAIXA, MOBILE, VOUCHER VISUAL)
// ==================================================================

// 1. MARKETING (EDIÇÃO)
const renderMarketingPage = (lista) => `
<!DOCTYPE html><html><head><title>Marketing - Cell Azul</title><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:sans-serif;background:#f0f2f5;padding:20px;max-width:800px;margin:0 auto}.card{background:white;padding:20px;margin-bottom:15px;border-radius:8px;box-shadow:0 2px 5px rgba(0,0,0,0.1);border-left:10px solid #003399}input{padding:10px;border:1px solid #ddd;border-radius:5px;width:100%;box-sizing:border-box}.btn{padding:12px;border:none;border-radius:5px;cursor:pointer;font-weight:bold;text-transform:uppercase;width:100%;margin-top:10px}.btn-save{background:#007bff;color:white}.btn-add{background:#28a745;color:white}</style></head>
<body><h1>🛠️ Painel de Edição</h1><p><a href="/admin">📊 Ver Planilha de Dados</a></p>
<div class="card" style="border-top:5px solid #28a745"><h2>➕ Nova Campanha</h2>
<form action="/adicionar-loja" method="POST" enctype="multipart/form-data">
<label>Loja:</label><input type="text" name="loja" required><label>Prefixo:</label><input type="text" name="prefixo" maxlength="4" required>
<label>Imagem:</label><input type="file" name="imagemUpload"><button type="submit" class="btn btn-add">CRIAR AGORA</button></form></div>
${lista.map(loja => `<div class="card"><h3>${loja.loja}</h3><form action="/salvar-marketing" method="POST" enctype="multipart/form-data"><input type="hidden" name="id" value="${loja.id}">
<label>Estoque:</label><input type="number" name="qtd" value="${loja.qtd}"><button type="submit" class="btn btn-save">ATUALIZAR</button></form></div>`).join('')}
</body></html>`;

// 2. ADMIN (RELATÓRIO)
const renderAdminPage = () => `
<!DOCTYPE html><html><head><title>Dados - Cell Azul</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#003399;color:white}</style></head>
<body><h1>📊 Clientes e Vouchers</h1><p><a href="/marketing">← Voltar para Edição</a></p><a href="/baixar-relatorio" style="background:#1d6f42;color:white;padding:10px;text-decoration:none;border-radius:5px;">📥 BAIXAR CSV</a>
<table><thead><tr><th>Data</th><th>Cliente</th><th>WhatsApp</th><th>Prêmio</th><th>Cupom</th><th>Status</th></tr></thead>
<tbody>${historicoVendas.map(h => `<tr><td>${h.data}</td><td>${h.clienteNome}</td><td>${h.clienteZap}</td><td>${h.premio}</td><td><b>${h.codigo}</b></td><td>${h.status}</td></tr>`).reverse().join('')}</tbody></table>
</body></html>`;

// 3. CAIXA (VALIDADOR E BLOQUEADOR)
const htmlCaixa = `<!DOCTYPE html><html><head><title>Caixa</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:sans-serif;text-align:center;padding:20px;background:#f4f4f4}input{padding:15px;font-size:1.2rem;width:80%;max-width:300px;margin:20px 0;border-radius:8px;border:2px solid #ddd}.btn{padding:15px 30px;background:#003399;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer}.res{margin-top:20px;padding:20px;border-radius:10px;display:none}</style></head>
<body><div style="background:white;padding:20px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,0.1)"><h1>📟 Validador de Caixa</h1><input type="text" id="cod" placeholder="Código: EX: CELL-A1B2"><br><button class="btn" onclick="validar()">CONFERIR VOUCHER</button><div id="box" class="res"></div></div>
<script src="/socket.io/socket.io.js"></script><script>const socket=io();function validar(){socket.emit('validar_cupom',document.getElementById('cod').value.toUpperCase())}
socket.on('resultado_validacao',d=>{const b=document.getElementById('box');b.style.display='block';b.style.background=d.sucesso?'#d4edda':'#f8d7da';b.innerHTML='<h3>'+d.msg+'</h3><p>'+(d.detalhe||'')+'</p>';})</script></body></html>`;

// 4. MOBILE (FORMULÁRIO + LGPD)
const htmlMobile = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:sans-serif;text-align:center;padding:20px;background:#003399;color:#fff}#form{background:#fff;color:#333;padding:20px;border-radius:15px}input{width:90%;padding:12px;margin:10px 0;border:1px solid #ccc;border-radius:5px}.btn{background:#FFD700;color:#003399;padding:15px;width:100%;border:none;border-radius:5px;font-weight:bold;cursor:pointer}</style></head>
<body><h2>🎁 Sorteio Cell Azul</h2><div id="form"><h3>Preencha seus dados reais:</h3><input type="text" id="nome" placeholder="Nome Completo"><input type="tel" id="zap" placeholder="(DD) 9XXXX-XXXX">
<div style="font-size:0.7rem;text-align:left;margin:10px 0"><input type="checkbox" id="lgpd"> Autorizo o uso dos dados (LGPD) e confirmo que meu WhatsApp é verdadeiro.</div>
<button class="btn" onclick="participar()">TENTAR A SORTE 🍀</button></div><div id="voucher" style="display:none;background:#fff;color:#000;padding:20px;border-radius:15px;margin-top:20px"><h2>🎉 PARABÉNS!</h2><h1 id="pNome"></h1><div id="vCod" style="font-size:2rem;font-weight:900;border:2px dashed #003399;margin:10px 0"></div>
<button class="btn" style="background:#25D366;color:#fff" onclick="enviarZap()">📱 BAIXAR NO MEU WHATSAPP</button></div>
<script src="/socket.io/socket.io.js"></script><script>const socket=io();const audio=new Audio('/vitoria.mp3');let dG;
function participar(){const n=document.getElementById('nome').value;const z=document.getElementById('zap').value;const l=document.getElementById('lgpd').checked;if(n.trim().split(' ').length<2||z.replace(/\\D/g,'').length<11||!l){alert('Digite Nome e Sobrenome, Telefone com DDD e aceite a LGPD!');return}socket.emit('resgatar_oferta',{id:0,cliente:{nome:n,zap:z}})}
socket.on('sucesso',d=>{dG=d;document.getElementById('form').style.display='none';document.getElementById('voucher').style.display='block';document.getElementById('pNome').innerText=d.produto;document.getElementById('vCod').innerText=d.codigo;audio.play().catch(e=>{})});
function enviarZap(){const link=window.location.origin+'/ver-voucher/'+dG.codigo;const msg=encodeURIComponent('Ganhei na Cell Azul! Veja meu voucher: '+link);window.open('https://wa.me/55'+dG.zap.replace(/\\D/g,'')+'?text='+msg,'_blank')}</script></body></html>`;

// ==================================================================
// MOTOR DO SERVIDOR
// ==================================================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => res.send(`<h1>🚀 Cell Azul Online</h1><a href="/marketing">Marketing</a> | <a href="/admin">Dados</a> | <a href="/caixa">Caixa</a>`));
app.get('/marketing', (req, res) => res.send(renderMarketingPage(campanhas)));
app.get('/admin', (req, res) => res.send(renderAdminPage()));
app.get('/caixa', (req, res) => res.send(htmlCaixa));
app.get('/mobile', (req, res) => res.send(htmlMobile));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'publictv.html')));

// ROTA VOUCHER BONITO (VISUAL)
app.get('/ver-voucher/:codigo', (req, res) => {
    const cupom = historicoVendas.find(h => h.codigo === req.params.codigo.toUpperCase());
    if (!cupom) return res.send("Voucher não encontrado.");
    res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{background:#f0f2f5;font-family:sans-serif;display:flex;justify-content:center;padding-top:50px}
    .ticket{background:white;width:300px;border-radius:15px;box-shadow:0 10px 30px rgba(0,0,0,0.1);border:2px solid #003399;overflow:hidden;text-align:center}
    .header{background:#003399;color:white;padding:15px}.content{padding:20px}.codigo{font-size:2rem;border:2px dashed #003399;margin:15px 0;font-family:monospace;background:white}</style></head>
    <body><div class="ticket"><div class="header"><h2>CELL AZUL</h2></div><div class="content"><p>Parabéns, <b>${cupom.clienteNome}</b>!</p><div style="font-size:1.4rem;color:#003399">${cupom.premio}</div><div class="codigo">${cupom.codigo}</div><p>Apresente no caixa.</p></div></div></body></html>`);
});

app.get('/qrcode', (req, res) => { const url = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/mobile`; QRCode.toDataURL(url, (e, s) => res.send(s)); });

app.get('/baixar-relatorio', (req, res) => {
    let csv = "DATA;CLIENTE;ZAP;PREMIO;CUPOM;STATUS\n";
    historicoVendas.forEach(h => csv += `${h.data};${h.clienteNome};${h.clienteZap};${h.premio};${h.codigo};${h.status}\n`);
    res.attachment('Dados_CellAzul.csv').send("\uFEFF" + csv);
});

app.post('/adicionar-loja', upload.single('imagemUpload'), (req, res) => {
    const { loja, prefixo } = req.body;
    campanhas.push({ id: Date.now(), loja, arquivo: req.file ? req.file.filename : "cell azul capa.jpg", cor: "#003399", prefixo: prefixo.toUpperCase(), premio1: "10% OFF", chance1: 90, premio2: "Relógio Smart", chance2: 10, qtd: 50 });
    salvarBanco(); res.redirect('/marketing');
});

app.post('/salvar-marketing', (req, res) => {
    const { id, qtd } = req.body;
    const idx = campanhas.findIndex(c => c.id == id);
    if (idx > -1) { campanhas[idx].qtd = parseInt(qtd); salvarBanco(); }
    res.redirect('/marketing');
});

io.on('connection', (socket) => {
    socket.on('resgatar_oferta', (dados) => {
        const camp = campanhas[0];
        if (camp && camp.qtd > 0) {
            const sorte = Math.random() * 100;
            let premio = (sorte <= camp.chance2) ? camp.premio2 : camp.premio1;
            const cod = gerarCodigo(camp.prefixo);
            historicoVendas.push({ data: new Date().toLocaleString('pt-BR'), codigo: cod.toUpperCase(), premio: premio, status: 'Emitido', clienteNome: dados.cliente.nome, clienteZap: dados.cliente.zap });
            camp.qtd--; salvarBanco();
            socket.emit('sucesso', { codigo: cod, produto: premio, zap: dados.cliente.zap });
            io.emit('aviso_vitoria_tv', { premio: premio, loja: camp.loja });
        }
    });

    socket.on('validar_cupom', (cod) => {
        const cupom = historicoVendas.find(h => h.codigo === cod.toUpperCase());
        if (!cupom) socket.emit('resultado_validacao', { sucesso: false, msg: "❌ INVÁLIDO" });
        else if (cupom.status === 'Usado') socket.emit('resultado_validacao', { sucesso: false, msg: "⚠️ JÁ UTILIZADO" });
        else {
            cupom.status = 'Usado';
            socket.emit('resultado_validacao', { sucesso: true, msg: "✅ VÁLIDO!", detalhe: `Entregar: ${cupom.premio}` });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
