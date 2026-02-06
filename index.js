const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- CONFIGURAÇÃO: LER ARQUIVOS DA RAIZ ---
// Como seus arquivos estão na raiz (mobile.html, publictv.html), configuramos o servidor para ler daí.
app.use(express.static(__dirname)); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- BANCO DE DADOS ---
const DB_FILE = './database.json';
let campanhas = [];
let historicoVendas = [];

function carregarBanco() {
    if (fs.existsSync(DB_FILE)) {
        const dados = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        campanhas = dados.campanhas || [];
        historicoVendas = dados.historicoVendas || [];
    } else {
        // Campanha padrão baseada na loja Simon Alves Rodrigues Souza (Criativo Zone)
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
        fs.writeFileSync(DB_FILE, JSON.stringify({ campanhas, historicoVendas }, null, 2));
    }
}
carregarBanco();

// --- ROTAS ---

// Rota para o Cliente (Mobile)
app.get('/mobile', (req, res) => res.sendFile(path.join(__dirname, 'mobile.html')));

// Rota para a TV da Loja
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'publictv.html')));

// Gerador de QR Code estável (Gera imagem PNG direta para a TV)
app.get('/qrcode', async (req, res) => {
    try {
        const host = req.get('host');
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const urlMobile = `${protocol}://${host}/mobile`;
        const buffer = await QRCode.toBuffer(urlMobile, { width: 400 });
        res.type('png').send(buffer);
    } catch (err) { res.status(500).send("Erro no QR"); }
});

// Painel de Marketing Simples
app.get('/marketing', (req, res) => {
    res.send(`<h1>Painel Cell Azul</h1><p>Estoque Atual: ${campanhas[0].qtd}</p><a href="/tv">📺 Abrir TV</a>`);
});

// --- LÓGICA EM TEMPO REAL (SOCKET.IO) ---
io.on('connection', (socket) => {
    if (campanhas.length > 0) socket.emit('trocar_slide', { ...campanhas[0] });

    socket.on('resgatar_oferta', (dados) => {
        const c = campanhas[0];
        if (c.qtd > 0) {
            const sorte = Math.random() * 100;
            const premio = sorte > 90 ? c.premio2 : c.premio1;
            const cupom = `${c.prefixo}-${Math.random().toString(36).substr(2,4).toUpperCase()}`;
            
            c.qtd--;
            historicoVendas.push({ 
                nome: dados.cliente.nome, 
                zap: dados.cliente.zap, 
                cupom, 
                premio, 
                data: new Date().toLocaleString() 
            });
            fs.writeFileSync(DB_FILE, JSON.stringify({ campanhas, historicoVendas }, null, 2));

            socket.emit('sucesso', { codigo: cupom, produto: premio });
            io.emit('aviso_vitoria_tv', { premio, loja: c.loja });
            io.emit('atualizar_qtd', { qtd: c.qtd });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando em ${PORT}`));
