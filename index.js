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

// 1. MARKETING: EDIÇÃO DE IMAGENS E PROBABILIDADES
app.get('/marketing', (req, res) => {
    const c = campanhas[0];
    res.send(`
        <!DOCTYPE html><html><head><title>Marketing - Cell Azul</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{font-family:sans-serif; padding:20px; background:#f8f9fa;} .card{background:white; padding:20px; border-radius:15px; max-width:600px; margin:auto; box-shadow:0 4px 10px rgba(0,0,0,0.1);}</style>
        </head><body>
        <div class="card">
            <h1>⚙️ Configurar Campanha</h1>
            <form action="/salvar-config" method="POST">
                <label>Nome da Imagem (Ex: cell azul capa.jpg):</label><br>
                <input type="text" name="arquivo" value="${c.arquivo}" style="width:100%; padding:10px; margin:10px 0;"><br>
                
                <label>Quantidade em Estoque:</label><br>
                <input type="number" name="qtd" value="${c.qtd}" style="width:100%; padding:10px; margin:10px 0;"><br>

                <hr>
                <h3>🏆 Prêmios e Probabilidades (Total deve ser 100%)</h3>
                
                <label>Prêmio 1 (Mais comum):</label>
                <input type="text" name="premio1" value="${c.premio1}" style="width:60%;"> 
                <input type="number" name="prob1" value="${c.prob1}" style="width:30%;"> % <br><br>

                <label>Prêmio 2 (Raro):</label>
                <input type="text" name="premio2" value="${c.premio2}" style="width:60%;"> 
                <input type="number" name="prob2" value="${c.prob2}" style="width:30%;"> % <br><br>

                <button type="submit" style="width:100%; padding:15px; background:#003399; color:white; border:none; border-radius:10px; cursor:pointer; font-weight:bold;">SALVAR E APLICAR NA TV</button>
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

// 2. ADMIN: ANÁLISE DE DADOS E DOWNLOAD DE CSV
app.get('/admin', (req, res) => {
    let linhas = historicoVendas.reverse().map(v => `
        <tr>
            <td style="border:1px solid #ddd; padding:8px;">${v.data}</td>
            <td style="border:1px solid #ddd; padding:8px;">${v.nome}</td>
            <td style="border:1px solid #ddd; padding:8px;">${v.zap}</td>
            <td style="border:1px solid #ddd; padding:8px;">${v.premio}</td>
            <td style="border:1px solid #ddd; padding:8px;">${v.cupom}</td>
        </tr>`).join('');

    res.send(`
        <!DOCTYPE html><html><head><title>Relatório de Clientes</title>
        <style>body{font-family:sans-serif; padding:20px;} table{width:100%; border-collapse:collapse; margin-top:20px;} th{background:#333; color:white; padding:10px;} button{padding:10px 20px; background:#28a745; color:white; border:none; border-radius:5px; cursor:pointer;}</style>
        </head><body>
            <h1>📊 Relatório de Clientes e Cupons</h1>
            <button onclick="window.location.href='/download-csv'">📥 BAIXAR PLANILHA (CSV)</button>
            <table>
                <thead><tr><th>Data/Hora</th><th>Nome</th><th>WhatsApp</th><th>Prêmio</th><th>Código</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="5">Nenhum dado capturado.</td></tr>'}</tbody>
            </table>
        </body></html>
    `);
});

// Rota para baixar a planilha (CSV) compatível com Excel
app.get('/download-csv', (req, res) => {
    let csv = "Data;Nome;WhatsApp;Premio;Cupom\n";
    historicoVendas.forEach(v => {
        csv += `${v.data};${v.nome};${v.zap};${v.premio};${v.cupom}\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads_cellazul.csv');
    res.status(200).send(csv);
});

// 3. CAIXA: VALIDADOR
app.get('/caixa', (req, res) => {
    res.send(`
        <body style="font-family:sans-serif; text-align:center; padding:20px;">
            <h2>📟 Validador de Voucher</h2>
            <input id="c" placeholder="CÓDIGO" style="padding:15px; width:80%; font-size:20px; border:2px solid #000; text-transform:uppercase;">
            <button onclick="validar()" style="padding:15px; width:80%; background:#000; color:#fff; font-weight:bold; margin-top:20px; cursor:pointer;">VALIDAR</button>
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
        </body>
    `);
});

// --- LOGICA DE SORTEIO ---
io.on('connection', (socket) => {
    socket.emit('trocar_slide', { ...campanhas[0] });

    socket.on('resgatar_oferta', (dados) => {
        const c = campanhas[0];
        if (c.qtd > 0) {
            const sorte = Math.random() * 100;
            const premio = sorte <= c.prob2 ? c.premio2 : c.premio1; // Lógica de probabilidade editável
            const cupom = `${c.prefixo}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;
            
            c.qtd--;
            historicoVendas.push({ 
                nome: dados.cliente.nome, 
                zap: dados.cliente.zap, 
                cupom, 
                premio, 
                status: 'Emitido', 
                data: new Date().toLocaleString('pt-BR') 
            });
            salvarBanco();
            socket.emit('sucesso', { codigo: cupom, produto: premio, link: `https://${socket.handshake.headers.host}/voucher/${cupom}` });
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
