import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import type { Company } from '../src/domain/company'
import type { Employee } from '../src/domain/employees/employee'
import { EmployeeSpreadsheetImportService, mapEmployeeImportSheet, parseSpreadsheetDate, parseSpreadsheetMoney, previewEmployeeRows, readEmployeeWorkbook } from '../src/services/employeeImport'
import { EMPLOYEE_ROSTER_IMPORT_PROFILE, normalizePunctuatedIdentity } from '../src/services/employeeImportProfile'
import { LocalEmployeeRepository, type EmployeeRepository, type KeyValueStorage } from '../src/services/storage'

const profile = EMPLOYEE_ROSTER_IMPORT_PROFILE
const firstCompany: Company = { id: 'company-one', legalName: 'OMIRA Consultores, C.A.', taxId: 'J-101', tradeName: 'OMIRA Consultores', contactName: '', email: '', phone: '', status: 'Activa', createdAt: '2026-01-01T00:00:00.000Z' }
const secondCompany: Company = { id: 'company-two', legalName: 'Servicios Delta, C.A.', taxId: 'J-202', tradeName: 'Servicios Delta', contactName: '', email: '', phone: '', status: 'Activa', createdAt: '2026-01-01T00:00:00.000Z' }

class MemoryEmployees implements EmployeeRepository {
  items: Employee[] = []
  list(): Employee[] { return [...this.items] }
  saveAll(items: readonly Employee[]): void { this.items = [...items] }
}

function workbook(rows: unknown[][]): ArrayBuffer {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Personal')
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

function importSheet(rows: unknown[][]) {
  const [sheet] = readEmployeeWorkbook(workbook(rows)).map(item => mapEmployeeImportSheet(item, profile))
  return sheet
}

const sourceRows = [
  ['N° CÉDULA', 'TRABAJADOR', 'CARGO', 'UBC', 'FECHA DE INGRESO', 'SUELDO EN USD', 'CUENTA BANCARIA'],
  ['12.345.678', 'Nombre Apellido Completo', 'Operador', 'Producción', '2024-03-15', '$1,250.50', '001234567890'],
]

describe('importación de empleados desde hojas de cálculo', () => {
  it('mapea encabezados configurados y conserva identificación y nombre completo', () => {
    const sheet = importSheet(sourceRows)
    expect(sheet.mapping.identityNumber).not.toBeNull()
    expect(sheet.mapping.fullName).not.toBeNull()
    const preview = previewEmployeeRows(sheet, [], firstCompany.id, profile)
    expect(preview.rows[0]).toMatchObject({ identityNumber: '12345678', originalIdentity: '12.345.678', fullName: 'Nombre Apellido Completo', position: 'Operador', location: 'Producción', hireDate: '2024-03-15' })
    expect(normalizePunctuatedIdentity(preview.rows[0].identityNumber)).toBe('12345678')
  })

  it('interpreta y persiste sueldo y cuenta bancaria como campos propios', () => {
    const sheet = importSheet(sourceRows)
    const preview = previewEmployeeRows(sheet, [], firstCompany.id, profile)
    expect(preview.rows[0].monthlySalaryUsd).toBe(1250.5)
    expect(preview.rows[0].bankAccountNumber).toBe('001234567890')
    expect(sheet.rows[0].cells[sheet.mapping.bankAccount!].formatted).toBe('001234567890')
    const values = new Map<string, string>()
    const storage: KeyValueStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
    const repository = new LocalEmployeeRepository(storage)
    new EmployeeSpreadsheetImportService(repository, profile, () => new Date('2026-10-26T12:00:00Z'), () => 'employee-1').import(firstCompany.id, preview.rows)
    expect(repository.list()[0]).toMatchObject({ companyId: firstCompany.id, identityNumber: '12345678', fullName: 'Nombre Apellido Completo', location: 'Producción', monthlySalaryUsd: 1250.5, bankAccountNumber: '001234567890' })
  })

  it('permite empresas con nombres diferentes y guarda cada importación solo en su empresa destino', () => {
    const sheet = importSheet(sourceRows)
    const firstPreview = previewEmployeeRows(sheet, [], firstCompany.id, profile).rows
    const repository = new MemoryEmployees()
    const service = new EmployeeSpreadsheetImportService(repository, profile, () => new Date('2026-10-26T12:00:00Z'), (() => { let id = 0; return () => `employee-${++id}` })())
    expect(service.import(firstCompany.id, firstPreview)).toBe(1)
    const secondPreview = previewEmployeeRows(sheet, repository.list(), secondCompany.id, profile).rows
    expect(secondPreview[0].duplicate).toBe(false)
    expect(service.import(secondCompany.id, secondPreview)).toBe(1)
    expect(repository.list().map(employee => employee.companyId)).toEqual([firstCompany.id, secondCompany.id])
    expect(repository.list().filter(employee => employee.companyId === firstCompany.id)).toHaveLength(1)
    expect(repository.list().filter(employee => employee.companyId === secondCompany.id)).toHaveLength(1)
  })

  it('detecta duplicados dentro del archivo y contra la empresa, con aislamiento entre empresas', () => {
    const sheet = importSheet([
      sourceRows[0],
      ['12.345.678', 'Uno Dos', 'A', 'B', '2024-03-15', '', ''],
      ['12345678', 'Otro Nombre', 'A', 'B', '', '', ''],
      ['22.222.222', 'Tres Cuatro', 'A', 'B', '', '', ''],
    ])
    const existing: Employee[] = [{ id: 'old', companyId: firstCompany.id, identityNumber: '22-222-222', firstName: 'Tres', lastName: 'Cuatro', position: 'A', hireDate: '', status: 'Activo', createdAt: '', updatedAt: '' }]
    expect(previewEmployeeRows(sheet, existing, firstCompany.id, profile).rows.map(row => row.duplicate)).toEqual([false, true, true])
    expect(previewEmployeeRows(sheet, existing, secondCompany.id, profile).rows.map(row => row.duplicate)).toEqual([false, true, false])
  })

  it('informa mapeos obligatorios ausentes y maneja libros vacíos o inválidos', () => {
    const sheet = importSheet([['Cargo', 'Ubicación'], ['Operador', 'Planta']])
    expect(previewEmployeeRows(sheet, [], firstCompany.id, profile).missingRequired).toEqual(['Identificación', 'Nombre completo'])
    expect(() => readEmployeeWorkbook(workbook([])).map(item => mapEmployeeImportSheet(item, profile))).toThrow(/encabezados|hoja/i)
    expect(() => readEmployeeWorkbook(new ArrayBuffer(0))).toThrow(/archivo excel está vacío/i)
  })

  it('mantiene el repositorio intacto cuando la persistencia falla', () => {
    const sheet = importSheet(sourceRows)
    const rows = previewEmployeeRows(sheet, [], firstCompany.id, profile).rows
    const repository = new MemoryEmployees()
    repository.saveAll = () => { throw new Error('storage failure') }
    expect(() => new EmployeeSpreadsheetImportService(repository, profile).import(firstCompany.id, rows)).toThrow('storage failure')
    expect(repository.items).toEqual([])
  })

  it('interpreta importes y marca fechas inválidas o ambiguas', () => {
    expect(parseSpreadsheetMoney('1.250,50')).toEqual({ value: 1250.5 })
    expect(parseSpreadsheetMoney('1,250.50')).toEqual({ value: 1250.5 })
    expect(parseSpreadsheetMoney('50,00')).toEqual({ value: 50 })
    expect(parseSpreadsheetMoney('')).toEqual({})
    expect(parseSpreadsheetMoney('1,250').error).toMatch(/ambiguo/i)
    expect(parseSpreadsheetMoney('cincuenta').error).toMatch(/inválido/i)
    const numericSheet = importSheet([sourceRows[0], ['12.345.682', 'Nombre Persona', 'Operador', 'Producción', '', 50.25, '']])
    expect(previewEmployeeRows(numericSheet, [], firstCompany.id, profile).rows[0].monthlySalaryUsd).toBe(50.25)
    expect(parseSpreadsheetDate({ value: '9/1/26', formatted: '9/1/26', type: 's', isDate: false }).error).toMatch(/ambigua/i)
    expect(parseSpreadsheetDate({ value: '2024-02-30', formatted: '2024-02-30', type: 's', isDate: false }).error).toMatch(/inválida/i)
    expect(parseSpreadsheetDate({ value: '2024-02-29', formatted: '2024-02-29', type: 's', isDate: false }).value).toBe('2024-02-29')
  })

  it('rechaza sueldos importados ambiguos o negativos en lugar de guardarlos', () => {
    const ambiguous = importSheet([sourceRows[0], ['12.345.679', 'Nombre Persona', 'Operador', 'Producción', '', '1,250', '']])
    const negative = importSheet([sourceRows[0], ['12.345.680', 'Nombre Persona', 'Operador', 'Producción', '', '-50,00', '']])
    expect(previewEmployeeRows(ambiguous, [], firstCompany.id, profile).rows[0].issues.join(' ')).toMatch(/ambiguo/i)
    expect(previewEmployeeRows(negative, [], firstCompany.id, profile).rows[0].issues.join(' ')).toMatch(/negativo/i)
  })

  it('rechaza cuentas numéricas que Excel no puede preservar exactamente', () => {
    const rows = [sourceRows[0], ['12.345.681', 'Nombre Persona', 'Operador', 'Producción', '', 50, Number('12345678901234567890')]]
    const sheet = importSheet(rows)
    const preview = previewEmployeeRows(sheet, [], firstCompany.id, profile)
    expect(preview.rows[0].bankAccountNumber).toBeUndefined()
    expect(preview.rows[0].issues.join(' ')).toMatch(/no puede preservarse/i)
  })
})
