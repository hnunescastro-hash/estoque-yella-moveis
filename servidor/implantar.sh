#!/bin/sh
# Publica o servidor de atualização do estoque no Google Cloud Run.
#
#   sh servidor/implantar.sh                          publica usando o ramo main
#   RAMO=teste-atualizacao sh servidor/implantar.sh   testes gravando num ramo separado
#
# Monta uma pasta só com o necessário (app.py + o mesmo código de leitura do relatório do
# comando de terminal): nenhum relatório bruto do sistema (que tem custo de compra) vai junto.
# As duas credenciais vêm do Secret Manager (cópia do Bitwarden): estoque-yella-chave-admin e
# estoque-yella-deploy-key.
set -eu

PROJETO="${PROJETO:-estoque-yella}"
REGIAO="${REGIAO:-southamerica-east1}"
SERVICO="${SERVICO:-estoque-yella-admin}"
RAMO="${RAMO:-main}"

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PASTA="$(mktemp -d)"
trap 'rm -rf "$PASTA"' EXIT
cp "$RAIZ/servidor/app.py" "$RAIZ/servidor/Dockerfile" "$RAIZ/servidor/requirements.txt" "$PASTA/"
cp "$RAIZ/ferramentas/atualizar_estoque.py" "$PASTA/"

gcloud run deploy "$SERVICO" --source "$PASTA" \
  --project "$PROJETO" --region "$REGIAO" \
  --memory 512Mi --cpu 1 --timeout 180 --concurrency 4 \
  --min-instances 0 --max-instances 2 \
  --set-env-vars "RAMO=$RAMO,BALDE_PRIVADO=estoque-yella-privado" \
  --set-secrets "CHAVE_ADMIN=estoque-yella-chave-admin:latest,DEPLOY_KEY=estoque-yella-deploy-key:latest" \
  --allow-unauthenticated --quiet
