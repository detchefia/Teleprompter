# Teleprompter — DET / UFV

[![Licença: MIT](https://img.shields.io/badge/Licen%C3%A7a-MIT-blue.svg)](LICENSE)
[![R / Shiny](https://img.shields.io/badge/R%20%2F%20Shiny-Web%20App-276DC3.svg)](https://shiny.posit.co/)
[![DET / UFV](https://img.shields.io/badge/DET%20%E2%80%94%20UFV-C%C3%B3digo%20Aberto-0b6623.svg)](https://github.com/detchefia)

Teleprompter web com gravação de vídeo, feito em **R/Shiny + JavaScript**, para usar direto no navegador do celular (Android e iPhone) ou do computador, sem instalar aplicativo.

Criado pelo **Prof. Fernando de Souza Bastos**, atual chefe do **Departamento de Estatística (DET)** da **Universidade Federal de Viçosa (UFV)**, com o objetivo de facilitar a gravação de aulas, comunicados e conteúdos acadêmicos e institucionais pelos servidores do DET. É um projeto de **código aberto** sob a **Licença MIT**.

Fluxo: escrever ou colar o texto → abrir o estúdio → autorizar câmera e microfone → contagem 3‑2‑1 → gravar enquanto o texto rola perto da câmera → revisar → salvar, compartilhar ou gravar de novo.

> **Privacidade:** o vídeo é gravado e salvo **somente no aparelho**. Nenhuma imagem ou som é enviado ao servidor. O texto do teleprompter **não aparece** no vídeo final.

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Requisitos](#requisitos)
- [Instalação e execução](#instalação-e-execução)
- [Permissões e HTTPS](#permissões-e-https)
- [Testar no celular](#testar-no-celular)
- [Publicação (deploy)](#publicação-deploy)
- [Compatibilidade](#compatibilidade)
- [Arquitetura](#arquitetura)
- [Testes](#testes)
- [Integração futura com IA](#integração-futura-com-ia)
- [Dicas para iPhone](#dicas-para-iphone)
- [Limitações conhecidas](#limitações-conhecidas)
- [Autoria e Licença](#autoria-e-licença)

## Funcionalidades

**Roteiro**
- Digitar, colar (botão "Colar"), abrir arquivo `.txt` (lido só no aparelho) e limpar.
- Contagem de palavras e parágrafos e **duração estimada** na velocidade escolhida (calculadas pelo R).
- Texto e ajustes guardados no aparelho (`localStorage`) a cada alteração e recuperados ao voltar; se o editor ficar vazio, o texto de exemplo reaparece.

**Teleprompter**
- Rolagem suave (`requestAnimationFrame`) com velocidade em **palavras por minuto**: a rolagem dura o mesmo que a estimativa mostrada.
- Iniciar, pausar, continuar, voltar ao início, avançar e retroceder; velocidade ajustável durante a leitura (botões − / +).
- Tamanho da letra, espaçamento entre linhas, largura, posição vertical, linhas visíveis e escurecimento do fundo.
- Marcador da linha de leitura com esmaecimento das linhas distantes; texto invertido para vidro de teleprompter físico.
- Toque no texto para pausar/continuar; arraste para reposicionar; roda do mouse no desktop.
- Presets de velocidade (Lento 110, Normal 140, Rápido 170).

**Câmera e gravação**
- Câmera frontal por padrão; troca para a traseira quando houver mais de uma câmera.
- Pré-visualização espelhada (opcional), **vídeo gravado sem espelhamento**.
- Botão "quadro completo" para ver exatamente o enquadramento que será gravado.
- Contagem regressiva configurável (desativada, 3, 5 ou 10 s).
- Gravação de vídeo + áudio com `MediaRecorder`; o formato é escolhido perguntando ao navegador (`MediaRecorder.isTypeSupported`): MP4 (H.264/AAC) quando disponível, senão WebM. No Safari o app pede explicitamente MP4 com H.264 (High 4.2) + AAC, com alternativas; sem codecs explícitos o navegador escolhe (o Chrome, por exemplo, grava VP9 + Opus em MP4, que o iPhone recusa). Se uma gravação vier vazia, o app desliga a taxa de bits fixa e, se preciso, passa ao formato seguinte, com diagnóstico na tela.
- Indicador **● GRAVANDO** com cronômetro; pausar/continuar gravação (quando o navegador suporta); cancelar; finalizar.
- Se o microfone não existir ou estiver ocupado, grava só o vídeo e avisa.
- Se a câmera for interrompida no meio, o que já foi gravado é mantido.
- Gravação em fatias de 1 s em todos os navegadores (o navegador entrega o vídeo aos poucos, sem acumular tudo até o fim).
- **Vigia da imagem:** durante a gravação o app confere se a câmera continua entregando quadros, se o sistema silenciou a câmera e se o aparelho foi girado, e avisa na hora.

**Revisão e salvamento**
- Após parar, o vídeo é **preparado no próprio aparelho** com a biblioteca [mediabunny](https://github.com/Vanilagy/mediabunny) (MPL‑2.0, em `www/vendor/`): sai sempre como MP4 **H.264 + AAC com índice no início**, o formato da câmera do iPhone, aceito pelo Fotos e pelo WhatsApp. Se o vídeo já está nesse formato, é só reorganizado (sem perda); se não está, é recodificado quando o navegador permite. A tela de revisão mostra o formato real (ex.: “MP4 H.264 + AAC · 1080×1920 · pronto para Fotos/WhatsApp”).
- **Autoverificação:** um leitor próprio da estrutura do MP4 (`www/js/mp4info.js`) mede quadros e segundos de vídeo e de áudio no arquivo original e no final. Um resultado com menos imagem que o original é descartado; se a imagem terminar antes do som, o app avisa. “Detalhes técnicos”, na revisão, reúne formato, fatias, medidas e eventos da câmera, para suporte.
- **Qualidade do vídeo** configurável (resolução da câmera + taxa de bits): Leve — 720p, ≈ 12 MB/min; Padrão — 1080p, ≈ 27 MB/min; Alta — 1080p, ≈ 45 MB/min.
- Pré-visualização com player (reproduzir, pausar, voltar).
- **Salvar / Compartilhar** via Web Share API (no iPhone, a folha de compartilhamento tem "Salvar vídeo" → Fotos).
- **Baixar vídeo** (download local; no iPhone vai para Arquivos › Downloads).
- **Gravar novamente**: o vídeo anterior só é descartado após confirmação, se ainda não foi salvo.
- Aviso antes de fechar a página com gravação em andamento ou vídeo não salvo.

**Experiência mobile**
- Interface mobile first, em retrato, adaptada para paisagem e desktop; respeita notch/safe areas.
- Tela cheia (Android/desktop) com trava de orientação; no iPhone, orientação para "Adicionar à Tela de Início".
- Mantém a tela acesa no estúdio (Screen Wake Lock API, com fallback silencioso).
- PWA básico: manifest e ícones, podendo ser "instalado" na tela inicial.
- Continua funcionando se a conexão com o servidor cair (ex.: tela bloqueada).
- Acessibilidade: HTML semântico, `aria-label` em todos os botões de ícone, foco visível, atalhos de teclado.

**Atalhos no desktop (dentro do estúdio)**

| Tecla | Ação |
|---|---|
| Espaço | Rolar / pausar texto |
| R | Gravar / finalizar |
| P | Pausar / continuar gravação |
| ↑ / ↓ | Voltar / avançar uma linha |
| ← / → | Diminuir / aumentar velocidade |
| Home | Voltar o texto ao início |
| F | Tela cheia |
| M | Espelhar imagem |
| Esc | Fechar painel / estúdio |

## Requisitos

- **R ≥ 4.1** (desenvolvido e testado com R 4.4.2)
- Pacote **shiny ≥ 1.8** (testado com 1.10.0). `htmltools` e `jsonlite` vêm com o shiny.
- Opcional, para testes: `testthat` (R) e **Node.js ≥ 22** + Chrome ou Edge (testes do JavaScript e ponta a ponta).

## Instalação e execução

```r
install.packages("shiny")
```

Na pasta do projeto:

```r
shiny::runApp()
```

Ou pelo terminal:

```bash
Rscript -e "shiny::runApp(port = 7788, launch.browser = TRUE)"
```

Abra `http://127.0.0.1:7788`. Em `localhost` o navegador libera câmera e microfone sem HTTPS.

## Permissões e HTTPS

- A câmera e o microfone só são solicitados quando você toca em **Abrir estúdio**.
- Os navegadores **só liberam câmera e microfone em páginas HTTPS** (exceção: `localhost`/`127.0.0.1`). Abrir o app pelo IP da rede local (`http://192.168...`) **não funciona** no celular — use HTTPS.
- Se a permissão for negada, o app mostra como liberar: ícone de cadeado (Chrome) ou "aA" (Safari) ao lado do endereço → permitir câmera e microfone.
- Links abertos dentro de apps (Instagram, WhatsApp, Facebook) usam navegadores internos que costumam bloquear a câmera; o app avisa para abrir no Chrome/Safari.

## Testar no celular

Para testar rapidamente no celular antes de publicar, crie um túnel HTTPS temporário até o app rodando no computador (o [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) não exige conta):

```bash
Rscript -e "shiny::runApp(port = 7788)"
```

Em outro terminal:

```bash
cloudflared tunnel --url http://127.0.0.1:7788
```

Abra no celular o endereço `https://….trycloudflare.com` exibido. O endereço é público enquanto o túnel estiver aberto; feche-o (Ctrl+C) ao terminar.

## Publicação (deploy)

O vídeo nunca passa pelo servidor, então qualquer hospedagem Shiny pequena serve. O essencial é **HTTPS**.

### Opção recomendada: shinyapps.io (HTTPS automático, plano gratuito)

1. Crie uma conta em <https://www.shinyapps.io> e copie o token em *Account › Tokens*.
2. Defina as variáveis de ambiente `SHINYAPPS_ACCOUNT`, `SHINYAPPS_TOKEN` e `SHINYAPPS_SECRET` (por exemplo em `~/.Renviron`; **nunca** no código).
3. Na raiz do projeto:

```bash
Rscript deploy/deploy_shinyapps.R
```

O app fica em `https://<conta>.shinyapps.io/teleprompter/` e pode ser aberto em Android e iPhone.

### Servidor próprio com Docker + HTTPS automático (Caddy)

Com um domínio apontando para o servidor e as portas 80/443 abertas:

```bash
TELEPROMPTER_DOMAIN=teleprompter.seudominio.com.br docker compose up -d --build
```

O Caddy obtém e renova o certificado HTTPS (Let's Encrypt). Só a imagem do app:

```bash
docker build -t teleprompter .
```

```bash
docker run -p 3838:3838 teleprompter
```

### Outras opções

- **Posit Connect** / **Shiny Server**: publicar a pasta (`app.R`, `R/`, `www/`) normalmente, atrás de HTTPS.
- Arquivo `.rscignore` exclui testes e arquivos de deploy da publicação pelo `rsconnect`.

## Compatibilidade

| Navegador | Situação |
|---|---|
| Chrome (Windows) | ✅ Testado automaticamente (câmera/microfone simulados): gravação MP4 e WebM |
| Edge (Windows) | ✅ Testado automaticamente (câmera/microfone simulados) |
| Chrome Android | ⚠️ Esperado funcionar (mesmo motor); **precisa de teste em aparelho real** |
| Safari iOS ≥ 14.3 | ⚠️ Suportado pelo código (MP4, `playsinline`, share sheet, sem fatias de gravação); **precisa de teste em iPhone real** |
| Safari macOS ≥ 14.1 | ⚠️ Não testado |
| Firefox | ⚠️ Não testado; deve gravar em WebM (caminho WebM testado no Chrome) |
| Navegadores internos de apps | ❌ Geralmente bloqueiam a câmera; o app orienta a abrir no navegador |

Recursos com suporte variável e fallback: Web Share com arquivos, tela cheia (não existe para páginas no iPhone), Wake Lock (iOS ≥ 16.4), trava de orientação (Android em tela cheia), pausa do `MediaRecorder`.

## Arquitetura

```
câmera ──getUserMedia──► MediaStream ──► <video> de pré-visualização (espelhado via CSS)
                              │
                              └────────► MediaRecorder ──► Blob (MP4/WebM) ──► revisar / baixar / compartilhar
                                          (grava o stream bruto: sem texto, sem espelhamento)

texto ──► Shiny (R): normaliza, conta palavras, estima duração ──► mensagem "tp:script" ──► teleprompter (HTML sobre o vídeo)
```

- **R/Shiny** cuida do que é texto: normalização, estatísticas, duração estimada e o ponto de entrada `load_script()` para outras fontes de conteúdo. Também gera a interface (HTML semântico, sem Bootstrap) e define em um só lugar os ajustes e seus limites (`R/settings.R`), enviados ao JavaScript como JSON.
- **JavaScript** cuida do que é naturalmente do navegador: câmera, gravação, rolagem, tela cheia, wake lock, download e compartilhamento.
- O **texto é uma camada HTML sobre o `<video>`**; o gravador recebe o `MediaStream` original. Por construção, texto e espelhamento nunca entram no arquivo.
- A comunicação R ↔ JS: o editor é um `textarea` ligado ao Shiny (`input$script`); a velocidade vai por `Shiny.setInputValue("tp_wpm")`; o roteiro volta por `session$sendCustomMessage("tp:script")`. Se a conexão cair, o JavaScript usa o texto local e tudo continua funcionando.

### Estrutura

```
app.R                  ponto de entrada (os arquivos em R/ são carregados pelo Shiny)
R/
  ui.R                 página, <head>, PWA, scripts
  ui_editor.R          tela de edição do roteiro e ajustes
  ui_studio.R          estúdio (câmera + teleprompter + controles), revisão, diálogos
  ui_components.R      botões e controles reutilizáveis
  icons.R              ícones SVG embutidos (sem CDN)
  settings.R           definição única dos ajustes (limites e padrões) → JSON para o JS
  server.R             estatísticas do texto e envio do roteiro ao cliente
  script_utils.R       funções puras: normalizar, contar palavras, estimar duração
  script_source.R      load_script(): entrada de roteiros de qualquer origem (futura IA)
www/
  css/app.css          estilos (mobile first, safe areas, paisagem, reduzir movimento)
  js/utils.js          funções puras (formato de vídeo, tempo, mensagens de erro...) — testadas no Node
  js/storage.js        localStorage tolerante a falhas
  js/camera.js         getUserMedia com tentativas progressivas e fallback sem áudio
  js/recorder.js       MediaRecorder: formato, fatias, pausa, finalização segura
  js/finalize.js       prepara o MP4 final H.264/AAC (mediabunny, carregado sob demanda) e se autoverifica
  js/mp4info.js        leitor mínimo de MP4: quadros e duração de vídeo/áudio (diagnóstico)
  vendor/              mediabunny.min.js + licença MPL-2.0
  js/teleprompter.js   motor de rolagem e gestos
  js/app.js            orquestração: estúdio, contagem, gravação, revisão, atalhos
  manifest.webmanifest, icons/   PWA
tests/
  testthat/            testes R (funções, UI, server)
  js/                  testes das funções JS (node --test)
  e2e/run-e2e.mjs      teste ponta a ponta com Chrome headless e câmera simulada
deploy/deploy_shinyapps.R, Dockerfile, docker-compose.yml, Caddyfile
```

## Testes

```bash
Rscript tests/testthat.R
```

```bash
npm test
```

Ponta a ponta (com o app rodando em `http://127.0.0.1:7788`):

```bash
npm run test:e2e
```

Para simular o Safari do iPhone (user-agent do iOS, que ativa o caminho de gravação do Safari), defina `E2E_IPHONE=1` antes do comando. Isso testa a lógica do app, não o motor WebKit real.

O teste ponta a ponta abre o Chrome (ou o Edge, com `CHROME_PATH`) em modo headless com **câmera e microfone simulados** e percorre o fluxo completo: estatísticas do R, persistência, estúdio, rolagem, contagem, gravação, pausa, finalização, reprodução do vídeo (imagem e áudio), gravação longa de 35 s com imagem conferida quadro a quadro, vigia de câmera travada, verificação de que o vídeo não contém o texto nem o espelhamento, download, regravação, cancelamento, formato WebM alternativo, paisagem, desktop, atalhos, "reduzir movimento" e queda da conexão com o servidor. As capturas de tela ficam em `tests/e2e/screenshots/`.

## Integração futura com IA

O componente de texto é desacoplado: qualquer origem entrega o roteiro por `load_script()` (`R/script_source.R`), que atualiza o editor e o teleprompter, mesmo com o estúdio aberto. Exemplo para o fluxo *tema → texto → teleprompter → gravação*:

```r
observeEvent(input$gerar, {
  texto <- gerar_roteiro(tema = input$tema, duracao_seg = 60) # chamada à API da Solução Parlamentar
  load_script(session, texto, source = "ia")
})
```

A estimativa de duração (`script_stats()`) pode ser usada para pedir textos do tamanho certo (≈ 140 palavras por minuto).

## Dicas para iPhone

- **Salvar no Fotos:** na revisão, toque em “Salvar no Fotos / Compartilhar” e escolha “Salvar vídeo”. “Salvar em Arquivos” guarda no app Arquivos › Downloads (não no Fotos).
- **Safari e ícone da Tela de Início guardam dados separados:** o texto e os ajustes feitos no Safari não aparecem no app aberto pelo ícone (e vice‑versa). Use sempre o mesmo.
- **Atualizações:** feche o app no alternador de apps e abra de novo para carregar a versão mais recente.

## Limitações conhecidas

- **Não testado em aparelhos reais** (Android, iPhone), nem com câmera/microfone físicos: os testes automáticos usam dispositivos simulados do Chrome. Antes de uso amplo, testar gravação, orientação, troca de câmera e salvamento em Android/Chrome e iPhone/Safari.
- O enquadramento gravado é o da câmera (a pré-visualização em tela cheia pode cortar as bordas; use o botão "quadro completo" para conferir). A orientação do vídeo segue a do aparelho ao iniciar a câmera; girar o aparelho durante a gravação pode gerar resultados diferentes por navegador.
- A troca de câmera fica desativada durante a gravação (trocar o stream no meio quebra o `MediaRecorder`).
- Vídeos longos ficam na memória do aparelho até serem salvos/descartados; gravações muito longas podem pesar em aparelhos modestos.
- No iPhone não existe tela cheia para páginas; o equivalente é "Adicionar à Tela de Início".
- O build do Docker não foi testado neste ambiente (Docker indisponível).
- Não há service worker (modo offline) ainda; o manifest já permite instalar na tela inicial.

## Autoria e Licença

- **Autor:** Prof. Fernando de Souza Bastos — Chefe do Departamento de Estatística (DET), Universidade Federal de Viçosa (UFV).
- **Instituição:** [Departamento de Estatística (DET / UFV)](https://github.com/detchefia)
- **Licença do projeto:** [Licença MIT](LICENSE) — código aberto, livre para uso, modificação e redistribuição.
- **Dependência de terceiros incluída:** [`mediabunny`](https://github.com/Vanilagy/mediabunny) (v1.60.0, em `www/vendor/`), distribuída sob a licença **MPL-2.0** ([`www/vendor/mediabunny.LICENSE.txt`](www/vendor/mediabunny.LICENSE.txt)).
