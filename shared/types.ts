// Modelo de datos compartido entre la app web y el Worker.
// Una RCA genera un Proyecto; cada obligación de la RCA es un Compromiso;
// cada fecha concreta en que un compromiso debe cumplirse es una Ocurrencia.

export type FrequencyKind =
  | 'weekly'      // registros diarios/semanales: se respaldan una vez por semana
  | 'monthly'
  | 'bimonthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual'
  | 'once'        // una sola vez, en una fecha
  | 'event'       // solo si ocurre algo (contingencia, hallazgo, cambio de titular)
  | 'continuous'; // condición permanente: no tiene fecha, se respeta siempre

export interface Frequency {
  kind: FrequencyKind;
  /** Día del mes en que vence (1-31). Si el mes es más corto, se usa el último día. Por defecto: último día del período. */
  dueDay?: number;
  /** Mes (1-12) de vencimiento para anuales, o primer mes del ciclo para semestrales/trimestrales. */
  dueMonth?: number;
  /** Meses de desfase: el reporte de un período vence N meses después (ej. reporte del mes anterior). */
  lagMonths?: number;
  /** Para 'once': fecha ISO de vencimiento. */
  date?: string;
  /** Para 'event': plazo en horas desde que ocurre el evento. */
  hoursAfterEvent?: number;
  /** Para 'weekly': día de la semana (0=domingo … 6=sábado). Por defecto domingo. */
  weekday?: number;
}

export type Component =
  | 'Aire' | 'Agua' | 'Ruido' | 'Residuos' | 'Suelo y cauce' | 'Olores'
  | 'Biodiversidad' | 'Patrimonio' | 'Administrativo' | 'Ventanilla Única';

export type Recipient = 'SMA' | 'DOH' | 'SEA' | 'SEREMI de Salud' | 'Ventanilla Única' | 'CMN' | 'Interno';

export interface Obligation {
  id: string;
  projectId: string;
  title: string;
  /** Explicación en lenguaje simple de qué hay que hacer. */
  plain: string;
  component: Component;
  recipient: Recipient;
  frequency: Frequency;
  /** Texto literal de la RCA. Vacío si no se pudo citar textual. */
  quote?: string;
  /** Sección o considerando donde aparece. */
  section?: string;
  /** Qué sirve como prueba de cumplimiento. */
  evidence: string;
  /** Parámetros o detalles técnicos (ej. pH, DBO5). */
  details?: string[];
  responsible?: string;
  /** false = extraído automáticamente y aún no revisado por una persona. */
  confirmed: boolean;
  /** Origen: la RCA o una obligación general de la Ventanilla Única. */
  source: 'rca' | 'ventanilla';
  /** Solo en una lectura sin guardar: qué aplicó Vigía de lo aprendido en revisiones anteriores. */
  learned?: 'removed' | 'edited' | 'added';
}

export interface Project {
  id: string;
  name: string;
  shortName: string;
  titular: string;
  rubro: 'Áridos' | 'Vitivinícola' | 'Agroindustria' | 'Plantel' | 'Industria' | 'Otro';
  comuna: string;
  region: string;
  instrument: 'DIA' | 'EIA';
  rcaLabel: string;
  sourceUrl: string;
  phase: 'Construcción' | 'Operación' | 'Cierre';
  operationStart?: string;
  operationEnd?: string;
  /** Primera fecha desde la que se generan ocurrencias. */
  trackingStart: string;
}

export interface Completion {
  obligationId: string;
  /** Fecha de vencimiento (ISO yyyy-mm-dd) de la ocurrencia cumplida. */
  due: string;
  completedAt: string;
  by: string;
  note?: string;
  evidence: EvidenceRef[];
}

export interface EvidenceRef {
  id: string;
  name: string;
  kind: 'pdf' | 'image' | 'other';
  size?: number;
  /** URL de descarga (backend) o data URL (demo). */
  url?: string;
}

export interface EventLog {
  id: string;
  obligationId: string;
  occurredAt: string; // ISO datetime
  note?: string;
}

export type OccurrenceStatus = 'done' | 'overdue' | 'today' | 'soon' | 'upcoming';

export interface Occurrence {
  key: string; // `${obligationId}|${due}`
  obligation: Obligation;
  project: Project;
  due: string;
  status: OccurrenceStatus;
  daysLeft: number;
  completion?: Completion;
  /** Para eventos: cuándo ocurrió. */
  eventAt?: string;
}

export type DocumentKind = 'rca' | 'resolucion' | 'programa' | 'informe' | 'otro';

export const DOCUMENT_KINDS: { kind: DocumentKind; label: string; readable: boolean }[] = [
  { kind: 'rca', label: 'RCA o DIA aprobada', readable: true },
  { kind: 'resolucion', label: 'Resolución, adenda o pertinencia', readable: true },
  { kind: 'programa', label: 'Programa de cumplimiento (SMA)', readable: true },
  { kind: 'informe', label: 'Informe o monitoreo', readable: false },
  { kind: 'otro', label: 'Otro documento', readable: false },
];

/** Documento guardado en un proyecto. Los de tipo "readable" se pueden leer para sacar compromisos. */
export interface DocumentRef {
  id: string;
  projectId: string;
  kind: DocumentKind;
  name: string;
  size: number;
  uploadedBy: string;
  createdAt: string;
  /** Cuándo se leyeron sus compromisos (si se hizo). */
  readAt?: string;
  url?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  you?: boolean;
}
