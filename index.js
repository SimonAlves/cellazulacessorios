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

function carregarBanco() {
    try {
        if (fs.existsSync(DB_FILE)) {
            campanhas = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } else {
            campanhas = [{ id: 0, loja: "Cell Azul", arquivo: "cell azul capa.jpg", modo: "sorte", cor: "#003399", qtd: 50, prefixo: "CELL", premio1: "10% OFF", premio2: "Relógio Smart", ehSorteio: true }];
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
// 1. PAINEL DE MARKETING (EDIÇÃO)
// ==================================================================
const renderMarketingPage = (lista) => `
<!DOCTYPE html>
<html>
<head>
    <title>Painel de Marketing</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Roboto', sans-serif; background: #f0f2f5; padding: 20px; max-width: 800px; margin: 0 auto; }
        .header { display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; }
        h1 { margin: 0; color: #333; }
        .card-new { background: #d4edda; padding: 20px; border-radius: 10px; border: 2px dashed #28a745; margin-bottom: 30px; }
        .card { background: white; padding: 20px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); border-left: 10px solid #ccc; }
        .row { display: flex; gap: 10px; margin-bottom: 10px; }
        .col { flex: 1; }
        label { font-weight: bold; font-size: 0.8rem; color: #666; display: block; margin-bottom: 5px; }
        input[type="text"], input[type="number"] { padding: 10px; border: 1px solid #ddd; border-radius: 5px; width: 100%; box-sizing: border-box; }
        .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; text-transform: uppercase; }
        .btn-add { background: #28a745; color: white; width: 100%; }
        .btn-save { background: #007bff; color: white; }
        .btn-del { background: #dc3545; color: white; margin-left: 10px; font-size: 0.8rem; padding: 5px 10px;}
        .btn-tv { background: #333; color: white; text-decoration: none; padding: 10px 15px; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="header"><h1>🛠️ Gestão Cell Azul</h1><a href="/tv" class="btn-tv" target="_blank">Ver TV 📺</a></div>
    <div class="card-new">
        <h2>➕ Nova Campanha</h2>
        <form action="/adicionar-loja" method="POST" enctype="multipart/form-data">
            <div class="row">
                <div class="col"><label>Nome da Loja:</label><input type="text" name="loja" required></div>
                <div class="col"><label>Imagem:</label><input type="file" name="imagemUpload" required accept="image/*"></div>
            </div>
            <div class="row">
                <div class="col"><label>Prêmio 1:</label><input type="text" name="premio1" value="10% OFF" required></div>
                <div class="col"><label>Prêmio 2:</label><input type="text" name="premio2" value="Relógio Smart" required></div>
            </div>
            <div class="row">
                <div class="col"><label>Cor:</label><input type="color" name="cor" value="#003399"></div>
                <div class="col"><label>Prefixo (3-4 letras):</label><input type="text" name="prefixo" maxlength="4" required></div>
            </div>
            <button type="submit" class="btn btn-add">CRIAR AGORA</button>
        </form>
    </div>
    <hr>
    ${lista.map(loja => `
        <div class="card" style="border-left-color: ${loja.cor}">
            <form action="/salvar-marketing" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="id" value="${loja.id}">
                <input type="hidden" name="arquivoAtual" value="${loja.arquivo}"> 
                <div style="display:flex; align-items:center; justify-content:space-between">
                    <h3 style="margin:0; color:${loja.cor}">#${loja.id} - ${loja.loja}</h3>
                </div>
                <div class="row">
                    <div class="col"><label>Qtd:</label><input type="number" name="qtd" value="${loja.qtd}"></div>
                    <div class="col"><label>Prefixo:</label><input type="text" name="prefixo" value="${loja.prefixo}"></div>
                </div>
                <button type="submit" class="btn btn-save">💾 SALVAR</button>
            </form>
        </div>
    `).join('')}
</body></html>`;

// ==================================================================
// 2. HTML TV (SOM DE VITÓRIA + OVERLAY)
// ==================================================================
const htmlTV = `<!DOCTYPE html><html><head><title>TV OFERTAS</title><script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script><style>body{margin:0;background:black;font-family:sans-serif;height:100vh;display:flex}#sidebar{flex:1;background:#222;color:white;text-align:center;padding:20px}#overlayVitoria{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;display:none;flex-direction:column;align-items:center;justify-content:center;color:#FFD700}</style></head><body><div id="overlayVitoria"><h1>🎉 TEM GANHADOR! 🎉</h1><h2 id="textoPremioTV"></h2></div><div style="flex:3;background:#000;display:flex;align-items:center;justify-content:center"><img id="imgPrincipal" style="max-width:100%;max-height:100%"></div><div id="sidebar"><h1>CELL AZUL</h1><div style="background:white;padding:10px;border-radius:10px"><img id="qrCode" style="width:100%"></div><h2 id="qtdDisplay" style="font-size:4rem;color:#FFD700">--</h2></div><script src="/socket.io/socket.io.js"></script><script>const socket=io();const audioTv=new Audio('/vitoria.mp3');socket.on('trocar_slide',d=>{document.getElementById('imgPrincipal').src='/'+d.arquivo;document.getElementById('qtdDisplay').innerText=d.qtd;fetch('/qrcode').then(r=>r.text()).then(u=>document.getElementById('qrCode').src=u)});socket.on('aviso_vitoria_tv',d=>{const o=document.getElementById('overlayVitoria');document.getElementById('textoPremioTV').innerText=d.premio;o.style.display='flex';audioTv.play().catch(e=>{});confetti();setTimeout(()=>o.style.display='none',6000)});</script></body></html>`;

// ==================================================================
// 3. HTML MOBILE (LGPD + WHATSAPP + VALIDAÇÃO)
// ==================================================================
const htmlMobile = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:sans-serif;text-align:center;padding:20px;background:#f0f2f5}input{width:90%;padding:15px;margin:10px 0;border-radius:5px;border:1px solid #ccc}.btn{padding:15px;width:100%;border-radius:5px;border:none;font-weight:bold;cursor:pointer}.btn-zap{background:#25D366;color:white;margin-top:10px}</style></head><body><div id="formCadastro"><h2>🎁 Quase lá!</h2><input type="text" id="cNome" placeholder="Nome Completo"><input type="tel" id="cZap" placeholder="(DD) 9XXXX-XXXX" oninput="mascaraZap(this)"><div style="text-align:left;font-size:0.8rem;margin:10px 0"><input type="checkbox" id="checkLGPD"> Autorizo o tratamento de dados (LGPD) e confirmo meu número.</div><button onclick="enviarCadastro()" style="background:#28a745;color:white" class="btn">LIBERAR MEU PRÊMIO</button></div><div id="telaVoucher" style="display:none"><h2>🎉 PARABÉNS!</h2><h1 id="nomePremio"></h1><div style="font-size:2rem;font-weight:900;border:2px dashed #333;padding:10px" id="codVoucher"></div><button onclick="enviarZap()" class="btn btn-zap">RECEBER NO WHATSAPP</button></div><script src="/socket.io/socket.io.js"></script><script>const socket=io();let dGanhos=null;const audio=new Audio('/vitoria.mp3');function mascaraZap(o){o.value=o.value.replace(/\\D/g,"").replace(/^(\\d\\d)(\\d)/g,"($1) $2").replace(/(\\d{5})(\\d)/,"$1-$2")}function enviarCadastro(){const n=document.getElementById('cNome').value;const z=document.getElementById('cZap').value;const l=document.getElementById('checkLGPD').checked;if(n.split(' ').length<2||z.replace(/\\D/g,"").length<11||!l){alert("Preencha Nome Completo, Telefone Válido e aceite a LGPD!");return}socket.emit('resgatar_oferta',{id:0,cliente:{nome:n,zap:z}})}socket.on('sucesso',d=>{dGanhos=d;document.getElementById('formCadastro').style.display='none';document.getElementById('telaVoucher').style.display='block';document.getElementById('nomePremio').innerText=d.produto;document.getElementById('codVoucher').innerText=d.codigo;audio.play().catch(e=>{})});function enviarZap(){const msg=encodeURIComponent("Olá! Ganhei o voucher "+dGanhos.codigo+" ("+dGanhos.produto+") na Cell Azul!");window.open("https://wa.me/55"+dGanhos.zap+"?text="+msg,"_blank")}</script></body></html>`;

// ==================================================================
// MOTOR DO SERVIDOR
// ==================================================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); 

let historicoVendas = []; 
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
    return `${prefixo}-${result}`; // LINHA CORRIGIDA SEM ESCAPE EXTRA
}

// ROTAS
app.get('/marketing', (req, res) => res.send(renderMarketingPage(campanhas)));
app.get('/tv', (req, res) => res.send(htmlTV));
app.get('/mobile', (req, res) => res.send(htmlMobile));
app.get('/caixa', (req, res) => res.send(`Validador Ativo`));
app.get('/', (req, res) => res.redirect('/tv'));
app.get('/qrcode', (req, res) => { const url = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/mobile`; QRCode.toDataURL(url, (e, s) => res.send(s)); });

// AÇÕES POST
app.post('/adicionar-loja', upload.single('imagemUpload'), (req, res) => {
    const { loja, cor, prefixo, premio1, premio2 } = req.body;
    campanhas.push({ id: Date.now(), loja, arquivo: req.file ? req.file.filename : 'padrao.jpg', cor, qtd: 50, prefixo: prefixo.toUpperCase(), premio1, premio2, ehSorteio: true });
    salvarBanco();
    res.redirect('/marketing');
});

io.on('connection', (socket) => {
    socket.on('resgatar_oferta', (dados) => {
        const camp = campanhas[0]; // Exemplo pega sempre a primeira campanha ativa
        if (camp && camp.qtd > 0) {
            const sorte = Math.random() * 100;
            let premio = sorte > 90 ? camp.premio2 : camp.premio1;
            const cod = gerarCodigo(camp.prefixo);
            historicoVendas.push({ data: new Date().toLocaleDateString(), loja: camp.loja, codigo: cod, premio: premio, clienteZap: dados.cliente.zap });
            camp.qtd--;
            salvarBanco();
            socket.emit('sucesso', { codigo: cod, produto: premio, zap: dados.cliente.zap.replace(/\D/g,"") });
            io.emit('aviso_vitoria_tv', { premio: premio });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
