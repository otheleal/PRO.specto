import { Cliente } from "./tipos";

const CACHE_KEY = 'dadosClientesAnay';

/**
 * Salva a lista de clientes no Local Storage, com tratamento de erro de cota e logging detalhado.
 */
export const salvarClientesNoLocalStorage = (clientesParaSalvar: Cliente[]) => {
    console.log(`[Cache] Tentando salvar ${clientesParaSalvar.length} clientes no Local Storage.`);
    if (!clientesParaSalvar || clientesParaSalvar.length === 0) {
        console.warn("[Cache] Abortando salvamento: a lista de clientes está vazia ou é inválida.");
        return;
    }

    try {
        const dadosString = JSON.stringify(clientesParaSalvar);
        localStorage.setItem(CACHE_KEY, dadosString);
        console.log(`[Cache] Sucesso! ${dadosString.length} bytes salvos no Local Storage.`);
        
        // Verificação imediata para garantir que o navegador está persistindo os dados
        const dadosVerificacao = localStorage.getItem(CACHE_KEY);
        if (dadosVerificacao === dadosString) {
            console.log("[Cache] Verificação de escrita bem-sucedida.");
        } else {
            console.error("[Cache] ERRO DE VERIFICAÇÃO! Os dados lidos são diferentes dos dados escritos. Isso pode indicar que o navegador está em modo de navegação privada ou que o armazenamento local está desabilitado/cheio.");
        }
    } catch (error) {
        console.error("[Cache] Erro ao salvar dados no Local Storage:", error);
        // Verifica se o erro é de cota excedida (funciona na maioria dos navegadores)
        if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
            alert("Não foi possível salvar os dados para acesso rápido. A base de dados é muito grande para o cache do seu navegador. A aplicação funcionará, mas poderá ser lenta para carregar a cada visita.");
        }
    }
};

/**
 * Carrega a lista de clientes do Local Storage com logging detalhado.
 */
export const carregarClientesDoLocalStorage = (): Cliente[] | null => {
    console.log("[Cache] Tentando carregar dados do Local Storage.");
    try {
        const dadosSalvos = localStorage.getItem(CACHE_KEY);
        if (dadosSalvos) {
            console.log(`[Cache] Dados encontrados (${dadosSalvos.length} bytes). Analisando JSON...`);
            const clientes = JSON.parse(dadosSalvos);
            console.log(`[Cache] Sucesso! ${clientes.length} clientes carregados.`);
            return clientes;
        } else {
            console.log("[Cache] Nenhum dado encontrado no Local Storage com a chave esperada.");
            return null;
        }
    } catch (error) {
        console.error("[Cache] Erro ao carregar ou analisar dados do Local Storage:", error);
        // Se houver um erro de parsing (dados corrompidos), é uma boa prática limpar o cache.
        console.warn("[Cache] Os dados em cache parecem estar corrompidos. Limpando o cache.");
        limparCacheDeClientes();
        return null;
    }
};

/**
 * Remove os dados dos clientes do Local Storage.
 */
export const limparCacheDeClientes = () => {
    try {
        console.warn(`[Cache] Limpando o cache de clientes do Local Storage (chave: ${CACHE_KEY}).`);
        localStorage.removeItem(CACHE_KEY);
    } catch (error) {
        console.error("[Cache] Erro ao limpar o cache de clientes:", error);
    }
};
