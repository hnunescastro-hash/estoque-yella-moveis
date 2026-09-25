/* Estoque Yêlla Móveis — consulta rápida para vendedores, pensada para celular. */
(() => {
  'use strict';

  const ARQUIVO_LOJAS = 'dados/lojas.json';
  const CHAVE_AJUSTES = 'estoque-yella:ajustes';
  const CHAVE_ANUNCIADOS = 'estoque-yella:anunciados';
  const POR_PAGINA = 40;
  const TODAS = 'todas'; // opção "Todas as lojas": junta o estoque de todas

  // ---------------------------------------------------------------- ícones
  // Desenhados para 24x24, só com traço: a cor vem do texto em volta.
  const ICONES = {
    colchao: '<rect x="2.5" y="10" width="19" height="7.5" rx="1.8"/><path d="M4.5 10V8.6c0-.8.7-1.5 1.5-1.5h12c.8 0 1.5.7 1.5 1.5V10"/><path d="m6 14.8 1.5-1.8 1.5 1.8 1.5-1.8 1.5 1.8 1.5-1.8 1.5 1.8 1.5-1.8 1.5 1.8"/>',
    guardaRoupa: '<rect x="4.5" y="2.5" width="15" height="17" rx="1.5"/><path d="M12 2.5v17M10 9.5V12M14 9.5V12M6.5 19.5v2M17.5 19.5v2"/>',
    cozinha: '<rect x="3" y="3" width="18" height="5.5" rx="1"/><path d="M12 3v5.5M2 12.5h20M3.5 12.5V21h17v-8.5M9.5 12.5V21M14.5 12.5V21"/>',
    sofa: '<path d="M5 11V7.8A2.8 2.8 0 0 1 7.8 5h8.4A2.8 2.8 0 0 1 19 7.8V11"/><path d="M3 11.8a1.6 1.6 0 0 1 3.2 0V13h11.6v-1.2a1.6 1.6 0 0 1 3.2 0V17a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M5 18v2M19 18v2"/>',
    cadeira: '<rect x="7" y="2.5" width="10" height="8.5" rx="1.6"/><rect x="5" y="12" width="14" height="2.6" rx="1"/><path d="M7 14.6v6.9M17 14.6v6.9M9 11v1M15 11v1"/>',
    mesa: '<rect x="2.5" y="6.5" width="19" height="3.2" rx="1"/><path d="M5 9.7V20M19 9.7V20M5 14.5h14"/>',
    fogao: '<rect x="4" y="2.5" width="16" height="19" rx="2"/><circle cx="9" cy="7" r="1.7"/><circle cx="15" cy="7" r="1.7"/><path d="M4 11h16"/><rect x="7.5" y="14" width="9" height="4.5" rx="1"/>',
    geladeira: '<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M6 9.5h12M9 5.2v2M9 12v4"/>',
    home: '<rect x="2.5" y="3.5" width="19" height="17" rx="1.2"/><path d="M7 3.5v17M17 3.5v17M2.5 9h4.5M17 9h4.5M2.5 14.5h4.5M17 14.5h4.5M7 16h10"/><rect x="8.8" y="6.5" width="6.4" height="5" rx=".6"/>',
    rack: '<rect x="6" y="3" width="12" height="7.5" rx="1"/><path d="M12 10.5V13"/><rect x="2.5" y="13" width="19" height="6" rx="1"/><path d="M12 13v6M4.5 19v2M19.5 19v2"/>',
    comoda: '<rect x="4" y="3.5" width="16" height="15.5" rx="1.5"/><path d="M4 8.7h16M4 13.8h16M11 6.1h2M11 11.2h2M11 16.4h2M6 19v2M18 19v2"/>',
    balcao: '<path d="M2 10h20M3.5 10v11h17V10M3.5 13.5h17M12 13.5V21M10 16.5V18M14 16.5V18"/><path d="M14.5 10V6.8a2 2 0 0 1 4 0"/>',
    cama: '<path d="M3 4.5V20M3 12.5h15.5A2.5 2.5 0 0 1 21 15v5M3 17h18"/><rect x="5" y="9" width="5.5" height="3.5" rx="1.2"/>',
    tv: '<rect x="2.5" y="5" width="19" height="12" rx="2"/><path d="M8.5 20.5h7M12 17v3.5M9 2l3 3 3-3"/>',
    bicicleta: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5 9 9.5h6.5l3 7M9 9.5l3 7H5.5M12 16.5l3.5-7M9 9.5v-2M7.5 7.5h3M15.5 9.5 15 7h1.8"/>',
    tapete: '<rect x="4" y="5" width="16" height="14" rx="1"/><rect x="7.5" y="8.5" width="9" height="7" rx=".6"/><path d="M6 5V3M9 5V3M12 5V3M15 5V3M18 5V3M6 19v2M9 19v2M12 19v2M15 19v2M18 19v2"/>',
    megafone: '<path d="M3 10.5v3a1 1 0 0 0 1 1h2.5L15 19V5L6.5 9.5H4a1 1 0 0 0-1 1z"/><path d="m7 14.5 1.2 5h2.3l-1.1-4.2"/><path d="M18.5 9a4 4 0 0 1 0 6"/>',
    caixa: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>',
    conversa: '<path d="M4.5 4.5h15A1.5 1.5 0 0 1 21 6v9a1.5 1.5 0 0 1-1.5 1.5H10L5.5 20v-3.5h-1A1.5 1.5 0 0 1 3 15V6a1.5 1.5 0 0 1 1.5-1.5z"/><circle class="ponto" cx="8" cy="10.5" r="1.1"/><circle class="ponto" cx="12" cy="10.5" r="1.1"/><circle class="ponto" cx="16" cy="10.5" r="1.1"/>',
    relogio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    dinheiro: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v.01M18 14.5v.01"/>',
    caminhao: '<path d="M2.5 6.5H13v9H2.5z"/><path d="M13 9.5h4l3.5 3.8v2.2H13"/><circle cx="6.5" cy="17.8" r="1.8"/><circle cx="16.5" cy="17.8" r="1.8"/>',
    cancelar: '<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6m0-6-6 6"/>',
    lista: '<path d="M8.5 6H20M8.5 12H20M8.5 18H20"/><circle class="ponto" cx="4.5" cy="6" r="1.2"/><circle class="ponto" cx="4.5" cy="12" r="1.2"/><circle class="ponto" cx="4.5" cy="18" r="1.2"/>',
    seta: '<path d="m6 9 6 6 6-6"/>',
    pino: '<path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    loja: '<path d="M3.5 9.5 5 4h14l1.5 5.5"/><path d="M3.5 9.5a2.125 2.125 0 0 0 4.25 0 2.125 2.125 0 0 0 4.25 0 2.125 2.125 0 0 0 4.25 0 2.125 2.125 0 0 0 4.25 0"/><path d="M7.75 9.5 8.6 4M12 9.5V4M16.25 9.5 15.4 4"/><path d="M5 12.5V20h14v-7.5"/><path d="M10 20v-4.5h4V20"/>',
    lixeira: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v5.5M14 11v5.5"/>',
    foto: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5.5-5.5L6 20"/>',
    moeda: '<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.4c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 1.9 0 2.6 5.3 1.3 5.3 4 0 1.1-1.2 2-2.7 2-1.2 0-2.3-.5-2.8-1.5M12 6.6V8M12 16.5v1.2"/>',
    whatsapp: '<path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2z"/><path d="M8.9 8.1c.3-.5.8-.6 1.1-.6h.4c.2 0 .4.1.5.4l.8 1.9c.1.3 0 .5-.1.7l-.6.7c.7 1.3 1.8 2.4 3.1 3.1l.7-.6c.2-.2.5-.2.7-.1l1.9.8c.3.1.4.3.4.5v.4c0 .3-.1.8-.6 1.1-.7.4-1.7.6-2.6.3-2.6-.9-4.6-2.9-5.5-5.5-.3-.9-.1-1.9.3-2.6z"/>',
    fabrica: '<path d="M3 20.5V11l5.5 3.2V11l5.5 3.2V11l4 2.3V4h3v16.5z"/><path d="M7 17.5h2M11.5 17.5h2M16 17.5h2"/>',
    setaDireita: '<path d="m9 6 6 6-6 6"/>',
    desconto: '<circle cx="12" cy="12" r="8.5"/><path d="m8.8 15.2 6.4-6.4"/><circle class="ponto" cx="9.2" cy="9.2" r="1.25"/><circle class="ponto" cx="14.8" cy="14.8" r="1.25"/>',
  };

  const icone = (nome) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONES[nome]}</svg>`;

  // Buscas rápidas mostradas quando o campo está vazio (só aparecem se a loja tiver o produto).
  const ATALHOS = [
    ['Colchão', 'colchao'], ['Guarda-roupa', 'guardaRoupa'], ['Cozinha', 'cozinha'], ['Sofá', 'sofa'],
    ['Cadeira', 'cadeira'], ['Mesa', 'mesa'], ['Fogão', 'fogao'], ['Geladeira', 'geladeira'],
    ['Home', 'home'], ['Rack', 'rack'], ['Cômoda', 'comoda'], ['Balcão', 'balcao'],
    ['Cama', 'cama'], ['TV', 'tv'], ['Bicicleta', 'bicicleta'], ['Tapete', 'tapete'],
  ];

  // Andamento do pedido na aba Anunciados.
  const STATUS = [
    { id: 'anunciado', nome: 'Anunciado', icone: 'megafone' },
    { id: 'negociando', nome: 'Negociando', icone: 'conversa' },
    { id: 'reservado', nome: 'Reservado', icone: 'relogio' },
    { id: 'vendido', nome: 'Vendido', icone: 'dinheiro' },
    { id: 'entregue', nome: 'Entregue', icone: 'caminhao' },
    { id: 'cancelado', nome: 'Cancelado', icone: 'cancelar' },
  ];
  const STATUS_POR_ID = new Map(STATUS.map((s) => [s.id, s]));

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

  const ORDENS = ['az', 'za', 'menor', 'maior', 'mais-estoque', 'menos-estoque'];

  const $ = (id) => document.getElementById(id);
  const el = {
    lojas: $('lojas'), painel: $('painel'), form: $('form-busca'), busca: $('busca'),
    limpar: $('limpar'), comissao: $('comissao'), desconto: $('desconto'), aviso: $('aviso'), atalhos: $('atalhos'),
    contagem: $('contagem'), ordens: $('ordens'), lista: $('lista'), mais: $('mais'),
    vazio: $('vazio'), vazioTitulo: $('vazio-titulo'),
    vazioFornecedores: $('vazio-fornecedores'), filtroFornecedor: $('filtro-fornecedor'), sugestaoFornecedor: $('sugestao-fornecedor'),
    filtroFornecedorNome: $('filtro-fornecedor-nome'), filtroFornecedorLimpar: $('filtro-fornecedor-limpar'),
    perfil: $('perfil'), perfilIniciais: $('perfil-iniciais'), perfilIcone: $('perfil-icone'),
    camadaGaveta: $('camada-gaveta'), gaveta: $('gaveta'), gavetaIniciais: $('gaveta-iniciais'),
    gavetaFechar: $('gaveta-fechar'), formGaveta: $('form-gaveta'), nome: $('nome'), telefone: $('telefone'), temas: $('temas'),
    mostrarContas: $('mostrar-contas'),
    modalNome: $('modal-nome'), formNome: $('form-nome'), nomeInicial: $('nome-inicial'), nomeErro: $('nome-erro'),
    telaEstoque: $('tela-estoque'), telaAnunciados: $('tela-anunciados'),
    filtrosStatus: $('filtros-status'), listaAnunciados: $('lista-anunciados'),
    vazioAnunciados: $('vazio-anunciados'), abaEstoque: $('aba-estoque'), abaAnunciados: $('aba-anunciados'),
    contador: $('contador-anunciados'), toast: $('toast'), toastTexto: $('toast-texto'), toastAcao: $('toast-acao'),
  };

  // Logo depois de publicar, o navegador pode juntar a página antiga (guardada) com o código novo.
  // Faltando alguma parte da página, recarrega uma vez para pegar a versão nova, em vez de travar.
  const CHAVE_RECARGA = 'estoque-yella:recarregou';
  if (Object.keys(el).some((parte) => !el[parte])) {
    let jaRecarregou = true;
    try {
      jaRecarregou = sessionStorage.getItem(CHAVE_RECARGA) === '1';
      sessionStorage.setItem(CHAVE_RECARGA, '1');
    } catch (e) { /* sem armazenamento: não arrisca recarregar sem parar */ }
    if (!jaRecarregou) {
      location.reload();
      return;
    }
  } else {
    try { sessionStorage.removeItem(CHAVE_RECARGA); } catch (e) { /* nada a limpar */ }
  }

  const estado = {
    lojas: [], lojaId: null, selecao: null, dadosLojas: new Map(),
    produtos: [], porChave: new Map(), resultado: [], exibidos: 0,
    consulta: '', ordem: 'az', comissao: 0, desconto: 0,
    nome: '', fornecedor: null, verTodosFornecedores: false, consultaMostrada: '',
    anunciados: [], filtroStatus: 'todos', anunciosAbertos: new Set(), tema: 'auto', mostrarContas: true, telefone: '',
    tela: 'estoque', rolagem: { estoque: 0, anunciados: 0 },
  };

  // ---------------------------------------------------------------- utilidades

  const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

  const reais = (centavos) => moeda.format(centavos / 100);
  const percentual = (valor) => numero.format(valor) + '%';
  const doisDigitos = (n) => String(n).padStart(2, '0');

  function normalizar(texto) {
    return String(texto || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
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

  // "25/09 às 14:30" (com o ano quando não é o ano atual), no horário do aparelho
  function dataHoraBR(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const ano = d.getFullYear() !== new Date().getFullYear() ? `/${d.getFullYear()}` : '';
    return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}${ano} às ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
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

  // Preço de R$ 1,00 ou menos no sistema é marcação provisória: não serve para passar ao cliente.
  const semPreco = (p) => !(p.preco > 1);

  const rotuloLoja = (loja) => (loja && loja.uf ? `${loja.nome} - ${loja.uf}` : (loja ? loja.nome : ''));
  const lojaPorId = (id) => estado.lojas.find((l) => l.id === id);
  const lojaAtual = () => lojaPorId(estado.lojaId);
  const todasAsLojas = () => estado.lojaId === TODAS;
  const nomeDaLoja = (id) => (lojaPorId(id) || { nome: id }).nome;

  // ---------------------------------------------------------------- busca

  const semAcento = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Junta os produtos das lojas escolhidas. Cada produto guarda a loja de onde veio,
  // porque o mesmo código pode ser de produtos diferentes em lojas diferentes.
  function prepararProdutos(partes) {
    const juntos = [];
    partes.forEach(({ loja, dados }, posicaoLoja) => {
      for (const p of dados.produtos || []) juntos.push({ p, loja: loja.id, posicaoLoja, chave: semAcento(p.nome) });
    });
    // Cada arquivo já vem em ordem alfabética. Juntando lojas, reordena do mesmo jeito,
    // para o mesmo produto das duas lojas ficar lado a lado.
    if (partes.length > 1) {
      const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
      juntos.sort((a, b) => comparar(a.chave, b.chave) || comparar(a.p.codigo, b.p.codigo) || a.posicaoLoja - b.posicaoLoja);
    }
    estado.produtos = juntos.map(({ p, loja }, ordem) => {
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
        _loja: loja, _chave: `${loja}:${p.codigo}`,
        _ordem: ordem, _nome: nome, _nomeEspaco: ' ' + nome, _busca: busca, _codigo: codigo,
      });
    });
    estado.porChave = new Map(estado.produtos.map((p) => [p._chave, p]));
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

  // Com um fornecedor escolhido, a busca fica só nos produtos dele.
  const baseDaBusca = () => (estado.fornecedor ? estado.produtos.filter((p) => p.fornecedor === estado.fornecedor) : estado.produtos);

  function buscar(consulta) {
    const base = baseDaBusca();
    const termos = normalizar(consulta).split(' ').filter((t) => t && !IGNORAR.has(t));
    if (!termos.length) return base.slice();

    const limpa = String(consulta).trim();
    const codigo = /^\d+$/.test(limpa) ? limpa.replace(/^0+/, '') : null;
    const alternativas = termos.map((t) => variantes(t).map((v) => ({ termo: v, acha: testeDoTermo(v) })));
    const primeiras = alternativas[0].map((a) => a.termo);
    const achados = [];

    for (const p of base) {
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

  // Fornecedores dos produtos à mostra, com quantos produtos cada um tem.
  function fornecedoresComContagem() {
    const contagem = new Map();
    for (const p of estado.produtos) if (p.fornecedor) contagem.set(p.fornecedor, (contagem.get(p.fornecedor) || 0) + 1);
    return [...contagem].map(([nome, total]) => ({ nome, total, _nome: ' ' + normalizar(nome) }));
  }

  // Cada palavra buscada tem que ser começo de uma palavra do nome do fornecedor ("poli" acha Poliman).
  function fornecedoresDaBusca(consulta, fornecedores) {
    const termos = normalizar(consulta).split(' ').filter((t) => t && !IGNORAR.has(t));
    if (!termos.length) return [];
    const alternativas = termos.map(variantes);
    return fornecedores
      .filter((f) => alternativas.every((opcoes) => opcoes.some((v) => f._nome.includes(' ' + v))))
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  // Produto sem preço (R$ 1,00) vai para o fim quando a lista é ordenada por preço.
  const ORDENACOES = {
    'mais-estoque': (a, b) => b.quantidade - a.quantidade || a._ordem - b._ordem,
    'menos-estoque': (a, b) => a.quantidade - b.quantidade || a._ordem - b._ordem,
    az: (a, b) => a._ordem - b._ordem,
    za: (a, b) => b._ordem - a._ordem,
    menor: (a, b) => semPreco(a) - semPreco(b) || a.preco - b.preco || a._ordem - b._ordem,
    maior: (a, b) => semPreco(a) - semPreco(b) || b.preco - a.preco || a._ordem - b._ordem,
  };

  // ---------------------------------------------------------------- pedaços do cartão

  // Busca de foto: nome do produto seguido do fornecedor (quando o fornecedor ajuda a achar a foto).
  function linkFoto(p) {
    const termos = p.busca_foto ? `${p.nome} ${p.busca_foto}` : p.nome;
    return 'https://www.google.com/search?udm=2&q=' + encodeURIComponent(termos); // udm=2: aba Imagens
  }

  function precoHTML(p) {
    if (semPreco(p)) return '<strong class="valor confirmar">Preço a confirmar</strong>';
    return `<strong class="valor">${reais(Math.round(p.preco * 100))}</strong>`;
  }

  // Container com o ícone de estoque e a quantidade (fica à esquerda do botão de anunciar).
  // Sem produto (anunciado que saiu do estoque atual): cinza, com 0.
  function estoqueHTML(p) {
    if (!p) return `<span class="estoque fora" title="Fora do estoque atual" role="img" aria-label="Fora do estoque atual">${icone('caixa')}0</span>`;
    const q = p.quantidade;
    const texto = q === 1 ? 'Só 1 em estoque' : `${numero.format(q)} em estoque`;
    return `<span class="estoque${q === 1 ? ' ultima' : ''}" title="${texto}" role="img" aria-label="${texto}">${icone('caixa')}${numero.format(q)}</span>`;
  }

  // Linha curta embaixo do preço: até onde pode chegar e quanto o vendedor ganha.
  function linhaExtraHTML(p) {
    if (semPreco(p) || !(estado.desconto > 0 || estado.comissao > 0)) return '';
    const conta = calcular(p.preco, estado.comissao, estado.desconto);
    let html = '';
    if (estado.desconto > 0) {
      html += `<span class="minimo" title="Preço com ${percentual(estado.desconto)} de desconto">${icone('desconto')}até <b>${reais(conta.minimo)}</b></span>`;
    }
    if (estado.comissao > 0) {
      const ganho = conta.ganhoMinimo !== conta.ganhoCheio
        ? `<b>${reais(conta.ganhoMinimo)}</b> a <b>${reais(conta.ganhoCheio)}</b>`
        : `<b>${reais(conta.ganhoCheio)}</b>`;
      html += `<span class="ganho" title="Comissão de ${percentual(estado.comissao)} sobre o valor pago">${icone('moeda')}você ganha ${ganho}</span>`;
    }
    return `<p class="linha-extra">${html}</p>`;
  }

  // Em "Todas as lojas", cada produto mostra de qual loja é, no canto direito da linha do nome.
  // Cada loja tem uma cor de texto (pela ordem em lojas.json), para diferenciar de relance.
  function seloLojaHTML(idLoja) {
    if (!todasAsLojas()) return '';
    const loja = lojaPorId(idLoja);
    const cor = Math.max(0, estado.lojas.indexOf(loja)) % 4;
    return `<span class="selo-loja cor-loja-${cor}" title="Loja de ${escapar(rotuloLoja(loja) || idLoja)}">${icone('pino')}${escapar(nomeDaLoja(idLoja))}</span>`;
  }

  function botaoAnunciarHTML(p) {
    const item = anuncioDe(p._loja, p.codigo);
    if (!item) {
      return `<button type="button" class="icone-botao anunciar" data-acao="anunciar" title="Anunciar" aria-label="Anunciar ${escapar(p.nome)}">${icone('megafone')}</button>`;
    }
    const s = statusDe(item);
    return `<button type="button" class="icone-botao anunciar ativo status-${s.id}" data-acao="ver-anuncio" title="${s.nome}: ver nos anunciados" aria-label="${s.nome}: ver ${escapar(p.nome)} nos anunciados">${icone(s.icone)}</button>`;
  }

  // Mensagem pronta para o cliente. O WhatsApp abre para o vendedor escolher o contato,
  // e o texto ainda pode ser editado antes de enviar.
  // O desconto no Pix é o "Desconto máximo" da gaveta: o preço prometido é o mesmo "até R$" do cartão.
  const PARCELAS_SEM_JUROS = 10; // no máximo
  const PARCELA_MINIMA = 2500; // R$ 25,00 (em centavos)
  function mensagemWhatsApp(p, idLoja) {
    const loja = lojaPorId(idLoja);
    const linhas = [`*${p.nome}*`, ''];
    if (semPreco(p)) {
      linhas.push('💰 Preço a confirmar');
    } else {
      const conta = calcular(p.preco, 0, estado.desconto);
      linhas.push(estado.desconto > 0
        ? `💰 *${reais(conta.minimo)}* com ${percentual(estado.desconto)} OFF no Pix`
        : `💰 *${reais(conta.cheio)}* no Pix`);
      const parcelas = Math.min(PARCELAS_SEM_JUROS, Math.floor(conta.cheio / PARCELA_MINIMA));
      linhas.push(parcelas >= 2
        ? `💳 ${reais(conta.cheio)} em ${parcelas}x de ${reais(Math.round(conta.cheio / parcelas))} sem juros`
        : `💳 ${reais(conta.cheio)} no cartão`);
    }
    linhas.push('🚚 Entrega Grátis');
    if (p.quantidade >= 1 && p.quantidade <= 3) linhas.push('🔥 Últimas unidades!'); // até 3 unidades
    else if (p.quantidade > 3) linhas.push('✅ Pronta entrega');
    linhas.push('', 'Quer garantir?', 'É só responder esta mensagem! 😊', '');
    linhas.push(loja ? `Yêlla Móveis · ${rotuloLoja(loja)}` : 'Yêlla Móveis');
    if (estado.nome) linhas.push(`Atendimento: ${estado.nome}`);
    if (estado.telefone) linhas.push(`Tel. ${estado.telefone}`);
    return linhas.join('\n').replace(/ /g, ' ');
  }

  const linkWhatsApp = (p, idLoja) => 'https://wa.me/?text=' + encodeURIComponent(mensagemWhatsApp(p, idLoja));

  function botaoWhatsAppHTML(p, idLoja) {
    return `<a class="icone-botao whatsapp" href="${escapar(linkWhatsApp(p, idLoja))}" target="_blank" rel="noopener noreferrer" title="Enviar pelo WhatsApp" aria-label="Enviar ${escapar(p.nome)} pelo WhatsApp">${icone('whatsapp')}</a>`;
  }

  function botaoFotoHTML(p) {
    return `<a class="icone-botao" href="${escapar(linkFoto(p))}" target="_blank" rel="noopener noreferrer" title="Ver foto na internet" aria-label="Ver foto de ${escapar(p.nome)} na internet">${icone('foto')}</a>`;
  }

  function botaoDetalhesHTML(nome, id, aberto) {
    return `<button type="button" class="icone-botao ver-detalhes" aria-expanded="${aberto}" aria-controls="${id}" title="Detalhes" aria-label="Detalhes de ${escapar(nome)}">${icone('seta')}</button>`;
  }

  const listaDetalhesHTML = (linhas, id, aberto) => (
    `<dl class="detalhes" id="${id}"${aberto ? '' : ' hidden'}>${linhas.map(([t, v]) => `<dt>${t}</dt><dd>${v}</dd>`).join('')}</dl>`);

  function detalhesHTML(p, id, aberto = false) {
    const linhas = [
      ['Nome completo', escapar(p.nome)], // no cartão o nome pode aparecer cortado com "…"
      ['Código', escapar(p.codigo)],
      ['Em estoque', p.quantidade === 1 ? '1 unidade' : `${numero.format(p.quantidade)} unidades`],
      ['Fornecedor', escapar(p.fornecedor || 'Não identificado')],
    ];
    if (p.transferido_de) linhas.push(['Origem', `Transferido da loja de ${escapar(p.transferido_de)}`]);
    if (semPreco(p)) linhas.push(['Preço no sistema', reais(Math.round(p.preco * 100))]);
    linhas.push(['Última compra', p.ultima_compra ? dataBR(p.ultima_compra) : 'Não informada']);
    if ('ultima_venda' in p) linhas.push(['Última venda', p.ultima_venda ? dataBR(p.ultima_venda) : 'Nenhuma venda registrada']);
    linhas.push(['Nome no sistema', `<span class="sistema">${escapar(p.nome_sistema)}</span>`]);
    return listaDetalhesHTML(linhas, id, aberto);
  }

  // Anunciado que não está mais no estoque atual: mostra o que foi guardado ao anunciar.
  function detalhesForaDoEstoqueHTML(item, id, aberto) {
    return listaDetalhesHTML([
      ['Nome completo', escapar(item.nome)],
      ['Código', escapar(item.codigo)],
      ['Loja', escapar(rotuloLoja(lojaPorId(item.loja)) || item.loja)],
      ['Situação', 'Não está no estoque atual: pode ter sido vendido ou transferido.'],
      ['Preço quando anunciou', semPreco(item) ? 'A confirmar' : reais(Math.round(item.preco * 100))],
    ], id, aberto);
  }

  function cartaoHTML(p) {
    const id = `detalhes-${p._loja}-${p.codigo}`;
    return `<li class="card" data-chave="${escapar(p._chave)}">
  <div class="linha-nome"><h2 class="nome" title="${escapar(p.nome)}">${escapar(p.nome)}</h2>${seloLojaHTML(p._loja)}</div>
  <div class="linha-principal">
    ${precoHTML(p)}
    <div class="botoes">${estoqueHTML(p)}${botaoAnunciarHTML(p)}${botaoWhatsAppHTML(p, p._loja)}${botaoFotoHTML(p)}${botaoDetalhesHTML(p.nome, id, false)}</div>
  </div>
  <div class="extra">${linhaExtraHTML(p)}</div>
  ${detalhesHTML(p, id)}
</li>`;
  }

  // ---------------------------------------------------------------- lista do estoque

  function mostrarMais() {
    const proximos = estado.resultado.slice(estado.exibidos, estado.exibidos + POR_PAGINA);
    if (proximos.length) el.lista.insertAdjacentHTML('beforeend', proximos.map(cartaoHTML).join(''));
    estado.exibidos += proximos.length;
    const restantes = estado.resultado.length - estado.exibidos;
    el.mais.hidden = restantes <= 0;
    el.mais.textContent = `Mostrar mais produtos (${numero.format(restantes)} ${restantes === 1 ? 'restante' : 'restantes'})`;
  }

  // Só aparece como retorno de uma busca (sem busca, a lista fala por si).
  function atualizarContagem() {
    const total = estado.resultado.length;
    const consulta = estado.consulta.trim();
    const n = `<strong>${numero.format(total)}</strong>`;
    if (estado.selecao.semDados || !consulta) {
      el.contagem.textContent = '';
    } else if (!total) {
      el.contagem.innerHTML = `Nenhum produto encontrado para “${escapar(consulta)}”`;
    } else {
      el.contagem.innerHTML = `${n} ${total === 1 ? 'produto encontrado' : 'produtos encontrados'} para “${escapar(consulta)}”`;
    }
    el.contagem.hidden = !el.contagem.textContent;
  }

  function atualizarLista() {
    if (!estado.selecao) return; // produtos ainda não carregaram
    const semDados = Boolean(estado.selecao.semDados);
    const consulta = estado.consulta.trim();
    if (consulta !== estado.consultaMostrada) {
      estado.consultaMostrada = consulta;
      estado.verTodosFornecedores = false;
    }
    const resultado = semDados ? [] : buscar(estado.consulta);
    if (ORDENACOES[estado.ordem]) resultado.sort(ORDENACOES[estado.ordem]);
    const codigoBuscado = /^\d+$/.test(consulta) ? consulta.replace(/^0+/, '') : '';
    if (codigoBuscado) resultado.sort((a, b) => (b._codigo === codigoBuscado) - (a._codigo === codigoBuscado));
    estado.resultado = resultado;
    estado.exibidos = 0;
    el.lista.innerHTML = '';
    mostrarMais();
    atualizarContagem();
    el.filtroFornecedor.hidden = !estado.fornecedor;
    el.filtroFornecedorNome.textContent = estado.fornecedor || '';
    let fornecedoresHTML = '';
    let titulo = ''; // busca sem resultado já avisa na contagem
    if (semDados) {
      titulo = todasAsLojas() ? 'Estoque das lojas ainda não cadastrado' : `Estoque de ${rotuloLoja(lojaAtual())} ainda não cadastrado`;
    } else if (estado.fornecedor) {
      if (!consulta) titulo = 'Nenhum produto deste fornecedor aqui';
      fornecedoresHTML = `<button type="button" class="botao-secundario" data-acao="tirar-fornecedor">${icone('cancelar')}Tirar o filtro de fornecedor</button>`;
    } else if (!resultado.length && consulta) {
      fornecedoresHTML = buscaPorFornecedorHTML(consulta);
    }
    el.vazioTitulo.textContent = titulo;
    el.vazioTitulo.hidden = !titulo;
    el.vazioFornecedores.innerHTML = fornecedoresHTML;
    el.vazioFornecedores.hidden = !fornecedoresHTML;
    // Achou produtos, mas a busca também é nome de fornecedor (ex.: "gazin"): oferece ver tudo dele.
    let sugestao = '';
    if (!semDados && !estado.fornecedor && consulta && resultado.length) {
      const achados = fornecedoresDaBusca(consulta, fornecedoresComContagem());
      if (achados.length && achados.length <= 3) {
        sugestao = `${icone('fabrica')}<span>Buscar por fornecedor: ${achados.map((f) => (
          `<button type="button" class="link" data-fornecedor="${escapar(f.nome)}">${escapar(f.nome)} (${numero.format(f.total)})</button>`
        )).join(', ')}</span>`;
      }
    }
    el.sugestaoFornecedor.innerHTML = sugestao;
    el.sugestaoFornecedor.hidden = !sugestao;
    el.vazio.hidden = resultado.length > 0;
    el.atalhos.hidden = semDados || consulta !== '' || !el.atalhos.children.length;
    carregarSePerto();
  }

  // Busca sem resultado: oferece os fornecedores com esse nome, ou a lista completa deles.
  function buscaPorFornecedorHTML(consulta) {
    const fornecedores = fornecedoresComContagem();
    if (!fornecedores.length) return '';
    const todos = estado.verTodosFornecedores;
    const achados = todos ? [] : fornecedoresDaBusca(consulta, fornecedores);
    const lista = todos ? fornecedores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) : achados;
    let html = `<p class="fornecedores-titulo">${icone('fabrica')}Buscar por fornecedor</p>`;
    html += lista.map((f) => `<button type="button" class="fornecedor-opcao" data-fornecedor="${escapar(f.nome)}">`
      + `<span class="fornecedor-nome">${escapar(f.nome)}</span>`
      + `<span class="fornecedor-qtd">${numero.format(f.total)}<span class="sr-only"> ${f.total === 1 ? 'produto' : 'produtos'}</span></span>`
      + `${icone('setaDireita')}</button>`).join('');
    if (!todos) html += `<button type="button" class="link" data-acao="todos-fornecedores">Ver todos os fornecedores (${fornecedores.length})</button>`;
    return html;
  }

  function filtrarFornecedor(nome) {
    estado.fornecedor = nome;
    clearTimeout(esperaBusca);
    el.busca.value = '';
    el.limpar.hidden = true;
    estado.consulta = '';
    montarAtalhos();
    atualizarLista();
    voltarAoTopoDaLista();
  }

  function limparFornecedor() {
    estado.fornecedor = null;
    montarAtalhos();
    atualizarLista();
    voltarAoTopoDaLista();
  }

  // Classificadores: tocar de novo no que está ativo inverte a ordem
  // (maior ↔ menor estoque, A → Z ↔ Z → A, menor ↔ maior preço).
  function atualizarOrdens() {
    const o = estado.ordem;
    for (const botao of el.ordens.querySelectorAll('[data-ordem]')) {
      const tipo = botao.dataset.ordem;
      let ativo = o === 'mais-estoque' || o === 'menos-estoque';
      let rotulo = o === 'menos-estoque' ? 'Menor estoque' : 'Maior estoque';
      let descricao = o === 'menos-estoque' ? 'Do menor para o maior estoque' : 'Do maior para o menor estoque';
      if (tipo === 'nome') {
        ativo = o === 'az' || o === 'za';
        rotulo = o === 'za' ? 'Z → A' : 'A → Z';
        descricao = o === 'za' ? 'Nome de Z a A' : 'Nome de A a Z';
      } else if (tipo === 'preco') {
        ativo = o === 'menor' || o === 'maior';
        rotulo = o === 'maior' ? 'Maior preço' : 'Menor preço';
        descricao = o === 'maior' ? 'Do maior para o menor preço' : 'Do menor para o maior preço';
      }
      botao.setAttribute('aria-pressed', String(ativo));
      botao.setAttribute('aria-label', descricao);
      botao.title = descricao;
      botao.querySelector('span').textContent = rotulo;
    }
  }

  function proximaOrdem(tipo) {
    if (tipo === 'estoque') return estado.ordem === 'mais-estoque' ? 'menos-estoque' : 'mais-estoque';
    if (tipo === 'preco') return estado.ordem === 'menor' ? 'maior' : 'menor';
    return estado.ordem === 'az' ? 'za' : 'az';
  }

  // Leva o começo da lista para logo abaixo do painel fixo, se a pessoa tiver rolado para baixo.
  function voltarAoTopoDaLista() {
    const ancora = [el.filtroFornecedor, el.contagem].find((e) => !e.hidden) || el.lista;
    const alvo = ancora.getBoundingClientRect().top + window.scrollY - el.painel.offsetHeight - 8;
    if (window.scrollY > alvo) window.scrollTo(0, Math.max(0, alvo));
  }

  // Só redesenha as contas: não fecha os detalhes que a pessoa abriu.
  function atualizarPrecos() {
    for (const card of el.lista.children) {
      const p = estado.porChave.get(card.dataset.chave);
      const extra = card.querySelector('.extra');
      if (p && extra) extra.innerHTML = linhaExtraHTML(p);
    }
  }

  function atualizarBotaoAnunciar(card) {
    const p = estado.porChave.get(card.dataset.chave);
    const botao = card.querySelector('.anunciar');
    if (p && botao) botao.outerHTML = botaoAnunciarHTML(p);
  }

  function atualizarBotoesAnunciar() {
    for (const card of el.lista.children) atualizarBotaoAnunciar(card);
  }

  // Abre ou fecha os detalhes do produto (aba Estoque e aba Anunciados). Devolve se ficou aberto.
  function alternarDetalhes(botao) {
    const detalhes = document.getElementById(botao.getAttribute('aria-controls'));
    const abrir = botao.getAttribute('aria-expanded') !== 'true';
    botao.setAttribute('aria-expanded', String(abrir));
    if (detalhes) detalhes.hidden = !abrir;
    const card = botao.closest('.card');
    if (card) card.classList.toggle('aberto', abrir);
    return abrir;
  }

  function montarAtalhos() {
    el.atalhos.innerHTML = ATALHOS.map(([termo, nomeIcone]) => {
      const total = buscar(termo).length;
      return total
        ? `<button type="button" class="atalho" data-busca="${escapar(termo)}">${icone(nomeIcone)}<span>${escapar(termo)}</span><span class="atalho-qtd">${total}</span></button>`
        : '';
    }).join('');
  }

  // Mesmo estilo das abas de baixo: "Todas as lojas" e uma aba para cada loja.
  function montarSeletorLojas() {
    const opcoes = estado.lojas.map((loja) => ({ id: loja.id, nome: rotuloLoja(loja), icone: 'pino' }));
    if (opcoes.length > 1) opcoes.unshift({ id: TODAS, nome: 'Todas as lojas', icone: 'loja' });
    el.lojas.innerHTML = opcoes.map((o) => (
      `<button type="button" class="aba" data-loja="${escapar(o.id)}" aria-pressed="${o.id === estado.lojaId}">${icone(o.icone)}<span>${escapar(o.nome)}</span></button>`
    )).join('');
    el.lojas.hidden = opcoes.length < 2;
  }

  function atualizarTitulo() {
    document.title = todasAsLojas() ? 'Estoque Yêlla Móveis' : `Estoque ${lojaAtual().nome} · Yêlla Móveis`;
  }

  function mostrarAviso(texto) {
    el.aviso.textContent = texto;
    el.aviso.hidden = !texto;
  }

  // ---------------------------------------------------------------- anunciados (salvos no aparelho)

  function lerAnunciados() {
    try {
      const lista = JSON.parse(localStorage.getItem(CHAVE_ANUNCIADOS));
      return Array.isArray(lista)
        ? lista.filter((a) => a && a.loja && a.codigo && STATUS_POR_ID.has(a.status))
          .map((a) => Object.assign({ historico: [] }, a))
        : [];
    } catch (e) {
      return [];
    }
  }

  function salvarAnunciados() {
    try {
      localStorage.setItem(CHAVE_ANUNCIADOS, JSON.stringify(estado.anunciados));
    } catch (e) {
      mostrarToast('Não foi possível salvar neste aparelho.');
    }
  }

  // Pede ao navegador para não apagar os anunciados quando faltar espaço (quando ele permite).
  let pediuPersistencia = false;
  function pedirPersistencia() {
    if (pediuPersistencia || !navigator.storage || !navigator.storage.persist) return;
    pediuPersistencia = true;
    navigator.storage.persist().catch(() => {});
  }

  const anuncioDe = (loja, codigo) => estado.anunciados.find((a) => a.loja === loja && a.codigo === codigo);
  const statusDe = (item) => STATUS_POR_ID.get(item.status) || STATUS[0];
  const chaveAnuncio = (item) => `${item.loja}:${item.codigo}`;
  const anunciadosDaLoja = () => (todasAsLojas() ? estado.anunciados.slice() : estado.anunciados.filter((a) => a.loja === estado.lojaId));

  function anunciar(p) {
    const agora = new Date().toISOString();
    const item = {
      loja: p._loja, codigo: p.codigo, nome: p.nome, preco: p.preco, busca_foto: p.busca_foto || '',
      status: 'anunciado', criadoEm: agora, atualizadoEm: agora, historico: [{ status: 'anunciado', em: agora }],
    };
    estado.anunciados.push(item);
    salvarAnunciados();
    pedirPersistencia();
    atualizarContadorAnunciados();
    mostrarToast('Adicionado aos anunciados.', 'Ver', () => irParaAnuncio(item));
  }

  function mudarStatus(item, status) {
    if (item.status === status) return;
    const agora = new Date().toISOString();
    item.status = status;
    item.atualizadoEm = agora;
    item.historico.push({ status, em: agora });
    if (item.historico.length > 30) item.historico.splice(0, item.historico.length - 30);
    salvarAnunciados();
    renderizarAnunciados();
  }

  function removerAnuncio(item) {
    const posicao = estado.anunciados.indexOf(item);
    if (posicao < 0) return;
    estado.anunciados.splice(posicao, 1);
    salvarAnunciados();
    renderizarAnunciados();
    atualizarContadorAnunciados();
    mostrarToast('Removido dos anunciados.', 'Desfazer', () => {
      if (anuncioDe(item.loja, item.codigo)) return;
      estado.anunciados.splice(Math.min(posicao, estado.anunciados.length), 0, item);
      salvarAnunciados();
      renderizarAnunciados();
      atualizarContadorAnunciados();
    });
  }

  function historicoTexto(item) {
    const partes = [`Anunciado em ${dataHoraBR(item.criadoEm)}`];
    const ultimo = item.historico[item.historico.length - 1];
    if (ultimo && ultimo.status !== 'anunciado') partes.push(`${statusDe(ultimo).nome} em ${dataHoraBR(ultimo.em)}`);
    return partes.join(' · ');
  }

  function anuncioHTML(item) {
    const chave = chaveAnuncio(item);
    const atual = estado.porChave.get(chave);
    const p = atual || { nome: item.nome, preco: item.preco, busca_foto: item.busca_foto };
    const s = statusDe(item);
    const precoMudou = atual && !semPreco(atual) && Math.round(atual.preco * 100) !== Math.round(item.preco * 100);
    const id = `anuncio-detalhes-${item.loja}-${item.codigo}`;
    const aberto = estado.anunciosAbertos.has(chave); // continua aberto quando a lista é redesenhada
    return `<li class="card anuncio status-${s.id}${aberto ? ' aberto' : ''}" data-id="${escapar(chave)}">
  <div class="linha-nome"><h2 class="nome" title="${escapar(p.nome)}">${escapar(p.nome)}</h2>${seloLojaHTML(item.loja)}</div>
  <div class="linha-principal">
    ${precoHTML(p)}
    <div class="botoes">${estoqueHTML(atual)}${botaoWhatsAppHTML(p, item.loja)}${botaoFotoHTML(p)}<button type="button" class="icone-botao remover" data-acao="remover" title="Remover dos anunciados" aria-label="Remover ${escapar(p.nome)} dos anunciados">${icone('lixeira')}</button>${botaoDetalhesHTML(p.nome, id, aberto)}</div>
  </div>
  <div class="extra">${linhaExtraHTML(p)}</div>
  ${precoMudou ? `<p class="nota">Preço quando anunciou: ${reais(Math.round(item.preco * 100))}</p>` : ''}
  ${atual ? detalhesHTML(atual, id, aberto) : detalhesForaDoEstoqueHTML(item, id, aberto)}
  <div class="status-grade" role="group" aria-label="Como está o pedido">
    ${STATUS.map((st) => `<button type="button" class="status-opcao status-${st.id}" data-status="${st.id}" aria-pressed="${st.id === s.id}">${icone(st.icone)}<span>${st.nome}</span></button>`).join('')}
  </div>
  <p class="historico">${historicoTexto(item)}</p>
</li>`;
  }

  function filtroStatusHTML(id, nome, nomeIcone, total) {
    const classe = id === 'todos' ? '' : ` status-${id}`;
    return `<button type="button" class="atalho${classe}" data-status="${id}" aria-pressed="${estado.filtroStatus === id}">${icone(nomeIcone)}<span>${nome}</span><span class="atalho-qtd">${total}</span></button>`;
  }

  function renderizarAnunciados() {
    const daLoja = anunciadosDaLoja();
    const porStatus = new Map();
    for (const a of daLoja) porStatus.set(a.status, (porStatus.get(a.status) || 0) + 1);
    if (estado.filtroStatus !== 'todos' && !porStatus.get(estado.filtroStatus)) estado.filtroStatus = 'todos';

    el.filtrosStatus.innerHTML = daLoja.length
      ? [filtroStatusHTML('todos', 'Todos', 'lista', daLoja.length)]
        .concat(STATUS.filter((s) => porStatus.get(s.id)).map((s) => filtroStatusHTML(s.id, s.nome, s.icone, porStatus.get(s.id))))
        .join('')
      : '';
    el.filtrosStatus.hidden = !daLoja.length;

    const visiveis = daLoja
      .filter((a) => estado.filtroStatus === 'todos' || a.status === estado.filtroStatus)
      .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    el.listaAnunciados.innerHTML = visiveis.map(anuncioHTML).join('');
    el.vazioAnunciados.hidden = daLoja.length > 0;
  }

  function atualizarContadorAnunciados() {
    const total = anunciadosDaLoja().length;
    el.contador.hidden = total === 0;
    el.contador.textContent = total > 99 ? '99+' : String(total);
    el.abaAnunciados.setAttribute('aria-label', total ? `Anunciados: ${total}` : 'Anunciados');
  }

  // ---------------------------------------------------------------- abas

  const telaDoEndereco = () => (location.hash === '#anunciados' ? 'anunciados' : 'estoque');

  function mostrarTela(tela) {
    if (tela === estado.tela) return;
    estado.rolagem[estado.tela] = window.scrollY;
    estado.tela = tela;
    el.telaEstoque.hidden = tela !== 'estoque';
    el.telaAnunciados.hidden = tela !== 'anunciados';
    el.abaEstoque.toggleAttribute('aria-current', tela === 'estoque');
    el.abaAnunciados.toggleAttribute('aria-current', tela === 'anunciados');
    if (tela === 'estoque') el.abaEstoque.setAttribute('aria-current', 'page');
    else el.abaAnunciados.setAttribute('aria-current', 'page');
    if (tela === 'anunciados') renderizarAnunciados();
    else atualizarBotoesAnunciar();
    window.scrollTo(0, estado.rolagem[tela] || 0);
  }

  function irParaTela(tela) {
    const hash = tela === 'anunciados' ? '#anunciados' : '#estoque';
    if (location.hash !== hash) history.pushState(null, '', hash);
    mostrarTela(tela);
  }

  function irParaAnuncio(item) {
    estado.filtroStatus = 'todos';
    if (estado.tela === 'anunciados') renderizarAnunciados();
    irParaTela('anunciados');
    const card = [...el.listaAnunciados.children].find((li) => li.dataset.id === chaveAnuncio(item));
    if (!card) return;
    card.scrollIntoView({ block: 'center' });
    card.classList.remove('destaque');
    void card.offsetWidth; // reinicia a animação
    card.classList.add('destaque');
  }

  // ---------------------------------------------------------------- aviso flutuante

  let esperaToast = 0;
  let acaoToast = null;
  function mostrarToast(texto, rotuloAcao, acao) {
    el.toastTexto.textContent = texto;
    el.toastAcao.textContent = rotuloAcao || '';
    el.toastAcao.hidden = !rotuloAcao;
    acaoToast = acao || null;
    el.toast.hidden = false;
    clearTimeout(esperaToast);
    esperaToast = setTimeout(esconderToast, rotuloAcao ? 6000 : 3000);
  }
  function esconderToast() {
    el.toast.hidden = true;
    acaoToast = null;
  }

  // ---------------------------------------------------------------- perfil do vendedor: nome, comissão e desconto

  const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  const limparNome = (texto) => String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const nomeValido = (nome) => /\p{L}/u.test(nome);

  // "77999998888", "+55 77 99999-8888" ou "077 99999 8888" -> "(77) 99999-8888"
  function formatarTelefone(texto) {
    let d = String(texto || '').replace(/\D/g, '');
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    if (d.length > 11 && d.startsWith('0')) d = d.slice(1);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`;
    if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
    return String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  }

  // "Maria da Silva" -> "MS"; "Maria" -> "M"
  function iniciaisDe(nome) {
    const partes = limparNome(nome).split(' ').filter((p) => p && !PARTICULAS.has(p.toLowerCase()));
    if (!partes.length) return '';
    const letra = (palavra) => Array.from(palavra)[0];
    const iniciais = partes.length > 1 ? letra(partes[0]) + letra(partes[partes.length - 1]) : letra(partes[0]);
    return iniciais.toLocaleUpperCase('pt-BR');
  }

  function atualizarPerfil() {
    const iniciais = iniciaisDe(estado.nome);
    el.perfilIniciais.textContent = iniciais;
    el.perfilIcone.toggleAttribute('hidden', Boolean(iniciais));
    el.gavetaIniciais.textContent = iniciais;
    el.perfil.title = estado.nome || 'Seu perfil';
    el.perfil.setAttribute('aria-label', estado.nome
      ? `${estado.nome}: seu nome, comissão e desconto máximo` : 'Seu perfil: comissão e desconto máximo');
  }

  function definirNome(nome) {
    if (!nome || nome === estado.nome) return;
    estado.nome = nome;
    atualizarPerfil();
    salvarAjustes();
    atualizarLinksWhatsApp(); // a mensagem do WhatsApp leva o nome de quem atende
  }

  function atualizarLinksWhatsApp() {
    for (const card of el.lista.children) {
      const p = estado.porChave.get(card.dataset.chave);
      const link = card.querySelector('.whatsapp');
      if (p && link) link.href = linkWhatsApp(p, p._loja);
    }
    if (estado.tela === 'anunciados') renderizarAnunciados();
  }

  // Enquanto a gaveta ou a janela do nome estão abertas, o resto da página não recebe toque nem foco.
  function travarFundo(travar) {
    for (const parte of [document.querySelector('.pular'), document.querySelector('.topo'), el.telaEstoque, el.telaAnunciados, $('abas')]) {
      if (parte) parte.inert = travar;
    }
    document.documentElement.classList.toggle('travado', travar);
  }

  let focoAntesDaGaveta = null;
  function abrirGaveta() {
    if (!el.gaveta.hidden) return;
    focoAntesDaGaveta = document.activeElement;
    el.nome.value = estado.nome;
    el.telefone.value = estado.telefone;
    el.camadaGaveta.hidden = false;
    el.gaveta.hidden = false;
    el.perfil.setAttribute('aria-expanded', 'true');
    esconderToast();
    travarFundo(true);
    el.gaveta.focus();
  }

  function fecharGaveta() {
    if (el.gaveta.hidden) return;
    el.nome.value = estado.nome; // nome apagado não vale: fica o anterior
    el.telefone.value = estado.telefone;
    formatarCampo(el.comissao);
    formatarCampo(el.desconto);
    aoMudarAjuste();
    el.camadaGaveta.hidden = true;
    el.gaveta.hidden = true;
    el.perfil.setAttribute('aria-expanded', 'false');
    travarFundo(false);
    const voltar = focoAntesDaGaveta && document.body.contains(focoAntesDaGaveta) ? focoAntesDaGaveta : el.perfil;
    if (voltar !== document.body) voltar.focus();
  }

  // Tema: claro, escuro ou automático (segue o celular). O <head> já aplica o salvo antes de desenhar.
  const TEMAS = ['auto', 'claro', 'escuro'];
  function aplicarTema(tema) {
    estado.tema = TEMAS.includes(tema) ? tema : 'auto';
    const raiz = document.documentElement;
    if (estado.tema === 'auto') raiz.removeAttribute('data-theme');
    else raiz.setAttribute('data-theme', estado.tema === 'escuro' ? 'dark' : 'light');
    for (const botao of el.temas.querySelectorAll('[data-tema]')) {
      botao.setAttribute('aria-pressed', String(botao.dataset.tema === estado.tema));
    }
  }

  // Olhinho: com as contas escondidas, "até" e "você ganha" só aparecem em ver mais (detalhes).
  function aplicarVisibilidadeContas(visivel) {
    estado.mostrarContas = visivel;
    document.documentElement.classList.toggle('ocultar-contas', !visivel);
    el.mostrarContas.setAttribute('aria-pressed', String(visivel));
  }

  // Primeiro acesso: pede o nome antes de usar.
  function abrirModalNome() {
    el.modalNome.hidden = false;
    travarFundo(true);
    el.nomeInicial.focus();
  }

  function concluirModalNome(evento) {
    evento.preventDefault();
    const nome = limparNome(el.nomeInicial.value);
    if (!nomeValido(nome)) {
      el.nomeErro.hidden = false;
      el.nomeInicial.setAttribute('aria-invalid', 'true');
      el.nomeInicial.focus();
      return;
    }
    definirNome(nome);
    el.nomeInicial.blur();
    el.modalNome.hidden = true;
    travarFundo(false);
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
        nome: estado.nome,
        telefone: estado.telefone,
        comissao: el.comissao.value.trim(),
        desconto: el.desconto.value.trim(),
        loja: estado.lojaId,
        ordem: estado.ordem,
        tema: estado.tema,
        contas: estado.mostrarContas ? 'mostrar' : 'ocultar',
      }));
    } catch (e) { /* navegador sem armazenamento: segue funcionando sem salvar */ }
  }

  function formatarCampo(campo) {
    const valor = lerPercentual(campo.value);
    campo.value = valor > 0 ? numero.format(valor) : '';
  }

  function aoMudarAjuste() {
    const comissao = lerPercentual(el.comissao.value);
    const desconto = lerPercentual(el.desconto.value);
    const mudou = comissao !== estado.comissao || desconto !== estado.desconto;
    estado.comissao = comissao;
    estado.desconto = desconto;
    if (mudou) {
      atualizarPrecos();
      atualizarLinksWhatsApp(); // a mensagem leva o preço com desconto; também redesenha os anunciados
    }
    salvarAjustes();
  }

  // ---------------------------------------------------------------- carregamento

  async function buscarJSON(caminho) {
    const resposta = await fetch(caminho, { cache: 'no-cache' });
    if (!resposta.ok) throw new Error(`${caminho}: HTTP ${resposta.status}`);
    return resposta.json();
  }

  // Abre uma loja ou TODAS (junta o estoque de todas as lojas).
  async function carregarLoja(id) {
    const anterior = estado.lojaId;
    const pedido = id === TODAS && estado.lojas.length > 1 ? TODAS : (lojaPorId(id) || estado.lojas[0]).id;
    const escolhidas = pedido === TODAS ? estado.lojas : [lojaPorId(pedido)];
    estado.lojaId = pedido;
    estado.filtroStatus = 'todos';
    montarSeletorLojas();
    avisoConexao();

    const faltando = escolhidas.filter((loja) => loja.arquivo && !estado.dadosLojas.has(loja.id));
    const falharam = [];
    if (faltando.length) {
      el.contagem.textContent = 'Carregando produtos…';
      await Promise.all(faltando.map(async (loja) => {
        try {
          estado.dadosLojas.set(loja.id, await buscarJSON(loja.arquivo));
        } catch (erro) {
          falharam.push(loja);
        }
      }));
      if (estado.lojaId !== pedido) return; // a pessoa trocou de loja enquanto carregava
    }

    // Loja sem arquivo é loja com o estoque ainda não cadastrado.
    const partes = escolhidas
      .filter((loja) => estado.dadosLojas.has(loja.id) || !loja.arquivo)
      .map((loja) => ({ loja, dados: estado.dadosLojas.get(loja.id) || { semDados: true, produtos: [] } }));
    if (falharam.length) {
      mostrarAviso(`Não foi possível carregar os produtos de ${falharam.map(rotuloLoja).join(' e ')}. Confira a internet e recarregue a página.`);
      if (!partes.length) {
        el.contagem.textContent = '';
        if (anterior && estado.selecao) { // continua mostrando a loja que já estava aberta
          estado.lojaId = anterior;
          montarSeletorLojas();
          atualizarContagem();
        }
        return;
      }
    }

    estado.selecao = { partes, semDados: partes.every((parte) => parte.dados.semDados) };
    prepararProdutos(partes);
    atualizarTitulo();
    montarAtalhos();
    atualizarLista();
    renderizarAnunciados();
    atualizarContadorAnunciados();
    salvarAjustes();
  }

  async function iniciar() {
    const salvos = lerAjustes();
    aplicarTema(salvos.tema);
    aplicarVisibilidadeContas(salvos.contas !== 'ocultar');
    estado.nome = limparNome(salvos.nome);
    estado.telefone = formatarTelefone(salvos.telefone);
    if (!nomeValido(estado.nome)) estado.nome = '';
    atualizarPerfil();
    if (!estado.nome) abrirModalNome();
    el.comissao.value = salvos.comissao || '';
    el.desconto.value = salvos.desconto || '';
    formatarCampo(el.comissao);
    formatarCampo(el.desconto);
    estado.comissao = lerPercentual(el.comissao.value);
    estado.desconto = lerPercentual(el.desconto.value);
    estado.ordem = ORDENS.includes(salvos.ordem) ? salvos.ordem : 'az';
    atualizarOrdens();
    estado.anunciados = lerAnunciados();

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
    // Sem escolha salva, começa em "Todas as lojas".
    const salvaValida = salvos.loja === TODAS || estado.lojas.some((l) => l.id === salvos.loja);
    await carregarLoja(salvaValida ? salvos.loja : TODAS);
    mostrarTela(telaDoEndereco());
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
    // seleciona o valor ao tocar, para a pessoa digitar o novo percentual por cima
    campo.addEventListener('focus', () => setTimeout(() => campo.setSelectionRange(0, campo.value.length), 0));
  }

  // Na gaveta, "Enter" passa para o próximo campo; no último, fecha.
  const PROXIMO_CAMPO = new Map([[el.nome, el.telefone], [el.telefone, el.comissao], [el.comissao, el.desconto]]);
  el.formGaveta.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Enter' || !evento.target.matches('input')) return;
    evento.preventDefault();
    const proximo = PROXIMO_CAMPO.get(evento.target);
    if (proximo) proximo.focus();
    else fecharGaveta();
  });
  el.formGaveta.addEventListener('submit', (evento) => { evento.preventDefault(); fecharGaveta(); });

  el.nome.addEventListener('input', () => {
    const nome = limparNome(el.nome.value);
    if (nomeValido(nome)) definirNome(nome);
  });
  el.nome.addEventListener('blur', () => { el.nome.value = estado.nome; });

  // Telefone do vendedor: vai na mensagem do WhatsApp; ao sair do campo fica no formato (77) 99999-9999.
  el.telefone.addEventListener('input', () => {
    const telefone = formatarTelefone(el.telefone.value);
    if (telefone === estado.telefone) return;
    estado.telefone = telefone;
    salvarAjustes();
    atualizarLinksWhatsApp();
  });
  el.telefone.addEventListener('blur', () => { el.telefone.value = estado.telefone; });

  el.temas.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-tema]');
    if (!botao) return;
    aplicarTema(botao.dataset.tema);
    salvarAjustes();
  });

  el.mostrarContas.addEventListener('click', () => {
    aplicarVisibilidadeContas(!estado.mostrarContas);
    salvarAjustes();
  });

  el.perfil.addEventListener('click', abrirGaveta);
  el.gavetaFechar.addEventListener('click', fecharGaveta);
  el.camadaGaveta.addEventListener('click', fecharGaveta);
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && !el.gaveta.hidden) fecharGaveta();
  });

  el.formNome.addEventListener('submit', concluirModalNome);
  el.nomeInicial.addEventListener('input', () => {
    if (el.nomeErro.hidden || !nomeValido(limparNome(el.nomeInicial.value))) return;
    el.nomeErro.hidden = true;
    el.nomeInicial.removeAttribute('aria-invalid');
  });

  el.ordens.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-ordem]');
    if (!botao) return;
    estado.ordem = proximaOrdem(botao.dataset.ordem);
    atualizarOrdens();
    atualizarLista();
    voltarAoTopoDaLista();
    salvarAjustes();
  });

  el.filtroFornecedorLimpar.addEventListener('click', limparFornecedor);
  el.sugestaoFornecedor.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-fornecedor]');
    if (botao) filtrarFornecedor(botao.dataset.fornecedor);
  });

  el.vazioFornecedores.addEventListener('click', (evento) => {
    const botao = evento.target.closest('button');
    if (!botao) return;
    if (botao.dataset.fornecedor) {
      filtrarFornecedor(botao.dataset.fornecedor);
    } else if (botao.dataset.acao === 'todos-fornecedores') {
      estado.verTodosFornecedores = true;
      atualizarLista();
      const primeiro = el.vazioFornecedores.querySelector('.fornecedor-opcao');
      if (primeiro) primeiro.focus();
    } else if (botao.dataset.acao === 'tirar-fornecedor') {
      limparFornecedor();
    }
  });

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
    const botao = evento.target.closest('button');
    if (!botao) return;
    const card = botao.closest('.card');
    const p = card && estado.porChave.get(card.dataset.chave);
    if (botao.classList.contains('ver-detalhes')) {
      alternarDetalhes(botao);
    } else if (p && botao.dataset.acao === 'anunciar') {
      if (!anuncioDe(p._loja, p.codigo)) anunciar(p);
      atualizarBotaoAnunciar(card);
    } else if (p && botao.dataset.acao === 'ver-anuncio') {
      const item = anuncioDe(p._loja, p.codigo);
      if (item) irParaAnuncio(item);
      else atualizarBotaoAnunciar(card);
    }
  });

  el.listaAnunciados.addEventListener('click', (evento) => {
    const botao = evento.target.closest('button');
    const card = botao && botao.closest('.anuncio');
    if (!card) return;
    const item = estado.anunciados.find((a) => chaveAnuncio(a) === card.dataset.id);
    if (!item) return;
    if (botao.classList.contains('status-opcao')) mudarStatus(item, botao.dataset.status);
    else if (botao.dataset.acao === 'remover') removerAnuncio(item);
    else if (botao.classList.contains('ver-detalhes')) {
      if (alternarDetalhes(botao)) estado.anunciosAbertos.add(card.dataset.id);
      else estado.anunciosAbertos.delete(card.dataset.id);
    }
  });

  el.filtrosStatus.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-status]');
    if (!botao) return;
    estado.filtroStatus = botao.dataset.status;
    renderizarAnunciados();
  });

  el.abaEstoque.addEventListener('click', (evento) => { evento.preventDefault(); irParaTela('estoque'); });
  el.abaAnunciados.addEventListener('click', (evento) => { evento.preventDefault(); irParaTela('anunciados'); });
  window.addEventListener('popstate', () => mostrarTela(telaDoEndereco()));
  window.addEventListener('hashchange', () => mostrarTela(telaDoEndereco()));

  el.toastAcao.addEventListener('click', () => {
    const acao = acaoToast;
    esconderToast();
    if (acao) acao();
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

  // No celular, esconde a barra de abas enquanto o teclado está aberto.
  const telaDeToque = Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  document.addEventListener('focusin', (evento) => {
    if (telaDeToque && evento.target.matches('input')) document.body.classList.add('digitando');
  });
  document.addEventListener('focusout', (evento) => {
    if (evento.target.matches('input')) document.body.classList.remove('digitando');
  });

  // Outra aba do navegador mexeu nos anunciados: acompanha aqui também.
  window.addEventListener('storage', (evento) => {
    if (evento.key !== CHAVE_ANUNCIADOS) return;
    estado.anunciados = lerAnunciados();
    renderizarAnunciados();
    atualizarContadorAnunciados();
    atualizarBotoesAnunciar();
  });

  function avisoConexao() {
    mostrarAviso(navigator.onLine ? '' : 'Você está sem internet. Mostrando o último estoque salvo neste aparelho.');
  }
  window.addEventListener('online', avisoConexao);
  window.addEventListener('offline', avisoConexao);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  iniciar();

  // Exposto só para conferência no console do navegador.
  window.__estoque = { calcular, buscar, lerPercentual, normalizar, estado, ORDENACOES, linkWhatsApp, mensagemWhatsApp, formatarTelefone, iniciaisDe, fornecedoresDaBusca, fornecedoresComContagem };
})();
