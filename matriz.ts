import { InfoLocalDividida } from './tipos';
import { analisarLocalConsolidadoComAssistente } from './ia';
import * as estado from "./estado";
import { buscarCoordenadasPorEndereco } from './servicos-geo';

declare var L: any;

/**
 * Ajusta a altura de um elemento textarea para se adequar ao seu conteúdo.
 * @param el O elemento HTMLTextAreaElement.
 */
const ajustarAlturaTextarea = (el: HTMLTextAreaElement) => {
    // Reseta a altura para recalcular a altura de rolagem
    el.style.height = 'auto';
    // Define a altura para a altura de rolagem para mostrar todo o conteúdo
    el.style.height = `${el.scrollHeight}px`;
};

/**
 * Encontra todos os textareas de valor no contêiner e configura o redimensionamento automático.
 * @param container O elemento HTMLElement que contém os textareas.
 */
const setupAutoResizeListeners = (container: HTMLElement) => {
    container.querySelectorAll<HTMLTextAreaElement>('.matriz-input-valor, .matriz-texto-info').forEach(textarea => {
        // Define a altura inicial corretamente
        ajustarAlturaTextarea(textarea as HTMLTextAreaElement);
        // Adiciona um listener para ajustar a altura ao digitar
        textarea.addEventListener('input', () => ajustarAlturaTextarea(textarea as HTMLTextAreaElement));
    });
};


/**
 * Processa o array `address_components` da API do Google para um objeto mais simples.
 * @param componentes - O array address_components.
 * @returns Um objeto com chaves mapeadas para os componentes do endereço.
 */
const parseAddressComponents = (componentes: any[]): { [key: string]: string } => {
    if (!componentes) return {};
    const endereco: { [key: string]: string } = {};
    
    const mapeamento: { [key: string]: string } = {
        street_number: 'Número',
        route: 'Logradouro',
        sublocality_level_1: 'Bairro',
        sublocality: 'Bairro',
        administrative_area_level_2: 'Cidade',
        administrative_area_level_1: 'Estado',
        postal_code: 'CEP',
        country: 'País'
    };

    componentes.forEach(componente => {
        const tipoComponente = componente.types[0];
        const chaveMapeada = mapeamento[tipoComponente];
        if (chaveMapeada) {
            endereco[chaveMapeada] = componente.long_name;
        }
    });

    if (!endereco.Bairro) {
        const componenteBairro = componentes.find(c => c.types.includes('neighborhood'));
        if (componenteBairro) {
            endereco.Bairro = componenteBairro.long_name;
        }
    }
    
    return endereco;
};

/**
 * Escapa aspas duplas em uma string para uso seguro em um atributo de valor HTML.
 * @param str A string a ser escapada.
 * @returns A string com aspas duplas escapadas.
 */
const escapeHtmlValue = (str: any): string => {
    if (str === null || str === undefined) return '';
    // Para textareas, o conteúdo vai entre as tags, então escapamos HTML.
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Localiza citações numéricas (ex: [1], [2]) em um texto e as substitui por links HTML.
 * @param text O texto a ser processado.
 * @param sources Um array de objetos de fonte, onde cada objeto tem `uri` e `title`.
 * @returns O texto com as citações substituídas por links.
 */
const linkifyCitations = (text: string, sources: { uri: string, title: string }[]): string => {
    if (!text || !sources || sources.length === 0) {
        return text;
    }
    // Substitui as citações e também quebras de linha por <br> para preservar a formatação
    return text.replace(/\[(\d+)\]/g, (match, p1) => {
        const index = parseInt(p1, 10) - 1;
        if (index >= 0 && index < sources.length) {
            const source = sources[index];
            return `<sup><a href="${source.uri}" target="_blank" rel="noopener noreferrer" title="${escapeHtmlValue(source.title)}">[${p1}]</a></sup>`;
        }
        return match; 
    }).replace(/\n/g, '<br>');
};

/**
 * Cria o HTML para os botões de ação do painel e configura seus listeners.
 * @param container Onde os botões serão inseridos.
 * @param onBuscarDetalhes Callback para o botão de busca.
 */
const renderizarBotoesDeAcao = (container: HTMLElement, onBuscarDetalhes: () => void) => {
    container.innerHTML = `
        <button id="btn-enriquecer-ia" class="map-btn" style="background-color: var(--cor-info); color: white;">
            <span class="texto-btn">Buscar detalhes</span>
            <div class="btn-spinner" style="border-top-color: white;"></div>
        </button>
        <button id="btn-prospectar" class="map-btn" disabled title="Funcionalidade em desenvolvimento">
             <span>Prospectar</span>
        </button>
    `;
    container.querySelector('#btn-enriquecer-ia')?.addEventListener('click', onBuscarDetalhes);
};

/**
 * Renderiza uma matriz de dados consolidada, unificando dados do Google e OSM.
 * @param lugar - O objeto com os detalhes do Google Places.
 * @param info - As informações de localização (OSM/IBGE) usadas para fallback.
 */
export const renderizarMatrizConsolidada = (lugar: any, info: InfoLocalDividida) => {
    const painelConteudo = document.querySelector<HTMLElement>('#painel-matriz-teste .painel-conteudo');
    const painelBotoes = document.getElementById('painel-header-botoes');
    const painelSeletor = document.getElementById('painel-matriz-seletor-container');
    if (!painelConteudo || !painelBotoes || !painelSeletor) return;

    painelSeletor.innerHTML = ''; // Limpa o seletor, pois esta view não o utiliza.

    // Estrutura de dados unificada
    const dadosUnificados: { [key: string]: any } = {
        'Nome fantasia': '', 'Razão social': '', 'CNPJ': '', 'Situação Cadastral': '',
        'Logradouro': '', 'Número': '', 'Bairro': '', 'Cidade': '', 'Estado': '',
        'CEP': '', 'País': '', 'Telefone': '', 'Site': '', 'E-mail': '',
    };
    
    // Mapeamento de dados
    const enderecoGoogle = parseAddressComponents(lugar.address_components);
    dadosUnificados['Nome fantasia'] = lugar.name || '';
    dadosUnificados['Telefone'] = lugar.formatted_phone_number || '';
    dadosUnificados['Site'] = lugar.website || '';
    Object.assign(dadosUnificados, enderecoGoogle);
    
    // Fallback com OSM
    const osm = info.resultadoOSM.dados?.address || {};
    if (!dadosUnificados['Nome fantasia']) dadosUnificados['Nome fantasia'] = osm.amenity || osm.shop || osm.office || '';
    if (!dadosUnificados['Logradouro']) dadosUnificados['Logradouro'] = osm.road || '';
    if (!dadosUnificados['Número']) dadosUnificados['Número'] = osm.house_number || '';
    if (!dadosUnificados['Bairro']) dadosUnificados['Bairro'] = osm.suburb || '';
    if (!dadosUnificados['Cidade']) dadosUnificados['Cidade'] = osm.city || osm.town || '';
    if (!dadosUnificados['Estado']) dadosUnificados['Estado'] = osm.state || '';
    if (!dadosUnificados['CEP']) dadosUnificados['CEP'] = osm.postcode || '';
    if (!dadosUnificados['País']) dadosUnificados['País'] = osm.country || '';

    // Renderizar a tabela
    const camposOcultosInicialmente = new Set(['Bairro', 'Cidade', 'Estado', 'CEP', 'País', 'Situação Cadastral']);
    let linhasHtml = '';
    Object.keys(dadosUnificados).forEach(chave => {
        const valor = dadosUnificados[chave];
        const classeOculta = camposOcultosInicialmente.has(chave) ? 'campo-oculto' : '';
        linhasHtml += `
            <tr class="${classeOculta}" data-campo-container="${chave}">
                <td>${chave}</td>
                <td><textarea class="matriz-input-valor" data-campo="${chave}">${escapeHtmlValue(valor)}</textarea></td>
            </tr>
        `;
    });

    painelConteudo.innerHTML = `
        <div class="matriz-dados-container">
            <table class="matriz-dados-pivot">${linhasHtml}</table>
        </div>`;
    
    renderizarBotoesDeAcao(painelBotoes, () => {
        const dadosEditados: { [key: string]: string } = {};
        painelConteudo.querySelectorAll<HTMLTextAreaElement>('.matriz-input-valor').forEach(input => {
            if (input.dataset.campo) dadosEditados[input.dataset.campo] = input.value;
        });
        analisarLocalConsolidadoComAssistente(dadosEditados);
    });

    setupAutoResizeListeners(painelConteudo);
};

/**
 * Preenche os campos da tabela única com os dados de um estabelecimento específico.
 * @param estDados Os dados do estabelecimento a serem exibidos.
 * @param fontes As fontes de citação da IA.
 */
const preencherCamposComDados = (estDados: any, fontes: any[]) => {
    const painelConteudo = document.querySelector<HTMLElement>('#painel-matriz-teste .painel-conteudo');
    if (!painelConteudo) return;

    painelConteudo.querySelectorAll<HTMLElement>('[data-campo]').forEach(el => {
        const campo = el.dataset.campo;
        if (!campo) return;
        
        const valor = estDados[campo] || '';
        const valorHtml = linkifyCitations(escapeHtmlValue(valor), fontes);

        if (el.tagName.toLowerCase() === 'textarea') {
            (el as HTMLTextAreaElement).value = valor;
             // Adiciona estilo para "Situação Cadastral" não-ativa
            if (campo === 'Situação Cadastral') {
                el.style.color = valor.toUpperCase() !== 'ATIVA' ? 'var(--cor-perigo)' : '';
                el.style.fontWeight = valor.toUpperCase() !== 'ATIVA' ? 'bold' : '';
            }
        } else { // Para divs como Atividade/Clientes
            el.innerHTML = valorHtml;
        }
        ajustarAlturaTextarea(el as HTMLTextAreaElement); // Redimensiona todos
    });
};


/**
 * Atualiza a matriz de dados com a resposta do assistente, usando uma tabela única e atualizando valores.
 * @param resultadoIA - O objeto JSON retornado pela API Gemini.
 */
export const atualizarMatrizComDadosIA = async (resultadoIA: any) => {
    const painel = document.getElementById('painel-matriz-teste');
    const painelSeletorContainer = document.getElementById('painel-matriz-seletor-container');
    const painelConteudo = painel?.querySelector<HTMLElement>('.painel-conteudo');
    const painelBotoes = document.getElementById('painel-header-botoes');
    if (!painel || !painelConteudo || !painelBotoes || !painelSeletorContainer) return;

    let { estabelecimentos, NotaDoAssistente, fontes } = resultadoIA;

    // --- LÓGICA DE CONSOLIDAÇÃO ---
    // Se a IA retornar uma "Filial" e uma "Matriz" com o mesmo CNPJ, consolide em um único registro.
    if (estabelecimentos && estabelecimentos.length === 2) {
        const filial = estabelecimentos.find((e: any) => e.tipo.toLowerCase() === 'filial');
        const matriz = estabelecimentos.find((e: any) => e.tipo.toLowerCase() === 'matriz');

        // Checa por CNPJ, ignorando formatação
        if (filial && matriz && filial.dados?.CNPJ && filial.dados.CNPJ.replace(/[^\d]/g, '') === matriz.dados.CNPJ.replace(/[^\d]/g, '')) {
            console.log("Filial e Matriz com mesmo CNPJ. Consolidando em um único registro.");
            // A nota do assistente já explica a situação. A UI deve mostrar um único registro.
            // Vamos usar os dados da Matriz, que geralmente são mais completos.
            estabelecimentos = [matriz]; 
        }
    }

    if (!estabelecimentos || estabelecimentos.length === 0) {
        // Lida com o caso de não encontrar resultados, mostrando apenas a nota.
        painelConteudo.querySelector('.analise-assistente-container')?.remove();
        const notaHtml = `<div class="analise-assistente-container" style="margin-top: 15px;">
                            <div class="nota-assistente" style="margin-top: 5px;">
                                <span class="icone-nota-assistente">💡</span>
                                <div><p>${linkifyCitations(NotaDoAssistente || "Nenhum dado encontrado.", fontes || [])}</p></div>
                            </div>
                          </div>`;
        painelConteudo.querySelector('.matriz-dados-container')?.insertAdjacentHTML('beforeend', notaHtml);
        return;
    }
    
    // Geocodificação e lógica de fallback
    for (const est of estabelecimentos) {
        if (est.coordenadas) continue;
        const dados = est.dados || {};
        const enderecoParaGeo = { logradouro: dados['Logradouro'], numero: dados['Número'], cidade: dados['Cidade'], estado: dados['Estado'] };
        if (enderecoParaGeo.logradouro && enderecoParaGeo.cidade) {
            est.coordenadas = await buscarCoordenadasPorEndereco(enderecoParaGeo);
            if (!est.coordenadas) est.geocodificacaoFalhou = true;
        } else {
            est.geocodificacaoFalhou = true;
        }
    }
    const localOriginal = estabelecimentos[0];
    if (localOriginal?.coordenadas) {
        estabelecimentos.forEach((est: any) => {
            if (!est.coordenadas) est.coordenadas = localOriginal.coordenadas;
        });
    }

    // Lógica de visibilidade condicional dos campos
    const matriz = estabelecimentos.length > 1 ? estabelecimentos.find((e: any) => e.tipo.toLowerCase() === 'matriz') : null;
    const filialDados = (localOriginal.dados || {});
    const matrizDados = matriz ? (matriz.dados || {}) : {};
    
    // Armazena os dados para o switcher
    painel.dataset.estabelecimentos = JSON.stringify(estabelecimentos);
    painel.dataset.fontes = JSON.stringify(fontes || []);

    // ---- Renderização da Estrutura Única ----
    painelSeletorContainer.innerHTML = '';
    if (estabelecimentos.length > 1) {
        const seletorHtml = `<div class="matriz-switcher">
            ${estabelecimentos.map((est: any, index: number) => `
                <button class="switcher-btn ${index === 0 ? 'active' : ''}" data-index="${index}">
                    ${est.tipo === 'Matriz' ? 'Matriz (Sede)' : 'Filial'}
                    ${est.geocodificacaoFalhou ? `<span class="aviso-geofalha" style="display: none; margin-left: 8px; font-size: 9px; font-weight: 600; color: #dc3545; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; padding: 1px 5px;">Geo indisponível</span>` : ''}
                </button>
            `).join('')}
        </div>`;
        painelSeletorContainer.innerHTML = seletorHtml;
    }

    // Cria a tabela com todos os campos possíveis
    const campos = ['Nome fantasia', 'Razão social', 'CNPJ', 'Situação Cadastral', 'Logradouro', 'Número', 'Bairro', 'Cidade', 'Estado', 'CEP', 'País', 'Telefone', 'Site', 'E-mail', 'Atividade', 'Clientes'];
    let linhasTabela = '';
    for (const campo of campos) {
        const isCampoAnalise = ['Atividade', 'Clientes'].includes(campo);
        const elemento = isCampoAnalise 
            ? `<div class="matriz-texto-info" data-campo="${campo}"></div>` 
            : `<textarea class="matriz-input-valor" data-campo="${campo}" ${campo !== 'Nome fantasia' ? 'readonly' : ''}></textarea>`;
        
        linhasTabela += `<tr data-campo-container="${campo}"><td>${campo}</td><td>${elemento}</td></tr>`;
    }

    // Nota do assistente e fontes
    let notaEFontesHtml = '';
    if (NotaDoAssistente || (fontes && fontes.length > 0)) {
        notaEFontesHtml = `<div class="analise-assistente-container" style="margin-top: 15px; border-top: 1px solid #eee; padding-top: 15px;">
            ${NotaDoAssistente ? `<div class="nota-assistente">
                <span class="icone-nota-assistente">💡</span>
                <div><p>${linkifyCitations(NotaDoAssistente, fontes || [])}</p></div>
            </div>` : ''}
            ${(fontes && fontes.length > 0) ? `<div class="fontes-assistente">
                <p><strong>Fontes da Pesquisa</strong></p>
                <ul>${fontes.map((f: any, i: number) => `<li>[${i + 1}] <a href="${f.uri}" target="_blank" rel="noopener noreferrer">${f.title}</a></li>`).join('')}</ul>
            </div>` : ''}
        </div>`;
    }

    // Montagem final
    painelConteudo.innerHTML = `
        <div class="matriz-dados-container">
            <table class="matriz-dados-pivot">${linhasTabela}</table>
        </div>
        ${notaEFontesHtml}`;
    
    // Popula a tabela com os dados do primeiro estabelecimento
    preencherCamposComDados(filialDados, fontes);

    // Aplica a lógica de visibilidade
    const situacao = filialDados['Situação Cadastral']?.toUpperCase();
    painelConteudo.querySelector<HTMLElement>('[data-campo-container="Situação Cadastral"]')?.classList.toggle('campo-oculto', !situacao || situacao === 'ATIVA');
    
    const mostrarBairro = !!matriz && filialDados['Bairro'] !== matrizDados['Bairro'];
    const mostrarCidade = !!matriz && filialDados['Cidade'] !== matrizDados['Cidade'];
    const mostrarEstado = !!matriz && filialDados['Estado'] !== matrizDados['Estado'];

    painelConteudo.querySelector<HTMLElement>('[data-campo-container="Bairro"]')?.classList.toggle('campo-oculto', !mostrarBairro);
    painelConteudo.querySelector<HTMLElement>('[data-campo-container="Cidade"]')?.classList.toggle('campo-oculto', !mostrarCidade);
    painelConteudo.querySelector<HTMLElement>('[data-campo-container="Estado"]')?.classList.toggle('campo-oculto', !mostrarEstado);

    ['CEP', 'País'].forEach(c => { // Oculta sempre, a menos que seja necessário no futuro
         painelConteudo.querySelector<HTMLElement>(`[data-campo-container="${c}"]`)?.classList.add('campo-oculto');
    });

    renderizarBotoesDeAcao(painelBotoes, () => {
        const dadosEditados: { [key: string]: string } = {};
        painelConteudo.querySelectorAll<HTMLTextAreaElement>('[data-campo]').forEach(el => {
            if (el.dataset.campo) dadosEditados[el.dataset.campo] = (el as HTMLTextAreaElement).value || el.textContent || '';
        });
        analisarLocalConsolidadoComAssistente(dadosEditados);
    });

    setupAutoResizeListeners(painelConteudo);

    // Listeners para o switcher
    painelSeletorContainer.querySelectorAll('.switcher-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetIndex = parseInt((btn as HTMLElement).dataset.index!, 10);
            const estData = JSON.parse(painel.dataset.estabelecimentos || '[]')[targetIndex];
            const fontesData = JSON.parse(painel.dataset.fontes || '[]');
            
            if (!estData) return;

            // UI do switcher
            painelSeletorContainer.querySelectorAll('.switcher-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            painelSeletorContainer.querySelectorAll<HTMLElement>('.aviso-geofalha').forEach(aviso => aviso.style.display = 'none');
            const avisoAtual = btn.querySelector<HTMLElement>('.aviso-geofalha');
            if (avisoAtual) avisoAtual.style.display = 'inline-block';

            // Atualiza campos e visibilidade
            preencherCamposComDados(estData.dados, fontesData);
            const situacao = estData.dados['Situação Cadastral']?.toUpperCase();
            painelConteudo.querySelector<HTMLElement>('[data-campo-container="Situação Cadastral"]')?.classList.toggle('campo-oculto', !situacao || situacao === 'ATIVA');
            
            // Move pino no mapa
            if (estData.coordenadas && estado.pinoDoPainel) {
                 estado.pinoDoPainel.setLatLng(estData.coordenadas);
                 estado.mapa.panTo(estData.coordenadas, { animate: true, duration: 0.5 });
            }
        });
    });
};


/**
 * Renderiza uma NOVA matriz de dados com o resultado da análise do Assistente.
 * Usado no fluxo onde não há uma matriz pré-existente (ex: análise direta de OSM).
 * @param dadosIniciais - O objeto JSON com os dados iniciais do OSM.
 */
export const criarNovaMatrizDeAnaliseIA = (dadosIniciais: any) => {
    const painelConteudo = document.querySelector<HTMLElement>('#painel-matriz-teste .painel-conteudo');
    const painelBotoes = document.getElementById('painel-header-botoes');
    if (!painelConteudo || !painelBotoes) return;
    
    // Garante que todos os campos padrão sejam renderizados, mesmo que vazios
    const todosOsCampos = ['Nome fantasia', 'Razão social', 'CNPJ', 'Situação Cadastral', 'Logradouro', 'Número', 'Bairro', 'Cidade', 'Estado', 'CEP', 'País', 'Telefone', 'Site', 'E-mail'];
    const camposOcultosInicialmente = new Set(['Bairro', 'Cidade', 'Estado', 'CEP', 'País', 'Situação Cadastral']);
    let linhasHtml = '';

    for (const chave of todosOsCampos) {
        const valor = dadosIniciais[chave] || '';
        const classeOculta = camposOcultosInicialmente.has(chave) ? 'campo-oculto' : '';
        linhasHtml += `
            <tr class="${classeOculta}" data-campo-container="${chave}">
                <td>${chave}</td>
                <td><textarea class="matriz-input-valor" data-campo="${chave}">${escapeHtmlValue(valor)}</textarea></td>
            </tr>
        `;
    }
    
    painelConteudo.innerHTML = `
        <div class="matriz-dados-container">
            <table class="matriz-dados-pivot"><tbody>${linhasHtml}</tbody></table>
        </div>`;
    
    renderizarBotoesDeAcao(painelBotoes, () => {
        const dadosEditados: { [key: string]: string } = {};
        painelConteudo.querySelectorAll<HTMLTextAreaElement>('.matriz-input-valor').forEach(input => {
            if (input.dataset.campo) dadosEditados[input.dataset.campo] = input.value;
        });
        analisarLocalConsolidadoComAssistente(dadosEditados);
    });
    
    setupAutoResizeListeners(painelConteudo);
};


/**
 * Inicializa o painel de teste com uma mensagem de placeholder.
 */
export const inicializarMatrizDeTeste = () => {
    const painelConteudo = document.querySelector<HTMLElement>('#painel-matriz-teste .painel-conteudo');
    const painelBotoes = document.getElementById('painel-header-botoes');
    const painelSeletor = document.getElementById('painel-matriz-seletor-container');
    if (painelConteudo) {
        painelConteudo.innerHTML = '<p style="text-align:center; color:#888; padding: 20px;">Use o botão "Analisar Local" para exibir as propriedades de um ponto no mapa.</p>';
    }
    if(painelBotoes) {
        painelBotoes.innerHTML = ''; // Limpa os botões
    }
    if(painelSeletor) {
        painelSeletor.innerHTML = ''; // Limpa o seletor
    }
};