import { Cliente, VendaDetalhada } from "./tipos";
import { parseData } from "./utilitarios";

declare const Papa: any;

// --- URLs DOS ARQUIVOS DE DADOS ---
// As URLs originais do Google Drive causam erros de CORS (Cross-Origin Resource Sharing)
// porque o Google Drive não permite que outros sites acessem seus arquivos diretamente via fetch.
// Para contornar isso temporariamente e permitir que o carregamento funcione, usamos um
// "proxy CORS". Ele atua como um intermediário que adiciona os cabeçalhos necessários.
//
// AVISO: Esta solução com proxy público não é recomendada para produção.
// Ela depende de um serviço de terceiros que pode ser lento ou instável.
// A solução ideal é hospedar os arquivos em um serviço como o Google Cloud Storage
// e configurar o CORS para permitir o acesso do seu domínio.
const PROXY_URL = 'https://api.allorigins.win/raw?url=';
const GOOGLE_DRIVE_URL_CLIENTES = 'https://drive.google.com/uc?export=download&id=1rZDO1_pXD_WVWR84SfyIrxNdL_2Pult9';
const GOOGLE_DRIVE_URL_VENDAS = 'https://drive.google.com/uc?export=download&id=1rdWkVnKnu_q0hohwITYgd_KgN3Vxtzzs';

const URL_CLIENTES_CSV = `${PROXY_URL}${encodeURIComponent(GOOGLE_DRIVE_URL_CLIENTES)}`;
const URL_VENDAS_CSV = `${PROXY_URL}${encodeURIComponent(GOOGLE_DRIVE_URL_VENDAS)}`;


/**
 * Busca um arquivo de uma URL e o retorna como texto.
 */
const fetchArquivo = async (url: string, nomeArquivo: string): Promise<string> => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Falha ao buscar ${nomeArquivo}: Status ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error(`Erro de rede ao buscar ${url}:`, error);
        throw new Error(`Não foi possível conectar ao servidor para baixar o arquivo ${nomeArquivo}. Verifique a URL e a configuração de CORS.`);
    }
};

/**
 * Processa os dados de um CSV de clientes.
 */
const processarCsvClientes = (dadosCsv: any[]): Cliente[] => {
    if (!dadosCsv || dadosCsv.length === 0) {
        throw new Error("O arquivo de clientes está vazio ou em formato inválido.");
    }
    
    const headers = Object.keys(dadosCsv[0]).map(h => h.toLowerCase());
    
    const encontrarCabecalho = (opcoes: string[]) => {
        for (const opcao of opcoes) {
            const cabecalhoEncontrado = headers.find(h => h.includes(opcao.toLowerCase()));
            if (cabecalhoEncontrado) {
                 const cabecalhoOriginal = Object.keys(dadosCsv[0]).find(h => h.toLowerCase() === cabecalhoEncontrado);
                 return cabecalhoOriginal;
            }
        }
        return null;
    };

    const mapeamento = {
      codigo: encontrarCabecalho(['cliente [cód]', 'código']),
      nome: encontrarCabecalho(['cliente', 'nome']),
      cnpj: encontrarCabecalho(['cnpj-cpf', 'cnpj']),
      endereco: encontrarCabecalho(['endereço']),
      cidade: encontrarCabecalho(['cidade']),
      microrregiao: encontrarCabecalho(['microrregião']),
      mesorregiao: encontrarCabecalho(['mesorregião']),
      latitude: encontrarCabecalho(['latitude']),
      longitude: encontrarCabecalho(['longitude']),
      representante: encontrarCabecalho(['representante']),
    };

    if (!mapeamento.codigo || !mapeamento.nome || !mapeamento.latitude || !mapeamento.longitude) {
        throw new Error("Colunas obrigatórias (Cliente [cód], Cliente, Latitude, Longitude) não encontradas no arquivo de clientes.");
    }

    const novosClientes: Cliente[] = [];
    for (const linha of dadosCsv) {
        const lat = parseFloat(linha[mapeamento.latitude!]?.replace(',', '.'));
        const lon = parseFloat(linha[mapeamento.longitude!]?.replace(',', '.'));

        if (!isNaN(lat) && !isNaN(lon)) {
            novosClientes.push({
                codigo: linha[mapeamento.codigo!]?.trim() || 'N/A',
                nome: linha[mapeamento.nome!] || 'Sem Nome',
                latitude: lat,
                longitude: lon,
                endereco: linha[mapeamento.endereco!] || '',
                cidade: linha[mapeamento.cidade!] || '',
                estado: '',
                vendaAnualTotal: 0,
                ultimaCompra: '',
                microrregiao: linha[mapeamento.microrregiao!] || '',
                mesorregiao: linha[mapeamento.mesorregiao!] || '',
                cnpj: linha[mapeamento.cnpj!] || '',
                representante: linha[mapeamento.representante!] || '',
            });
        }
    }
    return novosClientes;
};

/**
 * Processa os dados de um CSV de vendas, agregando os valores por cliente.
 */
const processarCsvVendas = (dadosCsv: any[]): Map<string, { total: number; dataMaisRecente: string; detalhes: VendaDetalhada[] }> => {
    if (!dadosCsv || dadosCsv.length === 0) {
        throw new Error("O arquivo de vendas está vazio ou em formato inválido.");
    }

    const headers = Object.keys(dadosCsv[0]).map(h => h.toLowerCase());
    
    const encontrarCabecalho = (opcoes: string[]) => {
        const cabecalhoEncontrado = headers.find(h => opcoes.some(op => h.includes(op.toLowerCase())));
        return Object.keys(dadosCsv[0]).find(h => h.toLowerCase() === cabecalhoEncontrado) || null;
    };

    const codClienteHeader = encontrarCabecalho(['cliente [cód]']);
    const vendaHeader = encontrarCabecalho(['venda anual']);
    const dataHeader = encontrarCabecalho(['últim venda']);
    const familiaHeader = encontrarCabecalho(['família']);

    if (!codClienteHeader || !vendaHeader || !dataHeader || !familiaHeader) {
        throw new Error("Arquivo de vendas inválido. Verifique se as colunas 'Cliente [cód]', 'Venda anual', 'Últim venda' e 'Família' existem.");
    }

    const vendasAgregadas = new Map<string, { total: number; dataMaisRecente: string; detalhes: VendaDetalhada[] }>();
    for (const linha of dadosCsv) {
        const codigo = linha[codClienteHeader]?.trim();
        const valorVenda = parseFloat(linha[vendaHeader]?.replace(',', '.'));
        const dataVendaStr = linha[dataHeader]?.trim();
        const familia = linha[familiaHeader]?.trim();

        if (codigo && !isNaN(valorVenda)) {
            const registroAtual = vendasAgregadas.get(codigo);

            if (registroAtual) {
                registroAtual.total += valorVenda;
                registroAtual.detalhes.push({ familia: familia || 'Outros', vendaAnual: valorVenda });
                const dataAtual = parseData(registroAtual.dataMaisRecente);
                const novaData = parseData(dataVendaStr);
                if (novaData && (!dataAtual || novaData > dataAtual)) {
                    registroAtual.dataMaisRecente = dataVendaStr;
                }
            } else {
                vendasAgregadas.set(codigo, {
                    total: valorVenda,
                    dataMaisRecente: dataVendaStr,
                    detalhes: [{ familia: familia || 'Outros', vendaAnual: valorVenda }]
                });
            }
        }
    }
    return vendasAgregadas;
};


/**
 * Orquestra o carregamento remoto, o processamento e a combinação dos dados.
 * @returns Uma promessa que resolve com a lista de clientes completa.
 */
export const carregarDadosRemotos = async (): Promise<Cliente[]> => {
    try {
        const [textoClientes, textoVendas] = await Promise.all([
            fetchArquivo(URL_CLIENTES_CSV, 'Clientes'),
            fetchArquivo(URL_VENDAS_CSV, 'Vendas').catch(e => {
                // Torna o arquivo de vendas opcional
                console.warn("Não foi possível carregar o arquivo de vendas. A aplicação continuará sem dados de vendas.", e.message);
                return null;
            })
        ]);

        const resultadoParseClientes = await new Promise<any>((resolve, reject) => {
            Papa.parse(textoClientes, { header: true, skipEmptyLines: true, complete: resolve, error: reject });
        });
        if (resultadoParseClientes.errors.length > 0) throw new Error(`Erro no CSV de clientes: ${resultadoParseClientes.errors[0].message}`);
        
        let novosClientes = processarCsvClientes(resultadoParseClientes.data);

        if (textoVendas) {
            const resultadoParseVendas = await new Promise<any>((resolve, reject) => {
                Papa.parse(textoVendas, { header: true, skipEmptyLines: true, complete: resolve, error: reject });
            });
            if (resultadoParseVendas.errors.length > 0) throw new Error(`Erro no CSV de vendas: ${resultadoParseVendas.errors[0].message}`);
            
            const vendasAgregadas = processarCsvVendas(resultadoParseVendas.data);

            novosClientes.forEach(cliente => {
                const dadosVenda = vendasAgregadas.get(cliente.codigo);
                if (dadosVenda) {
                    cliente.vendaAnualTotal = dadosVenda.total;
                    cliente.ultimaCompra = dadosVenda.dataMaisRecente;
                    cliente.vendasDetalhadas = dadosVenda.detalhes;
                }
            });
        }
        
        return novosClientes;

    } catch (error) {
        console.error("Erro no processo de carregamento de dados:", error);
        throw error; // Re-lança o erro para ser capturado pela função de inicialização
    }
};