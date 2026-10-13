/**
 * Generates Camunda 8 (Zeebe) BPMN 2.0 XML — collaboration, participant, lanes, zeebe
 * extensions and full bpmndi — from the process model in ../model.ts.
 *
 *   npx tsx src/workorders/tools/generateBpmn.ts
 *
 * Layout: nodes are layered left→right by longest path from the start event (back edges
 * ignored), placed in the lane they belong to; exception / rollback paths sit on a second
 * row inside their lane. Edges are orthogonal: forward edges bend in the gap between
 * columns, loops run along the lane's bottom (or top) margin, boundary-event flows leave
 * the attached task's bottom edge.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROCESSES, type WfNode, type WfProcess } from '../model';

const COL_W = 170, TASK_W = 120, TASK_H = 80, GW = 50, EV = 36;
const LANE_X = 190, LANE_Y = 80, LANE_HEAD = 30, ROW0 = 75, ROW_DY = 105;
const LANE_H = [150, 255];

interface Box { x: number; y: number; w: number; h: number; cx: number; cy: number; right: number; bottom: number; top: number; left: number }
const box = (cx: number, cy: number, w: number, h: number): Box => ({ x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, right: cx + w / 2, bottom: cy + h / 2, top: cy - h / 2, left: cx - w / 2 });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
const isoDuration = (hours: number) => {
  if (hours >= 24 && hours % 24 === 0) return `P${hours / 24}D`;
  if (Number.isInteger(hours)) return `PT${hours}H`;
  return `PT${Math.round(hours * 60)}M`;
};

function layer(p: WfProcess): { col: Map<string, number>; back: Set<string> } {
  const adj = new Map<string, string[]>();
  const edgeKey = (a: string, b: string) => `${a}->${b}`;
  for (const n of p.nodes) adj.set(n.id, []);
  for (const [a, b] of p.flows) adj.get(a)!.push(b);
  for (const n of p.nodes) for (const bnd of n.boundaries ?? []) adj.get(n.id)!.push(bnd.to);
  // back edges via DFS from start
  const back = new Set<string>();
  const state = new Map<string, 0 | 1 | 2>();
  const start = p.nodes.find((n) => n.type === 'start')!.id;
  const dfs = (u: string) => {
    state.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      const s = state.get(v) ?? 0;
      if (s === 1) back.add(edgeKey(u, v)); else if (s === 0) dfs(v);
    }
    state.set(u, 2);
  };
  dfs(start);
  // longest path layering
  const col = new Map<string, number>();
  const indeg = new Map<string, number>();
  for (const n of p.nodes) indeg.set(n.id, 0);
  for (const [u, vs] of adj) for (const v of vs) if (!back.has(edgeKey(u, v))) indeg.set(v, (indeg.get(v) ?? 0) + 1);
  const q = p.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  for (const id of q) col.set(id, 0);
  while (q.length) {
    const u = q.shift()!;
    for (const v of adj.get(u) ?? []) {
      if (back.has(edgeKey(u, v))) continue;
      col.set(v, Math.max(col.get(v) ?? 0, (col.get(u) ?? 0) + 1));
      indeg.set(v, indeg.get(v)! - 1);
      if (indeg.get(v) === 0) q.push(v);
    }
  }
  return { col, back };
}

function sizeOf(n: WfNode): [number, number] {
  if (n.type === 'start' || n.type === 'end' || n.type === 'timerCatch' || n.type === 'messageCatch') return [EV, EV];
  if (n.type === 'exclusiveGateway' || n.type === 'parallelGateway') return [GW, GW];
  return [TASK_W, TASK_H];
}

export function generate(p: WfProcess): string {
  const { col, back } = layer(p);
  const laneIdx = new Map(p.lanes.map((l, i) => [l, i]));
  // rows: explicit row, then auto-bump on collision within (lane, col)
  const row = new Map<string, number>();
  const taken = new Set<string>();
  for (const n of p.nodes) {
    let r = n.row ?? 0;
    while (taken.has(`${n.lane}|${col.get(n.id)}|${r}`)) r += 1;
    taken.add(`${n.lane}|${col.get(n.id)}|${r}`);
    row.set(n.id, Math.min(r, 1));
  }
  const laneRows = p.lanes.map((l) => Math.max(0, ...p.nodes.filter((n) => n.lane === l).map((n) => row.get(n.id) ?? 0)));
  const laneTop: number[] = []; let y = LANE_Y;
  for (let i = 0; i < p.lanes.length; i++) { laneTop.push(y); y += LANE_H[laneRows[i]]; }
  const totalH = y - LANE_Y;
  const cols = Math.max(...col.values()) + 1;
  const colCenter = (c: number) => LANE_X + 40 + TASK_W / 2 + c * COL_W;
  const partW = LANE_X - 160 + 40 + cols * COL_W + 20;

  const boxes = new Map<string, Box>();
  for (const n of p.nodes) {
    const [w, h] = sizeOf(n);
    const li = laneIdx.get(n.lane)!;
    boxes.set(n.id, box(colCenter(col.get(n.id)!), laneTop[li] + ROW0 + (row.get(n.id) ?? 0) * ROW_DY, w, h));
  }
  const bBoxes = new Map<string, Box>();
  for (const n of p.nodes) (n.boundaries ?? []).forEach((b, k) => {
    const h = boxes.get(n.id)!;
    bBoxes.set(b.id, box(h.right - 30 - k * 30, h.bottom, EV, EV));
  });
  const laneBottom = (laneName: string) => laneTop[laneIdx.get(laneName)!] + LANE_H[laneRows[laneIdx.get(laneName)!]];
  const hits = (x1: number, x2: number, yy: number, exclude: string[]) => {
    const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1];
    for (const [id, bx] of boxes) if (!exclude.includes(id) && yy >= bx.top - 4 && yy <= bx.bottom + 4 && bx.right > a && bx.left < b) return true;
    return false;
  };

  const pts: Record<string, [number, number][]> = {};
  const edges: { id: string; from: string; to: string; name?: string; cond?: string }[] = [];
  for (const [from, to, name, cond] of p.flows) {
    const id = `Flow_${from}_${to}`;
    edges.push({ id, from, to, name, cond });
    const s = boxes.get(from)!, t = boxes.get(to)!, sn = p.nodes.find((n) => n.id === from)!, tn = p.nodes.find((n) => n.id === to)!;
    if (!back.has(`${from}->${to}`) && col.get(to)! > col.get(from)!) {
      if (Math.abs(s.cy - t.cy) < 1) pts[id] = [[s.right, s.cy], [t.left, t.cy]];
      else {
        const mid1 = colCenter(col.get(from)!) + TASK_W / 2 + (COL_W - TASK_W) / 2;
        const mid2 = colCenter(col.get(to)!) - TASK_W / 2 - (COL_W - TASK_W) / 2;
        const useFirst = !hits(mid1, t.left, t.cy, [from, to]) || hits(s.right, mid2, s.cy, [from, to]);
        const mid = useFirst ? mid1 : mid2;
        pts[id] = [[s.right, s.cy], [mid, s.cy], [mid, t.cy], [t.left, t.cy]];
      }
    } else {
      // loop back: run along the margin of the target's lane
      const si = laneIdx.get(sn.lane)!, ti = laneIdx.get(tn.lane)!;
      if (si <= ti) {
        const yy = (row.get(to) ?? 0) === 1 ? laneBottom(tn.lane) - 15 : laneTop[ti] + ROW0 + TASK_H / 2 + 17;
        pts[id] = [[s.cx, s.bottom], [s.cx, yy], [t.cx, yy], [t.cx, t.bottom]];
      } else {
        const yy = laneTop[ti] + 15;
        pts[id] = [[s.cx, s.top], [s.cx, yy], [t.cx, yy], [t.cx, t.top]];
      }
    }
  }
  for (const n of p.nodes) for (const b of n.boundaries ?? []) {
    const id = `Flow_${b.id}_${b.to}`;
    edges.push({ id, from: b.id, to: b.to });
    const bb = bBoxes.get(b.id)!, t = boxes.get(b.to)!;
    const y1 = bb.bottom + 10;
    if (col.get(b.to)! > col.get(n.id)!) {
      const mid = colCenter(col.get(n.id)!) + TASK_W / 2 + (COL_W - TASK_W) / 2;
      pts[id] = Math.abs(t.cy - y1) < 1 ? [[bb.cx, bb.bottom], [bb.cx, t.cy], [t.left, t.cy]] : [[bb.cx, bb.bottom], [bb.cx, y1], [mid, y1], [mid, t.cy], [t.left, t.cy]];
    } else {
      pts[id] = t.cy < y1 ? [[bb.cx, bb.bottom], [bb.cx, y1], [t.cx, y1], [t.cx, t.bottom]] : [[bb.cx, bb.bottom], [bb.cx, y1], [t.cx, y1], [t.cx, t.top]];
    }
  }

  // ── XML ──────────────────────────────────────────────────────────────────
  const procId = p.key;
  const laneId = (l: string) => `Lane_${slug(l)}`;
  const inc = (id: string) => edges.filter((e) => e.to === id).map((e) => `      <bpmn:incoming>${e.id}</bpmn:incoming>`).join('\n');
  const out = (id: string) => edges.filter((e) => e.from === id).map((e) => `      <bpmn:outgoing>${e.id}</bpmn:outgoing>`).join('\n');
  const io = (id: string) => [inc(id), out(id)].filter(Boolean).join('\n');
  const errors: string[] = [], messages: string[] = [];
  const nodeXml: string[] = [];
  for (const n of p.nodes) {
    const role = p.laneRoles[n.lane];
    switch (n.type) {
      case 'start': nodeXml.push(`    <bpmn:startEvent id="${n.id}" name="${esc(n.name)}">\n${io(n.id)}\n    </bpmn:startEvent>`); break;
      case 'end': nodeXml.push(`    <bpmn:endEvent id="${n.id}" name="${esc(n.name)}">\n${io(n.id)}\n    </bpmn:endEvent>`); break;
      case 'userTask':
        nodeXml.push(`    <bpmn:userTask id="${n.id}" name="${esc(n.name)}">
      <bpmn:extensionElements>
        <zeebe:userTask />
        <zeebe:formDefinition formKey="${n.formKey}" />
        <zeebe:assignmentDefinition candidateGroups="${esc(role)}" />
        <zeebe:taskSchedule dueDate="=now() + duration(&#34;${isoDuration(n.hours)}&#34;)" />
      </bpmn:extensionElements>
${io(n.id)}
    </bpmn:userTask>`); break;
      case 'serviceTask':
        nodeXml.push(`    <bpmn:serviceTask id="${n.id}" name="${esc(n.name)}">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="${n.taskType}" retries="3" />
      </bpmn:extensionElements>
${io(n.id)}
    </bpmn:serviceTask>`); break;
      case 'businessRuleTask':
        nodeXml.push(`    <bpmn:businessRuleTask id="${n.id}" name="${esc(n.name)}">
      <bpmn:extensionElements>
        <zeebe:calledDecision decisionId="${n.decisionId}" resultVariable="${n.resultVariable}" />
      </bpmn:extensionElements>
${io(n.id)}
    </bpmn:businessRuleTask>`); break;
      case 'exclusiveGateway': {
        const def = n.defaultTo ? ` default="Flow_${n.id}_${n.defaultTo}"` : '';
        nodeXml.push(`    <bpmn:exclusiveGateway id="${n.id}" name="${esc(n.name)}"${def}>\n${io(n.id)}\n    </bpmn:exclusiveGateway>`); break;
      }
      case 'parallelGateway': nodeXml.push(`    <bpmn:parallelGateway id="${n.id}" name="${esc(n.name)}">\n${io(n.id)}\n    </bpmn:parallelGateway>`); break;
      case 'timerCatch':
        nodeXml.push(`    <bpmn:intermediateCatchEvent id="${n.id}" name="${esc(n.name)}">
${io(n.id)}
      <bpmn:timerEventDefinition id="TimerDef_${n.id}">
        <bpmn:timeDuration xsi:type="bpmn:tFormalExpression">${n.timer}</bpmn:timeDuration>
      </bpmn:timerEventDefinition>
    </bpmn:intermediateCatchEvent>`); break;
      case 'messageCatch':
        messages.push(`  <bpmn:message id="Message_${n.id}" name="${esc(n.timer ?? n.id)}" />`);
        nodeXml.push(`    <bpmn:intermediateCatchEvent id="${n.id}" name="${esc(n.name)}">
${io(n.id)}
      <bpmn:messageEventDefinition id="MsgDef_${n.id}" messageRef="Message_${n.id}" />
    </bpmn:intermediateCatchEvent>`); break;
    }
    for (const b of n.boundaries ?? []) {
      const cancel = b.nonInterrupting ? ' cancelActivity="false"' : '';
      let def = '';
      if (b.kind === 'timer') def = `      <bpmn:timerEventDefinition id="TimerDef_${b.id}">\n        <bpmn:timeDuration xsi:type="bpmn:tFormalExpression">${b.ref}</bpmn:timeDuration>\n      </bpmn:timerEventDefinition>`;
      if (b.kind === 'error') { errors.push(`  <bpmn:error id="Error_${b.id}" name="${esc(b.name)}" errorCode="${b.ref}" />`); def = `      <bpmn:errorEventDefinition id="ErrDef_${b.id}" errorRef="Error_${b.id}" />`; }
      if (b.kind === 'message') {
        messages.push(`  <bpmn:message id="Message_${b.id}" name="${esc(b.ref)}">\n    <bpmn:extensionElements>\n      <zeebe:subscription correlationKey="=businessKey" />\n    </bpmn:extensionElements>\n  </bpmn:message>`);
        def = `      <bpmn:messageEventDefinition id="MsgDef_${b.id}" messageRef="Message_${b.id}" />`;
      }
      nodeXml.push(`    <bpmn:boundaryEvent id="${b.id}" name="${esc(b.name)}" attachedToRef="${n.id}"${cancel}>\n${out(b.id)}\n${def}\n    </bpmn:boundaryEvent>`);
    }
  }
  const flowXml = edges.map((e) => e.cond
    ? `    <bpmn:sequenceFlow id="${e.id}" name="${esc(e.name ?? '')}" sourceRef="${e.from}" targetRef="${e.to}">\n      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${esc(e.cond)}</bpmn:conditionExpression>\n    </bpmn:sequenceFlow>`
    : `    <bpmn:sequenceFlow id="${e.id}"${e.name ? ` name="${esc(e.name)}"` : ''} sourceRef="${e.from}" targetRef="${e.to}" />`);
  const laneXml = p.lanes.map((l) => {
    const refs = p.nodes.filter((n) => n.lane === l).flatMap((n) => [n.id, ...(n.boundaries ?? []).map((b) => b.id)]);
    return `      <bpmn:lane id="${laneId(l)}" name="${esc(l)}">\n${refs.map((r) => `        <bpmn:flowNodeRef>${r}</bpmn:flowNodeRef>`).join('\n')}\n      </bpmn:lane>`;
  }).join('\n');

  const shape = (id: string, b: Box, extra = '') => `      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"${extra}>\n        <dc:Bounds x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" />\n      </bpmndi:BPMNShape>`;
  const di: string[] = [];
  di.push(`      <bpmndi:BPMNShape id="Participant_${slug(p.key)}_di" bpmnElement="Participant_${slug(p.key)}" isHorizontal="true">\n        <dc:Bounds x="160" y="${LANE_Y}" width="${partW}" height="${totalH}" />\n      </bpmndi:BPMNShape>`);
  p.lanes.forEach((l, i) => di.push(`      <bpmndi:BPMNShape id="${laneId(l)}_di" bpmnElement="${laneId(l)}" isHorizontal="true">\n        <dc:Bounds x="${160 + LANE_HEAD}" y="${laneTop[i]}" width="${partW - LANE_HEAD}" height="${LANE_H[laneRows[i]]}" />\n      </bpmndi:BPMNShape>`));
  for (const n of p.nodes) {
    di.push(shape(n.id, boxes.get(n.id)!));
    for (const b of n.boundaries ?? []) di.push(shape(b.id, bBoxes.get(b.id)!));
  }
  for (const e of edges) di.push(`      <bpmndi:BPMNEdge id="${e.id}_di" bpmnElement="${e.id}">\n${pts[e.id].map(([x, yy]) => `        <di:waypoint x="${x}" y="${yy}" />`).join('\n')}\n      </bpmndi:BPMNEdge>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_${slug(p.key)}" targetNamespace="http://dcos.example.com/workorders" exporter="DCOS process generator" exporterVersion="1.0" modeler:executionPlatform="Camunda Cloud" modeler:executionPlatformVersion="8.6.0">
  <bpmn:collaboration id="Collaboration_${slug(p.key)}">
    <bpmn:participant id="Participant_${slug(p.key)}" name="${esc(`${p.pid} · ${p.name}`)}" processRef="${procId}" />
  </bpmn:collaboration>
  <bpmn:process id="${procId}" name="${esc(p.name)}" isExecutable="true">
    <bpmn:documentation>${esc(p.description)}</bpmn:documentation>
    <bpmn:extensionElements>
      <zeebe:versionTag value="v1" />
    </bpmn:extensionElements>
    <bpmn:laneSet id="LaneSet_${slug(p.key)}">
${laneXml}
    </bpmn:laneSet>
${nodeXml.join('\n')}
${flowXml.join('\n')}
  </bpmn:process>
${[...errors, ...messages].join('\n')}
  <bpmndi:BPMNDiagram id="BPMNDiagram_${slug(p.key)}">
    <bpmndi:BPMNPlane id="BPMNPlane_${slug(p.key)}" bpmnElement="Collaboration_${slug(p.key)}">
${di.join('\n')}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../bpmn');
mkdirSync(outDir, { recursive: true });
for (const p of PROCESSES) {
  writeFileSync(resolve(outDir, `${p.key}.bpmn`), generate(p));
  console.log(`wrote ${p.key}.bpmn (${p.nodes.length} nodes, ${p.flows.length} flows)`);
}
