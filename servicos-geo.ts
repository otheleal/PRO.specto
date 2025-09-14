import { InfoLocalDividida } from "./tipos";
import { obterChaveApi } from "./chave-api";

// Declaração simplificada para o objeto global 'google' injetado pelo script da API.
declare var google: any;

// --- Lógica de inicialização robusta para a API do Google Maps Places ---
let placesService: any = null;
let googleMapsPromise: Promise<void> | null = null;
const GOOGLE_CALLBACK_NAME = "prospectoGoogleMapsCallback";

/**
 * Cria e configura o contêiner de atribuição do Google e inicializa o PlacesService.
 * Isso é crucial para a conformidade com os Termos de Serviço do Google.
 */
const setupPlacesService = () => {
    let attributionContainer = document.getElementById('google-maps-attribution-container');
    if (!attributionContainer) {
        attributionContainer = document.createElement('div');
        attributionContainer.id = 'google-maps-attribution-container';
        // Estilização para tornar a atribuição visível, mas discreta.
        Object.assign(attributionContainer.style, {
            position: 'absolute',
            bottom: '2px',
            right: '2px',
            zIndex: '1003',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            padding: '2px 5px',
            fontSize: '10px',
            borderRadius: '3px'
        });
        document.body.appendChild(attributionContainer);
    }
    placesService = new google.maps.places.PlacesService(attributionContainer);
};

/**
 * Carrega o script da API Google Maps JS de forma assíncrona e segura, usando o padrão de callback.
 * Garante que o script seja carregado apenas uma vez e captura erros de autenticação.
 */
export const inicializarServicosGoogle = (): Promise<void> => {
    const API_KEY = obterChaveApi();
    if (!API_KEY) {
        return Promise.reject(new Error("A chave da API do Google não foi configurada no ambiente."));
    }

    if (googleMapsPromise) {
        return googleMapsPromise;
    }

    googleMapsPromise = new Promise((resolve, reject) => {
        // Se o objeto 'google' já existe, o script foi carregado com sucesso anteriormente.
        if (typeof google !== 'undefined' && google.maps && google.maps.places) {
            if (!placesService) setupPlacesService();
            return resolve();
        }

        const scriptId = 'google-maps-script';
        
        // Define a função de callback global de FALHA que o script do Google irá chamar.
        (window as any).gm_authFailure = () => {
            delete (window as any).gm_authFailure;
            delete (window as any)[GOOGLE_CALLBACK_NAME];
            googleMapsPromise = null; // Permite uma nova tentativa de inicialização no futuro
            reject(new Error("Falha na autenticação do Google Maps. Verifique se a chave de API é válida e se a conta tem faturamento ativado."));
        };

        // Define a função de callback global de SUCESSO.
        (window as any)[GOOGLE_CALLBACK_NAME] = () => {
            setupPlacesService();
            delete (window as any).gm_authFailure;
            delete (window as any)[GOOGLE_CALLBACK_NAME];
            resolve();
        };

        const script = document.createElement('script');
        script.id = scriptId;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places&callback=${GOOGLE_CALLBACK_NAME}`;
        script.async = true;
        script.defer = true;
        
        script.onerror = () => {
            delete (window as any).gm_authFailure;
            delete (window as any)[GOOGLE_CALLBACK_NAME];
            googleMapsPromise = null; // Permite uma nova tentativa
            reject(new Error("Falha de rede ao carregar o script do Google Maps. Verifique sua conexão."));
        };

        document.head.appendChild(script);
    });

    return googleMapsPromise;
};


/**
 * Retorna a instância do PlacesService, garantindo que ela foi inicializada.
 */
const getPlacesService = (): any => {
    if (!placesService) {
        throw new Error("Serviço Google Places não inicializado. Chame 'inicializarServicosGoogle' primeiro.");
    }
    return placesService;
};

/**
 * Converte um código de status da API Google Places em uma mensagem de erro amigável.
 */
const getGooglePlacesErrorMessage = (status: any): string => {
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        return `Ocorreu um erro desconhecido na busca de locais (Código: ${status})`;
    }
    switch (status) {
        case google.maps.places.PlacesServiceStatus.ZERO_RESULTS:
            return "Nenhum resultado encontrado para esta busca.";
        case google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT:
            return "A cota de buscas da API do Google foi excedida. Verifique o faturamento e os limites no seu projeto Google Cloud.";
        case google.maps.places.PlacesServiceStatus.REQUEST_DENIED:
            return "Acesso negado à API do Google. Verifique se a sua chave de API é válida, não possui restrições incorretas e se a 'Places API' está ativada.";
        case google.maps.places.PlacesServiceStatus.INVALID_REQUEST:
            return "A solicitação para a API do Google foi inválida. Isso pode ser um erro interno do aplicativo.";
        case google.maps.places.PlacesServiceStatus.NOT_FOUND:
            return "O local solicitado não foi encontrado nos registros do Google.";
        default:
            return `Ocorreu um erro inesperado ao comunicar com a API do Google Places. (Código de status: ${status})`;
    }
};

// --- FIM: Lógica da API do Google ---

/**
 * Busca informações de endereço usando as APIs do OpenStreetMap (Nominatim) e do IBGE.
 */
export const obterInfoPreliminarLocalizacao = async (lat: number, lng: number): Promise<InfoLocalDividida> => {
    const urlOSM = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const urlIBGE = `https://servicodados.ibge.gov.br/api/v2/geocodigo/pontos?lat=${lat}&lon=${lng}&formato=json`;

    const [resultadoOSM, resultadoIBGE] = await Promise.all([
        fetch(urlOSM)
            .then(res => res.ok ? res.json() : Promise.reject(new Error(`OSM falhou com status ${res.status}`)))
            .then(data => ({ dados: data }))
            .catch(err => ({ dados: null, erro: err.message })),
        
        fetch(urlIBGE)
            .then(res => res.ok ? res.text().then(text => text ? JSON.parse(text) : null) : Promise.reject(new Error(`IBGE falhou com status ${res.status}`)))
            .then(data => (!data || !Array.isArray(data) || data.length === 0) ? { dados: null, erro: "Nenhum endereço encontrado." } : { dados: data[0] })
            .catch(err => ({ dados: null, erro: err.message }))
    ]);

    return {
        coordenadas: { lat, lng },
        resultadoOSM,
        resultadoIBGE,
    };
};

/**
 * Busca estabelecimentos próximos usando a biblioteca nativa do Google Maps.
 */
export const buscarEstabelecimentosGooglePlaces = async (lat: number, lng: number): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        try {
            const service = getPlacesService();
            const request = {
                location: new google.maps.LatLng(lat, lng),
                radius: 50,
            };

            service.nearbySearch(request, (results: any[], status: any) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    const tiposExcluidos = new Set(['political', 'locality', 'sublocality', 'neighborhood', 'administrative_area_level_1', 'administrative_area_level_2', 'country', 'postal_code', 'route', 'street_address', 'plus_code']);
                    const filteredResults = results.filter(lugar => !lugar.types?.some((tipo: string) => tiposExcluidos.has(tipo)));
                    resolve(filteredResults.map(r => ({ ...r, source: 'Google' }))); // Adiciona a fonte
                } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                    resolve([]);
                } else {
                    reject(new Error(getGooglePlacesErrorMessage(status)));
                }
            });
        } catch (error) {
            reject(error);
        }
    });
};

/**
 * Busca estabelecimentos próximos usando a API Overpass do OpenStreetMap como fallback.
 */
export const buscarEstabelecimentosOSM = async (lat: number, lng: number): Promise<any[]> => {
    // A query Overpass QL busca por nós (pontos) que tenham a tag 'name' e
    // uma das tags 'amenity', 'shop' ou 'office' num raio de 50 metros.
    const query = `
        [out:json][timeout:25];
        (
          node["name"](around:50,${lat},${lng})[~"^(amenity|shop|office)$"];
        );
        out body;
        >;
        out skel qt;
    `;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Serviço Overpass respondeu com status ${response.status}`);
        }
        const data = await response.json();
        
        // Mapeia a resposta do Overpass para um formato consistente com o do Google
        return data.elements.map((el: any) => {
            const tags = el.tags || {};
            const tipo = tags.amenity || tags.shop || tags.office || 'Local';
            return {
                osm_id: el.id,
                name: tags.name,
                vicinity: tipo.charAt(0).toUpperCase() + tipo.slice(1).replace(/_/g, ' '),
                source: 'OSM',
                osm_tags: tags // Guarda todos os dados para uso futuro
            };
        });

    } catch (error) {
        console.error("Erro ao buscar dados do OpenStreetMap (Overpass):", error);
        return []; // Retorna um array vazio em caso de erro
    }
};


/**
 * Obtém detalhes de um lugar específico usando a biblioteca nativa do Google Maps.
 */
export const obterDetalhesLugarGoogle = async (placeId: string): Promise<any> => {
    return new Promise((resolve, reject) => {
        try {
            const service = getPlacesService();
            const request = {
                placeId: placeId,
                fields: ['name', 'formatted_address', 'address_components', 'formatted_phone_number', 'website', 'types', 'business_status', 'vicinity'],
            };
            
            service.getDetails(request, (place: any, status: any) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                    resolve(place);
                } else {
                    reject(new Error(getGooglePlacesErrorMessage(status)));
                }
            });
        } catch(error) {
            reject(error);
        }
    });
};

/**
 * Converte um endereço em coordenadas geográficas (Geocodificação), tentando com uma
 * versão mais genérica do endereço se a busca inicial mais específica falhar.
 * @param endereco Objeto com os componentes do endereço a ser pesquisado.
 * @returns Um objeto com { lat, lng } ou null se não for encontrado.
 */
export const buscarCoordenadasPorEndereco = async (endereco: { 
    logradouro?: string; 
    numero?: string; 
    cidade?: string; 
    estado?: string; 
}): Promise<{ lat: number; lng: number } | null> => {

    const { logradouro, numero, cidade, estado } = endereco;

    const pesquisar = async (query: string): Promise<{ lat: number; lng: number } | null> => {
        if (!query.trim()) return null;
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`A geocodificação falhou com o status ${response.status} para a query: "${query}"`);
                return null;
            }
            const data = await response.json();
            if (data && data.length > 0) {
                const { lat, lon } = data[0];
                console.log(`Geocodificação bem-sucedida para "${query}"`);
                return { lat: parseFloat(lat), lng: parseFloat(lon) };
            }
            return null;
        } catch (error) {
            console.error(`Erro de rede ao buscar coordenadas para "${query}":`, error);
            return null;
        }
    };

    // Tentativa 1: Endereço completo e específico
    const enderecoCompleto = [logradouro, numero, cidade, estado].filter(Boolean).join(', ');
    let resultado = await pesquisar(enderecoCompleto);
    if (resultado) return resultado;
    
    // Tentativa 2 (Fallback): Endereço sem o número, que é frequentemente a causa da falha
    if (numero) {
        console.warn(`Falha na geocodificação para o endereço completo: "${enderecoCompleto}". Tentando uma busca mais ampla sem o número.`);
        const enderecoSemNumero = [logradouro, cidade, estado].filter(Boolean).join(', ');
        resultado = await pesquisar(enderecoSemNumero);
        if (resultado) return resultado;
    }

    console.warn(`Nenhuma coordenada encontrada para o endereço: "${enderecoCompleto}" ou suas variações.`);
    return null;
};