# Estoque Yêlla Móveis

Página de consulta rápida do estoque para os vendedores, feita para usar no celular.

**Link:** https://hnunescastro-hash.github.io/estoque-yella-moveis/

## O que a página faz

- **Nome do vendedor:** no primeiro acesso, uma janela pede o nome. As iniciais aparecem num círculo no canto
  direito do topo; tocando nele abre uma gaveta para mudar o nome, o **telefone** (vai na mensagem do WhatsApp), a **comissão**, o **desconto máximo**
  (assim eles não ocupam espaço na página) e o **tema**: Claro, Escuro ou Automático (segue o celular).
  O **olhinho** ao lado de "Comissão e desconto" esconde o "até R$…" e o "você ganha…" dos cartões
  (bom para mostrar o celular ao cliente); escondidos, eles só aparecem ao abrir os detalhes do produto.
- A página não tem textos de dica nem rodapé: só o necessário para consultar e vender.
- **Lojas:** abas no topo para ver **Todas as lojas**, só **Matina - BA** ou só **Igaporã - BA**.
  Em "Todas as lojas", cada produto mostra de qual loja é, numa etiqueta no canto direito da linha do nome,
  com uma cor de texto para cada loja. A escolha fica salva no celular.
- **Busca** pelo nome ou pelo código do produto. Não precisa acertar acento, plural nem a abreviação do sistema
  (ex.: `geladeira` acha os refrigeradores, `guarda roupa` acha também os roupeiros, `colchão casal` acha os de 138 cm).
- **Buscar por fornecedor:** quando a busca não acha produto, a página oferece os fornecedores com aquele nome
  (ou a lista de todos). Se a busca achou produtos mas também é nome de fornecedor (ex.: `gazin`), aparece um atalho
  para ver tudo daquele fornecedor. Com o filtro ligado, dá para buscar dentro dos produtos dele.
- **Classificadores** logo abaixo da busca: **A → Z** (tocando de novo vira Z → A, é o padrão),
  **Maior estoque** (vira Menor estoque) e **Menor preço** (vira Maior preço). Buscando por código, o produto com
  aquele código vem primeiro. Produto com preço provisório de R$ 1,00 no sistema aparece como
  "Preço a confirmar" e vai para o fim da lista.
- **Categorias** (colchão, guarda-roupa, cozinha…) com ícone e quantidade, abaixo dos classificadores.
- Cartão compacto: o **nome** numa linha só (cortado com "…" quando não cabe) e, abaixo, o **preço** e,
  à direita, a **quantidade em estoque** (caixinha verde, âmbar na última unidade, cinza fora do estoque)
  seguida dos botões **anunciar, WhatsApp, ver foto e detalhes**, tudo na mesma linha.
  Em **Detalhes**: nome completo, código, fornecedor, origem (transferência entre lojas), última compra,
  última venda e o nome do sistema.
- **WhatsApp:** abre o WhatsApp com a mensagem pronta; o vendedor escolhe o contato e ainda pode editar o texto:

  ```
  *Adaptador USB*

  💰 *R$ 16,20* com 10% OFF no Pix
  💳 R$ 18,00 no cartão
  🚚 Entrega Grátis
  🔥 Últimas unidades!

  Quer garantir?
  É só responder esta mensagem! 😊

  Yêlla Móveis · Igaporã - BA
  Atendimento: Hugo Castro
  Tel. (77) 99999-8888
  ```

  - O desconto no Pix é o **Desconto máximo** do vendedor (o mesmo "até R$" do cartão); sem desconto, sai o preço cheio.
  - Cartão: até **10x sem juros** com **parcela mínima de R$ 25** (ex.: R$ 180,00 em 7x de R$ 25,71;
    abaixo de R$ 50 aparece só "no cartão"). Ajustável em `PARCELAS_SEM_JUROS` e `PARCELA_MINIMA` no `app.js`.
  - "🔥 Últimas unidades!" com até 3 unidades no estoque; acima disso, "✅ Pronta entrega".
  - O **telefone** do vendedor (campo na gaveta do perfil) entra na linha "Tel."; sem telefone, a linha não aparece.
  - A foto não vai junto (o link do WhatsApp só leva texto).
- **Ver foto:** abre o Google Imagens com o nome do produto seguido do fornecedor (quando o fornecedor ajuda a achar a foto certa).
- **Comissão e desconto:** o vendedor vê em cada produto até onde pode chegar e quanto ganha.
  A comissão é calculada **sobre o valor que o cliente paga**: no preço cheio e no preço com o desconto máximo.
  O preço mínimo é arredondado para cima, para nunca passar do desconto permitido.
- **Anunciados:** o botão de megafone manda o produto para a aba Anunciados, onde o vendedor marca como está o pedido:
  Anunciado, Negociando, Reservado, Vendido, Entregue ou Cancelado (com filtro por status e histórico).
  Cada anunciado também tem o botão de **detalhes** do produto; se o produto saiu do estoque, mostra o que foi
  guardado ao anunciar (código, loja e preço da época).
- Nome, percentuais, loja escolhida e anunciados ficam salvos **no próprio celular** de cada vendedor.
- Depois do primeiro acesso, continua funcionando com internet fraca ou sem internet (mostra o último estoque salvo),
  e pode ser adicionada à tela inicial do celular como um aplicativo.

Os nomes dos produtos foram revisados: abreviações completadas e ortografia corrigida
(ex.: `GR MAYA 3 PTS MDP CINOMO/OFF WHITE` → `Guarda-Roupa Maya 3 Portas MDP Cinamomo/Off White`).
O nome original do sistema continua visível em **Detalhes**, para conferir no CompuFour.

## Como atualizar o estoque

### Pelo site (administrador) — o jeito normal

1. No CompuFour, gere o relatório **Controle de estoque** de cada loja e salve em HTML (mesmo formato de sempre).
2. No site, toque nas suas iniciais (no topo) → **Administrador** → digite a **chave de administrador** → Entrar.
   A chave fica no Bitwarden Secrets Manager: `ESTOQUE_YELLA_CHAVE_ADMIN`. O aparelho lembra dela até tocar em
   "Sair do modo administrador".
3. Escolha o relatório de cada loja (pode ser só uma) e toque em **Conferir mudanças**. Aparece a lista do que mudou:
   ▲▼ quantidade, + produto novo, − produto que saiu, R$ preço, e os **nomes automáticos** de produtos novos para conferir.
4. Toque em **Publicar**. O site atualiza para todos em cerca de 1 minuto (a própria tela avisa quando terminar).
   Quem estiver com o site aberto recebe o estoque novo ao voltar para a página.

Proteções:
- O arquivo tem que ser da loja certa (o relatório diz a cidade): trocado, é recusado.
- Se mais de 10% dos produtos de uma loja saírem de uma vez, a publicação pede confirmação
  ("Publicar mesmo assim") — protege contra relatório incompleto.
- O custo de compra nunca é publicado; cada publicação fica no histórico do GitHub (dá para desfazer).
- Nome de produto novo recebe a correção automática; para deixá-lo do jeito certo, acrescente a linha em
  `ferramentas/correcoes.json` e publique — o servidor usa sempre a versão mais recente das correções.

Como funciona por dentro: a página envia os relatórios ao servidor `servidor/app.py` no Google Cloud Run
(projeto `estoque-yella`, serviço `estoque-yella-admin`, região `southamerica-east1`). Ele confere a chave, monta os
dados com o mesmo código do comando de terminal (`ferramentas/atualizar_estoque.py`), compara com o que está no
ar e, ao publicar, grava `dados/<loja>.json` no GitHub com uma chave de publicação que só escreve neste repositório.

- Credenciais (nunca no código): Secret Manager `estoque-yella-chave-admin` e `estoque-yella-deploy-key`, com cópia
  no Bitwarden (`ESTOQUE_YELLA_CHAVE_ADMIN` e `ESTOQUE_YELLA_DEPLOY_KEY`). A chave de publicação aparece no GitHub em
  Settings → Deploy keys como "Atualização de estoque (Cloud Run)".
- Trocar a chave de administrador: grave o valor novo no Bitwarden e como nova versão de `estoque-yella-chave-admin`
  no Secret Manager, e rode `sh servidor/implantar.sh` (o servidor passa a aceitar só a nova).
- Publicar uma mudança no servidor: `sh servidor/implantar.sh`.

### Pelo terminal

1. No CompuFour, gere o relatório **Controle de estoque** e salve em HTML (mesmo formato do arquivo original).
2. Na pasta do projeto, rode o comando da loja:

   ```bash
   python3 ferramentas/atualizar_estoque.py matina "caminho/do/relatorio-matina.html"
   python3 ferramentas/atualizar_estoque.py igapora "caminho/do/relatorio-igapora.html"
   ```

   O script confere o total de produtos e de unidades com os totais do próprio relatório.
3. Se aparecer a lista **"produtos sem nome revisado"**, são produtos novos: eles recebem uma correção automática.
   Para deixar o nome do jeito certo, acrescente a linha em `ferramentas/correcoes.json` (seção `produtos`,
   com a descrição do sistema em maiúsculas → nome corrigido) e rode o script de novo.
4. Publique:

   ```bash
   git add -A && git commit -m "Atualiza estoque" && git push
   ```

   A página atualiza sozinha em 1 a 2 minutos.

Para cadastrar outra loja, rode o mesmo comando com um identificador novo (sem acento e sem espaço) e,
se quiser, `--nome "Nome da Cidade" --uf BA`. A aba da loja aparece sozinha na página.

### Fornecedor dos produtos de Igaporã

No relatório de Igaporã, o "último fornecedor" da maioria dos produtos é a própria loja de Matina
(transferência interna). Por isso o fornecedor verdadeiro foi cruzado com o estoque de Matina:
mesmo modelo/linha, preço praticamente igual ou marca com fornecedor único em Matina.
O resultado fica em `ferramentas/correcoes.json`, seção `fornecedor_do_produto` (descrição do sistema → fornecedor).
Produto sem correspondência segura fica como "Não identificado", em vez de chutar.

### O que nunca é publicado

O relatório de Igaporã traz a coluna **Custo de Compra**. O script ignora essa coluna: ela não vai para os
dados nem para o GitHub, porque a página é pública (apenas não aparece em buscadores).

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html`, `app.css`, `app.js` | a página |
| `sw.js`, `manifest.webmanifest`, `icons/` | funcionamento sem internet e ícone na tela inicial |
| `dados/lojas.json` | lista de lojas |
| `dados/matina.json`, `dados/igapora.json` | estoque de cada loja (gerados pelo script) |
| `ferramentas/atualizar_estoque.py` | lê o relatório do CompuFour e gera os dados |
| `ferramentas/correcoes.json` | nomes revisados de produtos e fornecedores, fornecedor cruzado de Igaporã, fornecedores usados na busca de foto |
| `servidor/` | servidor de atualização pelo site (Cloud Run): `app.py`, `Dockerfile`, `implantar.sh` |

Os relatórios brutos do CompuFour não vão para o GitHub (estão no `.gitignore`).
