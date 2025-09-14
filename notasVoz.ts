import { NotaDeVoz } from "./tipos";
import * as estado from "./estado";
import { formatarDuracao } from "./utilitarios";
import { transcreverAudioComGemini } from "./ia";

declare var L: any;

/**
 * Cria e retorna um ícone SVG para o marcador de nota de voz.
 */
const criarIconeNotaDeVoz = () => {
    return L.divIcon({
        html: `
            <div class="container-icone-nota-voz">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="22"></line>
                </svg>
            </div>
        `,
        className: 'marcador-nota-voz',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
};

/**
 * Atualiza a interface do player de áudio no popup.
 */
const atualizarUIPlayer = (notaId: string, audio: HTMLAudioElement) => {
    const popupContent = document.getElementById(`popup-content-${notaId}`);
    if (!popupContent) return;

    const btnControle = popupContent.querySelector('.btn-controle-player') as HTMLButtonElement;
    const anelProgresso = popupContent.querySelector('.anel-progresso__circulo') as SVGCircleElement;
    const displayTempo = popupContent.querySelector('.display-tempo') as HTMLElement;
    
    if (!btnControle || !anelProgresso || !displayTempo) return;

    const raio = anelProgresso.r.baseVal.value;
    const circunferencia = 2 * Math.PI * raio;
    anelProgresso.style.strokeDasharray = `${circunferencia} ${circunferencia}`;

    const progresso = (audio.currentTime / audio.duration) * circunferencia;
    anelProgresso.style.strokeDashoffset = `${circunferencia - progresso}`;
    
    displayTempo.textContent = formatarDuracao(audio.currentTime);
    btnControle.dataset.state = audio.paused ? "paused" : "playing";
};

/**
 * Cria o conteúdo HTML para o popup de uma nota de voz.
 */
const criarConteudoPopupNotaDeVoz = (nota: NotaDeVoz): string => {
    let textoExibicao: string;
    let classeCss = "texto-transcricao";

    if (nota.estaGravando) {
        textoExibicao = "<em>Gravando...</em>";
        classeCss += " processando";
    } else if (nota.textoTranscrito) {
        textoExibicao = nota.textoTranscrito;
        if (nota.textoTranscrito.startsWith("<em>")) {
            classeCss += " processando";
        }
    } else {
        textoExibicao = "<em>Processando transcrição...</em>";
        classeCss += " processando";
    }

    const playerControlsHtml = nota.urlAudio ? `
        <div class="container-anel-progresso">
            <svg class="anel-progresso" viewBox="0 0 36 36">
                <circle class="anel-progresso__bg" cx="18" cy="18" r="15.9155" fill="transparent" stroke-width="3"></circle>
                <circle class="anel-progresso__circulo" cx="18" cy="18" r="15.9155" fill="transparent" stroke-width="3" stroke-dasharray="100 0" stroke-dashoffset="100"></circle>
            </svg>
            <button class="btn-controle-player" data-state="paused" aria-label="Reproduzir/Pausar">
                <svg class="icone-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
                <svg class="icone-pause" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>
            </button>
        </div>
        <div class="display-tempo">00:00</div>
    ` : `
        <div class="container-icone-nota-voz" style="background-color: var(--cor-secundaria); margin-bottom: 5px; box-shadow: none;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="22"></line>
            </svg>
        </div>
    `;

    const deleteButtonHtml = nota.urlAudio ? `<button class="btn-excluir-audio" data-nota-id="${nota.id}">Excluir Áudio</button>` : '';

    const playerWrapperHtml = `
        <div class="player-audio-customizado">
            ${playerControlsHtml}
            ${deleteButtonHtml}
        </div>
    `;

    return `
        <div class="popup-nota-voz" id="popup-content-${nota.id}">
            ${playerWrapperHtml}
            <div class="wrapper-transcricao">
                <div class="${classeCss}">${textoExibicao}</div>
                <button class="btn-excluir-nota" data-nota-id="${nota.id}">Excluir Nota</button>
            </div>
        </div>
    `;
};

/**
 * Exclui uma nota de voz do mapa e da lista.
 */
const excluirNotaDeVoz = (notaId: string) => {
    const indice = estado.notasDeVoz.findIndex(n => n.id === notaId);
    if (indice > -1) {
        const nota = estado.notasDeVoz[indice];
        if (nota.marcador) {
            estado.mapa.removeLayer(nota.marcador);
        }
        estado.notasDeVoz.splice(indice, 1);
    }
};

/**
 * Exclui apenas o áudio de uma nota de voz.
 */
const excluirAudioDaNota = (notaId: string) => {
    const nota = estado.notasDeVoz.find(n => n.id === notaId);
    if (nota) {
        if (nota.urlAudio) URL.revokeObjectURL(nota.urlAudio);
        nota.urlAudio = undefined;
        
        if (nota.marcador && nota.marcador.getPopup()) {
            const novoConteudo = criarConteudoPopupNotaDeVoz(nota);
            nota.marcador.getPopup().setContent(novoConteudo);
            setupListenersPopupNota(nota);
        }
    }
};

/**
 * Configura os listeners para um popup de nota de voz existente.
 */
const setupListenersPopupNota = (nota: NotaDeVoz) => {
    const popupContent = document.getElementById(`popup-content-${nota.id}`);
    if (!popupContent) return;

    const btnExcluir = popupContent.querySelector('.btn-excluir-nota') as HTMLButtonElement;
    btnExcluir.onclick = () => excluirNotaDeVoz(nota.id);

    const btnExcluirAudio = popupContent.querySelector('.btn-excluir-audio') as HTMLButtonElement;
    if (btnExcluirAudio) {
      btnExcluirAudio.onclick = () => excluirAudioDaNota(nota.id);
    }

    if (nota.urlAudio) {
        const btnControle = popupContent.querySelector('.btn-controle-player') as HTMLButtonElement;
        const audio = new Audio(nota.urlAudio);

        btnControle.onclick = () => {
            if (audio.paused) audio.play();
            else audio.pause();
        };
        
        audio.ontimeupdate = () => atualizarUIPlayer(nota.id, audio);
        audio.onended = () => {
            audio.currentTime = 0;
            atualizarUIPlayer(nota.id, audio);
        };
        audio.onloadedmetadata = () => atualizarUIPlayer(nota.id, audio);
    }
};

/**
 * Inicia a gravação de áudio, obtendo primeiro a localização do usuário.
 */
const iniciarGravacao = async () => {
    const btnGravar = document.getElementById('btn-gravar') as HTMLButtonElement;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Gravação de áudio não é suportada neste navegador.");
        return;
    }
    
    btnGravar.classList.remove('idle');
    btnGravar.classList.add('inicializando');
    btnGravar.title = 'Obtendo sua localização...';

    let localizacaoParaNota: any;
    try {
        localizacaoParaNota = await new Promise((resolve, reject) => {
            estado.mapa.locate();
            estado.mapa.once('locationfound', (e: any) => resolve(e.latlng));
            estado.mapa.once('locationerror', (err: any) => reject(new Error(`Erro de localização: ${err.message}`)));
            setTimeout(() => reject(new Error("Tempo para obter localização esgotado.")), 8000);
        });
        estado.mapa.setView(localizacaoParaNota, 16);
    } catch (error) {
        console.warn((error as Error).message, "Usando o centro do mapa como alternativa.");
        localizacaoParaNota = estado.localizacaoAtualDoUsuario ? estado.localizacaoAtualDoUsuario.getLatLng() : estado.mapa.getCenter();
    }
    
    btnGravar.title = 'Aguardando permissão do microfone...';
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const novaNota: NotaDeVoz = {
            id: `nota_${Date.now()}`,
            marcador: L.marker(localizacaoParaNota, { icon: criarIconeNotaDeVoz() }),
            estaGravando: true
        };
        novaNota.marcador.getElement()?.classList.add('marcador-gravando');
        
        novaNota.marcador.on('popupopen', () => {
            setupListenersPopupNota(novaNota);
        });
        novaNota.marcador.addTo(estado.mapa);

        const popup = L.popup({ minWidth: 280, closeButton: true })
            .setContent(criarConteudoPopupNotaDeVoz(novaNota));
        novaNota.marcador.bindPopup(popup).openPopup();
        estado.notasDeVoz.push(novaNota);
        
        // FIX: Cannot assign to 'gravadorDeAudio' because it is a read-only property. Using a setter function instead.
        estado.setGravadorDeAudio(new MediaRecorder(stream, { mimeType: 'audio/webm' }));
        // FIX: Cannot assign to 'pedacosDeAudio' because it is a read-only property. Using a setter function instead.
        estado.setPedacosDeAudio([]);
        estado.gravadorDeAudio.ondataavailable = (event: any) => estado.pedacosDeAudio.push(event.data);
        
        estado.gravadorDeAudio.onstop = async () => {
            stream.getTracks().forEach(track => track.stop());
            const blobAudio = new Blob(estado.pedacosDeAudio, { type: 'audio/webm' });
            novaNota.urlAudio = URL.createObjectURL(blobAudio);
            novaNota.estaGravando = false;
            
            novaNota.marcador.getElement()?.classList.remove('marcador-gravando');
            
            let popupContent = criarConteudoPopupNotaDeVoz(novaNota);
            novaNota.marcador.getPopup().setContent(popupContent);
            setupListenersPopupNota(novaNota);

            try {
                const transcricao = await transcreverAudioComGemini(blobAudio);
                novaNota.textoTranscrito = transcricao || "<em>Áudio vazio ou sem fala detectada.</em>";
            } catch (error) {
                console.error("Erro na transcrição:", error);
                novaNota.textoTranscrito = "<em>Erro ao transcrever. Tente novamente.</em>";
            } finally {
                popupContent = criarConteudoPopupNotaDeVoz(novaNota);
                if (novaNota.marcador.getPopup() && novaNota.marcador.isPopupOpen()) {
                    novaNota.marcador.getPopup().setContent(popupContent);
                    setupListenersPopupNota(novaNota); 
                }
            }
        };
        
        estado.gravadorDeAudio.start();
        btnGravar.classList.remove('inicializando');
        btnGravar.classList.add('gravando');
        btnGravar.setAttribute('aria-label', 'Parar gravação');
        btnGravar.title = 'Parar gravação';

    } catch (err) {
        console.error("Erro ao iniciar gravação:", err);
        alert("Não foi possível acessar o microfone. Verifique as permissões.");
        btnGravar.classList.remove('inicializando');
        btnGravar.classList.add('idle');
        btnGravar.title = 'Gravar nota de voz';
    }
};

/**
 * Para a gravação de áudio.
 */
const pararGravacao = () => {
    if (estado.gravadorDeAudio && estado.gravadorDeAudio.state === "recording") {
        estado.gravadorDeAudio.stop();
        const btnGravar = document.getElementById('btn-gravar') as HTMLButtonElement;
        btnGravar.classList.remove('gravando');
        btnGravar.classList.add('idle');
        btnGravar.setAttribute('aria-label', 'Gravar nota de voz');
        btnGravar.title = 'Gravar nota de voz';
    }
};

/**
 * Configura o listener para o botão principal de gravação.
 */
export const setupBotaoGravarListener = () => {
    const btnGravar = document.getElementById('btn-gravar');
    btnGravar?.addEventListener('click', () => {
        if (estado.gravadorDeAudio && estado.gravadorDeAudio.state === "recording") {
            pararGravacao();
        } else {
            iniciarGravacao();
        }
    });
};