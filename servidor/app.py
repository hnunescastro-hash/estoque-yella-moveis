"""Servidor de atualização do estoque (Google Cloud Run).

A página chama este servidor quando um administrador envia os relatórios do CompuFour:

  POST /api/entrar      chave                      -> confere a chave de administrador
  POST /api/atualizar   chave, arquivo_<loja>...   -> lê os relatórios e mostra o que mudou
                        publicar=1                 -> e publica no GitHub (o site atualiza para todos)
                        confirmar_queda=1          -> publica mesmo com muitos produtos saindo de uma vez
  POST /api/custos      chave                      -> preço de compra de cada produto (só administrador)

O preço de compra (coluna "Custo de Compra" do relatório) NUNCA vai para o GitHub nem para o site:
fica num armazenamento privado do Google Cloud Storage e só sai daqui para quem tem a chave.

Os dados são montados pelo mesmo código do comando de terminal (ferramentas/atualizar_estoque.py),
com as correções de nome e fornecedor mais recentes do repositório. O custo de compra nunca é gravado.

Variáveis de ambiente (as duas primeiras vêm do Secret Manager, nunca do código):
  CHAVE_ADMIN   chave de administrador
  DEPLOY_KEY    chave SSH que só pode escrever neste repositório
  REPO          repositório (padrão: git@github.com:hnunescastro-hash/estoque-yella-moveis.git)
  RAMO          ramo publicado (padrão: main)
  ORIGENS       endereços que podem chamar o servidor (padrão: o site no GitHub Pages)
  BALDE_PRIVADO armazenamento privado do preço de compra (Cloud Storage)
  PASTA_CUSTOS  pasta local no lugar do Cloud Storage (só para testes)
"""

import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

import atualizar_estoque as ae

CHAVE_ADMIN = os.environ.get("CHAVE_ADMIN", "")
REPO = os.environ.get("REPO", "git@github.com:hnunescastro-hash/estoque-yella-moveis.git")
RAMO = os.environ.get("RAMO", "main")
ORIGENS = {o.strip() for o in os.environ.get("ORIGENS", "https://hnunescastro-hash.github.io").split(",") if o.strip()}
BALDE_PRIVADO = os.environ.get("BALDE_PRIVADO", "")
PASTA_CUSTOS = os.environ.get("PASTA_CUSTOS", "")

TAMANHO_MAXIMO = 8 * 1024 * 1024   # por relatório (os atuais têm ~450 KB)
QUEDA_MAXIMA = 0.10                # mais que 10% dos produtos saindo de uma vez pede confirmação

# Chaves públicas do GitHub (https://api.github.com/meta): só conversa com o GitHub verdadeiro.
GITHUB_HOSTS = (
    "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n"
    "github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=\n"
)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 3 * TAMANHO_MAXIMO


class Recusado(Exception):
    """Pedido que não pode seguir; a mensagem vai para a tela do administrador."""

    def __init__(self, mensagem, status=400):
        super().__init__(mensagem)
        self.status = status


# ---------------------------------------------------------------- git

def _ambiente_git():
    ambiente = dict(os.environ, HOME=tempfile.gettempdir(), GIT_TERMINAL_PROMPT="0")
    chave = os.environ.get("DEPLOY_KEY", "").strip()
    if chave:
        pasta = Path(tempfile.gettempdir()) / "ssh-estoque"
        pasta.mkdir(mode=0o700, exist_ok=True)
        arquivo = pasta / "deploy_key"
        if not arquivo.exists():
            arquivo.write_text(chave + "\n")
            arquivo.chmod(0o600)
        hosts = pasta / "known_hosts"
        hosts.write_text(GITHUB_HOSTS)
        ambiente["GIT_SSH_COMMAND"] = (
            f"ssh -i {arquivo} -o IdentitiesOnly=yes -o UserKnownHostsFile={hosts} -o StrictHostKeyChecking=yes"
        )
    return ambiente


def git(*args, pasta=None):
    r = subprocess.run(["git", *args], cwd=pasta, env=_ambiente_git(), capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"git {args[0]}: {r.stderr.strip()[-400:]}")
    return r.stdout.strip()


def clonar():
    pasta = tempfile.mkdtemp(prefix="estoque-")
    git("clone", "--depth", "1", "--branch", RAMO, "--single-branch", REPO, pasta)
    return pasta


def publicar(arquivos, mensagem):
    """Grava {caminho: texto} no repositório e envia. Tenta de novo uma vez se alguém publicou junto."""
    for tentativa in (1, 2):
        pasta = clonar()
        try:
            for caminho, texto in arquivos.items():
                (Path(pasta) / caminho).write_text(texto, encoding="utf-8")
            git("add", *arquivos.keys(), pasta=pasta)
            if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=pasta).returncode == 0:
                return None  # nada mudou nos arquivos
            git("-c", "user.name=Atualização de estoque", "-c", "user.email=estoque-yella@users.noreply.github.com",
                "commit", "-m", mensagem, pasta=pasta)
            try:
                git("push", "origin", f"HEAD:{RAMO}", pasta=pasta)
            except RuntimeError:
                if tentativa == 2:
                    raise
                continue
            return git("rev-parse", "HEAD", pasta=pasta)
        finally:
            shutil.rmtree(pasta, ignore_errors=True)
    return None


# ---------------------------------------------------------------- preço de compra (privado)

def _balde():
    from google.cloud import storage  # só carrega quando o armazenamento privado está configurado
    return storage.Client().bucket(BALDE_PRIVADO)


def salvar_custos(loja_id, custos):
    texto = json.dumps(custos, ensure_ascii=False, separators=(",", ":"))
    if BALDE_PRIVADO:
        _balde().blob(f"custos/{loja_id}.json").upload_from_string(texto, content_type="application/json")
    elif PASTA_CUSTOS:
        Path(PASTA_CUSTOS).mkdir(parents=True, exist_ok=True)
        (Path(PASTA_CUSTOS) / f"{loja_id}.json").write_text(texto, encoding="utf-8")


def ler_todos_custos():
    resultado = {}
    if BALDE_PRIVADO:
        for blob in _balde().list_blobs(prefix="custos/"):
            if blob.name.endswith(".json"):
                resultado[blob.name[len("custos/"):-len(".json")]] = json.loads(blob.download_as_text())
    elif PASTA_CUSTOS and Path(PASTA_CUSTOS).is_dir():
        for arquivo in Path(PASTA_CUSTOS).glob("*.json"):
            resultado[arquivo.stem] = json.loads(arquivo.read_text(encoding="utf-8"))
    return resultado


# ---------------------------------------------------------------- regras

def normalizar_chave(texto):
    return re.sub(r"[^A-Z0-9]", "", (texto or "").upper())


def chave_valida(texto):
    esperada = normalizar_chave(CHAVE_ADMIN)
    return bool(esperada) and hmac.compare_digest(normalizar_chave(texto).encode(), esperada.encode())


def exigir_chave():
    if not chave_valida(request.form.get("chave") or (request.get_json(silent=True) or {}).get("chave")):
        time.sleep(1)  # atrasa tentativas de adivinhar a chave
        raise Recusado("Chave de administrador inválida.", 401)


def mesma_cidade(a, b):
    return ae.sem_acento(a or "").strip().lower() == ae.sem_acento(b or "").strip().lower()


def rotulo(loja):
    return f"{loja['nome']} - {loja['uf']}" if loja.get("uf") else loja["nome"]


def ler_json(pasta, caminho, padrao=None):
    arquivo = Path(pasta) / caminho
    return json.loads(arquivo.read_text(encoding="utf-8")) if arquivo.exists() else padrao


def processar(pasta, envios):
    """Monta os dados novos de cada loja enviada e compara com os publicados."""
    correcoes = ler_json(pasta, "ferramentas/correcoes.json")
    lojas = ler_json(pasta, "dados/lojas.json", {"lojas": []})
    por_id = {l["id"]: l for l in lojas["lojas"]}
    resultado, arquivos, custos = [], {}, {}
    for loja_id, conteudo in envios:
        loja = por_id.get(loja_id)
        if not loja:
            raise Recusado(f"Loja desconhecida: {loja_id}.")
        antes = ler_json(pasta, loja["arquivo"], {"produtos": []})
        try:
            montado = ae.montar_loja(loja_id, ae.decodificar(conteudo), correcoes, lojas, anterior=antes)
        except ae.ErroRelatorio as erro:
            raise Recusado(f"{rotulo(loja)}: {erro}") from None
        if montado["cidade"] and not mesma_cidade(montado["cidade"], loja["nome"]):
            raise Recusado(f"O arquivo enviado em {rotulo(loja)} é o relatório de {montado['cidade']}. Confira os arquivos.")
        if montado["custos"]:
            custos[loja_id] = montado["custos"]
        novo = montado["saida"]
        mudancas = ae.comparar(antes, novo)
        total_antes = len(antes.get("produtos", []))
        queda_grande = total_antes > 0 and len(mudancas["removidos"]) > QUEDA_MAXIMA * total_antes
        texto = ae.texto_json(novo)
        atual = (Path(pasta) / loja["arquivo"]).read_text(encoding="utf-8") if (Path(pasta) / loja["arquivo"]).exists() else ""
        if texto != atual:
            arquivos[loja["arquivo"]] = texto
        resultado.append({
            "id": loja_id,
            "loja": rotulo(loja),
            "gerado_em": novo["gerado_em"],
            "gerado_em_anterior": antes.get("gerado_em"),
            "produtos": [total_antes, novo["total_produtos"]],
            "unidades": [antes.get("total_unidades", 0), novo["total_unidades"]],
            **mudancas,
            "nomes_automaticos": [{"codigo": c, "sistema": s, "nome": n} for c, s, n in montado["revisar"]],
            "avisos": montado["avisos"],
            "queda_grande": queda_grande,
            "arquivo_muda": texto != atual,
            "hash": hashlib.sha256(texto.encode("utf-8")).hexdigest(),  # a página confere quando o site já mostra o novo
            "tem_custo": bool(montado["custos"]),
        })
    return resultado, arquivos, custos


# ---------------------------------------------------------------- rotas

@app.after_request
def cors(resposta):
    origem = request.headers.get("Origin")
    if origem in ORIGENS:
        resposta.headers["Access-Control-Allow-Origin"] = origem
        resposta.headers["Vary"] = "Origin"
        resposta.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        resposta.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resposta.headers["Access-Control-Max-Age"] = "3600"
    resposta.headers["Cache-Control"] = "no-store"
    return resposta


@app.errorhandler(Recusado)
def recusado(erro):
    return jsonify(ok=False, erro=str(erro)), erro.status


@app.errorhandler(413)
def grande_demais(_erro):
    return jsonify(ok=False, erro="Arquivo grande demais para um relatório de estoque."), 413


@app.errorhandler(Exception)
def inesperado(erro):
    if isinstance(erro, HTTPException):  # endereço ou método errado: responde com o próprio código
        return jsonify(ok=False, erro=erro.description), erro.code
    app.logger.exception("erro inesperado: %s", erro)  # detalhe só no log do Cloud Run
    return jsonify(ok=False, erro="Não foi possível concluir agora. Tente de novo em alguns minutos."), 500


@app.route("/", methods=["GET"])
def saude():
    return jsonify(ok=True)


@app.route("/api/entrar", methods=["POST", "OPTIONS"])
def entrar():
    if request.method == "OPTIONS":
        return "", 204
    exigir_chave()
    return jsonify(ok=True)


@app.route("/api/atualizar", methods=["POST", "OPTIONS"])
def atualizar():
    if request.method == "OPTIONS":
        return "", 204
    exigir_chave()
    envios = []
    for campo, arquivo in request.files.items():
        m = re.fullmatch(r"arquivo_([a-z0-9-]+)", campo)
        if not m or not arquivo:
            continue
        conteudo = arquivo.read(TAMANHO_MAXIMO + 1)
        if len(conteudo) > TAMANHO_MAXIMO:
            raise Recusado("Arquivo grande demais para um relatório de estoque.")
        if conteudo:
            envios.append((m.group(1), conteudo))
    if not envios:
        raise Recusado("Escolha o relatório de pelo menos uma loja.")

    pasta = clonar()
    try:
        lojas, arquivos, custos = processar(pasta, envios)
    finally:
        shutil.rmtree(pasta, ignore_errors=True)

    bloqueado = any(l["queda_grande"] for l in lojas) and request.form.get("confirmar_queda") != "1"
    resposta = {"ok": True, "lojas": lojas, "bloqueado": bloqueado, "publicado": False, "commit": None}
    if request.form.get("publicar") == "1" and not bloqueado:
        for loja_id, custos_loja in custos.items():  # preço de compra: só no armazenamento privado
            salvar_custos(loja_id, custos_loja)
        if arquivos:
            autor = " ".join((request.form.get("autor") or "").split())[:60]
            nomes = " e ".join(l["loja"] for l in lojas if l["arquivo_muda"])
            mensagem = f"Atualiza estoque: {nomes}" + (f" (enviado por {autor})" if autor else "")
            resposta["commit"] = publicar(arquivos, mensagem)
            resposta["publicado"] = resposta["commit"] is not None
    return jsonify(resposta)


@app.route("/api/custos", methods=["POST", "OPTIONS"])
def preco_de_compra():
    if request.method == "OPTIONS":
        return "", 204
    exigir_chave()
    return jsonify(ok=True, custos=ler_todos_custos())


if __name__ == "__main__":  # teste local
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
