import { useEntityCreate, useEntityUpdate } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import type { Subnet, IPAddress } from '../../../mock/data/types';

// ── IPv4 CIDR helpers ───────────────────────────────────────────────
export const ipToInt = (ip: string): number =>
  ip.split('.').reduce((a, o) => (a * 256 + (parseInt(o, 10) || 0)) >>> 0, 0);
export const intToIp = (n: number): string =>
  [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

export function cidrRange(cidr: string): { network: number; first: number; last: number; mask: number } | null {
  const [base, maskStr] = cidr.split('/');
  const mask = parseInt(maskStr, 10);
  if (!base || Number.isNaN(mask)) return null;
  const baseInt = ipToInt(base);
  const hostBits = 32 - mask;
  const network = hostBits >= 32 ? 0 : (baseInt & (~((2 ** hostBits) - 1) >>> 0)) >>> 0;
  const size = 2 ** hostBits;
  const broadcast = (network + size - 1) >>> 0;
  // usable host range (skip network + broadcast for /<=30)
  const first = hostBits <= 1 ? network : (network + 1) >>> 0;
  const last = hostBits <= 1 ? broadcast : (broadcast - 1) >>> 0;
  return { network, first, last, mask };
}

/** First address in the prefix not already present in `existing` (and not the gateway). */
export function nextAvailableAddress(subnet: Subnet, existing: IPAddress[]): string | null {
  const r = cidrRange(subnet.cidr);
  if (!r) return null;
  const used = new Set(existing.map((i) => ipToInt(i.address)));
  if (subnet.gatewayIp) used.add(ipToInt(subnet.gatewayIp));
  // cap the scan so a huge prefix can't lock the UI
  const limit = Math.min(r.last, r.first + 65535);
  for (let n = r.first; n <= limit; n++) {
    if (!used.has(n)) return intToIp(n);
  }
  return null;
}

/** Allocate the next free IP in a prefix: inherits role, marks Allocated, bumps utilization. */
export function useAllocateIp() {
  const createIp = useEntityCreate('ipAddresses');
  const updateSubnet = useEntityUpdate('subnets');
  const audit = useRecordAudit();

  return (subnet: Subnet, existing: IPAddress[], opts?: { dnsName?: string; description?: string }) => {
    const addr = nextAvailableAddress(subnet, existing);
    if (!addr) return Promise.reject(new Error('No free addresses in this prefix'));
    const id = `IP-NEW-${Date.now().toString().slice(-5)}`;
    const now = new Date().toISOString();
    return new Promise<IPAddress>((resolve, reject) => {
      createIp.mutate(
        {
          id, ipId: id, subnetId: subnet.id, address: addr, status: 'Allocated',
          roleId: subnet.roleId, dnsName: opts?.dnsName, description: opts?.description,
          allocatedAt: now, isDeleted: false, createdAt: now, updatedAt: now, createdBy: 'You', createdById: 'me',
        },
        {
          onSuccess: (rec: unknown) => {
            const used = (subnet.usedHosts ?? 0) + 1;
            const util = subnet.totalHosts ? Math.round((used / subnet.totalHosts) * 100) : subnet.utilizationPct;
            updateSubnet.mutate({ id: subnet.id, data: { usedHosts: used, utilizationPct: util, updatedAt: now } });
            audit('IP Address', id, 'created', `Allocated ${addr} from ${subnet.cidr}`);
            resolve(rec as IPAddress);
          },
          onError: reject,
        },
      );
    });
  };
}
