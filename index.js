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
// Garante que o servidor encontre imagens e HTMLs na pasta /public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DB_FILE = './database.json';
let campanhas = [];
let historicoVendas = [];

// --- 2. GESTÃO DE BANCO DE DADOS ---

// Função para criar dados iniciais caso o banco esteja vazio ou corrompido
function inicializarDadosPadrao() {
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

function carregarBanco() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const dados = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            campanhas = dados.campanhas || [];
            historicoVendas = dados.historicoVendas || [];
            
            // Proteção: Se o arquivo existe mas os dados sumiram, reinicia o padrão
            if (campanhas.length === 0) inicializarDadosPadrao();
        } else {
            inicializarDadosPadrao();
        }
    } catch (err) {
        console.error("Erro ao carregar banco, usando padrão...");
        inicializarDadosPadrao();
    }
}

function salvarBanco() { 
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify({ campanhas, historicoVendas }, null, 2)); 
    } catch (e) { console.error("Erro ao salvar dados:", e); }
}

carregarBanco();

// --- 3. ROTAS DE INTERFACE ---

app.get('/', (req, res) => res.redirect('/marketing'));

// Rota para o Cliente (Mobile)
app.get('/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

// Rota para a TV da Loja
app.get('/tv', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'publictv.html'));
});

// Painel de Marketing (Edição de Estoque)
app.get('/marketing', (req, res) => {
    // Verificação de segurança para evitar erro de 'undefined'
    if (!campanhas || campanhas.length === 0) {
        return res.send("<h1>Configurando sistema...</h1><script>setTimeout(()=>location.reload(), 2000)</script>");
    }

    let html = `<!DOCTYPE html><html><head><title>Painel Cell Azul</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body{font-family:sans-serif; padding:20px; background:#f4f4f4;} .card{background:white; padding:20px; border-radius:10px; box-shadow:0 2px 5px rgba(0,0,0,0.1);}</style>
    </head><body>
    <div class="card">
        <h1>Painel de Marketing - Cell Azul</h1>
        <p>Estoque Atual: <strong>${campanhas[0].qtd}</strong></p>
        <p><a href="/tv" target="_blank">📺 Abrir TV</a> | <a href="/admin">📊 Ver Leads</a></p>
        <hr>
        <form action="/atualizar-estoque" method="POST">
            <label>Alterar Estoque de Cupons:</label><br><br>
            <input type="number" name="qtd" value="${campanhas[0].qtd}" style="padding:10px; width:100px;">
            <button type="submit" style="padding:10px; background:#003399; color:white; border:none; border-radius:5px; cursor:pointer;">SALVAR</button>
        </form>
    </div>
    </body></html>`;
    res.send(html);
});

// Relatório de Leads (Admin)
app.get('/admin', (req, res) => {
    res.send(`<h1>📊 Clientes Cadastrados</h1><pre>${JSON.stringify(historicoVendas, null, 2)}</pre><br><a href="/marketing">Voltar</a>`);
});

// Gerador de QR Code em tempo real
app.get('/qrcode', async (req, res) => {
    try {
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const urlMobile = `${protocol}://${req.get('host')}/mobile`;
        const buffer = await QRCode.toBuffer(urlMobile, { width: 400 });
        res.type('png').send(buffer);
    } catch (err) { res.status(500).send("Erro no QR Code"); }
});

// Ação de atualizar estoque
app.post('/atualizar-estoque', (req, res) => {
    if (campanhas.length > 0) {
        campanhas[0].qtd = parseInt(req.body.qtd);
        salvarBanco();
        io.emit('atualizar_qtd', { qtd: campanhas[0].qtd });
    }
    res.redirect('/marketing');
});

// --- 4. COMUNICAÇÃO EM TEMPO REAL (SOCKET.IO) ---
io.on('connection', (socket) => {
    if (campanhas.length > 0) socket.emit('trocar_slide', { ...campanhas[0] });

    socket.on('resgatar_oferta', (dados) => {
        if (campanhas.length > 0 && campanhas[0].qtd > 0) {
            const c = campanhas[0];
            const sorte = Math.random() * 100;
            const premio = sorte > 90 ? c.premio2 : c.premio1;
            const cupom = `${c.prefixo}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;
            
            c.qtd--;
            // Captura dados do cliente (Simon, Isabela, etc.)
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

// Porta padrão do Render
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
