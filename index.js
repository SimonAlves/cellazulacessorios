const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

// ==================================================================
// CONFIGURAÇÃO DE UPLOAD
// ==================================================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, 'public/') },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); 
    }
});
const upload = multer({ storage: storage });

// ==================================================================
// BANCO DE DADOS
// ==================================================================
const DB_FILE = './database.json';
let campanhas = [];

function carregarBanco() {
    try {
        if (fs.existsSync(DB_FILE)) {
            campanhas = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } else {
            campanhas = [{ id: 0, loja: "Exemplo", arquivo: "exemplo.jpg", modo: "sorte", cor: "#333", qtd: 50, prefixo: "EX", premio1: "10% OFF", premio2: "50% OFF", ehSorteio: true }];
            salvarBanco();
        }
    } catch (err) { console.error("Erro DB:", err); campanhas = []; }
}

function salvarBanco() {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(campanhas, null, 2)); } 
    catch (err) { console.error("Erro Save:", err); }
}
carregarBanco();

// ==================================================================
// 1. HTML PAINEL DE MARKETING
// ==================================================================
const renderMarketingPage = (lista) => `
<!DOCTYPE html>
<html>
<head>
    <title>Painel de Marketing</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Roboto', sans-serif; background: #f0f2f5; padding: 20px; max-width: 800px; margin: 0 auto; }
        .header { display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; }
        h1 { margin: 0; color: #333; }
        .card-new { background: #d4edda; padding: 20px; border-radius: 10px; border: 2px dashed #28a745; margin-bottom: 30px; }
        .card { background: white; padding: 20px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); border-left: 10px solid #ccc; }
        .row { display: flex; gap: 10px; margin-bottom: 10px; }
        .col { flex: 1; }
        label { font-weight: bold; font-size: 0.8rem; color: #666; display: block; margin-bottom: 5px; }
        input[type="text"], input[type="number"] { padding: 10px; border: 1px solid #ddd; border-radius: 5px; width: 100%; box-sizing: border-box; }
        input[type="file"] { background: #fff; padding: 10px; border: 1px dashed #999; width: 100%; border-radius: 5px; }
        .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; text-transform: uppercase; }
        .btn-add { background: #28a745; color: white; width: 100%; }
        .btn-save { background: #007bff; color: white; }
        .btn-del { background: #dc3545; color: white; margin-left: 10px; font-size: 0.8rem; padding: 5px 10px;}
        .btn-tv { background: #333; color: white; text-decoration: none; padding: 10px 15px; border-radius: 5px; }
        .img-preview { max-height: 50px; border-radius: 5px; vertical-align: middle; margin-right: 10px; border: 1px solid #ccc; }
        .actions { display: flex; justify-content: flex-end; align-items: center; margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px; }
        @media (max-width: 600px) { .row { flex-direction: column; } }
    </style>
</head>
<body>
    <div class="header"><h1>🛠️ Gestão de Ofertas</h1><a href="/tv" class="btn-tv" target="_blank">Ver TV 📺</a></div>
    
    <div class="card-new">
        <h2 style="color:#155724;margin-top:0">➕ Cadastrar Nova Loja</h2>
        <form action="/adicionar-loja" method="POST" enctype="multipart/form-data">
            <div class="row">
                <div class="col"><label>Nome da Loja:</label><input type="text" name="loja" required></div>
                <div class="col"><label>Upload da Imagem:</label><input type="file" name="imagemUpload" required accept="image/*"></div>
            </div>
            <div class="row">
                <div class="col"><label>Prêmio Comum (95%):</label><input type="text" name="premio1" placeholder="Ex: 10% OFF" required></div>
                <div class="col"><label>Prêmio Gold (5%):</label><input type="text" name="premio2" placeholder="Ex: Brinde Surpresa" required></div>
            </div>
            <div class="row">
                <div class="col"><label>Cor do Tema:</label><input type="color" name="cor" value="#000000" style="height:40px"></div>
                <div class="col"><label>Prefixo (3 letras):</label><input type="text" name="prefixo" maxlength="4" style="text-transform:uppercase" required></div>
            </div>
            <button type="submit" class="btn btn-add">CRIAR AGORA</button>
        </form>
    </div>

    <hr><h2 style="color:#666">🖊️ Editar Lojas (${lista.length})</h2>
    
    ${lista.map(loja => `
        <div class="card" style="border-left-color: ${loja.cor}">
            <form action="/salvar-marketing" method="POST" enctype="multipart/form-data">
                <input type="hidden" name="id" value="${loja.id}">
                <input type="hidden" name="arquivoAtual" value="${loja.arquivo}"> 
                <div style="display:flex; align-items:center; justify-content:space-between">
                    <h3 style="margin:0; color:${loja.cor}">#${loja.id} - ${loja.loja}</h3>
                    <img src="/${loja.arquivo}" class="img-preview" onerror="this.style.display='none'">
                </div>
                <br>
                <div class="row">
                    <div class="col"><label>Trocar Imagem:</label><input type="file" name="imagemUpload" accept="image/*"><small style="color:#999;font-size:0.7rem">Atual: ${loja.arquivo}</small></div>
                    <div class="col"><label>Cor:</label><input type="color" name="cor" value="${loja.cor}" style="height:40px"></div>
                </div>
                <div class="row">
                    <div class="col"><label>Prêmio Comum:</label><input type="text" name="premio1" value="${loja.premio1 || '10% OFF'}"></div>
                    <div class="col"><label>Prêmio Gold:</label><input type="text" name="premio2" value="${loja.premio2 || '50% OFF'}"></div>
                </div>
                <div class="row">
                    <div class="col"><label>Qtd Prêmios:</label><input type="number" name="qtd" value="${loja.qtd}"></div>
                    <div class="col"><label>Prefixo:</label><input type="text" name="prefixo" value="${loja.prefixo}"></div>
                </div>
                <div class="actions">
                    <button type="submit" class="btn btn-save">💾 SALVAR</button>
            </form>
            <form action="/deletar-loja" method="POST" onsubmit="return confirm('Tem certeza que deseja EXCLUIR?');">
                <input type="hidden" name="id" value="${loja.id}">
                <button type="submit" class="btn btn-del">🗑️</button>
            </form>
                </div>
        </div>
    `).join('')}
</body></html>`;

// ==================================================================
// 2. HTML TV
// ==================================================================
const htmlTV = `<!DOCTYPE html><html><head><title>TV OFERTAS</title><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&display=swap" rel="stylesheet"><script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script><style>body{margin:0;background:black;overflow:hidden;font-family:'Montserrat',sans-serif;height:100vh;display:flex;flex-direction:column}#main-content{flex:1;display:flex;width:100%;height:85vh}#areaImagem{flex:3;position:relative;background-color:#000;display:flex;align-items:center;justify-content:center;overflow:hidden}#imgPrincipal{max-width:100%;max-height:100%;object-fit:contain;z-index:2;display:block;box-shadow:0 0 50px rgba(0,0,0,0.5)}#fundoDesfocado{position:absolute;top:0;left:0;width:100%;height:100%;background-size:cover;background-position:center;filter:blur(30px)brightness(0.4);z-index:1}#sidebar{flex:1;background:#222;display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;color:white;padding:20px;text-align:center;box-shadow:-10px 0 30px rgba(0,0,0,0.5);z-index:10;transition:background-color 0.5s ease}.loja-box{background:white;color:#222;padding:10px 20px;border-radius:50px;margin-bottom:10px;width:90%;box-shadow:0 5px 15px rgba(0,0,0,0.2)}.loja-nome{font-size:1.5rem;font-weight:900;text-transform:uppercase;margin:0;line-height:1.1}.oferta-titulo{font-size:1.8rem;font-weight:700;margin:0;line-height:1.2;text-shadow:1px 1px 2px rgba(0,0,0,0.3)}.qr-container{background:white;padding:15px;border-radius:20px;width:80%;margin:10px auto;box-shadow:0 10px 25px rgba(0,0,0,0.3)}.qr-container img{width:100%;display:block}.cta-text{color:#FFD700;font-weight:900;font-size:1.4rem;text-transform:uppercase;margin-top:5px}.divider{width:90%;border-top:2px dashed rgba(255,255,255,0.3);margin:10px 0}.counter-number{font-size:6rem;font-weight:900;color:#FFD700;line-height:0.9;margin-top:5px;text-shadow:3px 3px 0px rgba(0,0,0,0.3)}#footer{height:15vh;background:#111;border-top:4px solid #FFD700;display:flex;align-items:center;justify-content:space-around;padding:0 10px;z-index:20}.patrocinador-item{opacity:0.4;transition:all 0.5s;filter:grayscale(100%);display:flex;align-items:center;transform:scale(0.9)}.patrocinador-item.ativo{opacity:1;transform:scale(1.3);filter:grayscale(0%);filter:drop-shadow(0 0 8px white);font-weight:bold}.patrocinador-nome{color:white;font-weight:bold;font-size:1rem;text-transform:uppercase;margin:0 10px}.pulse{animation:pulse 2s infinite}#overlayVitoria{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:9999;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#FFD700}.animacao-vitoria{animation:zoomIn 0.5s ease-out}@keyframes zoomIn{from{transform:scale(0)}to{transform:scale(1)}}@media(orientation:portrait){#main-content{flex-direction:column}#areaImagem{flex:1.2;width:100%;border-bottom:5px solid #FFD700}#sidebar{flex:1;width:100%;box-shadow:0 -10px 30px rgba(0,0,0,0.5);padding:10px 0}#footer{height:10vh}.loja-nome{font-size:2.5rem}.counter-number{font-size:7rem}.qr-container{width:40%}}</style></head><body><div id="overlayVitoria"><h1 style="font-size:5rem;font-weight:900;text-transform:uppercase;margin:0;color:#fff;text-shadow:0 0 20px #FFD700">🎉 TEM GANHADOR! 🎉</h1><h2 style="font-size:3rem;margin-top:20px;color:#FFD700" id="textoPremioTV">...</h2></div><div id="main-content"><div id="areaImagem"><div id="fundoDesfocado"></div><img id="imgPrincipal" src=""></div><div id="sidebar"><div class="loja-box"><h1 id="storeName" class="loja-nome">LOJA</h1></div><h2 id="slideType" class="oferta-titulo">Oferta Especial</h2><div class="qr-container pulse"><img id="qrCode" src="qrcode.png"></div><div id="ctaText" class="cta-text">GARANTA O SEU</div><div class="divider"></div><div class="counter-area" id="counterBox"><p class="counter-label" style="text-transform:uppercase;font-size:0.9rem">Restam Apenas:</p><div id="qtdDisplay" class="counter-number">--</div></div></div></div><div id="footer"></div><script src="/socket.io/socket.io.js"></script><script>const socket=io();const imgMain=document.getElementById('imgPrincipal');const bgBlur=document.getElementById('fundoDesfocado');const sidebar=document.getElementById('sidebar');const storeName=document.getElementById('storeName');const lojaBox=document.querySelector('.loja-box');const slideType=document.getElementById('slideType');const ctaText=document.getElementById('ctaText');const qtdDisplay=document.getElementById('qtdDisplay');const counterBox=document.getElementById('counterBox');const footer=document.getElementById('footer');const audioTv=new Audio('/vitoria.mp3');audioTv.volume=1.0;function forcarDesbloqueio(){if(audioTv.paused){audioTv.play().then(()=>{audioTv.pause();audioTv.currentTime=0;}).catch(e=>{})}}document.addEventListener('click',forcarDesbloqueio);document.addEventListener('keydown',forcarDesbloqueio);window.onload=forcarDesbloqueio;socket.on('atualizar_banco_dados',novaLista=>{location.reload()});socket.on('trocar_slide',d=>{const caminhoImagem='/'+d.arquivo;imgMain.src=caminhoImagem;bgBlur.style.backgroundImage="url('"+caminhoImagem+"')";sidebar.style.backgroundColor=d.cor;storeName.innerText=d.loja;lojaBox.style.color=d.cor;slideType.innerText="Sorteio do Dia";ctaText.innerText="TENTE A SORTE";counterBox.style.display='block';qtdDisplay.innerText=d.qtd;document.querySelector('.qr-container').classList.add('pulse');footer.innerHTML='';d.todasLojas.forEach(loja=>{let ativoClass=(loja.loja===d.loja)?'ativo':'';footer.innerHTML+='<div class="patrocinador-item '+ativoClass+'"><span class="patrocinador-nome" style="color:'+loja.cor+'">'+loja.loja+'</span></div>'});fetch('/qrcode').then(r=>r.text()).then(u=>document.getElementById('qrCode').src=u)});socket.on('atualizar_qtd',d=>{qtdDisplay.innerText=d.qtd});socket.on('aviso_vitoria_tv',d=>{const overlay=document.getElementById('overlayVitoria');document.getElementById('textoPremioTV').innerText="Acabou de ganhar "+d.premio+" na "+d.loja+"!";overlay.style.display='flex';overlay.classList.add('animacao-vitoria');audioTv.currentTime=0;audioTv.play().catch(e=>{});var duration=3000;var end=Date.now()+duration;(function frame(){confetti({particleCount:5,angle:60,spread:55,origin:{x:0}});confetti({particleCount:5,angle:120,spread:55,origin:{x:1}});if(Date.now()<end)requestAnimationFrame(frame)}());setTimeout(()=>{overlay.style.display='none'},6000)});</script></body></html>`;

// ==================================================================
// 3. HTML MOBILE (CORRIGIDO: ESCAPES PARA EVITAR ERRO)
// ==================================================================
const htmlMobile = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap" rel="stylesheet"><script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script><style>body{font-family:'Roboto',sans-serif;text-align:center;padding:20px;background:#f0f2f5;margin:0}.ticket-card{background:white;border-radius:10px;box-shadow:0 10px 25px rgba(0,0,0,0.1);overflow:hidden;margin-bottom:25px;padding-bottom:20px}.store-logo{font-size:2rem;font-weight:900;margin:20px 0 5px 0;color:#333;text-transform:uppercase}.voucher-code{font-family:'Courier New',monospace;font-size:2rem;font-weight:900;color:#333;letter-spacing:2px}.btn-print{background:#333;color:white;border:none;padding:15px;width:100%;border-radius:8px;font-size:1.1rem;font-weight:bold;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 4px 10px rgba(0,0,0,0.2)}.btn-zap{background:#25D366;color:white;border:none;padding:15px;width:100%;border-radius:8px;font-size:1.1rem;font-weight:bold;cursor:pointer;margin-top:10px;display:flex;align-items:center;justify-content:center;gap:10px;}.loader{border:5px solid #f3f3f3;border-top:5px solid #333;border-radius:50%;width:50px;height:50px;animation:spin 1s linear infinite;margin:20px auto}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}#formCadastro{background:white;padding:20px;border-radius:10px;box-shadow:0 10px 25px rgba(0,0,0,0.1);display:none}.inp-dados{width:90%;padding:15px;margin:10px 0;border:1px solid #ccc;border-radius:5px;font-size:16px;outline:none;transition:0.3s}.inp-dados:focus{border-color:#003399;box-shadow:0 0 5px rgba(0,51,153,0.3)}.btn-enviar{background:#28a745;color:white;font-weight:bold;font-size:18px;border:none;padding:15px;width:100%;border-radius:5px;cursor:pointer;transition:0.3s}.btn-enviar:active{transform:scale(0.95)}
.lgpd-box { text-align: left; font-size: 0.8rem; margin: 15px 0; display: flex; gap: 10px; align-items: flex-start; color: #555; background: #f8f9fa; padding: 10px; border-radius: 5px; border: 1px dashed #ccc; }
.lgpd-box input { transform: scale(1.5); margin-top: 3px; min-width: 20px; }
</style></head><body><div id="telaCarregando"><br><h2>Aguardando Sorteio...</h2><div class="loader"></div><p>Olhe para a TV!</p></div><div id="formCadastro"><h2 style="color:#333;">🎉 Quase lá!</h2><p>Preencha para liberar o prêmio:</p><input type="text" id="cNome" class="inp-dados" placeholder="Seu Nome Completo"><input type="tel" id="cZap" class="inp-dados" placeholder="(DD) 9XXXX-XXXX" maxlength="15" oninput="mascaraZap(this)">
<div class="lgpd-box">
    <input type="checkbox" id="checkLGPD">
    <label for="checkLGPD">Autorizo o tratamento de dados conforme Art. 1º da Lei nº 13.709 (LGPD) e confirmo que o número acima é verdadeiro.</label>
</div>
<button onclick="enviarCadastro()" class="btn-enviar">LIBERAR PRÊMIO 🎁</button></div><div id="telaVoucher" style="display:none"><div style="color:#003399;font-size:1.5rem;font-weight:900;margin-bottom:20px;" class="success-header">SUCESSO! 🎉</div><div class="ticket-card"><div style="height:10px;background:#F37021;width:100%;" id="topBar"></div><div class="store-logo" id="lojaNome">LOJA</div><div style="font-size:0.8rem;color:#666;letter-spacing:1px;text-transform:uppercase;">VOUCHER OFICIAL</div><h1 style="font-size:1.8rem;font-weight:700;color:#222;" id="nomePremio">...</h1><div style="background:#f8f9fa;border:2px dashed #ccc;padding:15px;margin:0 20px;border-radius:8px;"><div class="voucher-code" id="codVoucher">...</div></div><div style="font-size:0.8rem;color:#777;margin-top:10px;">Gerado em: <span id="dataHora"></span></div></div>
<button onclick="enviarZapCliente()" class="btn-zap"><span>📱</span> BAIXAR NO MEU WHATSAPP</button>
<button onclick="window.print()" class="btn-print"><span>🖨️</span> IMPRIMIR TELA</button>
<button onclick="location.reload()" style="margin-top:15px;background:none;border:none;color:#666;text-decoration:underline;cursor:pointer;">Pegar outro cupom</button></div><script src="/socket.io/socket.io.js"></script><script>const socket=io();let campanhaAtualId=null;let travadoNoCadastro=false;let dadosGanhos=null;let userZapGlobal=""; let userNameGlobal="";
const audioVitoria=new Audio('/vitoria.mp3');audioVitoria.volume=0.5;
function mascaraZap(o){setTimeout(function(){var v=o.value;v=v.replace(/\\D/g,"");v=v.replace(/^(\\d\\d)(\\d)/g,"($1) $2");v=v.replace(/(\\d{5})(\\d)/,"$1-$2");o.value=v;},1);}
socket.on('trocar_slide',d=>{if(travadoNoCadastro)return;if(d.modo!=='intro'){campanhaAtualId=d.id;travadoNoCadastro=true;document.getElementById('telaCarregando').style.display='none';document.getElementById('formCadastro').style.display='block'}else{document.getElementById('telaCarregando').style.display='block';document.getElementById('formCadastro').style.display='none';document.getElementById('telaVoucher').style.display='none'}});
function enviarCadastro(){
    const nome=document.getElementById('cNome').value;
    const zap=document.getElementById('cZap').value;
    const check=document.getElementById('checkLGPD').checked;
    
    // VALIDAÇÃO 1: Nome Completo (Pelo menos 2 nomes)
    if(!nome || nome.trim().split(' ').length < 2){
        alert("❌ Por favor, digite seu Nome e Sobrenome."); return;
    }

    // VALIDAÇÃO 2: Telefone Rigoroso
    const zapLimpo = zap.replace(/\\D/g, "");
    const regexCelularBR = /^[1-9]{2}9[0-9]{8}$/; // DDD + 9 + 8 digitos
    
    if(!regexCelularBR.test(zapLimpo)){
        alert("❌ Número Inválido!\\nDigite um celular com DDD + 9 dígitos.\\nEx: 11999998888"); return;
    }
    
    // VALIDAÇÃO 3: Anti-Repetição (Ex: 11999999999) - CORRIGIDO PARA NAO DAR ERRO
    if(/^(\\d)\\1+$/.test(zapLimpo)) {
        alert("❌ Número Inválido (Dígitos repetidos)."); return;
    }

    if(!check){alert("⚠️ É obrigatório aceitar o termo da LGPD.");return}

    // Salva na memória
    userZapGlobal = zapLimpo;
    userNameGlobal = nome;

    audioVitoria.play().then(()=>{audioVitoria.pause();audioVitoria.currentTime=0}).catch(e=>{});
    document.getElementById('formCadastro').innerHTML="<h2>Validando...</h2><div class='loader'></div>";
    socket.emit('resgatar_oferta',{id:campanhaAtualId,cliente:{nome,zap}})
}
function enviarZapCliente() {
    if(!dadosGanhos || !userZapGlobal) return;
    const msg = "Olá! Sou *" + userNameGlobal + "*. Acabei de ganhar o voucher *" + dadosGanhos.codigo + "* (" + dadosGanhos.produto + ") na loja *" + dadosGanhos.loja + "*.";
    const link = "https://wa.me/55" + userZapGlobal + "?text=" + encodeURIComponent(msg);
    window.open(link, '_blank');
}
socket.on('sucesso',d=>{
    dadosGanhos = d;
    document.getElementById('formCadastro').style.display='none';
    document.getElementById('telaVoucher').style.display='block';
    document.getElementById('lojaNome').innerText=d.loja;
    document.getElementById('lojaNome').style.color=d.isGold?'#FFD700':'#333';
    document.getElementById('nomePremio').innerText=d.produto;
    document.getElementById('codVoucher').innerText=d.codigo;
    const agora=new Date();
    document.getElementById('dataHora').innerText=agora.toLocaleDateString('pt-BR')+' '+agora.toLocaleTimeString('pt-BR');
    audioVitoria.play().catch(e=>{});
    confetti({particleCount:150,spread:70,origin:{y:0.6}});
    if(d.isGold){document.getElementById('topBar').style.background="#FFD700";document.querySelector('.success-header').innerText="SORTE GRANDE! 🌟"}else{document.getElementById('topBar').style.background="#F37021"}
});</script></body></html>`;

// ==================================================================
// 3. HTML ADMIN E CAIXA
// ==================================================================
const htmlCaixa = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:Arial;padding:20px;background:#eee;text-align:center} input{padding:15px;font-size:20px;width:80%;text-transform:uppercase;margin:20px 0;border-radius:10px;border:1px solid #ccc} button{padding:15px 30px;font-size:18px;background:#333;color:white;border:none;border-radius:10px;cursor:pointer} .resultado{margin-top:20px;padding:20px;background:white;border-radius:10px;display:none}</style></head><body><h1>📟 Validador</h1><p>Digite o código:</p><input type="text" id="codigoInput" placeholder="Ex: MAX-8888"><br><button onclick="validar()">VERIFICAR</button><div id="resultadoBox" class="resultado"><h2 id="msgRes">...</h2><p id="detalheRes">...</p></div><script src="/socket.io/socket.io.js"></script><script>const socket = io(); function validar(){ const cod = document.getElementById('codigoInput').value; if(cod) socket.emit('validar_cupom', cod); } socket.on('resultado_validacao', d => { const box = document.getElementById('resultadoBox'); box.style.display = 'block'; document.getElementById('msgRes').innerText = d.msg; document.getElementById('msgRes').style.color = d.sucesso ? 'green' : 'red'; document.getElementById('detalheRes').innerText = d.detalhe || ''; });</script></body></html>`;

const htmlAdmin = `<!DOCTYPE html><html><head><title>Painel Admin</title><style>body{background:#222;color:white;font-family:sans-serif;padding:20px}.card{background:#333;padding:15px;margin-bottom:10px;border-radius:8px;border-left:5px solid #555;display:flex;justify-content:space-between}.btn-down{background:#FFD700;color:000;padding:10px 20px;text-decoration:none;border-radius:5px;font-weight:bold}</style></head><body><h1>Painel Admin ⚙️</h1><a href="/baixar-relatorio" class="btn-down">📥 Baixar Excel Premium</a><div id="lista">...</div><script src="/socket.io/socket.io.js"></script><script>const socket=io();socket.on('dados_admin',d=>{let h="";d.forEach(i=>{if(i.ehSorteio){h+= \`<div class="card" style="border-left-color:\${i.cor}"><strong>\${i.loja}</strong><span>📦 \${i.qtd} | 📉 \${i.baixas}</span></div>\`}});document.getElementById('lista').innerHTML=h})</script></body></html>`;

// ==================================================================
// MOTOR DO SERVIDOR
// ==================================================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(express.static('public')); 

let historicoVendas = []; 
let slideAtual = 0;

setInterval(() => { 
    if (campanhas.length > 0) { 
        slideAtual++; 
        if (slideAtual >= campanhas.length) slideAtual = 0; 
        let dadosSlide = { ...campanhas[slideAtual], todasLojas: campanhas };
        io.emit('trocar_slide', dadosSlide);
    }
}, 30000);

function gerarCodigo(prefixo) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return `${prefixo}-${result}`;
}

// ROTAS
app.get('/marketing', (req, res) => res.send(renderMarketingPage(campanhas)));
app.get('/tv', (req, res) => res.send(htmlTV));
app.get('/mobile', (req, res) => res.send(htmlMobile));
app.get('/admin', (req, res) => res.send(htmlAdmin));
app.get('/caixa', (req, res) => res.send(htmlCaixa));
app.get('/', (req, res) => res.redirect('/tv'));
app.get('/qrcode', (req, res) => { const url = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/mobile`; QRCode.toDataURL(url, (e, s) => res.send(s)); });

// ROTA ADICIONAR LOJA
app.post('/adicionar-loja', upload.single('imagemUpload'), (req, res) => {
    const { loja, cor, prefixo, premio1, premio2 } = req.body;
    let novoId = campanhas.length > 0 ? Math.max(...campanhas.map(c => c.id)) + 1 : 0;
    let nomeArquivo = req.file ? req.file.filename : 'padrao.jpg';
    const novaLoja = { id: novoId, loja, arquivo: nomeArquivo, modo: "sorte", cor, qtd: 50, prefixo: prefixo.toUpperCase(), premio1: premio1 || "10% OFF", premio2: premio2 || "50% OFF", ehSorteio: true };
    campanhas.push(novaLoja);
    salvarBanco();
    io.emit('atualizar_banco_dados', campanhas);
    res.redirect('/marketing');
});

// ROTA SALVAR EDIÇÃO
app.post('/salvar-marketing', upload.single('imagemUpload'), (req, res) => {
    const { id, cor, qtd, prefixo, arquivoAtual, premio1, premio2 } = req.body;
    let index = campanhas.findIndex(c => c.id == id);
    if(index > -1) {
        let imagemFinal = req.file ? req.file.filename : arquivoAtual;
        campanhas[index].arquivo = imagemFinal;
        campanhas[index].cor = cor;
        campanhas[index].qtd = parseInt(qtd);
        campanhas[index].prefixo = prefixo;
        campanhas[index].premio1 = premio1;
        campanhas[index].premio2 = premio2;
        salvarBanco();
        io.emit('atualizar_banco_dados', campanhas);
        res.redirect('/marketing');
    } else { res.send('Erro: Loja não encontrada.'); }
});

// ROTA DELETAR
app.post('/deletar-loja', (req, res) => {
    const id = parseInt(req.body.id);
    campanhas = campanhas.filter(c => c.id !== id);
    salvarBanco();
    io.emit('atualizar_banco_dados', campanhas);
    res.redirect('/marketing');
});

// RELATÓRIO EXCEL
app.get('/baixar-relatorio', (req, res) => {
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    let relatorio = `<html><head><meta charset="UTF-8"></head><body style="font-family:Arial;background:#f4f4f4"><table width="100%"><tr><td colspan="8" style="background:#111;color:#FFD700;padding:20px;text-align:center;font-size:24px;font-weight:bold;border-bottom:5px solid #FFD700">🏆 RELATÓRIO FERRARI</td></tr><tr><td colspan="8" style="background:#333;color:#fff;text-align:center">Gerado em: ${dataHoje}</td></tr></table><br><table border="1" style="width:100%;border-collapse:collapse;text-align:center"><thead><tr style="background:#222;color:white"><th>DATA</th><th>HORA</th><th>LOJA</th><th>CÓDIGO</th><th>PRÊMIO</th><th>STATUS</th><th style="background:#0055aa">NOME</th><th style="background:#0055aa">ZAP</th></tr></thead><tbody>`;
    historicoVendas.forEach(h => {
        let bg = h.status === 'Usado' ? '#d4edda' : 'white';
        let style = h.status === 'Usado' ? 'color:green;font-weight:bold' : '';
        relatorio += `<tr style="background:${bg}"><td>${h.data}</td><td>${h.hora}</td><td>${h.loja}</td><td><strong>${h.codigo}</strong></td><td>${h.premio}</td><td style="${style}">${h.status}</td><td>${h.clienteNome}</td><td>${h.clienteZap}</td></tr>`;
    });
    relatorio += `</tbody></table></body></html>`;
    res.header('Content-Type', 'application/vnd.ms-excel');
    res.attachment('Relatorio_Ferrari.xls');
    res.send(relatorio);
});

const getDadosComBaixas = () => {
    return campanhas.map(c => {
        const qtdBaixas = historicoVendas.filter(h => h.loja === c.loja && h.status === 'Usado').length;
        return { ...c, baixas: qtdBaixas, ehSorteio: c.modo === 'sorte' };
    });
};

io.on('connection', (socket) => {
    let dadosSlide = campanhas.length > 0 ? { ...campanhas[slideAtual], todasLojas: campanhas } : {};
    socket.emit('trocar_slide', dadosSlide);
    socket.emit('dados_admin', getDadosComBaixas());
    
    socket.on('resgatar_oferta', (dadosRecebidos) => {
        const id = dadosRecebidos.id;
        const dadosCliente = dadosRecebidos.cliente || {};
        let camp = campanhas.find(c => c.id == id); 
        
        if (camp) { 
            const sorte = Math.random() * 100;
            let premio = camp.premio1 || "10% OFF"; 
            let isGold = false;
            if (sorte > 95) { premio = camp.premio2 || "50% OFF"; isGold = true; }
            const cod = gerarCodigo(camp.prefixo || 'LOJA');
            
            historicoVendas.push({ data: new Date().toLocaleDateString('pt-BR'), hora: new Date().toLocaleTimeString('pt-BR'), loja: camp.loja, codigo: cod, premio: premio, status: 'Emitido', clienteNome: dadosCliente.nome, clienteZap: dadosCliente.zap });
            
            socket.emit('sucesso', { codigo: cod, produto: premio, isGold: isGold, loja: camp.loja }); 
            io.emit('atualizar_qtd', camp);
            io.emit('aviso_vitoria_tv', { loja: camp.loja, premio: premio, isGold: isGold });
            io.emit('dados_admin', getDadosComBaixas());
        }
    });

    socket.on('validar_cupom', (cod) => {
        const cupom = historicoVendas.find(h => h.codigo === cod.toUpperCase());
        if (!cupom) { socket.emit('resultado_validacao', { sucesso: false, msg: "Código Inválido" }); } 
        else if (cupom.status === 'Usado') { socket.emit('resultado_validacao', { sucesso: false, msg: "Já Utilizado!" }); } 
        else { cupom.status = 'Usado'; socket.emit('resultado_validacao', { sucesso: true, msg: "✅ VÁLIDO!", detalhe: `${cupom.premio} - ${cupom.loja}` }); io.emit('dados_admin', getDadosComBaixas()); }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sistema FERRARI + MARKETING Painel rodando na porta ${PORT}`));
