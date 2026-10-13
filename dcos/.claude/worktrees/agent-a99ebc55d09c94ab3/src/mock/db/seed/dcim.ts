/**
 * DCOS seed — DCIM.
 *
 * Reference data, a device type with full component templates for every model in the
 * asset catalogue, the network fabric per site, the asset→device mirror with role,
 * platform, face and airflow filled on every device, ports generated for every device
 * from its type, cabling and rack PDUs in each site's showcase racks, power panels and
 * feeds, reservations, and the post-pass that makes every rack's used U, weight and
 * power agree with what is actually installed in it.
 */
import type * as T from '../../data/types';
import * as E from '../../data/enums';
import type { Seed, AssetSeed } from './ctx';

interface Tpl {
  kind: E.ComponentKind; name: string; label?: string; description?: string;
  iface?: E.InterfaceType; mgmtOnly?: boolean; poe?: E.PoeType; poeMode?: E.PoeMode; rf?: E.RfRole; speed?: number; duplex?: E.IfDuplex; mtu?: number;
  consoleType?: E.ConsoleType; ppType?: E.PowerPortType; maxDrawW?: number; allocDrawW?: number;
  outletType?: E.PowerOutletType; parentPowerPort?: string; feedLeg?: E.FeedLeg; position?: E.ModuleBayPosition | string;
  rearPortName?: string; rearPortPosition?: number; positions?: number;
}
interface DtSpec { mfr: string; model: string; role: E.DcimDeviceRole; platform: E.Platform; u: number; full?: boolean; weight: number; weightUnit: E.WeightUnit; airflow: E.Airflow; desc: string; subdevice?: E.SubdeviceRole; templates: Tpl[]; inventory?: Array<{ role: string; name: string; mfr: string; part: string }> }

const IF_SPEED: Record<string, number> = { '1000BASE-T': 1000, '10GBASE-T': 10000, '10GBASE-X SFP+': 10000, '25GBASE-X SFP28': 25000, '40GBASE-X QSFP+': 40000, '100GBASE-X QSFP28': 100000, '400GBASE-X QSFP-DD': 400000, Virtual: 0 };

const DT_SPECS: DtSpec[] = [
  { mfr: 'Dell', model: 'PowerEdge R760', role: 'Server', platform: 'Linux', u: 2, full: true, weight: 32, weightUnit: 'kg', airflow: 'front-to-rear', desc: '2U dual-socket server', templates: [
    { kind: 'interface', name: 'eno[1-4]', label: 'LOM', iface: '25GBASE-X SFP28', poe: 'None', rf: 'None' },
    { kind: 'interface', name: 'idrac', label: 'iDRAC', iface: '1000BASE-T', mgmtOnly: true },
    { kind: 'console', name: 'iDRAC console', label: 'Out-of-band', consoleType: 'RJ-45' },
    { kind: 'power-port', name: 'PSU[1-2]', label: 'Power supply', ppType: 'IEC C14', maxDrawW: 1400, allocDrawW: 900 }],
    inventory: [{ role: 'PSU', name: 'PSU 1', mfr: 'Dell', part: 'PWR-1400' }, { role: 'PSU', name: 'PSU 2', mfr: 'Dell', part: 'PWR-1400' }, { role: 'CPU', name: 'CPU 1', mfr: 'Intel', part: 'Xeon 6430' }, { role: 'DIMM', name: 'DIMM A1', mfr: 'Samsung', part: 'M393A4K40' }] },
  { mfr: 'Dell', model: 'PowerEdge XE9680', role: 'Server', platform: 'Linux', u: 6, full: true, weight: 95, weightUnit: 'kg', airflow: 'front-to-rear', desc: '6U 8-GPU training node', templates: [
    { kind: 'interface', name: 'enp[1-8]', label: 'Fabric NIC', iface: '400GBASE-X QSFP-DD', mtu: 9216 },
    { kind: 'interface', name: 'bmc', label: 'BMC', iface: '1000BASE-T', mgmtOnly: true },
    { kind: 'console', name: 'BMC console', consoleType: 'RJ-45' },
    { kind: 'power-port', name: 'PSU[1-4]', label: 'Power supply', ppType: 'IEC C20', maxDrawW: 2800, allocDrawW: 2400 }],
    inventory: [{ role: 'PSU', name: 'PSU 1', mfr: 'Dell', part: 'PWR-2800' }, { role: 'PSU', name: 'PSU 2', mfr: 'Dell', part: 'PWR-2800' }] },
  { mfr: 'HPE', model: 'ProLiant DL380 Gen11', role: 'Server', platform: 'Linux', u: 2, full: true, weight: 30, weightUnit: 'kg', airflow: 'front-to-rear', desc: '2U general-purpose server', templates: [
    { kind: 'interface', name: 'eno[1-4]', label: 'LOM', iface: '10GBASE-T', duplex: 'full' },
    { kind: 'interface', name: 'ilo', label: 'iLO', iface: '1000BASE-T', mgmtOnly: true },
    { kind: 'console', name: 'iLO console', consoleType: 'RJ-45' },
    { kind: 'power-port', name: 'PSU[1-2]', ppType: 'IEC C14', maxDrawW: 1000, allocDrawW: 700 }],
    inventory: [{ role: 'PSU', name: 'PSU 1', mfr: 'HPE', part: 'P03178' }, { role: 'PSU', name: 'PSU 2', mfr: 'HPE', part: 'P03178' }] },
  { mfr: 'Supermicro', model: 'SYS-821GE GPU SuperServer', role: 'Server', platform: 'Linux', u: 8, full: true, weight: 243, weightUnit: 'lb', airflow: 'front-to-rear', desc: '8U 8-GPU HGX node', templates: [
    { kind: 'interface', name: 'eth[1-8]', label: 'Fabric NIC', iface: '400GBASE-X QSFP-DD', mtu: 9216 },
    { kind: 'interface', name: 'ipmi', label: 'IPMI', iface: '1000BASE-T', mgmtOnly: true },
    { kind: 'console', name: 'IPMI console', consoleType: 'RJ-45' },
    { kind: 'power-port', name: 'PSU[1-4]', ppType: 'IEC C20', maxDrawW: 3000, allocDrawW: 2700 }],
    inventory: [{ role: 'PSU', name: 'PSU 1', mfr: 'Supermicro', part: 'PWS-3K' }] },
  { mfr: 'NVIDIA', model: 'DGX H100', role: 'Server', platform: 'Linux', u: 8, full: true, weight: 130, weightUnit: 'kg', airflow: 'front-to-rear', desc: '8U DGX training system', templates: [
    { kind: 'interface', name: 'enp[1-8]', label: 'InfiniBand / fabric', iface: '400GBASE-X QSFP-DD', mtu: 9216 },
    { kind: 'interface', name: 'bmc', label: 'BMC', iface: '1000BASE-T', mgmtOnly: true },
    { kind: 'console', name: 'BMC console', consoleType: 'RJ-45' },
    { kind: 'power-port', name: 'PSU[1-6]', ppType: 'IEC C20', maxDrawW: 1800, allocDrawW: 1700 }],
    inventory: [{ role: 'PSU', name: 'PSU 1', mfr: 'NVIDIA', part: 'PSU-3300' }] },
  { mfr: 'Pure Storage', model: 'FlashArray //X70', role: 'Storage', platform: 'Linux', u: 3, full: true, weight: 45, weightUnit: 'kg', airflow: 'front-to-rear', desc: '3U all-flash array', templates: [
    { kind: 'interface', name: 'ct0.eth[0-3]', label: 'Data', iface: '25GBASE-X SFP28', mtu: 9216 },
    { kind: 'interface', name: 'ct0.mgmt', label: 'Management', iface: '1000BASE-T', mgmtOnly: true },
    { kind: 'console', name: 'Console', consoleType: 'Serial (DB9)' },
    { kind: 'power-port', name: 'PSU[1-2]', ppType: 'IEC C14', maxDrawW: 1200, allocDrawW: 1000 }],
    inventory: [{ role: 'Controller', name: 'Controller CT0', mfr: 'Pure Storage', part: 'CT0-X70' }, { role: 'Controller', name: 'Controller CT1', mfr: 'Pure Storage', part: 'CT1-X70' }] },
  { mfr: 'NetApp', model: 'AFF A400', role: 'Storage', platform: 'Linux', u: 4, full: true, weight: 50, weightUnit: 'kg', airflow: 'front-to-rear', desc: '4U all-flash FAS', templates: [
    { kind: 'interface', name: 'e0[1-4]', label: 'Cluster / data', iface: '40GBASE-X QSFP+', mtu: 9216 },
    { kind: 'interface', name: 'e0M', label: 'Management', iface: '1000BASE-T', mgmtOnly: true },
    { kind: 'console', name: 'Console', consoleType: 'Serial (DB9)' },
    { kind: 'power-port', name: 'PSU[1-2]', ppType: 'IEC C14', maxDrawW: 1400, allocDrawW: 1100 }],
    inventory: [{ role: 'Controller', name: 'Controller A', mfr: 'NetApp', part: 'A400-CTRL' }, { role: 'Controller', name: 'Controller B', mfr: 'NetApp', part: 'A400-CTRL' }] },
  { mfr: 'Cisco', model: 'Nexus 9336C-FX2', role: 'Spine', platform: 'NX-OS', u: 1, weight: 10, weightUnit: 'kg', airflow: 'front-to-rear', desc: '36×100G spine / leaf switch', templates: [
    { kind: 'interface', name: 'Ethernet1/[1-36]', label: 'Fabric', iface: '100GBASE-X QSFP28' },
    { kind: 'interface', name: 'mgmt0', label: 'Management', iface: '1000BASE-T', mgmtOnly: true },
    { kind: 'console', name: 'Console', consoleType: 'RJ-45' },
    { kind: 'power-port', name: 'PSU[1-2]', ppType: 'AC', maxDrawW: 650, allocDrawW: 400 }],
    inventory: [{ role: 'PSU', name: 'PSU 1', mfr: 'Cisco', part: 'NXA-PAC-650W' }, { role: 'Fan', name: 'Fan tray 1', mfr: 'Cisco', part: 'NXA-FAN-35' }, { role: 'Optic', name: 'Ethernet1/1 QSFP28', mfr: 'Cisco', part: 'QSFP-100G-SR4' }] },
  { mfr: 'Arista', model: '7050X3-48YC8', role: 'Leaf/ToR', platform: 'EOS', u: 1, weight: 11, weightUnit: 'kg', airflow: 'rear-to-front', desc: '48×25G + 8×100G top-of-rack switch', templates: [
    { kind: 'interface', name: 'Ethernet[1-48]', label: 'Server-facing', iface: '25GBASE-X SFP28', poe: 'None', rf: 'None' },
    { kind: 'interface', name: 'Ethernet[49-56]', label: 'Uplink', iface: '100GBASE-X QSFP28' },
    { kind: 'interface', name: 'Management1', label: 'Management', iface: '1000BASE-T', mgmtOnly: true },
    { kind: 'console', name: 'Console', consoleType: 'RJ-45' },
    { kind: 'power-port', name: 'PSU[1-2]', ppType: 'AC', maxDrawW: 500, allocDrawW: 350 }],
    inventory: [{ role: 'PSU', name: 'PSU 1', mfr: 'Arista', part: 'PWR-500AC' }, { role: 'Fan', name: 'Fan 1', mfr: 'Arista', part: 'FAN-7000' }] },
  { mfr: 'Juniper', model: 'QFX5120-48Y', role: 'Leaf/ToR', platform: 'Junos', u: 1, weight: 9, weightUnit: 'kg', airflow: 'side-to-rear', desc: '48×25G + 8×100G top-of-rack switch', templates: [
    { kind: 'interface', name: 'xe-0/0/[0-47]', label: 'Server-facing', iface: '25GBASE-X SFP28', poe: 'None', rf: 'None' },
    { kind: 'interface', name: 'et-0/0/[48-55]', label: 'Uplink', iface: '100GBASE-X QSFP28' },
    { kind: 'interface', name: 'em0', label: 'Management', iface: '1000BASE-T', mgmtOnly: true },
    { kind: 'console', name: 'Console', consoleType: 'RJ-45' },
    { kind: 'power-port', name: 'PEM[0-1]', label: 'Power entry', ppType: 'AC', maxDrawW: 480, allocDrawW: 330 }],
    inventory: [{ role: 'Fan', name: 'Fan tray 1', mfr: 'Juniper', part: 'FAN-1' }, { role: 'Optic', name: 'et-0/0/48 QSFP28', mfr: 'Finisar', part: 'FTLC9551' }] },
  { mfr: 'Cisco', model: 'Catalyst 9300-48P', role: 'Leaf/ToR', platform: 'Other', u: 1, weight: 8, weightUnit: 'kg', airflow: 'left-to-right', desc: '48-port PoE+ access switch', templates: [
    { kind: 'interface', name: 'GigabitEthernet1/0/[1-24]', label: 'PoE+ access', iface: '1000BASE-T', poe: 'IEEE 802.3at', poeMode: 'pse' },
    { kind: 'interface', name: 'GigabitEthernet1/0/[25-48]', label: 'PoE access', iface: '1000BASE-T', poe: 'IEEE 802.3af', poeMode: 'pse' },
    { kind: 'interface', name: 'TenGigabitEthernet1/1/[1-4]', label: 'Uplink', iface: '10GBASE-X SFP+' },
    { kind: 'interface', name: 'GigabitEthernet0/0', label: 'Management', iface: '1000BASE-T', mgmtOnly: true },
    { kind: 'console', name: 'Console', consoleType: 'USB Type C' },
    { kind: 'power-port', name: 'PSU[1-2]', ppType: 'AC', maxDrawW: 715, allocDrawW: 500 }] },
  { mfr: 'Cisco', model: 'ASR 9006', role: 'Core Router', platform: 'IOS-XR', u: 10, full: true, weight: 154, weightUnit: 'lb', airflow: 'front-to-rear', desc: 'Modular core / provider-edge router', templates: [
    { kind: 'module-bay', name: 'Slot-1', label: 'Line-card slot 1', position: 'Slot-1', description: 'Houses a line-card module' },
    { kind: 'module-bay', name: 'Slot-2', label: 'Line-card slot 2', position: 'Slot-2', description: 'Houses a line-card module' },
    { kind: 'module-bay', name: 'Slot-3', label: 'Line-card slot 3', position: 'Slot-3', description: 'Houses a line-card module' },
    { kind: 'module-bay', name: 'Slot-4', label: 'Line-card slot 4', position: 'Slot-4', description: 'Houses a line-card module' },
    { kind: 'interface', name: 'MgmtEth0/RSP0/CPU0/0', label: 'Management', iface: '1000BASE-T', mgmtOnly: true },
    { kind: 'console', name: 'Console', consoleType: 'RJ-45' },
    { kind: 'power-port', name: 'PEM[0-1]', label: 'Power entry module', ppType: 'DC', maxDrawW: 3000, allocDrawW: 2000 }],
    inventory: [{ role: 'Fan', name: 'Fan tray 1', mfr: 'Cisco', part: 'ASR-9006-FAN' }] },
  { mfr: 'Juniper', model: 'MX480', role: 'Core Router', platform: 'Junos', u: 8, full: true, weight: 60, weightUnit: 'kg', airflow: 'front-to-rear', desc: 'Modular core router', templates: [
    { kind: 'module-bay', name: 'Slot-1', label: 'MPC slot 1', position: 'Slot-1' },
    { kind: 'module-bay', name: 'Slot-2', label: 'MPC slot 2', position: 'Slot-2' },
    { kind: 'module-bay', name: 'Slot-3', label: 'MPC slot 3', position: 'Slot-3' },
    { kind: 'module-bay', name: 'Slot-4', label: 'MPC slot 4', position: 'Slot-4' },
    { kind: 'interface', name: 'fxp0', label: 'Management', iface: '1000BASE-T', mgmtOnly: true },
    { kind: 'console', name: 'Console', consoleType: 'RJ-45' },
    { kind: 'power-port', name: 'PEM[0-3]', label: 'Power entry module', ppType: 'Redundant', maxDrawW: 2500, allocDrawW: 1800 }],
    inventory: [{ role: 'Fan', name: 'Fan tray 1', mfr: 'Juniper', part: 'MX480-FAN' }] },
  { mfr: 'Palo Alto', model: 'PA-5450', role: 'Firewall', platform: 'Other', u: 3, weight: 25, weightUnit: 'kg', airflow: 'front-to-rear', desc: 'Next-generation firewall', templates: [
    { kind: 'interface', name: 'ethernet1/[1-16]', label: 'Data', iface: '25GBASE-X SFP28' },
    { kind: 'interface', name: 'mgmt', label: 'Management', iface: '1000BASE-T', mgmtOnly: true },
    { kind: 'console', name: 'Console', consoleType: 'RJ-45' },
    { kind: 'console', name: 'Micro USB console', consoleType: 'USB Type C' },
    { kind: 'power-port', name: 'PSU[1-2]', ppType: 'AC', maxDrawW: 1500, allocDrawW: 1100 }] },
  { mfr: 'F5', model: 'BIG-IP i7800', role: 'Other', platform: 'Linux', u: 1, weight: 12, weightUnit: 'kg', airflow: 'front-to-rear', desc: 'Application delivery controller', templates: [
    { kind: 'interface', name: '1.[1-8]', label: 'Data', iface: '25GBASE-X SFP28' },
    { kind: 'interface', name: 'mgmt', label: 'Management', iface: '1000BASE-T', mgmtOnly: true },
    { kind: 'console', name: 'Console', consoleType: 'Serial (DB9)' },
    { kind: 'power-port', name: 'PSU[1-2]', ppType: 'IEC C14', maxDrawW: 500, allocDrawW: 400 }] },
  { mfr: 'Opengear', model: 'OM2248 Console Server', role: 'Other', platform: 'Linux', u: 1, weight: 4, weightUnit: 'kg', airflow: 'right-to-left', desc: '48-port out-of-band console server', templates: [
    { kind: 'console-server', name: 'serial[1-48]', label: 'Serial', consoleType: 'RJ-45' },
    { kind: 'interface', name: 'net1', label: 'Network', iface: '1000BASE-T' },
    { kind: 'interface', name: 'net2', label: 'Cellular failover', iface: 'Virtual', rf: 'Uplink' },
    { kind: 'power-port', name: 'PSU', ppType: 'AC', maxDrawW: 80, allocDrawW: 60 }] },
  { mfr: 'Cisco', model: 'Catalyst 9120 Access Point', role: 'Other', platform: 'Other', u: 0, weight: 850, weightUnit: 'g', airflow: 'passive', desc: 'Wi-Fi 6 access point (PoE powered)', templates: [
    { kind: 'interface', name: 'eth0', label: 'PoE uplink', iface: '1000BASE-T', poe: 'IEEE 802.3bt', poeMode: 'pd' },
    { kind: 'interface', name: 'radio0', label: '2.4 GHz', iface: 'Virtual', rf: 'Access Point' },
    { kind: 'interface', name: 'radio1', label: '5 GHz', iface: 'Virtual', rf: 'Access Point' },
    { kind: 'interface', name: 'radio2', label: 'Mesh bridge', iface: 'Virtual', rf: 'Bridge' },
    { kind: 'console', name: 'Console', consoleType: 'USB Type A' }] },
  { mfr: 'APC', model: 'Smart-UPS SRT 10kVA', role: 'Other', platform: 'Other', u: 6, weight: 120, weightUnit: 'kg', airflow: 'front-to-rear', desc: 'Rack-mount double-conversion UPS', templates: [
    { kind: 'power-port', name: 'Input', label: 'Mains input', ppType: 'AC', maxDrawW: 10000, allocDrawW: 8000 },
    { kind: 'power-outlet', name: 'Outlet[1-8]', label: 'C13 outlet', outletType: 'IEC C13', parentPowerPort: 'Input', feedLeg: 'A' },
    { kind: 'power-outlet', name: 'Outlet[9-10]', label: 'C19 outlet', outletType: 'IEC C19', parentPowerPort: 'Input', feedLeg: 'A' },
    { kind: 'interface', name: 'nmc', label: 'Network management card', iface: '1000BASE-T', mgmtOnly: true }] },
  { mfr: 'Vertiv', model: 'Geist rPDU 3-phase', role: 'PDU', platform: 'Other', u: 0, weight: 6, weightUnit: 'kg', airflow: 'passive', desc: 'Switched, metered 3-phase rack PDU', templates: [
    { kind: 'power-port', name: 'Feed', label: 'Input feed (3-phase)', ppType: 'AC', maxDrawW: 22000, allocDrawW: 17000 },
    { kind: 'power-outlet', name: 'Outlet[1-12]', label: 'C13 · leg A', outletType: 'IEC C13', parentPowerPort: 'Feed', feedLeg: 'A' },
    { kind: 'power-outlet', name: 'Outlet[13-24]', label: 'C13 · leg B', outletType: 'IEC C13', parentPowerPort: 'Feed', feedLeg: 'B' },
    { kind: 'power-outlet', name: 'Outlet[25-36]', label: 'C13 · leg C', outletType: 'IEC C13', parentPowerPort: 'Feed', feedLeg: 'C' },
    { kind: 'power-outlet', name: 'Outlet[37-42]', label: 'C19 · leg A', outletType: 'IEC C19', parentPowerPort: 'Feed', feedLeg: 'A' },
    { kind: 'interface', name: 'mgmt0', label: 'Management', iface: '1000BASE-T', mgmtOnly: true }] },
  { mfr: 'Vertiv', model: 'DC Power Strip −48V', role: 'PDU', platform: 'Other', u: 0, weight: 4, weightUnit: 'kg', airflow: 'passive', desc: 'Fused −48 V DC distribution strip for telco racks', templates: [
    { kind: 'power-port', name: 'Feed', label: 'BDFB feed', ppType: 'DC', maxDrawW: 6000, allocDrawW: 4500 },
    { kind: 'power-outlet', name: 'Fuse[1-12]', label: 'DC fused output', outletType: 'DC', parentPowerPort: 'Feed', feedLeg: 'A' }] },
  { mfr: 'Panduit', model: '48-Port LC Patch Panel', role: 'Patch Panel', platform: 'Other', u: 1, weight: 3, weightUnit: 'kg', airflow: 'passive', desc: '48-port fibre patch panel', templates: [
    { kind: 'rear-port', name: 'Rear[1-48]', label: 'Rear', positions: 1 },
    { kind: 'front-port', name: 'Front[1-48]', label: 'Front', rearPortName: 'Rear[1-48]', rearPortPosition: 1 }] },
  { mfr: 'Supermicro', model: 'SuperBlade Chassis', role: 'Server', platform: 'Other', u: 8, full: true, weight: 120, weightUnit: 'kg', airflow: 'front-to-rear', desc: 'Blade chassis housing child blade servers', subdevice: 'parent', templates: [
    { kind: 'power-port', name: 'PSU[1-4]', label: 'Power supply', ppType: 'AC', maxDrawW: 3000, allocDrawW: 2200 },
    { kind: 'device-bay', name: 'Blade-[1-8]', label: 'Blade slot', position: 'Front', description: 'Houses a blade server' },
    { kind: 'module-bay', name: 'CMM', label: 'Chassis management module', position: 'Rear' },
    { kind: 'interface', name: 'cmm0', label: 'Chassis management', iface: '1000BASE-T', mgmtOnly: true }] },
  { mfr: 'Supermicro', model: 'SuperBlade Server', role: 'Server', platform: 'Linux', u: 0, weight: 4, weightUnit: 'kg', airflow: 'front-to-rear', desc: 'Blade server (installs into a chassis bay)', subdevice: 'child', templates: [
    { kind: 'interface', name: 'eth[0-1]', label: 'Blade NIC', iface: '25GBASE-X SFP28' },
    { kind: 'console', name: 'Virtual console', consoleType: 'Virtual' }] },
];

const MT_SPECS: Array<{ mfr: string; model: string; part: string; weight: number; templates: Tpl[] }> = [
  { mfr: 'Juniper', model: 'MPC7E-10G Line Card', part: 'MPC7E-10G', weight: 5, templates: [
    { kind: 'interface', name: 'xe-{slot}/0/[0-39]', label: '10G line-card port', iface: '10GBASE-X SFP+' },
    { kind: 'power-port', name: 'LC-PWR', label: 'Line-card power', ppType: 'DC', maxDrawW: 360, allocDrawW: 300 }] },
  { mfr: 'Cisco', model: 'A9K-8X100GE Line Card', part: 'A9K-8X100GE-SE', weight: 6, templates: [
    { kind: 'interface', name: 'HundredGigE0/{slot}/0/[0-7]', label: '100G line-card port', iface: '100GBASE-X QSFP28' },
    { kind: 'power-port', name: 'LC-PWR', label: 'Line-card power', ppType: 'DC', maxDrawW: 500, allocDrawW: 420 }] },
  { mfr: 'Juniper', model: 'MPC10E-15C Line Card', part: 'MPC10E-15C', weight: 7, templates: [
    { kind: 'interface', name: 'et-{slot}/0/[0-14]', label: '100G/400G line-card port', iface: '400GBASE-X QSFP-DD' },
    { kind: 'power-port', name: 'LC-PWR', label: 'Line-card power', ppType: 'DC', maxDrawW: 700, allocDrawW: 600 }] },
];

export function expandNames(name: string): string[] {
  const m = name.match(/^(.*)\[(\d+)-(\d+)\](.*)$/);
  if (!m) return [name];
  const [, pre, a, b, post] = m;
  const out: string[] = [];
  for (let i = +a; i <= +b; i++) out.push(`${pre}${i}${post}`);
  return out;
}

const PLATFORM_FOR = (mfr: string, model: string, category?: string): E.Platform => {
  if (mfr === 'Cisco') return model.includes('Nexus') ? 'NX-OS' : model.includes('ASR') ? 'IOS-XR' : 'Other';
  if (mfr === 'Arista') return 'EOS';
  if (mfr === 'Juniper') return 'Junos';
  if (['Dell', 'HPE', 'Supermicro', 'NVIDIA', 'Pure Storage', 'NetApp', 'F5', 'Opengear'].includes(mfr)) return 'Linux';
  void category;
  return 'Other';
};

export function seedDcim(S: Seed): void {
  // ── Reference entities ──
  const mfrIdBy: Record<string, string> = {};
  for (const n of ['Dell', 'HPE', 'Supermicro', 'NVIDIA', 'Pure Storage', 'NetApp', 'Cisco', 'Arista', 'Juniper', 'Palo Alto', 'F5', 'Opengear', 'APC', 'Vertiv', 'Panduit', 'Rittal', 'Telect', 'Intel', 'Samsung', 'Finisar']) {
    const id = S.nid('MFR'); mfrIdBy[n] = id;
    S.manufacturers.push({ id, mfrId: id, ...S.meta(), name: n, slug: n.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: `${n} hardware` });
  }
  const roleColors: Record<string, string> = { 'Leaf/ToR': '#2563eb', Spine: '#4338ca', Server: '#16a34a', PDU: '#f59e0b', 'Patch Panel': '#7c3aed', 'Core Router': '#dc2626', Firewall: '#ea580c', Storage: '#0891b2', Other: '#64748b' };
  const roleIdBy: Record<string, string> = {};
  const platIdBy: Record<string, string> = {};
  for (const r of E.DCIM_DEVICE_ROLE) { const id = S.nid('DROLE'); roleIdBy[r] = id; S.deviceRoles.push({ id, drId: id, ...S.meta(), name: r, slug: r.toLowerCase().replace(/[^a-z0-9]+/g, '-'), color: roleColors[r] ?? '#64748b', description: `${r} devices` }); }
  const platMfr: Record<string, string> = { Junos: 'Juniper', EOS: 'Arista', 'NX-OS': 'Cisco', 'IOS-XR': 'Cisco', Linux: 'Various', Other: 'Various' };
  for (const p of E.PLATFORM) { const id = S.nid('PLAT'); platIdBy[p] = id; S.platforms.push({ id, platId: id, ...S.meta(), name: p, slug: p.toLowerCase().replace(/[^a-z0-9]+/g, '-'), manufacturer: platMfr[p], description: `${p} operating system` }); }
  const iirIdBy: Record<string, string> = {};
  for (const [n, c] of [['PSU', '#f59e0b'], ['Fan', '#0891b2'], ['Optic', '#7c3aed'], ['CPU', '#dc2626'], ['DIMM', '#16a34a'], ['Controller', '#2563eb']] as const) { const id = S.nid('IIR'); iirIdBy[n] = id; S.inventoryItemRoles.push({ id, iirId: id, ...S.meta(), name: n, slug: n.toLowerCase(), color: c }); }

  // ── Device types + component templates (+ inventory item templates) ──
  const pushTpl = (owner: { deviceTypeId?: string; moduleTypeId?: string }, t: Tpl) => {
    const id = S.nid('CTPL');
    S.componentTemplates.push({
      id, ctplId: id, ...S.meta(), ...owner, kind: t.kind, namePattern: t.name, label: t.label ?? t.kind, description: t.description ?? `${t.label ?? t.kind} (${t.kind})`,
      ifaceType: t.iface, mgmtOnly: t.kind === 'interface' ? !!t.mgmtOnly : undefined, poeType: t.kind === 'interface' ? (t.poe ?? 'None') : undefined, rfRole: t.kind === 'interface' ? (t.rf ?? 'None') : undefined, enabled: true,
      speedMbps: t.speed ?? (t.iface ? IF_SPEED[t.iface] : undefined), duplex: t.duplex ?? (t.kind === 'interface' ? 'auto' : undefined), mtu: t.mtu ?? (t.kind === 'interface' ? 1500 : undefined),
      consoleType: t.consoleType, powerPortType: t.ppType, maxDrawW: t.maxDrawW, allocatedDrawW: t.allocDrawW,
      outletType: t.outletType, parentPowerPort: t.parentPowerPort, feedLeg: t.feedLeg, position: t.position,
      rearPortName: t.rearPortName, rearPortPosition: t.rearPortPosition, positions: t.positions,
    });
  };
  const tplByDt = new Map<string, Tpl[]>();
  for (const s of DT_SPECS) {
    const dtId = S.nid('DT');
    S.dtIdByModel[s.model] = dtId;
    S.deviceTypes.push({ id: dtId, dtId, ...S.meta(), manufacturer: s.mfr, manufacturerId: mfrIdBy[s.mfr], model: s.model, slug: `${s.mfr}-${s.model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), partNumber: s.model.replace(/\s+/g, '-').toUpperCase(), uHeight: s.u, isFullDepth: !!s.full, airflow: s.airflow, weight: s.weight, weightUnit: s.weightUnit, role: s.role, platform: s.platform, description: s.desc, excludeFromUtilization: s.u === 0, defaultPlatformId: platIdBy[s.platform], subdeviceRole: s.subdevice, frontImage: `/device-types/${s.model.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-front.svg`, rearImage: `/device-types/${s.model.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-rear.svg` });
    for (const t of s.templates) pushTpl({ deviceTypeId: dtId }, t);
    tplByDt.set(dtId, s.templates);
    for (const it of s.inventory ?? []) { const id = S.nid('IIT'); S.inventoryItemTemplates.push({ id, iitId: id, ...S.meta(), deviceTypeId: dtId, roleId: iirIdBy[it.role], name: it.name, label: it.role, manufacturer: it.mfr, partNumber: it.part }); }
  }
  const mtIdByModel: Record<string, string> = {};
  const tplByMt = new Map<string, Tpl[]>();
  for (const s of MT_SPECS) {
    const mtId = S.nid('MT'); mtIdByModel[s.model] = mtId;
    S.moduleTypes.push({ id: mtId, mtId, ...S.meta(), manufacturer: s.mfr, model: s.model, partNumber: s.part, description: `${s.mfr} ${s.model}`, weight: s.weight, weightUnit: 'kg' });
    for (const t of s.templates) pushTpl({ moduleTypeId: mtId }, t);
    tplByMt.set(mtId, s.templates);
  }
  // Catalogue models whose asset-model name differs from the device-type model
  const dtForAssetModel = (am: T.AssetModel): string => S.dtIdByModel[am.model] ?? S.dtIdByModel[DT_SPECS.find((d) => am.model.startsWith(d.model.split(' ')[0]) && d.mfr === am.manufacturer)?.model ?? ''] ?? S.dtIdByModel['PowerEdge R760'];

  // ── Network fabric per site, as assets (mirrored into devices below) ──
  const modelOf = (cat: 'Switch' | 'Router' | 'Firewall' | 'Other' | 'PDU' | 'UPS', pref?: string): T.AssetModel => {
    const pool = S.assetModels.filter((m) => m.category === cat && (!pref || m.model.includes(pref)));
    return pool.length ? pool[0] : S.assetModels[0];
  };
  let fabricSeq = 0;
  const pushFabric = (dcId: string, rackId: string | undefined, m: T.AssetModel, hostname: string, role: AssetSeed['fabricRole'], opts: Partial<AssetSeed> = {}): AssetSeed => {
    fabricSeq++;
    const id = S.nid('ASSET');
    const a: AssetSeed = {
      id, assetId: id, ...S.meta(), rackId, dataCenterId: dcId, startU: rackId ? undefined : undefined, heightU: m.heightU, assetModelId: m.id,
      hostname, serialNumber: S.serial(10), assetTag: `AT-${String(200000 + fabricSeq)}`, category: m.category, manufacturer: m.manufacturer, model: m.model,
      powerDrawW: Math.round(m.typicalPowerW * 0.8), weightKg: m.weightKg, ratedThermalW: m.maxPowerW || 200,
      lifecycleState: 'Active', ownerTeam: 'NetEng', commissionedDate: S.daysAgo(S.int(200, 1500)), status: 'Active', fabricRole: role, ...opts,
    };
    S.assets.push(a);
    return a;
  };
  for (const d of S.dataCenters) {
    const prof = S.dcProfile.get(d.id);
    const dcRacks = S.racks.filter((r) => r.dataCenterId === d.id && r.status !== 'Planned');
    if (!dcRacks.length) continue;
    const netRacks = dcRacks.filter((r) => r.purpose === 'Network');
    const pickRack = (i: number) => (netRacks.length ? S.cycle(netRacks, i) : S.cycle(dcRacks, i)).id;
    const code = d.code.toLowerCase();
    const telco = prof?.segment === 'Telco';
    const coreModel = telco ? modelOf('Router', 'ASR') : modelOf('Router', 'MX480');
    pushFabric(d.id, pickRack(0), coreModel, `${code}-core-01`, 'core');
    pushFabric(d.id, pickRack(1), coreModel, `${code}-core-02`, 'core');
    pushFabric(d.id, pickRack(2), modelOf('Firewall'), `${code}-fw-01`, 'edge');
    pushFabric(d.id, pickRack(3), modelOf('Firewall'), `${code}-fw-02`, 'edge');
    if (telco) {
      pushFabric(d.id, pickRack(4), modelOf('Router', 'ASR'), `${code}-pe-01`, 'pe');
      pushFabric(d.id, pickRack(5), modelOf('Router', 'ASR'), `${code}-pe-02`, 'pe');
      if (['network-pop', 'ixp', 'national-core-nfvi'].includes(prof?.key ?? '')) pushFabric(d.id, pickRack(6), modelOf('Router', 'MX480'), `${code}-rr-01`, 'rr');
    }
    if (['enterprise-dc', 'retail-colo', 'wholesale-colo', 'national-core-nfvi', 'ai-gpu-factory'].includes(prof?.key ?? '')) pushFabric(d.id, pickRack(7), modelOf('Other', 'BIG-IP'), `${code}-lb-01`, 'lb');
    pushFabric(d.id, pickRack(8), modelOf('Other', 'Console'), `${code}-oob-01`, 'console');
    if (['edge-micro-dc', 'server-room'].includes(prof?.key ?? '')) {
      pushFabric(d.id, pickRack(0), modelOf('Switch', 'Catalyst'), `${code}-acc-01`, 'access');
      pushFabric(d.id, undefined, modelOf('Other', 'Access Point'), `${code}-ap-01`, 'ap', { notes: 'Wall-mounted; powered from the access switch' });
      pushFabric(d.id, pickRack(0), modelOf('UPS'), `${code}-ups-01`, 'ups');
    }
    S.halls.filter((h) => h.dataCenterId === d.id).forEach((h, hi) => {
      const hallRacks = dcRacks.filter((r) => r.hallId === h.id);
      const rk = (i: number) => (hallRacks.length ? S.cycle(hallRacks, i) : S.cycle(dcRacks, i)).id;
      pushFabric(d.id, rk(0), modelOf('Switch', 'Nexus'), `${code}-h${hi + 1}-spine-01`, 'spine');
      pushFabric(d.id, rk(1), modelOf('Switch', 'Nexus'), `${code}-h${hi + 1}-spine-02`, 'spine');
      const leafModel = hi % 2 === 0 ? modelOf('Switch', 'QFX') : modelOf('Switch', '7050');
      pushFabric(d.id, rk(2), leafModel, `${code}-h${hi + 1}-leaf-01`, 'leaf');
      pushFabric(d.id, rk(3), leafModel, `${code}-h${hi + 1}-leaf-02`, 'leaf');
    });
    // Showcase rack PDUs (A/B) and, for the enterprise DC, a patch panel in the first showcase rack
    const sc = S.showcaseRacks.get(d.id) ?? [];
    sc.forEach((rack) => {
      const pduModel = prof?.dcPowerPlant ? modelOf('PDU', 'DC Power') : modelOf('PDU', 'Geist');
      pushFabric(d.id, rack.id, pduModel, `${code}-${rack.name.toLowerCase()}-pdu-a`, 'pdu', { ownerTeam: 'Facilities' });
      pushFabric(d.id, rack.id, pduModel, `${code}-${rack.name.toLowerCase()}-pdu-b`, 'pdu', { ownerTeam: 'Facilities' });
    });
  }

  // ── Mirror every asset into a Device with role, platform, face and airflow filled ──
  const devById = new Map<string, T.Device>();
  const assetById = new Map<string, AssetSeed>();
  const positionByRack = new Map<string, number>();
  for (const a of S.assets) {
    assetById.set(a.id, a);
    const am = S.assetModels.find((m) => m.id === a.assetModelId) as T.AssetModel;
    const dtId = a.model.includes('DC Power Strip') ? S.dtIdByModel['DC Power Strip −48V'] : dtForAssetModel(am);
    const dt = S.deviceTypes.find((x) => x.id === dtId) as T.DcimDeviceType;
    const platform = PLATFORM_FOR(a.manufacturer, a.model, a.category);
    const racked = !!a.rackId;
    let position = a.startU;
    if (racked && position == null && dt.uHeight > 0) {
      // fabric kit lands in the top of its rack, above the compute placed by the estate module
      const rack = S.racks.find((r) => r.id === a.rackId) as T.Rack;
      const used = S.assets.filter((x) => x.rackId === a.rackId && x.startU != null).reduce((m, x) => Math.max(m, (x.startU ?? 0) + x.heightU - 1), 0);
      const next = Math.max(used + 1, positionByRack.get(a.rackId as string) ?? used + 1);
      position = Math.min(next, rack.heightU - dt.uHeight + 1);
      positionByRack.set(a.rackId as string, position + dt.uHeight);
      a.startU = position;
    }
    const dev: T.Device = {
      id: a.id, devcId: a.assetId, ...S.meta(), name: a.hostname, deviceTypeId: dtId, rackId: a.rackId, dataCenterId: a.dataCenterId,
      position: racked ? (dt.uHeight === 0 ? 0 : position) : undefined, status: a.status,
      serial: a.serialNumber, assetTag: a.assetTag, face: dt.role === 'PDU' ? 'rear' : 'front',
      deviceRoleId: roleIdBy[dt.role], platformId: platIdBy[platform], airflow: dt.airflow,
      hostname: a.hostname, manufacturer: a.manufacturer, model: a.model, category: a.category, heightU: dt.uHeight,
      powerDrawW: a.powerDrawW, ratedThermalW: a.ratedThermalW, weightKg: a.weightKg, lifecycleState: a.lifecycleState, ownerTeam: a.ownerTeam,
      commissionedDate: a.commissionedDate, decommissionDate: a.decommissionDate, assetModelId: a.assetModelId, notes: a.notes,
    };
    S.devices.push(dev); devById.set(dev.id, dev);
  }

  // ── Components for every device, from its type's templates ──
  // Fabric, managed and showcase devices get their full port set; the long tail of compute gets a
  // compact set (management, console, power, first four data ports) to keep the store responsive.
  const addComponents = (dev: T.Device, tpls: Tpl[], moduleId?: string, slot?: string, full = true) => {
    const list = S.compsByDevice.get(dev.id) ?? [];
    const retired = dev.lifecycleState === 'Retired' || dev.lifecycleState === 'Disposed';
    for (const t of tpls) {
      const all = expandNames(slot != null ? t.name.replace('{slot}', slot) : t.name);
      const names = full || t.kind !== 'interface' || t.mgmtOnly ? all : all.slice(0, 4);
      names.forEach((cname, ni) => {
        const id = S.nid('DCOMP');
        const c: T.DeviceComponent = { id, dcompId: id, ...S.meta(), deviceId: dev.id, kind: t.kind, name: cname, label: t.label ?? t.kind, moduleId };
        if (t.kind === 'interface') {
          const uplink = /uplink|fabric|spine|cluster/i.test(t.label ?? '') && !t.mgmtOnly;
          c.ifaceType = t.iface; c.enabled = !retired && !(ni > 0 && ni % 11 === 10 && !uplink); c.mgmtOnly = !!t.mgmtOnly; c.speedMbps = t.speed ?? (t.iface ? IF_SPEED[t.iface] : undefined);
          c.duplex = t.duplex ?? 'auto'; c.mtu = t.mtu ?? 1500; c.macAddress = t.iface === 'Virtual' ? undefined : S.mac();
          c.mode = uplink ? 'Tagged' : 'Access'; c.poeType = t.poe ?? 'None'; c.poeMode = t.poeMode;
        }
        if (t.kind === 'rear-port') c.positions = t.positions ?? 1;
        if (t.kind === 'front-port') c.rearPortPosition = t.rearPortPosition ?? 1;
        list.push(c); S.deviceComponents.push(c);
      });
    }
    // Pass-through mapping front → rear by trailing index
    const trail = (s: string) => s.match(/(\d+)$/)?.[1];
    for (const f of list.filter((c) => c.kind === 'front-port' && !c.rearPortId)) {
      const rear = list.find((c) => c.kind === 'rear-port' && trail(c.name) === trail(f.name));
      if (rear) { f.rearPortId = rear.id; }
    }
    S.compsByDevice.set(dev.id, list);
  };
  const showcaseRackIds = new Set([...S.showcaseRacks.values()].flat().map((r) => r.id));
  let accessSeen = 0;
  const keyDevice = (dev: T.Device) => {
    const fr = assetById.get(dev.id)?.fabricRole;
    if (fr === 'access') return accessSeen++ < 60; // the access ToRs the NOC manages (see nmsInventory)
    return !!fr || (!!dev.rackId && showcaseRackIds.has(dev.rackId));
  };
  for (const dev of S.devices) addComponents(dev, tplByDt.get(dev.deviceTypeId) ?? [], undefined, undefined, keyDevice(dev));

  // Inventory items replicated from the type's templates (discovered on managed network kit)
  for (const dev of S.devices) {
    for (const t of S.inventoryItemTemplates.filter((x) => x.deviceTypeId === dev.deviceTypeId)) {
      const id = S.nid('INV');
      S.inventoryItems.push({ id, invId: id, ...S.meta(), deviceId: dev.id, roleId: t.roleId, name: t.name, label: t.label, manufacturer: t.manufacturer, partNumber: t.partNumber, serial: S.serial(10), discovered: ['Switch', 'Router', 'Firewall'].includes(dev.category ?? '') });
    }
  }

  // ── Modules installed in core routers (slots 1–2 populated; one site also fills slot 3) ──
  const cores = S.devices.filter((d) => assetById.get(d.id)?.fabricRole === 'core');
  cores.forEach((core, ci) => {
    const isJuniper = core.manufacturer === 'Juniper';
    const slots = ci % 5 === 0 ? ['Slot-1', 'Slot-2', 'Slot-3'] : ['Slot-1', 'Slot-2'];
    slots.forEach((bay, bi) => {
      const mtModel = isJuniper ? (bi === 2 ? 'MPC10E-15C Line Card' : 'MPC7E-10G Line Card') : 'A9K-8X100GE Line Card';
      const mtId = mtIdByModel[mtModel];
      const modId = S.nid('MOD');
      S.modules.push({ id: modId, modId, ...S.meta(), deviceId: core.id, moduleBayName: bay, moduleTypeId: mtId, notes: `${mtModel} in ${bay}` });
      addComponents(core, tplByMt.get(mtId) ?? [], modId, bay.replace('Slot-', ''));
    });
  });

  // ── Showcase extras at the enterprise DC: blade chassis with child blades, patch panel, virtual chassis, VDCs ──
  const ent = S.dataCenters[0];
  const entShowcase = S.showcaseRacks.get(ent.id) ?? [];
  const makeExtra = (rackId: string, model: string, name: string, position: number, extra: Partial<T.Device> = {}): T.Device => {
    const dtId = S.dtIdByModel[model]; const dt = S.deviceTypes.find((x) => x.id === dtId) as T.DcimDeviceType;
    const id = S.nid('DEVC');
    const dev: T.Device = { id, devcId: id, ...S.meta(), name, deviceTypeId: dtId, rackId, dataCenterId: ent.id, position, status: 'Active', serial: S.serial(11), assetTag: `AT-${String(300000 + S.devices.length)}`, face: 'front', deviceRoleId: roleIdBy[dt.role], platformId: platIdBy[dt.platform ?? 'Other'], airflow: dt.airflow, hostname: name, manufacturer: dt.manufacturer, model: dt.model, category: dt.role === 'Patch Panel' ? 'Other' : 'Server', heightU: dt.uHeight, powerDrawW: dt.role === 'Patch Panel' ? 0 : 900, ratedThermalW: dt.role === 'Patch Panel' ? 0 : 1200, weightKg: dt.weight ?? 10, lifecycleState: 'Active', ownerTeam: 'Platform', commissionedDate: S.daysAgo(400), ...extra };
    S.devices.push(dev); devById.set(dev.id, dev);
    addComponents(dev, tplByDt.get(dtId) ?? []);
    return dev;
  };
  if (entShowcase.length >= 2) {
    const [rackA, rackB] = entShowcase;
    const topA = Math.max(...S.devices.filter((d) => d.rackId === rackA.id && d.position).map((d) => (d.position ?? 0) + (d.heightU ?? 1)), 1);
    const pp = makeExtra(rackA.id, '48-Port LC Patch Panel', `${ent.code.toLowerCase()}-${rackA.name.toLowerCase()}-pp-01`, Math.min(topA, rackA.heightU));
    const topB = Math.max(...S.devices.filter((d) => d.rackId === rackB.id && d.position).map((d) => (d.position ?? 0) + (d.heightU ?? 1)), 1);
    const chassis = makeExtra(rackB.id, 'SuperBlade Chassis', `${ent.code.toLowerCase()}-blade-chassis-01`, Math.min(topB, rackB.heightU - 8), { powerDrawW: 4800, ratedThermalW: 6000 });
    for (let b = 1; b <= 4; b++) makeExtra(rackB.id, 'SuperBlade Server', `${ent.code.toLowerCase()}-blade-${String(b).padStart(2, '0')}`, chassis.position ?? 1, { parentDeviceId: chassis.id, parentBayName: `Blade-${b}`, powerDrawW: 600, ratedThermalW: 700, weightKg: 4 });
    void pp;
  }
  // Virtual chassis: the two leaf switches of each site's first hall form a stack
  for (const d of S.dataCenters) {
    const leaves = S.devices.filter((x) => assetById.get(x.id)?.fabricRole === 'leaf' && x.dataCenterId === d.id).slice(0, 2);
    if (leaves.length < 2 || leaves[0].manufacturer !== 'Juniper') continue;
    const vcId = S.nid('VC');
    S.virtualChassis.push({ id: vcId, vcId, ...S.meta(), name: `${d.code.toLowerCase()}-leaf-stack-01`, domain: 'pod-1', masterDeviceId: leaves[0].id, notes: 'Two-member Virtual Chassis' });
    leaves[0].virtualChassisId = vcId; leaves[0].vcPosition = 0; leaves[0].vcPriority = 128;
    leaves[1].virtualChassisId = vcId; leaves[1].vcPosition = 1; leaves[1].vcPriority = 1;
    // LAG on the master: first two server-facing ports aggregate
    const ifaces = (S.compsByDevice.get(leaves[0].id) ?? []).filter((c) => c.kind === 'interface' && !c.mgmtOnly && c.ifaceType !== 'Virtual');
    if (ifaces.length >= 3) {
      const lagId = S.nid('DCOMP');
      const lag: T.DeviceComponent = { id: lagId, dcompId: lagId, ...S.meta(), deviceId: leaves[0].id, kind: 'interface', name: 'ae0', label: 'Uplink LAG', ifaceType: 'Virtual', enabled: true, mgmtOnly: false, speedMbps: 200000, duplex: 'full', mtu: 9216, mode: 'Tagged-All', poeType: 'None' };
      S.deviceComponents.push(lag); (S.compsByDevice.get(leaves[0].id) ?? []).push(lag);
      ifaces.slice(0, 2).forEach((m) => { m.lagId = lagId; m.lagName = 'ae0'; });
    }
  }
  // Virtual device contexts on the first core of the three largest sites (active / planned / offline)
  cores.slice(0, 3).forEach((core, ci) => {
    (['active', 'planned', 'offline'] as const).forEach((st, k) => {
      if (k > ci) return;
      const id = S.nid('VDC');
      S.virtualDeviceContexts.push({ id, vdcId: id, ...S.meta(), deviceId: core.id, name: `vdc-${['prod', 'mgmt', 'legacy'][k]}`, identifier: k + 1, status: st, notes: st === 'offline' ? 'Legacy context retired after migration' : undefined });
    });
  });
  // Fibre-channel WWNs on the storage data ports of the showcase arrays; per-interface VRF on the core management ports (set when VRFs exist, in ipam)
  S.devices.filter((d) => d.category === 'Storage').slice(0, 6).forEach((arr) => {
    (S.compsByDevice.get(arr.id) ?? []).filter((c) => c.kind === 'interface' && !c.mgmtOnly).forEach((c) => { c.wwn = `50:0A:09:8${S.hex(1)}:${S.hex(2)}:${S.hex(2)}:${S.hex(2)}:${S.hex(2)}`.toUpperCase(); });
  });
  // A legacy half-duplex management port at the retiring server room (config drift story)
  const dub = S.dataCenters.find((d) => S.dcProfile.get(d.id)?.key === 'server-room');
  if (dub) S.devices.filter((d) => d.dataCenterId === dub.id && d.category === 'Server').slice(0, 1).forEach((d) => { const eno = (S.compsByDevice.get(d.id) ?? []).find((c) => c.name === 'eno1'); if (eno) { eno.duplex = 'half'; eno.speedMbps = 100; eno.notes = 'Negotiated 100/half — legacy patch field'; } });

  // ── Cabling in the showcase racks ──
  const comp = (devId: string, name: string) => (S.compsByDevice.get(devId) ?? []).find((c) => c.name === name);
  let cableSeq = 0;
  const makeCable = (aDev: T.Device, aName: string, bDev: T.Device, bName: string, type: E.CableType, label?: string): T.Cable | undefined => {
    const a = comp(aDev.id, aName); const b = comp(bDev.id, bName);
    if (!a || !b) return undefined;
    cableSeq++;
    const status: E.CableStatus = cableSeq % 29 === 0 ? 'Planned' : cableSeq % 31 === 0 ? 'Decommissioning' : 'Active';
    const cblId = S.nid('CBL');
    const colorFor: Record<E.CableType, string> = { Cat6: 'blue', Cat6a: 'blue', 'MMF-OM4': 'aqua', 'SMF-OS2': 'yellow', DAC: 'black', 'Power-C13': 'grey', 'Power-C19': 'red' };
    const c: T.Cable = { id: cblId, cblId, ...S.meta(), status, cableType: type, label: label ?? `${aDev.name}:${aName} ↔ ${bDev.name}:${bName}`, color: colorFor[type], lengthM: type.startsWith('Power') ? S.int(1, 3) : type === 'SMF-OS2' ? S.int(40, 300) : S.int(1, 25), aKind: a.kind, aComponentId: a.id, aDeviceId: aDev.id, bKind: b.kind, bComponentId: b.id, bDeviceId: bDev.id };
    S.cables.push(c);
    return c;
  };
  const serverPorts = (dev: T.Device) => (S.compsByDevice.get(dev.id) ?? []).filter((c) => c.kind === 'interface' && !c.mgmtOnly && c.ifaceType !== 'Virtual').map((c) => c.name);
  const psuPorts = (dev: T.Device) => (S.compsByDevice.get(dev.id) ?? []).filter((c) => c.kind === 'power-port').map((c) => c.name);
  for (const d of S.dataCenters) {
    const sc = S.showcaseRacks.get(d.id) ?? [];
    if (!sc.length) continue;
    const dcDevs = S.devices.filter((x) => x.dataCenterId === d.id);
    const role = (r: AssetSeed['fabricRole']) => dcDevs.filter((x) => assetById.get(x.id)?.fabricRole === r);
    const leaves = role('leaf').slice(0, 2); const spines = role('spine').slice(0, 2); const coresDc = role('core'); const fws = role('edge'); const pes = role('pe');
    const trunk: T.Cable[] = [];
    let leafPort = 0; let spinePort = 0;
    sc.forEach((rack) => {
      const pdus = dcDevs.filter((x) => x.rackId === rack.id && assetById.get(x.id)?.fabricRole === 'pdu');
      const kit = dcDevs.filter((x) => x.rackId === rack.id && !assetById.get(x.id)?.fabricRole && x.heightU && x.heightU > 0 && !x.parentDeviceId);
      let outletA = 1; let outletB = 1;
      kit.forEach((dev) => {
        const ports = serverPorts(dev);
        const gpu = dev.category === 'GPU-Node';
        // Data: first two NICs to leaf-01 / leaf-02 (DAC for 25G, OM4 for 100G/400G)
        if (leaves[0] && ports[0]) { const lp = serverPorts(leaves[0])[leafPort % 40]; if (lp) makeCable(dev, ports[0], leaves[0], lp, gpu ? 'MMF-OM4' : 'DAC'); }
        if (leaves[1] && ports[1]) { const lp = serverPorts(leaves[1])[leafPort % 40]; if (lp) makeCable(dev, ports[1], leaves[1], lp, gpu ? 'MMF-OM4' : 'DAC'); }
        leafPort++;
        // Management: iDRAC/BMC to the console server network via Cat6
        const mgmt = (S.compsByDevice.get(dev.id) ?? []).find((c) => c.kind === 'interface' && c.mgmtOnly);
        const oob = role('console')[0];
        if (mgmt && oob) { const np = comp(oob.id, 'net1'); if (np) makeCable(dev, mgmt.name, oob, 'net1', 'Cat6', `${dev.name} OOB`); }
        // Power: PSU1 → PDU-A, PSU2 → PDU-B; GPU nodes on C19 outlets
        const psus = psuPorts(dev);
        const outletNames = (p: T.Device, c19: boolean) => (S.compsByDevice.get(p.id) ?? []).filter((c) => c.kind === 'power-outlet' && (c.label ?? '').includes(c19 ? 'C19' : 'C13') || (c.kind === 'power-outlet' && c.name.startsWith('Fuse'))).map((c) => c.name);
        if (pdus[0] && psus[0]) { const on = outletNames(pdus[0], gpu); const o = on[(outletA++) % Math.max(1, on.length)]; if (o) makeCable(dev, psus[0], pdus[0], o, gpu ? 'Power-C19' : 'Power-C13'); }
        if (pdus[1] && psus[1]) { const on = outletNames(pdus[1], gpu); const o = on[(outletB++) % Math.max(1, on.length)]; if (o) makeCable(dev, psus[1], pdus[1], o, gpu ? 'Power-C19' : 'Power-C13'); }
      });
    });
    // Leaf → spine (OM4), spine → core (OS2), core → firewall (Cat6a), core → PE (OS2)
    leaves.forEach((leaf) => {
      const ups = serverPorts(leaf).filter((n) => /^(et-|Ethernet(49|5\d)|TenGig)/.test(n));
      spines.forEach((spine, si) => { const sp = serverPorts(spine)[spinePort++ % 36]; const lp = ups[si]; if (lp && sp) { const c = makeCable(leaf, lp, spine, sp, 'MMF-OM4'); if (c) trunk.push(c); } });
    });
    spines.forEach((spine, si) => coresDc.forEach((core, ci) => {
      const sp = serverPorts(spine)[30 + si + ci]; const cp = (S.compsByDevice.get(core.id) ?? []).filter((c) => c.kind === 'interface' && !c.mgmtOnly && c.moduleId)[si * 2 + ci]?.name;
      if (sp && cp) makeCable(spine, sp, core, cp, 'SMF-OS2');
    }));
    fws.forEach((fw, fi) => { const cp = (S.compsByDevice.get(coresDc[fi % coresDc.length]?.id ?? '') ?? []).filter((c) => c.kind === 'interface' && !c.mgmtOnly && c.moduleId)[6 + fi]?.name; if (cp) makeCable(fw, 'ethernet1/1', coresDc[fi % coresDc.length], cp, 'Cat6a'); });
    pes.forEach((pe, pi) => { const cp = (S.compsByDevice.get(coresDc[pi % coresDc.length]?.id ?? '') ?? []).filter((c) => c.kind === 'interface' && !c.mgmtOnly && c.moduleId)[10 + pi]?.name; const pp = (S.compsByDevice.get(pe.id) ?? []).filter((c) => c.kind === 'interface' && !c.mgmtOnly && c.moduleId)[0]?.name; if (cp && pp) makeCable(pe, pp, coresDc[pi % coresDc.length], cp, 'SMF-OS2'); });
    if (trunk.length) {
      const bId = S.nid('CBND');
      S.cableBundles.push({ id: bId, bundleId: bId, ...S.meta(), name: `${d.code} leaf↔spine trunk`, description: `Fibre trunk between the hall-1 leaf pair and the spine pair at ${d.name}`, cableIds: trunk.map((c) => c.id), aLocation: `Rack ${S.racks.find((r) => r.id === leaves[0]?.rackId)?.name ?? '—'}`, bLocation: `Rack ${S.racks.find((r) => r.id === spines[0]?.rackId)?.name ?? '—'}` });
      trunk.forEach((c) => { c.bundleId = bId; });
    }
  }
  // The enterprise showcase: a traceable path through the patch panel (server → front port ⇿ rear port → leaf)
  if (entShowcase.length) {
    const pp = S.devices.find((d) => d.model === '48-Port LC Patch Panel');
    const srv = S.devices.find((d) => d.rackId === entShowcase[0].id && d.category === 'Server');
    const leaf = S.devices.find((d) => d.dataCenterId === ent.id && assetById.get(d.id)?.fabricRole === 'leaf');
    if (pp && srv && leaf) {
      const p3 = serverPorts(srv)[2]; const lp = serverPorts(leaf)[45];
      if (p3) makeCable(srv, p3, pp, 'Front1', 'Cat6a', 'Patched via panel');
      if (lp) makeCable(pp, 'Rear1', leaf, lp, 'Cat6a', 'Panel rear to leaf');
    }
  }

  // ── Power panels → feeds → racks (A/B redundant), per site ──
  for (const d of S.dataCenters) {
    const prof = S.dcProfile.get(d.id);
    const dcRacks = S.racks.filter((r) => r.dataCenterId === d.id).slice(0, 12);
    const halls = S.halls.filter((h) => h.dataCenterId === d.id);
    const panels = (['A-side', 'B-side'] as const).map((side, i) => {
      const id = S.nid('PPNL');
      S.powerPanels.push({ id, ppnlId: id, ...S.meta(), dataCenterId: d.id, hallId: halls[i % Math.max(1, halls.length)]?.id, name: `${d.code} Panel ${side}`, notes: prof?.dcPowerPlant ? 'BDFB distribution' : 'Remote power panel' });
      return { id, side };
    });
    dcRacks.forEach((rk, ri) => {
      panels.forEach((p, pi) => {
        const id = S.nid('PFEED');
        const dc = !!prof?.dcPowerPlant;
        const small = prof?.key === 'edge-micro-dc' || prof?.key === 'server-room';
        const status: E.PowerFeedStatus = d.status === 'Construction' ? 'Planned' : ri === 9 && pi === 1 ? 'Offline' : ri === 10 && pi === 0 && S.dcProfile.get(d.id)?.key === 'ai-gpu-factory' ? 'Failed' : 'Active';
        S.powerFeeds.push({ id, pfId: id, ...S.meta(), powerPanelId: p.id, rackId: rk.id, pduId: S.pdus.find((x) => x.upsId && S.upsUnits.find((u) => u.id === x.upsId)?.dataCenterId === d.id)?.id, name: `${rk.name}-${p.side === 'A-side' ? 'A' : 'B'}`, supply: dc ? 'DC' : 'AC', phase: dc || small ? 'Single-phase' : 'Three-phase', voltage: dc ? 48 : small ? 230 : 415, amperage: dc ? 60 : small ? 16 : 32, maxUtilizationPct: 80, type: pi === 0 ? 'Primary' : 'Redundant', status, notes: status === 'Failed' ? 'Breaker tripped — see incident' : status === 'Offline' ? 'Isolated for PDU replacement' : undefined });
      });
    });
  }

  // ── Rack reservations: every Reserved rack holds an active U-range; two historical ones are released ──
  S.racks.filter((r) => r.status === 'Reserved').forEach((rk, i) => {
    const id = S.nid('RSVN');
    const start = 20 + (i % 10);
    const tenant = S.dcProfile.get(rk.dataCenterId)?.multiTenant ? rk.owner : 'CUST-001';
    S.rackReservations.push({ id, rsvnId: id, ...S.meta(S.byRole('Capacity Planner')), rackId: rk.id, units: [start, start + 1, start + 2, start + 3], reservedBy: S.person(i).name, tenant, description: S.cycle(['Reserved for Q3 GPU expansion', 'Held for storage refresh wave', 'Tenant expansion option', 'Network refresh staging'], i), status: 'Active' });
  });
  S.racks.filter((r) => r.status === 'Active').slice(0, 2).forEach((rk, i) => {
    const id = S.nid('RSVN');
    S.rackReservations.push({ id, rsvnId: id, ...S.meta(S.byRole('Capacity Planner')), rackId: rk.id, units: [30 + i, 31 + i], reservedBy: S.person(i + 3).name, tenant: 'CUST-001', description: 'Released after install completed', status: 'Released' });
  });

  // ── Post-pass: rack figures agree with installed devices; Full racks are full ──
  const byRack = new Map<string, T.Device[]>();
  for (const dv of S.devices) { if (dv.rackId && !dv.parentDeviceId) { const arr = byRack.get(dv.rackId) ?? []; arr.push(dv); byRack.set(dv.rackId, arr); } }
  for (const r of S.racks) {
    const kit = byRack.get(r.id) ?? [];
    const usedU = Math.min(r.heightU, kit.reduce((s, d) => s + (d.heightU ?? 0), 0));
    const live = kit.filter((d) => d.status === 'Active' || d.status === 'Faulty');
    const kw = S.r1(live.reduce((s, d) => s + (d.powerDrawW ?? 0), 0) / 1000);
    r.usedU = usedU; r.availableU = r.heightU - usedU;
    r.currentWeightKg = Math.round(kit.reduce((s, d) => s + (d.weightKg ?? 0), 0) + 120);
    r.currentPowerKw = kw; r.powerUtilizationPct = S.pct(kw, r.maxPowerKw); r.thermalDensityKwPerRack = kw;
    if (r.status === 'Active' && r.availableU <= 2) r.status = 'Full';
  }
  for (const h of S.halls) { const hr = S.racks.filter((r) => r.hallId === h.id); h.rackCount = hr.length; h.utilizationPct = S.pct(hr.length, h.rackCapacity); }
}
