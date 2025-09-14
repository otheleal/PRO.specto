import { Cliente, VendaDetalhada } from "./tipos";
import * as estado from "./estado";
import { parseData } from "./utilitarios";
import { salvarClientesNoLocalStorage } from "./persistencia";
// FIX: Resolved module error by ensuring mapa.ts has exports.
import { ajustarZoomParaTodosClientes } from "./mapa";
import { popularFiltros, atualizarMarcadoresVisiveis } from "./filtros";

declare const Papa: any;

/**
 * Lê um arquivo do tipo File como texto.
 */
const lerArquivo = (arquivo: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(leitor.result as string);
        leitor.onerror = () => reject(leitor.error);
        leitor.readAsText(arquivo, 'UTF-8');
    });
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
 * Orquestra o processo de upload, leitura e processamento dos arquivos.
 */
const tratarUploadDeArquivos = async () => {
    const inputClientes = document.getElementById('input-arquivo-clientes') as HTMLInputElement;
    const inputVendas = document.getElementById('input-arquivo-vendas') as HTMLInputElement;
    const btnProcessar = document.getElementById('btn-processar-arquivos') as HTMLButtonElement;
    const spinner = btnProcessar.querySelector('.btn-spinner') as HTMLElement;
    const textoBtn = btnProcessar.querySelector('.texto-btn') as HTMLElement;

    const arquivoClientes = inputClientes.files?.[0];
    const arquivoVendas = inputVendas.files?.[0];

    if (!arquivoClientes) {
        alert("Por favor, selecione um arquivo de clientes.");
        return;
    }

    btnProcessar.disabled = true;
    spinner.style.display = 'block';
    textoBtn.textContent = 'Processando...';

    try {
        const textoClientes = await lerArquivo(arquivoClientes);
        const resultadoParseClientes = await new Promise<any>((resolve, reject) => {
            Papa.parse(textoClientes, { header: true, skipEmptyLines: true, complete: resolve, error: reject });
        });
        if (resultadoParseClientes.errors.length > 0) throw new Error(`Erro no CSV de clientes: ${resultadoParseClientes.errors[0].message}`);
        
        let novosClientes = processarCsvClientes(resultadoParseClientes.data);
        let clientesAtualizadosComVendas = 0;

        if (arquivoVendas) {
            const textoVendas = await lerArquivo(arquivoVendas);
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
                    clientesAtualizadosComVendas++;
                }
            });
        }
        
        // FIX: Cannot assign to 'clientes' because it is a read-only property. Using a setter function instead.
        estado.setClientes(novosClientes);
        salvarClientesNoLocalStorage(estado.clientes); // Salva os novos dados
        popularFiltros();
        atualizarMarcadoresVisiveis();
        
        const mensagemSucesso = `Sucesso! ${estado.clientes.length} clientes foram carregados. ${clientesAtualizadosComVendas} clientes tiveram seus dados de venda atualizados.`;
        alert(mensagemSucesso);
        document.getElementById('modal-upload')?.style.setProperty('display', 'none');

    } catch (error: any) {
        console.error("Erro ao processar arquivos:", error);
        alert(`Ocorreu um erro: ${error.message}`);
    } finally {
        btnProcessar.disabled = false;
        spinner.style.display = 'none';
        textoBtn.textContent = 'Processar';
        inputClientes.value = '';
        inputVendas.value = '';
        (document.getElementById('btn-processar-arquivos') as HTMLButtonElement).disabled = true;
    }
};

/**
 * Configura os listeners para a funcionalidade de upload.
 */
export const setupUploadListeners = () => {
    const btnUpload = document.getElementById('btn-upload');
    const modal = document.getElementById('modal-upload');
    const btnFecharModal = document.getElementById('btn-fechar-modal');
    const btnProcessar = document.getElementById('btn-processar-arquivos');
    const inputClientes = document.getElementById('input-arquivo-clientes');
    const overlay = document.querySelector('.overlay-modal');

    btnUpload?.addEventListener('click', () => modal?.style.setProperty('display', 'flex'));
    btnFecharModal?.addEventListener('click', () => modal?.style.setProperty('display', 'none'));
    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) {
            modal?.style.setProperty('display', 'none');
        }
    });

    inputClientes?.addEventListener('change', () => {
        if (btnProcessar) {
            (btnProcessar as HTMLButtonElement).disabled = !(inputClientes as HTMLInputElement).files?.length;
        }
    });

    btnProcessar?.addEventListener('click', tratarUploadDeArquivos);
};