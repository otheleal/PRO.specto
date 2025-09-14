import * as estado from "./estado";
import { Cliente } from "./tipos";
import { getRaioPorValor, getCorPorData, formatarMoeda, formatarDataPopup } from "./utilitarios";
import { aplicarFiltroInicial } from "./filtros";
import { obterInfoPreliminarLocalizacao } from "./servicos-geo";

declare var L: any;
declare var Chart: any;

/**
 * Cria um gráfico de pizza para as vendas detalhadas do cliente.
 */
const criarGraficoVendas = (cliente: Cliente): string => {
    if (!cliente.vendasDetalhadas || cliente.vendasDetalhadas.length === 0) {
        return '<p class="sem-dados-grafico">Sem dados detalhados de venda.</p>';
    }

    const canvasId = `grafico-${cliente.codigo}`;
    
    // Agrupa e soma vendas por família
    const vendasPorFamilia = cliente.vendasDetalhadas.reduce((acc, venda) => {
        acc[venda.familia] = (acc[venda.familia] || 0) + venda.vendaAnual;
        return acc;
    }, {} as Record<string, number>);

    // Ordena por valor e pega os top 5 + "Outros"
    const sortedVendas = Object.entries(vendasPorFamilia)
        .sort(([, a], [, b]) => b - a);

    const labels: string[] = [];
    const data: number[] = [];
    let outrosValor = 0;

    sortedVendas.forEach((item, index) => {
        if (index < 5) {
            labels.push(item[0]);
            data.push(item[1]);
        } else {
            outrosValor += item[1];
        }
    });

    if (outrosValor > 0) {
        labels.push('Outros');
        data.push(outrosValor);
    }
    
    setTimeout(() => {
        const ctx = (document.getElementById(canvasId) as HTMLCanvasElement)?.getContext('2d');
        if (ctx) {
            if (estado.graficoAtual) {
                estado.graficoAtual.destroy();
            }
            // FIX: Cannot assign to 'graficoAtual' because it is a read-only property. Using a setter function instead.
            estado.setGraficoAtual(new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: ['#17a2b8', '#28a745', '#ffc107', '#fd7e14', '#dc3545', '#6c757d'],
                        borderColor: '#FFF',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                boxWidth: 12,
                                padding: 15,
                                font: {
                                    size: 11
                                }
                            }
                        }
                    }
                }
            }));
        }
    }, 100); // Pequeno delay para garantir que o popup foi renderizado

    return `<div class="container-grafico"><canvas id="${canvasId}" height="180"></canvas></div>`;
};

/**
 * Cria o conteúdo HTML do popup para um cliente.
 */
const criarConteudoPopup = (cliente: Cliente): string => {
    const corLegenda = getCorPorData(cliente.ultimaCompra);
    const htmlGrafico = criarGraficoVendas(cliente);

    return `
        <div class="info-cliente-popup">
            <strong>${cliente.nome}</strong><br>
            <span class="subtitulo-popup">${cliente.codigo} | ${cliente.cnpj}</span>
            <hr>
            <strong>Endereço:</strong> <span class="valor-info">${cliente.endereco || 'N/A'}</span><br>
            <strong>Cidade:</strong> <span class="valor-info">${cliente.cidade || 'N/A'} - ${cliente.estado || 'N/A'}</span><br>
            <strong>Representante:</strong> <span class="valor-info">${cliente.representante || 'N/A'}</span><br>
            <hr>
            <strong>Venda Anual:</strong> <span class="valor-info">${formatarMoeda(cliente.vendaAnualTotal)}</span><br>
            <strong>Última Compra:</strong> 
            <span class="valor-info-data" style="background-color:${corLegenda};">
                ${formatarDataPopup(cliente.ultimaCompra)}
            </span>
        </div>
        ${htmlGrafico}
    `;
};


/**
 * Cria um marcador (círculo) para um cliente no mapa.
 */
export const criarMarcadorCliente = (cliente: Cliente): any => {
    const lat = cliente.latitude;
    const lon = cliente.longitude;

    const circulo = L.circleMarker([lat, lon], {
        radius: getRaioPorValor(cliente.vendaAnualTotal),
        fillColor: getCorPorData(cliente.ultimaCompra),
        color: '#fff',
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.8
    });
    
    circulo.bindPopup(() => criarConteudoPopup(cliente), {
        minWidth: 300,
        className: 'popup-cliente'
    });
    
    return circulo;
};


/**
 * Adiciona todos os clientes ao mapa como marcadores.
 */
export const adicionarClientesAoMapa = () => {
    if (!estado.mapa || !estado.marcadores) return;
    
    estado.marcadores.clearLayers();
    estado.clientes.forEach(cliente => {
        const marcador = criarMarcadorCliente(cliente);
        estado.marcadores.addLayer(marcador);
    });
};

/**
 * Ajusta o zoom do mapa para mostrar todos os clientes.
 */
export const ajustarZoomParaTodosClientes = () => {
    if (!estado.mapa || !estado.marcadores) return;

    const bounds = estado.marcadores.getBounds();
    if (bounds.isValid()) {
        estado.mapa.fitBounds(bounds, { padding: [50, 50] });
    }
};

/**
 * Realiza a geocodificação reversa para encontrar a cidade e aplicar o filtro inicial.
 * @param latlng As coordenadas geográficas.
 */
const aplicarFiltroBaseadoEmLocalizacao = async (latlng: { lat: number, lng: number }) => {
    try {
        const info = await obterInfoPreliminarLocalizacao(latlng.lat, latlng.lng);
        const osmData = info.resultadoOSM?.dados;
        // Prioriza 'city', mas usa 'town' ou 'village' como fallback. Padrão é Porto Alegre.
        const cidade = osmData?.address?.city || osmData?.address?.town || osmData?.address?.village || "Porto Alegre";
        aplicarFiltroInicial(cidade);
    } catch (error) {
        console.error("Erro na geocodificação reversa para filtro inicial:", error);
        aplicarFiltroInicial("Porto Alegre"); // Fallback em caso de erro na API
    }
};


/**
 * Localiza o usuário, o posiciona no mapa e aplica o filtro inicial por cidade.
 */
export const localizarUsuario = () => {
    if (!estado.mapa) {
        // Aplica o filtro padrão se o mapa não estiver inicializado.
        aplicarFiltroInicial("Porto Alegre");
        return;
    }

    // Timeout para lidar com casos onde o usuário nega a permissão ou a API demora.
    const locationTimeout = setTimeout(() => {
        console.warn("Tempo de geolocalização esgotado. Aplicando filtro padrão para Porto Alegre.");
        // Garante que os listeners sejam removidos para evitar execuções duplicadas.
        estado.mapa.off('locationfound', onLocationFound);
        estado.mapa.off('locationerror', onLocationError);
        aplicarFiltroInicial("Porto Alegre");
    }, 6000); // 6 segundos.

    const onLocationFound = (e: any) => {
        clearTimeout(locationTimeout);

        if (estado.localizacaoAtualDoUsuario) {
            estado.mapa.removeLayer(estado.localizacaoAtualDoUsuario);
        }
        
        const icone = L.divIcon({
            className: 'marcador-localizacao-usuario',
            html: '<div class="pulso"></div><div class="ponto-central"></div>',
            iconSize: [18, 18]
        });

        const marcadorUsuario = L.marker(e.latlng, { icon: icone }).addTo(estado.mapa);
        estado.setLocalizacaoAtualDoUsuario(marcadorUsuario);

        if (!estado.initialZoomSet) {
            estado.mapa.setView(e.latlng, 18); // Inicia com zoom máximo na localização do usuário
            estado.setInitialZoomSet(true);
        }

        // Aplica o filtro com base na localização encontrada
        aplicarFiltroBaseadoEmLocalizacao(e.latlng);
    };

    const onLocationError = (err: any) => {
        clearTimeout(locationTimeout);
        if (err.message && !err.message.toLowerCase().includes("position unavailable")) {
            console.warn(`Aviso de localização: ${err.message}`);
        }
        aplicarFiltroInicial("Porto Alegre");
    };

    // Anexa os listeners uma única vez.
    estado.mapa.once('locationfound', onLocationFound);
    estado.mapa.once('locationerror', onLocationError);

    // Inicia a tentativa de localização. setView foi removido para ser controlado pelo 'locationfound'.
    estado.mapa.locate({ setView: false, maxZoom: 17, watch: false });
};

/**
 * Inicializa o mapa Leaflet.
 */
export const inicializarMapa = () => {
    try {
        const novoMapa = L.map('mapa', {
            center: [-30.0346, -51.2177],
            zoom: 18, // Inicia com o zoom máximo
            zoomControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(novoMapa);
        
        // FIX: Cannot assign to 'mapa' because it is a read-only property. Using a setter function instead.
        estado.setMapa(novoMapa);
        
        // FIX: Cannot assign to 'marcadores' because it is a read-only property. Using a setter function instead.
        estado.setMarcadores(L.layerGroup().addTo(novoMapa));

        novoMapa.on('popupclose', () => {
            if (estado.graficoAtual) {
                estado.graficoAtual.destroy();
                // FIX: Cannot assign to 'graficoAtual' because it is a read-only property. Using a setter function instead.
                estado.setGraficoAtual(null);
            }
        });

    } catch (error) {
        console.error("Falha ao inicializar o mapa:", error);
        const mapContainer = document.getElementById('mapa');
        if(mapContainer) {
            mapContainer.innerHTML = '<p style="text-align:center; padding-top: 50px;">Ocorreu um erro ao carregar o mapa. Por favor, recarregue a página.</p>';
        }
    }
};