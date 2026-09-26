#!/usr/bin/env python3
"""Relatório de vendas do CompuFour ("Relatório de vendas - Notas fiscais Série 1").

O administrador exporta dois relatórios por loja, um das vendas à vista e outro das vendas a prazo,
com as colunas Nota, Data, Código, Descrição do item, Quantidade, Vendido por e Custo compra.
"Vendido por" e "Custo compra" já vêm multiplicados pela quantidade (são o total da linha).

Aqui o relatório é lido, conferido com o total do rodapé e juntado ao que já estava guardado.
Cada relatório vale para o período que cobre (do primeiro ao último dia com venda): as linhas do
mesmo tipo nesse período são trocadas pelas do relatório. Dá para mandar o histórico inteiro de
uma vez ou só o último mês, reenviar não duplica e venda cancelada no sistema some.

Faturamento e custo nunca vão para o site: ficam no armazenamento privado do servidor
(servidor/app.py), só para o administrador. Para o site vão só os produtos que saíram nos últimos
12 meses, do que mais vendeu para o que menos, com a quantidade vendida de cada um
(dados/mais-vendidos.json), sem valores.

Conferir relatórios no terminal (não envia nada):
  python3 ferramentas/vendas.py "Relatório de vendas a vista - Matina.html" "Relatório de vendas a Prazo - Matina.html"
"""

import re
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import atualizar_estoque as ae

COLUNAS = ["Nota", "Data", "Código", "Descrição do item", "Quantidade", "Vendido por", "Custo compra"]
NATUREZAS = {"venda a prazo": "p", "venda a vista": "v", "venda a vista (cheque)": "v"}  # rodapé "Nat.Operação"
TIPOS = {"v": "à vista", "p": "a prazo"}
DIAS_MAIS_VENDIDOS = 365   # "Mais vendidos": quantidade vendida nesse prazo, até a última venda do relatório
LIMITE_MAIS_VENDIDOS = 1000  # todos os vendidos: a página mostra os 100 primeiros que estão em estoque

# Cada linha guardada: [data "AAAA-MM-DD", nota, código, quantidade, valor, custo, tipo "v"/"p"],
# com valor e custo em centavos (total da linha).
DATA, NOTA, CODIGO, QUANTIDADE, VALOR, CUSTO, TIPO = range(7)


def _centavos(texto):
    valor = ae.numero_br(texto)
    return round(valor * 100) if valor is not None else 0


def ler_relatorio(conteudo):
    """Bytes do HTML exportado -> {"tipo", "de", "ate", "linhas", "descricoes", "valor", "custo", "quantidade"}.
    Recusa (ae.ErroRelatorio) o que não é o relatório de vendas, relatório incompleto (a soma não
    bate com o total do rodapé) e relatório que mistura vendas à vista e a prazo."""
    texto = ae.decodificar(conteudo)
    cabecalho, rodape = False, None
    linhas, descricoes, naturezas = [], {}, set()
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", texto, re.S | re.I):
        c = [ae.limpar_celula(x) for x in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S | re.I)]
        if c == COLUNAS:
            cabecalho = True
        elif len(c) == 7 and re.fullmatch(r"\d{2}/\d{2}/\d{4}", c[1]):
            dia = ae.data_br(c[1])
            quantidade = ae.numero_br(c[4]) or 0
            linhas.append([dia, c[0], c[2], int(quantidade) if quantidade == int(quantidade) else quantidade,
                           _centavos(c[5]), _centavos(c[6])])
            if c[3] and dia >= descricoes.get(c[2], ("",))[0]:  # a descrição mais recente de cada código
                descricoes[c[2]] = (dia, c[3])
        elif len(c) == 7 and not any(c[:4]) and c[4]:  # linha do total, sem nota nem data
            rodape = (ae.numero_br(c[4]), _centavos(c[5]), _centavos(c[6]))
        elif len(c) == 3 and c[0] and c[0] != "Nat.Operação":
            naturezas.add(ae.sem_acento(c[0]).lower())

    if not cabecalho:
        raise ae.ErroRelatorio("Este arquivo não é o relatório de vendas do sistema (colunas Nota, Data, Código, "
                               "Descrição do item, Quantidade, Vendido por e Custo compra).")
    if not linhas:
        raise ae.ErroRelatorio("O relatório de vendas não tem nenhuma venda.")
    valor, custo = sum(l[VALOR] for l in linhas), sum(l[CUSTO] for l in linhas)
    quantidade = sum(l[QUANTIDADE] for l in linhas)
    folga = 10 + len(linhas) // 500  # centavos: o sistema arredonda o total do rodapé
    if (rodape is None or abs(quantidade - rodape[0]) > 0.001
            or abs(valor - rodape[1]) > folga or abs(custo - rodape[2]) > folga):
        raise ae.ErroRelatorio("A soma das vendas não bate com o total no fim do relatório: o arquivo pode "
                               "estar incompleto. Exporte de novo.")
    tipos = {NATUREZAS.get(n) for n in naturezas}
    if len(tipos) != 1 or None in tipos:
        raise ae.ErroRelatorio("Não deu para saber se o relatório é das vendas à vista ou a prazo. "
                               "Exporte um relatório para cada (à vista e a prazo).")
    tipo = tipos.pop()
    for l in linhas:
        l.append(tipo)
    datas = [l[DATA] for l in linhas]
    return {"tipo": tipo, "de": min(datas), "ate": max(datas), "linhas": linhas,
            "descricoes": {codigo: list(par) for codigo, par in descricoes.items()},
            "valor": valor, "custo": custo, "quantidade": quantidade}


def juntar(guardado, relatorio):
    """Junta um relatório ao guardado: no período que o relatório cobre, as linhas do mesmo tipo
    saem e entram as dele."""
    guardado = dict(guardado or {})
    tipo, de, ate = relatorio["tipo"], relatorio["de"], relatorio["ate"]
    linhas = [l for l in guardado.get("linhas", []) if not (l[TIPO] == tipo and de <= l[DATA] <= ate)]
    linhas += relatorio["linhas"]
    linhas.sort(key=lambda l: (l[DATA], l[NOTA], l[CODIGO]))
    descricoes = dict(guardado.get("descricoes", {}))
    for codigo, (dia, texto) in relatorio["descricoes"].items():
        if dia >= descricoes.get(codigo, [""])[0]:
            descricoes[codigo] = [dia, texto]
    guardado.update(linhas=linhas, descricoes=descricoes)
    return guardado


def nomes_dos_produtos(descricoes, nomes_no_site, correcoes):
    """Nome de cada código vendido: o do site (estoque ou sem estoque), senão o revisado no
    correcoes.json, senão o arrumado automaticamente a partir da descrição do sistema."""
    revisados = (correcoes or {}).get("produtos", {})
    return {codigo: nomes_no_site.get(codigo) or revisados.get(ae.chave(texto)) or ae.corrigir_automatico(texto)
            for codigo, (_, texto) in descricoes.items()}


def mais_vendidos(linhas, dias=DIAS_MAIS_VENDIDOS, limite=LIMITE_MAIS_VENDIDOS):
    """Códigos dos produtos que mais saíram (quantidade; no empate, o faturamento) nos últimos
    `dias` até a última venda, com a quantidade vendida de cada um. É o que vai para o site (sem valores)."""
    if not linhas:
        return {"de": None, "ate": None, "codigos": [], "quantidades": []}
    ate = max(l[DATA] for l in linhas)
    de = (date.fromisoformat(ate) - timedelta(days=dias - 1)).isoformat()
    quantidade, valor = Counter(), Counter()
    for l in linhas:
        if l[DATA] >= de:
            quantidade[l[CODIGO]] += l[QUANTIDADE]
            valor[l[CODIGO]] += l[VALOR]
    codigos = sorted(quantidade, key=lambda c: (-quantidade[c], -valor[c], c))[:limite]
    return {"de": de, "ate": ate, "codigos": codigos, "quantidades": [quantidade[c] for c in codigos]}


def resumo(relatorio):
    """O que foi lido, para mostrar a quem enviou (e guardar no histórico de envios)."""
    return {"tipo": relatorio["tipo"], "de": relatorio["de"], "ate": relatorio["ate"],
            "itens": len(relatorio["linhas"]), "valor": relatorio["valor"]}


def main():
    if len(sys.argv) < 2:
        raise ae.ErroRelatorio(__doc__.split("Conferir relatórios")[1].strip())
    br = lambda iso: "/".join(reversed(iso.split("-")))  # noqa: E731
    guardado = None
    for caminho in sys.argv[1:]:
        if not Path(caminho).is_file():
            raise ae.ErroRelatorio(f"Arquivo não encontrado: {caminho}")
        relatorio = ler_relatorio(Path(caminho).read_bytes())
        guardado = juntar(guardado, relatorio)
        print(f"{Path(caminho).name}: vendas {TIPOS[relatorio['tipo']]} de {br(relatorio['de'])} a "
              f"{br(relatorio['ate'])}, {len(relatorio['linhas'])} itens (confere com o total do relatório)")
    ranking = mais_vendidos(guardado["linhas"])
    descricoes = guardado["descricoes"]
    print(f"\nMais vendidos de {br(ranking['de'])} a {br(ranking['ate'])} "
          f"(os 10 primeiros de {len(ranking['codigos'])}):")
    for i, (codigo, vendidos) in enumerate(zip(ranking["codigos"][:10], ranking["quantidades"]), 1):
        print(f"  {i:2d}. {codigo}  {vendidos:>3} vendidos  {descricoes.get(codigo, ['', ''])[1]}")


if __name__ == "__main__":
    main()
