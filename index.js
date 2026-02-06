const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

// ==================================================================
// 1. CONFIGURAÇÕES INICIAIS E UPLOAD
// ==================================================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); 
    }
});
const upload = multer({ storage: storage });

// ==================================================================
// 2. BANCO DE DADOS (JSON) E HISTÓRICO
// ==================================================================
const DB_FILE = './database.json';
let campanhas = [];
let historicoVendas = []; 

function carregarBanco() {
    try {
        if (fs.existsSync(DB_FILE)) {
            campanhas = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } else {
            // Campanha padrão caso o arquivo não exista
            campanhas = [{ 
                id: 0, loja: "Cell Azul Acessórios", arquivo: "cell azul capa.jpg", 
                cor: "#003399", qtd: 50, prefixo: "CELL", 
                premio1: "10% OFF", chance1: 90,
                premio2: "Relógio Smart", chance2: 10, ehSorteio: true 
            }];
            salvarBanco();
        }
    } catch (err) { console.error("Erro ao carregar DB:", err); }
}

function salvarBanco() {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(campanhas, null, 2)); } 
    catch (err) { console.error("Erro ao salvar DB:", err); }
}
carregarBanco();

// Função para criar códigos únicos (Ex: CELL-A1B2)
function gerarCodigo(prefixo) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return `${prefixo.toUpperCase()}-${result}`;
}

// ==================================================================
// 3. MOTOR DO SERVIDOR (EXPRESS + SOCKET.IO)
// ==================================================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ROTA RAIZ: Central de links para evitar erro "Cannot GET /"
app.get('/', (req, res) => {
    res.send(`
        <body style="font-family:sans-serif; text-align:center; padding:50px; background:#f0f2f5;">
            <h1 style="color:#003399;">🚀 Sistema Cell Azul Ativo</h1>
            <div style="display:inline-block; text-align:left; background:white; padding:30px; border-radius:15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <p>⚙️ <a href="/marketing">Painel de Marketing</a> (Edição de Prêmios)</p>
                <p>📊 <a href="/admin">Painel Admin</a> (Dados de Clientes)</p>
                <p>📺 <a href="/tv">Link da TV</a> (Exibir na loja)</p>
                <p>📟 <a href="/caixa">Link do Caixa</a> (Validar Vouchers)</p>
            </div>
        </body>
    `);
});

// ==================================================================
// 4. ROTAS DE INTERFACE (ADMIN E CLIENTE)
// ==================================================================

// Painel de Marketing (Mantido conforme sua referência de campos)
app.get('/marketing', (req, res) => res.send(renderMarketingPage(campanhas)));

// Painel Admin (Tabela de Clientes)
app.get('/admin', (req, res) => res.send(renderAdminPage()));

// Validador do Caixa
app.get('/caixa', (req, res) => res.send(htmlCaixa));

// Interface Mobile do Cliente
app.get('/mobile', (req, res) => res.send(htmlMobile));

// Link para gerar o QR Code
app.get('/qrcode', (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const url = `${protocol}://${req.headers.host}/mobile`;
    QRCode.toDataURL(url, (e, s) => res.send(s));
});

// Visualizador do Voucher "Lindo" para o cliente
app.get('/ver-voucher/:codigo', (req, res) => {
    const cupom = historicoVendas.find(h => h.codigo === req.params.codigo.toUpperCase());
    if (!cupom) return res.send("Voucher não encontrado.");
    res.send(renderVoucherVisual(cupom));
});

// Download da Planilha CSV
app.get('/baixar-relatorio', (req, res) => {
    let csv = "DATA;HORA;CLIENTE;WHATSAPP;PREMIO;CUPOM;STATUS\n";
    historicoVendas.forEach(h => {
        csv += `${h.data};${h.hora};${h.clienteNome};${h.clienteZap};${h.premio};${h.codigo};${h.status}\n`;
    });
    res.attachment('Clientes_CellAzul.csv').send("\uFEFF" + csv);
});

// ==================================================================
// 5. LÓGICA DE EVENTOS EM TEMPO REAL (SOCKET.IO)
// ==================================================================
io.on('connection', (socket) => {
    
    // Ação: Cliente tenta ganhar prêmio
    socket.on('resgatar_oferta', (dados) => {
        const camp = campanhas[0]; 
        if (camp && camp.qtd > 0) {
            const sorte = Math.random() * 100;
            // Lógica de probabilidade ajustável no painel
            let premio = (sorte <= camp.chance2) ? camp.premio2 : camp.premio1;
            const cod = gerarCodigo(camp.prefixo);
            
            historicoVendas.push({ 
                codigo: cod, loja: camp.loja, premio: premio, status: 'Emitido', 
                clienteNome: dados.cliente.nome, clienteZap: dados.cliente.zap,
                data: new Date().toLocaleDateString('pt-BR'), hora: new Date().toLocaleTimeString('pt-BR')
            });

            const host = socket.handshake.headers.host;
            const protocol = socket.handshake.headers['x-forwarded-proto'] || 'http';
            const linkVoucher = `${protocol}://${host}/ver-voucher/${cod}`;

            camp.qtd--;
            salvarBanco();
            
            // Retorno para o celular do cliente
            socket.emit('sucesso', { codigo: cod, produto: premio, link: linkVoucher, zap: dados.cliente.zap });
            // Alerta sonoro e visual na TV
            io.emit('aviso_vitoria_tv', { loja: camp.loja, premio: premio });
            io.emit('atualizar_qtd', { qtd: camp.qtd });
        }
    });

    // Ação: Caixa valida o código
    socket.on('validar_cupom', (cod) => {
        const cupom = historicoVendas.find(h => h.codigo === cod.toUpperCase());
        if (!cupom) socket.emit('resultado_validacao', { sucesso: false, msg: "❌ CÓDIGO INVÁLIDO" });
        else if (cupom.status === 'Usado') socket.emit('resultado_validacao', { sucesso: false, msg: "⚠️ VOUCHER JÁ UTILIZADO" });
        else {
            cupom.status = 'Usado';
            socket.emit('resultado_validacao', { sucesso: true, msg: "✅ VÁLIDO!", detalhe: `ENTREGAR: ${cupom.premio}` });
        }
    });
});

// ==================================================================
// 6. INICIALIZAÇÃO DO SERVIDOR
// ==================================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Cell Azul Online na porta ${PORT}`));

// Nota: Certifique-se de definir as funções renderMarketingPage, renderAdminPage, etc. 
// conforme os templates HTML enviados anteriormente.
