"""Servidor de atualização do estoque (Google Cloud Run).

A página chama este servidor quando um administrador envia os relatórios do CompuFour:

  POST /api/entrar      chave                      -> confere a chave de administrador
  POST /api/atualizar   chave, arquivo_<loja>...   -> lê os relatórios e mostra o que mudou
                        semestoque_<loja>          -> relatório dos produtos sem estoque (preço para encomenda)
                        publicar=1                 -> e publica no GitHub (o site atualiza para todos)
                        confirmar_queda=1          -> publica mesmo com muitos produtos saindo de uma vez
  POST /api/custos      chave                      -> preço de compra de cada produto (só administrador)
  POST /api/vendas      chave                      -> vendas do relatório do sistema, por loja (só administrador)
  POST /api/vendas/enviar  chave, loja, arquivos   -> guarda o relatório de vendas (à vista e/ou a prazo) e
                                                      publica a ordem dos mais vendidos (dados/mais-vendidos.json)
  POST /api/vinculos/duvidas    chave              -> lista "é o mesmo produto?" (Igaporã x Matina)
  POST /api/vinculos/responder  chave, loja, codigo, codigo_para, resposta ("sim"/"nao") -> vale para sempre
  POST /api/vinculos/publicar   chave              -> refaz o cruzamento com as respostas e publica
  POST /api/equipe      codigo                     -> confere o código da equipe (vendedores)
  POST /api/clientes/buscar  codigo, termo         -> clientes cadastrados cujo nome começa com o termo
  POST /api/clientes/salvar  codigo, cliente       -> cadastra ou atualiza (vale a última atualização)

O preço de compra (coluna "Custo de Compra" do relatório) NUNCA vai para o GitHub nem para o site:
fica num armazenamento privado do Google Cloud Storage e só sai daqui para quem tem a chave.
O relatório de vendas (faturamento e custo) também: para o site vão só os produtos que mais saíram
e quantos de cada um, sem valores.

Os dados são montados pelo mesmo código do comando de terminal (ferramentas/atualizar_estoque.py),
com as correções de nome e fornecedor mais recentes do repositório. O custo de compra nunca é gravado.

Os clientes das vendas (nome, CPF, telefone, endereço) também ficam só no armazenamento privado e
só saem para quem tem o código da equipe (ou a chave de administrador).

Variáveis de ambiente (as três primeiras vêm do Secret Manager, nunca do código):
  CHAVE_ADMIN   chave de administrador
  CHAVE_EQUIPE  código da equipe (vendedores: clientes compartilhados)
  OPENROUTER_API_KEY  juiz do cruzamento Matina x Igaporã (Jev, da TypeSafe, pela OpenRouter)
  DEPLOY_KEY    chave SSH que só pode escrever neste repositório
  REPO          repositório (padrão: git@github.com:hnunescastro-hash/estoque-yella-moveis.git)
  RAMO          ramo publicado (padrão: main)
  ORIGENS       endereços que podem chamar o servidor (padrão: o site no GitHub Pages)
  BALDE_PRIVADO armazenamento privado: preço de compra e clientes (Cloud Storage)
  PASTA_PRIVADA pasta local no lugar do Cloud Storage (só para testes)
"""

import gzip
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
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

import atualizar_estoque as ae
import vendas as vd

CHAVE_ADMIN = os.environ.get("CHAVE_ADMIN", "")
CHAVE_EQUIPE = os.environ.get("CHAVE_EQUIPE", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")  # juiz do cruzamento (Jev); sem ela, só a regra
REPO = os.environ.get("REPO", "git@github.com:hnunescastro-hash/estoque-yella-moveis.git")
RAMO = os.environ.get("RAMO", "main")
ORIGENS = {o.strip() for o in os.environ.get("ORIGENS", "https://hnunescastro-hash.github.io").split(",") if o.strip()}
BALDE_PRIVADO = os.environ.get("BALDE_PRIVADO", "")
PASTA_PRIVADA = os.environ.get("PASTA_PRIVADA", "")

TAMANHO_MAXIMO = 8 * 1024 * 1024   # por relatório (os atuais têm ~450 KB)
TAMANHO_MAXIMO_VENDAS = 20 * 1024 * 1024  # relatório de vendas (o a prazo de Matina desde 2020 tem ~7 MB)
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
# referencia/<loja>.json todos os produtos do último relatório do estoque (para achar o mesmo produto)
# custos-sem-estoque/<loja>.json e referencia-sem-estoque/<loja>.json: o mesmo, dos produtos sem estoque
# clientes/clientes.json clientes das vendas, compartilhados entre os vendedores
# cruzamento/confirmados-<loja>.json respostas do administrador {código: {"sim": código, "nao": [códigos]}}
# cruzamento/duvidas-<loja>.json     lista "é o mesmo produto?" {"duvidas": [...], "respondidas": n}
# jev/cache.json         respostas do juiz do cruzamento (a mesma pergunta não é paga de novo)
# vendas/<loja>.json     relatório de vendas do sistema: linhas (faturamento e custo), nomes e envios

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


def alterar_privado(caminho, mudar):
    """Lê, muda (mudar recebe os dados ou None e devolve os novos) e grava sem apagar o que outro
    pedido gravou no meio."""
    for tentativa in range(6):
        dados, versao = ler_privado(caminho)
        novo = mudar(dados)
        try:
            gravar_privado(caminho, novo, versao)
            return novo
        except Conflito:
            time.sleep(0.2 * (tentativa + 1))
    raise Recusado("Não foi possível salvar agora. Tente de novo.", 503)


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
    # custo do relatório do estoque; o dos produtos sem estoque completa (o do estoque vale mais)
    com_estoque, sem_estoque = ler_todos("custos/"), ler_todos("custos-sem-estoque/")
    brutos = {l: {**sem_estoque.get(l, {}), **com_estoque.get(l, {})} for l in set(com_estoque) | set(sem_estoque)}
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


# ---------------------------------------------------------------- juiz do cruzamento (Jev)
# Para cada produto de Igaporã, a regra separa os produtos de Matina mais parecidos que passam nas travas e
# o Jev (modelo de decisão da TypeSafe, pela OpenRouter) escolhe qual é o mesmo, ou "nenhum", com uma
# probabilidade. Cada pergunta é guardada (jev/cache.json): a mesma pergunta não é paga de novo.

JEV_MODELO = "typesafe/jev-1.13"
JEV_URL = "https://openrouter.ai/api/alpha/decisions"
JEV_OBSERVACAO = ("Igaporã recebe tudo do depósito de Matina; as descrições foram digitadas por pessoas diferentes, "
                  "com abreviações, palavras cortadas em 45 letras e erros de digitação. O preço pode diferir um "
                  "pouco entre as lojas.")
JEV_PERGUNTA = ("Qual candidato de Matina é exatamente o mesmo produto de Igaporã (mesmo tipo, mesmo modelo/linha, "
                "mesma medida/tamanho e mesma cor quando as duas descrições informam)? Abreviação, palavra cortada, "
                "erro de digitação ou marca/linha escrita só numa delas não tornam o produto diferente.")
JEV_NENHUM = ("Nenhum dos candidatos é o mesmo produto (tipo, modelo/linha, medida ou cor diferente, ou produto "
              "genérico demais para ter certeza).")
# rodada "preco": candidatos com alguma palavra igual e preço até 5% diferente; pergunta mais branda (a resposta
# só vai para a lista do administrador, nunca liga sozinha)
JEV_OBSERVACAO_PRECO = (JEV_OBSERVACAO + " Uma das lojas costuma descrever o produto de forma mais curta ou genérica. "
                        "Todos os candidatos têm preço quase igual ao do produto de Igaporã (até 5% de diferença).")
JEV_PERGUNTA_PRECO = ("Qual candidato de Matina provavelmente é o mesmo produto de Igaporã? Precisa ser o mesmo tipo de "
                      "produto; descrição mais curta, genérica ou sem a marca/modelo numa das lojas não impede, pois o "
                      "preço quase igual ajuda a confirmar.")
JEV_NENHUM_PRECO = ("Nenhum candidato é do mesmo tipo de produto (ex.: adaptador × carregador, caixa de som × colchão, "
                    "mesa × ventilador).")
# rodada "preco15": quem continuou sem nada, com preço entre 5% e 15% diferente
JEV_OBSERVACAO_PRECO15 = (JEV_OBSERVACAO + " Uma das lojas costuma descrever o produto de forma mais curta ou genérica. "
                          "Todos os candidatos têm preço parecido com o do produto de Igaporã (entre 5% e 15% de diferença).")
JEV_PERGUNTA_PRECO15 = ("Qual candidato de Matina provavelmente é o mesmo produto de Igaporã? Precisa ser o mesmo tipo de "
                        "produto; descrição mais curta, genérica ou sem a marca/modelo numa das lojas não impede, pois o "
                        "preço parecido ajuda a confirmar.")
JEV_TEXTOS = {"": (JEV_OBSERVACAO, JEV_PERGUNTA, JEV_NENHUM),
              "preco": (JEV_OBSERVACAO_PRECO, JEV_PERGUNTA_PRECO, JEV_NENHUM_PRECO),
              "preco15": (JEV_OBSERVACAO_PRECO15, JEV_PERGUNTA_PRECO15, JEV_NENHUM_PRECO)}


JEV_PRAZO = 70   # segundos para todas as perguntas de uma publicação; o que faltar fica para a próxima
JEV_FALHAS = 12  # a OpenRouter falhou tantas vezes: para de perguntar (fica só a regra)


def _jev(pedido):
    """[índice escolhido ou -1 para "nenhum", probabilidade], custo em dólares."""
    observacao, pergunta, nenhum = JEV_TEXTOS.get(pedido.get("rodada") or "", JEV_TEXTOS[""])
    criterios = {f"c{i + 1}": texto for i, texto in enumerate(pedido["candidatos"])}
    criterios["nenhum"] = nenhum
    corpo = {"model": JEV_MODELO, "state": {"produto_igapora": pedido["produto"], "observacao": observacao},
             "questions": {"mesmo": {"type": "choice", "instructions": pergunta, "criteria": criterios}}}
    req = urllib.request.Request(JEV_URL, data=json.dumps(corpo).encode(), method="POST", headers={
        "Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=25) as r:
        resposta = json.loads(r.read())
    a = resposta["answers"]["mesmo"]
    escolha = a["choice"]
    prob = float(a["probabilities"].get(escolha, 0.0))
    custo = float((resposta.get("usage") or {}).get("cost") or 0)
    return [-1 if escolha == "nenhum" else int(escolha[1:]) - 1, round(prob, 4)], custo


def julgar_com_jev(pedidos, prazo=None, usadas=None):
    """[{"produto", "candidatos"}] -> [(índice ou None para "nenhum", probabilidade)]; (None, None) se não deu.

    Numa publicação com várias chamadas: prazo (o mesmo para todas) e usadas (junta as chaves perguntadas;
    quem chamou poda o cache no fim com podar_cache_jev). Sem usadas, o cache fica só com as desta chamada."""
    cache = ler_privado("jev/cache.json", {})[0] or {}
    chaves = [hashlib.sha256(((p["rodada"] + "\n" if p.get("rodada") else "") + p["produto"] + "\n"
                              + "\n".join(p["candidatos"])).encode()).hexdigest() for p in pedidos]
    if usadas is not None:
        usadas.update(chaves)
    faltando = [(c, p) for c, p in zip(chaves, pedidos) if c not in cache]
    prazo, falhas, custo = prazo or time.time() + JEV_PRAZO, [0], [0.0]

    def perguntar(item):
        chave, pedido = item
        if time.time() > prazo or falhas[0] >= JEV_FALHAS:
            return chave, None
        try:
            resposta, gasto = _jev(pedido)
            custo[0] += gasto
            return chave, resposta
        except Exception as erro:  # sem resposta: esse produto fica só com a regra desta vez
            falhas[0] += 1
            app.logger.warning("jev: %s", type(erro).__name__)
            return chave, None
    if faltando:
        respondidas = 0
        with ThreadPoolExecutor(max_workers=8) as grupo:
            for chave, resposta in grupo.map(perguntar, faltando):
                if resposta is not None:
                    cache[chave] = resposta
                    respondidas += 1
        app.logger.warning("jev: %d perguntas novas, %d respondidas, US$ %.4f", len(faltando), respondidas, custo[0])
    if faltando or usadas is None:
        try:  # sem usadas: guarda só as perguntas de agora (as de produtos que mudaram não voltam)
            gravar_privado("jev/cache.json", cache if usadas is not None else {c: cache[c] for c in chaves if c in cache})
        except Exception:  # cache é só economia: se não gravar, pergunta de novo na próxima
            app.logger.warning("jev: cache não gravado")
    saida = []
    for chave in chaves:
        r = cache.get(chave)
        saida.append((None if r[0] < 0 else r[0], r[1]) if r else (None, None))
    return saida


def podar_cache_jev(usadas):
    """Deixa no cache só as perguntas desta publicação (as de produtos que mudaram não voltam)."""
    try:
        cache = ler_privado("jev/cache.json", {})[0] or {}
        podado = {c: cache[c] for c in usadas if c in cache}
        if len(podado) != len(cache):
            gravar_privado("jev/cache.json", podado)
    except Exception:
        app.logger.warning("jev: cache não podado")


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

    envios: (loja, tipo, conteúdo); tipo "estoque" (relatório do estoque) ou "sem-estoque" (relatório
    dos produtos com estoque zero: preço para encomenda e ajuda a achar o mesmo produto em outra loja).
    Publicando o estoque, o que acabou passa para a lista "sem estoque" da loja (se comprado nos
    últimos ae.MESES_SEM_ESTOQUE meses), com o preço de compra que tinha.

    vincular: também acha, para a loja que tira o custo de outra (Igaporã), o mesmo produto na
    outra loja (Matina), com os produtos com e sem estoque de lá.

    Devolve: resultado (para a tela), arquivos (para o GitHub) e, para o armazenamento privado,
    custos, custos_sem_estoque, referencias, referencias_sem_estoque, vinculos e duvidas."""
    correcoes = ler_json(pasta, "ferramentas/correcoes.json")
    lojas = ler_json(pasta, "dados/lojas.json", {"lojas": []})
    por_id = {l["id"]: l for l in lojas["lojas"]}
    r = {"resultado": [], "arquivos": {}, "custos": {}, "custos_sem_estoque": {}, "referencias": {},
         "referencias_sem_estoque": {}, "vinculos": {}, "duvidas": {}}
    saidas, enviados_sem_estoque = {}, {}
    for loja_id, tipo, conteudo in envios:
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
        if tipo == "sem-estoque":
            if montado["saida"]["produtos"]:
                raise Recusado(f"{rotulo(loja)}: o relatório de sem estoque tem produtos com estoque. Confira os arquivos.")
            enviados_sem_estoque[loja_id] = montado
            r["custos_sem_estoque"][loja_id] = montado["custos"]
            r["referencias_sem_estoque"][loja_id] = montado["referencia"]
            continue
        if montado["custos"]:
            r["custos"][loja_id] = montado["custos"]
        novo = montado["saida"]
        saidas[loja_id] = novo
        r["referencias"][loja_id] = montado["referencia"]
        mudancas = ae.comparar(antes, novo)
        total_antes = len(antes.get("produtos", []))
        queda_grande = total_antes > 0 and len(mudancas["removidos"]) > QUEDA_MAXIMA * total_antes
        texto = ae.texto_json(novo)
        atual = (Path(pasta) / loja["arquivo"]).read_text(encoding="utf-8") if (Path(pasta) / loja["arquivo"]).exists() else ""
        if texto != atual:
            r["arquivos"][loja["arquivo"]] = texto
        r["resultado"].append({
            "id": loja_id,
            "loja": rotulo(loja),
            "arquivo": loja["arquivo"],
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

    # Produtos sem estoque (preço para encomenda): o relatório novo ou a lista publicada, sem quem voltou
    # ao estoque e com quem acabou agora.
    for loja_id, loja in por_id.items():
        enviado = enviados_sem_estoque.get(loja_id)
        if not enviado and not (loja_id in saidas and loja.get("sem_estoque")):
            continue
        caminho = loja.get("sem_estoque") or f"dados/{loja_id}-sem-estoque.json"
        publicado = ler_json(pasta, caminho, {"produtos": []})
        com_estoque = (saidas.get(loja_id) or ler_json(pasta, loja["arquivo"], {"produtos": []}))["produtos"]
        tem = {p["codigo"] for p in com_estoque}
        lista = {p["codigo"]: p for p in (enviado["sem_estoque"] if enviado else publicado.get("produtos", [])) if p["codigo"] not in tem}
        acabaram = []
        if loja_id in saidas and saidas[loja_id].get("gerado_em"):
            limite = ae.meses_antes(date.fromisoformat(saidas[loja_id]["gerado_em"][:10]), ae.MESES_SEM_ESTOQUE)
            for p in ler_json(pasta, loja["arquivo"], {"produtos": []})["produtos"]:
                if p["codigo"] not in tem and p["codigo"] not in lista and p.get("ultima_compra") \
                        and date.fromisoformat(p["ultima_compra"]) >= limite:
                    lista[p["codigo"]] = {**{k: v for k, v in p.items() if k != "novo_desde"}, "quantidade": 0}
                    acabaram.append(p)
        if acabaram:  # quem acabou leva o preço de compra e continua servindo para achar o mesmo produto
            custos_antigos = ler_privado(f"custos/{loja_id}.json", {})[0] or {}
            custos_sem = r["custos_sem_estoque"].get(loja_id)
            if custos_sem is None:
                custos_sem = dict(ler_privado(f"custos-sem-estoque/{loja_id}.json", {})[0] or {})
            for p in acabaram:
                if p["codigo"] in custos_antigos:
                    custos_sem.setdefault(p["codigo"], custos_antigos[p["codigo"]])
            r["custos_sem_estoque"][loja_id] = custos_sem
            refs = r["referencias_sem_estoque"].get(loja_id)
            if refs is None:
                refs = list(ler_privado(f"referencia-sem-estoque/{loja_id}.json", [])[0] or [])
            conhecidos = {x["codigo"] for x in refs}
            refs = refs + [{c: p[c] for c in ("codigo", "nome", "preco", "fornecedor")} for p in acabaram if p["codigo"] not in conhecidos]
            r["referencias_sem_estoque"][loja_id] = refs
        produtos = sorted(lista.values(), key=lambda p: (ae.sem_acento(p["nome"]).lower(), p["codigo"]))
        dados = {"loja": loja_id, "gerado_em": enviado["saida"]["gerado_em"] if enviado else publicado.get("gerado_em"),
                 "meses": ae.MESES_SEM_ESTOQUE, "total_produtos": len(produtos), "produtos": produtos}
        texto = ae.texto_json(dados)
        atual = (Path(pasta) / caminho).read_text(encoding="utf-8") if (Path(pasta) / caminho).exists() else ""
        if texto != atual:
            r["arquivos"][caminho] = texto
        if not loja.get("sem_estoque"):  # a página passa a carregar a lista desta loja
            loja["sem_estoque"] = caminho
            r["arquivos"]["dados/lojas.json"] = ae.texto_json(lojas)
        if enviado:
            r["resultado"].append({
                "id": loja_id,
                "tipo": "sem-estoque",
                "loja": f"{rotulo(loja)} · sem estoque",
                "arquivo": caminho,
                "gerado_em": dados["gerado_em"],
                "gerado_em_anterior": publicado.get("gerado_em"),
                "produtos": [len(publicado.get("produtos", [])), len(produtos)],
                "unidades": [0, 0],
                "novos": [], "removidos": [], "quantidade": [], "preco": [],
                "nomes_automaticos": [],
                "avisos": enviado["avisos"],
                "queda_grande": False,
                "arquivo_muda": texto != atual,
                "hash": hashlib.sha256(texto.encode("utf-8")).hexdigest(),
                "tem_custo": bool(enviado["custos"]),
                "meses": ae.MESES_SEM_ESTOQUE,
            })

    if vincular:
        vincular_lojas(pasta, por_id, r, saidas, enviadas=set(saidas) | set(enviados_sem_estoque))
    return r


def vincular_lojas(pasta, por_id, r, saidas=None, enviadas=None):
    """Acha, para a loja que tira o custo de outra (Igaporã), o mesmo produto na outra (Matina), com os
    produtos com e sem estoque de lá: a regra, o juiz (Jev) e as respostas do administrador.

    Preenche r["vinculos"] (privado: códigos, para o custo), r["duvidas"] (privado: a lista "é o mesmo
    produto?") e r["arquivos"]["dados/vinculos.json"] (público: nome, fornecedor e fotos de Matina valem
    para Igaporã; sem custo). enviadas: só quando uma das duas lojas mandou relatório (None: sempre)."""
    saidas = saidas or {}
    pares = []
    for loja_id, outra in ae.CUSTO_PELA_LOJA.items():
        if (enviadas is not None and not ({loja_id, outra} & enviadas)) or loja_id not in por_id or outra not in por_id:
            continue
        produtos = (saidas.get(loja_id) or ler_json(pasta, por_id[loja_id]["arquivo"], {"produtos": []}))["produtos"]
        em_estoque = {p["codigo"] for p in (saidas.get(outra) or ler_json(pasta, por_id[outra]["arquivo"], {"produtos": []}))["produtos"]}
        # a outra loja com os produtos com e sem estoque (o que acabou lá pode estar aqui); um por código
        com = (r["referencias"].get(outra) or ler_privado(f"referencia/{outra}.json")[0]
               or ler_json(pasta, por_id[outra]["arquivo"], {"produtos": []})["produtos"])
        sem = r["referencias_sem_estoque"].get(outra) or ler_privado(f"referencia-sem-estoque/{outra}.json")[0] or []
        da_outra = {**{x["codigo"]: x for x in sem}, **{x["codigo"]: x for x in com}}
        lancado = r["custos"][loja_id] if loja_id in r["custos"] else ler_privado(f"custos/{loja_id}.json", {})[0]
        confirmados = ler_privado(f"cruzamento/confirmados-{loja_id}.json", {})[0] or {}
        prazo, usadas = time.time() + JEV_PRAZO, set()  # um prazo para todas as perguntas desta loja
        julgar = (lambda pedidos: julgar_com_jev(pedidos, prazo, usadas)) if OPENROUTER_API_KEY else None
        cruzado = ae.cruzar_produtos(produtos, list(da_outra.values()), lancado, julgar=julgar, confirmados=confirmados)
        if usadas:
            podar_cache_jev(usadas)
        codigos = cruzado["codigos"]
        r["vinculos"][loja_id] = {"loja": outra, "codigos": codigos}
        deste = {p["codigo"]: p for p in produtos}
        for codigo, codigo_outra in sorted(codigos.items()):
            q = da_outra[codigo_outra]
            pares.append({"de": loja_id, "codigo": codigo, "sistema": deste[codigo].get("nome_sistema", ""),
                          "para": outra, "codigo_para": codigo_outra, "nome": q["nome"], "sistema_para": q.get("nome_sistema", ""),
                          "fornecedor": q.get("fornecedor", ""), **({"busca_foto": q["busca_foto"]} if q.get("busca_foto") else {})})
        resumo = lambda p: {"nome": p["nome"], "sistema": p.get("nome_sistema", ""), "preco": p.get("preco") or 0}
        r["duvidas"][loja_id] = sorted((
            {"codigo": d["codigo"], "codigo_para": d["codigo_para"], "prob": d["prob"], "de": resumo(deste[d["codigo"]]),
             "para": {**resumo(da_outra[d["codigo_para"]]), "sem_estoque": d["codigo_para"] not in em_estoque}}
            for d in cruzado["duvidas"]), key=lambda d: (_variacao(d), ae.sem_acento(d["de"]["nome"]).lower(), d["codigo"]))
    if r["vinculos"]:
        texto = ae.texto_json({"pares": pares})
        caminho = Path(pasta) / "dados/vinculos.json"
        if not caminho.exists() or caminho.read_text(encoding="utf-8") != texto:
            r["arquivos"]["dados/vinculos.json"] = texto
    return r


def _variacao(duvida):
    """Diferença de preço entre as duas lojas (base: a outra loja). A lista começa pela menor (pedido do Hugo)."""
    preco = duvida["para"]["preco"]
    return abs(duvida["de"]["preco"] - preco) / preco if preco else 9.0


def guardar_vinculos(r):
    """Grava no armazenamento privado o cruzamento feito por vincular_lojas (a lista "é o mesmo produto?"
    recomeça: as respostas dadas já estão nele)."""
    for loja_id, vinculo in r["vinculos"].items():
        gravar_privado(f"vinculos/{loja_id}.json", vinculo)
    for loja_id, duvidas in r["duvidas"].items():
        gravar_privado(f"cruzamento/duvidas-{loja_id}.json", {"duvidas": duvidas, "respondidas": 0})


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
    return jsonify(ok=False, erro="Arquivo grande demais para enviar."), 413


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
        m = re.fullmatch(r"(arquivo|semestoque)_([a-z0-9-]+)", campo)
        if not m or not arquivo:
            continue
        conteudo = arquivo.read(TAMANHO_MAXIMO + 1)
        if len(conteudo) > TAMANHO_MAXIMO:
            raise Recusado("Arquivo grande demais para um relatório de estoque.")
        if conteudo:
            envios.append((m.group(2), "estoque" if m.group(1) == "arquivo" else "sem-estoque", conteudo))
    if not envios:
        raise Recusado("Escolha o relatório de pelo menos uma loja.")

    vai_publicar = request.form.get("publicar") == "1"
    pasta = clonar()
    try:
        r = processar(pasta, envios, vincular=vai_publicar)
    finally:
        shutil.rmtree(pasta, ignore_errors=True)

    lojas, arquivos = r["resultado"], r["arquivos"]
    bloqueado = any(l["queda_grande"] for l in lojas) and request.form.get("confirmar_queda") != "1"
    resposta = {"ok": True, "lojas": lojas, "bloqueado": bloqueado, "publicado": False, "commit": None}
    if vai_publicar and not bloqueado:
        for loja_id, custos_loja in r["custos"].items():  # preço de compra: só no armazenamento privado
            salvar_custos(loja_id, custos_loja)
        for loja_id, custos_loja in r["custos_sem_estoque"].items():
            gravar_privado(f"custos-sem-estoque/{loja_id}.json", custos_loja)
        for loja_id, lista in r["referencias"].items():
            gravar_privado(f"referencia/{loja_id}.json", lista)
        for loja_id, lista in r["referencias_sem_estoque"].items():
            gravar_privado(f"referencia-sem-estoque/{loja_id}.json", lista)
        guardar_vinculos(r)
        if arquivos:
            autor = " ".join((request.form.get("autor") or "").split())[:60]
            nomes = " e ".join(l["loja"] for l in lojas if l["arquivo_muda"]) or (
                "produtos iguais entre as lojas" if "dados/vinculos.json" in arquivos else "produtos sem estoque")
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


# ---------------------------------------------------------------- relatório de vendas (só administrador)

LEIA_ME_MAIS_VENDIDOS = ("Produtos vendidos nos últimos 12 meses em cada loja, do que mais saiu para o que menos: "
                         "os códigos e a quantidade vendida de cada um, sem valores. Montado pelo servidor a cada "
                         "relatório de vendas enviado pelo administrador.")


def _json_comprimido(dados):
    """Resposta JSON, comprimida quando o navegador aceita (as vendas desde 2020 passam de 500 KB)."""
    corpo = json.dumps(dados, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    resposta = app.response_class(corpo, mimetype="application/json")
    if "gzip" in (request.headers.get("Accept-Encoding") or ""):
        resposta.set_data(gzip.compress(corpo, 6))
        resposta.headers["Content-Encoding"] = "gzip"
    return resposta


@app.route("/api/vendas", methods=["POST", "OPTIONS"])
def vendas_das_lojas():
    if request.method == "OPTIONS":
        return "", 204
    exigir_chave()
    lojas = {loja_id: {"linhas": dados.get("linhas", []), "nomes": dados.get("nomes", {}),
                       "envios": dados.get("envios", [])[-6:]}
             for loja_id, dados in ler_todos("vendas/").items()}
    return _json_comprimido({"ok": True, "lojas": lojas})


@app.route("/api/vendas/enviar", methods=["POST", "OPTIONS"])
def enviar_vendas():
    """Guarda o relatório de vendas de uma loja (à vista e/ou a prazo; cada um vale para o período que
    cobre) e publica a ordem dos mais vendidos."""
    if request.method == "OPTIONS":
        return "", 204
    exigir_chave()
    loja_id = request.form.get("loja") or ""
    relatorios = []
    for arquivo in request.files.getlist("arquivos"):
        conteudo = arquivo.read(TAMANHO_MAXIMO_VENDAS + 1)
        if len(conteudo) > TAMANHO_MAXIMO_VENDAS:
            raise Recusado(f"{arquivo.filename}: arquivo grande demais para um relatório de vendas.")
        if not conteudo:
            continue
        try:
            relatorios.append(vd.ler_relatorio(conteudo))
        except (ae.ErroRelatorio, ValueError) as erro:
            raise Recusado(f"{arquivo.filename}: {erro}") from None
    if not relatorios:
        raise Recusado("Escolha o relatório de vendas (à vista, a prazo ou os dois).")
    autor = " ".join((request.form.get("autor") or "").split())[:60]

    pasta = clonar()
    try:
        loja = next((l for l in ler_json(pasta, "dados/lojas.json", {"lojas": []})["lojas"] if l["id"] == loja_id), None)
        if not loja:
            raise Recusado("Loja desconhecida.")
        nomes_no_site = {}
        for campo in ("sem_estoque", "arquivo"):  # o nome do produto com estoque vale mais
            if loja.get(campo):
                for p in ler_json(pasta, loja[campo], {"produtos": []}).get("produtos", []):
                    nomes_no_site[p["codigo"]] = p["nome"]
        correcoes = ler_json(pasta, "ferramentas/correcoes.json", {})
        publicado = ler_json(pasta, "dados/mais-vendidos.json", {})
    finally:
        shutil.rmtree(pasta, ignore_errors=True)

    agora = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    def mudar(guardado):
        dados = guardado or {}
        for relatorio in relatorios:
            dados = vd.juntar(dados, relatorio)
        dados["nomes"] = vd.nomes_dos_produtos(dados["descricoes"], nomes_no_site, correcoes)
        dados["envios"] = (dados.get("envios", []) + [{**vd.resumo(r), "em": agora, "autor": autor}
                                                       for r in relatorios])[-30:]
        return dados

    dados = alterar_privado(f"vendas/{loja_id}.json", mudar)

    # Para o site, só a ordem dos mais vendidos. As vendas já estão guardadas: se a publicação falhar,
    # a ordem atualiza no próximo envio.
    outras = publicado.get("lojas") if isinstance(publicado, dict) and isinstance(publicado.get("lojas"), dict) else {}
    mais_vendidos = {"_leia-me": LEIA_ME_MAIS_VENDIDOS, "lojas": {**outras, loja_id: vd.mais_vendidos(dados["linhas"])}}
    aviso = None
    try:
        commit = publicar({"dados/mais-vendidos.json": ae.texto_json(mais_vendidos)},
                          f"Atualiza mais vendidos: {rotulo(loja)}" + (f" (enviado por {autor})" if autor else ""))
    except RuntimeError:
        app.logger.exception("mais vendidos não publicados")
        commit = None
        aviso = "As vendas foram guardadas, mas a lista de mais vendidos do site não atualizou agora."
    return jsonify(ok=True, relatorios=[vd.resumo(r) for r in relatorios], publicado=commit is not None, aviso=aviso)


# ---------------------------------------------------------------- mesmo produto nas duas lojas: respostas do administrador

@app.route("/api/vinculos/duvidas", methods=["POST", "OPTIONS"])
def duvidas_dos_vinculos():
    """A lista "é o mesmo produto?": o juiz achou provável, mas não certo (ou discordou da regra)."""
    if request.method == "OPTIONS":
        return "", 204
    exigir_chave()
    duvidas, respondidas = [], 0
    for loja_id, outra in ae.CUSTO_PELA_LOJA.items():
        registro = ler_privado(f"cruzamento/duvidas-{loja_id}.json")[0] or {}
        duvidas += [{**d, "loja": loja_id, "outra": outra} for d in registro.get("duvidas", [])]
        respondidas += registro.get("respondidas", 0)
    return jsonify(ok=True, duvidas=duvidas, respondidas=respondidas)


@app.route("/api/vinculos/responder", methods=["POST", "OPTIONS"])
def responder_vinculo():
    """Sim ou não do administrador: vale para sempre, acima da regra e do juiz. Entra no site ao
    publicar as respostas (ou com o próximo relatório)."""
    if request.method == "OPTIONS":
        return "", 204
    exigir_chave()
    dados = request.get_json(silent=True) or {}
    loja_id, codigo, para, resposta = (_texto(dados.get(k), 40) for k in ("loja", "codigo", "codigo_para", "resposta"))
    if loja_id not in ae.CUSTO_PELA_LOJA or not codigo or not para or resposta not in ("sim", "nao"):
        raise Recusado("Resposta inválida.")

    def confirmar(confirmados):
        confirmados = confirmados or {}
        item = confirmados.get(codigo) or {}
        nao = [c for c in item.get("nao", []) if c != para]
        if resposta == "sim":
            item["sim"] = para
        else:
            nao.append(para)
            if item.get("sim") == para:
                del item["sim"]
        if nao:
            item["nao"] = nao
        else:
            item.pop("nao", None)
        confirmados[codigo] = item
        return confirmados

    def tirar_da_lista(registro):
        registro = registro or {"duvidas": [], "respondidas": 0}
        registro["duvidas"] = [d for d in registro.get("duvidas", []) if d["codigo"] != codigo]
        registro["respondidas"] = registro.get("respondidas", 0) + 1
        return registro
    alterar_privado(f"cruzamento/confirmados-{loja_id}.json", confirmar)
    registro = alterar_privado(f"cruzamento/duvidas-{loja_id}.json", tirar_da_lista)
    return jsonify(ok=True, respondidas=registro["respondidas"])


@app.route("/api/vinculos/publicar", methods=["POST", "OPTIONS"])
def publicar_vinculos():
    """Refaz o cruzamento com as respostas do administrador e publica, sem precisar de relatório novo."""
    if request.method == "OPTIONS":
        return "", 204
    exigir_chave()
    r = {"arquivos": {}, "custos": {}, "referencias": {}, "referencias_sem_estoque": {}, "vinculos": {}, "duvidas": {}}
    pasta = clonar()
    try:
        por_id = {l["id"]: l for l in ler_json(pasta, "dados/lojas.json", {"lojas": []})["lojas"]}
        vincular_lojas(pasta, por_id, r)
    finally:
        shutil.rmtree(pasta, ignore_errors=True)
    guardar_vinculos(r)
    commit = None
    texto = r["arquivos"].get("dados/vinculos.json")
    if texto:
        autor = " ".join(str((request.get_json(silent=True) or {}).get("autor") or "").split())[:60]
        commit = publicar(r["arquivos"], "Atualiza produtos iguais entre as lojas" + (f" (enviado por {autor})" if autor else ""))
    return jsonify(ok=True, publicado=commit is not None, commit=commit,
                   ligados=sum(len(v["codigos"]) for v in r["vinculos"].values()),
                   arquivo="dados/vinculos.json", hash=hashlib.sha256(texto.encode("utf-8")).hexdigest() if texto else None)


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
