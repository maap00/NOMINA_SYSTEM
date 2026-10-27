import type { EmployeeImportField, EmployeeImportProfile } from './employeeImport'

/** Column aliases and identity rules for the currently supported employee roster workbook. */
export const EMPLOYEE_ROSTER_IMPORT_PROFILE: EmployeeImportProfile = {
  id: 'employee-roster-v1',
  fields: [
    { key: 'identityNumber', label: 'Identificación', aliases: ['n cedula', 'cedula', 'numero de cedula', 'identificacion'], required: true },
    { key: 'fullName', label: 'Nombre completo', aliases: ['trabajador', 'nombre completo', 'nombre del trabajador'], required: true },
    { key: 'position', label: 'Cargo', aliases: ['cargo', 'puesto'] },
    { key: 'location', label: 'Ubicación / UBC', aliases: ['ubc', 'ubicacion', 'unidad basica de contratacion'] },
    { key: 'hireDate', label: 'Fecha de ingreso', aliases: ['fecha de ingreso', 'fecha ingreso'] },
    { key: 'salary', label: 'Sueldo mensual en USD', aliases: ['sueldo en', 'sueldo', 'salario'] },
    { key: 'bankAccount', label: 'Cuenta bancaria', aliases: ['cuenta bancaria', 'cuenta'] },
  ],
  normalizeIdentity: normalizePunctuatedIdentity,
}

export function normalizePunctuatedIdentity(value: string): string {
  return value.trim().toLocaleUpperCase().replace(/[.\s-]/g, '')
}

export type { EmployeeImportField }
