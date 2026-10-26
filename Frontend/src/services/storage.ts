import type { Company } from '../domain/company'
import type { Employee } from '../domain/employees/employee'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface CompanyRepository {
  list(): Company[]
  saveAll(companies: readonly Company[]): void
}

export interface EmployeeRepository {
  list(): Employee[]
  saveAll(employees: readonly Employee[]): void
}

export interface CompanyContextStore {
  get(): string | null
  set(companyId: string | null): void
}

export interface BrowserRepositories {
  companies: CompanyRepository
  employees: EmployeeRepository
  context: CompanyContextStore
  warning?: string
}

export class PersistenceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PersistenceError'
  }
}

function parseArray<T>(storage: KeyValueStorage, key: string, validate: (item: unknown) => item is T): T[] {
  let raw: string | null
  try { raw = storage.getItem(key) } catch (error) { throw new PersistenceError('No se pudieron leer los datos guardados en este navegador.', { cause: error }) }
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value) || !value.every(validate)) throw new Error('Estructura de datos no válida')
    return value
  } catch (error) {
    throw new PersistenceError('Los datos guardados están dañados o tienen un formato no compatible. No se sobrescribieron.', { cause: error })
  }
}

function saveArray<T>(storage: KeyValueStorage, key: string, items: readonly T[]): void {
  try { storage.setItem(key, JSON.stringify(items)) } catch (error) {
    throw new PersistenceError('No se pudieron guardar los cambios. Verifica el espacio disponible y los permisos del navegador.', { cause: error })
  }
}

function isCompany(item: unknown): item is Company {
  if (!item || typeof item !== 'object') return false
  const candidate = item as Partial<Company>
  return typeof candidate.id === 'string' && typeof candidate.legalName === 'string' && typeof candidate.taxId === 'string' &&
    (candidate.status === 'Activa' || candidate.status === 'Inactiva')
}

function isEmployee(item: unknown): item is Employee {
  if (!item || typeof item !== 'object') return false
  const candidate = item as Partial<Employee>
  return typeof candidate.id === 'string' && typeof candidate.companyId === 'string' &&
    typeof candidate.identityNumber === 'string' && typeof candidate.firstName === 'string' &&
    typeof candidate.lastName === 'string' && typeof candidate.position === 'string' &&
    typeof candidate.hireDate === 'string' && (candidate.status === 'Activo' || candidate.status === 'Inactivo') &&
    typeof candidate.createdAt === 'string' && typeof candidate.updatedAt === 'string'
}

export class LocalCompanyRepository implements CompanyRepository {
  constructor(storage: KeyValueStorage) { this.storage = storage }
  private readonly storage: KeyValueStorage
  list(): Company[] {
    return parseArray(this.storage, 'ab-companies', isCompany).map(company => ({
      ...company,
      tradeName: company.tradeName || '', contactName: company.contactName || '',
      email: company.email || '', phone: company.phone || '', createdAt: company.createdAt || new Date(0).toISOString(),
    }))
  }
  saveAll(companies: readonly Company[]): void { saveArray(this.storage, 'ab-companies', companies) }
}

export class LocalEmployeeRepository implements EmployeeRepository {
  constructor(storage: KeyValueStorage) { this.storage = storage }
  private readonly storage: KeyValueStorage
  list(): Employee[] { return parseArray(this.storage, 'ab-employees', isEmployee) }
  saveAll(employees: readonly Employee[]): void { saveArray(this.storage, 'ab-employees', employees) }
}

export class LocalCompanyContextStore implements CompanyContextStore {
  constructor(storage: KeyValueStorage) { this.storage = storage }
  private readonly storage: KeyValueStorage
  get(): string | null {
    try { return this.storage.getItem('ab-selected-company') } catch (error) {
      throw new PersistenceError('No se pudo recuperar la empresa seleccionada.', { cause: error })
    }
  }
  set(companyId: string | null): void {
    try {
      if (companyId) this.storage.setItem('ab-selected-company', companyId)
      else this.storage.removeItem('ab-selected-company')
    } catch (error) { throw new PersistenceError('No se pudo guardar la empresa seleccionada.', { cause: error }) }
  }
}

export function createBrowserRepositories(): BrowserRepositories {
  let storage: KeyValueStorage
  let warning: string | undefined
  try { storage = window.localStorage } catch {
    const memory = new Map<string, string>()
    storage = {
      getItem: key => memory.get(key) ?? null,
      setItem: (key, value) => { memory.set(key, value) },
      removeItem: key => { memory.delete(key) },
    }
    warning = 'El navegador bloqueó el almacenamiento local. Los cambios solo estarán disponibles mientras esta pestaña permanezca abierta.'
  }
  return {
    companies: new LocalCompanyRepository(storage),
    employees: new LocalEmployeeRepository(storage),
    context: new LocalCompanyContextStore(storage),
    warning,
  }
}
