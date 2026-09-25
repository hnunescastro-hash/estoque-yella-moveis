FROM python:3.12-slim

# git e ssh: o servidor publica os dados novos no repositório do site
RUN apt-get update \
 && apt-get install -y --no-install-recommends git openssh-client \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# atualizar_estoque.py é copiado de ferramentas/ pelo implantar.sh: o mesmo código do comando de terminal
COPY app.py atualizar_estoque.py ./

ENV PYTHONUNBUFFERED=1
CMD exec gunicorn --bind :$PORT --workers 1 --threads 4 --timeout 180 app:app
