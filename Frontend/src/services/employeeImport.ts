import * as XLSX from 'xlsx'
import type { Employee } from '../domain/employees/employee'
import type { EmployeeRepository } from './storage'

export type EmployeeImportField = 'identityNumber' | 'fullName' | 'position' | 'location' | 'hireDate' | 'salary' | 'bankAccount'
export type EmployeeImportMapping = Record<EmployeeImportField, number | null>
export interface EmployeeImportProfile {
  id: string
  fields: Array<{ key: EmployeeImportField; label: string; aliases: string[]; required?: boolean }>
  normalizeIdentity: (value: string) => string
}
export interface EmployeeImportCell { value: unknown; formatted: string; type: string; isDate: boolean }
export interface EmployeeImportRow { rowNumber: number; cells: EmployeeImportCell[] }
export interface WorkbookSheet { name: string; rows: EmployeeImportRow[] }
export interface EmployeeImportSheet extends WorkbookSheet { headers: string[]; rows: EmployeeImportRow[]; mapping: EmployeeImportMapping }
export interface EmployeeImportPreviewRow {
  rowNumber: number
  identityNumber: string
  originalIdentity: string
  fullName: string
  position: string
  location: string
  hireDate: string
  monthlySalaryUsd: number | undefined
  bankAccountNumber: string | undefined
  issues: string[]
  duplicate: boolean
}

function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function readEmployeeWorkbook(data: ArrayBuffer): WorkbookSheet[] {
  if (data.byteLength === 0) throw new Error('El archivo Excel está vacío.')
  let workbook: XLSX.WorkBook
  try { workbook = XLSX.read(data, { type: 'array', cellDates: true, cellNF: true }) }
  catch { throw new Error('No se pudo leer el archivo. Comprueba que sea un Excel .xlsx válido y no esté protegido.') }
  if (!workbook.SheetNames.length) throw new Error('El archivo no contiene hojas de cálculo.')
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name]
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1')
    const rows: EmployeeImportRow[] = []
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      const cells: EmployeeImportCell[] = []
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })]
        const value = cell?.v ?? ''
        cells.push({ value, formatted: cell ? XLSX.utils.format_cell(cell) : '', type: cell?.t || 'z', isDate: cell?.t === 'd' || Boolean(cell?.z && XLSX.SSF.is_date(cell.z)) })
      }
      rows.push({ rowNumber: row + 1, cells })
    }
    return { name, rows }
  })
}

export function mapEmployeeImportSheet(sheet: WorkbookSheet, profile: EmployeeImportProfile): EmployeeImportSheet {
  const headerIndex = detectHeaderRow(sheet.rows, profile)
  const headerRow = sheet.rows[headerIndex]
  const headers = headerRow.cells.map(cell => cell.formatted)
  const mapping = emptyMapping()
  profile.fields.forEach(field => {
    const column = headers.findIndex(header => field.aliases.includes(normalizeHeader(header)) || field.aliases.some(alias => normalizeHeader(header).startsWith(`${alias} `)))
    if (column >= 0) mapping[field.key] = column
  })
  return { name: sheet.name, headers, mapping, rows: sheet.rows.slice(headerIndex + 1).filter(row => row.cells.some(cell => cell.formatted.trim() !== '')) }
}

function detectHeaderRow(rows: EmployeeImportRow[], profile: EmployeeImportProfile): number {
  let bestIndex = 0
  let bestScore = -1
  rows.slice(0, 25).forEach((row, index) => {
    const values = row.cells.map(cell => normalizeHeader(cell.formatted))
    const score = profile.fields.filter(field => field.aliases.some(alias => values.some(value => value === alias || value.startsWith(`${alias} `)))).length
    if (score > bestScore) { bestIndex = index; bestScore = score }
  })
  if (bestScore < 2) throw new Error('No se reconoció una fila de encabezados. Verifica la hoja seleccionada.')
  return bestIndex
}

function emptyMapping(): EmployeeImportMapping {
  return { identityNumber: null, fullName: null, position: null, location: null, hireDate: null, salary: null, bankAccount: null }
}

export function parseSpreadsheetDate(cell: EmployeeImportCell | undefined): { value: string; error?: string } {
  if (!cell || cell.formatted.trim() === '') return { value: '' }
  if (cell.isDate && cell.value instanceof Date) return { value: `${cell.value.getUTCFullYear()}-${pad(cell.value.getUTCMonth() + 1)}-${pad(cell.value.getUTCDate())}` }
  if (cell.isDate && typeof cell.value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(cell.value)
    if (parsed) return { value: `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}` }
  }
  const text = cell.formatted.trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const slash = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text)
  if (!slash) return { value: '', error: 'Fecha inválida o formato no reconocido.' }
  const first = Number(slash[1]); const second = Number(slash[2])
  if (first <= 12 && second <= 12 && first !== second) return { value: '', error: 'Fecha ambigua; corrígela en formato AAAA-MM-DD.' }
  const day = first > 12 ? first : second > 12 ? second : first
  const month = first > 12 ? second : second > 12 ? first : second
  let year = Number(slash[3])
  if (year < 100) year += year <= 69 ? 2000 : 1900
  return validDate(year, month, day)
}

function validDate(year: number, month: number, day: number): { value: string; error?: string } {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return { value: '', error: 'Fecha inválida.' }
  return { value: `${year}-${pad(month)}-${pad(day)}` }
}
function pad(value: number): string { return String(value).padStart(2, '0') }

export function parseSpreadsheetMoney(value: string): { value?: number; error?: string } {
  const trimmed = value.trim()
  if (!trimmed) return {}
  const cleaned = trimmed.replace(/[^\d,.-]/g, '')
  if (!cleaned || !/^-?\d[\d.,]*$/.test(cleaned)) return { error: 'El sueldo tiene un formato inválido.' }
  const negative = cleaned.startsWith('-')
  const unsigned = negative ? cleaned.slice(1) : cleaned
  const comma = unsigned.lastIndexOf(','); const dot = unsigned.lastIndexOf('.')
  let normalized = unsigned
  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? ',' : '.'
    const groupingSeparator = decimalSeparator === ',' ? '.' : ','
    const parts = unsigned.split(decimalSeparator)
    if (parts.length !== 2 || !/^\d{1,3}(?:[.,]\d{3})*$/.test(parts[0]) || !/^\d{1,2}$/.test(parts[1]) || parts[0].includes(decimalSeparator)) return { error: 'El sueldo tiene un formato inválido o ambiguo.' }
    normalized = `${parts[0].replaceAll(groupingSeparator, '')}.${parts[1]}`
  } else if (comma >= 0 || dot >= 0) {
    const separator = comma >= 0 ? ',' : '.'
    const parts = unsigned.split(separator)
    if (parts.length > 2) {
      if (!/^\d{1,3}(?:[.,]\d{3})+$/.test(unsigned)) return { error: 'El sueldo tiene un formato inválido o ambiguo.' }
      normalized = unsigned.replace(/[.,]/g, '')
    } else if (parts[1].length <= 2 && parts[1].length > 0) normalized = `${parts[0]}.${parts[1]}`
    else if (parts[1].length === 3) return { error: 'El sueldo es ambiguo; aclara los decimales en el archivo.' }
    else return { error: 'El sueldo tiene un formato inválido.' }
  }
  const result = Number(`${negative ? '-' : ''}${normalized}`)
  if (!Number.isFinite(result)) return { error: 'El sueldo debe ser un número finito.' }
  if (result < 0) return { error: 'El sueldo no puede ser negativo.' }
  return { value: result }
}

function readBankAccount(cell: EmployeeImportCell | undefined): { value?: string; error?: string } {
  if (!cell || cell.formatted.trim() === '') return {}
  if (typeof cell.value === 'string') {
    const account = cell.formatted.trim()
    if (/^\d+(?:\.\d+)?e\+?\d+$/i.test(account)) return { error: 'La cuenta aparece en notación científica; cambia esa celda a texto en Excel.' }
    return { value: account }
  }
  if (typeof cell.value === 'number') {
    if (!Number.isSafeInteger(cell.value) || cell.value < 0) return { error: 'Excel guardó la cuenta como un número que no puede preservarse con seguridad. Corrígela como texto.' }
    const formatted = cell.formatted.trim()
    if (/^0\d+$/.test(formatted)) return { value: formatted }
    return { value: String(cell.value) }
  }
  return { error: 'La cuenta bancaria tiene un formato no compatible; conviértela a texto.' }
}

export function previewEmployeeRows(sheet: EmployeeImportSheet, existing: readonly Employee[], companyId: string, profile: EmployeeImportProfile): { rows: EmployeeImportPreviewRow[]; ignoredEmpty: number; missingRequired: string[] } {
  const missingRequired = profile.fields.filter(field => field.required && sheet.mapping[field.key] === null).map(field => field.label)
  const fileSeen = new Set<string>()
  const companySeen = new Set(existing.filter(employee => employee.companyId === companyId).map(employee => profile.normalizeIdentity(employee.identityNumber)))
  let ignoredEmpty = 0
  const rows = sheet.rows.map(row => {
    const value = (field: EmployeeImportField) => {
      const column = sheet.mapping[field]
      return column === null ? undefined : row.cells[column]
    }
    if (profile.fields.every(field => !value(field.key)?.formatted.trim())) { ignoredEmpty += 1; return null }
    const originalIdentity = value('identityNumber')?.formatted.trim() || ''
    const identityNumber = profile.normalizeIdentity(originalIdentity)
    const fullName = value('fullName')?.formatted.trim() || ''
    const position = value('position')?.formatted.trim() || ''
    const location = value('location')?.formatted.trim() || ''
    const dateCell = value('hireDate')
    const date = parseSpreadsheetDate(dateCell)
    const salaryCell = value('salary')
    const salaryResult = salaryCell?.type === 'n' && typeof salaryCell.value === 'number'
      ? Number.isFinite(salaryCell.value) && salaryCell.value >= 0 ? { value: salaryCell.value } : { error: 'El sueldo debe ser un número finito y no negativo.' }
      : parseSpreadsheetMoney(salaryCell?.formatted || '')
    const bankAccountResult = readBankAccount(value('bankAccount'))
    const issues: string[] = []
    if (missingRequired.includes('Identificación')) issues.push('Falta mapear la columna de identificación.')
    else if (!identityNumber) issues.push('La identificación es obligatoria.')
    if (missingRequired.includes('Nombre completo')) issues.push('Falta mapear la columna de nombre completo.')
    else if (!fullName) issues.push('El nombre completo es obligatorio.')
    const duplicate = Boolean(identityNumber && (fileSeen.has(identityNumber) || companySeen.has(identityNumber)))
    if (duplicate) issues.push('Identificación duplicada en el archivo o en esta empresa.')
    if (dateCell?.formatted.trim() && date.error) issues.push(date.error)
    if (salaryResult.error) issues.push(salaryResult.error)
    if (bankAccountResult.error) issues.push(bankAccountResult.error)
    if (identityNumber) fileSeen.add(identityNumber)
    return { rowNumber: row.rowNumber, identityNumber, originalIdentity, fullName, position, location, hireDate: date.value, monthlySalaryUsd: salaryResult.value, bankAccountNumber: bankAccountResult.value, issues, duplicate }
  }).filter((row): row is EmployeeImportPreviewRow => row !== null)
  return { rows, ignoredEmpty, missingRequired }
}

export class EmployeeSpreadsheetImportService {
  constructor(repository: EmployeeRepository, profile: EmployeeImportProfile, now: () => Date = () => new Date(), createId: () => string = () => `employee-${crypto.randomUUID()}`) {
    this.repository = repository; this.profile = profile; this.now = now; this.createId = createId
  }
  private readonly repository: EmployeeRepository
  private readonly profile: EmployeeImportProfile
  private readonly now: () => Date
  private readonly createId: () => string

  import(companyId: string, rows: readonly EmployeeImportPreviewRow[]): number {
    if (!companyId.trim()) throw new Error('Selecciona una empresa antes de importar.')
    const valid = rows.filter(row => !row.issues.length)
    if (!valid.length) throw new Error('No hay filas válidas para importar.')
    const existing = this.repository.list()
    const seen = new Set(existing.filter(employee => employee.companyId === companyId).map(employee => this.profile.normalizeIdentity(employee.identityNumber)))
    const timestamp = this.now().toISOString()
    const newEmployees: Employee[] = []
    for (const row of valid) {
      if (row.monthlySalaryUsd !== undefined && (!Number.isFinite(row.monthlySalaryUsd) || row.monthlySalaryUsd < 0)) {
        throw new Error(`El sueldo de la fila ${row.rowNumber} debe ser un importe finito y no negativo.`)
      }
      const normalized = this.profile.normalizeIdentity(row.identityNumber)
      if (!normalized || seen.has(normalized)) throw new Error(`La identificación de la fila ${row.rowNumber} ya existe en esta empresa. Actualiza la previsualización antes de importar.`)
      seen.add(normalized)
      newEmployees.push({
        id: this.createId(), companyId, identityNumber: row.identityNumber.trim(),
        firstName: row.fullName.trim(), lastName: '', fullName: row.fullName.trim(), position: row.position.trim(),
        location: row.location.trim() || undefined, hireDate: row.hireDate, monthlySalaryUsd: row.monthlySalaryUsd,
        bankAccountNumber: row.bankAccountNumber, status: 'Activo', createdAt: timestamp, updatedAt: timestamp,
      })
    }
    this.repository.saveAll([...existing, ...newEmployees])
    return newEmployees.length
  }
}
