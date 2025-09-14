// Estrutura para a "matriz" de dados de vendas detalhadas
export interface VendaDetalhada {
  familia: string;
  vendaAnual: number;
}

// Interface para a estrutura dos dados de cada cliente
export interface Cliente {
  codigo: string;
  nome: string;
  latitude: number;
  longitude: number;
  endereco: string;
  cidade: string;
  estado: string;
  vendaAnualTotal: number;
  ultimaCompra: string;
  microrregiao: string;
  mesorregiao: string;
  cnpj: string;
  representante: string;
  vendasDetalhadas?: VendaDetalhada[];
}

// Interface para o resultado de uma única API de geolocalização
export interface ResultadoGeoAPI {
    dados: any;
    erro?: string;
}

// Interface para a informação de localização consolidada de múltiplas APIs
export interface InfoLocalDividida {
    coordenadas: { lat: number; lng: number };
    resultadoIBGE: ResultadoGeoAPI;
    resultadoOSM: ResultadoGeoAPI;
}


// Interface para uma nota de voz
export interface NotaDeVoz {
  id: string;
  marcador: any;
  urlAudio?: string;
  textoTranscrito?: string;
  estaGravando?: boolean;
}