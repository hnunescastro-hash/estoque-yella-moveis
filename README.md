# Estoque Yêlla Móveis

Página de consulta rápida do estoque para os vendedores, feita para usar no celular.

**Link:** https://hnunescastro-hash.github.io/estoque-yella-moveis/

## O que a página faz

- **Nome do vendedor:** no primeiro acesso, uma janela pede o nome. As iniciais aparecem num círculo no canto
  direito do topo; tocando nele abre uma gaveta para mudar o nome, a **comissão** e o **desconto máximo**
  (assim eles não ocupam espaço na página).
- **Lojas:** abas no topo para ver **Todas as lojas**, só **Matina - BA** ou só **Igaporã - BA**.
  Em "Todas as lojas", cada produto mostra de qual loja é. A escolha fica salva no celular.
- **Busca** pelo nome ou pelo código do produto. Não precisa acertar acento, plural nem a abreviação do sistema
  (ex.: `geladeira` acha os refrigeradores, `guarda roupa` acha também os roupeiros, `colchão casal` acha os de 138 cm).
- **Buscar por fornecedor:** quando a busca não acha produto, a página oferece os fornecedores com aquele nome
  (ou a lista de todos). Se a busca achou produtos mas também é nome de fornecedor (ex.: `gazin`), aparece um atalho
  para ver tudo daquele fornecedor. Com o filtro ligado, dá para buscar dentro dos produtos dele.
- **Classificadores** logo abaixo da busca: Relevância, **A → Z** (tocando de novo vira Z → A) e
  **Menor preço** (tocando de novo vira Maior preço). Produto com preço provisório de R$ 1,00 no sistema aparece
  como "Preço a confirmar" e vai para o fim da lista.
- **Categorias** (colchão, guarda-roupa, cozinha…) com ícone e quantidade, abaixo dos classificadores.
- Cartão compacto: **preço, quantidade em estoque, anunciar, WhatsApp, ver foto e detalhes** na mesma linha.
  Em **Detalhes**: código, fornecedor, origem (transferência entre lojas), última compra, última venda e o nome do sistema.
- **WhatsApp:** abre o WhatsApp com a mensagem pronta (nome do produto, preço, loja e o nome de quem atende);
  o vendedor escolhe o contato e ainda pode editar o texto. A foto não vai junto (o link do WhatsApp só leva texto).
- **Ver foto:** abre o Google Imagens com o nome do produto seguido do fornecedor (quando o fornecedor ajuda a achar a foto certa).
- **Comissão e desconto:** o vendedor vê em cada produto até onde pode chegar e quanto ganha.
  A comissão é calculada **sobre o valor que o cliente paga**: no preço cheio e no preço com o desconto máximo.
  O preço mínimo é arredondado para cima, para nunca passar do desconto permitido.
- **Anunciados:** o botão de megafone manda o produto para a aba Anunciados, onde o vendedor marca como está o pedido:
  Anunciado, Negociando, Reservado, Vendido, Entregue ou Cancelado (com filtro por status e histórico).
- Nome, percentuais, loja escolhida e anunciados ficam salvos **no próprio celular** de cada vendedor.
- Depois do primeiro acesso, continua funcionando com internet fraca ou sem internet (mostra o último estoque salvo),
  e pode ser adicionada à tela inicial do celular como um aplicativo.

Os nomes dos produtos foram revisados: abreviações completadas e ortografia corrigida
(ex.: `GR MAYA 3 PTS MDP CINOMO/OFF WHITE` → `Guarda-Roupa Maya 3 Portas MDP Cinamomo/Off White`).
O nome original do sistema continua visível em **Detalhes**, para conferir no CompuFour.

## Como atualizar o estoque

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

Os relatórios brutos do CompuFour não vão para o GitHub (estão no `.gitignore`).
