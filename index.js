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
// BANCO DE DADOS (DATABASE.JSON)
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
                cor: "#003399", qtd: 20, prefixo: "CELL", 
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
// INTERFACES HTML EMBUTIDAS (MARKETING, CAIXA E MOBILE)
// ==================================================================

const renderMarketingPage = (lista) => `
<!DOCTYPE html><html><head><title>Painel Cell Azul</title><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:sans-serif;background:#f0f2f5;padding:20px;max-width:900px;margin:0 auto}.card{background:white;padding:20px;margin-bottom:15px;border-radius:8px;box-shadow:0 2px 5px rgba(0,0,0,0.1);border-left:10px solid #ccc}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}label{font-weight:bold;font-size:0.8rem;color:#666;display:block;margin:5px 0}input{padding:10px;border:1px solid #ddd;border-radius:5px;width:100%;box-sizing:border-box}.btn{padding:12px;border:none;border-radius:5px;cursor:pointer;font-weight:bold;text-transform:uppercase;width:100%;margin-top:10px}.btn-add{background:#28a745;color:white}.btn-save{background:#007bff;color:white}.btn-del{background:#dc3545;color:white;width:auto;padding:5px 10px}</style></head>
<body><h1>⚙️ Gestão Cell Azul Acessórios</h1>
<div class="card" style="border-top:5px solid #28a745"><h2>➕ Nova Campanha</h2>
<form action="/adicionar-loja" method="POST" enctype="multipart/form-data"><div class="grid">
<div><label>Loja:</label><input type="text" name="loja" required></div><div><label>Prefixo Cupom:</label><input type="text" name="prefixo" maxlength="4" required></div>
<div><label>Prêmio 1 (Comum):</label><input type="text" name="premio1" value="10% OFF"></div><div><label>Chance 1 (%):</label><input type="number" name="chance1" value="90"></div>
<div><label>Prêmio 2 (Raro):</label><input type="text" name="premio2" value="Relógio Smart"></div><div><label>Chance 2 (%):</label><input type="number" name="chance2" value="10"></div>
</div><label>Imagem (Vazio usa "cell azul capa.jpg"):</label><input type="file" name="imagemUpload"><button type="submit" class="btn btn-add">CRIAR AGORA</button></form></div>
${lista.map(loja => `
<div class="card" style="border-left-color:${loja.cor}"><form action="/salvar-marketing" method="POST" enctype="multipart/form-data"><input type="hidden" name="id" value="${loja.id}">
<h3>Campanha: ${loja.loja}</h3><div class="grid">
<div><label>Prêmio 1:</label><input type="text" name="premio1" value="${loja.premio1}"></div><div><label>Chance 1 (%):</label><input type="number" name="chance1" value="${loja.chance1}"></div>
<div><label>Prêmio 2:</label><input type="text" name="premio2" value="${loja.premio2}"></div><div><label>Chance 2 (%):</label><input type="number" name="chance2" value="${loja.chance2}"></div>
<div><label>Qtd Restante:</label><input type="number" name="qtd" value="${loja.qtd}"></div></div><button type="submit" class="btn btn-save">SALVAR MUDANÇAS</button></form>
<form action="/deletar-loja" method="POST" onsubmit="return confirm('Excluir?')"><input type="hidden" name="id" value="${loja.id}"><button type="submit" class="btn btn-del">🗑️</button></form></div>`).join('')}
</body></html>`;

const htmlCaixa = `<!DOCTYPE html><html><head><title>Caixa - Validador</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:sans-serif;text-align:center;padding:20px;background:#f4f4f4}input{padding:15px;font-size:1.2rem;width:80%;max-width:300px;margin:20px 0;border-radius:8px;border:1px solid #ccc}button{padding:15px 30px;background:#222;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer}.res{margin-top:20px;padding:20px;background:white;border-radius:10px;display:none;box-shadow:0 2px 10px rgba(0,0,0,0.1)}</style></head><body><h1>📟 Validador Cell Azul</h1><input type="text" id="cod" placeholder="DIGITE O CÓDIGO"><br><button onclick="validar()">VERIFICAR</button><div id="box" class="res"><h2 id="msg"></h2><p id="det"></p></div><script src="/socket.io/socket.io.js"></script><script>const socket=io();function validar(){socket.emit('validar_cupom',document.getElementById('cod').value.toUpperCase())}socket.on('resultado_validacao',d=>{const b=document.getElementById('box');b.style.display='block';document.getElementById('msg').innerText=d.msg;document.getElementById('msg').style.color=d.sucesso?'green':'red';document.getElementById('det').innerText=d.detalhe||''})</script></body></html>`;

const htmlMobile = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:sans-serif;text-align:center;padding:20px;background:#003399;color:#fff}#form{background:#fff;color:#333;padding:20px;border-radius:15px;box-shadow:0 5px 15px rgba(0,0,0,0.3)}input{width:90%;padding:12px;margin:10px 0;border-radius:5px;border:1px solid #ccc;font-size:1rem}.btn{background:#FFD700;color:#003399;padding:15px;width:100%;border:none;border-radius:5px;font-weight:bold;font-size:1.1rem;cursor:pointer}#voucher{display:none;background:#fff;color:#000;padding:20px;border-radius:15px;margin-top:20px}.code{font-size:2rem;font-weight:900;color:red;border:2px dashed red;padding:10px;margin:10px 0}</style></head><body><h2>🎁 Sorteio Cell Azul</h2><div id="form"><h3>Cadastre-se para ganhar:</h3><input type="text" id="nome" placeholder="Nome Completo"><input type="tel" id="zap" placeholder="WhatsApp (DDD+Número)"><div style="font-size:0.8rem;margin:10px 0;text-align:left"><input type="checkbox" id="lgpd"> Autorizo o tratamento de dados conforme LGPD para fins de sorteio.</div><button class="btn" onclick="participar()">TENTAR A SORTE 🍀</button></div><div id="voucher"><h2>🎉 PARABÉNS!</h2><p id="lojaNome"></p><p>Você ganhou:</p><h3 id="premioNome"></h3><div class="code" id="codFinal"></div><p>Apresente este código no caixa para resgatar!</p></div><script src="/socket.io/socket.io.js"></script><script>const socket=io();function participar(){const n=document.getElementById('nome').value;const z=document.getElementById('zap').value;const l=document.getElementById('lgpd').checked;if(!n||z.length<10||!l){alert('Preencha seu nome, WhatsApp e aceite os termos!');return}const urlParams=new URLSearchParams(window.location.search);const id=urlParams.get('id')||0;socket.emit('resgatar_oferta',{id,cliente:{nome:n,zap:z}})}socket.on('sucesso',d=>{document.getElementById('form').style.display='none';document.getElementById('voucher').style.display='block';document.getElementById('lojaNome').innerText=d.loja;document.getElementById('premioNome').innerText=d.produto;document.getElementById('codFinal').innerText=d.codigo;})</script></body></html>`;

// ==================================================================
// MOTOR DO SERVIDOR (EXPRESS + SOCKET.IO)
// ==================================================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

let slideAtual = 0;

// Loop para troca automática na TV
setInterval(() => {
    if (campanhas.length > 0) {
        slideAtual = (slideAtual + 1) % campanhas.length;
        io.emit('trocar_slide', { ...campanhas[slideAtual], todasLojas: campanhas });
    }
}, 25000);

// ROTAS
app.get('/', (req, res) => {
    res.send(`
        <body style="font-family:sans-serif; text-align:center; padding:50px; background:#f0f2f5;">
            <h1>🚀 Sistema Cell Azul Acessórios Ativo</h1>
            <div style="display:inline-block; text-align:left; background:white; padding:30px; border-radius:15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <p>⚙️ <a href="/marketing">Painel de Marketing</a> (Editar prêmios e chances)</p>
                <p>📺 <a href="/tv">Link da TV</a> (Exibir na loja)</p>
                <p>📟 <a href="/caixa">Link do Caixa</a> (Validar cupons)</p>
                <p>📱 <a href="/mobile">Link do Cliente</a> (Simulação de sorteio)</p>
            </div>
        </body>
    `);
});

app.get('/marketing', (req, res) => res.send(renderMarketingPage(campanhas)));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'publictv.html')));
app.get('/caixa', (req, res) => res.send(htmlCaixa));
app.get('/mobile', (req, res) => res.send(htmlMobile));

app.get('/qrcode', (req, res) => {
    const url = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/mobile`;
    QRCode.toDataURL(url, (e, s) => res.send(s));
});

// AÇÕES DO PAINEL
app.post('/adicionar-loja', upload.single('imagemUpload'), (req, res) => {
    const { loja, prefixo, premio1, premio2, chance1, chance2 } = req.body;
    campanhas.push({
        id: Date.now(), loja,
        arquivo: req.file ? req.file.filename : "cell azul capa.jpg",
        cor: "#003399", prefixo: prefixo.toUpperCase(),
        premio1, chance1: parseFloat(chance1),
        premio2, chance2: parseFloat(chance2),
        qtd: 50, ehSorteio: true
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
        if (req.file) campanhas[idx].arquivo = req.file.filename;
        salvarBanco();
    }
    res.redirect('/marketing');
});

app.post('/deletar-loja', (req, res) => {
    campanhas = campanhas.filter(c => c.id != req.body.id);
    salvarBanco();
    res.redirect('/marketing');
});

// SOCKET.IO - COMUNICAÇÃO
io.on('connection', (socket) => {
    socket.on('resgatar_oferta', (dados) => {
        const camp = campanhas.find(c => c.id == dados.id);
        if (camp && camp.qtd > 0) {
            const sorte = Math.random() * 100;
            let premioFinal = (sorte <= camp.chance2) ? camp.premio2 : camp.premio1;
            const cod = gerarCodigo(camp.prefixo);
            
            historicoVendas.push({
                codigo: cod, loja: camp.loja, premio: premioFinal,
                status: 'Emitido', clienteNome: dados.cliente.nome,
                clienteZap: dados.cliente.zap, data: new Date().toLocaleString()
            });

            camp.qtd--;
            salvarBanco();
            socket.emit('sucesso', { codigo: cod, produto: premioFinal, loja: camp.loja });
            io.emit('atualizar_qtd', { id: camp.id, qtd: camp.qtd });
            io.emit('aviso_vitoria_tv', { loja: camp.loja, premio: premioFinal });
        }
    });

    socket.on('validar_cupom', (cod) => {
        const cupom = historicoVendas.find(h => h.codigo === cod.toUpperCase());
        if (!cupom) socket.emit('resultado_validacao', { sucesso: false, msg: "CÓDIGO INVÁLIDO" });
        else if (cupom.status === 'Usado') socket.emit('resultado_validacao', { sucesso: false, msg: "JÁ UTILIZADO!" });
        else {
            cupom.status = 'Usado';
            socket.emit('resultado_validacao', { sucesso: true, msg: "✅ VÁLIDO!", detalhe: `${cupom.premio} para ${cupom.clienteNome}` });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Cell Azul Online: http://localhost:${PORT}`));
