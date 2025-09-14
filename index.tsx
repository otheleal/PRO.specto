import * as estado from './estado';
import { inicializarMapa, localizarUsuario } from './mapa';
import { setupFiltroListeners, popularFiltros, setupPainelFiltrosListener, setupMapMoveListener, atualizarMarcadoresVisiveis } from './filtros';
import { setupBotaoGravarListener } from './notasVoz';
import { inicializarIA, setupBotaoOQueTemAqui } from './ia';
import { inicializarMatrizDeTeste } from './matriz';
import { carregarDadosRemotos } from './carregador-dados';
import { mostrarOverlayErroMapa } from './utilitarios';
import { carregarClientesDoLocalStorage, salvarClientesNoLocalStorage, limparCacheDeClientes } from './persistencia';

/**
 * Configura o listener do botão para forçar a atualização dos dados da nuvem.
 */
const setupBotaoAtualizarListener = () => {
    const btn = document.getElementById('btn-atualizar-dados');
    btn?.addEventListener('click', async () => {
        if (!confirm("Isso buscará os dados mais recentes da nuvem e substituirá os dados locais. Deseja continuar?")) {
            return;
        }

        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        
        try {
            // Força uma recarga limpando o cache primeiro
            limparCacheDeClientes(); 
            const clientesCarregados = await carregarDadosRemotos();
            estado.setClientes(clientesCarregados);
            salvarClientesNoLocalStorage(clientesCarregados);
            
            // Re-inicializa as partes da aplicação que dependem dos dados
            popularFiltros();
            // Re-localiza para aplicar o filtro da cidade correta e acionar a atualização de marcadores
            localizarUsuario(); 
            
            console.log(`${clientesCarregados.length} clientes recarregados da nuvem e salvos no cache.`);
            alert("Dados atualizados com sucesso!");

        } catch (error) {
             console.error("Falha ao atualizar dados:", error);
             mostrarOverlayErroMapa(
                 "Falha ao Atualizar",
                 `Não foi possível carregar os novos dados. A aplicação continuará usando os dados anteriores. Detalhe: ${(error as Error).message}`
             );
        } finally {
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }
    });
};

/**
 * Função principal de inicialização da aplicação.
 */
const inicializarAplicacao = async () => {
    const loadingOverlay = document.getElementById('loading-overlay');

    try {
        // 0. Define a data de hoje para toda a sessão
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        estado.setDataAtual(hoje);

        // 1. Inicializa o mapa e IA, que não dependem dos dados dos clientes
        inicializarMapa();
        inicializarIA();
        setupMapMoveListener(); // Configura o listener para atualizar o mapa ao mover

        // 2. Lógica de carregamento de dados com cache
        let clientesCarregados = carregarClientesDoLocalStorage();
        if (clientesCarregados && clientesCarregados.length > 0) {
            console.log(`Cache encontrado. ${clientesCarregados.length} clientes carregados do Local Storage.`);
        } else {
            console.log("Nenhum cache encontrado. Buscando dados da nuvem...");
            if (loadingOverlay) loadingOverlay.style.display = 'flex';
            clientesCarregados = await carregarDadosRemotos();
            salvarClientesNoLocalStorage(clientesCarregados);
            console.log(`${clientesCarregados.length} clientes carregados remotamente e salvos no cache.`);
        }
        
        estado.setClientes(clientesCarregados || []);
        
        // 3. Popula os filtros com os dados carregados
        popularFiltros();

        // 4. Tenta localizar o usuário no mapa. Isso acionará a primeira renderização de marcadores.
        localizarUsuario();

        // 5. Configura todos os listeners de eventos da UI
        setupFiltroListeners();
        setupPainelFiltrosListener();
        setupBotaoGravarListener();
        setupBotaoOQueTemAqui();
        setupBotaoAtualizarListener(); // Novo listener para o botão de atualização

        // 6. Inicializa o painel de teste da matriz com dados de exemplo
        inicializarMatrizDeTeste();

    } catch (error) {
        console.error("Falha crítica na inicialização da aplicação:", error);
        mostrarOverlayErroMapa(
            "Falha ao Carregar Dados",
            `Não foi possível carregar os dados dos clientes. Verifique sua conexão com a internet e se os links dos arquivos estão corretos e acessíveis. Detalhe: ${(error as Error).message}`
        );
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
};

// Garante que o DOM está totalmente carregado antes de executar o script
document.addEventListener('DOMContentLoaded', inicializarAplicacao);