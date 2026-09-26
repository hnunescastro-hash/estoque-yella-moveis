#!/usr/bin/env python3
"""Atualiza o estoque de uma loja a partir do relatório HTML do CompuFour.

Uso (rodar na pasta do projeto):
    python3 ferramentas/atualizar_estoque.py matina "YÊLLA MÓVEIS - CONTROLE DE ESTOQUE.html"
    python3 ferramentas/atualizar_estoque.py igapora "ELETRO CASTRO - CONTROLE DE ESTOQUE.html"

O que o script faz:
  1. Lê o relatório "Controle de estoque" exportado pelo CompuFour (Aplicativos Comerciais).
  2. Troca cada descrição do sistema pelo nome revisado em ferramentas/correcoes.json.
     Produto que ainda não foi revisado recebe uma correção automática (abreviações comuns
     e acentos) e é listado no final como "revisar".
  3. Acerta o fornecedor: produto transferido de outra loja da rede usa o fornecedor
     cruzado em correcoes.json (fornecedor_do_produto).
  4. Grava dados/<loja>.json e registra a loja em dados/lojas.json.

O custo de compra, quando vem no relatório, NUNCA é gravado: a página é pública.
Só usa a biblioteca padrão do Python.

As funções montar_loja() e comparar() também são usadas pelo servidor de atualização
(servidor/app.py), que faz a mesma coisa a partir dos arquivos enviados pela página.
"""

import argparse
import html
import json
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARQ_CORRECOES = RAIZ / "ferramentas" / "correcoes.json"
PASTA_DADOS = RAIZ / "dados"
ARQ_LOJAS = PASTA_DADOS / "lojas.json"

MESES = {
    "janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
}

# Cabeçalho do relatório -> campo do JSON (comparado sem acento e em minúsculas).
# Coluna que não está aqui (ex.: "Custo de Compra") é ignorada de propósito.
COLUNAS = {
    "codigo": "codigo",
    "descricao": "descricao",
    "fornecedor preferencial": "fornecedor",
    "ultimo fornecedor": "fornecedor",
    "preco em r$": "preco",
    "quantidade": "quantidade",
    "ult.compra": "ultima_compra",
    "ult.venda": "ultima_venda",
}
OBRIGATORIAS = {"codigo", "descricao", "preco", "quantidade"}
# Colunas privadas: lidas só para o servidor de atualização (modo administrador), nunca gravadas em dados/.
COLUNAS_PRIVADAS = {"custo de compra": "custo"}
NOVO_POR_DIAS = 30  # "novo_desde" some dos dados depois disso


class ErroRelatorio(SystemExit):
    """Problema no relatório, com a mensagem pronta para mostrar a quem enviou.
    No terminal se comporta como antes (sai com a mensagem)."""


def sem_acento(texto):
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def chave(texto):
    """Chave usada no correcoes.json: espaços repetidos removidos e tudo em maiúsculas."""
    return " ".join(texto.split()).upper()


def limpar_celula(bruto):
    texto = re.sub(r"<[^>]+>", " ", bruto)
    return " ".join(html.unescape(texto).split())


def ler_relatorio(caminho):
    if not Path(caminho).is_file():
        raise ErroRelatorio(f"Arquivo não encontrado: {caminho}")
    return decodificar(Path(caminho).read_bytes())


def decodificar(dados):
    """Conteúdo do relatório (bytes) -> texto, pela codificação declarada no arquivo."""
    charset = re.search(rb'charset=["\']?([\w-]+)', dados[:2000], re.I)
    codificacoes = [charset.group(1).decode("ascii")] if charset else []
    codificacoes += ["cp1252", "utf-8"]
    for cod in codificacoes:
        try:
            return dados.decode(cod)
        except (LookupError, UnicodeDecodeError):
            continue
    raise ErroRelatorio("Não consegui ler o arquivo: codificação desconhecida.")


def numero_br(texto):
    """'1.655,50' -> 1655.5 ; '' -> None"""
    texto = texto.strip()
    if not texto:
        return None
    return float(texto.replace(".", "").replace(",", "."))


def data_br(texto):
    """'14/07/2026' -> '2026-07-14' ; '' -> None"""
    texto = texto.strip()
    if not texto:
        return None
    return datetime.strptime(texto, "%d/%m/%Y").date().isoformat()


def extrair(conteudo):
    cabecalho = re.search(r"<tr[^>]*>((?:(?!</tr>).)*?<th.*?)</tr>", conteudo, re.S | re.I)
    if not cabecalho:
        raise ErroRelatorio("Não encontrei o cabeçalho da tabela. Esse arquivo é o relatório de estoque do CompuFour?")
    titulos = [sem_acento(limpar_celula(t)).lower() for t in re.findall(r"<th[^>]*>(.*?)</th>", cabecalho.group(1), re.S | re.I)]
    indices = {}
    for i, titulo in enumerate(titulos):
        if titulo in COLUNAS:
            indices[COLUNAS[titulo]] = i
        elif titulo in COLUNAS_PRIVADAS:
            indices[COLUNAS_PRIVADAS[titulo]] = i
    faltando = OBRIGATORIAS - set(indices)
    if faltando:
        raise ErroRelatorio(f"Colunas obrigatórias ausentes no relatório: {', '.join(sorted(faltando))}. Colunas lidas: {titulos}")

    corpo = conteudo[cabecalho.end():]
    linhas = []
    total_relatorio = None
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", corpo, re.S | re.I):
        celulas = [limpar_celula(td) for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S | re.I)]
        if len(celulas) < len(titulos):
            continue
        valor = {campo: celulas[i] for campo, i in indices.items()}
        if not valor["codigo"]:
            # linha de totais do relatório (só a quantidade vem preenchida)
            if valor.get("quantidade"):
                total_relatorio = numero_br(valor["quantidade"])
            continue
        linhas.append(valor)

    gerado = re.search(
        r"Gerado em\s+(.+?),\s*(\d{1,2})\s+de\s+([^\s]+)\s+de\s+(\d{4})\s+[àa]s\s+(\d{1,2}):(\d{2})(?::(\d{2}))?",
        conteudo, re.I)
    gerado_em = None
    cidade = None
    if gerado:
        cidade = gerado.group(1).strip()
        mes = MESES.get(sem_acento(gerado.group(3)).lower())
        if mes:
            gerado_em = datetime(int(gerado.group(4)), mes, int(gerado.group(2)),
                                 int(gerado.group(5)), int(gerado.group(6)), int(gerado.group(7) or 0))
    registros = re.search(r"N[úu]mero de registros:\s*(\d+)", conteudo, re.I)
    return (linhas, total_relatorio, gerado_em, cidade, int(registros.group(1)) if registros else None,
            set(indices))


# ---------------------------------------------------------------------------
# Correção automática (só para produto que ainda não tem nome revisado)
# ---------------------------------------------------------------------------

PALAVRAS = {
    # abreviações
    "C/": "com", "S/": "sem", "P/": "para", "PTO": "Preto", "PTA": "Porta", "PTS": "Portas", "PTAS": "Portas",
    "BCO": "Branco", "GAV": "Gavetas", "GV": "Gavetas", "GVT": "Gavetas", "LUG": "Lugares", "COZ": "Cozinha",
    "CIN": "Cinamomo", "CINAMO": "Cinamomo", "FREI": "Freijó", "FREIJ": "Freijó", "INF": "Infantil",
    "MASC": "Masculina", "FEMIN": "Feminina", "PCS": "Peças", "PÇS": "Peças", "UND": "Unidades", "UN": "Unidades",
    "LTS": "Litros", "ESP": "Espelho", "SUSP": "Suspenso", "DPL": "Duplo", "TPL": "Triplo",
    "RIP": "Ripado", "PTF": "Preto Fosco", "FEN": "Fendi", "FENDY": "Fendi", "GRAF": "Grafite", "ACET": "Acetinado",
    "VOLTS": "V", "BIVOL": "Bivolt", "MOLD": "Moldura", "MT": "m", "ACEND": "Acendimento",
    "ASCEND": "Acendimento", "PREMIUN": "Premium", "ESSENCIA": "Essência", "MOVEIS": "Móveis", "MOVEL": "Móvel",
    "IND": "Indústria", "INDUSTRIA": "Indústria", "COMERCIO": "Comércio", "ELETRONICOS": "Eletrônicos",
    # acentos
    "ACO": "Aço", "AEREO": "Aéreo", "AGATA": "Ágata", "ANATOMICO": "Anatômico", "AREA": "Área",
    "ARMARIO": "Armário", "AVELA": "Avelã", "BALANCA": "Balança", "BALCAO": "Balcão", "BALANCO": "Balanço",
    "BAU": "Baú", "BERCO": "Berço", "BISTRO": "Bistrô", "CAFE": "Café", "CAMURCA": "Camurça",
    "CERAMICA": "Cerâmica", "CESTAO": "Cestão", "COLCHAO": "Colchão", "COLCHOES": "Colchões",
    "COMODA": "Cômoda", "DOBRAVEL": "Dobrável", "ELETRICA": "Elétrica", "ELETRICO": "Elétrico",
    "ELETRONICA": "Eletrônica", "ELETRONICO": "Eletrônico", "ESCRITORIO": "Escritório", "FOGAO": "Fogão",
    "FREIJO": "Freijó", "GENOVA": "Gênova", "HORTELA": "Hortelã", "IPE": "Ipê", "ITALIA": "Itália",
    "JEQUITIBA": "Jequitibá", "LAMINA": "Lâmina", "LILAS": "Lilás", "MATELASSE": "Matelassê",
    "MILAO": "Milão", "MODULO": "Módulo", "OPTICO": "Óptico", "PEROLA": "Pérola", "PLASTICO": "Plástico",
    "POLICIA": "Polícia", "PORTATIL": "Portátil", "PRESSAO": "Pressão", "RUSTICO": "Rústico",
    "SAIDAS": "Saídas", "SAUDE": "Saúde", "SINTETICA": "Sintética", "SOFA": "Sofá", "SUECIA": "Suécia",
    "TOPAZIO": "Topázio", "AMENDOA": "Amêndoa", "CAPITONE": "Capitonê", "VARAO": "Varão",
    "FLORENCA": "Florença", "VITORIA": "Vitória", "OPERA": "Ópera", "MAQUINA": "Máquina",
}
# Abreviação que só vale como primeira palavra (tipo do produto)
PRIMEIRA = {
    "GR": "Guarda-Roupa", "GRPA": "Guarda-Roupa", "REF": "Refrigerador", "LIQ": "Liquidificador",
    "LAV": "Lavadora", "BIC": "Bicicleta", "TRAV": "Travesseiro", "ARM": "Armário", "ARM.": "Armário",
    "CONJ": "Conjunto", "COL": "Colchão", "VENT": "Ventilador", "GAB": "Gabinete", "CAD": "Cadeira",
    "FAQ": "Faqueiro", "MOD": "Módulo", "FREEZE": "Freezer", "COMADA": "Cômoda",
}
MINUSCULAS = {"DE", "DA", "DO", "DAS", "DOS", "E", "COM", "SEM", "PARA", "A", "EM", "NA", "NO"}
SIGLAS = {"TV", "LED", "MDF", "MDP", "UV", "USB", "HD", "JBL", "AOC", "MTB", "RMS", "JB", "JK", "SM", "II", "III",
          "4K", "HP", "PL", "LG", "DVD", "USB", "ADSL", "TPL", "DPL", "PVC", "EVA", "D20", "D28", "D33", "D45"}


def _formatar_nucleo(base, primeiro):
    if primeiro and base in PRIMEIRA:
        return PRIMEIRA[base]
    if base in PALAVRAS:
        return PALAVRAS[base]
    if base in SIGLAS:
        return base
    if re.fullmatch(r"\d+(?:[.,]\d+)?(X\d+(?:[.,]\d+)?)+(CM|MM|M)?", base):  # medidas 138X188X28
        return base.lower()
    m = re.fullmatch(r"(\d+(?:[.,]\d+)?)(CM|MM|M|KG|L|W|V|GB|MT|VOLTS?)", base)
    if m:  # unidades: 30CM -> 30cm, 220V, 35L, 128GB, 220VOLT -> 220V
        unidade = {"CM": "cm", "MM": "mm", "M": "m", "MT": "m", "KG": "kg", "VOLT": "V", "VOLTS": "V"}.get(m.group(2), m.group(2))
        return m.group(1) + unidade
    m = re.fullmatch(r"(\d+)(B|BOCAS)", base)
    if m:  # fogão 4B -> 4 Bocas
        n = int(m.group(1))
        return f"{n} {'Boca' if n == 1 else 'Bocas'}"
    m = re.fullmatch(r"(\d+)(PTS|PTAS|PT|P)", base)
    if m:
        n = int(m.group(1))
        return f"{n} {'Porta' if n == 1 else 'Portas'}"
    m = re.fullmatch(r"(\d+)(GAV|GVT|GV|G)", base)
    if m:
        n = int(m.group(1))
        return f"{n} {'Gaveta' if n == 1 else 'Gavetas'}"
    if re.search(r"\d", base):  # códigos de modelo (F4VAB, B24-127...) ficam como estão
        return base
    if not primeiro and base in MINUSCULAS:
        return base.lower()
    return base.capitalize()


def _formatar_token(token, primeiro):
    # pontuação nas pontas ("(COLCHÃO", "IMBUIA)", "-CACAU") não pode atrapalhar a correção
    if primeiro and token.upper() in PRIMEIRA:
        return PRIMEIRA[token.upper()]
    pre, nucleo, suf = re.fullmatch(r"([(\"'\-]*)(.*?)([)\"',;:.\-]*)", token).groups()
    if not nucleo:
        return token
    return pre + _formatar_nucleo(nucleo.upper(), primeiro) + suf


def corrigir_automatico(descricao):
    texto = " ".join(descricao.split())
    texto = re.sub(r"^([A-Za-z]{2,5})\.(?=\S)", r"\1. ", texto)  # ARM.LONDRES -> ARM. LONDRES
    texto = re.sub(r"\b([CSP])/\s*", lambda m: m.group(1).upper() + "/ ", texto, flags=re.I)  # C/ESPELHO -> C/ ESPELHO
    partes = []
    for i, token in enumerate(texto.split(" ")):
        if "/" in token and token.upper() not in PALAVRAS:
            pedacos = [_formatar_token(p, i == 0 and j == 0) if p else p for j, p in enumerate(token.split("/"))]
            partes.append("/".join(pedacos))
        else:
            partes.append(_formatar_token(token, i == 0))
    nome = " ".join(p for p in partes if p)
    nome = re.sub(r"\bOff?\s+W(?:h(?:i(?:t(?:e)?)?)?)?\b", "Off White", nome)  # OFF WH, OF WHITE, OFF W
    nome = re.sub(r"\bOff\b(?! White)", "Off White", nome)                      # OFF sozinho
    return nome[:1].upper() + nome[1:]


def fornecedor_automatico(nome):
    if not nome:
        return ""
    fixos = {"LTDA": "Ltda", "ME": "ME", "EPP": "EPP", "EIRELI": "Eireli", "S.A": "S.A.", "SA": "S.A.", "S/A": "S/A"}
    partes = []
    for i, token in enumerate(nome.split()):
        base = token.upper()
        if base in fixos:
            partes.append(fixos[base])
        elif re.search(r"[\d/&.]", token):
            partes.append(token)
        else:
            partes.append(_formatar_token(token, i == 0))
    return " ".join(partes)


def contem(texto, parte):
    return sem_acento(parte).lower() in sem_acento(texto).lower()


def formatar_quantidade(valor):
    return int(valor) if valor is not None and float(valor).is_integer() else valor


def montar_loja(loja_id, conteudo, correcoes, lojas, nome=None, uf=None, anterior=None):
    """Lê o relatório (texto) e monta os dados da loja, sem gravar nada.

    anterior: os dados publicados antes (dados/<loja>.json). Produto que não estava lá e foi comprado
    há pouco (última compra até NOVO_POR_DIAS antes do relatório) ganha "novo_desde" (data do
    relatório), que a página mostra como etiqueta "Novo" por alguns dias. Produto antigo que só não
    vinha no relatório anterior não é novo.

    Produto com estoque zero ou negativo (relatório tirado "com produtos sem estoque") não vai para o
    site: só entra em "referencia", que serve para achar o mesmo produto em outra loja (ex.: o que foi
    transferido para Igaporã e acabou em Matina).

    Devolve um dicionário com: saida (conteúdo de dados/<loja>.json), registro (entrada de
    dados/lojas.json), cidade e gerado_em do relatório, revisar (nomes com correção automática),
    fornecedores_novos, avisos (conferência com os totais do próprio relatório), custos
    ({código: custo de compra}, quando o relatório traz a coluna — PRIVADO, fora de "saida") e
    referencia (todos os produtos, com e sem estoque: código, nome, preço e fornecedor)."""
    linhas, total_relatorio, gerado_em, cidade, registros, colunas = extrair(conteudo)
    if not linhas:
        raise ErroRelatorio("Nenhum produto encontrado no relatório.")
    referencia = gerado_em.date() if gerado_em else None
    anteriores = None
    if anterior and anterior.get("produtos") and referencia:
        anteriores = {p["codigo"]: p for p in anterior["produtos"]}

    por_produto = correcoes.get("fornecedor_do_produto", {})
    internos = correcoes.get("fornecedores_internos", {})
    produtos = []
    revisar = []
    fornecedor_automatico_de = {}  # código -> fornecedor do relatório sem revisão em correcoes.json
    for linha in linhas:
        descricao = " ".join(linha["descricao"].split())
        nome_produto = correcoes["produtos"].get(chave(descricao))
        if not nome_produto:
            nome_produto = corrigir_automatico(descricao)
            revisar.append((linha["codigo"], descricao, nome_produto))

        # Fornecedor: o cruzado (fornecedor_do_produto) vale mais que o do relatório.
        # Fornecedor "interno" é outra loja da rede (transferência), não o fornecedor de verdade.
        fornecedor_original = linha.get("fornecedor") or ""
        transferido_de = internos.get(chave(fornecedor_original))
        chave_fornecedor = por_produto.get(chave(descricao)) or ("" if transferido_de else chave(fornecedor_original))
        fornecedor = correcoes["fornecedores"].get(chave_fornecedor, "")
        if chave_fornecedor and not fornecedor:
            fornecedor = fornecedor_automatico(fornecedor_original)
            fornecedor_automatico_de[linha["codigo"]] = fornecedor_original

        produto = {
            "codigo": linha["codigo"],
            "nome": nome_produto,
            "nome_sistema": descricao,
            "fornecedor": fornecedor,
            "preco": numero_br(linha["preco"]),
            "quantidade": formatar_quantidade(numero_br(linha["quantidade"])),
            "ultima_compra": data_br(linha.get("ultima_compra") or ""),
        }
        if "ultima_venda" in colunas:  # o relatório de algumas lojas não traz essa coluna
            produto["ultima_venda"] = data_br(linha.get("ultima_venda") or "")
        if transferido_de:
            produto["transferido_de"] = transferido_de
        marca = correcoes["marcas"].get(chave_fornecedor)
        if marca and not contem(nome_produto, marca):
            produto["marca"] = marca
        termo_foto = correcoes.get("fornecedor_na_busca_de_foto", {}).get(chave_fornecedor)
        if termo_foto and not contem(nome_produto, termo_foto):
            produto["busca_foto"] = termo_foto
        if anteriores is not None:
            velho = anteriores.get(linha["codigo"])
            comprado = produto["ultima_compra"]
            if velho is None:
                if comprado and (referencia - date.fromisoformat(comprado)).days <= NOVO_POR_DIAS:
                    produto["novo_desde"] = referencia.isoformat()
            elif velho.get("novo_desde") and (referencia - date.fromisoformat(velho["novo_desde"])).days <= NOVO_POR_DIAS:
                produto["novo_desde"] = velho["novo_desde"]
        produtos.append(produto)

    produtos.sort(key=lambda p: (sem_acento(p["nome"]).lower(), p["codigo"]))
    todos = produtos
    produtos = [p for p in todos if (p["quantidade"] or 0) > 0]  # o site mostra só o que tem estoque
    em_estoque = {p["codigo"] for p in produtos}
    revisar = [r for r in revisar if r[0] in em_estoque]
    fornecedores_novos = {f for c, f in fornecedor_automatico_de.items() if c in em_estoque}
    total_unidades = sum(p["quantidade"] or 0 for p in produtos)
    soma_relatorio = sum(p["quantidade"] or 0 for p in todos)  # para conferir com o total do relatório

    cadastrada = next((l for l in lojas["lojas"] if l["id"] == loja_id), {})
    nome_loja = nome or cadastrada.get("nome") or cidade or loja_id.capitalize()
    uf = uf or cadastrada.get("uf") or "BA"

    avisos = []
    if registros is not None and registros != len(todos):
        avisos.append(f"o relatório diz {registros} registros, mas li {len(todos)} produtos")
    if total_relatorio is not None and abs(total_relatorio - soma_relatorio) > 0.001:
        avisos.append(f"o total de unidades do relatório é {total_relatorio}, mas a soma lida é {formatar_quantidade(soma_relatorio)}")
    codigos = [p["codigo"] for p in todos]
    if len(set(codigos)) != len(codigos):
        avisos.append("há códigos de produto repetidos no relatório")

    saida = {
        "loja": loja_id,
        "nome": nome_loja,
        "uf": uf,
        "gerado_em": gerado_em.isoformat() if gerado_em else None,
        "total_produtos": len(produtos),
        "total_unidades": formatar_quantidade(total_unidades),
        "produtos": produtos,
    }
    custos = {l["codigo"]: numero_br(l["custo"]) for l in linhas if (l.get("custo") or "").strip()}
    return {
        "saida": saida,
        "registro": {"id": loja_id, "nome": nome_loja, "uf": uf, "arquivo": f"dados/{loja_id}.json"},
        "cidade": cidade,
        "gerado_em": gerado_em,
        "revisar": revisar,
        "fornecedores_novos": fornecedores_novos,
        "avisos": avisos,
        "custos": custos,
        "referencia": [{c: p[c] for c in ("codigo", "nome", "preco", "fornecedor")} for p in todos],
    }


def registrar_loja(lojas, registro):
    """Acrescenta ou atualiza a loja em dados/lojas.json (em memória)."""
    for i, loja in enumerate(lojas["lojas"]):
        if loja["id"] == registro["id"]:
            lojas["lojas"][i] = registro
            return
    lojas["lojas"].append(registro)


def texto_json(dados):
    """Mesmo formato dos arquivos em dados/ (para comparar e gravar)."""
    return json.dumps(dados, ensure_ascii=False, indent=1) + "\n"


def comparar(antes, depois):
    """O que mudou no estoque de uma loja: produtos novos, que saíram, e mudança de quantidade ou preço."""
    velhos = {p["codigo"]: p for p in (antes or {}).get("produtos", [])}
    novos = {p["codigo"]: p for p in depois["produtos"]}
    resumo = lambda p: {"codigo": p["codigo"], "nome": p["nome"], "quantidade": p["quantidade"], "preco": p["preco"]}
    mudancas = {"novos": [], "removidos": [], "quantidade": [], "preco": []}
    for codigo, p in novos.items():
        v = velhos.get(codigo)
        if v is None:
            mudancas["novos"].append(resumo(p))
            continue
        if v["quantidade"] != p["quantidade"]:
            mudancas["quantidade"].append({**resumo(p), "antes": v["quantidade"], "depois": p["quantidade"]})
        if v["preco"] != p["preco"]:
            mudancas["preco"].append({**resumo(p), "antes": v["preco"], "depois": p["preco"]})
    for codigo, v in velhos.items():
        if codigo not in novos:
            mudancas["removidos"].append(resumo(v))
    for lista in mudancas.values():
        lista.sort(key=lambda p: (sem_acento(p["nome"]).lower(), p["codigo"]))
    return mudancas


# Custo de compra de uma loja que vem de outra. Tudo o que Igaporã (filial) vende sai do depósito de
# Matina (matriz) e não existe custo de transferência: o custo de Igaporã é o de compra do mesmo produto
# em Matina. O "Custo de Compra" do relatório de Igaporã não vale (os funcionários lançam ali, em geral,
# o preço de venda de Matina da época). Os códigos das lojas são independentes.
CUSTO_PELA_LOJA = {"igapora": "matina"}
PALAVRAS_VAZIAS = {"de", "da", "do", "das", "dos", "e", "com", "para", "c", "p"}


def _termos(nome):
    texto = re.sub(r"[^a-z0-9]+", " ", sem_acento(nome or "").lower())
    return frozenset(t for t in texto.split() if t not in PALAVRAS_VAZIAS)


def _parecido(a, b):
    return len(a & b) / len(a | b) if a | b else 0.0


def vincular_produtos(produtos, outra, lancado=None):
    """Acha, para cada produto de uma loja, o mesmo produto em outra loja (pelo nome revisado).

    Só aceita quando não há dúvida; sem certeza, o produto fica sem vínculo (melhor sem custo que
    com o custo de outro produto):
      - nome muito parecido (75% das palavras), mesmas medidas/modelo (palavras com número) e
        bem à frente do segundo mais parecido; ou
      - valor lançado como custo na filial igual ao preço do produto na outra loja (os funcionários
        costumam lançar o preço de venda da matriz), com nome parecido (metade das palavras) e sem empate.
    outra: produtos da outra loja — de preferência com os sem estoque (o que acabou lá).
    lancado: {código: valor da coluna "Custo de Compra" da filial} (só como pista, nunca como custo).
    Devolve {código: código do mesmo produto na outra loja}."""
    lancado = lancado or {}
    candidatos = [(q, _termos(q["nome"])) for q in outra]
    vinculos = {}
    for p in produtos:
        termos = _termos(p["nome"])
        modelo = frozenset(t for t in termos if any(c.isdigit() for c in t))
        notas = sorted(((_parecido(termos, t), q, t) for q, t in candidatos), key=lambda x: -x[0])
        if not notas:
            continue
        nota, q, t = notas[0]
        segunda = notas[1][0] if len(notas) > 1 else 0.0
        if nota >= 0.75 and nota - segunda >= 0.15 and modelo == frozenset(x for x in t if any(c.isdigit() for c in x)):
            vinculos[p["codigo"]] = q["codigo"]
            continue
        valor = lancado.get(p["codigo"])
        if valor is None:
            continue
        mesmos = [(n, q2, t2) for n, q2, t2 in notas if abs(q2["preco"] - valor) < 0.005]
        if not mesmos:
            continue
        nota, q, t = mesmos[0]
        segunda = mesmos[1][0] if len(mesmos) > 1 else 0.0
        modelo_q = frozenset(x for x in t if any(c.isdigit() for c in x))
        if nota >= 0.5 and nota - segunda >= 0.15 and (not modelo or not modelo_q or modelo & modelo_q):
            vinculos[p["codigo"]] = q["codigo"]
    return vinculos


def main():
    ap = argparse.ArgumentParser(description="Atualiza dados/<loja>.json a partir do relatório do CompuFour.")
    ap.add_argument("loja", help="identificador da loja, sem acento e sem espaço (ex.: matina, igapora)")
    ap.add_argument("relatorio", help="arquivo .html exportado pelo CompuFour")
    ap.add_argument("--nome", help="nome da loja como aparece na página (padrão: o já cadastrado ou a cidade do relatório)")
    ap.add_argument("--uf", help="estado da loja (padrão: o já cadastrado ou BA)")
    args = ap.parse_args()

    if not re.fullmatch(r"[a-z0-9-]+", args.loja):
        raise SystemExit("O identificador da loja deve ter só letras minúsculas sem acento, números ou hífen (ex.: igapora).")

    correcoes = json.loads(ARQ_CORRECOES.read_text(encoding="utf-8"))
    lojas = {"lojas": []}
    if ARQ_LOJAS.exists():
        lojas = json.loads(ARQ_LOJAS.read_text(encoding="utf-8"))
    destino = PASTA_DADOS / f"{args.loja}.json"
    anterior = json.loads(destino.read_text(encoding="utf-8")) if destino.exists() else None
    r = montar_loja(args.loja, ler_relatorio(args.relatorio), correcoes, lojas, args.nome, args.uf, anterior)
    saida, gerado_em = r["saida"], r["gerado_em"]
    produtos = saida["produtos"]

    PASTA_DADOS.mkdir(exist_ok=True)
    destino.write_text(texto_json(saida), encoding="utf-8")
    registrar_loja(lojas, r["registro"])
    ARQ_LOJAS.write_text(texto_json(lojas), encoding="utf-8")

    com_fornecedor = sum(1 for p in produtos if p["fornecedor"])
    print(f"Loja: {saida['nome']} - {saida['uf']} ({args.loja})")
    print(f"Relatório gerado em: {gerado_em.strftime('%d/%m/%Y %H:%M') if gerado_em else 'não encontrado'}")
    print(f"Produtos: {len(produtos)}  |  Unidades em estoque: {saida['total_unidades']}")
    print(f"Fornecedor identificado: {com_fornecedor} de {len(produtos)}")
    print(f"Arquivo gravado: {destino.relative_to(RAIZ)}")
    if r["fornecedores_novos"]:
        print("\nFornecedores novos (sem revisão em correcoes.json):")
        for f in sorted(r["fornecedores_novos"]):
            print(f"  {f}")
    if r["revisar"]:
        print(f"\n{len(r['revisar'])} produto(s) sem nome revisado (correção automática aplicada, confira):")
        for codigo, original, nome in r["revisar"]:
            print(f"  {codigo}  {original}\n         -> {nome}")
    else:
        print("Todos os nomes vieram da lista revisada.")
    for aviso in r["avisos"]:
        print(f"ATENÇÃO: {aviso}")
    return 1 if r["avisos"] else 0


if __name__ == "__main__":
    sys.exit(main())
