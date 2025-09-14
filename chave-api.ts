// chave-api.ts

/**
 * Este módulo tem a responsabilidade de ofuscar e fornecer a chave da API do Google.
 * 
 * IMPORTANTE: Isto é uma técnica de OFUSCAÇÃO, não de segurança. 
 * A chave ainda pode ser descoberta no navegador. A segurança real deve vir das
 * restrições configuradas no painel do Google Cloud (restrições de HTTP e de API).
 */

const parte1 = "AIzaSyDOrKnTK6Ls";
const parte2 = "0mjmOeRJD-_N6O";
const parte3 = "Raa_TGjUk";

/**
 * Monta e retorna a chave da API do Google completa.
 * @returns A chave da API.
 */
export const obterChaveApi = (): string => {
    return parte1 + parte2 + parte3;
};
