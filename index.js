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
        campanhas = [{ 
            id: 1, loja: "Cell Azul Acessórios", arquivo: "cell azul capa.jpg", 
            qtd: 20, prefixo: "CELL", premio1: "10% OFF", premio2: "Capa Grátis" 
        }];
        salvarBanco();
    }
}
carregarBanco();

// --- 🔗 LINKS INDEPENDENTES ---

// 1. PAINEL DE MARKETING (Edição de Estoque e Campanha)
app.get('/marketing', (req, res) => {
    const c = campanhas[0];
    res.send(`
        <!DOCTYPE html><html><head><title>Marketing - Cell Azul</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{font-family:sans-serif; padding:20px; background:#e9ecef;} .card{background:white; padding:25px; border-radius:15px; box-shadow:0 4px 15px rgba(0,0,0,0.1); max-width:500px; margin:auto; border-top: 8px solid #003399;}</style>
        </head><body>
        <div class="card">
            <h1>🛠️ Painel de Marketing</h1>
            <p><strong>Loja:</strong> ${c.loja}</p>
            <p><strong>Estoque de Brindes:</strong> <span style="font-size:1.5rem; color:#003399;">${c.qtd}</span></p>
            <hr>
            <form action="/atualizar-estoque" method="POST">
                <label>Atualizar Quantidade:</label><br>
                <input type="number" name="qtd" value="${c.qtd}" style="padding:12px; width:120px; font-size:16px; margin:10px 0;">
                <button type="submit" style="padding:12px 20px; background:#003399; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold;">SALVAR ALTERAÇÃO</button>
            </form>
        </div>
        </body></html>
    `);
});

// 2. PAINEL ADMIN (Gestão de Leads e Clientes)
app.get('/admin', (req, res) => {
    let tabela = historicoVendas.map(v => `
        <tr>
            <td style="border:1px solid #ddd; padding:8px;">${v.nome}</td>
            <td style="border:1px solid #ddd; padding:8px;">${v.zap}</td>
            <td style="border:1px solid #ddd; padding:8px;">${v.premio}</td>
            <td style="border:1px solid #ddd; padding:8px;">${v.status}</td>
        </tr>`).join('');

    res.send(`
        <!DOCTYPE html><html><head><title>Admin - Leads</title>
        <style>body{font-family:sans-serif; padding:20px;} table{width:100%; border-collapse:collapse;} th{background:#003399; color:white; padding:10px;}</style>
        </head><body>
            <h1>📊 Relatório de Leads (Clientes)</h1>
            <table>
                <thead><tr><th>Nome</th><th>WhatsApp</th><th>Prêmio</th><th>Status</th></tr></thead>
                <tbody>${tabela || '<tr><td colspan="4">Nenhum cadastro ainda.</td></tr>'}</tbody>
            </table>
        </body></html>
    `);
});

// 3. PAINEL DO CAIXA (Validação Anti-Fraude)
app.get('/caixa', (req, res) => {
    res.send(`
        <!DOCTYPE html><html><head><title>Caixa - Cell Azul</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{font-family:sans-serif; text-align:center; padding:20px;} input{padding:15px; width:80%; font-size:20px; border:2px solid #003399; border-radius:10px;} button{padding:15px; width:80%; background:#000; color:#fff; font-weight:bold; margin-top:20px; border-radius:10px; cursor:pointer;}</style>
        </head><body>
            <h2>📟 Validador de Voucher</h2>
            <input id="c" placeholder="CÓDIGO DO CUPOM" oninput="this.value = this.value.toUpperCase()">
            <button onclick="validar()">VALIDAR PRÊMIO</button>
            <h1 id="res"></h1>
            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                function validar(){ socket.emit('validar_cupom', document.getElementById('c').value); }
                socket.on('resultado_validacao', d => {
                    const r = document.getElementById('res');
                    r.innerText = d.msg;
                    r.style.color = d.sucesso ? 'green' : 'red';
                });
            </script>
        </body></html>
    `);
});

// --- OUTRAS ROTAS ---
app.get('/', (req, res) => res.redirect('/marketing'));
app.get('/mobile', (req, res) => res.sendFile(path.join(__dirname, 'public', 'mobile.html')));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'publictv.html')));
app.get('/qrcode', async (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const url = `${protocol}://${req.get('host')}/mobile`;
    const buffer = await QRCode.toBuffer(url, { width: 400 });
    res.type('png').send(buffer);
});

app.post('/atualizar-estoque', (req, res) => {
    campanhas[0].qtd = parseInt(req.body.qtd);
    salvarBanco();
    io.emit('atualizar_qtd', { qtd: campanhas[0].qtd });
    res.redirect('/marketing');
});

// Rota do Voucher Visual
app.get('/voucher/:codigo', (req, res) => {
    const v = historicoVendas.find(h => h.cupom === req.params.codigo);
    if (!v) return res.send("Voucher inválido.");
    res.send(`<h1>Voucher de ${v.nome}</h1><p>Prêmio: ${v.premio}</p>`);
});

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
    socket.on('resgatar_oferta', (dados) => {
        const c = campanhas[0];
        if (c.qtd > 0) {
            const sorte = Math.random() * 100;
            const premio = sorte > 90 ? c.premio2 : c.premio1;
            const cupom = `${c.prefixo}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;
            const link = `https://${socket.handshake.headers.host}/voucher/${cupom}`;
            
            c.qtd--;
            historicoVendas.push({ ...dados.cliente, cupom, premio, status: 'Emitido', link });
            salvarBanco();
            socket.emit('sucesso', { codigo: cupom, produto: premio, link });
            io.emit('aviso_vitoria_tv', { premio, loja: c.loja });
            io.emit('atualizar_qtd', { qtd: c.qtd });
        }
    });

    socket.on('validar_cupom', (cod) => {
        const v = historicoVendas.find(h => h.cupom === cod);
        if (!v) socket.emit('resultado_validacao', { sucesso: false, msg: "❌ NÃO EXISTE" });
        else if (v.status === 'Usado') socket.emit('resultado_validacao', { sucesso: false, msg: "⚠️ JÁ USADO" });
        else {
            v.status = 'Usado';
            salvarBanco();
            socket.emit('resultado_validacao', { sucesso: true, msg: "✅ OK! ENTREGAR " + v.premio });
        }
    });
});

server.listen(process.env.PORT || 10000);
