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

// ==================================================================
// CONFIGURAÇÕES DE ARQUIVOS E BANCO DE DADOS
// ==================================================================
const DB_FILE = './database.json';
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

let campanhas = [];
let historicoVendas = [];

function carregarBanco() {
    if (fs.existsSync(DB_FILE)) {
        campanhas = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } else {
        // Inicializa com os dados da sua loja baseados no seu diretório public
        campanhas = [{ 
            id: 1, 
            loja: "Cell Azul", 
            premioBase: "Compre 1 Capa Ganhe Outra", 
            prefixo: "CELL", 
            cor: "#007bff", 
            qtd: 100, 
            arquivo: "cell azul capa.jpg" 
        }];
        salvarBanco();
    }
}
const salvarBanco = () => fs.writeFileSync(DB_FILE, JSON.stringify(campanhas, null, 2));
carregarBanco();

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================================================================
// 1. PAINEL DE MARKETING (GERENCIAMENTO)
// ==================================================================
const renderMarketingPage = (lista) => `
<!DOCTYPE html><html><head><title>Painel Marketing</title><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
    body{font-family:sans-serif; background:#f4f7f6; padding:20px; max-width:900px; margin:auto}
    .card{background:white; padding:20px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1); margin-bottom:20px; border-left: 10px solid #333}
    .row{display:flex; gap:10px; margin-bottom:10px}
    input{padding:10px; border:1px solid #ccc; border-radius:5px; width:100%; box-sizing:border-box}
    .btn{padding:12px; border:none; border-radius:5px; cursor:pointer; font-weight:bold; color:white; text-transform:uppercase}
</style></head>
<body>
    <h1>🛠️ Gestão de Ofertas - Criativo Zone</h1>
    <div class="card" style="border-left-color: #28a745">
        <h3>➕ Nova Campanha / Loja</h3>
        <form action="/adicionar-loja" method="POST" enctype="multipart/form-data">
            <div class="row">
                <input type="text" name="loja" placeholder="Nome da Loja" required>
                <input type="text" name="premioBase" placeholder="Prêmio (Ex: 10% OFF ou Ganhe 1 Capa)" required>
            </div>
            <div class="row">
                <input type="text" name="prefixo" placeholder="Prefixo do Cupom (Ex: AZUL)" maxlength="4" required>
                <input type="color" name="cor" value="#007bff" style="width:80px; height:40px">
                <input type="file" name="imagemUpload" required>
            </div>
            <button type="submit" class="btn" style="background:#28a745; width:100%">CADASTRAR LOJA</button>
        </form>
    </div>
    <hr>
    ${lista.map(l => `
        <div class="card" style="border-left-color: ${l.cor}">
            <form action="/salvar-marketing" method="POST">
                <input type="hidden" name="id" value="${l.id}">
                <div class="row">
                    <input type="text" name="loja" value="${l.loja}">
                    <input type="text" name="premioBase" value="${l.premioBase}">
                    <input type="number" name="qtd" value="${l.qtd}" style="width:80px">
                    <button type="submit" class="btn" style="background:#007bff">SALVAR</button>
                </div>
            </form>
            <form action="/deletar-loja" method="POST" onsubmit="return confirm('Excluir esta loja?')">
                <input type="hidden" name="id" value="${l.id}">
                <button type="submit" class="btn" style="background:#dc3545; font-size:10px; margin-top:5px">DELETAR</button>
            </form>
        </div>
    `).join('')}
</body></html>`;

// ==================================================================
// 2. LOGICA DE ROTAS E NAVEGAÇÃO
// ==================================================================
let slideAtual = 0;
setInterval(() => {
    if (campanhas.length > 0) {
        slideAtual = (slideAtual + 1) % campanhas.length;
        io.emit('trocar_slide', { ...campanhas[slideAtual], totalLojas: campanhas.length });
    }
}, 15000);

app.get('/marketing', (req, res) => res.send(renderMarketingPage(campanhas)));
app.get('/caixa', (req, res) => res.sendFile(path.join(__dirname, 'public', 'publictv.html'))); 
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'publictv.html')));
app.get('/mobile', (req, res) => res.send(htmlMobileLGPD()));

app.get('/qrcode', (req, res) => {
    const url = `${req.protocol}://${req.get('host')}/mobile`;
    QRCode.toDataURL(url, (e, s) => res.send(s));
});

// Ações do Banco
app.post('/adicionar-loja', upload.single('imagemUpload'), (req, res) => {
    const { loja, premioBase, prefixo, cor } = req.body;
    campanhas.push({ 
        id: Date.now(), 
        loja, 
        premioBase, 
        prefixo: prefixo.toUpperCase(), 
        cor, 
        qtd: 50, 
        arquivo: req.file ? req.file.filename : "cell azul capa.jpg" 
    });
    salvarBanco();
    res.redirect('/marketing');
});

app.post('/salvar-marketing', (req, res) => {
    const { id, loja, premioBase, qtd } = req.body;
    let c = campanhas.find(i => i.id == id);
    if(c){ c.loja = loja; c.premioBase = premioBase; c.qtd = parseInt(qtd); salvarBanco(); }
    res.redirect('/marketing');
});

app.post('/deletar-loja', (req, res) => {
    campanhas = campanhas.filter(i => i.id != req.body.id);
    salvarBanco();
    res.redirect('/marketing');
});

// ==================================================================
// 3. COMUNICAÇÃO EM TEMPO REAL (SOCKET.IO)
// ==================================================================
io.on('connection', (socket) => {
    if(campanhas.length > 0) socket.emit('trocar_slide', campanhas[slideAtual]);

    // Resgate do Cupom (Mobile)
    socket.on('resgatar_oferta', (d) => {
        let camp = campanhas.find(c => c.id == d.id);
        if(camp && camp.qtd > 0) {
            camp.qtd--;
            const cod = `${camp.prefixo}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;
            const zapLimpo = d.cliente.zap.replace(/\D/g, '');
            const voucher = { 
                codigo: cod, 
                produto: camp.premioBase, 
                loja: camp.loja, 
                clienteNome: d.cliente.nome, 
                telefoneCliente: zapLimpo 
            };
            
            historicoVendas.push({ ...voucher, status: 'Emitido' });
            socket.emit('sucesso', voucher);
            io.emit('aviso_vitoria_tv', { loja: camp.loja, premio: camp.premioBase }); // Ativa vitoria.mp3 na TV
            salvarBanco();
        }
    });

    // Validação no Caixa
    socket.on('validar_cupom', (cod) => {
        const cupom = historicoVendas.find(h => h.codigo === cod.toUpperCase() && h.status !== 'Usado');
        if (cupom) {
            cupom.status = 'Usado';
            socket.emit('resultado_validacao', { sucesso: true, msg: "VÁLIDO!", detalhe: cupom.premio });
        } else {
            socket.emit('resultado_validacao', { sucesso: false, msg: "CÓDIGO INVÁLIDO OU JÁ USADO" });
        }
    });
});

// ==================================================================
// 4. HTML MOBILE (LGPD + TRAVA ANTI-BURLA)
// ==================================================================
function htmlMobileLGPD() {
    return `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body{font-family:sans-serif; text-align:center; padding:20px; background:#f0f2f5; margin:0}
        .container{background:white; padding:25px; border-radius:15px; box-shadow:0 10px 25px rgba(0,0,0,0.1); max-width:400px; margin:auto}
        input{width:100%; padding:15px; margin:10px 0; border:1px solid #ccc; border-radius:8px; box-sizing:border-box}
        .btn-resgatar{background:#28a745; color:white; border:none; padding:18px; width:100%; border-radius:8px; font-size:18px; font-weight:bold; cursor:pointer}
        .lgpd-box{font-size:12px; text-align:left; color:#666; margin:15px 0; display:flex; gap:10px}
        #telaVoucher{display:none}
        .ticket{border:3px dashed #007bff; padding:20px; border-radius:10px; background:#f8f9ff}
    </style></head>
    <body>
        <div class="container">
            <div id="form">
                <h2>🎁 Resgatar Voucher</h2>
                <input type="text" id="n" placeholder="Nome e Sobrenome Completo">
                <input type="tel" id="z" placeholder="WhatsApp com DDD" maxlength="11">
                <div class="lgpd-box">
                    <input type="checkbox" id="l">
                    <label for="l">Autorizo o uso dos meus dados para emissão deste voucher e contato via WhatsApp conforme a LGPD.</label>
                </div>
                <button onclick="resgatar()" id="btnAction" class="btn-resgatar">GERAR MEU CUPOM</button>
            </div>
            <div id="telaVoucher">
                <div class="ticket">
                    <h3 id="vl"></h3>
                    <h1 id="vp" style="color:#007bff"></h1>
                    <div id="vc" style="font-size:2rem; font-weight:bold; background:#eee; letter-spacing:3px"></div>
                </div>
                <p>Apresente este código no caixa!</p>
                <button onclick="enviarZap()" style="background:#25D366; color:white; border:none; padding:15px; width:100%; border-radius:8px; font-weight:bold">SALVAR NO WHATSAPP 📱</button>
            </div>
        </div>
        <script src="/socket.io/socket.io.js"></script>
        <script>
            const socket = io(); let campId = null; let voucherData = null;
            // TRAVA ANTI-BURLA: Verifica se já existe cupom salvo no navegador
            window.onload = () => {
                const salvo = localStorage.getItem('cupom_azul');
                if(salvo) { voucherData = JSON.parse(salvo); exibirVoucher(); }
            };
            socket.on('trocar_slide', d => campId = d.id);
            function resgatar(){
                const n = document.getElementById('n').value;
                const z = document.getElementById('z').value.replace(/\\D/g,'');
                if(n.split(' ').length < 2 || z.length < 11 || !document.getElementById('l').checked) {
                    return alert('Por favor, preencha nome completo, zap com DDD e aceite a LGPD.');
                }
                document.getElementById('btnAction').disabled = true;
                socket.emit('resgatar_oferta', { id: campId, cliente: { nome: n, zap: z } });
            }
            socket.on('sucesso', d => {
                voucherData = d;
                localStorage.setItem('cupom_azul', JSON.stringify(d));
                exibirVoucher();
                enviarZap();
            });
            function exibirVoucher(){
                document.getElementById('form').style.display='none';
                document.getElementById('telaVoucher').style.display='block';
                document.getElementById('vl').innerText = voucherData.loja;
                document.getElementById('vp').innerText = voucherData.produto;
                document.getElementById('vc').innerText = voucherData.codigo;
            }
            function enviarZap(){
                const m = encodeURIComponent('Olá! Acabei de ganhar *'+voucherData.produto+'* na *'+voucherData.loja+'*!\\n🎫 Cupom: *'+voucherData.codigo+'*');
                window.location.href = 'https://api.whatsapp.com/send?phone=55'+voucherData.telefoneCliente+'&text='+m;
            }
        </script>
    </body></html>`;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sistema Online: http://localhost:${PORT}/marketing`));
