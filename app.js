/* Estoque Yêlla Móveis — consulta rápida para vendedores, pensada para celular. */
(() => {
  'use strict';

  const ARQUIVO_LOJAS = 'dados/lojas.json';
  const CHAVE_AJUSTES = 'estoque-yella:ajustes';
  const CHAVE_ANUNCIADOS = 'estoque-yella:anunciados';
  const POR_PAGINA = 40;
  const TODAS = 'todas'; // opção "Todas as lojas": junta o estoque de todas
  const DIAS_NOVO = 15;   // etiqueta "Novo" nos produtos que entraram numa atualização
  const DIAS_PARADO = 90; // "Parados": sem venda nem compra há mais que isso (lojas cujo relatório traz a última venda)
  const MAX_SELECAO = 10; // produtos numa mesma mensagem de WhatsApp

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
    arquivo: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    ampulheta: '<path d="M7 3h10M7 21h10M8 3v3.5a4 4 0 0 0 1.6 3.2L12 11.5l2.4-1.8A4 4 0 0 0 16 6.5V3M8 21v-3.5a4 4 0 0 1 1.6-3.2L12 12.5l2.4 1.8a4 4 0 0 1 1.6 3.2V21"/>',
    check: '<path d="m5.5 12.5 4.2 4.2L18.5 8"/>',
    recibo: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
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
    filtroParados: $('filtro-parados'), filtroParadosLimpar: $('filtro-parados-limpar'), imposto: $('imposto'),
    painelVendas: $('painel-vendas'), vendasMes: $('vendas-mes'), vendasNumeros: $('vendas-numeros'),
    mesAnterior: $('mes-anterior'), mesProximo: $('mes-proximo'),
    modalVenda: $('modal-venda'), formVenda: $('form-venda'), vendaProduto: $('venda-produto'), vendaNome: $('venda-nome'),
    vendaCpf: $('venda-cpf'), vendaTelefone: $('venda-telefone'), vendaEndereco: $('venda-endereco'), vendaBairro: $('venda-bairro'),
    vendaPagamento: $('venda-pagamento'), vendaParcelasCampo: $('venda-parcelas-campo'), vendaParcelas: $('venda-parcelas'),
    vendaValor: $('venda-valor'), vendaAssinatura: $('venda-assinatura'), vendaLimparAssinatura: $('venda-limpar-assinatura'),
    vendaErro: $('venda-erro'), vendaCancelar: $('venda-cancelar'),
    modalComprovante: $('modal-comprovante'), comprovanteImagem: $('comprovante-imagem'), comprovanteEnviar: $('comprovante-enviar'),
    comprovanteImagemBaixar: $('comprovante-imagem-baixar'), comprovantePdf: $('comprovante-pdf'),
    comprovanteEditar: $('comprovante-editar'), comprovanteFechar: $('comprovante-fechar'),
    barraResultados: $('barra-resultados'), selecionar: $('selecionar'), barraSelecao: $('barra-selecao'),
    selecaoCancelar: $('selecao-cancelar'), selecaoTexto: $('selecao-texto'), selecaoEnviar: $('selecao-enviar'),
    adminEntrar: $('admin-entrar'), chaveAdmin: $('chave-admin'), adminBotaoEntrar: $('admin-botao-entrar'),
    adminPainel: $('admin-painel'), adminArquivos: $('admin-arquivos'), adminConferir: $('admin-conferir'),
    adminRelatorio: $('admin-relatorio'), adminPublicar: $('admin-publicar'), adminSair: $('admin-sair'), adminErro: $('admin-erro'),
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
    filtroParados: false, ordemAntesParados: 'az', selecionando: false, selecionados: new Map(),
    custos: null, imposto: 0, mesVendas: null,
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
      const referencia = dados.gerado_em ? Date.parse(dados.gerado_em) : Date.now();
      const temVenda = (dados.produtos || []).some((p) => 'ultima_venda' in p);
      for (const p of dados.produtos || []) {
        juntos.push({ p, loja: loja.id, posicaoLoja, chave: semAcento(p.nome), referencia, temVenda });
      }
    });
    // Cada arquivo já vem em ordem alfabética. Juntando lojas, reordena do mesmo jeito,
    // para o mesmo produto das duas lojas ficar lado a lado.
    if (partes.length > 1) {
      const comparar = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
      juntos.sort((a, b) => comparar(a.chave, b.chave) || comparar(a.p.codigo, b.p.codigo) || a.posicaoLoja - b.posicaoLoja);
    }
    estado.produtos = juntos.map(({ p, loja, referencia, temVenda }, ordem) => {
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
      // Dias parado até a data do relatório: desde a última venda ou a última compra, a mais
      // recente (produto que acabou de chegar não conta como parado)
      const desde = temVenda ? [p.ultima_venda, p.ultima_compra].filter(Boolean).sort().pop() : null;
      const diasParado = desde ? Math.floor((referencia - Date.parse(`${desde}T12:00:00`)) / 86400000) : null;
      return Object.assign({}, p, {
        _loja: loja, _chave: `${loja}:${p.codigo}`,
        _ordem: ordem, _nome: nome, _nomeEspaco: ' ' + nome, _busca: busca, _codigo: codigo, _diasParado: diasParado,
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
  const parado = (p) => p._diasParado != null && p._diasParado >= DIAS_PARADO;
  const baseDaBusca = () => ((estado.fornecedor || estado.filtroParados)
    ? estado.produtos.filter((p) => (!estado.fornecedor || p.fornecedor === estado.fornecedor) && (!estado.filtroParados || parado(p)))
    : estado.produtos);

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
    parado: (a, b) => (b._diasParado ?? -1) - (a._diasParado ?? -1) || a._ordem - b._ordem, // mais parado primeiro
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
  function linhasPreco(p) {
    if (semPreco(p)) return ['💰 Preço a confirmar'];
    const conta = calcular(p.preco, 0, estado.desconto);
    const parcelas = Math.min(PARCELAS_SEM_JUROS, Math.floor(conta.cheio / PARCELA_MINIMA));
    return [
      estado.desconto > 0
        ? `💰 *${reais(conta.minimo)}* com ${percentual(estado.desconto)} OFF no Pix`
        : `💰 *${reais(conta.cheio)}* no Pix`,
      parcelas >= 2
        ? `💳 ${reais(conta.cheio)} em ${parcelas}x de ${reais(Math.round(conta.cheio / parcelas))} sem juros`
        : `💳 ${reais(conta.cheio)} no cartão`,
    ];
  }

  function linhaEstoqueMensagem(p) {
    if (p.quantidade >= 1 && p.quantidade <= 3) return '🔥 Últimas unidades!'; // até 3 unidades
    return p.quantidade > 3 ? '✅ Pronta entrega' : '';
  }

  function assinaturaMensagem(loja) {
    const linhas = ['', 'Quer garantir?', 'É só responder esta mensagem! 😊', ''];
    linhas.push(loja ? `Yêlla Móveis · ${rotuloLoja(loja)}` : 'Yêlla Móveis');
    if (estado.nome) linhas.push(`Atendimento: ${estado.nome}`);
    if (estado.telefone) linhas.push(`Tel. ${estado.telefone}`);
    return linhas;
  }

  function mensagemWhatsApp(p, idLoja) {
    const linhas = [`*${p.nome}*`, '', ...linhasPreco(p), '🚚 Entrega Grátis'];
    if (linhaEstoqueMensagem(p)) linhas.push(linhaEstoqueMensagem(p));
    linhas.push(...assinaturaMensagem(lojaPorId(idLoja)));
    return linhas.join('\n').replace(/ /g, ' ');
  }

  const linkWhatsApp = (p, idLoja) => 'https://wa.me/?text=' + encodeURIComponent(mensagemWhatsApp(p, idLoja));

  // Vários produtos numa mensagem só (ex.: o cliente perguntou "quais guarda-roupas vocês têm?").
  function mensagemVarios(produtos) {
    const lojas = [...new Set(produtos.map((p) => p._loja))];
    const linhas = ['*Separei estas opções para você:*', ''];
    produtos.forEach((p, i) => {
      const onde = lojas.length > 1 ? ` (${rotuloLoja(lojaPorId(p._loja))})` : '';
      linhas.push(`${i + 1}. *${p.nome}*${onde}`, ...linhasPreco(p));
      if (linhaEstoqueMensagem(p)) linhas.push(linhaEstoqueMensagem(p));
      linhas.push('');
    });
    linhas.push('🚚 Entrega Grátis', ...assinaturaMensagem(lojas.length === 1 ? lojaPorId(lojas[0]) : null));
    return linhas.join('\n').replace(/\u00a0/g, ' ');
  }

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
    const custo = custoDe(p);
    if (custo != null) linhas.push(...linhasSobra(p, custo));
    return listaDetalhesHTML(linhas, id, aberto).replace('</dl>', galeriaHTML(p) + '</dl>');
  }

  // Mini galeria no fim dos detalhes (fotos em dados/fotos.json, pela descrição do sistema).
  function fotosDe(p) {
    const lista = estado.fotos && estado.fotos[p.nome_sistema];
    return Array.isArray(lista) ? lista.slice(0, 6) : []; // no máximo 6 fotos
  }

  function galeriaHTML(p) {
    const fotos = fotosDe(p);
    if (!fotos.length) return '';
    const miniaturas = fotos.map((src, i) => `<button type="button" class="miniatura" data-acao="abrir-foto" data-indice="${i}" aria-label="Abrir foto ${i + 1} de ${fotos.length}"><img src="${escapar(src)}" alt="" loading="lazy"></button>`).join('');
    return `<div class="galeria"><dt>Fotos</dt><dd>${miniaturas}</dd></div>`;
  }

  // Tela cheia com as fotos: setas, deslizar o dedo, teclado e Esc para fechar.
  const visor = { fotos: [], indice: 0, nome: '' };
  function abrirVisor(fotos, indice, nome) {
    let tela = document.getElementById('visor-fotos');
    if (!tela) {
      document.body.insertAdjacentHTML('beforeend', `<div id="visor-fotos" class="visor" role="dialog" aria-modal="true" hidden>
  <button type="button" class="visor-fechar" data-visor="fechar" aria-label="Fechar">×</button>
  <button type="button" class="visor-seta anterior" data-visor="-1" aria-label="Foto anterior">‹</button>
  <img class="visor-img" alt="">
  <button type="button" class="visor-seta proxima" data-visor="1" aria-label="Próxima foto">›</button>
  <p class="visor-contador"></p>
</div>`);
      tela = document.getElementById('visor-fotos');
      tela.addEventListener('click', (evento) => {
        const acao = evento.target.closest('[data-visor]');
        if (acao) { if (acao.dataset.visor === 'fechar') fecharVisor(); else passarFoto(Number(acao.dataset.visor)); }
        else if (evento.target === tela) fecharVisor();
      });
      let inicioX = null;
      tela.addEventListener('touchstart', (e) => { inicioX = e.touches[0].clientX; }, { passive: true });
      tela.addEventListener('touchend', (e) => {
        if (inicioX === null) return;
        const dx = e.changedTouches[0].clientX - inicioX;
        inicioX = null;
        if (Math.abs(dx) > 40) passarFoto(dx < 0 ? 1 : -1);
      });
      document.addEventListener('keydown', (e) => {
        if (tela.hidden) return;
        if (e.key === 'Escape') fecharVisor();
        else if (e.key === 'ArrowRight') passarFoto(1);
        else if (e.key === 'ArrowLeft') passarFoto(-1);
      });
    }
    Object.assign(visor, { fotos, indice, nome });
    tela.hidden = false;
    document.body.classList.add('visor-aberto');
    mostrarFoto();
  }
  function passarFoto(passo) {
    visor.indice = (visor.indice + passo + visor.fotos.length) % visor.fotos.length;
    mostrarFoto();
  }
  function mostrarFoto() {
    const tela = document.getElementById('visor-fotos');
    const img = tela.querySelector('.visor-img');
    img.src = visor.fotos[visor.indice];
    img.alt = `${visor.nome}, foto ${visor.indice + 1}`;
    tela.querySelector('.visor-contador').textContent = `${visor.indice + 1} / ${visor.fotos.length}`;
    tela.querySelectorAll('.visor-seta').forEach((b) => { b.hidden = visor.fotos.length < 2; });
  }
  function fecharVisor() {
    document.getElementById('visor-fotos').hidden = true;
    document.body.classList.remove('visor-aberto');
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

  // "Novo": produto que entrou numa atualização recente do estoque.
  function seloNovoHTML(p) {
    if (!p.novo_desde) return '';
    const dias = (Date.now() - Date.parse(`${p.novo_desde}T12:00:00`)) / 86400000;
    return dias <= DIAS_NOVO ? '<span class="selo-novo">Novo</span>' : '';
  }

  function tempoParado(dias) {
    if (dias >= 365) {
      const anos = Math.floor(dias / 365);
      return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
    }
    return dias >= 60 ? `${Math.floor(dias / 30)} meses` : `${dias} dias`;
  }

  // Tempo parado: aparece só com o filtro "Parados".
  function seloParadoHTML(p) {
    if (!estado.filtroParados || !parado(p)) return '';
    const tempo = tempoParado(p._diasParado);
    return `<span class="selo-parado" title="Parado há ${tempo}">${icone('ampulheta')}${tempo}</span>`;
  }

  function marcadorHTML(p, selecionado) {
    return `<button type="button" class="marcador" data-acao="selecionar" aria-pressed="${selecionado}" aria-label="Selecionar ${escapar(p.nome)}">${icone('check')}</button>`;
  }

  function cartaoHTML(p) {
    const id = `detalhes-${p._loja}-${p.codigo}`;
    const selecionado = estado.selecionados.has(p._chave);
    return `<li class="card${selecionado ? ' selecionado' : ''}" data-chave="${escapar(p._chave)}">
  <div class="linha-nome">${marcadorHTML(p, selecionado)}<h2 class="nome" title="${escapar(p.nome)}">${escapar(p.nome)}</h2>${seloParadoHTML(p)}${seloNovoHTML(p)}${seloLojaHTML(p._loja)}</div>
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
    el.filtroParados.hidden = !estado.filtroParados;
    el.filtroFornecedorNome.textContent = estado.fornecedor || '';
    let fornecedoresHTML = '';
    let titulo = ''; // busca sem resultado já avisa na contagem
    if (semDados) {
      titulo = todasAsLojas() ? 'Estoque das lojas ainda não cadastrado' : `Estoque de ${rotuloLoja(lojaAtual())} ainda não cadastrado`;
    } else if (estado.fornecedor) {
      if (!consulta) titulo = 'Nenhum produto deste fornecedor aqui';
      fornecedoresHTML = `<button type="button" class="botao-secundario" data-acao="tirar-fornecedor">${icone('cancelar')}Tirar o filtro de fornecedor</button>`;
    } else if (estado.filtroParados) {
      if (!consulta) titulo = 'Nenhum produto parado aqui';
      fornecedoresHTML = `<button type="button" class="botao-secundario" data-acao="tirar-parados">${icone('cancelar')}Tirar o filtro de parados</button>`;
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
    atualizarBotaoSelecionar();
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
    const ancora = [el.filtroParados, el.filtroFornecedor, el.barraResultados].find((e) => !e.hidden) || el.lista;
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
    const parados = estado.filtroParados ? 0
      : estado.produtos.filter((p) => (!estado.fornecedor || p.fornecedor === estado.fornecedor) && parado(p)).length;
    const chipParados = parados
      ? `<button type="button" class="atalho atalho-parados" data-acao="parados">${icone('ampulheta')}<span>Parados</span><span class="atalho-qtd">${parados}</span></button>`
      : '';
    el.atalhos.innerHTML = chipParados + ATALHOS.map(([termo, nomeIcone]) => {
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
    if (status === 'vendido' && !item.venda) abrirVenda(item);
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
  <div class="linha-nome"><h2 class="nome" title="${escapar(p.nome)}">${escapar(p.nome)}</h2>${atual ? seloNovoHTML(atual) : ''}${seloLojaHTML(item.loja)}</div>
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
  ${s.id === 'vendido' || s.id === 'entregue' ? `<button type="button" class="botao-comprovante" data-acao="comprovante">${icone('recibo')}${item.venda ? 'Comprovante de venda' : 'Gerar comprovante'}</button>` : ''}
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
    renderizarPainelVendas(daLoja);
    el.vazioAnunciados.hidden = daLoja.length > 0;
  }

  function atualizarContadorAnunciados() {
    const total = anunciadosDaLoja().length;
    el.contador.hidden = total === 0;
    el.contador.textContent = total > 99 ? '99+' : String(total);
    el.abaAnunciados.setAttribute('aria-label', total ? `Anunciados: ${total}` : 'Anunciados');
  }

  // ---------------------------------------------------------------- administrador: preço de compra e sobra

  function custoDe(p) {
    if (!chaveAdmin || !estado.custos || !p._loja) return undefined;
    const custos = estado.custos[p._loja];
    return custos ? custos[p.codigo] : undefined;
  }

  const faixa = (menor, maior) => (menor === maior ? reais(menor) : `${reais(menor)} a ${reais(maior)}`);

  // O que sobra para a loja em cada venda: valor pago − preço de compra − imposto de saída − comissão
  // (do preço com o desconto máximo até o preço cheio).
  function linhasSobra(p, custo) {
    const linhas = [['Preço de compra', reais(Math.round(custo * 100))]];
    if (semPreco(p)) return linhas;
    const conta = calcular(p.preco, estado.comissao, estado.desconto);
    const custoCentavos = Math.round(custo * 100);
    const imposto = (valor) => Math.round(valor * estado.imposto / 100);
    const sobraCheio = conta.cheio - custoCentavos - imposto(conta.cheio) - conta.ganhoCheio;
    const sobraMinimo = conta.minimo - custoCentavos - imposto(conta.minimo) - conta.ganhoMinimo;
    if (estado.imposto > 0) linhas.push([`Imposto (${percentual(estado.imposto)})`, faixa(imposto(conta.minimo), imposto(conta.cheio))]);
    const classe = Math.min(sobraMinimo, sobraCheio) < 0 ? ' class="negativo"' : '';
    linhas.push(['Sobra', `<strong${classe}>${faixa(sobraMinimo, sobraCheio)}</strong>`]);
    return linhas;
  }

  // Redesenha os detalhes já na tela (abertos continuam abertos).
  function atualizarDetalhes() {
    for (const cartao of el.lista.children) {
      const p = estado.porChave.get(cartao.dataset.chave);
      const lista = cartao.querySelector('dl.detalhes');
      if (p && lista) lista.outerHTML = detalhesHTML(p, lista.id, !lista.hidden);
    }
    if (estado.tela === 'anunciados') renderizarAnunciados();
  }

  async function carregarCustos() {
    if (!chaveAdmin) return;
    try {
      const resposta = await chamarServidor('/api/custos', { chave: chaveAdmin });
      estado.custos = resposta.custos || {};
      atualizarDetalhes();
    } catch (erro) {
      if (erro.status === 401) sairAdmin();
    }
  }

  // ---------------------------------------------------------------- venda: dados do cliente e comprovante

  const EMISSOR = ['AV. GUANAMBI, 41 - CENTRO', 'MATINA - BA · CEP 46480-000', 'CNPJ 31.598.445/0001-49'];
  const PAGAMENTOS = { pix: 'PIX', dinheiro: 'DINHEIRO', credito: 'CARTÃO DE CRÉDITO', debito: 'CARTÃO DE DÉBITO' };
  const CHAVE_NUMERO = 'estoque-yella:comprovante';
  const FONTE_CUPOM = 'Share Tech Mono';
  const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let vendaAtual = null;
  let valorEditado = false;
  let comprovanteAtual = null;
  const assinatura = { desenhando: false, vazia: true, ultimo: null };

  const produtoDoAnuncio = (item) => estado.porChave.get(chaveAnuncio(item))
    || { nome: item.nome, preco: item.preco, codigo: item.codigo, _loja: item.loja };

  function formatarCpf(texto) {
    const d = String(texto || '').replace(/\D/g, '').slice(0, 11);
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }

  function cpfValido(cpf) {
    const d = String(cpf).replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const digito = (n) => {
      let soma = 0;
      for (let i = 0; i < n; i += 1) soma += Number(d[i]) * (n + 1 - i);
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
  }

  // "1.038,50", "1038,5", "1038.50", "R$ 1.038" -> centavos
  function lerValor(texto) {
    const limpo = String(texto || '').replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    const valor = Number(limpo);
    return limpo && Number.isFinite(valor) ? Math.round(valor * 100) : NaN;
  }

  // Pix leva o desconto máximo (o mesmo da mensagem do WhatsApp); os outros, o preço cheio.
  function valorPadrao(p, pagamento) {
    if (semPreco(p)) return 0;
    const conta = calcular(p.preco, 0, estado.desconto);
    return pagamento === 'pix' ? conta.minimo : conta.cheio;
  }

  function montarParcelas(escolhida) {
    const valor = lerValor(el.vendaValor.value) || 0;
    const maximo = Math.max(1, Math.min(PARCELAS_SEM_JUROS, Math.floor(valor / PARCELA_MINIMA)));
    const atual = Math.min(escolhida || Number(el.vendaParcelas.value) || maximo, maximo);
    el.vendaParcelas.innerHTML = Array.from({ length: maximo }, (_, i) => i + 1)
      .map((n) => `<option value="${n}"${n === atual ? ' selected' : ''}>${n}x de ${reais(Math.round(valor / n))}</option>`).join('');
    el.vendaParcelasCampo.hidden = el.vendaPagamento.value !== 'credito';
  }

  function erroVenda(texto, campo) {
    el.vendaErro.textContent = texto;
    el.vendaErro.hidden = false;
    if (campo) campo.focus();
  }

  function limparAssinatura() {
    el.vendaAssinatura.getContext('2d').clearRect(0, 0, el.vendaAssinatura.width, el.vendaAssinatura.height);
    assinatura.vazia = true;
  }

  function prepararAssinatura() {
    const tela = el.vendaAssinatura;
    const ctx = tela.getContext('2d');
    const ponto = (e) => {
      const r = tela.getBoundingClientRect();
      return { x: (e.clientX - r.left) * tela.width / r.width, y: (e.clientY - r.top) * tela.height / r.height };
    };
    const tracar = (de, ate) => {
      ctx.strokeStyle = '#1d1b16';
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(de.x, de.y);
      ctx.lineTo(ate.x, ate.y);
      ctx.stroke();
    };
    tela.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tela.setPointerCapture(e.pointerId);
      assinatura.desenhando = true;
      assinatura.ultimo = ponto(e);
      tracar(assinatura.ultimo, { x: assinatura.ultimo.x + 0.1, y: assinatura.ultimo.y });
      assinatura.vazia = false;
    });
    tela.addEventListener('pointermove', (e) => {
      if (!assinatura.desenhando) return;
      const atual = ponto(e);
      tracar(assinatura.ultimo, atual);
      assinatura.ultimo = atual;
    });
    const fim = () => { assinatura.desenhando = false; };
    tela.addEventListener('pointerup', fim);
    tela.addEventListener('pointercancel', fim);
  }

  function abrirVenda(item) {
    vendaAtual = item;
    const p = produtoDoAnuncio(item);
    const v = item.venda || {};
    const c = v.cliente || {};
    el.vendaProduto.textContent = p.nome;
    el.vendaNome.value = c.nome || '';
    el.vendaCpf.value = c.cpf || '';
    el.vendaTelefone.value = c.telefone || '';
    el.vendaEndereco.value = c.endereco || '';
    el.vendaBairro.value = c.bairro || '';
    el.vendaPagamento.value = v.pagamento || 'pix';
    // valor igual ao padrão da forma de pagamento salva: trocar a forma ainda atualiza o valor
    valorEditado = v.valor != null && Math.round(v.valor * 100) !== valorPadrao(p, v.pagamento);
    el.vendaValor.value = decimal.format((v.valor != null ? Math.round(v.valor * 100) : valorPadrao(p, el.vendaPagamento.value)) / 100);
    montarParcelas(v.parcelas);
    limparAssinatura();
    if (v.assinatura) {
      const imagem = new Image();
      imagem.onload = () => el.vendaAssinatura.getContext('2d').drawImage(imagem, 0, 0);
      imagem.src = v.assinatura;
      assinatura.vazia = false;
    }
    el.vendaErro.hidden = true;
    esconderToast();
    el.modalVenda.hidden = false;
    el.modalVenda.scrollTop = 0;
    travarFundo(true);
    el.vendaNome.focus();
  }

  function fecharVenda() {
    el.modalVenda.hidden = true;
    vendaAtual = null;
    travarFundo(false);
  }

  function proximoNumero() {
    let numero = 0;
    try { numero = Number(localStorage.getItem(CHAVE_NUMERO)) || 0; } catch (e) { /* sem armazenamento */ }
    numero += 1;
    try { localStorage.setItem(CHAVE_NUMERO, String(numero)); } catch (e) { /* sem armazenamento */ }
    return `${iniciaisDe(estado.nome) || 'YM'}-${String(numero).padStart(6, '0')}`;
  }

  function concluirVenda(evento) {
    evento.preventDefault();
    const nome = limparNome(el.vendaNome.value);
    const cpf = el.vendaCpf.value.trim();
    const valor = lerValor(el.vendaValor.value);
    if (!nome) return erroVenda('Digite o nome do cliente.', el.vendaNome);
    if (cpf && !cpfValido(cpf)) return erroVenda('CPF inválido. Confira os números.', el.vendaCpf);
    if (!(valor > 0)) return erroVenda('Informe o valor da venda.', el.vendaValor);
    const item = vendaAtual;
    const anterior = item.venda || {};
    item.venda = {
      numero: anterior.numero || proximoNumero(),
      data: anterior.data || new Date().toISOString(),
      vendedor: anterior.vendedor || estado.nome,
      telefoneVendedor: anterior.telefoneVendedor != null ? anterior.telefoneVendedor : estado.telefone,
      cliente: {
        nome,
        cpf: formatarCpf(cpf),
        telefone: el.vendaTelefone.value.trim() ? formatarTelefone(el.vendaTelefone.value) : '',
        endereco: limparNome(el.vendaEndereco.value),
        bairro: limparNome(el.vendaBairro.value),
      },
      pagamento: el.vendaPagamento.value,
      parcelas: el.vendaPagamento.value === 'credito' ? Number(el.vendaParcelas.value) || 1 : 1,
      valor: valor / 100,
      comissao: anterior.comissao != null ? anterior.comissao : estado.comissao,
      assinatura: assinatura.vazia ? '' : el.vendaAssinatura.toDataURL('image/png'),
    };
    item.atualizadoEm = new Date().toISOString();
    salvarAnunciados();
    fecharVenda();
    renderizarAnunciados();
    mostrarComprovante(item);
    return undefined;
  }

  // ---- imagem no estilo de cupom (impressora térmica)

  let fonteCupom = null;
  function carregarFonteCupom() {
    if (!fonteCupom) {
      fonteCupom = new Promise((pronto) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${FONTE_CUPOM.replace(/ /g, '+')}&display=block`;
        link.onload = () => document.fonts.load(`24px "${FONTE_CUPOM}"`).then(pronto, pronto);
        link.onerror = pronto;
        document.head.appendChild(link);
        setTimeout(pronto, 4000); // sem internet: usa a fonte do aparelho
      });
    }
    return fonteCupom;
  }

  const carregarImagem = (fonte) => new Promise((pronto) => {
    const imagem = new Image();
    imagem.onload = () => pronto(imagem);
    imagem.onerror = () => pronto(null);
    imagem.src = fonte;
  });

  function dataHoraCompleta(iso) {
    const d = new Date(iso);
    return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()} ${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
  }

  async function desenharComprovante(item) {
    await carregarFonteCupom();
    const v = item.venda;
    const p = produtoDoAnuncio(item);
    const loja = lojaPorId(item.loja);
    const ESCALA = 2;
    const PAPEL = 560;
    const MARGEM = 26;
    const RECUO = 30;
    const TAM = 21;
    const ALTURA = 29;
    const familia = `"${FONTE_CUPOM}", "Courier New", monospace`;
    const medidor = document.createElement('canvas').getContext('2d');
    medidor.font = `${TAM}px ${familia}`;
    const colunas = Math.floor((PAPEL - RECUO * 2) / medidor.measureText('M').width);
    const maiusculo = (t) => String(t || '').toLocaleUpperCase('pt-BR');

    const quebrar = (texto, largura) => {
      const linhas = [];
      let atual = '';
      for (const palavra of maiusculo(texto).split(/[ \t\n]+/).filter(Boolean)) { // espaço rígido (R$ 10,00) não quebra
        if (!atual) atual = palavra;
        else if ((atual + ' ' + palavra).length <= largura) atual += ' ' + palavra;
        else { linhas.push(atual); atual = palavra; }
        while (atual.length > largura) { linhas.push(atual.slice(0, largura)); atual = atual.slice(largura); }
      }
      if (atual) linhas.push(atual);
      return linhas.length ? linhas : [''];
    };

    const blocos = [];
    const texto = (t, op = {}) => blocos.push({ tipo: 'texto', t: maiusculo(t), ...op });
    const duas = (esq, dir, op = {}) => blocos.push({ tipo: 'duas', esq: maiusculo(esq), dir: maiusculo(dir), ...op });
    const traco = () => blocos.push({ tipo: 'texto', t: '-'.repeat(colunas) });
    const espaco = (altura) => blocos.push({ tipo: 'espaco', altura });

    texto('Yêlla Móveis', { tam: 36, negrito: true, centro: true, altura: 46 });
    for (const linha of EMISSOR) texto(linha, { centro: true });
    traco();
    texto('Comprovante de venda', { negrito: true, centro: true, tam: 24, altura: 32 });
    traco();
    duas(`Nº ${v.numero}`, dataHoraCompleta(v.data));
    if (v.vendedor) texto(`Vendedor: ${v.vendedor}`);
    if (v.telefoneVendedor) texto(`Tel.: ${v.telefoneVendedor}`);
    traco();
    texto('Cliente', { negrito: true });
    for (const [rotulo, valor] of [['Nome', v.cliente.nome], ['CPF', v.cliente.cpf], ['Tel.', v.cliente.telefone], ['End.', v.cliente.endereco], ['Bairro', v.cliente.bairro]]) {
      if (!valor) continue;
      quebrar(`${rotulo}: ${valor}`, colunas).forEach((linha) => texto(linha));
    }
    traco();
    duas('Cód.   Descrição', '');
    quebrar(p.nome, colunas - 7).forEach((linha, i) => texto(`${i ? '       ' : String(p.codigo).padEnd(7)}${linha}`));
    const cheio = semPreco(p) ? Math.round(v.valor * 100) : Math.round(p.preco * 100);
    const total = Math.round(v.valor * 100);
    duas(`       1 x ${reais(cheio)}`, reais(cheio));
    traco();
    duas('Subtotal', reais(cheio));
    if (total < cheio) duas('Desconto', `-${reais(cheio - total)}`);
    if (total > cheio) duas('Acréscimo', `+${reais(total - cheio)}`);
    duas('Total', reais(total), { negrito: true, tam: 26, altura: 36 });
    traco();
    const pagamento = v.pagamento === 'credito'
      ? `${PAGAMENTOS.credito} ${v.parcelas > 1 ? `${v.parcelas}x\u00a0de\u00a0${reais(Math.round(total / v.parcelas))}` : 'à\u00a0vista'}`
      : PAGAMENTOS[v.pagamento];
    quebrar(`Pagamento: ${pagamento}`, colunas).forEach((linha) => texto(linha));
    texto('Entrega: grátis');
    if (loja) texto(`Estoque: loja de ${rotuloLoja(loja)}`);
    traco();
    quebrar('Confirmo que os dados acima estão corretos.', colunas).forEach((linha) => texto(linha));
    const imagemAssinatura = v.assinatura ? await carregarImagem(v.assinatura) : null;
    if (imagemAssinatura) blocos.push({ tipo: 'assinatura', imagem: imagemAssinatura, altura: 120 });
    else espaco(70);
    texto('_'.repeat(colunas - 4), { centro: true });
    texto('Assinatura do cliente', { centro: true });
    traco();
    texto('Não é documento fiscal', { negrito: true, centro: true });
    texto('Obrigado pela preferência!', { centro: true });

    const alturaTexto = blocos.reduce((soma, b) => soma + (b.altura || ALTURA), 0);
    const largura = PAPEL + MARGEM * 2;
    const altura = alturaTexto + MARGEM * 2 + 70;
    const tela = document.createElement('canvas');
    tela.width = largura * ESCALA;
    tela.height = altura * ESCALA;
    const ctx = tela.getContext('2d');
    ctx.scale(ESCALA, ESCALA);
    ctx.fillStyle = '#e8e6e0';
    ctx.fillRect(0, 0, largura, altura);

    // papel com as bordas picotadas
    const esquerda = MARGEM;
    const direita = MARGEM + PAPEL;
    const topo = MARGEM;
    const base = altura - MARGEM;
    const dente = 9;
    ctx.beginPath();
    ctx.moveTo(esquerda, topo + dente);
    for (let x = esquerda; x < direita; x += dente * 2) {
      ctx.lineTo(Math.min(x + dente, direita), topo);
      ctx.lineTo(Math.min(x + dente * 2, direita), topo + dente);
    }
    ctx.lineTo(direita, base - dente);
    for (let x = direita; x > esquerda; x -= dente * 2) {
      ctx.lineTo(Math.max(x - dente, esquerda), base);
      ctx.lineTo(Math.max(x - dente * 2, esquerda), base - dente);
    }
    ctx.closePath();
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, .18)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#fffdf6';
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#26231e';
    ctx.textBaseline = 'middle';
    const escrever = (t, x, y, negrito) => {
      ctx.fillText(t, x, y);
      if (negrito) ctx.fillText(t, x + 0.7, y);
    };
    let y = topo + 36;
    for (const b of blocos) {
      const h = b.altura || ALTURA;
      ctx.font = `${b.tam || TAM}px ${familia}`;
      if (b.tipo === 'texto') {
        const x = b.centro ? (largura - ctx.measureText(b.t).width) / 2 : esquerda + RECUO;
        escrever(b.t, x, y + h / 2, b.negrito);
      } else if (b.tipo === 'duas') {
        escrever(b.esq, esquerda + RECUO, y + h / 2, b.negrito);
        escrever(b.dir, direita - RECUO - ctx.measureText(b.dir).width, y + h / 2, b.negrito);
      } else if (b.tipo === 'assinatura') {
        const larguraImagem = Math.min(PAPEL - RECUO * 2, b.imagem.width * (h / b.imagem.height));
        ctx.drawImage(b.imagem, (largura - larguraImagem) / 2, y, larguraImagem, h);
      }
      y += h;
    }
    return tela;
  }

  // PDF de uma página com a imagem do comprovante (largura de bobina de 80 mm)
  function pdfDoComprovante(tela) {
    const jpeg = atob(tela.toDataURL('image/jpeg', 0.92).split(',')[1]);
    const larguraPt = 226.77;
    const alturaPt = +(larguraPt * tela.height / tela.width).toFixed(2);
    const partes = [];
    const posicoes = [];
    let tamanho = 0;
    const juntar = (t) => { partes.push(t); tamanho += t.length; };
    const objeto = (n, corpo) => { posicoes[n] = tamanho; juntar(`${n} 0 obj\n${corpo}\nendobj\n`); };
    juntar('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
    objeto(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objeto(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${larguraPt} ${alturaPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    posicoes[4] = tamanho;
    juntar(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${tela.width} /Height ${tela.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    juntar(jpeg);
    juntar('\nendstream\nendobj\n');
    const conteudo = `q ${larguraPt} 0 0 ${alturaPt} 0 0 cm /Im0 Do Q`;
    objeto(5, `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
    const inicioXref = tamanho;
    juntar(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(posicoes[n]).padStart(10, '0')} 00000 n \n`).join('')}`);
    juntar(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);
    const binario = partes.join('');
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i) & 0xff;
    return new Blob([bytes], { type: 'application/pdf' });
  }

  function baixarArquivo(blob, nome) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const imagemDoComprovante = () => new Promise((pronto) => { comprovanteAtual.tela.toBlob(pronto, 'image/png'); });

  async function mostrarComprovante(item) {
    const tela = await desenharComprovante(item);
    comprovanteAtual = { item, tela, nome: `comprovante-${item.venda.numero}` };
    el.comprovanteImagem.src = tela.toDataURL('image/png');
    el.modalComprovante.hidden = false;
    el.modalComprovante.scrollTop = 0;
    travarFundo(true);
    el.comprovanteEnviar.focus();
  }

  function fecharComprovante() {
    el.modalComprovante.hidden = true;
    comprovanteAtual = null;
    travarFundo(false);
  }

  // No celular abre o compartilhamento (WhatsApp); no computador, baixa a imagem.
  async function enviarComprovante() {
    if (!comprovanteAtual) return;
    const blob = await imagemDoComprovante();
    const arquivo = new File([blob], `${comprovanteAtual.nome}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: 'Comprovante de venda' });
        return;
      } catch (erro) {
        if (erro.name === 'AbortError') return;
      }
    }
    baixarArquivo(blob, arquivo.name);
  }

  // ---- vendas do mês (aba Anunciados)

  function dataDaVenda(item) {
    if (item.venda && item.venda.data) return item.venda.data;
    const registro = [...item.historico].reverse().find((h) => h.status === 'vendido');
    return registro ? registro.em : item.atualizadoEm;
  }

  function renderizarPainelVendas(lista) {
    const vendidos = lista.filter((a) => a.status === 'vendido' || a.status === 'entregue');
    el.painelVendas.hidden = !vendidos.length;
    if (!vendidos.length) return;
    const hoje = new Date();
    if (!estado.mesVendas) estado.mesVendas = { ano: hoje.getFullYear(), mes: hoje.getMonth() };
    const { ano, mes } = estado.mesVendas;
    const doMes = vendidos.filter((a) => {
      const d = new Date(dataDaVenda(a));
      return d.getFullYear() === ano && d.getMonth() === mes;
    });
    let total = 0;
    let comissao = 0;
    for (const a of doMes) {
      const valor = Math.round((a.venda ? a.venda.valor : a.preco) * 100);
      const percentualVenda = a.venda && a.venda.comissao != null ? a.venda.comissao : estado.comissao;
      total += valor;
      comissao += Math.round(valor * percentualVenda / 100);
    }
    const nomeMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(ano, mes, 1));
    el.vendasMes.textContent = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);
    el.vendasNumeros.innerHTML = `${doMes.length} ${doMes.length === 1 ? 'venda' : 'vendas'} · ${reais(total)}`
      + `<span class="vendas-comissao"> · comissão ${reais(comissao)}</span>`;
    el.mesProximo.disabled = ano === hoje.getFullYear() && mes === hoje.getMonth();
  }

  function mudarMesVendas(passo) {
    const { ano, mes } = estado.mesVendas;
    const data = new Date(ano, mes + passo, 1);
    estado.mesVendas = { ano: data.getFullYear(), mes: data.getMonth() };
    renderizarPainelVendas(anunciadosDaLoja());
  }

  // ---------------------------------------------------------------- "Parados" e seleção de vários produtos

  function ativarParados() {
    estado.filtroParados = true;
    if (estado.ordem !== 'parado') estado.ordemAntesParados = estado.ordem;
    estado.ordem = 'parado'; // mais parado primeiro; tocar num classificador troca a ordem
    clearTimeout(esperaBusca);
    el.busca.value = '';
    el.limpar.hidden = true;
    estado.consulta = '';
    atualizarOrdens();
    montarAtalhos();
    atualizarLista();
    voltarAoTopoDaLista();
  }

  function desativarParados() {
    estado.filtroParados = false;
    if (estado.ordem === 'parado') estado.ordem = estado.ordemAntesParados || 'az';
    atualizarOrdens();
    montarAtalhos();
    atualizarLista();
    voltarAoTopoDaLista();
  }

  function atualizarBotaoSelecionar() {
    el.selecionar.hidden = estado.selecionando || estado.resultado.length < 2;
    el.barraResultados.hidden = el.contagem.hidden && el.selecionar.hidden;
  }

  function atualizarBarraSelecao() {
    const total = estado.selecionados.size;
    el.barraSelecao.hidden = !estado.selecionando;
    el.selecaoTexto.textContent = `${total} ${total === 1 ? 'selecionado' : 'selecionados'}`;
    el.selecaoEnviar.classList.toggle('desativado', !total);
    if (total) el.selecaoEnviar.href = 'https://wa.me/?text=' + encodeURIComponent(mensagemVarios([...estado.selecionados.values()]));
    else el.selecaoEnviar.removeAttribute('href');
  }

  function marcarCartao(cartao) {
    const selecionado = estado.selecionados.has(cartao.dataset.chave);
    cartao.classList.toggle('selecionado', selecionado);
    const marcador = cartao.querySelector('.marcador');
    if (marcador) marcador.setAttribute('aria-pressed', String(selecionado));
  }

  function entrarSelecao() {
    estado.selecionando = true;
    document.body.classList.add('selecionando');
    atualizarBotaoSelecionar();
    atualizarBarraSelecao();
  }

  function sairSelecao() {
    estado.selecionando = false;
    estado.selecionados.clear();
    document.body.classList.remove('selecionando');
    for (const cartao of el.lista.children) marcarCartao(cartao);
    atualizarBotaoSelecionar();
    atualizarBarraSelecao();
  }

  function alternarSelecao(cartao) {
    const p = estado.porChave.get(cartao.dataset.chave);
    if (!p) return;
    if (estado.selecionados.has(p._chave)) {
      estado.selecionados.delete(p._chave);
    } else if (estado.selecionados.size >= MAX_SELECAO) {
      mostrarToast(`Até ${MAX_SELECAO} produtos por mensagem.`);
      return;
    } else {
      estado.selecionados.set(p._chave, p);
    }
    marcarCartao(cartao);
    atualizarBarraSelecao();
  }

  // ---------------------------------------------------------------- abas

  const telaDoEndereco = () => (location.hash === '#anunciados' ? 'anunciados' : 'estoque');

  function mostrarTela(tela) {
    if (tela === estado.tela) return;
    if (tela !== 'estoque' && estado.selecionando) sairSelecao();
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
    atualizarBarraSelecao();
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
        ordem: estado.ordem === 'parado' ? estado.ordemAntesParados : estado.ordem,
        tema: estado.tema,
        contas: estado.mostrarContas ? 'mostrar' : 'ocultar',
        imposto: el.imposto.value.trim(),
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
      atualizarDetalhes(); // a sobra (modo administrador) depende da comissão e do desconto
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
    if (!estado.fotos) estado.fotos = await buscarJSON('dados/fotos.json').catch(() => ({}));
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
    el.imposto.value = salvos.imposto || '';
    formatarCampo(el.imposto);
    estado.imposto = lerPercentual(el.imposto.value);
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
    montarAdmin(); // os campos de arquivo dependem das lojas
    carregarCustos();
  }

  // ---------------------------------------------------------------- administrador: atualização do estoque

  // Servidor que lê os relatórios do sistema e publica o estoque novo para todos (Google Cloud Run).
  const SERVIDOR = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://127.0.0.1:8090'
    : 'https://estoque-yella-admin-858376181662.southamerica-east1.run.app';
  const CHAVE_ADMIN_LOCAL = 'estoque-yella:admin';
  let chaveAdmin = '';
  let ultimoRelatorio = null;

  function lerChaveAdmin() {
    try { return localStorage.getItem(CHAVE_ADMIN_LOCAL) || ''; } catch (e) { return ''; }
  }

  function salvarChaveAdmin(chave) {
    chaveAdmin = chave;
    try {
      if (chave) localStorage.setItem(CHAVE_ADMIN_LOCAL, chave);
      else localStorage.removeItem(CHAVE_ADMIN_LOCAL);
    } catch (e) { /* sem armazenamento: vale só enquanto a página estiver aberta */ }
  }

  function erroAdmin(texto) {
    el.adminErro.textContent = texto || '';
    el.adminErro.hidden = !texto;
  }

  function montarAdmin() {
    el.adminEntrar.hidden = Boolean(chaveAdmin);
    el.adminPainel.hidden = !chaveAdmin;
    if (chaveAdmin) montarArquivosAdmin();
  }

  // Um campo de arquivo para cada loja (a que tem arquivo de dados).
  function montarArquivosAdmin() {
    const lojas = estado.lojas.filter((l) => l.arquivo);
    const atuais = [...el.adminArquivos.querySelectorAll('input[type="file"]')].map((c) => c.dataset.loja).join();
    if (atuais === lojas.map((l) => l.id).join()) return; // já montados (mantém os arquivos escolhidos)
    el.adminArquivos.innerHTML = lojas.map((loja) => (
      `<label class="arquivo" data-loja="${escapar(loja.id)}">${icone('arquivo')}`
      + `<span class="arquivo-textos"><span class="arquivo-loja">${escapar(rotuloLoja(loja))}</span>`
      + '<span class="arquivo-nome">Escolher relatório</span></span>'
      + `<input class="sr-only" type="file" accept=".html,.htm,text/html" data-loja="${escapar(loja.id)}"></label>`
    )).join('');
  }

  function limparRelatorio() {
    ultimoRelatorio = null;
    el.adminRelatorio.hidden = true;
    el.adminRelatorio.innerHTML = '';
    el.adminPublicar.hidden = true;
  }

  async function chamarServidor(caminho, corpo) {
    const json = !(corpo instanceof FormData);
    let resposta;
    try {
      resposta = await fetch(SERVIDOR + caminho, {
        method: 'POST',
        body: json ? JSON.stringify(corpo) : corpo,
        headers: json ? { 'Content-Type': 'application/json' } : undefined,
      });
    } catch (erro) {
      throw Object.assign(new Error('Sem conexão com o servidor. Confira a internet e tente de novo.'), { status: 0 });
    }
    let dados = {};
    try { dados = await resposta.json(); } catch (erro) { /* resposta sem corpo */ }
    if (!resposta.ok || !dados.ok) {
      throw Object.assign(new Error(dados.erro || 'Não foi possível concluir agora. Tente de novo em alguns minutos.'), { status: resposta.status });
    }
    return dados;
  }

  function ocupado(botao, texto) {
    if (texto) {
      botao.dataset.texto = botao.textContent;
      botao.textContent = texto;
      botao.disabled = true;
    } else {
      if (botao.dataset.texto) botao.textContent = botao.dataset.texto;
      botao.disabled = false;
    }
  }

  async function entrarAdmin(evento) {
    evento.preventDefault();
    const chave = el.chaveAdmin.value.trim();
    if (!chave) return;
    erroAdmin('');
    ocupado(el.adminBotaoEntrar, '…');
    try {
      await chamarServidor('/api/entrar', { chave });
      salvarChaveAdmin(chave);
      el.chaveAdmin.value = '';
      montarAdmin();
      carregarCustos();
    } catch (erro) {
      erroAdmin(erro.message);
    } finally {
      ocupado(el.adminBotaoEntrar);
    }
  }

  function sairAdmin() {
    salvarChaveAdmin('');
    estado.custos = null;
    atualizarDetalhes();
    limparRelatorio();
    erroAdmin('');
    el.adminArquivos.innerHTML = '';
    montarAdmin();
  }

  function relatorioLojaHTML(l) {
    const item = (classe, simbolo, nome, valor) => `<li class="mudanca ${classe}">`
      + `<span class="mudanca-ic" aria-hidden="true">${simbolo}</span>`
      + `<span class="mudanca-nome" title="${escapar(nome)}">${escapar(nome)}</span>`
      + `<span class="mudanca-valor">${valor}</span></li>`;
    const preco = (valor) => reais(Math.round(valor * 100));
    const itens = [
      ...l.quantidade.map((p) => item(p.depois > p.antes ? 'sobe' : 'desce', p.depois > p.antes ? '▲' : '▼', p.nome,
        `${numero.format(p.antes)} → ${numero.format(p.depois)}`)),
      ...l.novos.map((p) => item('novo', '+', p.nome, `${numero.format(p.quantidade)} un.`)),
      ...l.removidos.map((p) => item('saiu', '−', p.nome, 'saiu')),
      ...l.preco.map((p) => item('preco', 'R$', p.nome, `${preco(p.antes)} → ${preco(p.depois)}`)),
    ];
    const [produtosAntes, produtosDepois] = l.produtos;
    const [unidadesAntes, unidadesDepois] = l.unidades;
    return `<section class="relatorio-loja">
  <div class="relatorio-topo"><strong>${escapar(l.loja)}</strong><span>${l.gerado_em ? dataHoraBR(l.gerado_em) : ''}</span></div>
  <p class="relatorio-totais">${numero.format(produtosAntes)} → ${numero.format(produtosDepois)} produtos · ${numero.format(unidadesAntes)} → ${numero.format(unidadesDepois)} unidades</p>
  ${itens.length ? `<ul class="mudancas">${itens.join('')}</ul>` : '<p class="relatorio-nada">Nenhuma mudança de estoque ou preço</p>'}
  ${l.queda_grande ? `<p class="relatorio-alerta">${numero.format(l.removidos.length)} produtos saíram de uma vez. Confira se o relatório está completo.</p>` : ''}
  ${l.avisos.map((aviso) => `<p class="relatorio-alerta">${escapar(aviso)}</p>`).join('')}
  ${l.nomes_automaticos.length ? `<div class="revisar"><strong>Nomes automáticos (confira)</strong><ul>${l.nomes_automaticos.map((n) => (
    `<li><span class="sistema">${escapar(n.sistema)}</span> → ${escapar(n.nome)}</li>`)).join('')}</ul></div>` : ''}
</section>`;
  }

  function mostrarRelatorio(relatorio) {
    ultimoRelatorio = relatorio;
    el.adminRelatorio.innerHTML = relatorio.lojas.map(relatorioLojaHTML).join('');
    el.adminRelatorio.hidden = false;
    const temPublicacao = relatorio.lojas.some((l) => l.arquivo_muda);
    el.adminPublicar.hidden = !temPublicacao;
    el.adminPublicar.textContent = relatorio.bloqueado ? 'Publicar mesmo assim' : 'Publicar';
  }

  function arquivosEscolhidos() {
    return [...el.adminArquivos.querySelectorAll('input[type="file"]')].filter((c) => c.files && c.files[0]);
  }

  async function enviarRelatorios(publicar) {
    const campos = arquivosEscolhidos();
    if (!campos.length) {
      erroAdmin('Escolha o relatório de pelo menos uma loja.');
      return;
    }
    erroAdmin('');
    const corpo = new FormData();
    corpo.append('chave', chaveAdmin);
    corpo.append('autor', estado.nome);
    if (publicar) {
      corpo.append('publicar', '1');
      if (ultimoRelatorio && ultimoRelatorio.bloqueado) corpo.append('confirmar_queda', '1');
    }
    for (const campo of campos) corpo.append(`arquivo_${campo.dataset.loja}`, campo.files[0]);
    const botao = publicar ? el.adminPublicar : el.adminConferir;
    ocupado(botao, publicar ? 'Publicando…' : 'Conferindo…');
    try {
      const relatorio = await chamarServidor('/api/atualizar', corpo);
      if (publicar) {
        el.adminPublicar.hidden = true;
        const aviso = relatorio.publicado
          ? '<p class="relatorio-resultado">Publicado. O site atualiza para todos em cerca de 1 minuto.</p>'
          : '<p class="relatorio-nada">Nada novo para publicar.</p>';
        el.adminRelatorio.insertAdjacentHTML('afterbegin', aviso);
        if (relatorio.publicado) acompanharPublicacao(relatorio.lojas.filter((l) => l.arquivo_muda));
        carregarCustos(); // o preço de compra pode ter mudado com o relatório novo
      } else {
        mostrarRelatorio(relatorio);
      }
    } catch (erro) {
      if (erro.status === 401) sairAdmin();
      erroAdmin(erro.message);
    } finally {
      ocupado(botao);
    }
  }

  async function hashTexto(texto) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Depois de publicar, confere até o site mostrar os dados novos e já troca na tela.
  async function acompanharPublicacao(publicadas) {
    const pendentes = new Map(publicadas.map((l) => [l.id, l.hash]));
    for (let tentativa = 0; tentativa < 24 && pendentes.size; tentativa += 1) {
      await new Promise((pronto) => { setTimeout(pronto, 10000); });
      for (const [id, hash] of [...pendentes]) {
        const loja = lojaPorId(id);
        try {
          const resposta = await fetch(loja.arquivo, { cache: 'no-cache' });
          const texto = await resposta.text();
          if (resposta.ok && await hashTexto(texto) === hash) {
            estado.dadosLojas.set(id, JSON.parse(texto));
            pendentes.delete(id);
          }
        } catch (erro) { /* tenta de novo na próxima volta */ }
      }
    }
    if (pendentes.size) return;
    await carregarLoja(estado.lojaId);
    el.adminRelatorio.insertAdjacentHTML('afterbegin', '<p class="relatorio-resultado">Site atualizado.</p>');
  }

  // Vendedor com a página aberta: ao voltar para ela, confere se o estoque foi atualizado.
  let ultimaVerificacao = Date.now();
  async function verificarAtualizacao() {
    if (document.hidden || !estado.selecao || Date.now() - ultimaVerificacao < 60000) return;
    ultimaVerificacao = Date.now();
    let mudou = false;
    for (const loja of estado.lojas.filter((l) => l.arquivo && estado.dadosLojas.has(l.id))) {
      try {
        const dados = await buscarJSON(loja.arquivo);
        if (JSON.stringify(dados) !== JSON.stringify(estado.dadosLojas.get(loja.id))) {
          estado.dadosLojas.set(loja.id, dados);
          mudou = true;
        }
      } catch (erro) { /* sem internet: fica o estoque que já está na tela */ }
    }
    if (mudou) await carregarLoja(estado.lojaId);
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
    if (evento.key !== 'Escape') return;
    if (!el.modalComprovante.hidden) fecharComprovante();
    else if (!el.modalVenda.hidden) fecharVenda();
    else if (!el.gaveta.hidden) fecharGaveta();
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
    } else if (botao.dataset.acao === 'tirar-parados') {
      desativarParados();
    }
  });

  el.filtroParadosLimpar.addEventListener('click', desativarParados);
  el.selecionar.addEventListener('click', entrarSelecao);
  el.selecaoCancelar.addEventListener('click', sairSelecao);
  el.selecaoEnviar.addEventListener('click', (evento) => {
    if (!estado.selecionados.size) {
      evento.preventDefault();
      return;
    }
    setTimeout(sairSelecao, 400); // depois de abrir o WhatsApp, volta ao normal
  });

  el.atalhos.addEventListener('click', (evento) => {
    const botao = evento.target.closest('.atalho');
    if (!botao) return;
    if (botao.dataset.acao === 'parados') {
      ativarParados();
      return;
    }
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
    // Selecionando: tocar no cartão (ou no marcador) marca e desmarca; os outros botões seguem normais.
    if (estado.selecionando) {
      const cartao = evento.target.closest('.card');
      const acao = evento.target.closest('button, a');
      if (cartao && (!acao || acao.classList.contains('marcador'))) {
        alternarSelecao(cartao);
        return;
      }
    }
    const botao = evento.target.closest('button');
    if (!botao) return;
    const card = botao.closest('.card');
    const p = card && estado.porChave.get(card.dataset.chave);
    if (botao.classList.contains('ver-detalhes')) {
      alternarDetalhes(botao);
    } else if (p && botao.dataset.acao === 'abrir-foto') {
      abrirVisor(fotosDe(p), Number(botao.dataset.indice), p.nome);
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
    else if (botao.dataset.acao === 'comprovante') {
      if (item.venda) mostrarComprovante(item);
      else abrirVenda(item);
    } else if (botao.classList.contains('ver-detalhes')) {
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

  // Imposto de saída (modo administrador): muda a sobra nos detalhes
  el.imposto.addEventListener('input', () => {
    estado.imposto = lerPercentual(el.imposto.value);
    salvarAjustes();
    atualizarDetalhes();
  });
  el.imposto.addEventListener('blur', () => formatarCampo(el.imposto));
  el.imposto.addEventListener('focus', () => setTimeout(() => el.imposto.setSelectionRange(0, el.imposto.value.length), 0));

  // Venda e comprovante
  prepararAssinatura();
  el.formVenda.addEventListener('submit', concluirVenda);
  el.vendaCancelar.addEventListener('click', fecharVenda);
  el.vendaLimparAssinatura.addEventListener('click', limparAssinatura);
  el.vendaCpf.addEventListener('input', () => { el.vendaCpf.value = formatarCpf(el.vendaCpf.value); });
  el.vendaTelefone.addEventListener('blur', () => {
    if (el.vendaTelefone.value.trim()) el.vendaTelefone.value = formatarTelefone(el.vendaTelefone.value);
  });
  el.vendaPagamento.addEventListener('change', () => {
    if (!valorEditado && vendaAtual) {
      el.vendaValor.value = decimal.format(valorPadrao(produtoDoAnuncio(vendaAtual), el.vendaPagamento.value) / 100);
    }
    montarParcelas();
  });
  el.vendaValor.addEventListener('input', () => { valorEditado = true; montarParcelas(); });
  el.vendaValor.addEventListener('blur', () => {
    const valor = lerValor(el.vendaValor.value);
    if (valor > 0) el.vendaValor.value = decimal.format(valor / 100);
  });
  el.comprovanteEnviar.addEventListener('click', enviarComprovante);
  el.comprovanteImagemBaixar.addEventListener('click', async () => {
    if (comprovanteAtual) baixarArquivo(await imagemDoComprovante(), `${comprovanteAtual.nome}.png`);
  });
  el.comprovantePdf.addEventListener('click', () => {
    if (comprovanteAtual) baixarArquivo(pdfDoComprovante(comprovanteAtual.tela), `${comprovanteAtual.nome}.pdf`);
  });
  el.comprovanteEditar.addEventListener('click', () => {
    const item = comprovanteAtual && comprovanteAtual.item;
    fecharComprovante();
    if (item) abrirVenda(item);
  });
  el.comprovanteFechar.addEventListener('click', fecharComprovante);
  el.mesAnterior.addEventListener('click', () => mudarMesVendas(-1));
  el.mesProximo.addEventListener('click', () => mudarMesVendas(1));

  // Administrador
  el.adminEntrar.addEventListener('submit', entrarAdmin);
  el.adminSair.addEventListener('click', sairAdmin);
  el.adminConferir.addEventListener('click', () => enviarRelatorios(false));
  el.adminPublicar.addEventListener('click', () => enviarRelatorios(true));
  el.adminArquivos.addEventListener('change', (evento) => {
    const campo = evento.target.closest('input[type="file"]');
    if (!campo) return;
    const linha = campo.closest('.arquivo');
    const arquivo = campo.files && campo.files[0];
    linha.classList.toggle('escolhido', Boolean(arquivo));
    linha.querySelector('.arquivo-nome').textContent = arquivo ? arquivo.name : 'Escolher relatório';
    limparRelatorio(); // arquivo novo: confere de novo antes de publicar
    erroAdmin('');
  });
  document.addEventListener('visibilitychange', verificarAtualizacao);

  chaveAdmin = lerChaveAdmin();
  montarAdmin();
  iniciar();

  // Exposto só para conferência no console do navegador.
  window.__estoque = { calcular, buscar, cpfValido, formatarCpf, lerValor, desenharComprovante, pdfDoComprovante, mostrarComprovante, abrirVenda, lerPercentual, normalizar, estado, ORDENACOES, linkWhatsApp, mensagemWhatsApp, formatarTelefone, iniciaisDe, fornecedoresDaBusca, fornecedoresComContagem };
})();
