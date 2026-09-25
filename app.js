/* Estoque Yêlla Móveis — consulta rápida para vendedores, pensada para celular. */
(() => {
  'use strict';

  const ARQUIVO_LOJAS = 'dados/lojas.json';
  const CHAVE_AJUSTES = 'estoque-yella:ajustes';
  const POR_PAGINA = 30;

  // Buscas rápidas mostradas quando o campo está vazio (só aparecem se houver produto).
  const ATALHOS = ['Colchão', 'Guarda-roupa', 'Cozinha', 'Sofá', 'Cadeira', 'Mesa', 'Fogão', 'Geladeira',
    'Home', 'Rack', 'Cômoda', 'Balcão', 'Cama', 'TV', 'Bicicleta', 'Tapete'];

  // Palavras equivalentes: quem busca uma também encontra a outra.
  const SINONIMOS = [
    ['geladeira', 'refrigerador'],
    ['guarda roupa', 'guardaroupa', 'roupeiro'],
    ['sofa', 'estofado'],
    ['tv', 'televisao', 'televisor'],
    ['lavadora', 'maquina de lavar', 'lava roupas', 'tanquinho'],
    ['micro ondas', 'microondas'],
    ['mesa de cabeceira', 'criado mudo'],
    ['bicicleta', 'bike'],
    ['fone de ouvido', 'headphone', 'headset'],
    ['caixa de som', 'caixa amplificada'],
    ['celular', 'smartphone', 'telefone'],
    ['freezer', 'congelador'],
    ['prancha', 'chapinha'],
    ['sanduicheira', 'misteira'],
  ];

  // Medidas padrão de colchão: quem busca "colchão casal" também acha os de 138 cm.
  const PRODUTO_DE_CAMA = /\b(colchao|colchonete|base|box|cama|bicama|somie|sommier)\b/;
  const TAMANHOS = [
    [/(^|[^0-9])138([^0-9]|$)/, 'casal'],
    [/(^|[^0-9])158([^0-9]|$)/, 'queen casal'],
    [/(^|[^0-9])19[23]([^0-9]|$)/, 'king casal'],
    [/(^|[^0-9])128([^0-9]|$)/, 'viuva'],
    [/(^|[^0-9])[78]8([^0-9]|$)/, 'solteiro'],
  ];

  const IGNORAR = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'com', 'para', 'um', 'uma']);

  const ICONE_FOTO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5.5-5.5L6 20"/></svg>';
  const ICONE_SETA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  const $ = (id) => document.getElementById(id);
  const el = {
    subtitulo: $('subtitulo'), lojas: $('lojas'), painel: $('painel'), form: $('form-busca'), busca: $('busca'),
    limpar: $('limpar'), comissao: $('comissao'), desconto: $('desconto'), aviso: $('aviso'), atalhos: $('atalhos'),
    contagem: $('contagem'), lista: $('lista'), mais: $('mais'), vazio: $('vazio'), fonte: $('fonte'),
  };

  const estado = {
    lojas: [], lojaId: null, loja: null, produtos: [], resultado: [], exibidos: 0,
    consulta: '', comissao: 0, desconto: 0,
  };

  // ---------------------------------------------------------------- utilidades

  const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

  const reais = (centavos) => moeda.format(centavos / 100);
  const percentual = (valor) => numero.format(valor) + '%';

  function normalizar(texto) {
    return String(texto || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function escapar(texto) {
    return String(texto).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function dataBR(iso) {
    if (!iso) return '';
    const [ano, mes, dia] = iso.slice(0, 10).split('-');
    return `${dia}/${mes}/${ano}`;
  }

  // "5", "5,5", "5.5", "10%" -> número entre 0 e 100 (qualquer outra coisa vale 0)
  function lerPercentual(texto) {
    const limpo = String(texto || '').replace('%', '').replace(',', '.').trim();
    if (!limpo) return 0;
    const valor = Number(limpo);
    if (!Number.isFinite(valor) || valor <= 0) return 0;
    return Math.min(valor, 100);
  }

  // Contas em centavos para não acumular erro de arredondamento.
  // O preço mínimo é arredondado para cima: nunca passa do desconto máximo.
  // A comissão é sobre o valor que o cliente paga.
  function calcular(preco, comissao, desconto) {
    const cheio = Math.round(preco * 100);
    const minimo = desconto > 0 ? Math.ceil(cheio * (100 - desconto) / 100 - 1e-7) : cheio;
    return {
      cheio,
      minimo,
      ganhoCheio: Math.round(cheio * comissao / 100),
      ganhoMinimo: Math.round(minimo * comissao / 100),
    };
  }

  // ---------------------------------------------------------------- busca

  function prepararProdutos(produtos) {
    estado.produtos = produtos.map((p, ordem) => {
      const nome = normalizar(p.nome);
      const codigo = String(p.codigo).replace(/^0+/, '');
      let busca = normalizar([p.nome, p.nome_sistema, p.codigo, codigo, p.marca].join(' '));
      const comEspacos = ` ${busca} `;
      for (const grupo of SINONIMOS) {
        if (grupo.some((termo) => comEspacos.includes(` ${termo} `))) busca += ' ' + grupo.join(' ');
      }
      if (PRODUTO_DE_CAMA.test(nome)) {
        for (const [medida, tamanho] of TAMANHOS) if (medida.test(nome)) busca += ' ' + tamanho;
      }
      return Object.assign({}, p, {
        _ordem: ordem,
        _nome: nome,
        _nomeEspaco: ' ' + nome,
        _busca: busca,
        _codigo: codigo,
      });
    });
  }

  function variantes(termo) {
    const lista = [termo];
    if (termo.length > 3) {
      if (termo.endsWith('oes') || termo.endsWith('aes')) lista.push(termo.slice(0, -3) + 'ao');
      if (termo.endsWith('ais')) lista.push(termo.slice(0, -2) + 'l');
      if (termo.endsWith('eis')) lista.push(termo.slice(0, -3) + 'el');
      if (termo.endsWith('res') || termo.endsWith('zes') || termo.endsWith('ses')) lista.push(termo.slice(0, -2));
      if (termo.endsWith('s')) lista.push(termo.slice(0, -1));
    }
    return lista;
  }

  // Número digitado só vale como número inteiro: "5" acha "5 Bocas", mas não o 5 do código "04957".
  function testeDoTermo(termo) {
    if (/^\d+$/.test(termo)) {
      const inteiro = new RegExp(`(^|[^0-9])${termo}([^0-9]|$)`);
      return (texto) => inteiro.test(texto);
    }
    return (texto) => texto.includes(termo);
  }

  function pontosDoTermo(p, opcoes) {
    let melhor = 0;
    for (const { termo, acha } of opcoes) {
      if (/^\d+$/.test(termo)) {
        if (acha(p._nome)) return 3;
        if (acha(p._busca)) melhor = Math.max(melhor, 1);
      } else if (p._nomeEspaco.includes(' ' + termo)) {
        return 3;                                               // começo de palavra do nome
      } else if (p._nome.includes(termo)) {
        melhor = Math.max(melhor, 2);                           // parte do nome
      } else if (p._busca.includes(termo)) {
        melhor = Math.max(melhor, 1);                           // nome no sistema, código, marca
      }
    }
    return melhor;
  }

  function buscar(consulta) {
    const termos = normalizar(consulta).split(' ').filter((t) => t && !IGNORAR.has(t));
    if (!termos.length) return estado.produtos.slice();

    const limpa = String(consulta).trim();
    const codigo = /^\d+$/.test(limpa) ? limpa.replace(/^0+/, '') : null;
    const alternativas = termos.map((t) => variantes(t).map((v) => ({ termo: v, acha: testeDoTermo(v) })));
    const primeiras = alternativas[0].map((a) => a.termo);
    const achados = [];

    for (const p of estado.produtos) {
      let pontos = 0;
      let todos = true;
      for (const opcoes of alternativas) {
        const melhor = pontosDoTermo(p, opcoes);
        if (!melhor) { todos = false; break; }
        pontos += melhor;
      }
      let bonusCodigo = 0;
      if (codigo) {
        if (p._codigo === codigo) bonusCodigo = 1000;
        else if (codigo.length >= 3 && p._codigo.startsWith(codigo)) bonusCodigo = 100;
      }
      if (!todos && !bonusCodigo) continue;
      pontos += bonusCodigo;
      if (primeiras.some((v) => p._nome.startsWith(v))) pontos += 3; // a 1ª palavra buscada costuma ser o tipo do produto
      achados.push({ p, pontos });
    }
    achados.sort((a, b) => b.pontos - a.pontos || a.p._ordem - b.p._ordem);
    return achados.map((a) => a.p);
  }

  // ---------------------------------------------------------------- desenho da tela

  function linkFoto(p) {
    const termos = p.marca ? `${p.nome} ${p.marca}` : p.nome;
    return 'https://www.google.com/search?udm=2&q=' + encodeURIComponent(termos); // udm=2: aba Imagens
  }

  function precosHTML(p) {
    const conta = calcular(p.preco, estado.comissao, estado.desconto);
    const ganho = (centavos) => (estado.comissao > 0
      ? `<span class="ganho">Você ganha <b>${reais(centavos)}</b></span>` : '');
    let html = `<div class="linha-preco cheio"><span class="rotulo">Preço</span>`
      + `<strong class="valor">${reais(conta.cheio)}</strong>${ganho(conta.ganhoCheio)}</div>`;
    if (estado.desconto > 0) {
      html += `<div class="linha-preco minimo"><span class="rotulo">Pode chegar até <em>(−${percentual(estado.desconto)})</em></span>`
        + `<strong class="valor">${reais(conta.minimo)}</strong>${ganho(conta.ganhoMinimo)}</div>`;
    }
    return html;
  }

  function estoqueHTML(q) {
    if (q === 1) return '<span class="estoque ultima">Só 1 em estoque</span>';
    return `<span class="estoque">${numero.format(q)} em estoque</span>`;
  }

  function cartaoHTML(p) {
    const id = 'detalhes-' + p.codigo;
    const unidades = p.quantidade === 1 ? '1 unidade' : `${numero.format(p.quantidade)} unidades`;
    return `<li class="card" data-codigo="${escapar(p.codigo)}">
  <h2 class="nome">${escapar(p.nome)}</h2>
  <p class="meta"><span class="codigo">Cód. ${escapar(p.codigo)}</span>${estoqueHTML(p.quantidade)}</p>
  <div class="precos">${precosHTML(p)}</div>
  <div class="acoes">
    <a class="botao-foto" href="${escapar(linkFoto(p))}" target="_blank" rel="noopener noreferrer"
       aria-label="Ver foto de ${escapar(p.nome)} na internet">${ICONE_FOTO}Ver foto</a>
    <button type="button" class="botao-detalhes" aria-expanded="false" aria-controls="${id}"><span class="texto-detalhes">Detalhes</span>${ICONE_SETA}</button>
  </div>
  <dl class="detalhes" id="${id}" hidden>
    <dt>Código</dt><dd>${escapar(p.codigo)}</dd>
    <dt>Em estoque</dt><dd>${unidades}</dd>
    <dt>Fornecedor</dt><dd>${escapar(p.fornecedor || 'Não informado')}</dd>
    <dt>Última compra</dt><dd>${p.ultima_compra ? dataBR(p.ultima_compra) : 'Não informada'}</dd>
    <dt>Última venda</dt><dd>${p.ultima_venda ? dataBR(p.ultima_venda) : 'Nenhuma venda registrada'}</dd>
    <dt>Nome no sistema</dt><dd class="sistema">${escapar(p.nome_sistema)}</dd>
  </dl>
</li>`;
  }

  function mostrarMais() {
    const proximos = estado.resultado.slice(estado.exibidos, estado.exibidos + POR_PAGINA);
    if (proximos.length) el.lista.insertAdjacentHTML('beforeend', proximos.map(cartaoHTML).join(''));
    estado.exibidos += proximos.length;
    const restantes = estado.resultado.length - estado.exibidos;
    el.mais.hidden = restantes <= 0;
    el.mais.textContent = `Mostrar mais produtos (${numero.format(restantes)} ${restantes === 1 ? 'restante' : 'restantes'})`;
  }

  function atualizarContagem() {
    const total = estado.resultado.length;
    const consulta = estado.consulta.trim();
    const n = `<strong>${numero.format(total)}</strong>`;
    if (!consulta) {
      el.contagem.innerHTML = `${n} ${total === 1 ? 'produto' : 'produtos'} na loja de ${escapar(estado.loja.nome)}`;
    } else if (!total) {
      el.contagem.innerHTML = `Nenhum produto encontrado para “${escapar(consulta)}”`;
    } else {
      el.contagem.innerHTML = `${n} ${total === 1 ? 'produto encontrado' : 'produtos encontrados'} para “${escapar(consulta)}”`;
    }
  }

  function atualizarLista() {
    estado.resultado = buscar(estado.consulta);
    estado.exibidos = 0;
    el.lista.innerHTML = '';
    mostrarMais();
    atualizarContagem();
    el.vazio.hidden = estado.resultado.length > 0;
    el.atalhos.hidden = estado.consulta.trim() !== '' || !el.atalhos.children.length;
    carregarSePerto();
  }

  // Leva o começo da lista para logo abaixo do painel fixo, se o usuário tiver rolado para baixo.
  function voltarAoTopoDaLista() {
    const alvo = el.contagem.getBoundingClientRect().top + window.scrollY - el.painel.offsetHeight - 8;
    if (window.scrollY > alvo) window.scrollTo(0, Math.max(0, alvo));
  }

  // Só redesenha os preços: não fecha os detalhes que a pessoa abriu.
  function atualizarPrecos() {
    const porCodigo = new Map(estado.resultado.slice(0, estado.exibidos).map((p) => [p.codigo, p]));
    for (const card of el.lista.children) {
      const p = porCodigo.get(card.dataset.codigo);
      const precos = card.querySelector('.precos');
      if (!p || !precos) continue;
      precos.innerHTML = precosHTML(p);
    }
  }

  function montarAtalhos() {
    el.atalhos.innerHTML = ATALHOS.map((termo) => {
      const total = buscar(termo).length;
      return total ? `<button type="button" class="atalho" data-busca="${escapar(termo)}">${escapar(termo)}<span>${total}</span></button>` : '';
    }).join('');
  }

  function montarSeletorLojas() {
    if (estado.lojas.length < 2) {
      el.lojas.hidden = true;
      el.lojas.innerHTML = '';
      return;
    }
    el.lojas.hidden = false;
    el.lojas.innerHTML = estado.lojas.map((loja) => (
      `<button type="button" data-loja="${escapar(loja.id)}" aria-pressed="${loja.id === estado.lojaId}">${escapar(loja.nome)}</button>`
    )).join('');
  }

  function atualizarCabecalho() {
    const loja = estado.loja;
    const quando = loja.gerado_em
      ? ` · estoque de ${dataBR(loja.gerado_em)} às ${loja.gerado_em.slice(11, 16)}` : '';
    el.subtitulo.textContent = `Loja de ${loja.nome}${quando}`;
    document.title = `Estoque ${loja.nome} · Yêlla Móveis`;
    el.fonte.textContent = `Dados do sistema da loja de ${loja.nome}`
      + (loja.gerado_em ? `, gerados em ${dataBR(loja.gerado_em)} às ${loja.gerado_em.slice(11, 16)}` : '')
      + ` · ${numero.format(loja.total_produtos)} produtos · ${numero.format(loja.total_unidades)} unidades em estoque.`;
  }

  function mostrarAviso(texto) {
    el.aviso.textContent = texto;
    el.aviso.hidden = !texto;
  }

  // ---------------------------------------------------------------- ajustes salvos no aparelho

  function lerAjustes() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_AJUSTES)) || {};
    } catch (e) {
      return {};
    }
  }

  function salvarAjustes() {
    try {
      localStorage.setItem(CHAVE_AJUSTES, JSON.stringify({
        comissao: el.comissao.value.trim(),
        desconto: el.desconto.value.trim(),
        loja: estado.lojaId,
      }));
    } catch (e) { /* navegador sem armazenamento: segue funcionando sem salvar */ }
  }

  function formatarCampo(campo) {
    const valor = lerPercentual(campo.value);
    campo.value = valor > 0 ? numero.format(valor) : '';
  }

  function aoMudarAjuste() {
    estado.comissao = lerPercentual(el.comissao.value);
    estado.desconto = lerPercentual(el.desconto.value);
    atualizarPrecos();
    salvarAjustes();
  }

  // ---------------------------------------------------------------- carregamento

  async function buscarJSON(caminho) {
    const resposta = await fetch(caminho, { cache: 'no-cache' });
    if (!resposta.ok) throw new Error(`${caminho}: HTTP ${resposta.status}`);
    return resposta.json();
  }

  async function carregarLoja(id) {
    const loja = estado.lojas.find((l) => l.id === id) || estado.lojas[0];
    el.contagem.textContent = 'Carregando produtos…';
    try {
      estado.loja = await buscarJSON(loja.arquivo);
    } catch (erro) {
      mostrarAviso('Não foi possível carregar os produtos. Confira a internet e recarregue a página.');
      el.contagem.textContent = '';
      return;
    }
    estado.lojaId = loja.id;
    prepararProdutos(estado.loja.produtos);
    montarSeletorLojas();
    atualizarCabecalho();
    montarAtalhos();
    atualizarLista();
    salvarAjustes();
  }

  async function iniciar() {
    const salvos = lerAjustes();
    el.comissao.value = salvos.comissao || '';
    el.desconto.value = salvos.desconto || '';
    formatarCampo(el.comissao);
    formatarCampo(el.desconto);
    estado.comissao = lerPercentual(el.comissao.value);
    estado.desconto = lerPercentual(el.desconto.value);

    try {
      estado.lojas = (await buscarJSON(ARQUIVO_LOJAS)).lojas || [];
    } catch (erro) {
      estado.lojas = [];
    }
    if (!estado.lojas.length) {
      mostrarAviso('Não foi possível carregar o estoque. Confira a internet e recarregue a página.');
      el.contagem.textContent = '';
      return;
    }
    const salva = estado.lojas.some((l) => l.id === salvos.loja) ? salvos.loja : estado.lojas[0].id;
    await carregarLoja(salva);
  }

  // ---------------------------------------------------------------- eventos

  let esperaBusca = 0;
  el.busca.addEventListener('input', () => {
    el.limpar.hidden = !el.busca.value;
    clearTimeout(esperaBusca);
    esperaBusca = setTimeout(() => {
      estado.consulta = el.busca.value;
      atualizarLista();
      voltarAoTopoDaLista();
    }, 120);
  });

  el.form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    clearTimeout(esperaBusca);
    estado.consulta = el.busca.value;
    atualizarLista();
    el.busca.blur(); // fecha o teclado para mostrar os resultados
    voltarAoTopoDaLista();
  });

  el.limpar.addEventListener('click', () => {
    clearTimeout(esperaBusca);
    el.busca.value = '';
    el.limpar.hidden = true;
    estado.consulta = '';
    atualizarLista();
    voltarAoTopoDaLista();
    el.busca.focus();
  });

  for (const campo of [el.comissao, el.desconto]) {
    campo.addEventListener('input', aoMudarAjuste);
    campo.addEventListener('blur', () => { formatarCampo(campo); aoMudarAjuste(); });
    campo.addEventListener('keydown', (evento) => { if (evento.key === 'Enter') campo.blur(); });
    // seleciona o valor ao tocar, para a pessoa digitar o novo percentual por cima
    campo.addEventListener('focus', () => setTimeout(() => campo.setSelectionRange(0, campo.value.length), 0));
  }

  el.atalhos.addEventListener('click', (evento) => {
    const botao = evento.target.closest('.atalho');
    if (!botao) return;
    el.busca.value = botao.dataset.busca;
    el.limpar.hidden = false;
    estado.consulta = botao.dataset.busca;
    atualizarLista();
    voltarAoTopoDaLista();
  });

  el.lojas.addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-loja]');
    if (botao && botao.dataset.loja !== estado.lojaId) carregarLoja(botao.dataset.loja);
  });

  el.lista.addEventListener('click', (evento) => {
    const botao = evento.target.closest('.botao-detalhes');
    if (!botao) return;
    const detalhes = document.getElementById(botao.getAttribute('aria-controls'));
    const abrir = botao.getAttribute('aria-expanded') !== 'true';
    botao.setAttribute('aria-expanded', String(abrir));
    detalhes.hidden = !abrir;
  });

  el.mais.addEventListener('click', mostrarMais);

  // Carrega mais produtos sozinho quando a pessoa rola perto do fim da lista
  // (o botão "Mostrar mais" continua lá para quem preferir tocar).
  function carregarSePerto() {
    let voltas = 0;
    while (!el.mais.hidden && voltas < 20 && el.mais.getBoundingClientRect().top < window.innerHeight + 800) {
      mostrarMais();
      voltas += 1;
    }
  }
  window.addEventListener('scroll', carregarSePerto, { passive: true });
  window.addEventListener('resize', carregarSePerto);

  function avisoConexao() {
    mostrarAviso(navigator.onLine ? '' : 'Você está sem internet. Mostrando o último estoque salvo neste aparelho.');
  }
  window.addEventListener('online', avisoConexao);
  window.addEventListener('offline', avisoConexao);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  iniciar().then(() => { if (!navigator.onLine) avisoConexao(); });

  // Exposto só para conferência no console do navegador.
  window.__estoque = { calcular, buscar, lerPercentual, normalizar, estado };
})();
