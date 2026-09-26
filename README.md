# Estoque Yêlla Móveis

Página de consulta rápida do estoque para os vendedores, feita para usar no celular.

**Link:** https://hnunescastro-hash.github.io/estoque-yella-moveis/

## O que a página faz

- **Nome do vendedor:** no primeiro acesso, uma janela pede o nome. As iniciais aparecem num círculo no canto
  direito do topo; tocando nele abre uma gaveta para mudar o nome, o **telefone** (vai na mensagem do WhatsApp), a **comissão**, o **desconto máximo**
  (assim eles não ocupam espaço na página) e o **tema**: Claro, Escuro ou Automático (segue o celular).
  O **olhinho** ao lado de "Comissão e desconto" mostra ou esconde as contas em **ver mais** (bom para mostrar o
  celular ao cliente): preço mínimo, comissão e, no modo administrador, preço de compra, imposto e sobra.
  Essas contas nunca aparecem no cartão, só nos detalhes, uma por linha, com a cor de destaque.
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
- **Parados:** primeira pílula das categorias, com a quantidade de produtos sem venda nem compra há mais de 90 dias
  (conta a mais recente das duas: produto que acabou de chegar não é parado). Mostra o mais parado primeiro, com o
  tempo parado ao lado do nome. Só nas lojas cujo relatório traz a última venda (hoje, Matina).
- **Novo:** etiqueta ao lado do nome do produto que entrou no estoque nos últimos 15 dias (a data de entrada é
  marcada na publicação em que o produto aparece pela primeira vez, se ele foi comprado nos últimos 30 dias).
- **Sem estoque (encomenda):** os produtos de Matina que acabaram e foram comprados nos últimos 48 meses aparecem
  na **busca**, depois dos que têm estoque, embaixo do separador "Sem estoque", com a caixinha "0" em vermelho discreto — para
  consultar o preço quando o cliente aceita esperar a mercadoria chegar. Não aparecem na lista inicial nem nas
  categorias; a pílula **Sem estoque** mostra todos. A mensagem do WhatsApp deles sai com "📦 Sob encomenda".
- **Enviar vários:** o botão **Selecionar** (ao lado da contagem) marca até 10 produtos e manda todos numa mensagem só
  do WhatsApp ("Separei estas opções para você:"), cada um com o preço no Pix e no cartão.
- Cartão compacto: o **nome** numa linha só (cortado com "…" quando não cabe) e, abaixo, o **preço** e,
  à direita, a **quantidade em estoque** (caixinha verde, âmbar na última unidade, vermelho discreto sem estoque)
  seguida dos botões **anunciar, WhatsApp, ver foto e detalhes**, tudo na mesma linha.
  Em **Detalhes**: nome completo, código, quantidade, **preço mínimo** (com o desconto máximo) e **comissão**
  (comissão), fornecedor, origem (transferência entre lojas), última compra,
  última venda, o nome do sistema e, quando houver, a **galeria de fotos** (até 6; tocando, abre em tela
  cheia para passar uma a uma). As fotos ficam em `fotos/` e `dados/fotos.json`, buscadas por
  `ferramentas/buscar_fotos.py`.
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
  - **Fotos junto:** no celular, produto com fotos abre o compartilhamento do aparelho com as fotos (até 6)
    e a mensagem; é só escolher o WhatsApp e o contato. No computador, ou em produto sem fotos, abre só
    o texto (o link do WhatsApp não leva imagem).
- **Ver foto:** abre o Google Imagens com o nome do produto seguido do fornecedor (quando o fornecedor ajuda a achar a foto certa).
- **Comissão e desconto:** o vendedor vê, em ver mais, até onde pode chegar e quanto ganha.
  A comissão é calculada **sobre o valor que o cliente paga**: no preço cheio e no preço com o desconto máximo.
  O preço mínimo é arredondado para cima, para nunca passar do desconto permitido.
- **Anunciados:** o botão de megafone manda o produto para a aba Anunciados, onde o vendedor marca como está o pedido:
  Anunciado, Negociando, Reservado, Vendido, Entregue ou Cancelado (com filtro por status e histórico).
  Cada anunciado também tem o botão de **detalhes** do produto; se o produto saiu do estoque, mostra o que foi
  guardado ao anunciar (código, loja e preço da época).
- **Vários de uma vez:** o botão **Selecionar** dos Anunciados marca vários; tocando num status de um dos marcados,
  a mudança vale para todos. Marcando **Vendido**, abre um cadastro só do cliente para todos os produtos marcados
  e sai **um comprovante** com todos eles (o valor é dividido entre os produtos pelo preço de cada um).
- **Painel de vendas** no alto dos Anunciados: vendas do mês, valor total e comissão (setas para ver outros meses;
  o olhinho esconde a comissão). Conta o que foi marcado como Vendido ou Entregue.
- **Comprovante de venda:** ao marcar **Vendido**, abre o formulário com nome, CPF (conferido), telefone, endereço,
  bairro, forma de pagamento (Pix/dinheiro já com o desconto máximo, cartão com as parcelas), valor e a
  **assinatura do cliente** com o dedo. Gera um comprovante no estilo cupom de impressora térmica com os dados da
  loja do estoque vendido — **Matina (matriz)**: Av. Guanambi, 41, Centro, CEP 46480-000, CNPJ 31.598.445/0001-49;
  **Igaporã (filial)**: Rua Professor Waldir Cardoso, 19, Centro, CEP 46490-000, CNPJ 31.598.445/0002-20
  (venda com produtos das duas lojas sai pela matriz, com a loja de cada produto) —, numerado por vendedor
  (ex.: HC-000001), para **enviar ao cliente** (imagem pelo WhatsApp) ou **baixar em imagem ou PDF**.
  Traz "Não é documento fiscal". O botão de recibo no anunciado reabre o comprovante e permite editar.
- **Clientes compartilhados:** o cliente cadastrado numa venda aparece para todos os vendedores. Ao digitar o nome,
  a página mostra os clientes cujo nome começa com o que foi digitado; escolhendo um, os dados são preenchidos.
  Mudando alguma informação, vale a última atualização. Os clientes ficam só no servidor privado e só aparecem para
  quem tem o **código da equipe** (pedido uma vez no formulário da venda; o administrador não precisa):
  Bitwarden `ESTOQUE_YELLA_CHAVE_EQUIPE`. Sem internet, a venda sai normalmente e o cliente é enviado depois.
- Nome, percentuais, loja escolhida, anunciados, vendas e comprovantes ficam salvos **no próprio celular** de cada vendedor.
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
3. Escolha o relatório de cada loja (pode ser só uma) e toque em **Conferir mudanças**. Em **Matina - BA · sem
   estoque** vai o relatório dos produtos com estoque zero (com as colunas Código e Custo de Compra): ele atualiza a
   lista de encomenda (só os comprados nos últimos 48 meses aparecem) e ajuda a achar o custo de Igaporã.
   Publicando só o estoque, o produto que acabou passa sozinho para a lista "sem estoque", com o custo que tinha. Aparece a lista do que mudou:
   ▲▼ quantidade, + produto novo, − produto que saiu, R$ preço, e os **nomes automáticos** de produtos novos para conferir.
4. Toque em **Publicar**. O site atualiza para todos em cerca de 1 minuto (a própria tela avisa quando terminar).
   Quem estiver com o site aberto recebe o estoque novo ao voltar para a página.

No modo administrador, os **detalhes** de cada produto mostram também o **preço de compra** (do relatório que traz a
coluna Custo de Compra), o **imposto de saída** (percentual no campo "Imposto de saída" da gaveta, sobre o valor
de venda) e a **sobra**: valor pago − preço de compra − imposto − comissão, do preço com desconto máximo ao preço
cheio (em verde, ou vermelho quando negativa). Sem preço de compra, a linha mostra "—".

- **Matina:** o custo vem do próprio relatório — exporte o de Matina **com a coluna "Custo de Compra"**
  (hoje ele não traz essa coluna).
- **Igaporã:** tudo o que Igaporã vende sai do depósito de Matina e não existe custo de transferência: o custo
  é o de compra do **mesmo produto em Matina** (Matina é a referência). O "Custo de Compra" do relatório de
  Igaporã não vale. O mesmo produto é achado a cada publicação (`vincular_produtos` em
  `ferramentas/atualizar_estoque.py`) **sem usar o código**, que é interno de cada sistema: compara as palavras
  da descrição revisada e da do sistema, com mais peso para as raras (modelo, linha), tolerando palavra cortada
  e erro de digitação, e veta tipo, número/medida, cor ou tamanho diferente e um modelo diferente de cada lado.
  Na dúvida, não liga. Ligado, Igaporã passa a mostrar o **nome e o fornecedor de Matina**, o admin vê o custo de
  Matina ("(Matina)") e as **fotos** de um valem para o outro (`dados/vinculos.json`, público, sem custo).
- **Relatório de Matina com os produtos sem estoque:** quanto mais produtos de Matina (inclusive os que
  acabaram), mais produtos de Igaporã ganham custo. Os de estoque zero não aparecem no site: só entram no
  cruzamento (ficam no armazenamento privado, `referencia/matina.json`).

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

- Credenciais (nunca no código): Secret Manager `estoque-yella-chave-admin`, `estoque-yella-chave-equipe` e
  `estoque-yella-deploy-key`, com cópia no Bitwarden (`ESTOQUE_YELLA_CHAVE_ADMIN`, `ESTOQUE_YELLA_CHAVE_EQUIPE` e
  `ESTOQUE_YELLA_DEPLOY_KEY`). A chave de publicação aparece no GitHub em Settings → Deploy keys como
  "Atualização de estoque (Cloud Run)".
- Trocar o código da equipe (ex.: um vendedor saiu): grave o novo no Bitwarden e como nova versão de
  `estoque-yella-chave-equipe`, rode `sh servidor/implantar.sh` e passe o novo aos vendedores.
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

A coluna **Custo de Compra** não vai para os dados nem para o GitHub, porque a página é pública (apenas não aparece
em buscadores). Ao publicar pelo site, o servidor guarda os custos num armazenamento privado do Google Cloud
(`estoque-yella-privado`, sem acesso público) e só os entrega a quem tem a chave de administrador. Os **clientes**
das vendas (nome, CPF, telefone, endereço) ficam no mesmo armazenamento privado e só saem para quem tem o código da
equipe ou a chave de administrador.

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

Os relatórios brutos do CompuFour não vão para o GitHub: o `.gitignore` bloqueia qualquer `.html` da pasta, menos o
`index.html` (os relatórios têm o custo de compra). `dados/matina-sem-estoque.json` é gerado pelo servidor.
