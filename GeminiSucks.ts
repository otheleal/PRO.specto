import * as estado from './estado';
import { mostrarBannerErro } from './utilitarios';

declare var L: any;

let marcadorBusca: any = null;

/**
 * Busca um endereço usando a API de Geocodificação do IBGE com uma consulta fetch padrão.
 * Nota: Esta implementação pode ser bloqueada por políticas CORS em um navegador padrão.
 * @param query O endereço a ser buscado.
 * @returns Um objeto com lat, lon e display_name, ou null se não encontrado.
 */
const buscarEnderecoIBGE = async (query: string) => {
    const url = `https://servicodados.ibge.gov.br/api/v2/geocodigo/enderecos`;
    const params = new URLSearchParams({
        endereco: query,
        formato: 'json'
    });

    try {
        const response = await fetch(`${url}?${params.toString()}`);

        if (!response.ok) {
            throw new Error(`O serviço do IBGE respondeu com status ${response.status}`);
        }

        const data = await response.json();
        
        if (data && data.sucesso && data.resultados && data.resultados.length > 0) {
            const primeiroResultado = data.resultados[0];
            const { lat, lon } = primeiroResultado.coordenadas;
            const display_name = primeiroResultado.endereco;

            // O IBGE pode retornar (0,0) para buscas falhas, mesmo com sucesso=true
            if (lat === 0 && lon === 0) {
                 console.warn("IBGE retornou coordenadas (0,0), tratando como não encontrado.");
                 return null;
            }

            return { lat, lon, display_name };
        }
        return null;
    } catch (error) {
        console.error("Erro ao buscar endereço no IBGE:", error);
        mostrarBannerErro((error as Error).message || "Falha ao se comunicar com o serviço de busca do IBGE.", false);
        return null;
    }
};


/**
 * Manipula o evento de busca, chama a API e atualiza o mapa.
 */
const executarBusca = async () => {
    const input = document.getElementById('busca-endereco-input') as HTMLInputElement;
    const btn = document.getElementById('btn-busca-endereco') as HTMLButtonElement;
    const query = input.value.trim();

    if (!query) return;

    btn.disabled = true;

    // Remove o marcador da busca anterior, se houver
    if (marcadorBusca) {
        estado.mapa.removeLayer(marcadorBusca);
        marcadorBusca = null;
    }

    const resultado = await buscarEnderecoIBGE(query);

    if (resultado) {
        const { lat, lon, display_name } = resultado;
        const latLng = L.latLng(lat, lon);

        // Cria um ícone para o resultado da busca
        const iconeBusca = L.divIcon({
            className: 'pino-confirmacao', // Reutiliza o estilo do pino azul
            iconSize: [32, 42],
            iconAnchor: [16, 42]
        });

        // Adiciona o novo marcador
        marcadorBusca = L.marker(latLng, { icon: iconeBusca }).addTo(estado.mapa);
        marcadorBusca.bindPopup(`<b>Endereço Encontrado:</b><br>${display_name}`).openPopup();
        
        // Centraliza o mapa no resultado
        estado.mapa.setView(latLng, 17); // Zoom mais próximo para endereços

    } else {
        mostrarBannerErro("Endereço não encontrado. Tente ser mais específico.", false);
    }
    
    btn.disabled = false;
};

/**
 * Configura os listeners para a caixa de busca de endereço.
 */
export const setupBuscaEnderecoListener = () => {
    const input = document.getElementById('busca-endereco-input') as HTMLInputElement;
    const btn = document.getElementById('btn-busca-endereco') as HTMLButtonElement;

    btn?.addEventListener('click', executarBusca);

    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Evita submissão de formulário, se houver
            executarBusca();
        }
    });
};