import { useState, type FormEvent } from 'react'
import { Check, X } from 'lucide-react'
import type { Employee, EmployeeDraft, EmployeeFieldErrors } from '../../domain/employees/employee'

const blankDraft: EmployeeDraft = { identityNumber: '', firstName: '', lastName: '', position: '', department: '', hireDate: '', status: 'Activo' }

export function EmployeeForm({ employee, onCancel, onSave }: {
  employee?: Employee
  onCancel: () => void
  onSave: (draft: EmployeeDraft) => { fields?: EmployeeFieldErrors; message?: string } | null
}) {
  const [draft, setDraft] = useState<EmployeeDraft>(employee ? {
    identityNumber: employee.identityNumber, firstName: employee.fullName || employee.firstName, lastName: employee.fullName ? '' : employee.lastName,
    fullName: employee.fullName, position: employee.position, department: employee.department || '', location: employee.location || '', hireDate: employee.hireDate, status: employee.status,
  } : blankDraft)
  const [errors, setErrors] = useState<EmployeeFieldErrors>({})
  const [formError, setFormError] = useState('')
  const set = (field: keyof EmployeeDraft, value: string) => setDraft(current => ({ ...current, [field]: value, ...(field === 'firstName' && employee?.fullName ? { fullName: value } : {}) }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const result = onSave(draft)
    if (result === null) { setErrors({}); setFormError('') }
    else { setErrors(result.fields || {}); setFormError(result.message || '') }
  }
  const field = (name: keyof EmployeeDraft, label: string, placeholder: string, required = false, type = 'text') => <label className="form-field">
    <span>{label}{required && <> <i>*</i></>}</span>
    <input type={type} value={String(draft[name] || '')} onChange={event => set(name, event.target.value)} placeholder={placeholder} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `employee-error-${name}` : undefined}/>
    {errors[name] && <small className="field-error" id={`employee-error-${name}`}>{errors[name]}</small>}
  </label>
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
    <section className="modal employee-modal" role="dialog" aria-modal="true" aria-labelledby="employee-form-title">
      <div className="modal-head"><div><span className="eyebrow">PERSONAL DE EMPRESA</span><h2 id="employee-form-title">{employee ? 'Editar empleado' : 'Nuevo empleado'}</h2><p>Completa la información laboral básica.</p></div><button className="icon-button" onClick={onCancel} aria-label="Cerrar formulario"><X size={18}/></button></div>
      <form onSubmit={submit} noValidate><div className="form-grid">
        {field('identityNumber', 'Identificación', 'Ej. V-12345678', true)}
        {field('hireDate', 'Fecha de ingreso', '', true, 'date')}
        {field('firstName', employee?.fullName ? 'Nombre completo' : 'Nombres', employee?.fullName ? 'Nombre completo' : 'Nombres', !employee?.fullName)}
        {!employee?.fullName && field('lastName', 'Apellidos', 'Apellidos', true)}
        {field('position', 'Cargo', 'Cargo o puesto', true)}
        {field('department', 'Departamento o área', 'Opcional')}
        {field('location', 'Ubicación / UBC', 'Opcional')}
      </div>
        {formError && <div className="form-error" role="alert">{formError}</div>}
        <div className="modal-note">El sueldo y la cuenta bancaria pueden actualizarse por separado desde la ficha del empleado.</div>
        <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancelar</button><button className="button button-primary"><Check size={15}/>{employee ? 'Guardar cambios' : 'Crear empleado'}</button></div>
      </form>
    </section>
  </div>
}
