const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const multer = require('multer'); // Biblioteca para upload

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- CONFIGURAÇÃO DE UPLOAD ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'public')),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage: storage });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DB_FILE = './database.json';
let campanhas = [];
let historicoVendas = [];

function salvarBanco() { 
    fs.writeFileSync(DB_FILE, JSON.stringify({ campanhas, historicoVendas }, null, 2)); 
}

function carregarBanco() {
    if (fs.existsSync(DB_FILE)) {
        const dados = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        campanhas = dados.campanhas || [];
        historicoVendas = dados.historicoVendas || [];
    }
    if (campanhas.length === 0) {
        campanhas = [{ 
            id: 1, loja: "Cell Azul Acessórios", arquivo: "cell azul capa.jpg", 
            qtd: 20, prefixo: "CELL", 
            premio1: "10% OFF", prob1: 90,
            premio2: "Compre e Ganhou", prob2: 10 
        }];
        salvarBanco();
    }
}
carregarBanco();

// --- PAINEL DE MARKETING COM UPLOAD ---
app.get('/marketing', (req, res) => {
    const c = campanhas[0];
    res.send(`
        <!DOCTYPE html><html><head><title>Marketing - Cell Azul</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{font-family:sans-serif; padding:20px; background:#f8f9fa;} .card{background:white; padding:20px; border-radius:15px; max-width:600px; margin:auto; box-shadow:0 4px 10px rgba(0,0,0,0.1); border-top: 8px solid #003399;}</style>
        </head><body>
        <div class="card">
            <h1>⚙️ Gestão de Campanha</h1>
            <p><button onclick="window.location.href='/download-csv'" style="background:#28a745; color:white; border:none; padding:10px; border-radius:5px; cursor:pointer;">📥 BAIXAR LEADS (CSV)</button></p>
            <hr>
            
            <h3>🖼️ Trocar Imagem da TV</h3>
            <form action="/upload-imagem" method="POST" enctype="multipart/form-data">
                <input type="file" name="imagem" accept="image/*" required>
                <button type="submit" style="background:#003399; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer;">SUBIR FOTO</button>
            </form>
            <p><small>Imagem atual: <strong>${c.arquivo}</strong></small></p>
            <hr>

            <form action="/salvar-config" method="POST">
                <label>Nome do Arquivo Atual:</label><br>
                <input type="text" name="arquivo" value="${c.arquivo}" style="width:100%; padding:10px; margin:10px 0;"><br>
                <label>Estoque Total:</label><br>
                <input type="number" name="qtd" value="${c.qtd}" style="width:100%; padding:10px; margin:10px 0;"><br>
                <h3>🏆 Prêmios</h3>
                <input type="text" name="premio1" value="${c.premio1}" style="width:50%;"> <input type="number" name="prob1" value="${c.prob1}" style="width:20%;"> %<br><br>
                <input type="text" name="premio2" value="${c.premio2}" style="width:50%;"> <input type="number" name="prob2" value="${c.prob2}" style="width:20%;"> %<br><br>
                <button type="submit" style="width:100%; padding:15px; background:#003399; color:white; border:none; border-radius:10px; font-weight:bold; cursor:pointer;">SALVAR ALTERAÇÕES</button>
            </form>
        </div>
        </body></html>
    `);
});

// ROTA PARA RECEBER A IMAGEM
app.post('/upload-imagem', upload.single('imagem'), (req, res) => {
    if (req.file) {
        campanhas[0].arquivo = req.file.originalname;
        salvarBanco();
        io.emit('trocar_slide', { ...campanhas[0] });
    }
    res.redirect('/marketing');
});

app.post('/salvar-config', (req, res) => {
    Object.assign(campanhas[0], {
        arquivo: req.body.arquivo,
        qtd: parseInt(req.body.qtd),
        premio1: req.body.premio1,
        prob1: parseInt(req.body.prob1),
        premio2: req.body.premio2,
        prob2: parseInt(req.body.prob2)
    });
    salvarBanco();
    io.emit('trocar_slide', { ...campanhas[0] });
    res.redirect('/marketing');
});

// DOWNLOAD E RESTANTE DO CÓDIGO (IGUAL AO ANTERIOR)
app.get('/download-csv', (req, res) => {
    let csv = "\uFEFFData;Nome;WhatsApp;Premio;Status;Cupom\n";
    historicoVendas.forEach(v => csv += `${v.data || ''};${v.nome};${v.zap};${v.premio};${v.status};${v.cupom}\n`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=leads_cellazul.csv');
    res.status(200).send(csv);
});

app.get('/caixa', (req, res) => {
    res.send(`<body style="text-align:center;padding:20px;"><h2>📟 Caixa</h2><input id="c" placeholder="CÓDIGO" style="padding:15px;width:80%;font-size:20px;"><button onclick="socket.emit('validar_cupom', document.getElementById('c').value.toUpperCase())" style="padding:15px;width:80%;margin-top:20px;">VALIDAR</button><h1 id="res"></h1><script src="/socket.io/socket.io.js"></script><script>const socket=io();socket.on('resultado_validacao', d=>{const r=document.getElementById('res'); r.innerText=d.msg; r.style.color=d.sucesso?'green':'red';});</script></body>`);
});

app.get('/admin', (req, res) => res.redirect('/marketing'));
app.get('/mobile', (req, res) => res.sendFile(path.join(__dirname, 'public', 'mobile.html')));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'publictv.html')));
app.get('/qrcode', async (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const buffer = await QRCode.toBuffer(`${protocol}://${req.get('host')}/mobile`, { width: 400 });
    res.type('png').send(buffer);
});

io.on('connection', (socket) => {
    socket.on('resgatar_oferta', (dados) => {
        const c = campanhas[0];
        if (c.qtd > 0) {
            const sorte = Math.random() * 100;
            const premio = sorte <= c.prob2 ? c.premio2 : c.premio1;
            const cupom = `${c.prefixo}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;
            c.qtd--;
            historicoVendas.push({ ...dados.cliente, cupom, premio, status: 'Emitido', data: new Date().toLocaleString('pt-BR') });
            salvarBanco();
            socket.emit('sucesso', { codigo: cupom, produto: premio, link: `https://${socket.handshake.headers.host}/voucher/${cupom}` });
            io.emit('aviso_vitoria_tv', { premio, loja: c.loja });
            io.emit('atualizar_qtd', { qtd: c.qtd });
        }
    });
    socket.on('validar_cupom', (cod) => {
        const v = historicoVendas.find(h => h.cupom === cod);
        if (!v || v.status === 'Usado') socket.emit('resultado_validacao', { sucesso: false, msg: "❌ INVÁLIDO" });
        else { v.status = 'Usado'; salvarBanco(); socket.emit('resultado_validacao', { sucesso: true, msg: "✅ OK! ENTREGAR " + v.premio }); }
    });
});

server.listen(process.env.PORT || 10000);
