# Estoque Yêlla Móveis

Página de consulta rápida do estoque para os vendedores, feita para usar no celular.

**Link:** https://hnunescastro-hash.github.io/estoque-yella-moveis/

## O que a página faz

- **Busca** pelo nome ou pelo código do produto. Não precisa acertar acento, plural nem a abreviação do sistema
  (ex.: `geladeira` acha os refrigeradores, `guarda roupa` acha também os roupeiros, `colchão casal` acha os de 138 cm).
- Mostra **preço, quantidade em estoque**, fornecedor e as datas da última compra e da última venda.
- **Ver foto:** abre fotos do produto no Google Imagens.
- **Sua comissão:** o vendedor informa o percentual (ex.: 5) e vê quanto ganha em cada produto.
- **Desconto máximo:** informa o desconto permitido (ex.: 10) e vê até onde pode chegar em cada produto.
- A comissão é calculada **sobre o valor que o cliente paga**: no preço cheio e no preço com o desconto máximo.
  O preço mínimo é arredondado para cima, para nunca passar do desconto permitido.
- Os percentuais ficam salvos no próprio celular de cada vendedor.
- Depois do primeiro acesso, continua funcionando com internet fraca ou sem internet (mostra o último estoque salvo),
  e pode ser adicionada à tela inicial do celular como um aplicativo.

Os nomes dos produtos foram revisados: abreviações completadas e ortografia corrigida
(ex.: `GR MAYA 3 PTS MDP CINOMO/OFF WHITE` → `Guarda-Roupa Maya 3 Portas MDP Cinamomo/Off White`).
O nome original do sistema continua visível em **Detalhes**, para conferir no CompuFour.

## Como atualizar o estoque

1. No CompuFour, gere o relatório **Controle de estoque** e salve em HTML (mesmo formato do arquivo original).
2. Na pasta do projeto, rode:

   ```bash
   python3 ferramentas/atualizar_estoque.py matina "caminho/do/relatorio.html"
   ```

   O script confere o total de produtos e de unidades com os totais do próprio relatório.
3. Se aparecer a lista **"produtos sem nome revisado"**, são produtos novos: eles recebem uma correção automática.
   Para deixar o nome do jeito certo, acrescente a linha em `ferramentas/correcoes.json` (seção `produtos`,
   com a descrição do sistema em maiúsculas → nome corrigido) e rode o script de novo.
4. Publique:

   ```bash
   git add -A && git commit -m "Atualiza estoque de Matina" && git push
   ```

   A página atualiza sozinha em 1 a 2 minutos.

## Adicionar a loja de Igaporã

```bash
python3 ferramentas/atualizar_estoque.py igapora "relatorio-igapora.html" --nome "Igaporã"
```

A página passa a mostrar os botões **Matina / Igaporã** no topo, sem mudar mais nada.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html`, `app.css`, `app.js` | a página |
| `sw.js`, `manifest.webmanifest`, `icons/` | funcionamento sem internet e ícone na tela inicial |
| `dados/lojas.json` | lista de lojas |
| `dados/matina.json` | estoque de Matina (gerado pelo script) |
| `ferramentas/atualizar_estoque.py` | lê o relatório do CompuFour e gera os dados |
| `ferramentas/correcoes.json` | nomes revisados de produtos e fornecedores |

O relatório bruto do CompuFour não vai para o GitHub (está no `.gitignore`).
