#!/usr/bin/env python3
"""Atualiza o estoque de uma loja a partir do relatório HTML do CompuFour.

Uso (rodar na pasta do projeto):
    python3 ferramentas/atualizar_estoque.py matina "YÊLLA MÓVEIS - CONTROLE DE ESTOQUE.html"
    python3 ferramentas/atualizar_estoque.py igapora "relatorio-igapora.html" --nome "Igaporã"

O que o script faz:
  1. Lê o relatório "Controle de estoque" exportado pelo CompuFour (Aplicativos Comerciais).
  2. Troca cada descrição do sistema pelo nome revisado em ferramentas/correcoes.json.
     Produto que ainda não foi revisado recebe uma correção automática (abreviações comuns
     e acentos) e é listado no final como "revisar".
  3. Grava dados/<loja>.json e registra a loja em dados/lojas.json.

Só usa a biblioteca padrão do Python.
"""

import argparse
import html
import json
import re
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARQ_CORRECOES = RAIZ / "ferramentas" / "correcoes.json"
PASTA_DADOS = RAIZ / "dados"
ARQ_LOJAS = PASTA_DADOS / "lojas.json"

MESES = {
    "janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
}

# Cabeçalho do relatório -> campo do JSON (comparado sem acento e em minúsculas)
COLUNAS = {
    "codigo": "codigo",
    "descricao": "descricao",
    "fornecedor preferencial": "fornecedor",
    "preco em r$": "preco",
    "quantidade": "quantidade",
    "ult.compra": "ultima_compra",
    "ult.venda": "ultima_venda",
}
OBRIGATORIAS = {"codigo", "descricao", "preco", "quantidade"}


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
        raise SystemExit(f"Arquivo não encontrado: {caminho}")
    dados = Path(caminho).read_bytes()
    charset = re.search(rb'charset=["\']?([\w-]+)', dados[:2000], re.I)
    codificacoes = [charset.group(1).decode("ascii")] if charset else []
    codificacoes += ["cp1252", "utf-8"]
    for cod in codificacoes:
        try:
            return dados.decode(cod)
        except (LookupError, UnicodeDecodeError):
            continue
    raise SystemExit("Não consegui ler o arquivo: codificação desconhecida.")


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
        raise SystemExit("Não encontrei o cabeçalho da tabela. Esse arquivo é o relatório de estoque do CompuFour?")
    titulos = [sem_acento(limpar_celula(t)).lower() for t in re.findall(r"<th[^>]*>(.*?)</th>", cabecalho.group(1), re.S | re.I)]
    indices = {}
    for i, titulo in enumerate(titulos):
        if titulo in COLUNAS:
            indices[COLUNAS[titulo]] = i
    faltando = OBRIGATORIAS - set(indices)
    if faltando:
        raise SystemExit(f"Colunas obrigatórias ausentes no relatório: {', '.join(sorted(faltando))}. Colunas lidas: {titulos}")

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
    return linhas, total_relatorio, gerado_em, cidade, int(registros.group(1)) if registros else None


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


def main():
    ap = argparse.ArgumentParser(description="Atualiza dados/<loja>.json a partir do relatório do CompuFour.")
    ap.add_argument("loja", help="identificador da loja, sem acento e sem espaço (ex.: matina, igapora)")
    ap.add_argument("relatorio", help="arquivo .html exportado pelo CompuFour")
    ap.add_argument("--nome", help="nome da loja como aparece na página (padrão: cidade do relatório)")
    args = ap.parse_args()

    if not re.fullmatch(r"[a-z0-9-]+", args.loja):
        raise SystemExit("O identificador da loja deve ter só letras minúsculas sem acento, números ou hífen (ex.: igapora).")

    correcoes = json.loads(ARQ_CORRECOES.read_text(encoding="utf-8"))
    linhas, total_relatorio, gerado_em, cidade, registros = extrair(ler_relatorio(args.relatorio))
    if not linhas:
        raise SystemExit("Nenhum produto encontrado no relatório.")

    produtos = []
    revisar = []
    for linha in linhas:
        descricao = " ".join(linha["descricao"].split())
        nome = correcoes["produtos"].get(chave(descricao))
        if not nome:
            nome = corrigir_automatico(descricao)
            revisar.append((linha["codigo"], descricao, nome))
        fornecedor_original = linha.get("fornecedor") or ""
        fornecedor = correcoes["fornecedores"].get(chave(fornecedor_original)) or fornecedor_automatico(fornecedor_original)
        marca = correcoes["marcas"].get(chave(fornecedor_original))
        produto = {
            "codigo": linha["codigo"],
            "nome": nome,
            "nome_sistema": descricao,
            "fornecedor": fornecedor,
            "preco": numero_br(linha["preco"]),
            "quantidade": formatar_quantidade(numero_br(linha["quantidade"])),
            "ultima_compra": data_br(linha.get("ultima_compra") or ""),
            "ultima_venda": data_br(linha.get("ultima_venda") or ""),
        }
        if marca and not contem(nome, marca):
            produto["marca"] = marca
        produtos.append(produto)

    produtos.sort(key=lambda p: (sem_acento(p["nome"]).lower(), p["codigo"]))
    total_unidades = sum(p["quantidade"] or 0 for p in produtos)
    nome_loja = args.nome or cidade or args.loja.capitalize()

    avisos = []
    if registros is not None and registros != len(produtos):
        avisos.append(f"o relatório diz {registros} registros, mas li {len(produtos)} produtos")
    if total_relatorio is not None and abs(total_relatorio - total_unidades) > 0.001:
        avisos.append(f"o total de unidades do relatório é {total_relatorio}, mas a soma lida é {total_unidades}")
    codigos = [p["codigo"] for p in produtos]
    if len(set(codigos)) != len(codigos):
        avisos.append("há códigos de produto repetidos no relatório")

    saida = {
        "loja": args.loja,
        "nome": nome_loja,
        "gerado_em": gerado_em.isoformat() if gerado_em else None,
        "total_produtos": len(produtos),
        "total_unidades": formatar_quantidade(total_unidades),
        "produtos": produtos,
    }
    PASTA_DADOS.mkdir(exist_ok=True)
    destino = PASTA_DADOS / f"{args.loja}.json"
    destino.write_text(json.dumps(saida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    lojas = {"lojas": []}
    if ARQ_LOJAS.exists():
        lojas = json.loads(ARQ_LOJAS.read_text(encoding="utf-8"))
    registro = {"id": args.loja, "nome": nome_loja, "arquivo": f"dados/{args.loja}.json"}
    for i, loja in enumerate(lojas["lojas"]):
        if loja["id"] == args.loja:
            lojas["lojas"][i] = registro
            break
    else:
        lojas["lojas"].append(registro)
    ARQ_LOJAS.write_text(json.dumps(lojas, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(f"Loja: {nome_loja} ({args.loja})")
    print(f"Relatório gerado em: {gerado_em.strftime('%d/%m/%Y %H:%M') if gerado_em else 'não encontrado'}")
    print(f"Produtos: {len(produtos)}  |  Unidades em estoque: {formatar_quantidade(total_unidades)}")
    print(f"Arquivo gravado: {destino.relative_to(RAIZ)}")
    if revisar:
        print(f"\n{len(revisar)} produto(s) sem nome revisado (correção automática aplicada, confira):")
        for codigo, original, nome in revisar:
            print(f"  {codigo}  {original}\n         -> {nome}")
    else:
        print("Todos os nomes vieram da lista revisada.")
    for aviso in avisos:
        print(f"ATENÇÃO: {aviso}")
    return 1 if avisos else 0


if __name__ == "__main__":
    sys.exit(main())
