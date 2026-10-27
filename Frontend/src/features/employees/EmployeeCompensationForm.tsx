import { useState, type FormEvent } from 'react'
import { Check, X } from 'lucide-react'
import type { Employee, EmployeeCompensationDraft } from '../../domain/employees/employee'

export function EmployeeCompensationForm({ employee, onCancel, onSave }: {
  employee: Employee
  onCancel: () => void
  onSave: (draft: EmployeeCompensationDraft) => { salaryError?: string; message?: string } | null
}) {
  const [monthlySalaryUsd, setMonthlySalaryUsd] = useState<number | undefined>(employee.monthlySalaryUsd)
  const [bankAccountNumber, setBankAccountNumber] = useState(employee.bankAccountNumber || '')
  const [salaryError, setSalaryError] = useState('')
  const [formError, setFormError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const result = onSave({ monthlySalaryUsd, bankAccountNumber })
    if (result === null) { setSalaryError(''); setFormError('') }
    else { setSalaryError(result.salaryError || ''); setFormError(result.message || '') }
  }

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}>
    <section className="modal employee-modal" role="dialog" aria-modal="true" aria-labelledby="employee-compensation-title">
      <div className="modal-head"><div><span className="eyebrow">INFORMACIÓN SENSIBLE</span><h2 id="employee-compensation-title">Sueldo y cuenta bancaria</h2><p>Actualiza estos datos sin cambiar la información laboral de {employee.fullName || `${employee.firstName} ${employee.lastName}`}.</p></div><button className="icon-button" onClick={onCancel} aria-label="Cerrar formulario"><X size={18}/></button></div>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <label className="form-field"><span>Sueldo mensual en USD</span><input type="number" min="0" step="0.01" inputMode="decimal" value={monthlySalaryUsd === undefined ? '' : String(monthlySalaryUsd)} onChange={event => setMonthlySalaryUsd(event.currentTarget.value === '' ? undefined : event.currentTarget.valueAsNumber)} placeholder="Sin informar" aria-invalid={Boolean(salaryError)} aria-describedby={salaryError ? 'employee-salary-error' : undefined}/>{salaryError && <small className="field-error" id="employee-salary-error">{salaryError}</small>}</label>
          <label className="form-field"><span>Número de cuenta bancaria</span><input type="text" inputMode="numeric" autoComplete="off" value={bankAccountNumber} onChange={event => setBankAccountNumber(event.currentTarget.value)} placeholder="Sin informar"/></label>
        </div>
        <div className="modal-note">La cuenta se conserva como texto. El almacenamiento local de este navegador no ofrece las garantías de seguridad de un sistema de producción multiusuario.</div>
        {formError && <div className="form-error" role="alert">{formError}</div>}
        <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancelar</button><button className="button button-primary"><Check size={15}/>Guardar cambios</button></div>
      </form>
    </section>
  </div>
}
