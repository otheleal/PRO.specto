import * as estado from "./estado";
import { parseData, formatarMoeda } from "./utilitarios";
// FIX: Resolved module error by ensuring mapa.ts has exports.
import { criarMarcadorCliente } from "./mapa";
import { Cliente } from "./tipos";

declare var L: any;

/**
 * Popula os selects de filtro com base nos dados dos clientes.
 */
export const popularFiltros = () => {
    const mesorregioes = new Set<string>();
    const microrregioes = new Set<string>();
    const cidades = new Set<string>();
    const meses = new Set<string>();

    let minVenda = Infinity;
    let maxVenda = -Infinity;

    estado.clientes.forEach(c => {
        if (c.mesorregiao) mesorregioes.add(c.mesorregiao);
        if (c.microrregiao) microrregioes.add(c.microrregiao);
        if (c.cidade) cidades.add(c.cidade);
        
        if (c.vendaAnualTotal > 0) {
            if (c.vendaAnualTotal < minVenda) minVenda = c.vendaAnualTotal;
            if (c.vendaAnualTotal > maxVenda) maxVenda = c.vendaAnualTotal;
        }

        const dataCompra = parseData(c.ultimaCompra);
        if (dataCompra) {
            const ano = dataCompra.getFullYear();
            const mes = (dataCompra.getMonth() + 1).toString().padStart(2, '0');
            meses.add(`${ano}-${mes}`);
        }
    });

    const popularSelect = (id: string, valores: Set<string>) => {
        const select = document.getElementById(id) as HTMLSelectElement;
        if (!select) return;
        while (select.options.length > 1) select.remove(1);
        [...valores].sort().forEach(valor => {
            const option = document.createElement('option');
            option.value = valor;
            option.textContent = valor;
            select.appendChild(option);
        });
    };

    popularSelect('filtro-mesorregiao', mesorregioes);
    popularSelect('filtro-microrregiao', microrregioes);
    popularSelect('filtro-cidade', cidades);
    
    // FIX: Cannot assign to 'mesesUnicosSlider' because it is a read-only property. Using a setter function instead.
    estado.setMesesUnicosSlider([...meses].sort());

    setupRangeSliderListeners(
      minVenda === Infinity ? 0 : Math.floor(minVenda / 1000) * 1000,
      maxVenda === -Infinity ? 100000 : Math.ceil(maxVenda / 1000) * 1000
    );
};

/**
 * Aplica os filtros da UI e, em seguida, atualiza o mapa para mostrar os 1000 clientes
 * de maior venda anual que estão dentro da área de visualização atual.
 */
export const atualizarMarcadoresVisiveis = () => {
    if (!estado.mapa || !estado.marcadores) return;

    const mesorregiao = (document.getElementById('filtro-mesorregiao') as HTMLSelectElement).value;
    const microrregiao = (document.getElementById('filtro-microrregiao') as HTMLSelectElement).value;
    const cidade = (document.getElementById('filtro-cidade') as HTMLSelectElement).value;

    const valorVendaMin = parseInt((document.getElementById('filtro-venda-min') as HTMLInputElement).value);
    const valorVendaMax = parseInt((document.getElementById('filtro-venda-max') as HTMLInputElement).value);
    
    const minDateIndex = parseInt((document.getElementById('filtro-data-min') as HTMLInputElement).value);
    const maxDateIndex = parseInt((document.getElementById('filtro-data-max') as HTMLInputElement).value);

    // 1. Filtra todos os clientes com base nos controles do painel lateral
    const clientesFiltrados = estado.clientes.filter(c => {
        const condicaoSelects = (mesorregiao === '' || c.mesorregiao === mesorregiao) &&
                                (microrregiao === '' || c.microrregiao === microrregiao) &&
                                (cidade === '' || c.cidade === cidade);

        const condicaoVenda = c.vendaAnualTotal >= valorVendaMin && c.vendaAnualTotal <= valorVendaMax;

        let condicaoData = true;
        if (estado.mesesUnicosSlider.length > 0) {
            const minDateStr = estado.mesesUnicosSlider[minDateIndex];
            const maxDateStr = estado.mesesUnicosSlider[maxDateIndex];
            const dataCompra = parseData(c.ultimaCompra);

            if (dataCompra) {
                const ano = dataCompra.getFullYear();
                const mes = (dataCompra.getMonth() + 1).toString().padStart(2, '0');
                const dataCompraStr = `${ano}-${mes}`;
                condicaoData = dataCompraStr >= minDateStr && dataCompraStr <= maxDateStr;
            } else {
                condicaoData = false; // Se o cliente não tem data, não passa no filtro de data
            }
        }
        
        return condicaoSelects && condicaoVenda && condicaoData;
    });

    // 2. Pega a área visível do mapa
    const bounds = estado.mapa.getBounds();

    // 3. Filtra os clientes para pegar apenas os que estão na tela
    const clientesNaTela = clientesFiltrados.filter(c => {
        if (typeof c.latitude !== 'number' || typeof c.longitude !== 'number' || isNaN(c.latitude) || isNaN(c.longitude)) {
            return false;
        }
        const latLng = L.latLng(c.latitude, c.longitude);
        return bounds.contains(latLng);
    });

    // 4. Ordena por venda anual e pega os 1000 maiores
    const topClientesNaTela = clientesNaTela
        .sort((a: Cliente, b: Cliente) => b.vendaAnualTotal - a.vendaAnualTotal)
        .slice(0, 1000);

    // 5. Limpa os marcadores antigos e adiciona os novos
    estado.marcadores.clearLayers();
    topClientesNaTela.forEach(cliente => {
        const marcador = criarMarcadorCliente(cliente);
        estado.marcadores.addLayer(marcador);
    });
};

/**
 * Configura os event listeners para os controles de filtro.
 */
export const setupFiltroListeners = () => {
    document.getElementById('filtro-mesorregiao')?.addEventListener('change', atualizarMarcadoresVisiveis);
    document.getElementById('filtro-microrregiao')?.addEventListener('change', atualizarMarcadoresVisiveis);
    document.getElementById('filtro-cidade')?.addEventListener('change', atualizarMarcadoresVisiveis);
    document.getElementById('btn-limpar-filtros')?.addEventListener('click', () => {
        (document.getElementById('filtro-mesorregiao') as HTMLSelectElement).value = '';
        (document.getElementById('filtro-microrregiao') as HTMLSelectElement).value = '';
        (document.getElementById('filtro-cidade') as HTMLSelectElement).value = '';
        
        const sliderVendaMin = document.getElementById('filtro-venda-min') as HTMLInputElement;
        const sliderVendaMax = document.getElementById('filtro-venda-max') as HTMLInputElement;
        sliderVendaMin.value = sliderVendaMin.min;
        sliderVendaMax.value = sliderVendaMax.max;
        sliderVendaMin.dispatchEvent(new Event('input'));

        const sliderDataMin = document.getElementById('filtro-data-min') as HTMLInputElement;
        const sliderDataMax = document.getElementById('filtro-data-max') as HTMLInputElement;
        sliderDataMin.value = sliderDataMin.min;
        sliderDataMax.value = sliderDataMax.max;
        sliderDataMin.dispatchEvent(new Event('input'));

        atualizarMarcadoresVisiveis();
    });
};

/**
 * Configura a lógica dos sliders de intervalo (dual-thumb).
 */
export const setupRangeSliderListeners = (minVenda: number, maxVenda: number) => {
    const sliderVendaMin = document.getElementById('filtro-venda-min') as HTMLInputElement;
    const sliderVendaMax = document.getElementById('filtro-venda-max') as HTMLInputElement;
    const valorVendaMinEl = document.getElementById('valor-venda-min') as HTMLElement;
    const valorVendaMaxEl = document.getElementById('valor-venda-max') as HTMLElement;
    const rangeVendaEl = sliderVendaMin.parentElement?.querySelector('.slider-range') as HTMLElement;

    sliderVendaMin.min = sliderVendaMax.min = String(minVenda);
    sliderVendaMin.max = sliderVendaMax.max = String(maxVenda);
    sliderVendaMin.value = String(minVenda);
    sliderVendaMax.value = String(maxVenda);

    const atualizarUIVenda = () => {
        if (!valorVendaMinEl || !valorVendaMaxEl || !rangeVendaEl) return;
        const min = parseInt(sliderVendaMin.value);
        const max = parseInt(sliderVendaMax.value);
        const range = parseInt(sliderVendaMax.max) - parseInt(sliderVendaMax.min);
        
        if (range > 0) {
            rangeVendaEl.style.left = `${((min - parseInt(sliderVendaMin.min)) / range) * 100}%`;
            rangeVendaEl.style.right = `${100 - ((max - parseInt(sliderVendaMin.min)) / range) * 100}%`;
        }

        valorVendaMinEl.textContent = formatarMoeda(min);
        valorVendaMaxEl.textContent = formatarMoeda(max);
    };

    sliderVendaMin.addEventListener('input', () => {
        if (parseInt(sliderVendaMin.value) > parseInt(sliderVendaMax.value)) {
            sliderVendaMax.value = sliderVendaMin.value;
        }
        atualizarUIVenda();
        atualizarMarcadoresVisiveis();
    });
    sliderVendaMax.addEventListener('input', () => {
        if (parseInt(sliderVendaMax.value) < parseInt(sliderVendaMin.value)) {
            sliderVendaMin.value = sliderVendaMax.value;
        }
        atualizarUIVenda();
        atualizarMarcadoresVisiveis();
    });
    
    const sliderDataMin = document.getElementById('filtro-data-min') as HTMLInputElement;
    const sliderDataMax = document.getElementById('filtro-data-max') as HTMLInputElement;
    const valorDataMinEl = document.getElementById('valor-data-min') as HTMLElement;
    const valorDataMaxEl = document.getElementById('valor-data-max') as HTMLElement;
    const rangeDataEl = sliderDataMin.parentElement?.querySelector('.slider-range') as HTMLElement;

    const formatarLabelData = (ym: string) => {
        const [ano, mes] = ym.split('-');
        return `${mes}/${ano.slice(-2)}`;
    };

    const atualizarUIData = () => {
        if (!valorDataMinEl || !valorDataMaxEl || !rangeDataEl) return;

        if (estado.mesesUnicosSlider.length === 0) {
            valorDataMinEl.textContent = "Indisp.";
            valorDataMaxEl.textContent = "Indisp.";
            rangeDataEl.style.left = '0%';
            rangeDataEl.style.right = '0%';
            return;
        }
        const minIdx = parseInt(sliderDataMin.value);
        const maxIdx = parseInt(sliderDataMax.value);
        const range = parseInt(sliderDataMax.max) - parseInt(sliderDataMax.min);
        
        if (range > 0) {
            rangeDataEl.style.left = `${((minIdx - parseInt(sliderDataMin.min)) / range) * 100}%`;
            rangeDataEl.style.right = `${100 - ((maxIdx - parseInt(sliderDataMin.min)) / range) * 100}%`;
        } else {
            rangeDataEl.style.left = '0%';
            rangeDataEl.style.right = '0%';
        }
        
        valorDataMinEl.textContent = formatarLabelData(estado.mesesUnicosSlider[minIdx]);
        valorDataMaxEl.textContent = formatarLabelData(estado.mesesUnicosSlider[maxIdx]);
    };

    sliderDataMin.min = "0";
    sliderDataMax.min = "0";
    sliderDataMin.max = String(estado.mesesUnicosSlider.length > 0 ? estado.mesesUnicosSlider.length - 1 : 0);
    sliderDataMax.max = String(estado.mesesUnicosSlider.length > 0 ? estado.mesesUnicosSlider.length - 1 : 0);
    sliderDataMin.value = "0";
    sliderDataMax.value = String(estado.mesesUnicosSlider.length > 0 ? estado.mesesUnicosSlider.length - 1 : 0);
    
    sliderDataMin.addEventListener('input', () => {
        if (parseInt(sliderDataMin.value) > parseInt(sliderDataMax.value)) {
            sliderDataMax.value = sliderDataMin.value;
        }
        atualizarUIData();
        atualizarMarcadoresVisiveis();
    });
    sliderDataMax.addEventListener('input', () => {
        if (parseInt(sliderDataMax.value) < parseInt(sliderDataMin.value)) {
            sliderDataMin.value = sliderDataMax.value;
        }
        atualizarUIData();
        atualizarMarcadoresVisiveis();
    });

    atualizarUIVenda();
    atualizarUIData();
};

/**
 * Configura o listener para o botão de mostrar/ocultar o painel de filtros.
 */
export const setupPainelFiltrosListener = () => {
    const btnToggleFiltros = document.getElementById('btn-toggle-filtros');
    const painel = document.querySelector('.painel-lateral');
    const btnFecharFiltros = document.getElementById('btn-fechar-filtros');

    btnToggleFiltros?.addEventListener('click', () => {
        painel?.classList.toggle('visivel');
        btnToggleFiltros.classList.toggle('active', painel?.classList.contains('visivel') ?? false);
    });

    btnFecharFiltros?.addEventListener('click', () => {
        painel?.classList.remove('visivel');
        btnToggleFiltros?.classList.remove('active');
    });
};

/**
 * Aplica um filtro inicial na aplicação com base em uma cidade.
 * @param cidade A cidade a ser usada para o filtro.
 */
export const aplicarFiltroInicial = (cidade: string) => {
    const selectCidade = document.getElementById('filtro-cidade') as HTMLSelectElement;
    if (!selectCidade) return;

    // Normaliza a cidade buscada para uma comparação mais robusta.
    const cidadeNormalizada = cidade.trim().toLowerCase();
    let optionEncontrada: HTMLOptionElement | null = null;
    
    // Itera pelas opções para encontrar uma correspondência.
    for (const option of Array.from(selectCidade.options)) {
        if (option.value.trim().toLowerCase() === cidadeNormalizada) {
            optionEncontrada = option;
            break;
        }
    }
    
    if (optionEncontrada) {
        console.log(`Filtro inicial aplicado para a cidade: ${cidade}`);
        selectCidade.value = optionEncontrada.value;
    } else {
        console.warn(`Cidade "${cidade}" não encontrada nos filtros. Usando a cidade padrão "Porto Alegre".`);
        // Fallback para Porto Alegre se a cidade do usuário não existir nos dados.
        let portoAlegreOption: HTMLOptionElement | null = null;
        for (const option of Array.from(selectCidade.options)) {
            if (option.value.trim().toLowerCase() === 'porto alegre') {
                portoAlegreOption = option;
                break;
            }
        }
        selectCidade.value = portoAlegreOption ? portoAlegreOption.value : "";
    }

    // Dispara a função de filtragem para efetivamente atualizar o mapa.
    atualizarMarcadoresVisiveis();
};

/**
 * Configura o listener para o evento de movimento do mapa.
 */
export const setupMapMoveListener = () => {
    if (estado.mapa) {
        estado.mapa.on('moveend', atualizarMarcadoresVisiveis);
    }
};