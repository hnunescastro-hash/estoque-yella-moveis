"""Servidor de atualização do estoque (Google Cloud Run).

A página chama este servidor quando um administrador envia os relatórios do CompuFour:

  POST /api/entrar      chave                      -> confere a chave de administrador
  POST /api/atualizar   chave, arquivo_<loja>...   -> lê os relatórios e mostra o que mudou
                        publicar=1                 -> e publica no GitHub (o site atualiza para todos)
                        confirmar_queda=1          -> publica mesmo com muitos produtos saindo de uma vez
  POST /api/custos      chave                      -> preço de compra de cada produto (só administrador)
  POST /api/equipe      codigo                     -> confere o código da equipe (vendedores)
  POST /api/clientes/buscar  codigo, termo         -> clientes cadastrados cujo nome começa com o termo
  POST /api/clientes/salvar  codigo, cliente       -> cadastra ou atualiza (vale a última atualização)

O preço de compra (coluna "Custo de Compra" do relatório) NUNCA vai para o GitHub nem para o site:
fica num armazenamento privado do Google Cloud Storage e só sai daqui para quem tem a chave.

Os dados são montados pelo mesmo código do comando de terminal (ferramentas/atualizar_estoque.py),
com as correções de nome e fornecedor mais recentes do repositório. O custo de compra nunca é gravado.

Os clientes das vendas (nome, CPF, telefone, endereço) também ficam só no armazenamento privado e
só saem para quem tem o código da equipe (ou a chave de administrador).

Variáveis de ambiente (as três primeiras vêm do Secret Manager, nunca do código):
  CHAVE_ADMIN   chave de administrador
  CHAVE_EQUIPE  código da equipe (vendedores: clientes compartilhados)
  DEPLOY_KEY    chave SSH que só pode escrever neste repositório
  REPO          repositório (padrão: git@github.com:hnunescastro-hash/estoque-yella-moveis.git)
  RAMO          ramo publicado (padrão: main)
  ORIGENS       endereços que podem chamar o servidor (padrão: o site no GitHub Pages)
  BALDE_PRIVADO armazenamento privado: preço de compra e clientes (Cloud Storage)
  PASTA_PRIVADA pasta local no lugar do Cloud Storage (só para testes)
"""

import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

import atualizar_estoque as ae

CHAVE_ADMIN = os.environ.get("CHAVE_ADMIN", "")
CHAVE_EQUIPE = os.environ.get("CHAVE_EQUIPE", "")
REPO = os.environ.get("REPO", "git@github.com:hnunescastro-hash/estoque-yella-moveis.git")
RAMO = os.environ.get("RAMO", "main")
ORIGENS = {o.strip() for o in os.environ.get("ORIGENS", "https://hnunescastro-hash.github.io").split(",") if o.strip()}
BALDE_PRIVADO = os.environ.get("BALDE_PRIVADO", "")
PASTA_PRIVADA = os.environ.get("PASTA_PRIVADA", "")

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


# ---------------------------------------------------------------- armazenamento privado
# custos/<loja>.json     preço de compra como veio no relatório {código: custo}
# vinculos/<loja>.json   mesmo produto em outra loja, para o custo de uma filial {"loja", "codigos"}
# referencia/<loja>.json todos os produtos do último relatório, com e sem estoque (para achar o mesmo produto)
# clientes/clientes.json clientes das vendas, compartilhados entre os vendedores

_trava_local = threading.Lock()


def _balde():
    from google.cloud import storage  # só carrega quando o armazenamento privado está configurado
    return storage.Client().bucket(BALDE_PRIVADO)


def ler_privado(caminho, padrao=None):
    """Devolve (dados, versão). A versão serve para gravar sem apagar o que outro gravou no meio."""
    if BALDE_PRIVADO:
        blob = _balde().get_blob(caminho)
        if blob is None:
            return padrao, 0
        return json.loads(blob.download_as_text()), blob.generation
    if PASTA_PRIVADA:
        arquivo = Path(PASTA_PRIVADA) / caminho
        if arquivo.exists():
            return json.loads(arquivo.read_text(encoding="utf-8")), arquivo.stat().st_mtime_ns
    return padrao, 0


class Conflito(Exception):
    """Outro pedido gravou o mesmo arquivo entre a leitura e a gravação."""


def gravar_privado(caminho, dados, versao=None):
    """Grava; com versao (a da leitura), recusa se o arquivo mudou desde então (Conflito)."""
    texto = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
    if BALDE_PRIVADO:
        from google.api_core.exceptions import PreconditionFailed
        try:
            _balde().blob(caminho).upload_from_string(
                texto, content_type="application/json", if_generation_match=versao)
        except PreconditionFailed:
            raise Conflito() from None
    elif PASTA_PRIVADA:
        arquivo = Path(PASTA_PRIVADA) / caminho
        arquivo.parent.mkdir(parents=True, exist_ok=True)
        with _trava_local:
            atual = arquivo.stat().st_mtime_ns if arquivo.exists() else 0
            if versao is not None and versao != atual:
                raise Conflito()
            arquivo.write_text(texto, encoding="utf-8")
    else:
        raise RuntimeError("armazenamento privado não configurado (BALDE_PRIVADO ou PASTA_PRIVADA)")


def salvar_custos(loja_id, custos):
    gravar_privado(f"custos/{loja_id}.json", custos)


def ler_todos(prefixo):
    resultado = {}
    if BALDE_PRIVADO:
        for blob in _balde().list_blobs(prefix=prefixo):
            if blob.name.endswith(".json"):
                resultado[blob.name[len(prefixo):-len(".json")]] = json.loads(blob.download_as_text())
    elif PASTA_PRIVADA and (Path(PASTA_PRIVADA) / prefixo).is_dir():
        for arquivo in (Path(PASTA_PRIVADA) / prefixo).glob("*.json"):
            resultado[arquivo.stem] = json.loads(arquivo.read_text(encoding="utf-8"))
    return resultado


def custos_para_a_pagina():
    """Preço de compra por loja. A loja que tira o custo de outra (Igaporã, de Matina) usa o do mesmo
    produto lá; o do próprio relatório não vale. Também diz de onde veio cada um."""
    brutos = ler_todos("custos/")
    vinculos = ler_todos("vinculos/")
    custos, origem = {}, {}
    for loja_id, valores in brutos.items():
        if loja_id not in ae.CUSTO_PELA_LOJA:
            custos[loja_id] = valores
    for loja_id, outra in ae.CUSTO_PELA_LOJA.items():
        codigos = (vinculos.get(loja_id) or {}).get("codigos", {})
        da_outra = brutos.get(outra, {})
        custos[loja_id] = {c: da_outra[o] for c, o in codigos.items() if o in da_outra}
        origem[loja_id] = {"loja": outra, "codigos": {c: o for c, o in codigos.items() if o in da_outra}}
    return custos, origem


# ---------------------------------------------------------------- regras

def normalizar_chave(texto):
    return re.sub(r"[^A-Z0-9]", "", (texto or "").upper())


def chave_valida(texto, chave=None):
    esperada = normalizar_chave(CHAVE_ADMIN if chave is None else chave)
    return bool(esperada) and hmac.compare_digest(normalizar_chave(texto).encode(), esperada.encode())


def exigir_equipe():
    """Código da equipe (vendedores) ou chave de administrador."""
    dados = request.get_json(silent=True) or {}
    codigo = request.form.get("codigo") or dados.get("codigo") or ""
    if not (chave_valida(codigo, CHAVE_EQUIPE) or chave_valida(codigo)):
        time.sleep(1)  # atrasa tentativas de adivinhar o código
        raise Recusado("Código da equipe inválido.", 401)
    return dados


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


def processar(pasta, envios, vincular=False):
    """Monta os dados novos de cada loja enviada e compara com os publicados.

    vincular: também acha, para a loja que tira o custo de outra (Igaporã), o mesmo produto na
    outra loja (Matina) — com os dados novos de quem foi enviado e os publicados das demais."""
    correcoes = ler_json(pasta, "ferramentas/correcoes.json")
    lojas = ler_json(pasta, "dados/lojas.json", {"lojas": []})
    por_id = {l["id"]: l for l in lojas["lojas"]}
    resultado, arquivos, custos, saidas, referencias = [], {}, {}, {}, {}
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
        saidas[loja_id] = novo
        referencias[loja_id] = montado["referencia"]
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

    vinculos = {}
    for loja_id, outra in ae.CUSTO_PELA_LOJA.items() if vincular else ():
        if (loja_id not in saidas and outra not in saidas) or loja_id not in por_id or outra not in por_id:
            continue
        produtos = (saidas.get(loja_id) or ler_json(pasta, por_id[loja_id]["arquivo"], {"produtos": []}))["produtos"]
        # a outra loja com os produtos sem estoque também (o que acabou lá pode estar aqui)
        da_outra = (referencias.get(outra) or ler_privado(f"referencia/{outra}.json")[0]
                    or ler_json(pasta, por_id[outra]["arquivo"], {"produtos": []})["produtos"])
        lancado = custos[loja_id] if loja_id in custos else ler_privado(f"custos/{loja_id}.json", {})[0]
        vinculos[loja_id] = {"loja": outra, "codigos": ae.vincular_produtos(produtos, da_outra, lancado)}
    return resultado, arquivos, custos, vinculos, referencias


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

    vai_publicar = request.form.get("publicar") == "1"
    pasta = clonar()
    try:
        lojas, arquivos, custos, vinculos, referencias = processar(pasta, envios, vincular=vai_publicar)
    finally:
        shutil.rmtree(pasta, ignore_errors=True)

    bloqueado = any(l["queda_grande"] for l in lojas) and request.form.get("confirmar_queda") != "1"
    resposta = {"ok": True, "lojas": lojas, "bloqueado": bloqueado, "publicado": False, "commit": None}
    if vai_publicar and not bloqueado:
        for loja_id, custos_loja in custos.items():  # preço de compra: só no armazenamento privado
            salvar_custos(loja_id, custos_loja)
        for loja_id, lista in referencias.items():
            gravar_privado(f"referencia/{loja_id}.json", lista)
        for loja_id, vinculo in vinculos.items():
            gravar_privado(f"vinculos/{loja_id}.json", vinculo)
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
    custos, origem = custos_para_a_pagina()
    return jsonify(ok=True, custos=custos, origem=origem)


# ---------------------------------------------------------------- clientes das vendas (compartilhados)

ARQ_CLIENTES = "clientes/clientes.json"
MAX_CLIENTES = 20000
CAMPOS_CLIENTE = {"nome": 60, "cpf": 14, "telefone": 20, "endereco": 80, "bairro": 40}


def _texto(valor, limite):
    return " ".join(str(valor or "").split())[:limite]


def _normal(texto):
    return ae.sem_acento(texto or "").lower()


def _digitos(texto):
    return re.sub(r"\D", "", texto or "")


@app.route("/api/equipe", methods=["POST", "OPTIONS"])
def equipe():
    if request.method == "OPTIONS":
        return "", 204
    exigir_equipe()
    return jsonify(ok=True)


@app.route("/api/clientes/buscar", methods=["POST", "OPTIONS"])
def buscar_clientes():
    """Até 6 clientes com palavras do nome começando pelo que foi digitado (quem começa igual vem primeiro)."""
    if request.method == "OPTIONS":
        return "", 204
    dados = exigir_equipe()
    termos = _normal(_texto(dados.get("termo"), 60)).split()
    if len("".join(termos)) < 2:
        return jsonify(ok=True, clientes=[])
    clientes = (ler_privado(ARQ_CLIENTES, {})[0] or {}).get("clientes", {})
    achados = []
    for id_cliente, c in clientes.items():
        palavras = _normal(c.get("nome")).split()
        if all(any(p.startswith(t) for p in palavras) for t in termos):
            comeca = " ".join(palavras).startswith(" ".join(termos))
            achados.append((not comeca, -(c.get("_em") or 0), id_cliente, c))
    achados.sort(key=lambda a: a[:2])
    return jsonify(ok=True, clientes=[{"id": i, **{k: c.get(k, "") for k in CAMPOS_CLIENTE}} for _, _, i, c in achados[:6]])


@app.route("/api/clientes/salvar", methods=["POST", "OPTIONS"])
def salvar_cliente():
    """Cadastra ou atualiza: o mesmo cliente (escolhido na lista, mesmo CPF, ou mesmo nome e telefone)
    é atualizado — vale a última atualização. Escolhido na lista, fica exatamente o que veio do
    formulário; reconhecido pelo CPF (ou nome e telefone), campo vazio não apaga o que já havia."""
    if request.method == "OPTIONS":
        return "", 204
    dados = exigir_equipe()
    bruto = dados.get("cliente") if isinstance(dados.get("cliente"), dict) else {}
    cliente = {campo: _texto(bruto.get(campo), limite) for campo, limite in CAMPOS_CLIENTE.items()}
    if not re.search(r"[^\W\d_]", cliente["nome"]):
        raise Recusado("Nome do cliente inválido.")
    cpf, telefone = _digitos(cliente["cpf"]), _digitos(cliente["telefone"])
    if cliente["cpf"] and len(cpf) != 11:
        raise Recusado("CPF inválido.")
    if cpf:
        cliente["cpf"] = f"{cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:]}"
    for tentativa in range(6):
        registro, versao = ler_privado(ARQ_CLIENTES, {})
        clientes = (registro or {}).get("clientes", {})
        id_cliente = str(bruto.get("id") or "")
        if id_cliente not in clientes:
            id_cliente = ""
        escolhido = bool(id_cliente)
        if not id_cliente and cpf:
            id_cliente = next((i for i, c in clientes.items() if _digitos(c.get("cpf")) == cpf), "")
        if not id_cliente and not cpf and telefone:
            nome = _normal(cliente["nome"])
            id_cliente = next((i for i, c in clientes.items()
                               if _normal(c.get("nome")) == nome and _digitos(c.get("telefone")) == telefone), "")
        if not id_cliente:
            if len(clientes) >= MAX_CLIENTES:
                raise Recusado("Limite de clientes cadastrados atingido.")
            id_cliente = uuid.uuid4().hex[:12]
        novo = dict(cliente)
        if not escolhido and id_cliente in clientes:
            novo = {campo: cliente[campo] or clientes[id_cliente].get(campo, "") for campo in CAMPOS_CLIENTE}
        clientes[id_cliente] = {**novo, "_em": time.time(), "_por": _texto(dados.get("autor"), 40)}
        try:
            gravar_privado(ARQ_CLIENTES, {"clientes": clientes}, versao)
            return jsonify(ok=True, id=id_cliente)
        except Conflito:  # outro vendedor salvou ao mesmo tempo: lê de novo e refaz
            time.sleep(0.2 * (tentativa + 1))
    raise Recusado("Não foi possível salvar o cliente agora. Tente de novo.", 503)


if __name__ == "__main__":  # teste local
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
