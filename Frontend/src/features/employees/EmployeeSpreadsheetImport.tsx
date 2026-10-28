import { useMemo, useState, type ChangeEvent } from 'react'
import { AlertCircle, Check, ChevronDown, FileSpreadsheet, Upload, X } from 'lucide-react'
import type { Company } from '../../domain/company'
import type { Employee } from '../../domain/employees/employee'
import type { EmployeeRepository } from '../../services/storage'
import { EmployeeSpreadsheetImportService, mapEmployeeImportSheet, MAX_EMPLOYEE_WORKBOOK_SIZE, parseSpreadsheetDate, previewEmployeeRows, readEmployeeWorkbook, type EmployeeImportField, type EmployeeImportPreviewRow, type EmployeeImportSheet, type EmployeeImportProfile } from '../../services/employeeImport'
import { EMPLOYEE_ROSTER_IMPORT_PROFILE } from '../../services/employeeImportProfile'

type Corrections = Partial<Pick<EmployeeImportPreviewRow, 'identityNumber' | 'fullName' | 'position' | 'location' | 'hireDate'>>

export function EmployeeSpreadsheetImport({ company, repository, profile = EMPLOYEE_ROSTER_IMPORT_PROFILE, onClose, onComplete }: { company: Company; repository: EmployeeRepository; profile?: EmployeeImportProfile; onClose: () => void; onComplete: (count: number) => void }) {
  const [sheets, setSheets] = useState<EmployeeImportSheet[]>([])
  const [activeSheet, setActiveSheet] = useState('')
  const [corrections, setCorrections] = useState<Record<number, Corrections>>({})
  const [existing, setExisting] = useState<Employee[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [fileName, setFileName] = useState('')

  const sheet = sheets.find(item => item.name === activeSheet)
  const basePreview = useMemo(() => sheet ? previewEmployeeRows(sheet, existing, company.id, profile) : null, [sheet, existing, company.id, profile])
  const rows = useMemo(() => {
    if (!basePreview) return []
    const seen = new Set(existing.filter(employee => employee.companyId === company.id).map(employee => profile.normalizeIdentity(employee.identityNumber)))
    return basePreview.rows.map(row => {
      const corrected = { ...row, ...corrections[row.rowNumber] }
      const issues = row.issues.filter(issue => !['La identificación es obligatoria.', 'El nombre completo es obligatorio.', 'Identificación duplicada en el archivo o en esta empresa.', 'Fecha ambigua; corrígela en formato AAAA-MM-DD.', 'Fecha inválida.', 'Fecha inválida o formato no reconocido.'].includes(issue))
      if (!corrected.identityNumber.trim()) issues.push('La identificación es obligatoria.')
      if (!corrected.fullName.trim()) issues.push('El nombre completo es obligatorio.')
      if (corrections[row.rowNumber]?.hireDate !== undefined) {
        if (corrected.hireDate && !/^\d{4}-\d{2}-\d{2}$/.test(corrected.hireDate)) issues.push('La fecha debe usar formato AAAA-MM-DD.')
        else if (corrected.hireDate && parseSpreadsheetDate({ value: corrected.hireDate, formatted: corrected.hireDate, type: 's', isDate: false }).error) issues.push('Fecha inválida.')
      }
      const identity = profile.normalizeIdentity(corrected.identityNumber)
      const duplicate = Boolean(identity && seen.has(identity))
      if (duplicate) issues.push('Identificación duplicada en el archivo o en esta empresa.')
      if (identity) seen.add(identity)
      return { ...corrected, issues, duplicate }
    })
  }, [basePreview, corrections, existing, company.id, profile])
  const validRows = rows.filter(row => row.issues.length === 0)
  const duplicateCount = rows.filter(row => row.duplicate).length
  const errorCount = rows.filter(row => row.issues.length > 0 && !row.duplicate).length

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.name.toLocaleLowerCase().endsWith('.xlsx')) { setError('Selecciona un archivo .xlsx.'); return }
    if (file.size > MAX_EMPLOYEE_WORKBOOK_SIZE) { setError('El archivo supera el límite de 20 MB.'); return }
    setLoading(true); setError(''); setCorrections({}); setSheets([]); setActiveSheet('')
    try {
      const parsed = readEmployeeWorkbook(await file.arrayBuffer()).map(sheet => mapEmployeeImportSheet(sheet, profile))
      const employees = repository.list()
      setExisting(employees); setSheets(parsed); setActiveSheet(parsed[0]?.name || ''); setFileName(file.name)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo preparar el archivo.') }
    finally { setLoading(false) }
  }

  const updateMapping = (field: EmployeeImportField, column: string) => {
    if (!sheet) return
    const next = { ...sheet, mapping: { ...sheet.mapping, [field]: column === '' ? null : Number(column) } }
    setSheets(current => current.map(item => item.name === sheet.name ? next : item))
    setCorrections({})
  }

  const correct = (rowNumber: number, field: keyof Corrections, value: string) => setCorrections(current => ({ ...current, [rowNumber]: { ...current[rowNumber], [field]: value } }))

  const importRows = () => {
    try {
      const count = new EmployeeSpreadsheetImportService(repository, profile).import(company.id, validRows)
      setConfirming(false); onComplete(count)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron importar los empleados.') }
  }

  return <div className="modal-backdrop import-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !confirming) onClose() }}>
    <section className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="employee-import-title">
      <div className="modal-head"><div><span className="eyebrow">PERSONAL · IMPORTACIÓN</span><h2 id="employee-import-title">Importar empleados desde Excel</h2><p>Destino: {company.tradeName || company.legalName}. El archivo se procesa localmente.</p></div><button className="icon-button" onClick={onClose} aria-label="Cerrar importador"><X size={18}/></button></div>
      <div className="import-upload-row"><label className="button button-secondary import-file-button"><Upload size={15}/>{fileName || 'Seleccionar archivo .xlsx'}<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={loadFile}/></label><small>No se envía el archivo a ningún servicio. Máximo 20 MB.</small></div>
      {loading && <div className="import-progress">Leyendo el archivo localmente…</div>}
      {sheets.length > 0 && <>
        <div className="import-settings"><label className="select-box import-sheet-select"><span>Hoja</span><select value={activeSheet} onChange={event => { setActiveSheet(event.target.value); setCorrections({}) }}>{sheets.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select><ChevronDown size={14}/></label><span className="import-file-name"><FileSpreadsheet size={15}/>{fileName}</span></div>
        {sheet && <>
          <details className="import-mapping"><summary>Revisar y corregir mapeo de columnas</summary><div className="import-mapping-grid">{profile.fields.map(field => <label className="form-field" key={field.key}><span>{field.label}{field.required && <i> *</i>}</span><select value={sheet.mapping[field.key] ?? ''} onChange={event => updateMapping(field.key, event.target.value)}><option value="">No mapear</option>{sheet.headers.map((header, index) => <option key={`${index}-${header}`} value={index}>{header || `Columna ${index + 1}`}</option>)}</select></label>)}</div></details>
          <div className="import-counts"><ImportCount label="Filas detectadas" value={rows.length + (basePreview?.ignoredEmpty || 0)}/><ImportCount label="Válidos" value={validRows.length} tone="green"/><ImportCount label="Duplicados" value={duplicateCount} tone="amber"/><ImportCount label="Errores" value={errorCount} tone="red"/><ImportCount label="Vacías ignoradas" value={basePreview?.ignoredEmpty || 0}/></div>
          {basePreview?.missingRequired.length ? <div className="import-warning" role="alert"><AlertCircle size={16}/>Faltan columnas obligatorias: {basePreview.missingRequired.join(', ')}. Corrige el mapeo para continuar.</div> : null}
          <div className="import-sensitive-note">El nombre completo se conserva sin separar apellidos y nombres. El sueldo se importa en USD y la cuenta se muestra parcialmente enmascarada.</div>
          <div className="import-table-wrap"><table className="import-table"><thead><tr><th>Fila</th><th>Identificación</th><th>Nombre completo</th><th>Cargo</th><th>Ubicación</th><th>Ingreso</th><th>Sueldo mensual</th><th>Cuenta bancaria</th><th>Validación</th></tr></thead><tbody>{rows.map(row => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td><input aria-label={`Identificación fila ${row.rowNumber}`} value={corrections[row.rowNumber]?.identityNumber ?? row.identityNumber} onChange={event => correct(row.rowNumber, 'identityNumber', event.target.value)}/>{row.originalIdentity && <small>Original: {row.originalIdentity}</small>}</td><td><input aria-label={`Nombre completo fila ${row.rowNumber}`} value={corrections[row.rowNumber]?.fullName ?? row.fullName} onChange={event => correct(row.rowNumber, 'fullName', event.target.value)}/></td><td><input aria-label={`Cargo fila ${row.rowNumber}`} value={corrections[row.rowNumber]?.position ?? row.position} onChange={event => correct(row.rowNumber, 'position', event.target.value)}/></td><td><input aria-label={`Ubicación fila ${row.rowNumber}`} value={corrections[row.rowNumber]?.location ?? row.location} onChange={event => correct(row.rowNumber, 'location', event.target.value)}/></td><td><input type="date" aria-label={`Fecha de ingreso fila ${row.rowNumber}`} value={corrections[row.rowNumber]?.hireDate ?? row.hireDate} onChange={event => correct(row.rowNumber, 'hireDate', event.target.value)}/></td><td>{row.monthlySalaryUsd === undefined ? 'Sin informar' : formatUsd(row.monthlySalaryUsd)}</td><td>{maskBankAccount(row.bankAccountNumber)}</td><td><span className={`import-status ${row.issues.length ? 'invalid' : 'valid'}`}>{row.issues.length ? row.duplicate ? 'Duplicado' : 'Revisar' : 'Válido'}</span>{row.issues.length > 0 && <small className="import-issue">{row.issues.join(' ')}</small>}</td></tr>)}</tbody></table>{!rows.length && <div className="import-no-rows">No hay registros para previsualizar en esta hoja.</div>}</div>
          <div className="import-footer"><span>Se guardarán solo los registros válidos y no duplicados.</span><button className="button button-primary" disabled={!validRows.length || Boolean(basePreview?.missingRequired.length)} onClick={() => { setError(''); setConfirming(true) }}><Check size={15}/>Importar {validRows.length} {validRows.length === 1 ? 'empleado' : 'empleados'}</button></div>
        </>}
      </>}
      {error && <div className="form-error import-error" role="alert">{error}</div>}
    </section>
    {confirming && <div className="modal-backdrop import-confirm-backdrop"><section className="modal context-confirm" role="alertdialog" aria-modal="true" aria-labelledby="import-confirm-title"><div className="modal-head"><div><span className="eyebrow">CONFIRMAR IMPORTACIÓN</span><h2 id="import-confirm-title">¿Importar {validRows.length} empleados?</h2><p>Se guardarán en {company.tradeName || company.legalName}. No se sobrescriben empleados existentes. El sueldo y la cuenta se guardarán como parte de cada ficha.</p></div></div><div className="modal-actions"><button className="button button-secondary" onClick={() => setConfirming(false)}>Volver a revisar</button><button className="button button-primary" onClick={importRows}><Check size={15}/>Confirmar importación</button></div></section></div>}
  </div>
}

function ImportCount({ label, value, tone = '' }: { label: string; value: number; tone?: string }) { return <div className={`import-count ${tone}`}><small>{label}</small><b>{value}</b></div> }
function formatUsd(value: number): string { return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(value) }
function maskBankAccount(value?: string): string { return value ? value.length <= 4 ? '••••' : `••••${value.slice(-4)}` : 'Sin informar' }
