import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Building2, Check, ChevronDown, Eye, FileSpreadsheet, Plus, Search, UserRound, UserRoundX } from 'lucide-react'
import type { Company } from '../../domain/company'
import { type Employee, type EmployeeDraft, type EmployeeStatus } from '../../domain/employees/employee'
import { EmployeeService, EmployeeValidationError, getEmployeeDisplayName, normalizeEmployeeSearch } from '../../services/employees'
import type { EmployeeRepository } from '../../services/storage'
import { EmployeeForm } from './EmployeeForm'
import { EmployeeSpreadsheetImport } from './EmployeeSpreadsheetImport'
import { EmployeeCompensationForm } from './EmployeeCompensationForm'

export function EmployeesPage({ company, repository, onEditingChange }: {
  company?: Company
  repository: EmployeeRepository
  onEditingChange: (editing: boolean) => void
}) {
  const service = useMemo(() => new EmployeeService(repository), [repository])
  const [initial] = useState(() => {
    try { return { employees: company ? service.list(company.id) : [], error: '' } }
    catch (error) { return { employees: [], error: getErrorMessage(error) } }
  })
  const [employees, setEmployees] = useState<Employee[]>(initial.employees)
  const [error, setError] = useState(initial.error)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<EmployeeStatus | 'Todos'>('Todos')
  const [editor, setEditor] = useState<Employee | 'new' | null>(null)
  const [pendingStatus, setPendingStatus] = useState<Employee | null>(null)
  const [compensationEditor, setCompensationEditor] = useState<Employee | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const navigate = useNavigate()
  const { employeeId } = useParams()
  useEffect(() => () => onEditingChange(false), [onEditingChange])

  const refresh = () => {
    if (!company) return
    try { setEmployees(service.list(company.id)); setError('') }
    catch (cause) { setError(getErrorMessage(cause)) }
  }
  const filtered = useMemo(() => employees.filter(employee =>
    (status === 'Todos' || employee.status === status) &&
    [employee.identityNumber, getEmployeeDisplayName(employee), employee.firstName, employee.lastName, employee.position, employee.location || '']
      .some(value => normalizeEmployeeSearch(value).includes(normalizeEmployeeSearch(query)))), [employees, query, status])
  const employee = employeeId && company ? employees.find(item => item.id === employeeId && item.companyId === company.id) : undefined

  const openEditor = (value: Employee | 'new') => { setEditor(value); onEditingChange(true) }
  const closeEditor = () => { setEditor(null); onEditingChange(false) }
  const save = (draft: EmployeeDraft): { fields?: Partial<Record<keyof EmployeeDraft, string>>; message?: string } | null => {
    if (!company) return null
    try {
      service.save(company.id, draft, editor !== 'new' ? editor?.id : undefined)
      refresh()
      closeEditor()
      return null
    } catch (cause) {
      if (cause instanceof EmployeeValidationError) return { fields: cause.fields }
      setError(getErrorMessage(cause))
      return { message: getErrorMessage(cause) }
    }
  }

  const changeStatus = (person: Employee) => {
    setPendingStatus(person)
  }
  const confirmStatusChange = () => {
    if (!company || !pendingStatus) return
    const next: EmployeeStatus = pendingStatus.status === 'Activo' ? 'Inactivo' : 'Activo'
    try { service.setStatus(company.id, pendingStatus.id, next); setPendingStatus(null); refresh() }
    catch (cause) { setError(getErrorMessage(cause)) }
  }

  if (!company) return <><Heading title="Personal" subtitle="Consulta el personal asociado a una empresa."/><div className="select-company-prompt"><div className="empty-icon"><Building2 size={22}/></div><div><b>Selecciona una empresa para continuar</b><p>Elige una empresa desde el selector del encabezado o el directorio.</p></div><Link to="/empresas" className="button button-secondary">Ver empresas <ArrowRight size={14}/></Link></div></>

  if (employeeId) return <><button className="back-link" onClick={() => navigate('/personal')}><ArrowLeft size={16}/> Volver a personal</button>
    {employee ? <EmployeeDetail employee={employee} onEdit={() => openEditor(employee)} onEditCompensation={() => setCompensationEditor(employee)} onToggle={() => changeStatus(employee)}/> : <><Heading title="Empleado no encontrado" subtitle="La persona no está registrada en esta empresa."/><div className="panel"><Empty title="No encontramos esta ficha" text="Verifica la empresa seleccionada o vuelve al directorio." icon={UserRoundX}/></div></>}
    {editor && <EmployeeForm employee={editor === 'new' ? undefined : editor} onCancel={closeEditor} onSave={save}/>}<StatusConfirmation employee={pendingStatus} error={error} onCancel={() => setPendingStatus(null)} onConfirm={confirmStatusChange}/>{compensationEditor && company && <EmployeeCompensationForm employee={compensationEditor} onCancel={() => setCompensationEditor(null)} onSave={draft => {
      try { service.updateCompensation(company.id, compensationEditor.id, draft); setCompensationEditor(null); refresh(); return null }
      catch (cause) { if (cause instanceof EmployeeValidationError) return { salaryError: cause.fields.monthlySalaryUsd }; return { message: getErrorMessage(cause) } }
    }}/>}</>

  const openImport = () => { setImportOpen(true); onEditingChange(true) }
  const closeImport = () => { setImportOpen(false); onEditingChange(false) }
  return <><Heading title={`Personal · ${company.tradeName || company.legalName}`} subtitle="Directorio de personas asociadas a esta empresa." action={<div className="employee-heading-actions"><button className="button button-secondary" onClick={openImport}><FileSpreadsheet size={15}/> Importar Excel</button><button className="button button-primary" onClick={() => openEditor('new')}><Plus size={16}/> Nuevo empleado</button></div>}/>
    {error && <PersistenceNotice message={error}/>}
    <section className="panel employee-panel"><div className="filter-row employee-filters"><label className="search-box"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por identificación, nombre o cargo..."/></label><label className="select-box"><span>Estado</span><select value={status} onChange={event => setStatus(event.target.value as EmployeeStatus | 'Todos')}><option>Todos</option><option>Activo</option><option>Inactivo</option></select><ChevronDown size={14}/></label></div>
      {filtered.length ? <div className="table-wrap"><table><thead><tr><th>Identificación</th><th>Nombre</th><th>Cargo / Área</th><th>Ingreso</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map(person => <tr key={person.id}>
        <td>{person.identityNumber}</td><td><Link to={`/personal/${person.id}`} className="employee-name"><span className="tiny-company-icon"><UserRound size={15}/></span><span><b>{getEmployeeDisplayName(person)}</b></span></Link></td>
        <td><span>{person.position || '—'}</span>{(person.department || person.location) && <small className="table-secondary">{person.department || person.location}</small>}</td><td>{person.hireDate || '—'}</td>
        <td><span className={`badge ${person.status === 'Activo' ? 'green' : 'gray'}`}><i/>{person.status}</span></td>
        <td><div className="row-actions"><Link className="button-plain" to={`/personal/${person.id}`} aria-label={`Ver a ${person.firstName} ${person.lastName}`}><Eye size={15}/></Link><button className="button-plain" onClick={() => openEditor(person)}>Editar</button><button className="button-plain" onClick={() => changeStatus(person)}>{person.status === 'Activo' ? 'Desactivar' : 'Reactivar'}</button></div></td>
      </tr>)}</tbody></table></div> : <Empty icon={UserRound} title={employees.length ? 'No encontramos resultados' : 'Aún no hay personal registrado'} text={employees.length ? 'Prueba otra búsqueda o cambia el filtro de estado.' : 'Agrega el primer empleado a esta empresa. Todavía no se ha cargado información ficticia.'} action={employees.length ? undefined : <button className="button button-primary" onClick={() => openEditor('new')}><Plus size={16}/> Nuevo empleado</button>}/>}
      <div className="table-footer"><span>Mostrando {filtered.length} de {employees.length} {employees.length === 1 ? 'persona' : 'personas'}</span><span>Empresa: {company.tradeName || company.legalName}</span></div>
    </section>
    {editor && <EmployeeForm employee={editor === 'new' ? undefined : editor} onCancel={closeEditor} onSave={save}/>}<StatusConfirmation employee={pendingStatus} error={error} onCancel={() => setPendingStatus(null)} onConfirm={confirmStatusChange}/>{importOpen && <EmployeeSpreadsheetImport key={company.id} company={company} repository={repository} onClose={closeImport} onComplete={() => { closeImport(); refresh() }}/>}</>
}

function EmployeeDetail({ employee, onEdit, onEditCompensation, onToggle }: { employee: Employee; onEdit: () => void; onEditCompensation: () => void; onToggle: () => void }) {
  return <><Heading eyebrow="FICHA DE PERSONAL" title={getEmployeeDisplayName(employee)} subtitle="Información laboral básica." action={<button className="button button-secondary" onClick={onEdit}>Editar ficha</button>}/>
    <section className="panel employee-detail"><div className="employee-profile"><div className="profile-logo"><UserRound size={23}/></div><div><h2>{getEmployeeDisplayName(employee)}</h2><p>{employee.position}{employee.department ? ` · ${employee.department}` : ''}</p></div><span className={`badge ${employee.status === 'Activo' ? 'green' : 'gray'}`}><i/>{employee.status}</span></div>
      <div className="detail-list"><Detail label="Identificación" value={employee.identityNumber}/><Detail label="Cargo" value={employee.position || 'No especificado'}/><Detail label="Ubicación / UBC" value={employee.location || 'No especificado'}/><Detail label="Departamento o área" value={employee.department || 'No especificado'}/><Detail label="Fecha de ingreso" value={employee.hireDate || 'No especificada'}/><Detail label="Estado laboral" value={employee.status}/><Detail label="Última actualización" value={new Date(employee.updatedAt).toLocaleString('es-VE')}/></div>
      <div className="compensation-section"><div className="panel-heading"><div><h2>Sueldo y cuenta bancaria</h2><p>Información sensible de la ficha</p></div><button className="button button-secondary" onClick={onEditCompensation}>Editar datos</button></div><div className="detail-list"><Detail label="Sueldo mensual" value={employee.monthlySalaryUsd === undefined ? 'Sin información' : formatUsd(employee.monthlySalaryUsd)}/><Detail label="Cuenta bancaria" value={maskBankAccount(employee.bankAccountNumber)}/></div><small className="hint">La cuenta se muestra enmascarada. El almacenamiento local no ofrece garantías de seguridad de producción multiusuario.</small></div>
      <div className="employee-detail-actions"><button className="button button-secondary" onClick={onToggle}>{employee.status === 'Activo' ? <><UserRoundX size={15}/> Desactivar</> : <><Check size={15}/> Reactivar</>}</button></div>
    </section></>
}

function formatUsd(value: number): string { return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(value) }
function maskBankAccount(value?: string): string { return value ? value.length <= 4 ? '••••' : `••••${value.slice(-4)}` : 'Sin información' }

function Heading({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: React.ReactNode }) { return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action && <div className="heading-action">{action}</div>}</div> }
function Empty({ icon: Icon, title, text, action }: { icon: typeof UserRound; title: string; text: string; action?: React.ReactNode }) { return <div className="empty-state"><div className="empty-icon"><Icon size={24}/></div><h3>{title}</h3><p>{text}</p>{action}</div> }
function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-item"><span>{label}</span><b>{value}</b></div> }
function PersistenceNotice({ message }: { message: string }) { return <div className="persistence-notice" role="alert">{message}</div> }
function StatusConfirmation({ employee, error, onCancel, onConfirm }: { employee: Employee | null; error: string; onCancel: () => void; onConfirm: () => void }) {
  if (!employee) return null
  const deactivate = employee.status === 'Activo'
  return <div className="modal-backdrop"><section className="modal context-confirm" role="dialog" aria-modal="true" aria-labelledby="employee-status-title"><div className="modal-head"><div><span className="eyebrow">ESTADO LABORAL</span><h2 id="employee-status-title">{deactivate ? '¿Desactivar empleado?' : '¿Reactivar empleado?'}</h2><p>{deactivate ? `La ficha de ${employee.firstName} ${employee.lastName} se conservará y podrás reactivarla después.` : `Se habilitará de nuevo el estado activo de ${employee.firstName} ${employee.lastName}.`}</p></div></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button className="button button-secondary" onClick={onCancel}>Cancelar</button><button className="button button-primary" onClick={onConfirm}>{deactivate ? 'Desactivar' : 'Reactivar'}</button></div></section></div>
}
function getErrorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Ocurrió un error inesperado. Inténtalo de nuevo.' }
