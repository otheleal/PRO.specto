/**
 * Formata um número como moeda brasileira (BRL).
 */
export const formatarMoeda = (valor: number): string => {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

/**
 * Tenta converter uma string de data de vários formatos para um objeto Date.
 * Suporta 'YYYY-MM-DD ...', 'dd/mm/aa', 'dd/mm/yyyy'.
 */
export const parseData = (str: string): Date | null => {
    if (!str || typeof str !== 'string') return null;

    // Tenta formato YYYY-MM-DD (ignora o resto da string)
    let parts = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (parts) {
        const ano = parseInt(parts[1], 10);
        const mes = parseInt(parts[2], 10) - 1;
        const dia = parseInt(parts[3], 10);
        const data = new Date(ano, mes, dia);
        if (!isNaN(data.getTime())) return data;
    }

    // Tenta formato dd/mm/aa ou dd/mm/yyyy
    parts = str.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (parts) {
        const dia = parseInt(parts[1], 10);
        const mes = parseInt(parts[2], 10) - 1;
        let ano = parseInt(parts[3], 10);
        if (ano < 100) {
            ano += (ano > 50 ? 1900 : 2000);
        }
        const data = new Date(ano, mes, dia);
        if (data.getFullYear() === ano && data.getMonth() === mes && data.getDate() === dia) {
            return data;
        }
    }
    
    return null;
};

/**
 * Formata uma string de data para o formato dd/mm/aa.
 */
export const formatarDataPopup = (dateString: string): string => {
    const data = parseData(dateString);
    if (!data) return 'Indisp.';
    const dia = data.getDate().toString().padStart(2, '0');
    const mes = (data.getMonth() + 1).toString().padStart(2, '0');
    const ano = data.getFullYear().toString().slice(-2);
    return `${dia}/${mes}/${ano}`;
};

/**
 * Retorna uma cor com base na diferença de dias entre a data da venda e hoje.
 */
export const getCorPorData = (dateString: string): string => {
    const dataVenda = parseData(dateString);
    if (!dataVenda) return '#808080'; // Cinza para datas inválidas/ausentes

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    dataVenda.setHours(0, 0, 0, 0);

    const diffTime = hoje.getTime() - dataVenda.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 30) return '#28a745'; // verde
    if (diffDays <= 90) return '#17a2b8'; // azul claro
    if (diffDays <= 180) return '#ffc107'; // amarelo
    if (diffDays <= 365) return '#fd7e14'; // laranja
    return '#dc3545'; // vermelho
};

/**
 * Calcula o raio do círculo com base no valor da venda, usando uma escala de duas camadas
 * para garantir que vendas anuais menores que R$10.000 resultem em círculos visivelmente menores.
 */
export const getRaioPorValor = (valor: number): number => {
    if (valor <= 0) return 5; // Raio base mínimo para clientes sem vendas ou com vendas zeradas.

    if (valor < 10000) {
        // Para vendas abaixo de R$10.000, usamos uma escala linear suave.
        return 6 + (valor / 10000) * 6;
    } else {
        // Para vendas de R$10.000 ou mais, o raio começa maior e cresce logaritmicamente.
        return 12 + Math.log10(valor / 1000) * 4;
    }
};

/**
 * Mostra um banner de erro no topo da página.
 * @param mensagem A mensagem a ser exibida.
 * @param persistente Se true, o banner não some sozinho e tem um botão de fechar.
 */
export const mostrarBannerErro = (mensagem: string, persistente: boolean = false) => {
    const banner = document.getElementById('banner-erro-api');
    if (banner) {
        const closeButtonHtml = persistente ? `<button class="btn-fechar-banner" onclick="this.parentElement.style.display='none'">&times;</button>` : '';
        banner.innerHTML = `<span class="conteudo-banner"><strong>Erro:</strong> ${mensagem}</span>${closeButtonHtml}`;
        banner.style.display = 'flex';
        
        if (!persistente) {
            setTimeout(() => { banner.style.display = 'none'; }, 10000);
        }
    }
};

/**
 * Mostra um overlay de erro sobre o mapa para falhas críticas de API.
 * @param titulo O título do erro.
 * @param mensagem A mensagem detalhada do erro.
 */
export const mostrarOverlayErroMapa = (titulo: string, mensagem: string) => {
    const overlay = document.getElementById('map-overlay-error');
    if (overlay) {
        overlay.innerHTML = `
            <div class="conteudo-overlay">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <h2>${titulo}</h2>
                <p>${mensagem}</p>
                <button id="btn-fechar-overlay-erro" class="map-btn" style="margin-top: 20px; background-color: var(--cor-secundaria); color: white;">Dispensar</button>
            </div>
        `;
        overlay.style.display = 'flex';

        // Adiciona um listener para o novo botão para fechar o overlay.
        // O listener é adicionado aqui para manter o componente autocontido.
        document.getElementById('btn-fechar-overlay-erro')?.addEventListener('click', () => {
            if (overlay) overlay.style.display = 'none';
        }, { once: true }); // Garante que o listener seja removido após o primeiro clique.
    }
};


/**
 * Converte um Blob para uma string base64.
 */
export const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

/**
 * Formata a duração em segundos para o formato MM:SS.
 */
export const formatarDuracao = (segundos: number): string => {
    const min = Math.floor(segundos / 60);
    const seg = Math.floor(segundos % 60);
    return `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
};