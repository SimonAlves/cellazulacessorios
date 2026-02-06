const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- 1. CONFIGURAÇÕES DE DIRETÓRIO ---
// Ajustado para ler arquivos da RAIZ, conforme seu GitHub
app.use(express.static(__dirname)); 
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
        // Campanha inicial padrão
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

// Função para gerar códigos únicos (Ex: CELL-A1B2)
function gerarCodigo(prefixo) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let res = '';
    for (let i = 0; i < 4; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
    return `${prefixo.toUpperCase()}-${res}`;
}

// --- 3. ROTAS DE INTERFACE (PAINÉIS SEPARADOS) ---

// Rota para o Cliente (Celular) - Resolve o erro "Cannot GET /mobile"
app.get('/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, 'mobile.html'));
});

// Rota para a TV da Loja
app.get('/tv', (req, res) => {
    res.sendFile(path.join(__dirname, 'publictv.html'));
});

// Painel de Marketing (Edição de Estoque e Prêmios)
app.get('/marketing', (req, res) => {
    let html = `<h1>Painel Marketing - Cell Azul</h1><p><a href="/tv">📺 Abrir TV</a> | <a href="/admin">📊 Admin</a></p>`;
    campanhas.forEach(c => {
        html += `<div style="border:1px solid #ccc; padding:20px; margin-bottom:15px; border-radius:10px;">
            <h3>${c.loja}</h3>
            <form action="/salvar" method="POST">
                <input type="hidden" name="id" value="${c.id}">
                <label>Estoque Atual:</label> <input type="number" name="qtd" value="${c.qtd}"><br><br>
                <label>Prêmio 1:</label> <input type="text" name="premio1" value="${c.premio1}"><br><br>
                <label>Prêmio 2:</label> <input type="text" name="premio2" value="${c.premio2}"><br><br>
                <button type="submit">💾 Salvar Alterações</button>
            </form>
        </div>`;
    });
    res.send(html);
});

// Painel Admin (Relatório de Clientes)
app.get('/admin', (req, res) => {
    res.send(`<h1>📊 Relatório de Leads</h1><p><a href="/marketing">← Voltar</a></p><pre>${JSON.stringify(historicoVendas, null, 2)}</pre>`);
});

// Gerador de QR Code Estável (Entrega como imagem PNG)
app.get('/qrcode', async (req, res) => {
    try {
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const urlMobile = `${protocol}://${req.get('host')}/mobile`;
        const buffer = await QRCode.toBuffer(urlMobile, { width: 400 });
        res.type('png').send(buffer);
    } catch (err) { res.status(500).send("Erro ao gerar QR"); }
});

// Rota para salvar alterações do painel
app.post('/salvar', (req, res) => {
    const { id, qtd, premio1, premio2 } = req.body;
    const idx = campanhas.findIndex(c => c.id == id);
    if(idx > -1) {
        campanhas[idx].qtd = parseInt(qtd);
        campanhas[idx].premio1 = premio1;
        campanhas[idx].premio2 = premio2;
        salvarBanco();
        io.emit('atualizar_qtd', { qtd: campanhas[idx].qtd });
        io.emit('trocar_slide', { ...campanhas[idx] }); // Atualiza a TV na hora
    }
    res.redirect('/marketing');
});

// --- 4. LÓGICA EM TEMPO REAL (SOCKET.IO) ---
io.on('connection', (socket) => {
    // Envia dados para a TV assim que ela conecta
    if (campanhas.length > 0) socket.emit('trocar_slide', { ...campanhas[0] });

    // Cliente clica em "Tentar a Sorte" no celular
    socket.on('resgatar_oferta', (dados) => {
        const c = campanhas[0];
        if (c.qtd > 0) {
            const sorte = Math.random() * 100;
            const premio = sorte > 90 ? c.premio2 : c.premio1; // Probabilidade 90/10
            const cupom = gerarCodigo(c.prefixo);
            
            c.qtd--;
            historicoVendas.push({ 
                nome: dados.cliente.nome, 
                zap: dados.cliente.zap, 
                codigo: cupom, 
                premio: premio, 
                data: new Date().toLocaleString() 
            });
            salvarBanco();

            socket.emit('sucesso', { codigo: cupom, produto: premio });
            io.emit('aviso_vitoria_tv', { premio, loja: c.loja }); // Som e Confete na TV
            io.emit('atualizar_qtd', { qtd: c.qtd });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Cell Azul Online na porta ${PORT}`));
