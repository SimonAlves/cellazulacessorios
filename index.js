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
// CONFIGURAÇÕES INICIAIS
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
        campanhas = [{ id: 1, loja: "Criativo Zone", premioBase: "10% OFF", prefixo: "CRI", cor: "#F37021", qtd: 100, arquivo: "padrao.jpg" }];
        salvarBanco();
    }
}
const salvarBanco = () => fs.writeFileSync(DB_FILE, JSON.stringify(campanhas, null, 2));
carregarBanco();

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ==================================================================
// 1. HTML PAINEL MARKETING (EDITÁVEL)
// ==================================================================
const renderMarketingPage = (lista) => `
<!DOCTYPE html><html><head><title>Painel Marketing</title><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
    body{font-family:sans-serif; background:#f4f7f6; padding:20px; max-width:900px; margin:auto}
    .card{background:white; padding:20px; border-radius:10px; box-shadow:0 2px 10px rgba(0,0,0,0.1); margin-bottom:20px}
    .row{display:flex; gap:10px; margin-bottom:10px}
    input, select{padding:10px; border:1px solid #ccc; border-radius:5px; width:100%}
    .btn{padding:12px; border:none; border-radius:5px; cursor:pointer; font-weight:bold; color:white}
    .btn-add{background:#28a745; width:100%}
    .btn-save{background:#007bff}
    .btn-del{background:#dc3545}
</style></head>
<body>
    <h1>🛠️ Gestão Criativo Zone</h1>
    <div class="card" style="border: 2px dashed #28a745">
        <h3>➕ Cadastrar Nova Campanha</h3>
        <form action="/adicionar-loja" method="POST" enctype="multipart/form-data">
            <div class="row">
                <input type="text" name="loja" placeholder="Nome da Loja" required>
                <input type="text" name="premioBase" placeholder="Prêmio (Ex: Compre 1 Ganhe Outro)" required>
            </div>
            <div class="row">
                <input type="text" name="prefixo" placeholder="Prefixo (Ex: CELL)" maxlength="4" required>
                <input type="color" name="cor" value="#F37021" style="width:100px; height:40px">
                <input type="file" name="imagemUpload" required>
            </div>
            <button type="submit" class="btn btn-add">CRIAR CAMPANHA</button>
        </form>
    </div>
    <hr>
    ${lista.map(l => `
        <div class="card" style="border-left: 10px solid ${l.cor}">
            <form action="/salvar-marketing" method="POST">
                <input type="hidden" name="id" value="${l.id}">
                <div class="row">
                    <input type="text" name="loja" value="${l.loja}">
                    <input type="text" name="premioBase" value="${l.premioBase}">
                    <input type="number" name="qtd" value="${l.qtd}" style="width:80px">
                    <button type="submit" class="btn btn-save">SALVAR</button>
                </div>
            </form>
            <form action="/deletar-loja" method="POST" onsubmit="return confirm('Excluir?')">
                <input type="hidden" name="id" value="${l.id}">
                <button type="submit" class="btn btn-del" style="margin-top:5px; padding:5px 10px; font-size:12px">DELETAR LOJA</button>
            </form>
        </div>
    `).join('')}
</body></html>`;

// ==================================================================
// 2. HTML MOBILE (LGPD + TRAVA + ZAP)
// ==================================================================
const htmlMobile = `
<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
    body{font-family:sans-serif; text-align:center; padding:20px; background:#f0f2f5; margin:0}
    .container{background:white; padding:25px; border-radius:15px; box-shadow:0 10px 25px rgba(0,0,0,0.1); max-width:400px; margin:auto}
    input{width:100%; padding:15px; margin:10px 0; border:1px solid #ccc; border-radius:8px; box-sizing:border-box}
    .lgpd{font-size:0.75rem; text-align:left; color:#666; margin:10px 0; display:flex; gap:10px}
    .btn-resgatar{background:#28a745; color:white; border:none; padding:18px; width:100%; border-radius:8px; font-size:18px; font-weight:bold; cursor:pointer}
    #telaVoucher{display:none}
    .ticket{border:3px dashed #F37021; border-radius:10px; padding:20px; margin:20px 0; background:#fffcf5}
</style></head>
<body>
    <div class="container">
        <div id="formCadastro">
            <h2>🎉 Resgate seu Cupom</h2>
            <input type="text" id="cNome" placeholder="Nome Completo">
            <input type="tel" id="cZap" placeholder="WhatsApp (DDD + Número)" maxlength="11">
            <div class="lgpd">
                <input type="checkbox" id="cLgpd">
                <label for="cLgpd">Autorizo o uso dos meus dados para este voucher e contato via WhatsApp (LGPD).</label>
            </div>
            <button onclick="resgatar()" id="btnAction" class="btn-resgatar">RESGATAR AGORA 🎁</button>
        </div>
        <div id="telaVoucher">
            <div class="ticket">
                <h3 id="vLoja"></h3>
                <h1 id="vPremio" style="color:#F37021"></h1>
                <div style="background:#eee; padding:15px; font-size:1.5rem; font-weight:bold; letter-spacing:2px" id="vCod"></div>
            </div>
            <button onclick="abrirZap()" style="background:#25D366; color:white; border:none; padding:15px; width:100%; border-radius:8px; font-weight:bold">ABRIR NO MEU WHATSAPP 📱</button>
        </div>
    </div>
    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io(); let campId = null; let voucherData = null;
        window.onload = () => {
            const salvo = localStorage.getItem('v_ferrari');
            if(salvo) { voucherData = JSON.parse(salvo); exibirVoucher(); }
        };
        socket.on('trocar_slide', d => { campId = d.id; });
        function resgatar(){
            const n = document.getElementById('cNome').value;
            const z = document.getElementById('cZap').value.replace(/\\D/g,'');
            if(n.split(' ').length < 2 || z.length < 11 || !document.getElementById('cLgpd').checked){
                return alert("Preencha Nome Completo, Zap com DDD e aceite a LGPD.");
            }
            document.getElementById('btnAction').disabled = true;
            socket.emit('resgatar_oferta', { id: campId, cliente: { nome: n, zap: z } });
        }
        socket.on('sucesso', d => {
            voucherData = d;
            localStorage.setItem('v_ferrari', JSON.stringify(d));
            exibirVoucher();
            abrirZap();
        });
        function exibirVoucher(){
            document.getElementById('formCadastro').style.display='none';
            document.getElementById('telaVoucher').style.display='block';
            document.getElementById('vLoja').innerText = voucherData.loja;
            document.getElementById('vPremio').innerText = voucherData.produto;
            document.getElementById('vCod').innerText = voucherData.codigo;
        }
        function abrirZap(){
            const msg = encodeURIComponent(\`Olá! Sou *\${voucherData.clienteNome}*. Ganhei *\${voucherData.produto}* na *\${voucherData.loja}*!\\n🎫 Código: *\${voucherData.codigo}*\`);
            window.location.href = \`https://api.whatsapp.com/send?phone=55\${voucherData.telefoneCliente}&text=\${msg}\`;
        }
    </script>
</body></html>`;

// ==================================================================
// 3. HTML VALIDADOR (CAIXA)
// ==================================================================
const htmlCaixa = `
<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:sans-serif; text-align:center; padding:50px; background:#222; color:#fff}input{padding:15px; font-size:20px; width:80%; border-radius:10px}button{padding:15px 30px; margin-top:20px; background:gold; border:none; font-weight:bold; border-radius:10px; cursor:pointer}</style>
</head><body>
    <h1>📟 VALIDADOR CAIXA</h1>
    <input type="text" id="c" placeholder="CÓDIGO (EX: CRI-X8Y2)">
    <br><button onclick="v()">VALIDAR</button>
    <div id="r" style="margin-top:20px; font-size:1.5rem"></div>
    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        function v(){ socket.emit('validar_cupom', document.getElementById('c').value); }
        socket.on('resultado_validacao', d => {
            const r = document.getElementById('r');
            r.innerText = d.msg + (d.detalhe ? ' - ' + d.detalhe : '');
            r.style.color = d.sucesso ? 'lime' : 'red';
            if(d.sucesso) document.getElementById('c').value = '';
        });
    </script>
</body></html>`;

// ==================================================================
// 4. MOTOR DO SERVIDOR (LOGICA CENTRAL)
// ==================================================================
let slideAtual = 0;
setInterval(() => {
    if (campanhas.length > 0) {
        slideAtual = (slideAtual + 1) % campanhas.length;
        io.emit('trocar_slide', campanhas[slideAtual]);
    }
}, 15000);

const getStats = () => campanhas.map(c => ({
    ...c, baixas: historicoVendas.filter(h => h.loja === c.loja && h.status === 'Usado').length
}));

app.get('/marketing', (req, res) => res.send(renderMarketingPage(campanhas)));
app.get('/caixa', (req, res) => res.send(htmlCaixa));
app.get('/mobile', (req, res) => res.send(htmlMobile));
app.get('/admin', (req, res) => res.send(``)); 
app.get('/qrcode', (req, res) => {
    const url = `http://${req.headers.host}/mobile`;
    QRCode.toDataURL(url, (e, s) => res.send(s));
});

app.post('/adicionar-loja', upload.single('imagemUpload'), (req, res) => {
    const { loja, premioBase, prefixo, cor } = req.body;
    campanhas.push({ id: Date.now(), loja, premioBase, prefixo: prefixo.toUpperCase(), cor, qtd: 50, arquivo: req.file.filename });
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

io.on('connection', (socket) => {
    if(campanhas.length > 0) socket.emit('trocar_slide', campanhas[slideAtual]);
    socket.emit('dados_admin', getStats());

    socket.on('resgatar_oferta', (d) => {
        let camp = campanhas.find(c => c.id == d.id);
        if(camp && camp.qtd > 0) {
            camp.qtd--;
            const cod = `${camp.prefixo}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;
            const zapLimpo = d.cliente.zap.replace(/\D/g, '');
            
            const voucher = { 
                codigo: cod, produto: camp.premioBase, loja: camp.loja, 
                clienteNome: d.cliente.nome, telefoneCliente: zapLimpo 
            };

            historicoVendas.push({ ...voucher, status: 'Emitido' });
            socket.emit('sucesso', voucher);
            io.emit('aviso_vitoria_tv', { loja: camp.loja, premio: camp.premioBase });
            io.emit('dados_admin', getStats());
            salvarBanco();
        }
    });

    socket.on('validar_cupom', (cod) => {
        const cupom = historicoVendas.find(h => h.codigo === cod.toUpperCase() && h.status !== 'Usado');
        if (cupom) {
            cupom.status = 'Usado';
            io.emit('dados_admin', getStats());
            socket.emit('resultado_validacao', { sucesso: true, msg: "✅ VALIDADO", detalhe: cupom.premio });
        } else {
            socket.emit('resultado_validacao', { sucesso: false, msg: "❌ INVÁLIDO OU JÁ USADO" });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando em http://localhost:${PORT}/marketing`));
