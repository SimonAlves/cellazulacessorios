const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- 1. CONFIGURAÇÃO DE DIRETÓRIOS ---
// Define que a pasta 'public' contém seus arquivos estáticos (HTML, imagens, mp3)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 2. BANCO DE DADOS (JSON) ---
const DB_FILE = './database.json';
let campanhas = [];
let historicoVendas = [];

function carregarBanco() {
    if (fs.existsSync(DB_FILE)) {
        const dados = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        campanhas = dados.campanhas || [];
        historicoVendas = dados.historicoVendas || [];
    } else {
        // Dados iniciais para a Cell Azul Acessórios
        campanhas = [{ 
            id: 1, 
            loja: "Cell Azul Acessórios", 
            arquivo: "cell azul capa.jpg", 
            cor: "#003399", 
            qtd: 20, 
            prefixo: "CELL", 
            premio1: "10% OFF", 
            chance1: 90, 
            premio2: "Capa Grátis", 
            chance2: 10
        }];
        salvarBanco();
    }
}

function salvarBanco() { 
    fs.writeFileSync(DB_FILE, JSON.stringify({ campanhas, historicoVendas }, null, 2)); 
}
carregarBanco();

// --- 3. ROTAS DE INTERFACE ---

// Rota Principal: Redireciona para o Marketing
app.get('/', (req, res) => res.redirect('/marketing'));

// Rota Mobile: Busca o arquivo explicitamente dentro da pasta /public
app.get('/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

// Rota TV: Busca o arquivo explicitamente dentro da pasta /public
app.get('/tv', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'publictv.html'));
});

// Painel de Marketing (Edição de Estoque)
app.get('/marketing', (req, res) => {
    let html = `<!DOCTYPE html><html><head><title>Painel Cell Azul</title></head><body>
    <h1>Painel de Marketing - Cell Azul</h1>
    <p>Estoque Atual: <strong>${campanhas[0].qtd}</strong></p>
    <a href="/tv" target="_blank">📺 Abrir TV</a> | <a href="/admin">📊 Ver Leads</a>
    <hr>
    <form action="/atualizar-estoque" method="POST">
        <label>Alterar Estoque:</label>
        <input type="number" name="qtd" value="${campanhas[0].qtd}">
        <button type="submit">Salvar</button>
    </form>
    </body></html>`;
    res.send(html);
});

// Relatório de Leads (Admin)
app.get('/admin', (req, res) => {
    res.send(`<h1>📊 Clientes Cadastrados</h1><pre>${JSON.stringify(historicoVendas, null, 2)}</pre><br><a href="/marketing">Voltar</a>`);
});

// Gerador de QR Code Estável
app.get('/qrcode', async (req, res) => {
    try {
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const urlMobile = `${protocol}://${req.get('host')}/mobile`;
        const buffer = await QRCode.toBuffer(urlMobile, { width: 400 });
        res.type('png').send(buffer);
    } catch (err) { res.status(500).send("Erro no QR"); }
});

// Rota de Atualização de Estoque
app.post('/atualizar-estoque', (req, res) => {
    campanhas[0].qtd = parseInt(req.body.qtd);
    salvarBanco();
    io.emit('atualizar_qtd', { qtd: campanhas[0].qtd });
    res.redirect('/marketing');
});

// --- 4. COMUNICAÇÃO EM TEMPO REAL (SOCKET.IO) ---
io.on('connection', (socket) => {
    if (campanhas.length > 0) socket.emit('trocar_slide', { ...campanhas[0] });

    socket.on('resgatar_oferta', (dados) => {
        const c = campanhas[0];
        if (c.qtd > 0) {
            const sorte = Math.random() * 100;
            const premio = sorte > 90 ? c.premio2 : c.premio1;
            const cupom = `${c.prefixo}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;
            
            c.qtd--;
            // Salva os dados do cliente (Simon, Isabela, etc.)
            historicoVendas.push({ 
                ...dados.cliente, 
                cupom, 
                premio, 
                data: new Date().toLocaleString() 
            });
            salvarBanco();

            socket.emit('sucesso', { codigo: cupom, produto: premio });
            io.emit('aviso_vitoria_tv', { premio, loja: c.loja });
            io.emit('atualizar_qtd', { qtd: c.qtd });
        }
    });
});

// O Render utiliza a porta 10000 por padrão
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Rodando em http://localhost:${PORT}`));
