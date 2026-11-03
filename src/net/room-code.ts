/** Alfabeto do código de sala: sem I, L e O, para não confundir com 1 e 0. */
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 5;

const VALID_CODE = new RegExp(`^[${ROOM_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Gera um código com `rand` (valores em [0, 1)). */
export function generateRoomCode(rand: () => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_ALPHABET[Math.floor(rand() * ROOM_ALPHABET.length)];
  }
  return code;
}

/** Maiúsculas, sem espaços e hífens; null se não for um código válido. */
export function normalizeRoomCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  return VALID_CODE.test(code) ? code : null;
}

/** Id da sala no PeerJS. */
export function peerIdFor(code: string): string {
  return `alcapao-${code}`;
}
