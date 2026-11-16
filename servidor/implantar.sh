#!/bin/sh
# Publica o servidor de atualização do estoque no Google Cloud Run.
#
#   sh servidor/implantar.sh                          publica usando o ramo main
#   RAMO=teste-atualizacao sh servidor/implantar.sh   testes gravando num ramo separado
#
# Monta uma pasta só com o necessário (app.py + o mesmo código de leitura do relatório do
# comando de terminal): nenhum relatório bruto do sistema (que tem custo de compra) vai junto.
# As credenciais ficam num segredo só do Secret Manager, estoque-yella-segredos: um JSON
# {"NOME": "valor"} com CHAVE_ADMIN, CHAVE_EQUIPE (código dos vendedores), DEPLOY_KEY e
# OPENROUTER_API_KEY (juiz do cruzamento Matina x Igaporã). Desde 16/11/2026, no lugar dos
# quatro segredos avulsos: o Secret Manager cobra por versão guardada. O serviço recebe o
# pacote em PACOTE_DE_SEGREDOS, e o comando de partida (servidor/partida_cloudrun.sh)
# o abre em variáveis de ambiente antes de iniciar o gunicorn.
#
# Trocar ou acrescentar uma chave: gravar uma versão nova do pacote inteiro (ler o JSON
# da versão atual, mudar só aquela chave, gcloud secrets versions add
# estoque-yella-segredos --data-file=-), rodar este script (ou gcloud run services update)
# para a instância nova ler a versão nova, e destruir a versão velha do pacote.
set -eu

PROJETO="${PROJETO:-estoque-yella}"
REGIAO="${REGIAO:-southamerica-east1}"
SERVICO="${SERVICO:-estoque-yella-admin}"
RAMO="${RAMO:-main}"

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PASTA="$(mktemp -d)"
trap 'rm -rf "$PASTA"' EXIT
cp "$RAIZ/servidor/app.py" "$RAIZ/servidor/Dockerfile" "$RAIZ/servidor/requirements.txt" "$PASTA/"
cp "$RAIZ/ferramentas/atualizar_estoque.py" "$RAIZ/ferramentas/vendas.py" "$PASTA/"

# O comando de partida vai ao serviço a cada publicação (as linhas sem #), para nunca
# subir sem abrir o pacote. O "^@@^" troca o separador da lista do gcloud, que seria a
# vírgula: o comando tem vírgulas.
PARTIDA="$(grep -v '^#' "$RAIZ/servidor/partida_cloudrun.sh")"

gcloud run deploy "$SERVICO" --source "$PASTA" \
  --project "$PROJETO" --region "$REGIAO" \
  --memory 512Mi --cpu 1 --timeout 180 --concurrency 4 \
  --min-instances 0 --max-instances 2 \
  --set-env-vars "RAMO=$RAMO,BALDE_PRIVADO=estoque-yella-privado" \
  --set-secrets "PACOTE_DE_SEGREDOS=estoque-yella-segredos:latest" \
  --command /bin/sh --args "^@@^-c@@$PARTIDA" \
  --allow-unauthenticated --quiet
