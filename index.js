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
            qtd: 20, prefixo: "CELL", 
            premio1: "10% OFF", prob1: 90,
            premio2: "Compre e Ganhou", prob2: 10 
        }];
        salvarBanco();
    }
}
carregarBanco();

// --- 🔗 LINKS INDEPENDENTES E TURBINADOS ---

// 1. MARKETING: EDIÇÃO DE IMAGENS, PREMIOS E PROBABILIDADES
app.get('/marketing', (req, res) => {
    const c = campanhas[0];
    res.send(`
        <!DOCTYPE html><html><head><title>Marketing - Cell Azul</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{font-family:sans-serif; padding:20px; background:#f8f9fa;} .card{background:white; padding:20px; border-radius:15px; max-width:600px; margin:auto; box-shadow:0 4px 10px rgba(0,0,0,0.1); border-top: 8px solid #003399;}</style>
        </head><body>
        <div class="card">
            <h1>⚙️ Configurar Campanha</h1>
            <form action="/salvar-config" method="POST">
                <label>Nome da Imagem (Ex: cell azul capa.jpg):</label><br>
                <input type="text" name="arquivo" value="${c.arquivo}" style="width:100%; padding:10px; margin:10px 0;"><br>
                
                <label>Quantidade em Estoque:</label><br>
                <input type="number" name="qtd" value="${c.qtd}" style="width:100%; padding:10px; margin:10px 0;"><br>

                <hr>
                <h3>🏆 Prêmios e Probabilidades</h3>
                
                <label>Prêmio 1 (Mais comum):</label><br>
                <input type="text" name="premio1" value="${c.premio1}" style="width:65%; padding:8px;"> 
                <input type="number" name="prob1" value="${c.prob1}" style="width:25%; padding:8px;"> % <br><br>

                <label>Prêmio 2 (Raro - "Ganhou"):</label><br>
                <input type="text" name="premio2" value="${c.premio2}" style="width:65%; padding:8px;"> 
                <input type="number" name="prob2" value="${c.prob2}" style="width:25%; padding:8px;"> % <br><br>

                <button type="submit" style="width:100%; padding:15px; background:#003399; color:white; border:none; border-radius:10px; cursor:pointer; font-weight:bold;">SALVAR E ATUALIZAR TV</button>
            </form>
        </div>
        </body></html>
    `);
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

// 2. ADMIN: ANÁLISE DE DADOS E DOWNLOAD DE PLANILHA
app.get('/admin', (req, res) => {
    let linhas = historicoVendas.slice().reverse().map(v => `
        <tr>
            <td style="border:1px solid #ddd; padding:8px;">${v.data || '---'}</td>
            <td style="border:1px solid #ddd; padding:8px;">${v.nome}</td>
            <td style="border:1px solid #ddd; padding:8px;">${v.zap}</td>
            <td style="border:1px solid #ddd; padding:8px;">${v.premio}</td>
            <td style="border:1px solid #ddd; padding:8px;">${v.status}</td>
        </tr>`).join('');

    res.send(`
        <!DOCTYPE html><html><head><title>Admin - Relatórios</title>
        <style>body{font-family:sans-serif; padding:20px;} table{width:100%; border-collapse:collapse; margin-top:20px;} th{background:#003399; color:white; padding:10px;} button{padding:12px 20px; background:#28a745; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;}</style>
        </head><body>
            <h1>📊 Relatório Detalhado de Leads</h1>
            <button onclick="window.location.href='/download-csv'">📥 BAIXAR PLANILHA EXCEL (CSV)</button>
            <table>
                <thead><tr><th>Data/Hora</th><th>Nome</th><th>WhatsApp</th><th>Prêmio</th><th>Status</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="5">Nenhum cadastro ainda.</td></tr>'}</tbody>
            </table>
        </body></html>
    `);
});

app.get('/download-csv', (req, res) => {
    let csv = "\uFEFFData;Nome;WhatsApp;Premio;Status;Cupom\n";
    historicoVendas.forEach(v => {
        csv += `${v.data || ''};${v.nome};${v.zap};${v.premio};${v.status};${v.cupom}\n`;
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=leads_cellazul.csv');
    res.status(200).send(csv);
});

// 3. CAIXA: VALIDADOR ANTI-FRAUDE
app.get('/caixa', (req, res) => {
    res.send(`
        <!DOCTYPE html><html><head><title>Caixa - Cell Azul</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{font-family:sans-serif; text-align:center; padding:20px;} input{padding:15px; width:85%; font-size:20px; border:2px solid #003399; border-radius:10px;} button{padding:15px; width:85%; background:#000; color:#fff; font-weight:bold; margin-top:20px; border-radius:10px; cursor:pointer;}</style>
        </head><body>
            <h2>📟 Validador de Voucher</h2>
            <input id="c" placeholder="CÓDIGO DO CUPOM" oninput="this.value = this.value.toUpperCase()">
            <button onclick="validar()">VALIDAR E QUEIMAR</button>
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

// --- ROTAS DE SUPORTE ---
app.get('/', (req, res) => res.redirect('/marketing'));
app.get('/mobile', (req, res) => res.sendFile(path.join(__dirname, 'public', 'mobile.html')));
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'publictv.html')));
app.get('/qrcode', async (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const url = `${protocol}://${req.get('host')}/mobile`;
    const buffer = await QRCode.toBuffer(url, { width: 400 });
    res.type('png').send(buffer);
});

app.get('/voucher/:codigo', (req, res) => {
    const v = historicoVendas.find(h => h.cupom === req.params.codigo);
    if (!v) return res.send("Voucher inválido.");
    res.send(`<body style="font-family:sans-serif;text-align:center;padding:50px;"><h1>Voucher de ${v.nome}</h1><h2>Prêmio: ${v.premio}</h2><p>Apresente este código no caixa: <strong>${v.cupom}</strong></p></body>`);
});

// --- LÓGICA DO SORTEIO (SOCKET) ---
io.on('connection', (socket) => {
    socket.on('resgatar_oferta', (dados) => {
        const c = campanhas[0];
        if (c.qtd > 0) {
            const sorte = Math.random() * 100;
            // Lógica de probabilidade dinâmica configurada no painel
            const premio = sorte <= c.prob2 ? c.premio2 : c.premio1;
            const cupom = `${c.prefixo}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;
            const link = `https://${socket.handshake.headers.host}/voucher/${cupom}`;
            
            c.qtd--;
            historicoVendas.push({ 
                ...dados.cliente, 
                cupom, 
                premio, 
                status: 'Emitido', 
                link,
                data: new Date().toLocaleString('pt-BR') 
            });
            salvarBanco();
            socket.emit('sucesso', { codigo: cupom, produto: premio, link });
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
            socket.emit('resultado_validacao', { sucesso: true, msg: "✅ OK! ENTREGAR " + v.premio });
        }
    });
});

server.listen(process.env.PORT || 10000);
