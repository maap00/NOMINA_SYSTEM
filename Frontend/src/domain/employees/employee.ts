export type EmployeeStatus = 'Activo' | 'Inactivo'

export interface Employee {
  id: string
  companyId: string
  identityNumber: string
  firstName: string
  lastName: string
  /** Complete source name for imports that do not safely split surnames and given names. */
  fullName?: string
  position: string
  department?: string
  location?: string
  monthlySalaryUsd?: number
  bankAccountNumber?: string
  hireDate: string
  status: EmployeeStatus
  createdAt: string
  updatedAt: string
}

export type EmployeeDraft = Pick<Employee, 'identityNumber' | 'firstName' | 'lastName' | 'position' | 'hireDate'> &
  Pick<Partial<Employee>, 'department' | 'status' | 'fullName' | 'location' | 'monthlySalaryUsd' | 'bankAccountNumber'>

export type EmployeeCompensationDraft = Pick<Employee, 'monthlySalaryUsd' | 'bankAccountNumber'>

export type EmployeeField = keyof EmployeeDraft
export type EmployeeFieldErrors = Partial<Record<EmployeeField, string>>

export function normalizeIdentity(value: string): string {
  return value.trim().toLocaleUpperCase().replace(/[\s.-]/g, '')
}

export function validateEmployeeDraft(
  draft: EmployeeDraft,
  existing: readonly Employee[],
  companyId: string,
  editingId?: string,
): EmployeeFieldErrors {
  const errors: EmployeeFieldErrors = {}
  const required: Array<keyof Pick<EmployeeDraft, 'identityNumber' | 'firstName' | 'lastName' | 'position' | 'hireDate'>> = draft.fullName
    ? ['identityNumber']
    : ['identityNumber', 'firstName', 'lastName', 'position', 'hireDate']
  for (const field of required) if (!draft[field].trim()) errors[field] = 'Este campo es obligatorio.'
  const duplicate = existing.some(employee => employee.companyId === companyId && employee.id !== editingId &&
    normalizeIdentity(employee.identityNumber) === normalizeIdentity(draft.identityNumber))
  if (draft.identityNumber.trim() && duplicate) errors.identityNumber = 'Ya existe una persona con esta identificación en la empresa.'
  if (draft.hireDate && !isValidDate(draft.hireDate)) errors.hireDate = 'Ingresa una fecha válida.'
  if (draft.monthlySalaryUsd !== undefined && (!Number.isFinite(draft.monthlySalaryUsd) || draft.monthlySalaryUsd < 0)) errors.monthlySalaryUsd = 'El sueldo debe ser un importe válido mayor o igual a cero.'
  return errors
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [, yearText, monthText, dayText] = match
  const year = Number(yearText); const month = Number(monthText); const day = Number(dayText)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function createEmployee(companyId: string, draft: EmployeeDraft, now: Date, id: string): Employee {
  const timestamp = now.toISOString()
  return {
    id,
    companyId,
    identityNumber: draft.identityNumber.trim(),
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    fullName: draft.fullName?.trim() || undefined,
    position: draft.position.trim(),
    department: draft.department?.trim() || undefined,
    location: draft.location?.trim() || undefined,
    monthlySalaryUsd: draft.monthlySalaryUsd,
    bankAccountNumber: draft.bankAccountNumber?.trim() || undefined,
    hireDate: draft.hireDate,
    status: draft.status || 'Activo',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
