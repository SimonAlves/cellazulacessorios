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
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify({ campanhas, historicoVendas }, null, 2)); 
    } catch (e) { console.error("Erro ao salvar:", e); }
}

function carregarBanco() {
    if (fs.existsSync(DB_FILE)) {
        const dados = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        campanhas = dados.campanhas || [];
        historicoVendas = dados.historicoVendas || [];
    }
    if (campanhas.length === 0) {
        campanhas = [{ 
            id: 1, 
            loja: "Cell Azul Acessórios", 
            arquivo: "cell azul capa.jpg", 
            qtd: 20, 
            prefixo: "CELL", 
            premio1: "10% OFF", 
            premio2: "Capa Grátis",
            patrocinadores: ["CELL AZUL", "CRIATIVO ZONE", "IMPACTU MÍDIA", "POLIPET"]
        }];
        salvarBanco();
    }
}
carregarBanco();

// --- ROTAS DO SISTEMA ---

app.get('/', (req, res) => res.redirect('/marketing'));

// Página do Voucher Visual Individual
app.get('/voucher/:codigo', (req, res) => {
    const v = historicoVendas.find(h => h.cupom === req.params.codigo);
    if (!v) return res.send("<h1>Voucher não encontrado</h1>");
    res.send(`
        <body style="font-family:sans-serif; text-align:center; padding:50px; background:#003399; color:white;">
            <div style="background:white; color:#333; padding:30px; border-radius:20px; max-width:400px; margin:auto; border:5px solid #FFD700;">
                <h1 style="margin:0; color:#003399;">CELL AZUL</h1>
                <p>Olá, <strong>${v.nome}</strong>!</p>
                <div style="background:#f8f9fa; border:2px dashed #003399; padding:20px; margin:20px 0;">
                    <span style="font-size:1.2rem;">VOCÊ GANHOU:</span><br>
                    <strong style="font-size:2rem; color:#28a745;">${v.premio}</strong>
                </div>
                <p>CÓDIGO: <strong>${v.cupom}</strong></p>
                <p style="font-size:0.8rem;">Status: ${v.status === 'Usado' ? '❌ RESGATADO' : '✅ DISPONÍVEL'}</p>
                <small>Apresente este ecrã no caixa.</small>
            </div>
        </body>
    `);
});

// Validador Anti-Fraude (O lojista usa esta rota)
app.get('/caixa', (req, res) => {
    res.send(`
        <body style="font-family:sans-serif; text-align:center; padding:20px;">
            <h2>📟 Validador de Cupom - Cell Azul</h2>
            <input id="c" placeholder="Código do Cupom" style="padding:15px; width:80%; font-size:20px; text-transform:uppercase;">
            <br><br>
            <button onclick="validar()" style="padding:15px; width:80%; background:#003399; color:white; font-weight:bold; border:none; border-radius:10px;">QUEIMAR CUPOM</button>
            <h1 id="res"></h1>
            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                function validar(){ socket.emit('validar_cupom', document.getElementById('c').value.toUpperCase()); }
                socket.on('resultado_validacao', d => {
                    const r = document.getElementById('res');
                    r.innerText = d.msg;
                    r.style.color = d.sucesso ? 'green' : 'red';
                });
            </script>
        </body>
    `);
});

app.get('/mobile', (req, res) => res.sendFile(path.join(__dirname, 'public', 'mobile.html')));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'publictv.html')));

app.get('/qrcode', async (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const url = `${protocol}://${req.get('host')}/mobile`;
    const buffer = await QRCode.toBuffer(url, { width: 400 });
    res.type('png').send(buffer);
});

// Painel de Administração / Leads
app.get('/admin', (req, res) => {
    res.send(`<h1>📊 Leads - Cell Azul</h1><pre>${JSON.stringify(historicoVendas, null, 2)}</pre><br><a href="/marketing">Voltar</a>`);
});

// --- LÓGICA EM TEMPO REAL ---
io.on('connection', (socket) => {
    socket.emit('trocar_slide', { ...campanhas[0] });

    socket.on('resgatar_oferta', (dados) => {
        const c = campanhas[0];
        if (c.qtd > 0) {
            const sorte = Math.random() * 100;
            const premio = sorte > 90 ? c.premio2 : c.premio1;
            const cupom = `${c.prefixo}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;
            const host = socket.handshake.headers.host;
            const protocol = socket.handshake.headers['x-forwarded-proto'] || 'http';
            const linkVoucher = `${protocol}://${host}/voucher/${cupom}`;
            
            c.qtd--;
            historicoVendas.push({ 
                nome: dados.cliente.nome, 
                zap: dados.cliente.zap, 
                cupom, 
                premio, 
                status: 'Emitido', 
                data: new Date().toLocaleString() 
            });
            salvarBanco();

            socket.emit('sucesso', { codigo: cupom, produto: premio, link: linkVoucher });
            io.emit('aviso_vitoria_tv', { premio, loja: c.loja });
            io.emit('atualizar_qtd', { qtd: c.qtd });
        }
    });

    socket.on('validar_cupom', (cod) => {
        const v = historicoVendas.find(h => h.cupom === cod);
        if (!v) socket.emit('resultado_validacao', { sucesso: false, msg: "❌ INVÁLIDO" });
        else if (v.status === 'Usado') socket.emit('resultado_validacao', { sucesso: false, msg: "⚠️ JÁ UTILIZADO" });
        else {
            v.status = 'Usado';
            salvarBanco();
            socket.emit('resultado_validacao', { sucesso: true, msg: "✅ VÁLIDO! ENTREGAR: " + v.premio });
        }
    });
});

server.listen(process.env.PORT || 10000);
