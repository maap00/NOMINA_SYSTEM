import { describe, expect, it } from 'vitest'
import type { Employee, EmployeeDraft } from '../src/domain/employees/employee'
import { EmployeeService, EmployeeValidationError } from '../src/services/employees'
import { LocalEmployeeRepository, PersistenceError, type EmployeeRepository, type KeyValueStorage } from '../src/services/storage'

class MemoryEmployeeRepository implements EmployeeRepository {
  items: Employee[] = []
  list(): Employee[] { return [...this.items] }
  saveAll(employees: readonly Employee[]): void { this.items = [...employees] }
}

const fixedDate = new Date('2026-10-26T12:00:00.000Z')
const draft = (overrides: Partial<EmployeeDraft> = {}): EmployeeDraft => ({
  identityNumber: 'V-12345678', firstName: 'Ana', lastName: 'Pérez', position: 'Analista', hireDate: '2024-05-10', status: 'Activo', ...overrides,
})

describe('EmployeeService', () => {
  it('creates and edits an employee while keeping identity and creation date', () => {
    const service = new EmployeeService(new MemoryEmployeeRepository(), () => fixedDate)
    const created = service.save('company-a', draft())
    const updated = service.save('company-a', draft({ position: 'Coordinadora', department: 'Operaciones' }), created.id)
    expect(updated.position).toBe('Coordinadora')
    expect(updated.companyId).toBe('company-a')
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.updatedAt).toBe(fixedDate.toISOString())
  })

  it('rejects missing required fields and invalid dates', () => {
    const service = new EmployeeService(new MemoryEmployeeRepository(), () => fixedDate)
    expect(() => service.save('company-a', draft({ firstName: ' ', hireDate: '2024-02-30' }))).toThrow(EmployeeValidationError)
    try { service.save('company-a', draft({ firstName: '', hireDate: '' })) } catch (error) {
      expect(error).toBeInstanceOf(EmployeeValidationError)
      expect((error as EmployeeValidationError).fields.firstName).toBeTruthy()
      expect((error as EmployeeValidationError).fields.hireDate).toBeTruthy()
    }
  })

  it('rejects duplicate identification in one company, but accepts it in another', () => {
    const service = new EmployeeService(new MemoryEmployeeRepository(), () => fixedDate)
    service.save('company-a', draft())
    expect(() => service.save('company-a', draft({ identityNumber: 'v 1234-5678' }))).toThrow(EmployeeValidationError)
    expect(service.save('company-b', draft()).companyId).toBe('company-b')
  })

  it('filters by company, status and identity, name, surname or position', () => {
    const service = new EmployeeService(new MemoryEmployeeRepository(), () => fixedDate)
    const ana = service.save('company-a', draft())
    service.save('company-a', draft({ identityNumber: 'J-2', firstName: 'Luis', lastName: 'Rojas', position: 'Técnico' }))
    service.save('company-b', draft({ identityNumber: 'J-2', firstName: 'Luis', lastName: 'Rojas', position: 'Técnico' }))
    service.setStatus('company-a', ana.id, 'Inactivo')
    expect(service.list('company-a')).toHaveLength(2)
    expect(service.list('company-a', { status: 'Activo', query: 'técnico' })).toHaveLength(1)
    expect(service.list('company-a', { status: 'Inactivo', query: 'perez' })).toHaveLength(1)
    expect(service.list('company-b')).toHaveLength(1)
  })

  it('deactivates and reactivates without deleting the record', () => {
    const service = new EmployeeService(new MemoryEmployeeRepository(), () => fixedDate)
    const created = service.save('company-a', draft())
    expect(service.setStatus('company-a', created.id, 'Inactivo').status).toBe('Inactivo')
    expect(service.setStatus('company-a', created.id, 'Activo').status).toBe('Activo')
    expect(service.list('company-a')).toHaveLength(1)
  })

  it('edits compensation fields independently and preserves the rest of the employee', () => {
    const service = new EmployeeService(new MemoryEmployeeRepository(), () => fixedDate)
    const created = service.save('company-a', draft({ monthlySalaryUsd: 900, bankAccountNumber: '0012345000', department: 'Operaciones' }))
    const salaryEdited = service.updateCompensation('company-a', created.id, { monthlySalaryUsd: 1250.5, bankAccountNumber: created.bankAccountNumber })
    expect(salaryEdited.monthlySalaryUsd).toBe(1250.5)
    expect(salaryEdited.bankAccountNumber).toBe('0012345000')
    expect(salaryEdited.position).toBe('Analista')
    expect(salaryEdited.department).toBe('Operaciones')
    expect(salaryEdited.identityNumber).toBe(created.identityNumber)
    const accountEdited = service.updateCompensation('company-a', created.id, { monthlySalaryUsd: salaryEdited.monthlySalaryUsd, bankAccountNumber: '0000000099' })
    expect(accountEdited.monthlySalaryUsd).toBe(1250.5)
    expect(accountEdited.bankAccountNumber).toBe('0000000099')
    expect(accountEdited.position).toBe('Analista')
  })

  it('rejects invalid compensation and preserves the existing value', () => {
    const repository = new MemoryEmployeeRepository()
    const service = new EmployeeService(repository, () => fixedDate)
    const created = service.save('company-a', draft({ monthlySalaryUsd: 700 }))
    expect(() => service.updateCompensation('company-a', created.id, { monthlySalaryUsd: -1, bankAccountNumber: '001' })).toThrow(EmployeeValidationError)
    expect(repository.list()[0].monthlySalaryUsd).toBe(700)
    expect(service.updateCompensation('company-a', created.id, { monthlySalaryUsd: undefined, bankAccountNumber: '' }).monthlySalaryUsd).toBeUndefined()
    expect(repository.list()[0].monthlySalaryUsd).toBeUndefined()
  })
})

describe('LocalEmployeeRepository', () => {
  it('surfaces read and write failures instead of hiding them', () => {
    const failingStorage: KeyValueStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('quota') },
      removeItem: () => undefined,
    }
    const repository = new LocalEmployeeRepository(failingStorage)
    expect(() => repository.list()).toThrow(PersistenceError)
    expect(() => repository.saveAll([])).toThrow(PersistenceError)
  })

  it('round-trips employee data and rejects invalid persisted content', () => {
    const values = new Map<string, string>()
    const storage: KeyValueStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
    const repository = new LocalEmployeeRepository(storage)
    const service = new EmployeeService(repository, () => fixedDate)
    const person = service.save('company-a', draft())
    expect(repository.list()[0]).toEqual(person)
    expect(repository.list()[0]).not.toHaveProperty('monthlySalaryUsd')
    expect(repository.list()[0]).not.toHaveProperty('bankAccountNumber')
    const withCompensation = service.save('company-a', draft({ monthlySalaryUsd: 100, bankAccountNumber: '00001234' }), person.id)
    expect(repository.list()[0]).toEqual(withCompensation)
    expect(repository.list()[0].bankAccountNumber).toBe('00001234')
    values.set('ab-employees', '{not json')
    expect(() => repository.list()).toThrow(PersistenceError)
  })
})
