// @ts-nocheck
/**
 * Voice AI — tipos compartilhados entre Twilio e web simulator.
 */

export type TranscriptTurn = {
  role: 'agent' | 'user' | 'system';
  text: string;
  ts: string;
};

export type ReservationDraft = {
  partySize?: number;
  date?: string;   // YYYY-MM-DD
  time?: string;   // HH:MM
  name?: string;
  phone?: string;
  notes?: string;
};

export type VoiceIntent =
  | 'RESERVATION'     // quer fazer reserva
  | 'INFO'            // quer informação
  | 'TRANSFER'        // quer humano
  | 'CANCEL_RESERVATION'
  | 'HANGUP'
  | 'UNCLEAR';

export type AgentDecision = {
  intent: VoiceIntent;
  reply: string;              // o que o agente responderá
  draft?: ReservationDraft;   // estado atual da reserva (merged)
  ready?: boolean;            // se true, draft está completo e pode ser criada a reserva
  endCall?: boolean;          // se true, o agente quer finalizar a ligação
};
