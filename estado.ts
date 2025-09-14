import { GoogleGenAI } from "@google/genai";
import { Cliente, NotaDeVoz } from "./tipos";

// --- Estado Inicial ---
export let clientes: Cliente[] = [];
export const setClientes = (newClientes: Cliente[]) => { clientes = newClientes; };

// --- Variáveis Globais e de Estado ---
export let mapa: any;
export const setMapa = (newMapa: any) => { mapa = newMapa; };

export let marcadores: any; // Será inicializado como L.layerGroup()
export const setMarcadores = (newMarkadores: any) => { marcadores = newMarkadores; };

export let graficoAtual: any = null;
export const setGraficoAtual = (newGrafico: any) => { graficoAtual = newGrafico; };

export let notasDeVoz: NotaDeVoz[] = [];
export let gravadorDeAudio: any = null;
export const setGravadorDeAudio = (newGravador: any) => { gravadorDeAudio = newGravador; };

export let pedacosDeAudio: Blob[] = [];
export const setPedacosDeAudio = (newPedacos: Blob[]) => { pedacosDeAudio = newPedacos; };

export let localizacaoAtualDoUsuario: any = null;
export const setLocalizacaoAtualDoUsuario = (newLocalizacao: any) => { localizacaoAtualDoUsuario = newLocalizacao; };

export let pinoDeSugestao: any = null;
export const setPinoDeSugestao = (newPino: any) => { pinoDeSugestao = newPino; };

export let pinoDoPainel: any = null;
export const setPinoDoPainel = (newPino: any) => { pinoDoPainel = newPino; };

export let modoOQueTemAqui = false;
export const setModoOQueTemAqui = (newModo: boolean) => { modoOQueTemAqui = newModo; };

export let ai: GoogleGenAI | null = null;
export const setAi = (newAi: GoogleGenAI | null) => { ai = newAi; };

export let mesesUnicosSlider: string[] = [];
export const setMesesUnicosSlider = (newMeses: string[]) => { mesesUnicosSlider = newMeses; };

export let initialZoomSet = false;
export const setInitialZoomSet = (newVal: boolean) => { initialZoomSet = newVal; };

export let dataAtual: Date = new Date();
export const setDataAtual = (newDate: Date) => { dataAtual = newDate; };