import { cloneElement, isValidElement, useId, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Steps, Row, Col, Typography, Input, InputNumber, Select, Space, Radio, Divider, message } from 'antd';
import { ArrowLeft, ArrowRight, CircleCheck } from 'lucide-react';
import { OpsPage } from '../../../shared/components/ops/OpsPage';
import { Btn, Chip, Panel } from '../../../ops/ui/kit';
import { StatGrid, StatTile } from '../../../ops/ui/Analytics';
import type { Tone } from '../../../ops/lib/tone';

import {
  ClusterOutlined, BuildOutlined, EnvironmentOutlined, TableOutlined,
  ImportOutlined, CheckCircleOutlined,
} from '../../../shared/icons';
import { useEntityList } from '../../../shared/hooks/useEntityCRUD';
import { useRecordAudit } from '../../../shared/hooks/useAudit';
import { DC_TIERS, FACILITY_STATUS, DC_SEGMENT, type DcTypeKey } from '../../../mock/data/enums';
import { DC_TYPES_BY_SEGMENT, dcTypeProfile, dcTypeDefaults, fmtRange, fmtPowerRange, coverageChipColor } from '../../../mock/data/dcTypes';
import type { Region, Campus } from '../../../mock/data/types';
import { BuildingStep } from '../components/BuildingStep';
import { InventoryImport } from '../components/InventoryImport';
import { commitOnboarding, type OnboardingDraft, type Scenario, type BuildingDraft, type RackImportRow } from '../lib/commit';

const { Text, Paragraph } = Typography;
const NEW_CAMPUS = '__new__';
const COVERAGE_TONE: Record<string, Tone> = { success: 'success', blue: 'info', warning: 'warning', error: 'error' };

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const recordAudit = useRecordAudit();

  const regions = (useEntityList('regions', { pageSize: 100 }).data?.data ?? []) as unknown as Region[];
  const campuses = (useEntityList('campuses', { pageSize: 200 }).data?.data ?? []) as unknown as Campus[];

  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [step, setStep] = useState(0);

  // DC details
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [regionId, setRegionId] = useState<string>('');
  const [campusId, setCampusId] = useState<string>('');
  const [newCampusName, setNewCampusName] = useState('');
  const [newCampusCity, setNewCampusCity] = useState('');
  const [dcTypeKey, setDcTypeKey] = useState<DcTypeKey | undefined>(undefined);
  const dcType = dcTypeProfile(dcTypeKey);
  const [tier, setTier] = useState<string>('Tier III');
  const [designPowerKw, setDesignPowerKw] = useState<number>(6000);
  const [lat, setLat] = useState<number>(37.77);
  const [lng, setLng] = useState<number>(-122.42);
  const [status, setStatus] = useState<string>('Operational');

  // Layout + inventory
  const [buildings, setBuildings] = useState<BuildingDraft[]>([
    { id: 'b-1', name: 'Building A', floors: [{ id: 'f-1', name: 'Floor 1', level: 1, halls: [] }] },
  ]);
  const [inventory, setInventory] = useState<RackImportRow[]>([]);
  const allFloors = useMemo(() => buildings.flatMap((b) => b.floors), [buildings]);
  const allHalls = useMemo(() => allFloors.flatMap((f) => f.halls), [allFloors]);

  const campusOptions = useMemo(
    () => campuses.filter((c) => c.regionId === regionId).map((c) => ({ value: c.id, label: `${c.name} · ${c.city}` })),
    [campuses, regionId],
  );

  function onName(v: string) {
    setName(v);
    if (!codeTouched) {
      const slug = v.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
      setCode(slug ? `${slug}-DC1` : '');
    }
  }
  /** Picking a type pre-fills tier and design power from its typical envelope; both stay editable. */
  function onDcType(k?: DcTypeKey) {
    setDcTypeKey(k);
    if (!k) return;
    const d = dcTypeDefaults(k);
    setTier(d.tier);
    setDesignPowerKw(d.designPowerKw);
  }
  function onScenario(s: Scenario) {
    setScenario(s);
    setStatus(s === 'greenfield' ? 'Construction' : 'Operational');
  }
  function onCampus(v: string) {
    setCampusId(v);
    if (v !== NEW_CAMPUS) {
      const c = campuses.find((x) => x.id === v);
      if (c) { setLat(c.latitude); setLng(c.longitude); }
    }
  }

  // ── Dynamic step list ──
  const stepDefs = useMemo(() => {
    const base = [
      { key: 'scenario', title: 'Scenario', icon: <ClusterOutlined /> },
      { key: 'details', title: 'Data center', icon: <BuildOutlined /> },
      { key: 'layout', title: 'Floor plan', icon: <TableOutlined /> },
    ];
    if (scenario === 'existing') base.push({ key: 'inventory', title: 'Inventory', icon: <ImportOutlined /> });
    base.push({ key: 'review', title: 'Review', icon: <CheckCircleOutlined /> });
    return base;
  }, [scenario]);

  const curKey = stepDefs[step]?.key ?? 'scenario';

  // ── Per-step validity ──
  const campusValid = campusId === NEW_CAMPUS ? !!newCampusName.trim() : !!campusId;
  const detailsValid = !!name.trim() && !!code.trim() && !!regionId && campusValid && !!tier && designPowerKw > 0
    && Number.isFinite(lat) && Number.isFinite(lng);
  const canNext = (() => {
    if (curKey === 'scenario') return !!scenario;
    if (curKey === 'details') return detailsValid;
    if (curKey === 'layout') return allHalls.length > 0;
    return true;
  })();

  function commit() {
    const draft: OnboardingDraft = {
      scenario: scenario!,
      dc: {
        name: name.trim(), code: code.trim(), regionId,
        campusId: campusId === NEW_CAMPUS ? undefined : campusId,
        newCampusName: campusId === NEW_CAMPUS ? newCampusName.trim() : undefined,
        newCampusCity: campusId === NEW_CAMPUS ? newCampusCity.trim() : undefined,
        dcTypeKey,
        tier: tier as OnboardingDraft['dc']['tier'],
        designPowerKw, latitude: lat, longitude: lng,
        status: status as OnboardingDraft['dc']['status'],
      },
      buildings, inventory,
    };
    const res = commitOnboarding(draft);
    recordAudit('DataCenter', res.dcId, 'onboarded', `Onboarded ${name.trim()}${dcType ? ` as ${dcType.name}` : ''} — ${res.buildings} buildings, ${res.floors} floors, ${res.halls} halls, ${res.racks} racks${dcType ? `, plant: ${res.plant.feeds} feeds / ${res.plant.backup} ${dcType.dcPowerPlant ? 'DC plants' : 'UPS'} / ${res.plant.distribution} ${dcType.dcPowerPlant ? 'BDFBs' : 'PDUs'} / ${res.plant.coolingZones} cooling zones` : ''}`);
    ['dataCenters', 'campuses', 'buildings', 'floors', 'halls', 'rows', 'racks', 'utilityFeeds', 'transformers', 'upsUnits', 'pdus', 'coolingZones', 'cracUnits', 'computeResources'].forEach((e) => qc.invalidateQueries({ queryKey: [e] }));
    message.success(`${name.trim()} onboarded`);
    navigate(`/facility/dc/${res.dcId}`);
  }

  const totalCap = allHalls.reduce((s, h) => s + h.gridCols * h.gridRows, 0);
  const matchedRacks = (() => {
    const set = new Set(allHalls.map((h) => h.name.trim().toLowerCase()));
    return inventory.filter((r) => set.has((r.hall || '').trim().toLowerCase())).length;
  })();
  const projectedRacks = scenario === 'existing' ? Math.min(matchedRacks, totalCap) : totalCap;

  return (
    <OpsPage title="Onboard a data center" description="Register an existing site or design a new one — details, floor plan, inventory and review">
      <Panel>
        <Steps size="small" responsive={false} current={step} items={stepDefs.map((s) => ({ title: s.title, icon: s.icon }))} />
      </Panel>

      <Panel title={stepDefs[step]?.title} sub={`Step ${step + 1} of ${stepDefs.length}`}
        foot={<>
          <span className="row">
            <Btn variant="ghost" onClick={() => navigate('/facility')}>Cancel</Btn>
            <Btn icon={ArrowLeft} disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</Btn>
          </span>
          {curKey === 'review'
            ? <Btn variant="filled" icon={CircleCheck} onClick={commit}>Create data center</Btn>
            : <Btn variant="filled" iconRight={ArrowRight} disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next</Btn>}
        </>}>
      {/* ── Step: scenario ── */}
      {curKey === 'scenario' && (
        <Radio.Group value={scenario ?? undefined} onChange={(e) => onScenario(e.target.value)} style={{ width: '100%' }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <div role="button" tabIndex={0} onClick={() => onScenario('existing')} style={{ cursor: 'pointer', height: '100%' }}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onScenario('existing'); } }}>
              <Panel style={{ height: '100%', borderColor: scenario === 'existing' ? 'var(--primaryColor500)' : undefined, boxShadow: scenario === 'existing' ? '0 0 0 1px var(--primaryColor500)' : undefined }}>
                <Radio value="existing"><Text strong>Onboard an existing data center</Text></Radio>
                <Paragraph type="secondary" style={{ marginTop: "var(--vw-space-sm)", marginBottom: 0 }}>
                  The site is already live. Capture its layout from a floor plan, then import the rack inventory (CSV / CMDB export) to populate it.
                </Paragraph>
              </Panel>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div role="button" tabIndex={0} onClick={() => onScenario('greenfield')} style={{ cursor: 'pointer', height: '100%' }}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onScenario('greenfield'); } }}>
              <Panel style={{ height: '100%', borderColor: scenario === 'greenfield' ? 'var(--primaryColor500)' : undefined, boxShadow: scenario === 'greenfield' ? '0 0 0 1px var(--primaryColor500)' : undefined }}>
                <Radio value="greenfield"><Text strong>Design a new data center</Text></Radio>
                <Paragraph type="secondary" style={{ marginTop: "var(--vw-space-sm)", marginBottom: 0 }}>
                  Greenfield build. Lay out halls on the building plan; DCOS generates planned rack positions to design capacity against.
                </Paragraph>
              </Panel>
              </div>
            </Col>
          </Row>
        </Radio.Group>
      )}

      {/* ── Step: details ── */}
      {curKey === 'details' && (
        <div>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Field label="Data center name" required>
                <Input value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Frankfurt DC2" />
              </Field>
            </Col>
            <Col xs={24} md={12}>
              <Field label="Code" required>
                <Input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeTouched(true); }} placeholder="FRA-DC2" />
              </Field>
            </Col>
            <Col xs={24} md={12}>
              <Field label="Region" required>
                <Select value={regionId || undefined} onChange={(v) => { setRegionId(v); setCampusId(''); }} style={{ width: '100%' }}
                  placeholder="Select region" options={regions.map((r) => ({ value: r.id, label: r.name }))} />
              </Field>
            </Col>
            <Col xs={24} md={12}>
              <Field label="Campus" required>
                <Select value={campusId || undefined} onChange={onCampus} style={{ width: '100%' }} disabled={!regionId}
                  placeholder={regionId ? 'Select campus' : 'Pick a region first'}
                  options={[...campusOptions, { value: NEW_CAMPUS, label: '+ New campus' }]} />
              </Field>
            </Col>
            {campusId === NEW_CAMPUS && (
              <>
                <Col xs={24} md={12}>
                  <Field label="New campus name" required>
                    <Input value={newCampusName} onChange={(e) => setNewCampusName(e.target.value)} placeholder="e.g. Frankfurt Campus" />
                  </Field>
                </Col>
                <Col xs={24} md={12}>
                  <Field label="City">
                    <Input value={newCampusCity} onChange={(e) => setNewCampusCity(e.target.value)} placeholder="Frankfurt" />
                  </Field>
                </Col>
              </>
            )}
            <Col span={24}>
              <Field label="Data center type">
                <Select value={dcTypeKey} onChange={onDcType} allowClear showSearch optionFilterProp="label" style={{ width: '100%' }}
                  placeholder="Classify the facility — sets the tier and design power defaults"
                  options={DC_SEGMENT.map((seg) => ({ label: seg, options: DC_TYPES_BY_SEGMENT[seg].map((t) => ({ value: t.key, label: t.name })) }))} />
              </Field>
              {dcType && (
                <div style={{ marginTop: "var(--vw-space-sm)", display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <Chip tone={dcType.segment === 'Telco' ? 'purple' : 'info'}>{dcType.segment}</Chip>
                  <Chip tone="neutral">{fmtRange(dcType.typicalRacks)} racks</Chip>
                  <Chip tone="neutral">{fmtPowerRange(dcType.powerKw)}</Chip>
                  {dcType.kwPerRack && <Chip tone="neutral">{dcType.kwPerRack[0]}–{dcType.kwPerRack[1]} kW/rack</Chip>}
                  <Chip tone="neutral">{dcType.cooling}</Chip>
                  <Chip tone="neutral">{dcType.redundancy}</Chip>
                  <Chip tone={COVERAGE_TONE[coverageChipColor(dcType.coverage)] ?? 'neutral'} dot>DCOS: {dcType.coverage}</Chip>
                  <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)", width: '100%' }}>{dcType.description}</Text>
                </div>
              )}
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Field label="Tier">
                <Select placeholder="Select tier" value={tier} onChange={setTier} style={{ width: '100%' }} options={DC_TIERS.map((t) => ({ value: t, label: t }))} />
              </Field>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Field label="Status">
                <Select placeholder="Select status" value={status} onChange={setStatus} style={{ width: '100%' }} options={FACILITY_STATUS.map((s) => ({ value: s, label: s }))} />
              </Field>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Field label="Design power (kW)">
                <InputNumber placeholder="Enter design power (kW)" value={designPowerKw} onChange={(v) => setDesignPowerKw(Number(v) || 0)} min={100} step={500} style={{ width: '100%' }} />
              </Field>
            </Col>
            <Col xs={24} md={12}>
              <Field label="Latitude" required>
                <InputNumber placeholder="Enter latitude" value={lat} onChange={(v) => setLat(Number(v))} step={0.01} style={{ width: '100%' }} />
              </Field>
            </Col>
            <Col xs={24} md={12}>
              <Field label="Longitude" required>
                <InputNumber placeholder="Enter longitude" value={lng} onChange={(v) => setLng(Number(v))} step={0.01} style={{ width: '100%' }} />
              </Field>
            </Col>
          </Row>
          <Text type="secondary" style={{ fontSize: "var(--vw-font-label-sm)" }}><EnvironmentOutlined /> Latitude / longitude place the site marker on the geographic map.</Text>
        </div>
      )}

      {/* ── Step: layout ── */}
      {curKey === 'layout' && (
        <BuildingStep value={buildings} onChange={setBuildings} />
      )}

      {/* ── Step: inventory ── */}
      {curKey === 'inventory' && (
        <InventoryImport value={inventory} onChange={setInventory} halls={allHalls} />
      )}

      {/* ── Step: review ── */}
      {curKey === 'review' && (
        <div>
          <StatGrid cols={6}>
            <StatTile label="Scenario" value={scenario === 'existing' ? 'Existing' : 'Greenfield'} />
            <StatTile label="Buildings" value={buildings.length} />
            <StatTile label="Floors" value={allFloors.length} />
            <StatTile label="Halls" value={allHalls.length} />
            <StatTile label="Rack positions" value={totalCap.toLocaleString()} />
            <StatTile label={scenario === 'existing' ? 'Racks imported' : 'Planned racks'} value={projectedRacks.toLocaleString()} />
          </StatGrid>
          <Divider />
          <Space direction="vertical" size={4}>
            <Text><Text strong>{name}</Text> <Chip tone="neutral">{code}</Chip> {dcType && <Chip tone="info">{dcType.name}</Chip>} <Chip tone="neutral">{tier}</Chip> <Chip tone="neutral">{status}</Chip></Text>
            <Text type="secondary">Region: {regions.find((r) => r.id === regionId)?.name ?? '—'} · Campus: {campusId === NEW_CAMPUS ? `${newCampusName} (new)` : (campuses.find((c) => c.id === campusId)?.name ?? '—')}</Text>
            <Text type="secondary">Design power: {designPowerKw.toLocaleString()} kW · Location: {lat.toFixed(2)}, {lng.toFixed(2)}</Text>
            {buildings.map((b) => (
              <div key={b.id}>
                <Text strong style={{ fontSize: "var(--vw-font-label-md)" }}>{b.name}</Text>
                {b.floors.map((f) => (
                  <Text key={f.id} type="secondary" style={{ display: 'block', paddingLeft: "var(--vw-space-md)" }}>
                    {f.name}: {f.halls.map((h) => `${h.name} (${h.gridCols}×${h.gridRows})`).join(', ') || 'no halls'}
                  </Text>
                ))}
              </div>
            ))}
            {scenario === 'existing' && inventory.length > projectedRacks && (
              <Text type="warning">{inventory.length - projectedRacks} imported racks won't be placed (unmatched hall name or over capacity).</Text>
            )}
          </Space>
          <Paragraph type="secondary" style={{ marginTop: "var(--vw-space-md)", marginBottom: 0, fontSize: "var(--vw-font-label-sm)" }}>
            Committing writes the site to DCOS — it will appear on the map, in the hierarchy, the global DC filter and capacity rollups.
            {dcType && <> As a <strong>{dcType.name}</strong> it is scaffolded with {dcType.physical.redundancy !== 'N' ? 'A/B utility feeds' : 'a single utility feed'}, {dcType.dcPowerPlant ? '−48V DC plant with battery strings and BDFBs' : `${dcType.physical.redundancy} UPS and PDUs`}, and {dcType.physical.coolingZones} cooling zone{dcType.physical.coolingZones > 1 ? 's' : ''} of {dcType.physical.coolingUnits.join(' / ')} units; racks default to {dcType.physical.rackHeightU}U at ~{Math.round(((dcType.kwPerRack?.[0] ?? 8) + (dcType.kwPerRack?.[1] ?? 16)) / 2)} kW.</>}
          </Paragraph>
        </div>
      )}

      </Panel>
    </OpsPage>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  const id = useId();
  const control = isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string; 'aria-required'?: boolean }>, { id, 'aria-required': required }) : children;
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontSize: "var(--vw-font-label-sm)", color: "var(--vw-color-slate-500)", marginBottom: "var(--vw-space-xxs)" }}>{label}{required && <span style={{ color: 'var(--vw-color-red-600)' }}> *</span>}</label>
      {control}
    </div>
  );
}
