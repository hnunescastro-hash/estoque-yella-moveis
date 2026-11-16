# Comando de partida do servico no Cloud Run. O servidor/implantar.sh o passa ao servico como
# /bin/sh -c "<as linhas sem #>"; ele nao roda dentro do repositorio.
#
# Abre o pacote de chaves (PACOTE_DE_SEGREDOS, um JSON {"NOME": "valor"} guardado
# no segredo estoque-yella-segredos) em variaveis de ambiente e so entao inicia o servidor,
# como o CMD do Dockerfile. Pacote faltando ou invalido: o container nao sobe, e o
# Cloud Run mantem a revisao anterior no ar.
#
# Mudou o CMD do Dockerfile? Mude tambem o fim da ultima linha (depois do exec):
# o comando de partida do servico passa por cima do CMD da imagem.
segredos="$(python3 -c 'import json,os,re,sys
p=json.loads(os.environ["PACOTE_DE_SEGREDOS"])
for k,v in p.items():
    if not re.fullmatch("[A-Za-z_][A-Za-z0-9_]*",k) or not isinstance(v,str): sys.exit(3)
    sys.stdout.write("export %s=\x27%s\x27\n" % (k, v.replace("\x27","\x27\\\x27\x27")))
')" || exit 1; eval "$segredos" || exit 1; unset segredos PACOTE_DE_SEGREDOS; exec gunicorn --bind :$PORT --workers 1 --threads 4 --timeout 180 app:app
