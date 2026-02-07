const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

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
        campanhas = [{ id: 1, loja: "Cell Azul Acessórios", arquivo: "cell azul capa.jpg", qtd: 20, prefixo: "CELL", premio1: "10% OFF", premio2: "Capa Grátis" }];
        salvarBanco();
    }
}
carregarBanco();

// --- ROTAS ADICIONAIS ---

// Página do Voucher Visual (Link Profissional)
app.get('/voucher/:codigo', (req, res) => {
    const v = historicoVendas.find(h => h.cupom === req.params.codigo);
    if (!v) return res.send("<h1>Voucher não encontrado</h1>");
    res.send(`
        <body style="font-family:sans-serif; text-align:center; padding:50px; background:#f0f2f5;">
            <div style="background:white; padding:30px; border-radius:20px; border:4px dashed #003399; max-width:400px; margin:auto;">
                <h1 style="color:#003399;">CELL AZUL</h1>
                <p>Parabéns, <strong>${v.nome}</strong>!</p>
                <hr>
                <h2>GANHOU: ${v.premio}</h2>
                <h3 style="background:#eee; padding:10px; font-family:monospace;">${v.cupom}</h3>
                <p style="font-size:0.8rem;">Status: ${v.status === 'Usado' ? '❌ JÁ UTILIZADO' : '✅ VÁLIDO'}</p>
            </div>
        </body>
    `);
});

// Validador do Caixa (Anti-Fraude)
app.get('/caixa', (req, res) => {
    res.send(`
        <body style="font-family:sans-serif; text-align:center; padding:20px;">
            <h2>📟 Validador de Cupom - Cell Azul</h2>
            <input id="c" placeholder="Código (Ex: CELL-ABCD)" style="padding:15px; width:80%; font-size:20px;">
            <br><br>
            <button onclick="validar()" style="padding:15px; width:80%; background:black; color:white; font-weight:bold;">VALIDAR E QUEIMAR</button>
            <h1 id="res"></h1>
            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                function validar(){ socket.emit('validar_cupom', document.getElementById('c').value.toUpperCase()); }
                socket.on('resultado_validacao', d => {
                    document.getElementById('res').innerText = d.msg;
                    document.getElementById('res').style.color = d.sucesso ? 'green' : 'red';
                });
            </script>
        </body>
    `);
});

app.get('/mobile', (req, res) => res.sendFile(path.join(__dirname, 'public', 'mobile.html')));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'publictv.html')));
app.get('/qrcode', async (req, res) => {
    const url = "https://" + req.get('host') + "/mobile";
    const buffer = await QRCode.toBuffer(url, { width: 400 });
    res.type('png').send(buffer);
});

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
    socket.emit('trocar_slide', { ...campanhas[0], todasLojas: campanhas });

    socket.on('resgatar_oferta', (dados) => {
        const c = campanhas[0];
        if (c.qtd > 0) {
            const sorte = Math.random() * 100;
            const premio = sorte > 90 ? c.premio2 : c.premio1;
            const cupom = `${c.prefixo}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;
            const linkVoucher = "https://" + socket.handshake.headers.host + "/voucher/" + cupom;
            
            c.qtd--;
            historicoVendas.push({ ...dados.cliente, cupom, premio, status: 'Emitido', link: linkVoucher });
            salvarBanco();

            socket.emit('sucesso', { codigo: cupom, produto: premio, link: linkVoucher });
            io.emit('aviso_vitoria_tv', { premio, loja: c.loja });
            io.emit('atualizar_qtd', { qtd: c.qtd });
        }
    });

    socket.on('validar_cupom', (cod) => {
        const v = historicoVendas.find(h => h.cupom === cod);
        if (!v) socket.emit('resultado_validacao', { sucesso: false, msg: "❌ NÃO EXISTE" });
        else if (v.status === 'Usado') socket.emit('resultado_validacao', { sucesso: false, msg: "⚠️ JÁ FOI USADO" });
        else {
            v.status = 'Usado';
            salvarBanco();
            socket.emit('resultado_validacao', { sucesso: true, msg: "✅ OK! ENTREGAR PRÊMIO" });
        }
    });
});

server.listen(process.env.PORT || 10000);
