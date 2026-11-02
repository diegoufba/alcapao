import type { PlayerId } from '../core/types';
import type { DeviceId } from './keyboard';

const SLOTS: PlayerId[] = ['P1', 'P2', 'P3', 'P4'];

/** Mapeia dispositivos de entrada para jogadores P1..P4. */
export class DeviceSlots {
  private devices = new Map<PlayerId, { device: DeviceId; connected: boolean }>();

  /** Mesmo dispositivo devolve o mesmo slot; senão o menor livre, ou null se lotado. */
  join(d: DeviceId): PlayerId | null {
    const existing = this.slotOf(d);
    if (existing) return existing;
    const free = SLOTS.find((p) => !this.devices.has(p));
    if (!free) return null;
    this.devices.set(free, { device: d, connected: true });
    return free;
  }

  slotOf(d: DeviceId): PlayerId | null {
    for (const [p, v] of this.devices) if (v.device === d) return p;
    return null;
  }

  deviceOf(p: PlayerId): DeviceId | null {
    return this.devices.get(p)?.device ?? null;
  }

  players(): PlayerId[] {
    return SLOTS.filter((p) => this.devices.has(p));
  }

  leave(p: PlayerId): void {
    this.devices.delete(p);
  }

  /** Marca o dispositivo (des)conectado sem liberar o slot. */
  setConnected(d: DeviceId, c: boolean): void {
    const p = this.slotOf(d);
    if (p) this.devices.get(p)!.connected = c;
  }

  isConnected(p: PlayerId): boolean {
    return this.devices.get(p)?.connected ?? false;
  }
}
