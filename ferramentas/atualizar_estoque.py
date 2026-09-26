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
import bisect
import collections
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
MESES_SEM_ESTOQUE = 48  # produto sem estoque só aparece no site (preço para encomenda) se comprado nesse prazo


class ErroRelatorio(SystemExit):
    """Problema no relatório, com a mensagem pronta para mostrar a quem enviou.
    No terminal se comporta como antes (sai com a mensagem)."""


def sem_acento(texto):
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def chave(texto):
    """Chave usada no correcoes.json: espaços repetidos removidos e tudo em maiúsculas."""
    return " ".join(texto.split()).upper()


def meses_antes(dia, meses):
    """A mesma data, tantos meses antes (29/02 vira 28/02)."""
    ano, mes = divmod(dia.year * 12 + dia.month - 1 - meses, 12)
    return date(ano, mes + 1, min(dia.day, 28 if mes + 1 == 2 else 30 if mes + 1 in (4, 6, 9, 11) else 31))


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
    if re.search(r"\bTV\b", texto, re.I):  # TV 32P, painel para TV até 60P -> polegadas (4P continua portas)
        texto = re.sub(r"(?<![\d,.])(\d{2})\s*P\b(?!/)", r"\1 POLEGADAS", texto, flags=re.I)
    if re.match(r"BIC(?:ICLETA)?\b", texto, re.I):  # bicicleta S/M, C/M -> sem marcha, com marcha
        texto = re.sub(r"\b([SC])/M\b", lambda m: "SEM MARCHA" if m.group(1).upper() == "S" else "COM MARCHA", texto, flags=re.I)
    texto = re.sub(r"\b([CSP])/\s*", lambda m: m.group(1).upper() + "/ ", texto, flags=re.I)  # C/ESPELHO -> C/ ESPELHO
    texto = re.sub(r"\bP[EÉ]:\s*", "PÉ ", texto, flags=re.I)  # PE:DOURADO -> Pé Dourado
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

    Produto com estoque zero ou negativo (relatório de produtos sem estoque) não entra em "saida": vai
    para "sem_estoque" se foi comprado nos últimos MESES_SEM_ESTOQUE meses (o site mostra o preço para
    encomenda) e para "referencia", que serve para achar o mesmo produto em outra loja (ex.: o que foi
    transferido para Igaporã e acabou em Matina).

    Devolve um dicionário com: saida (conteúdo de dados/<loja>.json), registro (entrada de
    dados/lojas.json), cidade e gerado_em do relatório, revisar (nomes com correção automática),
    fornecedores_novos, avisos (conferência com os totais do próprio relatório), custos
    ({código: custo de compra}, quando o relatório traz a coluna — PRIVADO, fora de "saida"),
    sem_estoque (produtos sem estoque comprados há pouco, com quantidade 0) e referencia (todos os
    produtos, com e sem estoque: código, nome, preço e fornecedor)."""
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
    limite = meses_antes(referencia, MESES_SEM_ESTOQUE) if referencia else None
    sem_estoque = [
        {**{k: v for k, v in p.items() if k != "novo_desde"}, "quantidade": 0} for p in todos
        if (p["quantidade"] or 0) <= 0 and limite and p["ultima_compra"] and date.fromisoformat(p["ultima_compra"]) >= limite
    ]

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
        "sem_estoque": sem_estoque,
        "referencia": [{c: p[c] for c in ("codigo", "nome", "nome_sistema", "preco", "fornecedor", "ultima_compra")
                        + tuple(k for k in ("busca_foto", "marca") if k in p)} for p in todos],
    }


def registrar_loja(lojas, registro):
    """Acrescenta ou atualiza a loja em dados/lojas.json (em memória), mantendo o que já havia nela
    (ex.: o arquivo de produtos sem estoque)."""
    for i, loja in enumerate(lojas["lojas"]):
        if loja["id"] == registro["id"]:
            lojas["lojas"][i] = {**loja, **registro}
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

# ---- achar o mesmo produto em duas lojas
# Os códigos são internos de cada sistema e nunca entram na comparação. Compara as palavras da descrição
# (a revisada e a do sistema, com as abreviações expandidas), dando mais peso às raras (modelo, linha, cor
# pouco comum) e tolerando palavra cortada (a descrição do sistema tem 45 letras) e erro de digitação.
# Vetos: tipo de produto diferente, número/medida diferente, cor diferente, casal x solteiro, e uma
# palavra rara diferente de cada lado (modelo Celta x Stilus). Na dúvida (dois candidatos iguais), não liga.

VAZIAS = {"de", "da", "do", "das", "dos", "e", "com", "para", "c", "p", "a", "o", "em", "na", "no", "x", "ref",
          "cod", "mod", "modelo", "un", "und", "unidade", "unidades"}
CORES = set("""branco branca preto preta cinza cinamomo off white freijo nature natural naturale avela castanho carvalho
rosa azul vermelho vermelha amarelo amarela verde marrom bege dourado dourada perola grafite fendi canela mel imbuia ipe
amendoa tabaco chocolate cacau wood rustico marfim prata cromado inox champagne sintra jequitiba damasco teka teca gris
lilas violeta laranja vinho mogno tabacco nogueira cedro mocaccino mocacino carbono titanio titanium bronze grafito areia
camurca capuccino cappuccino caramelo marinho safira ouro cobre rose arena canelato""".split())
TAMANHOS = {"casal", "solteiro", "queen", "king", "viuva", "infantil", "juvenil"}
SINONIMOS_VINCULO = {"roupeiro": "guardaroupa", "refrigerador": "geladeira", "estofado": "sofa", "estofados": "sofa",
                     "televisor": "tv", "televisao": "tv", "cznh": "cozinha", "coz": "cozinha",
                     "tel": "telefone", "mic": "microfone", "jg": "jogo"}
# cor abreviada ou com erro de digitação (senão a trava de cor vê "Carv/Off White" diferente de "Carvalho/Off White")
SINONIMOS_VINCULO.update({x: cor for cor, abreviadas in {
    "carvalho": "carv carval", "natural": "nat natu natur natura nature naturale naturaly naturalle",
    "freijo": "fre frei freijor frejo", "cromado": "crom cromada", "amendoa": "amend amenda amendola", "imbuia": "imb",
    "titanium": "tit titanio", "vermelho": "verm vermel", "chocolate": "choco",
    "cinamomo": "cinam cinamo", "cinza": "cinz", "champagne": "champ champane champanhe", "marrom": "marron marro",
    "grafite": "graf grafi grafit", "castanho": "castan", "areia": "arei", "gris": "grys griss griz",
    "violeta": "viol", "lilas": "lil lila", "fendi": "fen fend", "caramelo": "caram",
    "rustico": "rust rustic rusti rustica", "white": "whit",
}.items() for x in abreviadas.split()})
TIPOS_IGUAIS = [{"kit", "cozinha"}]  # "Kit 8 Portas Golden" é cozinha


def _palavras(texto):
    t = sem_acento(texto or "").lower()
    t = re.sub(r"guarda[\s-]*roupas?", "guardaroupa", t)
    t = re.sub(r"\bconj(?:unto)?\.?\s+(?:de\s+)?(?:sofas?|estofados?)\b", "sofa", t)  # conjunto de sofá = estofado
    t = re.sub(r"\bkit\s*/?\s*cozinha\b", "cozinha", t)
    t = re.sub(r"\bconj(?:unto)?\.?\s+(?:de\s+)?cozinha\b", "cozinha", t)
    t = re.sub(r"\b(?:roupeiro|guardaroupa)\s+multiuso\b", "multiuso", t)
    # decimal só com 1 dígito inteiro (1,60 m; 2,5 L): "138,24" é separador; unidade sai
    t = re.sub(r"(?<!\d)(\d)[,.](\d{1,2})(?!\d)", lambda m: m.group(1) + (m.group(2).rstrip("0") and "." + m.group(2).rstrip("0")), t)
    t = re.sub(r"(\d+(?:\.\d+)?)\s*(m|cm|mm|l|lts|litros|w|v|kg|pol|polegadas)\b", r"\1", t)
    t = t.replace(".", "p")
    t = re.sub(r"(\d)x(\d)", r"\1 \2", t)  # 138x188x41 -> 138 188 41
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return [SINONIMOS_VINCULO.get(x, x) for x in t.split() if x not in VAZIAS]


def _distancia1(a, b):
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) <= 1
    curto, longo = (a, b) if len(a) < len(b) else (b, a)
    return any(longo[:i] + longo[i + 1:] == curto for i in range(len(longo)))


def _iguais(a, b):
    if a == b:
        return True
    if min(len(a), len(b)) >= 4 and (a.startswith(b) or b.startswith(a)):  # palavra cortada
        return True
    return (a.isalpha() and b.isalpha() and a[0] == b[0] and max(len(a), len(b)) >= 4 and min(len(a), len(b)) >= 3
            and a not in TAMANHOS and b not in TAMANHOS and _distancia1(a, b))  # erro de digitação


def _numeros(texto):
    """Números da descrição num formato só: 2,10 (m) = 210 (cm), 03 = 3, O6 (letra) = 6, CAP47 = CAP 47."""
    t = sem_acento(texto or "").lower()
    t = re.sub(r"\bo(?=\d)", "0", t)
    t = re.sub(r"(?<![\d,.])(\d)[,.](\d{1,2})(?!\d)", lambda m: str(int(m.group(1)) * 100 + int(m.group(2).ljust(2, "0"))), t)
    return {str(int(n)) for n in re.findall(r"\d+", t)}


def _quantidade(texto):
    """Quantas unidades vêm no produto: "Kit com 4", "Jogo de 6 Cadeiras", "4 Banquetas".
    ("+" não conta: Igaporã separa medidas com ele, "88+188+58".)"""
    t = sem_acento(texto or "").lower()
    m = re.search(r"\b(?:kit|jogo|caixa|cx|conj(?:unto)?)\s*(?:com|c/|de|c)\s*(\d{1,2})\b", t)
    if m:
        return int(m.group(1))
    m = re.search(r"\b(\d{1,2})\s*(?:cad(?:eiras?)?|banquetas?|unid(?:ades)?|und)\b", t)  # "3 peças" de cozinha é 1 produto
    if m:
        return int(m.group(1))
    return 1


class _Descricao:
    def __init__(self, p):
        self.p = p
        nome = _palavras(p["nome"])
        sistema = _palavras(corrigir_automatico(p.get("nome_sistema") or ""))
        self.nome_t, self.sist_t = set(nome), set(sistema)
        self.t = self.nome_t | self.sist_t
        self.tipo = nome[:1]
        self.inicio = nome[:2] + sistema[:2]  # onde o tipo do produto aparece
        bruto = f"{p['nome']} {p.get('nome_sistema') or ''}"
        self.numeros = _numeros(bruto)
        self.quantidade = max(_quantidade(p["nome"]), _quantidade(p.get("nome_sistema")))
        self.cores = {x for x in self.t if x in CORES}
        self.tamanhos = {x for x in self.t if x in TAMANHOS}
        # como o produto vai para o juiz (Jev): nome, descrição do sistema e preço
        self.texto = f"{p['nome']} (sistema: {p.get('nome_sistema') or ''}; preço R$ {p.get('preco') or 0:.2f})"


def _cobre(conjunto, outro):
    return all(any(_iguais(a, b) for b in outro) for a in conjunto)


def _vetado_forte(g, m):
    """Travas que valem sempre, até para o administrador: número/medida, tamanho e quantidade diferentes."""
    if g.numeros and m.numeros and not (g.numeros <= m.numeros or m.numeros <= g.numeros):
        return True  # 4009 x 4064, 138 x 158 (2,10 = 210, 03 = 3)
    if g.tamanhos and m.tamanhos and g.tamanhos != m.tamanhos:
        return True  # casal x solteiro
    return g.quantidade != m.quantidade  # kit com 4 x avulso


def _vetado(g, m):
    """Travas que nem o juiz derruba: as fortes, mais tipo e cor diferentes (produto que só passa com
    tipo ou cor diferente vai no máximo para a lista "é o mesmo produto?" do administrador)."""
    if _vetado_forte(g, m):
        return True
    mesmo_tipo = lambda a, b: _iguais(a, b) or any(a in grupo and b in grupo for grupo in TIPOS_IGUAIS)
    if g.tipo and m.tipo and not (any(mesmo_tipo(g.tipo[0], b) for b in m.inicio)
                                  and any(mesmo_tipo(m.tipo[0], a) for a in g.inicio)):
        return True  # cadeira x conjunto de 6 cadeiras
    return _cores_diferentes(g, m)


def _cores_diferentes(g, m):
    return bool(g.cores and m.cores and not (_cobre(g.cores, m.cores) and _cobre(m.cores, g.cores)))  # Branco/Lilás x Branco


def _palavras_livres(d):
    """Qualquer palavra do nome (para a busca pelo preço): sem as vazias e sem cor."""
    return {x for x in d.t if x not in CORES and (len(x) >= 3 or x.isdigit())}


def _nota(g, m, idf, raro, medio):
    """None (vetado) ou (cobertura de g, cobertura de m, tem palavra forte em comum, mesmo nome)."""
    if _vetado(g, m):
        return None

    def sobra(d, outro):  # na descrição que mais bate: erro de digitação da outra não conta
        restos = [{a for a in r if not any(_iguais(a, b) for b in outro.t)} for r in (d.nome_t, d.sist_t) if r]
        return {a for a in min(restos, key=len) if a not in CORES and not re.search(r"\d", a) and len(a) >= 3}
    so_g, so_m = sobra(g, m), sobra(m, g)
    if any(idf.get(x, 0) >= raro for x in so_g) and any(idf.get(x, 0) >= raro for x in so_m):
        return None  # um modelo diferente de cada lado
    if any(idf.get(x, 0) >= medio and len(x) >= 4 for x in so_g) and any(idf.get(x, 0) >= medio and len(x) >= 4 for x in so_m):
        return None  # pedra x premium
    cg, cm = _coberturas(g, m, idf)
    comuns = {a for a in g.t if any(_iguais(a, b) for b in m.t)}
    forte = any((idf.get(x, 0) >= raro and x not in CORES and len(x) >= 3) or re.search(r"\d", x) for x in comuns)
    return cg, cm, forte, g.nome_t == m.nome_t


def _coberturas(g, m, idf):
    """Quanto de g está em m e de m em g (palavras raras pesam mais), na melhor descrição de cada lado."""
    peso = lambda conjunto: sum(idf.get(x, 0) for x in conjunto)
    cobertura = lambda rep, outro: peso({a for a in rep if any(_iguais(a, b) for b in outro)}) / (peso(rep) or 1)
    cg = max(cobertura(g.nome_t, m.t), cobertura(g.sist_t, m.t) if g.sist_t else 0)
    cm = max(cobertura(m.nome_t, g.t), cobertura(m.sist_t, g.t) if m.sist_t else 0)
    return cg, cm


JEV_ACEITA = 0.85    # sem ligação pela regra: o juiz liga sozinho com essa certeza
JEV_DUVIDA = 0.5     # entre isto e JEV_ACEITA: vai para a lista "é o mesmo?" do administrador
# (sem ligação: o juiz também vê candidatos com tipo ou cor diferente; o que ele escolher com JEV_DUVIDA ou
# mais vai para a lista, nunca direto: "Air Fryer" x "Fritadeira Air Fryer", "Off White" x "Freijó/Off White")
JEV_CONTESTA = 0.8   # ligação da regra que o juiz nega com essa certeza: vai para a lista também
CANDIDATOS = 8       # quantos produtos da outra loja o juiz compara
PRECO_PROXIMO = 0.05  # ainda sem par nem sugestão: produto da outra loja com alguma palavra igual e preço até 5%
# diferente (base: o preço da outra loja) vai ao juiz com uma pergunta mais branda ("rodada": "preco"); o que ele
# escolher com JEV_DUVIDA ou mais vai para a lista (pedido do Hugo, 26/09/2026)
PRECO_AFROUXADO = 0.15  # quem continuar sem nada: de novo, com preço entre 5% e 15% diferente ("rodada": "preco15")


def cruzar_produtos(produtos, outra, lancado=None, julgar=None, confirmados=None):
    """Acha, para cada produto de uma loja (Igaporã), o mesmo produto na outra (Matina).

    Três etapas: a regra (palavras, com as travas); o juiz, quando houver (`julgar`: recebe
    [{"produto": texto, "candidatos": [textos]}] e devolve [(índice ou None para "nenhum", probabilidade)],
    na mesma ordem — no servidor é o Jev); e as respostas do administrador (`confirmados`:
    {código: {"sim": código da outra loja, "nao": [códigos]}}), que valem mais que tudo.
    O código só identifica o produto dentro da própria loja: nunca entra na comparação.

    Devolve {"codigos": {código: código na outra loja}, "duvidas": [{"codigo", "codigo_para", "prob"}],
    "origem": {código: "regra" | "juiz" | "confirmado"}}."""
    import math
    lancado, confirmados = lancado or {}, confirmados or {}
    lado = [_Descricao(p) for p in produtos]
    outros = [_Descricao(q) for q in outra]
    por_codigo = {d.p["codigo"]: d for d in outros}
    frequencia = collections.Counter()
    for d in lado + outros:
        frequencia.update(d.t)
    total = len(lado) + len(outros)
    idf = {t: math.log((total + 1) / (n + 1)) + 1 for t, n in frequencia.items()}
    raro = math.log((total + 1) / 41) + 1    # palavra em até ~40 produtos: modelo, linha
    medio = math.log((total + 1) / 151) + 1  # em até ~150
    indice = collections.defaultdict(list)  # candidatos: quem divide alguma palavra pouco comum
    for i, d in enumerate(outros):
        for x in d.t:
            if idf[x] >= raro * 0.7:
                indice[x].append(i)
    busca = collections.defaultdict(list)   # para o juiz: quem divide qualquer palavra não muito comum
    for i, d in enumerate(outros):
        for x in d.t:
            if idf[x] > 2.0:
                busca[x].append(i)
    por_preco = sorted((d.p.get("preco") or 0, i) for i, d in enumerate(outros))  # para a busca pelo preço
    so_precos = [preco for preco, _ in por_preco]
    livres = [_palavras_livres(d) for d in outros]

    def perto_no_preco(g, recusados, minimo, maximo):
        """Os da outra loja com alguma palavra igual e preço com diferença acima de minimo (None: desde 0) e
        até maximo; cor igual e as travas fortes valem. Os de mais palavras raras em comum primeiro."""
        preco = g.p.get("preco") or 0
        if preco <= 1:  # R$ 1 é preço de marcação
            return []
        palavras, perto = _palavras_livres(g), []
        inicio = bisect.bisect_left(so_precos, preco / (1 + maximo))
        fim = bisect.bisect_right(so_precos, preco / (1 - maximo))
        for _, i in por_preco[inicio:fim]:
            m, preco_m = outros[i], outros[i].p.get("preco") or 0
            if not preco_m:
                continue
            variacao = abs(preco - preco_m) / preco_m
            if (variacao > maximo or (minimo is not None and variacao <= minimo) or m.p["codigo"] in recusados
                    or _vetado_forte(g, m) or _cores_diferentes(g, m)):
                continue
            comuns = {a for a in palavras if any(_iguais(a, b) for b in livres[i])}
            if comuns:
                perto.append((sum(idf.get(a, 0) for a in comuns), -variacao, i))
        return [outros[i] for _, _, i in sorted(perto, reverse=True)[:CANDIDATOS]]

    regra, candidatos, soltos, pelo_preco = {}, {}, {}, {}
    for g in lado:
        if (confirmados.get(g.p["codigo"]) or {}).get("sim") in por_codigo:
            continue  # o administrador já disse qual é
        recusados = set((confirmados.get(g.p["codigo"]) or {}).get("nao") or ())
        notas = []
        for i in {i for x in g.t for i in indice.get(x, ())}:
            if outros[i].p["codigo"] in recusados:
                continue
            r = _nota(g, outros[i], idf, raro, medio)
            if not r:
                continue
            cg, cm, forte, mesmo_nome = r
            if len(g.nome_t) == 1 and not mesmo_nome:
                continue  # nome de uma palavra só ("Cesto") só liga se for igual
            if mesmo_nome or (cg >= 0.75 and cm >= (0.25 if forte else 0.45) and (forte or cm >= 0.75)):
                pista = 0.05 if abs(outros[i].p["preco"] - lancado.get(g.p["codigo"], -1)) < 0.005 else 0
                notas.append((cg + 0.25 * cm + pista, i))
        if notas:
            notas.sort(reverse=True)
            empatados = [n for n in notas if notas[0][0] - n[0] < 0.03]
            if len({tuple(sorted(outros[i].nome_t)) for _, i in empatados}) == 1:  # na dúvida, não liga
                escolhido = max(empatados, key=lambda n: outros[n[1]].p.get("ultima_compra") or "")  # cadastro repetido: o mais recente
                regra[g.p["codigo"]] = outros[escolhido[1]]
        if julgar:  # os mais parecidos que passam nas travas (o da regra sempre entre eles)
            parecidos, travados = [], []
            for i in {i for x in g.t for i in busca.get(x, ())}:
                m = outros[i]
                if m.p["codigo"] in recusados or _vetado_forte(g, m):
                    continue
                cg, cm = _coberturas(g, m, idf)
                (travados if _vetado(g, m) else parecidos).append((cg + 0.3 * cm, i))
            lista = [outros[i] for _, i in sorted(parecidos, reverse=True)[:CANDIDATOS]]
            da_regra = regra.get(g.p["codigo"])
            if da_regra and da_regra not in lista:
                lista = [da_regra] + lista[:CANDIDATOS - 1]
            if lista:
                candidatos[g.p["codigo"]] = lista
            if not da_regra:  # sem ligação: também com tipo ou cor diferente (só para a lista do administrador)
                solta = [outros[i] for _, i in sorted(parecidos + travados, reverse=True)[:CANDIDATOS]]
                if solta and solta != lista:
                    soltos[g.p["codigo"]] = solta
                perto = perto_no_preco(g, recusados, None, PRECO_PROXIMO)  # e pelo preço quase igual
                if perto:
                    pelo_preco[g.p["codigo"]] = perto

    respostas, respostas_soltas, respostas_preco = {}, {}, {}
    rodadas = {"": (candidatos, respostas), "solto": (soltos, respostas_soltas), "preco": (pelo_preco, respostas_preco)}
    texto = {d.p["codigo"]: d.texto for d in lado}
    if julgar and (candidatos or soltos or pelo_preco):
        perguntas = [(c, rodada) for rodada, (listas, _) in rodadas.items() for c in listas]
        pedidos = [{"produto": texto[c], "candidatos": [m.texto for m in rodadas[rodada][0][c]],
                    **({"rodada": "preco"} if rodada == "preco" else {})} for c, rodada in perguntas]
        try:
            for (c, rodada), resposta in zip(perguntas, julgar(pedidos)):
                rodadas[rodada][1][c] = resposta
        except Exception:  # juiz fora do ar: fica só a regra
            for _, guardadas in rodadas.values():
                guardadas.clear()

    resultado = {"codigos": {}, "duvidas": [], "origem": {}}
    for g in lado:
        codigo = g.p["codigo"]
        confirmado = (confirmados.get(codigo) or {}).get("sim")
        if confirmado and confirmado in por_codigo:
            resultado["codigos"][codigo], resultado["origem"][codigo] = confirmado, "confirmado"
            continue
        da_regra = regra.get(codigo)
        resposta = respostas.get(codigo)
        escolha = prob = None
        if resposta and resposta[1] is not None:
            indice_escolhido, prob = resposta
            escolha = candidatos[codigo][indice_escolhido] if indice_escolhido is not None else None
        if da_regra:
            contestada = resposta and prob is not None and prob >= JEV_CONTESTA and escolha is not da_regra
            if contestada:  # a regra ligou, o juiz discorda com certeza: o administrador decide
                resultado["duvidas"].append({"codigo": codigo, "codigo_para": (escolha or da_regra).p["codigo"], "prob": round(prob, 2)})
            else:
                resultado["codigos"][codigo], resultado["origem"][codigo] = da_regra.p["codigo"], "regra"
        elif escolha is not None and prob >= JEV_ACEITA:
            resultado["codigos"][codigo], resultado["origem"][codigo] = escolha.p["codigo"], "juiz"
        elif escolha is not None and prob >= JEV_DUVIDA:
            resultado["duvidas"].append({"codigo": codigo, "codigo_para": escolha.p["codigo"], "prob": round(prob, 2)})
        else:  # com tipo ou cor diferente, ou pelo preço quase igual: só na lista
            for listas, guardadas in (rodadas["solto"], rodadas["preco"]):
                indice_r, prob_r = guardadas.get(codigo) or (None, None)
                if indice_r is not None and prob_r is not None and prob_r >= JEV_DUVIDA:
                    resultado["duvidas"].append({"codigo": codigo, "codigo_para": listas[codigo][indice_r].p["codigo"],
                                                 "prob": round(prob_r, 2)})
                    break

    if julgar:  # quem continua sem nada: pelo preço de novo, com a faixa afrouxada (só para a lista)
        ja = set(resultado["codigos"]) | {d["codigo"] for d in resultado["duvidas"]}
        afrouxados = {}
        for g in lado:
            codigo = g.p["codigo"]
            if codigo in ja:
                continue
            perto = perto_no_preco(g, set((confirmados.get(codigo) or {}).get("nao") or ()), PRECO_PROXIMO, PRECO_AFROUXADO)
            if perto:
                afrouxados[codigo] = perto
        if afrouxados:
            codigos = list(afrouxados)
            try:
                respostas_afrouxadas = dict(zip(codigos, julgar([
                    {"produto": texto[c], "candidatos": [m.texto for m in afrouxados[c]], "rodada": "preco15"} for c in codigos])))
            except Exception:  # juiz fora do ar: fica o que já havia
                respostas_afrouxadas = {}
            for codigo in codigos:
                indice_r, prob_r = respostas_afrouxadas.get(codigo) or (None, None)
                if indice_r is not None and prob_r is not None and prob_r >= JEV_DUVIDA:
                    resultado["duvidas"].append({"codigo": codigo, "codigo_para": afrouxados[codigo][indice_r].p["codigo"],
                                                 "prob": round(prob_r, 2)})
    return resultado


def vincular_produtos(produtos, outra, lancado=None):
    """Só a regra (sem juiz nem respostas do administrador): {código: código na outra loja}."""
    return cruzar_produtos(produtos, outra, lancado)["codigos"]


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
