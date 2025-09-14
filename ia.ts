import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import * as estado from "./estado";
import { InfoLocalDividida } from "./tipos";
import { mostrarBannerErro, mostrarOverlayErroMapa } from "./utilitarios";
import { obterInfoPreliminarLocalizacao, buscarEstabelecimentosGooglePlaces, obterDetalhesLugarGoogle, inicializarServicosGoogle, buscarEstabelecimentosOSM } from "./servicos-geo";
import { criarNovaMatrizDeAnaliseIA, renderizarMatrizConsolidada, atualizarMatrizComDadosIA } from "./matriz";
import { obterChaveApi } from "./chave-api";

declare var L: any;

/**
 * Adiciona a classe de painel ativo ao body e mostra o painel de análise,
 * invalidando o tamanho do mapa para se ajustar ao novo layout.
 */
const abrirPainelAnalise = () => {
    document.body.classList.add('painel-lateral-ativo');
    const painel = document.getElementById('painel-matriz-teste');
    if (painel) painel.classList.add('visivel');
    
    // Aguarda a transição do CSS para então ajustar o mapa.
    setTimeout(() => {
        if (estado.mapa) estado.mapa.invalidateSize({ animate: true, duration: 0.3 });
    }, 100); 
};

/**
 * Remove a classe de painel ativo do body e esconde o painel de análise,
 * invalidando o tamanho do mapa para que ele ocupe todo o espaço.
 */
const fecharPainelAnalise = () => {
    document.body.classList.remove('painel-lateral-ativo');
    const painel = document.getElementById('painel-matriz-teste');
    if (painel) painel.classList.remove('visivel');
    
    // Aguarda a transição do CSS para então ajustar o mapa.
    setTimeout(() => {
        if (estado.mapa) estado.mapa.invalidateSize({ animate: true, duration: 0.3 });
    }, 100);
};


/**
 * Pede ao assistente para pesquisar e preencher dados corporativos de um local, preservando o endereço original.
 * @param dadosAtuais - Objeto com as informações já conhecidas e visíveis na tela.
 * @param isPotencialMatriz - Flag que indica se a busca deve ser focada apenas em uma matriz.
 */
const enriquecerDadosComAssistente = async (dadosAtuais: any, isPotencialMatriz: boolean): Promise<any> => {
    if (!estado.ai) throw new Error("Assistente não inicializado.");

    const prompt = `
      Você é um assistente de pesquisa e inteligência de negócios com foco forense, especialista em verificar e completar dados corporativos. Sua missão é descobrir a realidade ATUAL de um estabelecimento.

      **Situação Atual:**
      Um usuário identificou um local com os seguintes dados:
      - Nome Fantasia: "${dadosAtuais['Nome fantasia'] || ''}"
      - Endereço: "${dadosAtuais['Logradouro'] || ''}, ${dadosAtuais['Número'] || ''}, ${dadosAtuais['Bairro'] || ''}, ${dadosAtuais['Cidade'] || ''} - ${dadosAtuais['Estado'] || ''}"
      - CNPJ Fornecido: "${dadosAtuais['CNPJ'] || 'Não informado'}"

      ${isPotencialMatriz ?
        `
      **Diretiva Principal: Análise de Matriz**
      O usuário acredita que este local é a MATRIZ de uma empresa (possivelmente pelo CNPJ com final 0001). Sua tarefa é investigar, confirmar e enriquecer os dados exclusivamente desta matriz.

      **Seu Processo de Verificação:**
      1.  **Investigação:** Usando o nome, endereço e CNPJ (se disponível), encontre o registro da empresa neste local.
      2.  **Confirmação:** Verifique se o CNPJ encontrado é de fato uma matriz. Confirme a **Situação Cadastral** (ATIVA, BAIXADA, etc.).
      3.  **Enriquecimento:** Complete todos os dados cadastrais possíveis para esta MATRIZ a partir de fontes oficiais (Receita Federal, etc.).
      4.  **Análise Qualitativa:** Forneça uma análise sobre a "Atividade" principal e o perfil de "Clientes".
      5.  **Nota do Assistente:** Explique seu processo de verificação. Se o CNPJ não for de uma matriz, explique o que você encontrou.
        `
      :
        `
      **Diretiva Principal: Análise Filial-Matriz**
      Sua tarefa é primeiro identificar o estabelecimento no local fornecido (considerado uma FILIAL ou ponto de operação) e DEPOIS encontrar sua MATRIZ correspondente.

      **Seu Processo de Investigação em Múltiplas Etapas:**
      **Etapa 1: Descoberta da Filial**
      1. Conduza uma busca para encontrar o CNPJ relacionado ao nome/endereço da Filial.
      2. Verifique a **Situação Cadastral** deste CNPJ (ex: ATIVA, BAIXADA).
      3. **REGRA DE OURO:** Se encontrar um CNPJ 'BAIXADA', você DEVE imediatamente pesquisar se existe OUTRO CNPJ com situação 'ATIVA' no mesmo endereço. O CNPJ 'ATIVO' sempre tem prioridade.

      **Etapa 2: Identificação da Matriz**
      1. Com base na empresa 'ATIVA' identificada, descubra os dados da sua Matriz (CNPJ final 0001).
      2. **Verificação Crítica do Endereço da Matriz:** Busque o endereço oficial da matriz em fontes governamentais. Registros da web podem estar desatualizados.
        `
      }

      **REGRAS PARA O JSON DE SAÍDA (Comum a ambas as diretivas):**
      Sua resposta DEVE ser um único objeto JSON e NADA MAIS.
      - **IMPORTANTE:** Se a Filial e a Matriz forem a mesma entidade (mesmo CNPJ e operando no mesmo local), o array "estabelecimentos" DEVE conter apenas **um único objeto** com o tipo "Matriz".
      - Se na diretiva "Análise de Matriz", o array "estabelecimentos" deve conter **um único objeto** do tipo "Matriz".
      - Se na diretiva "Análise Filial-Matriz" e a Matriz for uma entidade distinta, o array "estabelecimentos" deve conter **dois objetos**: a "Filial" primeiro, e depois a "Matriz".
      NÃO inclua o campo "coordenadas".

      **Formato do JSON de Resposta (exemplo com dois estabelecimentos):**
      {
        "estabelecimentos": [
          {
            "tipo": "Filial",
            "dados": {
              "Nome fantasia": "...", "Razão social": "...", "CNPJ": "...", "Situação Cadastral": "ATIVA", "Logradouro": "...", "Número": "...", "Bairro": "...", "Cidade": "...", "Estado": "...", "CEP": "...", "Telefone": "...", "Site": "...", "E-mail": "...", "Atividade": "...", "Clientes": "..."
            }
          },
          {
            "tipo": "Matriz",
            "dados": {
              "Nome fantasia": "...", "Razão social": "...", "CNPJ": "...", "Situação Cadastral": "ATIVA", "Logradouro": "...", "Número": "...", "Bairro": "...", "Cidade": "...", "Estado": "...", "CEP": "...", "Telefone": "...", "Site": "...", "E-mail": "...", "Atividade": "...", "Clientes": "..."
            }
          }
        ],
        "NotaDoAssistente": "..."
      }
    `;

    try {
        const response: GenerateContentResponse = await estado.ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            }
        });
        
        let jsonText = response.text.trim();
        
        // Failsafe para remover markdown que o modelo pode adicionar
        const match = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
        if (match && match[1]) {
          jsonText = match[1];
        }

        if (!jsonText || !jsonText.startsWith('{')) {
          console.warn("A resposta da API não foi um objeto JSON válido. Resposta:", jsonText);
          return { estabelecimentos: [] }; // Retorna estrutura vazia
        }
        
        const resultadoIA = JSON.parse(jsonText);

        // Extrai as fontes da pesquisa (grounding)
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const fontes = groundingChunks
          ?.map((chunk: any) => chunk.web)
          .filter((web: any): web is { uri: string; title: string } => web && web.uri && web.title)
          .reduce((acc: any[], current: any) => {
              if (!acc.some(item => item.uri === current.uri)) {
                  acc.push(current);
              }
              return acc;
          }, []) || [];

        resultadoIA.fontes = fontes; // Adiciona as fontes ao objeto de resultado

        return resultadoIA;

    } catch (error) {
        console.error("Erro na chamada do Assistente para enriquecimento de dados:", error);
         if (error instanceof SyntaxError) {
            throw new Error("O Assistente retornou uma resposta em um formato inesperado. Tente novamente.");
        }
        throw new Error("O Assistente não conseguiu processar os dados do local.");
    }
};


/**
 * Orquestra a análise do local alternativo (OSM) com o assistente.
 */
export const analisarLocalAlternativoComIA = async (info: InfoLocalDividida, osmTags: any = null) => {
    exibirPainelDeAnalise(info.coordenadas);
    
    const painelConteudo = document.querySelector<HTMLElement>('#painel-matriz-teste .painel-conteudo');
    if (painelConteudo) {
        painelConteudo.innerHTML = `<div class="info-cliente-popup"><strong>Analisando local alternativo com o Assistente...</strong></div>`;
    }

    try {
        const osmData = info.resultadoOSM.dados;
        const address = osmData?.address || {};
        const tags = osmTags || {}; // Usa as tags do POI se fornecidas

        // Monta o objeto com todos os campos esperados pela matriz, priorizando dados do OSM.
        const dadosIniciais = {
            'Nome fantasia': tags.name || address.amenity || address.shop || address.office || '',
            'Razão social': '',
            'Logradouro': address.road || '',
            'Número': address.house_number || '',
            'Bairro': address.suburb || '',
            'Cidade': address.city || address.town || '',
            'Estado': address.state || '',
            'CEP': address.postcode || '',
            'País': address.country || '',
            'Telefone': tags.phone || '',
            'Site': tags.website || '',
            'E-mail': '',
            'CNPJ': '',
            'Situação Cadastral': '',
        };
        
        // A função de renderização agora cria a tabela editável
        criarNovaMatrizDeAnaliseIA(dadosIniciais);
        
    } catch(error) {
        if(painelConteudo) {
            painelConteudo.innerHTML = `<div class="info-cliente-popup"><strong>Erro na Análise</strong><hr><p>${(error as Error).message}</p></div>`;
        }
    }
}

/**
 * Pega os dados já consolidados e pede ao Assistente para preencher o que falta.
 * @param dadosAtuais - Os dados já unificados do Google/OSM.
 */
export const analisarLocalConsolidadoComAssistente = async (dadosAtuais: any) => {
    abrirPainelAnalise();

    const painelConteudo = document.querySelector<HTMLElement>('#painel-matriz-teste .painel-conteudo');
    const btnAnalisar = document.getElementById('btn-enriquecer-ia') as HTMLButtonElement;
    
    if (btnAnalisar) {
        const spinner = btnAnalisar.querySelector('.btn-spinner') as HTMLElement;
        const textoBtn = btnAnalisar.querySelector('.texto-btn') as HTMLElement;
        
        btnAnalisar.disabled = true;
        if (spinner) spinner.style.display = 'block';
        if (textoBtn) textoBtn.textContent = 'Buscando...';
    }
    
    const cnpj = dadosAtuais['CNPJ'] || '';
    const cnpjNumerico = cnpj.replace(/[^\d]/g, '');
    const isPotencialMatriz = cnpjNumerico.length === 14 && cnpjNumerico.substring(8, 12) === '0001';

    try {
        const resultadoIA = await enriquecerDadosComAssistente(dadosAtuais, isPotencialMatriz);
        if (resultadoIA && resultadoIA.estabelecimentos && resultadoIA.estabelecimentos.length > 0) {
            
            // Garante que Filial (se existir) venha antes da Matriz
            resultadoIA.estabelecimentos.sort((a: any, b: any) => {
                if (a.tipo?.toLowerCase() === 'filial') return -1;
                if (b.tipo?.toLowerCase() === 'filial') return 1;
                return 0;
            });

            // Adiciona as coordenadas originais da filial/local para manter a referência
            if (estado.pinoDoPainel) {
                 const localOriginalCoords = estado.pinoDoPainel.getLatLng();
                 // Acessa o primeiro item com segurança após a ordenação
                 resultadoIA.estabelecimentos[0].coordenadas = { lat: localOriginalCoords.lat, lng: localOriginalCoords.lng };
            }
            
            await atualizarMatrizComDadosIA(resultadoIA);

        } else {
            throw new Error("O Assistente não retornou uma análise válida.");
        }
    } catch(error) {
        if (painelConteudo) {
            // Remove mensagens de erro antigas antes de adicionar uma nova
            painelConteudo.querySelector('.mensagem-erro-ia')?.remove();
            const containerBotoes = painelConteudo.querySelector('.matriz-botoes-container');
            containerBotoes?.insertAdjacentHTML('beforebegin', `<p class="mensagem-erro-ia" style="color:red; font-size: 12px; margin-top: 5px; margin-bottom: 0;">${(error as Error).message}</p>`);
        }
    } finally {
        // Garante de forma robusta que o estado do botão seja restaurado
        const finalBtn = document.getElementById('btn-enriquecer-ia') as HTMLButtonElement;
        if (finalBtn) {
            finalBtn.disabled = false;
            const finalSpinner = finalBtn.querySelector('.btn-spinner') as HTMLElement | null;
            const finalTexto = finalBtn.querySelector('.texto-btn') as HTMLElement | null;
            if (finalSpinner) {
                finalSpinner.style.display = 'none';
            }
            if (finalTexto) {
                finalTexto.textContent = 'Buscar detalhes';
            }
        }
    }
};

/**
 * Exibe o painel de análise e cria o pino arrastável no mapa.
 * @param coords Coordenadas {lat, lng} para posicionar o pino.
 */
const exibirPainelDeAnalise = (coords: { lat: number, lng: number }) => {
    // Remove o pino de análise anterior, se houver
    if (estado.pinoDoPainel) {
        estado.mapa.removeLayer(estado.pinoDoPainel);
    }

    // Cria o novo pino de análise arrastável
    const iconePinoAnalise = L.divIcon({
        className: 'pino-personalizado',
        iconSize: [32, 42],
        iconAnchor: [16, 42]
    });
    const pinoAnalise = L.marker(coords, { icon: iconePinoAnalise, draggable: true }).addTo(estado.mapa);
    estado.setPinoDoPainel(pinoAnalise);

    // Adiciona o evento de arrastar para re-analisar ao soltar
    pinoAnalise.on('dragend', (e: any) => {
        const newLatLng = e.target.getLatLng();
        esconderPainelEseuPino();
        iniciarFluxoOQueTemAqui(newLatLng);
    });

    // Abre o painel lateral
    abrirPainelAnalise();
};


/**
 * Busca detalhes de um lugar do Google e renderiza a matriz de dados.
 */
const mostrarDetalhesDoLugar = async (placeId: string, info: InfoLocalDividida) => {
    exibirPainelDeAnalise(info.coordenadas);

    const painelConteudo = document.querySelector<HTMLElement>('#painel-matriz-teste .painel-conteudo');
    if (painelConteudo) {
        painelConteudo.innerHTML = `<div class="info-cliente-popup"><strong>Carregando detalhes...</strong></div>`;
    }

    try {
        const lugarDetalhado = await obterDetalhesLugarGoogle(placeId);
        if (lugarDetalhado) {
            renderizarMatrizConsolidada(lugarDetalhado, info);
        } else {
            throw new Error("Não foi possível carregar os detalhes do local.");
        }
    } catch (error) {
        console.error("Erro ao obter detalhes do lugar:", error);
        if (painelConteudo) {
            painelConteudo.innerHTML = `<div class="info-cliente-popup"><strong>Erro ao carregar detalhes</strong><hr><p>${(error as Error).message}</p></div>`;
        }
    }
};

/**
 * Cria o HTML para a lista de seleção de estabelecimentos dentro do popup.
 */
const criarPopupSelecaoEstabelecimento = (lugares: any[], infoPreliminar: InfoLocalDividida): string => {
    let listaHtml = '';
    if (lugares.length > 0) {
        listaHtml = lugares.map(lugar => {
            if (lugar.source === 'OSM') {
                return `
                    <li>
                        <button class="btn-lugar-painel" data-osm-id="${lugar.osm_id}" data-osm-tags='${JSON.stringify(lugar.osm_tags)}'>
                            <strong>${lugar.name}</strong><br>
                            <span style="font-size:11px; color: #555;">(OSM) ${lugar.vicinity}</span>
                        </button>
                    </li>
                `;
            }
            // Padrão para Google
            return `
                <li>
                    <button class="btn-lugar-painel" data-place-id="${lugar.place_id}">
                        <strong>${lugar.name}</strong><br>
                        <span style="font-size:12px; color: #555;">${lugar.vicinity}</span>
                    </button>
                </li>
            `;
        }).join('');
    }

    const fonte = lugares[0]?.source ? (lugares[0].source === 'OSM' ? ' (via OpenStreetMap)' : '') : '';
    const titulo = lugares.length > 0 ? `Selecione um estabelecimento${fonte}:` : 'Nenhum estabelecimento encontrado.';
    const osmDisplayName = infoPreliminar.resultadoOSM.dados?.display_name?.split(',').slice(0, 2).join(',') || 'este local';

    return `
        <div class="info-cliente-popup">
            <div class="lista-lugares-titulo">${titulo}</div>
            <div class="lista-lugares-painel" style="margin-top: 5px; ${lugares.length > 0 ? 'border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 8px;' : ''}">
                <ul style="max-height: 120px; overflow-y: auto;">
                    ${listaHtml}
                </ul>
            </div>

            <div class="lista-lugares-titulo" style="font-size: 11px; color: #666; text-transform: uppercase;">Alternativa</div>
            <button class="btn-lugar-painel" data-action="analisar-osm" style="padding-top: 8px;">
                <strong>Analisar: ${osmDisplayName}</strong>
            </button>
        </div>
    `;
};

/**
 * Cria o HTML para o popup inicial de confirmação do local.
 * @param info - Informações preliminares do local (OSM).
 */
const criarPopupConfirmacao = (info: InfoLocalDividida): string => {
    const osmData = info.resultadoOSM.dados;
    let nomeLocal = 'Local selecionado';
    if (osmData && osmData.display_name) {
        nomeLocal = osmData.display_name.split(',').slice(0, 3).join(',');
    }

    return `
        <div class="info-cliente-popup" style="width: 280px;">
            <strong>Analisar este local?</strong>
            <div class="popup-endereco-confirmacao">${nomeLocal}</div>
            <div class="popup-botoes-container">
                <button id="btn-cancelar-analise" class="map-btn btn-cancelar">Cancelar</button>
                <button id="btn-confirmar-analise-local" class="map-btn btn-confirmar">
                    <span class="texto-btn">Confirmar</span>
                    <div class="btn-spinner"></div>
                </button>
            </div>
        </div>
    `;
};

/**
 * Após a confirmação do local, busca estabelecimentos e mostra a lista de seleção.
 * @param latlng - As coordenadas do ponto selecionado.
 * @param infoPreliminar - As informações já obtidas do OpenStreetMap.
 */
const processarSelecaoLocal = async (latlng: any, infoPreliminar: InfoLocalDividida) => {
    // Remove pino de sugestão anterior para evitar múltiplos popups.
    if (estado.pinoDeSugestao) {
        estado.mapa.removeLayer(estado.pinoDeSugestao);
    }

    // Mostra um popup temporário de "carregando"
    const tempPopup = L.popup({ closeButton: false, minWidth: 200 })
        .setLatLng(latlng)
        .setContent('<div class="info-cliente-popup"><strong>Inicializando...</strong></div>')
        .openOn(estado.mapa);

    try {
        // 1. Inicializa os serviços do Google sob demanda.
        await inicializarServicosGoogle();
        
        let lugares: any[] = [];
        
        // 2. Tenta buscar no Google Places primeiro
        try {
            tempPopup.setContent('<div class="info-cliente-popup"><strong>Buscando estabelecimentos (Google)...</strong></div>');
            lugares = await buscarEstabelecimentosGooglePlaces(latlng.lat, latlng.lng);
        } catch (error) {
            console.warn("Falha na API do Google Places. Tentando fallback para OSM.", error);
            // Se a busca no Google falhar, o array 'lugares' permanece vazio,
            // acionando a lógica de fallback abaixo.
        }
        
        // 3. Se o Google não retornar nada (falha ou zero resultados), usa o OSM como fallback
        if (lugares.length === 0) {
            console.log("Nenhum resultado do Google. Usando OpenStreetMap como fallback.");
            tempPopup.setContent('<div class="info-cliente-popup"><strong>Buscando estabelecimentos (OSM)...</strong></div>');
            lugares = await buscarEstabelecimentosOSM(latlng.lat, latlng.lng);
        }
        
        // 4. Cria e exibe o popup final com a lista de seleção
        const conteudoSelecao = criarPopupSelecaoEstabelecimento(lugares, infoPreliminar);
        const pinoSelecao = L.marker(latlng, { opacity: 0 }).addTo(estado.mapa); // Marcador invisível para ancorar o popup
        estado.setPinoDeSugestao(pinoSelecao);

        pinoSelecao.bindPopup(conteudoSelecao, {
            minWidth: 250,
            autoClose: false,
        }).openPopup();

        // 5. Adiciona os listeners aos novos botões dentro do popup
        const container = pinoSelecao.getPopup().getElement();
        container?.querySelectorAll('.btn-lugar-painel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                L.DomEvent.stopPropagation(e as MouseEvent);
                const target = e.currentTarget as HTMLButtonElement;
                const placeId = target.dataset.placeId;
                const osmId = target.dataset.osmId;
                const osmTags = target.dataset.osmTags;
                const action = target.dataset.action;

                if (placeId) {
                    mostrarDetalhesDoLugar(placeId, infoPreliminar);
                } else if (osmId && osmTags) {
                    analisarLocalAlternativoComIA(infoPreliminar, JSON.parse(osmTags));
                } else if (action === 'analisar-osm') {
                    analisarLocalAlternativoComIA(infoPreliminar);
                }
                
                cancelarModoOQueTemAqui(); // Cancela o modo após uma seleção
            });
        });

        pinoSelecao.getPopup().on('remove', () => {
             cancelarModoOQueTemAqui();
        });
        
    } catch (error) {
        const typedError = error as Error;
        console.error("Erro no fluxo 'O que tem aqui?':", typedError.message);
        
        const isMissingKeyError = typedError.message.includes("não foi configurada no ambiente");
        const titulo = isMissingKeyError ? "Chave de API Ausente" : "Falha na API do Google";
        const mensagem = isMissingKeyError 
            ? `${typedError.message} A funcionalidade 'O que tem aqui?' requer uma chave de API do Google.`
            : `${typedError.message} Verifique a validade da chave, se a "Places API" está ativada e se há faturamento habilitado.`;
            
        mostrarOverlayErroMapa(titulo, mensagem);
        cancelarModoOQueTemAqui();
    } finally {
        tempPopup.remove(); // Remove o popup de "carregando"
    }
}


/**
 * Orquestra o fluxo inicial de busca e exibição de popup de confirmação.
 */
const iniciarFluxoOQueTemAqui = async (latlng: any) => {
    cancelarModoOQueTemAqui(); // Limpa qualquer estado anterior

    // Mostra um popup temporário de "verificando"
    const tempPopup = L.popup({ closeButton: false, minWidth: 200 })
        .setLatLng(latlng)
        .setContent('<div class="info-cliente-popup"><strong>Verificando local...</strong></div>')
        .openOn(estado.mapa);

    try {
        const infoPreliminar = await obterInfoPreliminarLocalizacao(latlng.lat, latlng.lng);
        
        // Remove pino de sugestão anterior se existir
        if (estado.pinoDeSugestao) estado.mapa.removeLayer(estado.pinoDeSugestao);

        // Cria um pino de confirmação visível e arrastável
        const iconeConfirmacao = L.divIcon({
            className: 'pino-confirmacao',
            iconSize: [32, 42],
            iconAnchor: [16, 42]
        });

        const pinoConfirmacao = L.marker(latlng, { 
            icon: iconeConfirmacao,
            draggable: true 
        }).addTo(estado.mapa);
        estado.setPinoDeSugestao(pinoConfirmacao);

        /**
         * Atualiza o conteúdo do popup e re-associa os listeners dos botões.
         * @param info - As informações do local para exibir.
         */
        const atualizarPopupConfirmacao = (info: InfoLocalDividida) => {
            const popup = pinoConfirmacao.getPopup();
            const novoConteudo = criarPopupConfirmacao(info);
            
            if (popup) {
                popup.setContent(novoConteudo);
            } else {
                pinoConfirmacao.bindPopup(novoConteudo, {
                    minWidth: 250,
                    autoClose: false,
                    offset: [0, -25]
                }).openPopup();
            }

            const container = pinoConfirmacao.getPopup().getElement();
            const btnConfirmar = container?.querySelector('#btn-confirmar-analise-local') as HTMLButtonElement;
            const btnCancelar = container?.querySelector('#btn-cancelar-analise') as HTMLButtonElement;

            btnCancelar?.addEventListener('click', () => {
                pinoConfirmacao.closePopup();
            });

            btnConfirmar?.addEventListener('click', (e) => {
                L.DomEvent.stopPropagation(e as MouseEvent);
                
                // Ativa o estado de carregamento no botão
                btnConfirmar.classList.add('processando');
                btnConfirmar.disabled = true;
                if(btnCancelar) btnCancelar.disabled = true;
                
                const textoBtn = btnConfirmar.querySelector('.texto-btn');
                if (textoBtn) textoBtn.textContent = 'Analisando...';
                
                // Atraso mínimo para garantir que a UI atualize antes da chamada de rede
                setTimeout(() => {
                    processarSelecaoLocal(pinoConfirmacao.getLatLng(), info);
                }, 100);
            });
        };

        // Configuração inicial do popup
        atualizarPopupConfirmacao(infoPreliminar);

        // Adiciona o listener para o fim do arraste
        pinoConfirmacao.on('dragend', async (e: any) => {
            const newLatLng = e.target.getLatLng();
            const popup = pinoConfirmacao.getPopup();
            
            if(popup) {
                popup.setContent('<div class="info-cliente-popup"><strong>Verificando novo local...</strong></div>');
            }

            try {
                const newInfo = await obterInfoPreliminarLocalizacao(newLatLng.lat, newLatLng.lng);
                atualizarPopupConfirmacao(newInfo);
            } catch (error) {
                console.error("Erro ao obter informações do novo local:", error);
                if(popup) {
                    popup.setContent('<div class="info-cliente-popup" style="color:red;"><strong>Erro ao buscar endereço.</strong><br>Tente mover novamente.</div>');
                }
            }
        });

        // Se o popup for fechado pelo usuário (ex: no 'x'), cancela o modo
        pinoConfirmacao.getPopup().on('remove', () => {
             cancelarModoOQueTemAqui();
        });

    } catch (error) {
        console.error("Erro ao obter informações preliminares:", error);
        mostrarBannerErro("Não foi possível obter informações do local selecionado.");
        cancelarModoOQueTemAqui();
    } finally {
        tempPopup.remove();
    }
};

/**
 * Função para limpar o modo "O que tem aqui?".
 */
const cancelarModoOQueTemAqui = () => {
    if (estado.pinoDeSugestao) {
        estado.mapa.removeLayer(estado.pinoDeSugestao);
        estado.setPinoDeSugestao(null);
    }
    estado.setModoOQueTemAqui(false);
    
    const mapaEl = estado.mapa.getContainer();
    mapaEl.classList.remove('modo-selecao');
    
    const btn = document.getElementById('btn-oque-tem-aqui');
    btn?.classList.remove('active');
    
    estado.mapa.off('click', handleMapClick);
};

/**
 * Ação que apenas esconde o painel e seu pino, sem desativar o modo de análise.
 * Útil para quando o pino é arrastado e uma nova análise vai começar.
 */
const esconderPainelEseuPino = () => {
    fecharPainelAnalise();
    if (estado.pinoDoPainel) {
        estado.mapa.removeLayer(estado.pinoDoPainel);
        estado.setPinoDoPainel(null);
    }
};

/**
 * Ação completa para fechar o painel, chamada pelo botão de fechar.
 */
const fecharPainelMatriz = () => {
    esconderPainelEseuPino();
    // Se o usuário fechou o painel, o modo de análise deve ser cancelado.
    if (estado.modoOQueTemAqui) {
        cancelarModoOQueTemAqui();
    }
};


const handleMapClick = (e: any) => {
    // CORREÇÃO: Se o alvo original do clique (ou um de seus pais) for um ícone de marcador,
    // significa que o clique foi em um pino (provavelmente ao final de um arraste).
    // Nesse caso, ignoramos o evento para não reiniciar o fluxo de análise.
    const targetElement = e.originalEvent.target as HTMLElement;
    if (targetElement.closest('.leaflet-marker-icon')) {
        return;
    }

    if (estado.modoOQueTemAqui) {
        iniciarFluxoOQueTemAqui(e.latlng);
    }
};

export const setupBotaoOQueTemAqui = () => {
    const btn = document.getElementById('btn-oque-tem-aqui') as HTMLButtonElement;
    const btnFecharPainel = document.getElementById('btn-fechar-painel-matriz');
    const mapaEl = document.getElementById('mapa');

    btn?.addEventListener('click', () => {
        if (estado.modoOQueTemAqui) {
            cancelarModoOQueTemAqui();
            return;
        }

        estado.setModoOQueTemAqui(true);
        btn.classList.add('active');
        if (mapaEl) mapaEl.classList.add('modo-selecao');
        estado.mapa.on('click', handleMapClick);
    });

    btnFecharPainel?.addEventListener('click', fecharPainelMatriz);
};

export const inicializarIA = () => {
    try {
        const API_KEY = obterChaveApi();
        if (!API_KEY) {
            throw new Error("A chave da API do Assistente não foi configurada. Funcionalidades de IA estão desabilitadas.");
        }
        estado.setAi(new GoogleGenAI({ apiKey: API_KEY }));
    } catch (error) {
        console.error("Falha ao inicializar o Assistente:", error);
        mostrarBannerErro((error as Error).message);
    }
};

export const transcreverAudioComGemini = async (blobAudio: Blob): Promise<string | null> => {
    if (!estado.ai) {
        mostrarBannerErro("A funcionalidade do Assistente não foi inicializada.");
        return null;
    }
    
    const { blobToBase64 } = await import('./utilitarios');
    const audioBase64 = await blobToBase64(blobAudio);

    const audioPart = {
        inlineData: {
            mimeType: 'audio/webm',
            data: audioBase64,
        },
    };
    const textPart = {
        text: "Transcreva o áudio a seguir, que é uma nota de voz curta de um vendedor em campo. Formate o texto de forma clara."
    };
    
    try {
        const response = await estado.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [textPart, audioPart] },
        });
        return response.text;
    } catch (error) {
        console.error("Erro na transcrição com Gemini:", error);
        throw new Error("Falha ao transcrever o áudio.");
    }
};