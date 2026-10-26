import { useCallback, useRef, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ArrowRight, Bell, Building2, CalendarDays, Check, ChevronDown, FileClock, FileText, LayoutDashboard, Menu, Search, Settings, Users, WalletCards, X } from 'lucide-react'
import type { Company, CompanyStatus } from '../domain/company'
import { EmployeesPage } from '../features/employees/EmployeesPage'
import { createBrowserRepositories, type BrowserRepositories } from '../services/storage'
import { moduleRoutes } from '../navigation/modules'
import { Companies, CompanyModal, CompanyProfile, ContextPage, GeneralSettingsPage, Home, ModulePage, NotFound } from '../pages/PlatformPages'

const menu = [
  { title: 'Plataforma', items: [{ label: 'Inicio', path: '/', icon: LayoutDashboard }, { label: 'Empresas', path: '/empresas', icon: Building2 }] },
  { title: 'Empresa seleccionada', items: [{ label: 'Resumen', path: '/resumen', icon: LayoutDashboard }, { label: 'Personal', path: '/personal', icon: Users }, { label: 'Nóminas', path: '/nominas', icon: WalletCards }, { label: 'Novedades', path: '/novedades', icon: FileClock }, { label: 'Períodos', path: '/periodos', icon: CalendarDays }, { label: 'Plantillas', path: '/plantillas', icon: FileText }, { label: 'Recibos', path: '/recibos', icon: FileText }] },
  { title: 'Administración', items: [{ label: 'Configuración general', path: '/configuracion', icon: Settings }] },
]
function initialize(repositories: BrowserRepositories): { companies: Company[]; selected: string; error: string; companiesUnavailable: boolean } {
  let companies: Company[] = []
  let error = repositories.warning || ''
  let companiesUnavailable = false
  try { companies = repositories.companies.list() }
  catch (cause) { error = cause instanceof Error ? cause.message : 'No se pudieron leer las empresas guardadas.'; companiesUnavailable = true }
  let selected = ''
  try { selected = repositories.context.get() || '' }
  catch (cause) { error = [error, cause instanceof Error ? cause.message : 'No se pudo recuperar la empresa seleccionada.'].filter(Boolean).join(' ') }
  return { companies, selected, error, companiesUnavailable }
}

export default function App() {
  const [repositories] = useState(createBrowserRepositories)
  const [initial] = useState(() => initialize(repositories))
  const [companies, setCompanies] = useState<Company[]>(initial.companies)
  const [companiesUnavailable] = useState(initial.companiesUnavailable)
  const [selected, setSelected] = useState(initial.selected)
  const [persistenceError, setPersistenceError] = useState(initial.error)
  const [picker, setPicker] = useState(false)
  const [companyQuery, setCompanyQuery] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [modal, setModal] = useState<Company | 'new' | null>(null)
  const [pendingCompanyId, setPendingCompanyId] = useState<string | null>(null)
  const employeeEditing = useRef(false)
  const location = useLocation()
  const markEmployeeEditing = useCallback((editing: boolean) => { employeeEditing.current = editing }, [])
  const activeCompany = companies.find(c => c.id === selected && c.status === 'Activa')
  const availableCompanies = companies.filter(c => c.status === 'Activa' && `${c.tradeName} ${c.legalName} ${c.taxId}`.toLocaleLowerCase().includes(companyQuery.trim().toLocaleLowerCase()))
  const pageTitle = menu.flatMap(g => g.items).find(i => i.path === location.pathname)?.label || (location.pathname.startsWith('/empresas/') ? 'Perfil de empresa' : location.pathname.startsWith('/personal/') ? 'Personal' : 'Resumen')
  const saveCompanies = (next: Company[]) => {
    if (companiesUnavailable) { setPersistenceError('No guardé cambios porque las empresas guardadas no se pudieron leer. Se conservaron los datos existentes.'); return false }
    try { repositories.companies.saveAll(next); setCompanies(next); setPersistenceError(''); return true }
    catch (error) { setPersistenceError(error instanceof Error ? error.message : 'No se pudieron guardar los cambios.'); return false }
  }
  const saveCompany = (company: Company) => {
    const next = companies.some(item => item.id === company.id) ? companies.map(item => item.id === company.id ? company : item) : [...companies, company]
    if (!saveCompanies(next)) return false
    selectCompany(company.id)
    setModal(null)
    return true
  }
  const selectCompany = (id: string) => {
    if (id !== selected && employeeEditing.current) { setPendingCompanyId(id); return false }
    try { repositories.context.set(id); setSelected(id); setPersistenceError(''); return true }
    catch (error) { setPersistenceError(error instanceof Error ? error.message : 'No se pudo guardar la empresa seleccionada.'); return false }
  }
  const confirmCompanyChange = () => {
    if (!pendingCompanyId) return
    employeeEditing.current = false
    try { repositories.context.set(pendingCompanyId); setSelected(pendingCompanyId); setPersistenceError('') }
    catch (error) { setPersistenceError(error instanceof Error ? error.message : 'No se pudo guardar la empresa seleccionada.') }
    setPendingCompanyId(null)
  }
  const toggleStatus = (company: Company) => {
    const next: Company[] = companies.map(item => {
      if (item.id !== company.id) return item
      const status: CompanyStatus = item.status === 'Activa' ? 'Inactiva' : 'Activa'
      return { ...item, status }
    })
    if (!saveCompanies(next)) return
    if (company.status === 'Activa' && selected === company.id) {
      try { repositories.context.set(null); setSelected('') }
      catch (error) { setPersistenceError(error instanceof Error ? error.message : 'No se pudo actualizar la empresa seleccionada.') }
    }
  }
  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
      <Link to="/" className="brand"><span className="brand-mark">A&amp;B</span><span>CONSULTORES</span></Link>
      <nav>{menu.map((group, index) => <div className="nav-group" key={`${group.title}-${index}`}><div className="nav-caption">{group.title}</div>{group.items.map(item => <NavLink key={item.path} to={item.path} end={item.path === '/'} onClick={() => setMobileMenu(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><item.icon size={17}/><span>{item.label}</span></NavLink>)}</div>)}</nav>
      <div className="sidebar-foot"><span className="status-dot"/> Plataforma de gestión <small>Versión inicial</small></div>
    </aside>
    {mobileMenu && <button className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú"/>}
    <main className="main-area">
      <header className="topbar">
        <button className="icon-button mobile-toggle" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir menú"><Menu size={19}/></button>
        <div className="breadcrumbs"><span>A&amp;B Consultores</span><span className="crumb-separator">/</span><strong>{pageTitle}</strong></div>
        <div className="top-actions">
          <div className="company-switch-wrap"><button className={`company-switch ${picker ? 'is-open' : ''}`} onClick={() => { setPicker(!picker); setCompanyQuery('') }} aria-expanded={picker} aria-label="Seleccionar empresa"><span className="switch-icon"><Building2 size={16}/></span><span className="switch-copy"><small>Empresa seleccionada</small><b>{activeCompany?.tradeName || activeCompany?.legalName || 'Seleccionar empresa'}</b></span><ChevronDown size={15}/></button>
            {picker && <div className="switch-menu"><div className="switch-menu-heading"><div className="switch-menu-head">Cambiar de empresa</div><button className="picker-close" onClick={() => setPicker(false)} aria-label="Cerrar selector"><X size={15}/></button></div><label className="switch-search"><Search size={14}/><input autoFocus value={companyQuery} onChange={event => setCompanyQuery(event.target.value)} placeholder="Buscar empresa"/><kbd>⌘ K</kbd></label>{companies.length === 0 ? <div className="switch-empty"><b>Aún no hay empresas</b><span>Registra una empresa para iniciar su espacio de trabajo.</span></div> : availableCompanies.length === 0 ? <div className="switch-empty">{companies.some(c => c.status === 'Activa') ? 'No hay coincidencias.' : 'No hay empresas activas disponibles.'}</div> : availableCompanies.map(c => <button key={c.id} className="switch-option" onClick={() => { selectCompany(c.id); setPicker(false) }}><Building2 size={16}/><span><b>{c.tradeName || c.legalName}</b><small>{c.taxId}</small></span>{selected === c.id && <Check size={15}/>}</button>)}<Link className="switch-manage" to="/empresas" onClick={() => setPicker(false)}>Administrar empresas <ArrowRight size={14}/></Link></div>}
          </div>
          <button className="icon-button notification-button" aria-label="Notificaciones"><Bell size={18}/><i/></button><div className="user-block"><div className="avatar">AB</div><div><b>A&amp;B Consultores</b><small>Administración</small></div><ChevronDown size={14} className="user-chevron"/></div>
        </div>
      </header>
      <div className="content"><Routes>
        <Route path="/" element={<Home companies={companies} onNew={() => setModal('new')} />} />
        <Route path="/empresas" element={<Companies companies={companies} onNew={() => setModal('new')} onEdit={company => setModal(company)} />} />
        <Route path="/empresas/:id" element={<CompanyProfile companies={companies} onEdit={c => setModal(c)} onToggle={toggleStatus} onSelect={selectCompany} />} />
        <Route path="/configuracion" element={<GeneralSettingsPage/>} />
        <Route path="/resumen" element={<ContextPage company={activeCompany} employeeRepository={repositories.employees} />} />
        <Route path="/personal" element={<EmployeesPage key={activeCompany?.id || 'no-company'} company={activeCompany} repository={repositories.employees} onEditingChange={markEmployeeEditing} />} />
        <Route path="/personal/:employeeId" element={<EmployeesPage key={activeCompany?.id || 'no-company'} company={activeCompany} repository={repositories.employees} onEditingChange={markEmployeeEditing} />} />
        {moduleRoutes.map(config => <Route key={config.path} path={config.path} element={<ModulePage company={activeCompany} title={config.title} description={config.description} Icon={config.icon}/>} />)}
        <Route path="*" element={<NotFound/>}/>
      </Routes></div>
      <footer className="footer"><span>© {new Date().getFullYear()} A&amp;B Consultores</span><span>Gestión de nómina <i/> Plataforma inicial</span></footer>
    </main>
    {persistenceError && <div className="global-persistence-notice" role="alert">{persistenceError}<button onClick={() => setPersistenceError('')} aria-label="Cerrar aviso">×</button></div>}
    {modal && <CompanyModal value={modal === 'new' ? undefined : modal} onClose={() => setModal(null)} onSave={saveCompany}/>}
    {pendingCompanyId && <div className="modal-backdrop"><section className="modal context-confirm" role="dialog" aria-modal="true" aria-labelledby="context-confirm-title"><div className="modal-head"><div><span className="eyebrow">CAMBIO DE EMPRESA</span><h2 id="context-confirm-title">¿Cambiar el contexto?</h2><p>Hay un formulario de empleado abierto. Si cambias de empresa, se descartarán los cambios que aún no guardaste.</p></div></div><div className="modal-actions"><button className="button button-secondary" onClick={() => setPendingCompanyId(null)}>Seguir editando</button><button className="button button-primary" onClick={confirmCompanyChange}>Descartar y cambiar</button></div></section></div>}
  </div>
}

