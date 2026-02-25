import * as ExcelJS from 'exceljs';
import { MemberStatus } from '../../users/entities/user.entity';

/** Required columns in the Excel file (case-insensitive header matching) */
export const REQUIRED_COLUMNS = ['memberNumber', 'firstName', 'lastName', 'action'] as const;

export type RowAction = 'UPSERT' | 'DELETE';

/** A parsed, strongly-typed representation of a single Excel row */
export interface ParsedRow {
  rowNumber: number;
  memberNumber: string;
  dni?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  plan?: string;
  planExpiresAt?: Date;
  status?: MemberStatus;
  action: RowAction;
}

export interface RowError {
  rowNumber: number;
  messages: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  rowErrors: RowError[];
}

// ── Column name normalisation ─────────────────────────────────────────────────
function normaliseKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'text' in (v as any)) return String((v as any).text).trim();
  return String(v).trim();
}

// ── Main parser ───────────────────────────────────────────────────────────────
export async function parseImportExcel(filePath: string): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('El archivo no contiene hojas');

  // Map header column names → column index (1-based)
  const headerRow = sheet.getRow(1);
  const colMap = new Map<string, number>();

  headerRow.eachCell((cell, colNumber) => {
    if (cellStr(cell)) colMap.set(normaliseKey(cellStr(cell)), colNumber);
  });

  // Validate required headers
  const missingHeaders = REQUIRED_COLUMNS.filter((col) => !colMap.has(normaliseKey(col)));
  if (missingHeaders.length) {
    throw new Error(`Faltan columnas requeridas: ${missingHeaders.join(', ')}`);
  }

  const col = (name: string) => colMap.get(normaliseKey(name));
  const rows: ParsedRow[] = [];
  const rowErrors: RowError[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const getCellStr = (name: string) => {
      const idx = col(name);
      return idx ? cellStr(row.getCell(idx)) : '';
    };

    const errors: string[] = [];
    const memberNumber = getCellStr('memberNumber');
    const actionRaw = getCellStr('action').toUpperCase();
    const firstName = getCellStr('firstName');
    const lastName = getCellStr('lastName');
    const statusRaw = getCellStr('status').toUpperCase();
    const planExpiresAtRaw = getCellStr('planExpiresAt');

    // ── Validation ────────────────────────────────────────────────────────
    if (!memberNumber) errors.push('memberNumber es obligatorio');
    if (!actionRaw || !['UPSERT', 'DELETE'].includes(actionRaw)) {
      errors.push(`action debe ser UPSERT o DELETE (valor recibido: "${actionRaw}")`);
    }
    if (actionRaw === 'UPSERT') {
      if (!firstName) errors.push('firstName es obligatorio para UPSERT');
      if (!lastName) errors.push('lastName es obligatorio para UPSERT');
    }
    if (statusRaw && !['ACTIVE', 'INACTIVE', ''].includes(statusRaw)) {
      errors.push(`status debe ser ACTIVE o INACTIVE (valor recibido: "${statusRaw}")`);
    }

    let planExpiresAt: Date | undefined;
    if (planExpiresAtRaw) {
      const d = new Date(planExpiresAtRaw);
      if (isNaN(d.getTime())) {
        errors.push(`planExpiresAt "${planExpiresAtRaw}" no es una fecha válida (usa YYYY-MM-DD)`);
      } else {
        planExpiresAt = d;
      }
    }

    if (errors.length) {
      rowErrors.push({ rowNumber, messages: errors });
      return;
    }

    rows.push({
      rowNumber,
      memberNumber,
      dni: getCellStr('dni') || undefined,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      phone: getCellStr('phone') || undefined,
      plan: getCellStr('plan') || undefined,
      planExpiresAt,
      status: (statusRaw as MemberStatus) || MemberStatus.ACTIVE,
      action: actionRaw as RowAction,
    });
  });

  return { rows, rowErrors };
}
