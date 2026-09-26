#!/usr/bin/env python3
"""Procura fotos dos produtos na internet e monta a mini galeria do "ver mais".

Dois caminhos, do mais leve para o mais pesado:

  vtex    Lojas que usam a plataforma VTEX (Americanas, Zenir, Quero-Quero, Casa & Vídeo...)
          têm uma busca pública que devolve nome, marca, preço e todas as fotos do produto
          em JSON. Sem chave paga, sem abrir página, e a foto já vem redimensionada pela loja.
  google  Para o que sobrar: busca no Google (Serper, chave no Bitwarden, créditos contados),
          abre as páginas encontradas e lê o que a loja declara do produto (JSON-LD/og:image).

Nos dois, cada candidato recebe uma nota: nome batendo (cor e medida precisam bater),
fornecedor/marca batendo e preço próximo do nosso. Só com confiança média-alta baixa
até 6 fotos diferentes, em JPEG leve (800 px, qualidade 72) -- formato que o WhatsApp
aceita ao compartilhar.

Saída: fotos/<id>/N.jpg, dados/fotos.json (nome do sistema -> caminhos) e
ferramentas/fotos_relatorio.json (nota e origem de cada produto, para conferência).

Uso (Pillow e requests):
  python buscar_fotos.py vtex      [--trabalhadores 6] [--limite N]
  python buscar_fotos.py google    [--trabalhadores 4] [--limite N]
  python buscar_fotos.py revalidar   # reaplica a regra de cor nos já aceitos

Cuidado com a máquina: poucos trabalhadores, download com teto de tamanho e imagem
grande decodificada já reduzida. Rodar com `nice -n 10`.
"""
import argparse
import hashlib
import html as htmllib
import io
import json
import random
import re
import sys
import threading
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ARQ_FOTOS = RAIZ / "dados" / "fotos.json"
ARQ_RELATORIO = RAIZ / "ferramentas" / "fotos_relatorio.json"
PASTA_FOTOS = RAIZ / "fotos"
LOJAS = ["matina", "igapora"]
MAX_FOTOS = 6
LADO = 800
QUALIDADE = 72
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# Sites que não trazem a página do produto (ou bloqueiam robô).
IGNORAR = ("youtube.", "facebook.", "instagram.", "pinterest.", "tiktok.", "reclameaqui.",
           "google.", "twitter.", "x.com", "wa.me", "zoom.com.br", "buscape.", "jacotei.")

CORES = {"branco", "preto", "cinza", "grafite", "off", "white", "cinamomo", "freijo", "nature",
         "carvalho", "rustico", "amendoa", "canela", "nogueira", "cedro", "imbuia", "mel", "azul",
         "verde", "vermelho", "rosa", "amarelo", "marrom", "bege", "chocolate", "caramelo", "savana",
         "jequitiba", "castanho", "tabaco", "fendi", "areia", "naturale", "ype", "noce", "bronze",
         "prata", "dourado", "cobre", "marmore", "cumaru", "demolicao", "teka", "gianduia", "avela",
         "capuccino", "cappuccino", "ameixa", "mogno", "wood", "black", "pinho", "legno", "damasco",
         "ipe", "malbec", "montana", "nogal", "gris", "rovere", "cacau", "titanium", "inox", "marfim",
         "grafito", "cumaru", "mescla", "linho", "petroleo", "terracota", "vinho", "lilas", "roxo", "laranja"}
VAZIAS = {"de", "da", "do", "das", "dos", "com", "e", "c", "p", "para", "em", "a", "o", "x", "the",
          "cm", "m", "un", "und", "kit", "novo", "nova"}

sessao_local = threading.local()


def sessao():
    if not hasattr(sessao_local, "s"):
        s = requests.Session()
        s.headers.update({"User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9"})
        sessao_local.s = s
    return sessao_local.s


ABREVIACOES = {"md": "madeira", "vd": "vidro", "br": "branco", "pts": "portas", "pt": "porta",
               "gvt": "gavetas", "gvts": "gavetas", "gav": "gavetas", "cin": "cinamomo", "naturalle": "naturale",
               "offwhite": "off white", "c": "com"}
# Palavras do nosso nome que só descrevem estado/detalhe e costumam faltar na loja.
DETALHES = {"fechada", "fechado", "uv", "cristal", "plus", "ii", "iii", "unidade"}


def normal(texto):
    t = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"(\d),(\d)", r"\1.\2", t)
    t = re.sub(r"(\d)\s*x\s*(?=\d)", r"\1 ", t)  # 30x198x158 -> 30 198 158
    t = re.sub(r"[^a-z0-9.]+", " ", t)
    # medidas: 1.60m -> 160 ; 134cm -> 134
    t = re.sub(r"\b(\d+(?:\.\d+)?)\s*(mts?|m|metros?)\b", lambda m: str(round(float(m.group(1)) * 100)) if float(m.group(1)) < 10 else m.group(1), t)
    t = re.sub(r"\b(\d+(?:\.\d+)?)\s*cm\b", lambda m: str(round(float(m.group(1)))), t)
    return " ".join(ABREVIACOES.get(w, w) for w in t.split()).strip()


def palavras(texto):
    return [w.strip(".") for w in normal(texto).split() if w.strip(".") and w.strip(".") not in VAZIAS]


# Quando a loja vende uma peça ou acessório do produto (bateria da caixa de som, capa, refil...).
ACESSORIOS = {"bateria", "capa", "pelicula", "refil", "reposicao", "peca", "suporte", "cabo", "carregador",
              "adesivo", "tampa", "puxador", "rodizio", "dobradica", "parafuso", "manual", "acessorio",
              "acessorios", "compativel", "controle", "fonte", "placa", "motor", "correia", "borracha",
              "vedacao", "resistencia", "filtro", "botao", "trava", "chave", "mangueira", "lampada"}


def parecida(a, b):
    if a == b:
        return True
    if re.search(r"\d", a + b) and a.replace("o", "0") == b.replace("o", "0"):
        return True  # código de modelo digitado com O no lugar de zero (SM-SPO2 x SM-SP02)
    if len(a) >= 5 and len(b) >= 5 and (a.startswith(b[:5]) and abs(len(a) - len(b)) <= 2):
        return True
    return False


def palavras_de_modelo(nome, marcas=()):
    """Palavras que identificam o modelo: nem categoria, nem genérica, nem cor, nem medida, nem marca."""
    marcas = {w for m in marcas if m for w in normal(m).split()}
    ws = [w for w in palavras(nome) if w not in DETALHES]
    return [w for w in ws[1:] if w not in GENERICAS and w not in CORES and w not in marcas
            and not re.fullmatch(r"[\d.]+", w) and len(w) >= 3]


def pontuar_nome(nosso, deles, exigir_cor=True, marcas=()):
    """Fração das nossas palavras presentes no nome da loja. Cor faltando, "com"/"sem" trocado ou
    acessório zera; medida diferente ou modelo diferente limita a 0,5 (reprova)."""
    n = [w for w in palavras(nosso) if w not in DETALHES and not re.fullmatch(r"\d{5,}", w)]
    d = set(palavras(deles))
    if not n or not d:
        return 0.0
    tem = lambda w: any(parecida(w, x) for x in d)
    tipo_deles = palavras(deles)[:3]  # o tipo do produto vem no começo do nome
    if any(a in tipo_deles and a not in n for a in ACESSORIOS):
        return 0.0
    achou = sum(1 for w in n if tem(w))
    if exigir_cor and any(w in CORES and not tem(w) for w in n):
        return 0.0
    # "Mesa Luna com Espelho" não é "Mesa Luna sem Espelho" (e vice-versa)
    texto_n, texto_d = f" {normal(nosso)} ", f" {normal(deles)} "
    for de, para in (("sem", "com"), ("com", "sem")):
        for x in re.findall(rf" {de} (\w+)", texto_d):
            if f" {para} {x} " in texto_n:
                return 0.0
    def medidas(ws):
        # 15 = 15,0 ; 1.8 (metro sem unidade) = 180
        out = set()
        for w in ws:
            if re.fullmatch(r"\d+(\.\d+)?", w):
                v = float(w)
                out.add(round(v, 2))
                if "." in w and v < 10:
                    out.add(round(v * 100))
        return out
    num_n, num_d = medidas(n), medidas(d)
    if num_n and num_d and not (num_n & num_d):
        return min(achou / len(n), 0.5)
    # o modelo tem que bater: código (B24, SM-SP02) sempre; nome do modelo, pelo menos metade
    modelo = palavras_de_modelo(nosso, marcas)
    if modelo:
        colado = texto_d.replace(" ", "")  # L-99 FB = L99FB ; 425 Litros = 425L
        tem_modelo = lambda w: tem(w) or (len(w) >= 3 and w in colado)
        codigos = [w for w in modelo if re.search(r"\d", w)]
        if any(not tem_modelo(c) for c in codigos) or sum(1 for w in modelo if tem_modelo(w)) * 2 < len(modelo):
            return min(achou / len(n), 0.5)
    return achou / len(n)


# ------------------------------------------------------------------ leitura da página

def jsonld(html):
    for bloco in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html, re.S | re.I):
        try:
            dado = json.loads(bloco.strip())
        except Exception:
            continue
        pilha = [dado]
        while pilha:
            x = pilha.pop()
            if isinstance(x, list):
                pilha.extend(x)
            elif isinstance(x, dict):
                if "@graph" in x:
                    pilha.append(x["@graph"])
                tipo = x.get("@type")
                tipos = tipo if isinstance(tipo, list) else [tipo]
                if "Product" in tipos:
                    yield x


def meta(html, prop):
    m = re.search(r'<meta[^>]+(?:property|name)=["\']%s["\'][^>]+content=["\']([^"\']+)' % re.escape(prop), html, re.I) \
        or re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']%s["\']' % re.escape(prop), html, re.I)
    return htmllib.unescape(m.group(1)) if m else ""


def preco_de(prod):
    ofertas = prod.get("offers")
    ofertas = ofertas if isinstance(ofertas, list) else [ofertas]
    for o in ofertas:
        if not isinstance(o, dict):
            continue
        for k in ("price", "lowPrice"):
            try:
                v = float(str(o.get(k)).replace(",", "."))
                if v > 0:
                    return v
            except (TypeError, ValueError):
                pass
    return None


def lista_imagens(v):
    out = []
    for x in (v if isinstance(v, list) else [v]):
        if isinstance(x, str):
            out.append(x)
        elif isinstance(x, dict):
            u = x.get("url") or x.get("contentUrl")
            if u:
                out.append(u)
    return out


def baixar(url, limite, **kw):
    """GET com teto de tamanho: nunca segura mais que `limite` bytes na memória."""
    with sessao().get(url, timeout=12, stream=True, **kw) as r:
        if r.status_code not in (200, 206):
            return None, r.headers
        tamanho = int(r.headers.get("content-length") or 0)
        if tamanho > limite:
            return None, r.headers
        partes, total = [], 0
        for bloco in r.iter_content(65536):
            partes.append(bloco)
            total += len(bloco)
            if total > limite:
                return None, r.headers
        return b"".join(partes), r.headers


def ler_pagina(url):
    try:
        corpo, cab = baixar(url, 3_000_000)
        if corpo is None or "html" not in cab.get("content-type", ""):
            return None
        html = corpo.decode("utf-8", "replace")
    except Exception:
        return None
    info = {"url": url, "nome": "", "marca": "", "preco": None, "imagens": []}
    for prod in jsonld(html):
        info["nome"] = info["nome"] or str(prod.get("name") or "")
        marca = prod.get("brand")
        if isinstance(marca, dict):
            marca = marca.get("name")
        info["marca"] = info["marca"] or str(marca or "")
        info["preco"] = info["preco"] or preco_de(prod)
        info["imagens"] += lista_imagens(prod.get("image"))
    if not info["nome"]:
        titulo = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
        info["nome"] = meta(html, "og:title") or (titulo.group(1) if titulo else "")
    info["nome"] = htmllib.unescape(info["nome"]).strip()
    if not info["preco"]:
        p = meta(html, "product:price:amount") or meta(html, "og:price:amount")
        try:
            info["preco"] = float(p.replace(",", ".")) if p else None
        except ValueError:
            pass
    og = meta(html, "og:image")
    if og:
        info["imagens"].append(og)
    # Galeria: imagens cujo nome de arquivo tem várias palavras do produto.
    chaves = [w for w in palavras(info["nome"]) if len(w) > 2][:6]
    if len(chaves) >= 2:
        for u in sorted(set(re.findall(r'https?://[^"\'\s)<>]+?\.(?:jpe?g|png|webp)(?:\?[^"\'\s)<>]*)?', html, re.I))):
            arq = normal(urlparse(u).path.rsplit("/", 1)[-1])
            if sum(1 for w in chaves if w in arq) >= max(2, len(chaves) // 2):
                info["imagens"].append(u)
    info["texto"] = normal(re.sub(r"<[^>]+>", " ", html[:400000]))[:200000]
    vistos, imgs = set(), []
    for u in info["imagens"]:
        u = urljoin(url, htmllib.unescape(u.strip()))
        if u.startswith("//"):
            u = "https:" + u
        base = re.sub(r"\?.*$", "", u)
        if base not in vistos and u.startswith("http"):
            vistos.add(base)
            imgs.append(u)
    info["imagens"] = imgs
    return info


# ------------------------------------------------------------------ imagens

def dhash(img):
    g = img.convert("L").resize((9, 8), Image.BILINEAR)
    px = list(g.tobytes())
    return sum(1 << i for i in range(64) if px[(i // 8) * 9 + i % 8] > px[(i // 8) * 9 + i % 8 + 1])


def baixar_imagem(url, pagina):
    try:
        corpo, _ = baixar(url, 6_000_000, headers={"Referer": pagina})
        if corpo is None or len(corpo) < 5000:
            return None
        img = Image.open(io.BytesIO(corpo))
        if img.width * img.height > 40_000_000:
            return None  # imagem gigante: não vale a memória
        img.draft("RGB", (LADO * 2, LADO * 2))  # JPEG grande já decodifica reduzido
        img.load()
    except Exception:
        return None
    if min(img.size) < 300:
        return None
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        fundo = Image.new("RGB", img.size, (255, 255, 255))
        fundo.paste(img, mask=img.split()[-1])
        img = fundo
    else:
        img = img.convert("RGB")
    img.thumbnail((LADO, LADO), Image.LANCZOS)
    return img


# ------------------------------------------------------------------ busca

def serper(chave, consulta):
    for _ in range(3):
        try:
            r = requests.post("https://google.serper.dev/search", timeout=20,
                              headers={"X-API-KEY": chave, "Content-Type": "application/json"},
                              json={"q": consulta, "gl": "br", "hl": "pt-br", "num": 10})
            if r.status_code == 200:
                return r.json().get("organic", [])
            if r.status_code in (401, 403):
                raise SystemExit(f"Serper recusou a chave (HTTP {r.status_code}).")
        except requests.RequestException:
            pass
    return []


def avaliar(prod, pag):
    marcas = [m for m in (prod.get("marca"), prod.get("busca_foto")) if m]
    nome = pontuar_nome(prod["nome"], pag["nome"], marcas=marcas)
    fornecedor = any(normal(m) and (normal(m) in normal(pag["marca"]) or normal(m) in normal(pag["nome"])
                                    or f" {normal(m)} " in f" {pag['texto']} ") for m in marcas)
    preco = None
    if pag["preco"] and prod.get("preco", 0) > 1.5:
        razao = pag["preco"] / prod["preco"]
        preco = 0.5 <= razao <= 2.2
    nota = nome * 70 + (20 if fornecedor else 0) + (10 if preco else 0) - (15 if preco is False else 0)
    return round(nota, 1), {"nome": round(nome, 2), "fornecedor": fornecedor, "preco_proximo": preco}




# ------------------------------------------------------------------ escolha e download

def vago(nome):
    """Nome curto demais ("Cadeira de Balanço") casa com qualquer coisa."""
    return len([w for w in palavras(nome) if w not in DETALHES]) <= 3


def confiavel(nome, motivos, nota):
    """Confiança média-alta: nome quase todo igual e (fornecedor ou preço) confirmando.
    Nome vago precisa dos dois."""
    if motivos["nome"] < 0.75 or nota < 72:
        return False
    if vago(nome):
        return bool(motivos["fornecedor"] and motivos["preco_proximo"])
    return bool(motivos["fornecedor"] or motivos["preco_proximo"])


def aceitaveis(candidatos, nome):
    candidatos.sort(key=lambda c: -c[0])
    return [c for c in candidatos if confiavel(nome, c[1], c[0])]


def baixar_fotos(prod, aceitos, max_paginas):
    pasta = PASTA_FOTOS / prod["id"]
    fotos, hashes, origens = [], [], []
    cores_nossas = [w for w in palavras(prod["nome"]) if w in CORES]
    # Só fotos do MESMO produto: outras lojas entram apenas se venderem o mesmo nome
    # (evita misturar dois modelos parecidos na mesma galeria).
    alvo = " ".join(palavras(aceitos[0][2]["nome"]))
    mesmos = [c for c in aceitos if " ".join(palavras(c[2]["nome"])) == alvo]
    for nota, motivos, pag in mesmos[:max_paginas]:
        for u in pag["imagens"][:12]:
            if len(fotos) >= MAX_FOTOS:
                break
            # foto de outra cor do mesmo móvel (o nome do arquivo entrega): fica de fora
            arquivo = [w for w in palavras(urlparse(u).path.rsplit("/", 1)[-1]) if w in CORES]
            if any(not any(parecida(c, n) for n in cores_nossas) for c in arquivo):
                continue
            img = baixar_imagem(u, pag["url"])
            if img is None:
                continue
            h = dhash(img)
            if any(bin(h ^ x).count("1") <= 6 for x in hashes):
                continue  # repetida (a mesma foto do fabricante aparece em várias lojas)
            hashes.append(h)
            pasta.mkdir(parents=True, exist_ok=True)
            destino = pasta / f"{len(fotos) + 1}.jpg"
            img.save(destino, "JPEG", quality=QUALIDADE, optimize=True, progressive=True)
            img.close()
            fotos.append(destino.relative_to(RAIZ).as_posix())
            origens.append(u)
        if len(fotos) >= MAX_FOTOS:
            break
    return fotos, origens


def registro_base(prod, consulta, candidatos, modo):
    return {"nome": prod["nome"], "consulta": consulta, "fonte": modo,
            "tentativas": sorted(set(prod.get("_tentativas", [])) | {modo}),
            "melhor": [{"url": c[2]["url"], "nome_loja": c[2]["nome"][:120], "nota": c[0], **c[1]}
                       for c in candidatos[:3]]}


def concluir(prod, consulta, candidatos, modo, max_paginas):
    aceitos = aceitaveis(candidatos, prod["nome"])
    registro = registro_base(prod, consulta, candidatos, modo)
    if not aceitos:
        registro["status"] = "sem_confianca" if candidatos else "nada_encontrado"
        return prod, [], registro
    fotos, origens = baixar_fotos(prod, aceitos, max_paginas)
    registro.update(status="ok" if fotos else "sem_imagem_valida", fotos=len(fotos), origens=origens)
    return prod, fotos, registro


# ------------------------------------------------------------------ caminho 1: lojas VTEX

LOJAS_VTEX = ["www.americanas.com.br", "www.casaevideo.com.br", "www.queroquero.com.br",
              "www.shopcoopera.com.br", "www.zenirmoveis.com.br", "www.lojasguaibim.com.br",
              "www.bemol.com.br", "www.multimoveis.com", "www.armazempb.com.br",
              "www.webcontinental.com.br", "www.lidershopping.com.br"]
# Palavras que não identificam o modelo (a busca da VTEX exige todas as palavras).
GENERICAS = {"portas", "porta", "gavetas", "gaveta", "bocas", "boca", "mesa", "vidro", "espelho", "duplo",
             "dupla", "simples", "triplo", "tripla", "aco", "madeira", "mdf", "mdp", "casal", "solteiro",
             "cozinha", "quarto", "sala", "multiuso", "suspenso", "suspensa", "aereo", "aerea", "conjunto",
             "jogo", "pecas", "lugares", "cadeiras", "cadeira", "tampo", "painel", "eletrico", "eletrica",
             "automatico", "digital", "110v", "220v", "127v", "bivolt", "litros", "new", "glass", "passar",
             "vapor", "seco", "interna", "externa", "infantil", "grande", "pequeno", "pequena", "baixo",
             "alto", "com", "sem", "acendimento", "nichos", "nicho", "prateleiras", "prateleira", "pes",
             "retratil", "reclinavel", "canto", "modulado", "modulo", "balcao", "armario", "cozinha",
             "frutas", "gas", "assento", "super", "cesto", "plastico", "estofado", "redonda", "quadrada",
             "aro", "masculina", "masculino", "feminina", "feminino", "freio", "infantil", "adulto"}


def termos_vtex(prod):
    ws = [w for w in palavras(prod["nome"]) if w not in DETALHES]
    if not ws:
        return []
    marcas = {normal(m) for m in (prod.get("marca"), prod.get("busca_foto")) if m}
    marcas = {w for m in marcas for w in m.split()}
    modelo = [w for w in ws[1:] if w not in GENERICAS and w not in CORES and w not in marcas
              and not re.fullmatch(r"[\d.]+", w) and len(w) >= 3]
    termos = []
    if len(modelo) >= 2:
        termos.append(" ".join([ws[0]] + modelo[:2]))
    if modelo:
        termos.append(" ".join([ws[0]] + modelo[:1]))
    elif marcas:
        termos.append(" ".join([ws[0]] + sorted(marcas)[:1]))
    return termos


def foto_vtex_800(u):
    return re.sub(r"/ids/(\d+)(?:-\d+-\d+)?/", r"/ids/\1-800-800/", u)


def buscar_vtex(loja, termo):
    try:
        corpo, _ = baixar(f"https://{loja}/api/catalog_system/pub/products/search?"
                          + requests.compat.urlencode({"ft": termo, "_from": 0, "_to": 19}, quote_via=requests.compat.quote), 4_000_000)
        dados = json.loads(corpo) if corpo and corpo.lstrip()[:1] == b"[" else []
    except Exception:
        return []
    paginas = []
    for p in dados if isinstance(dados, list) else []:
        descricao = normal(re.sub(r"<[^>]+>", " ", str(p.get("description") or "")))[:3000]
        for item in p.get("items") or []:
            try:
                preco = float(item["sellers"][0]["commertialOffer"]["Price"]) or None
            except (KeyError, IndexError, TypeError, ValueError):
                preco = None
            imagens = [foto_vtex_800(i["imageUrl"]) for i in item.get("images") or [] if i.get("imageUrl")]
            nome = item.get("nameComplete") or f"{p.get('productName', '')} {item.get('name', '')}"
            paginas.append({"url": p.get("link") or f"https://{loja}", "nome": nome, "marca": p.get("brand") or "",
                            "preco": preco, "imagens": imagens,
                            "texto": normal(f"{p.get('brand', '')} {p.get('productName', '')}") + " " + descricao})
    return paginas


def processar_vtex(prod):
    termos = termos_vtex(prod)
    candidatos = []
    lojas = LOJAS_VTEX[:]
    random.shuffle(lojas)  # espalha as consultas: nenhuma loja recebe tudo ao mesmo tempo
    for loja in lojas:
        for termo in termos:
            paginas = buscar_vtex(loja, termo)
            for pag in paginas:
                if pag["imagens"]:
                    nota, motivos = avaliar(prod, pag)
                    if motivos["nome"] >= 0.5:
                        candidatos.append((nota, motivos, pag))
            if paginas:
                break  # o termo mais específico já trouxe resultado nesta loja
        # já tem de onde tirar 6 fotos com confiança: não precisa perguntar às outras lojas
        if sum(len(c[2]["imagens"]) for c in aceitaveis(list(candidatos), prod["nome"])) >= 10:
            break
    return concluir(prod, " | ".join(termos), candidatos, "vtex", 4)


# ------------------------------------------------------------------ caminho 2: Google (Serper)

def processar_google(prod, chave):
    consulta = prod["nome"] + (f" {prod['busca_foto']}" if prod.get("busca_foto") else "")
    resultados = serper(chave, consulta)
    candidatos = []
    for res in resultados[:10]:
        url = res.get("link", "")
        if not url or any(s in urlparse(url).netloc for s in IGNORAR):
            continue
        # filtro rápido pelo título do Google (que costuma vir cortado, sem a cor)
        if pontuar_nome(prod["nome"], res.get("title", "") + " " + res.get("snippet", ""), exigir_cor=False) < 0.4:
            continue
        pag = ler_pagina(url)
        if not pag or not pag["imagens"]:
            continue
        nota, motivos = avaliar(prod, pag)
        candidatos.append((nota, motivos, pag))
    reg = concluir(prod, consulta, candidatos, "google", 2)
    reg[2]["resultados_google"] = [{k: r.get(k) for k in ("title", "link")} for r in resultados[:10]]
    return reg


# ------------------------------------------------------------------ execução

def carregar_produtos():
    unicos = {}
    for loja in LOJAS:
        dados = json.loads((RAIZ / "dados" / f"{loja}.json").read_text(encoding="utf-8"))
        for p in dados["produtos"]:
            unicos.setdefault(p["nome_sistema"], p)
    for sistema, p in unicos.items():
        p["id"] = hashlib.sha1(sistema.encode()).hexdigest()[:10]
    return unicos


def ler_json(arq):
    return json.loads(arq.read_text(encoding="utf-8")) if arq.exists() else {}


def gravar(fotos, relatorio):
    ARQ_FOTOS.write_text(json.dumps(fotos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    ARQ_RELATORIO.write_text(json.dumps(relatorio, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def revalidar():
    """Reaplica a regra de nome/cor atual nos produtos já aceitos e tira o que não passar."""
    fotos, relatorio = ler_json(ARQ_FOTOS), ler_json(ARQ_RELATORIO)
    produtos = carregar_produtos()
    tirados = []
    for sistema in list(fotos):
        reg = relatorio.get(sistema) or {}
        prod = produtos.get(sistema, {})
        marcas = [m for m in (prod.get("marca"), prod.get("busca_foto")) if m]
        opcoes = reg.get("melhor") or [{}]
        origem = next((m for m in opcoes if m.get("nome", 0) >= 0.75 and (m.get("fornecedor") or m.get("preco_proximo"))), opcoes[0])
        melhor = dict(origem)
        melhor["nome"] = pontuar_nome(reg.get("nome", ""), melhor.get("nome_loja", ""), marcas=marcas)
        nota = melhor["nome"] * 70 + (20 if melhor.get("fornecedor") else 0) + (10 if melhor.get("preco_proximo") else 0) \
            - (15 if melhor.get("preco_proximo") is False else 0)
        if not confiavel(reg.get("nome", ""), melhor, nota):
            for caminho in fotos.pop(sistema):
                (RAIZ / caminho).unlink(missing_ok=True)
            reg["status"] = "reprovado_revalidacao"
            tirados.append(f"{reg.get('nome')}  <-  {melhor.get('nome_loja')}")
    gravar(fotos, relatorio)
    print(f"{len(tirados)} tirados:", *tirados, sep="\n  ")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("modo", choices=["vtex", "google", "revalidar"])
    ap.add_argument("--limite", type=int, default=0)
    ap.add_argument("--trabalhadores", type=int, default=6)
    args = ap.parse_args()
    if args.modo == "revalidar":
        return revalidar()

    chave = None
    if args.modo == "google":
        sys.path.insert(0, str(Path.home() / ".claude/skills/bitwarden-credentials/scripts"))
        from bws_secret import get_secret
        chave = get_secret("SERPER_API_KEY")
        if not chave:
            raise SystemExit("SERPER_API_KEY não encontrada no Bitwarden.")

    fotos, relatorio = ler_json(ARQ_FOTOS), ler_json(ARQ_RELATORIO)
    fila = []
    for sistema, p in carregar_produtos().items():
        tentativas = (relatorio.get(sistema) or {}).get("tentativas", [])
        if sistema not in fotos and args.modo not in tentativas:
            p["_tentativas"] = tentativas
            fila.append(p)
    if args.modo == "google":
        fila.sort(key=lambda p: -p.get("quantidade", 0))  # créditos contados: primeiro o que tem mais estoque
    if args.limite:
        fila = fila[:args.limite]
    print(f"{len(fila)} produtos na fila ({args.modo})", flush=True)

    trava, feitos, com_foto = threading.Lock(), 0, 0
    tarefa = (lambda p: processar_google(p, chave)) if chave else processar_vtex
    with ThreadPoolExecutor(args.trabalhadores) as ex:
        futuros = [ex.submit(tarefa, p) for p in fila]
        for f in as_completed(futuros):
            try:
                prod, lista, reg = f.result()
            except Exception as erro:  # um produto com problema não para os outros
                print("erro:", repr(erro)[:200], flush=True)
                continue
            with trava:
                feitos += 1
                relatorio[prod["nome_sistema"]] = reg
                if lista:
                    fotos[prod["nome_sistema"]] = lista
                    com_foto += 1
                print(f"[{feitos}/{len(fila)}] {reg['status']:>18} {len(lista)} {prod['nome'][:60]}", flush=True)
                if feitos % 20 == 0:
                    gravar(fotos, relatorio)
    gravar(fotos, relatorio)
    print(f"Pronto: {com_foto} produtos ganharam fotos nesta rodada. Total com fotos: {len(fotos)}", flush=True)


if __name__ == "__main__":
    main()
