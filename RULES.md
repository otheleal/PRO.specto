# Regras PÉTREAS do Projeto

Este documento contém as regras fundamentais e inquebráveis para o desenvolvimento deste aplicativo. O objetivo é garantir a estabilidade, consistência e qualidade do código. **Qualquer alteração deve respeitar estas diretrizes.**

## 1. Estrutura de Dados (`Cliente`)

A interface `Cliente` é o coração do sistema. Qualquer dado de cliente, seja carregado de um CSV ou criado de outra forma, **DEVE** aderir estritamente a esta estrutura.

```typescript
interface Cliente {
  codigo: string;          // Obrigatório e único
  nome: string;            // Obrigatório
  latitude: number;        // Obrigatório
  longitude: number;       // Obrigatório
  endereco: string;
  cidade: string;
  estado: string;
  vendaAnualTotal: number; // Padrão é 0 se não houver dados
  ultimaCompra: string;    // String de data, formato flexível
  microrregiao: string;
  mesorregiao: string;
  cnpj: string;
  representante: string;
  vendasDetalhadas?: VendaDetalhada[]; // Opcional
}
```

- **NUNCA** remova campos obrigatórios.
- **SEMPRE** garanta que `latitude` e `longitude` sejam números válidos antes de criar um marcador no mapa.

## 2. Processamento de Arquivos CSV

A lógica de upload é sensível aos nomes das colunas.

- **Clientes.csv**: As colunas **`Cliente [cód]`**, **`Cliente`**, **`Latitude`**, e **`Longitude`** são **obrigatórias**. A lógica de `encontrarCabecalho` busca por variações (ex: 'código', 'nome'), mas a presença delas é crucial.
- **Vendas.csv**: As colunas **`Cliente [cód]`**, **`Venda anual`**, **`Últim venda`**, e **`Família`** são **obrigatórias** para que a agregação de vendas funcione.
- **NÃO** assuma que os arquivos CSV estarão sempre perfeitamente formatados. A lógica deve ser robusta a células vazias ou valores inesperados (ex: `parseFloat` com substituição de vírgula por ponto).

## 3. Interação com o Mapa (Leaflet)

- **Marcadores**: Todos os marcadores de clientes devem ser adicionados à camada `marcadores` (`L.layerGroup()`). Isso garante que os filtros funcionem corretamente ao limpar e recriar a camada.
- **Popups**: A criação de gráficos (`Chart.js`) dentro de popups é feita no evento `popupopen`. **NÃO** tente criar o gráfico antes do popup ser renderizado no DOM. Lembre-se de destruir a instância do gráfico no `popupclose` (`graficoAtual.destroy()`) para evitar memory leaks.

## 4. Uso de APIs Externas (IA e Mapas)

- **Inicialização**: A instância da IA Gemini (`ai`) é inicializada em `inicializarIA()`. Verifique sempre se `ai` não é `null` antes de fazer uma chamada. A chave de API (`process.env.API_KEY`) é usada tanto para a IA quanto para a API do Google Places.
- **Tratamento de Erros**: Qualquer chamada para APIs externas **DEVE** estar dentro de um bloco `try...catch` para lidar com falhas de rede, erros de API (chaves inválidas, etc.) ou respostas malformadas.
- **Funcionalidade "O que tem aqui?"**: Esta funcionalidade segue um fluxo de múltiplas etapas para garantir precisão e controle do usuário:
    1.  **Seleção no Mapa**: O usuário ativa o modo e clica em um ponto no mapa.
    2.  **Verificação Inicial**: Uma busca preliminar é feita usando a API do OpenStreetMap (Nominatim) para obter o endereço ou nome do local. Um popup de confirmação é exibido.
    3.  **Busca de Estabelecimentos**: Após o usuário clicar em "Confirmar", o aplicativo usa a API Google Places para encontrar uma lista de estabelecimentos comerciais próximos ao ponto selecionado.
    4.  **Seleção do Usuário**: A lista de estabelecimentos é apresentada ao usuário em um novo popup.
    5.  **Análise com IA**: Ao selecionar um estabelecimento da lista, a API Gemini (`gemini-2.5-flash`) é chamada para fornecer uma análise detalhada sobre o potencial comercial daquele local específico. O prompt enviado à IA **DEVE** incluir o máximo de detalhes obtidos da API do Google Places para garantir uma resposta de alta qualidade.
- **Transcrição de Áudio**: O modelo `gemini-2.5-flash` é usado para transcrição. O áudio **DEVE** ser enviado como um `inlineData` com `mimeType` e dados em base64.

## 5. Regras Gerais de Código

- **Imutabilidade**: Onde possível, trate os dados de forma imutável. Ao filtrar, crie um novo array (`clientes.filter(...)`) em vez de modificar o array `clientes` original.
- **Responsividade da UI**: Operações longas (upload de arquivos, chamadas de API) **DEVEM** fornecer feedback visual ao usuário (ex: spinners, desabilitar botões) para evitar cliques duplicados e informar que o sistema está trabalhando.
- **NÃO** introduza novas dependências globais (variáveis no escopo `window`) sem uma discussão prévia.

## 6. Estrutura do Código e Modularidade

- **Divisão por Função**: O código-fonte **DEVE** ser dividido em múltiplos arquivos (`.ts` / `.tsx`), com cada arquivo agrupando funcionalidades relacionadas (ex: `mapa.ts`, `filtros.ts`, `ia.ts`).
- **Nomes em Português**: Os nomes dos arquivos devem seguir o padrão da aplicação e ser em português brasileiro.
- **Módulos ES6**: A comunicação entre arquivos **DEVE** ser feita utilizando o sistema de módulos do ES6 (`import`/`export`). Evite criar variáveis globais para compartilhar funcionalidades.
- **Ponto de Entrada**: O arquivo `index.tsx` deve servir como o ponto de entrada principal, orquestrando a inicialização e a chamada dos diferentes módulos.

## 7. Chave de API e Segurança

- **Ofuscação da Chave**: A chave da API do Google **DEVE** ser gerenciada através do módulo `chave-api.ts`. Este módulo utiliza uma técnica de ofuscação, montando a chave a partir de múltiplas partes para dificultar a sua extração por scrapers automatizados.

  ```typescript
  // Exemplo em chave-api.ts
  const parte1 = "AIzaSyDOrKnTK6Ls";
  const parte2 = "0mjmOeRJD-_N6O";
  const parte3 = "Raa_TGjUk";

  export const obterChaveApi = (): string => {
      return parte1 + parte2 + parte3;
  };
  ```

- **IMPORTANTE**: Este mecanismo é uma **OFUSCAÇÃO**, não uma forma de segurança. A chave ainda é exposta no lado do cliente. A segurança real e efetiva **DEVE** ser implementada no [Console do Google Cloud](https://console.cloud.google.com/) através de:
  1.  **Restrições de HTTP Referrer**: Limitar o uso da chave apenas ao domínio onde a aplicação está hospedada.
  2.  **Restrições de API**: Garantir que a chave só possa ser usada para as APIs específicas necessárias para o projeto (ex: Places API, Maps JavaScript API).