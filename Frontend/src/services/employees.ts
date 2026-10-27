import { createEmployee, normalizeIdentity, validateEmployeeDraft, type Employee, type EmployeeCompensationDraft, type EmployeeDraft, type EmployeeFieldErrors, type EmployeeStatus } from '../domain/employees/employee'
import type { EmployeeRepository } from './storage'

export class EmployeeValidationError extends Error {
  readonly fields: EmployeeFieldErrors

  constructor(fields: EmployeeFieldErrors) {
    super('Revisa los campos indicados.')
    this.name = 'EmployeeValidationError'
    this.fields = fields
  }
}

export class EmployeeService {
  constructor(
    repository: EmployeeRepository,
    now: () => Date = () => new Date(),
    createId: () => string = () => `employee-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`,
  ) { this.repository = repository; this.now = now; this.createId = createId }

  private readonly repository: EmployeeRepository
  private readonly now: () => Date
  private readonly createId: () => string

  list(companyId: string, options: { query?: string; status?: EmployeeStatus | 'Todos' } = {}): Employee[] {
    const query = normalizeEmployeeSearch(options.query || '')
    return this.repository.list().filter(employee => employee.companyId === companyId &&
      (!options.status || options.status === 'Todos' || employee.status === options.status) &&
      (!query || [employee.identityNumber, employee.fullName || `${employee.firstName} ${employee.lastName}`, employee.firstName, employee.lastName, employee.position, employee.location || '']
        .some(value => normalizeEmployeeSearch(value).includes(query))))
  }

  get(companyId: string, id: string): Employee | undefined {
    return this.repository.list().find(employee => employee.companyId === companyId && employee.id === id)
  }

  save(companyId: string, draft: EmployeeDraft, id?: string): Employee {
    const all = this.repository.list()
    const current = id ? all.find(employee => employee.id === id && employee.companyId === companyId) : undefined
    if (id && !current) throw new Error('No se encontró la persona para editar en esta empresa.')
    const errors = validateEmployeeDraft(draft, all, companyId, id)
    if (Object.keys(errors).length) throw new EmployeeValidationError(errors)
    const timestamp = this.now()
    const employee = current
      ? { ...current, ...draft, status: draft.status || current.status, identityNumber: draft.identityNumber.trim(), firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), fullName: draft.fullName?.trim() || undefined, position: draft.position.trim(), department: draft.department?.trim() || undefined, location: draft.location?.trim() || undefined, monthlySalaryUsd: 'monthlySalaryUsd' in draft ? draft.monthlySalaryUsd : current.monthlySalaryUsd, bankAccountNumber: 'bankAccountNumber' in draft ? draft.bankAccountNumber?.trim() || undefined : current.bankAccountNumber, updatedAt: timestamp.toISOString() }
      : createEmployee(companyId, draft, timestamp, this.createId())
    const next = current ? all.map(item => item.id === employee.id && item.companyId === companyId ? employee : item) : [...all, employee]
    this.repository.saveAll(next)
    return employee
  }

  setStatus(companyId: string, id: string, status: EmployeeStatus): Employee {
    const all = this.repository.list()
    const current = all.find(employee => employee.companyId === companyId && employee.id === id)
    if (!current) throw new Error('No se encontró la persona en esta empresa.')
    const updated: Employee = { ...current, status, updatedAt: this.now().toISOString() }
    this.repository.saveAll(all.map(employee => employee.id === id && employee.companyId === companyId ? updated : employee))
    return updated
  }

  updateCompensation(companyId: string, id: string, values: EmployeeCompensationDraft): Employee {
    const all = this.repository.list()
    const current = all.find(employee => employee.companyId === companyId && employee.id === id)
    if (!current) throw new Error('No se encontró la persona en esta empresa.')
    if (values.monthlySalaryUsd !== undefined && (!Number.isFinite(values.monthlySalaryUsd) || values.monthlySalaryUsd < 0)) {
      throw new EmployeeValidationError({ monthlySalaryUsd: 'El sueldo debe ser un importe válido mayor o igual a cero.' })
    }
    const updated: Employee = {
      ...current,
      monthlySalaryUsd: values.monthlySalaryUsd,
      bankAccountNumber: values.bankAccountNumber?.trim() || undefined,
      updatedAt: this.now().toISOString(),
    }
    this.repository.saveAll(all.map(employee => employee.id === id && employee.companyId === companyId ? updated : employee))
    return updated
  }
}

export function getEmployeeDisplayName(employee: Employee): string {
  return employee.fullName?.trim() || `${employee.firstName} ${employee.lastName}`.trim()
}

export function normalizeEmployeeSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase()
}

export function identitiesMatch(first: string, second: string): boolean {
  return normalizeIdentity(first) === normalizeIdentity(second)
}
