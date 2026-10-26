import { CalendarDays, FileClock, FileText, WalletCards, type LucideIcon } from 'lucide-react'

export interface ModuleRoute {
  path: string
  title: string
  description: string
  icon: LucideIcon
}

export const moduleRoutes: ModuleRoute[] = [
  { path: '/nominas', title: 'Nóminas', description: 'Aquí podrás consultar y gestionar los procesos de nómina de la empresa.', icon: WalletCards },
  { path: '/novedades', title: 'Novedades', description: 'Registra y organiza las novedades que se prepararán para futuros períodos.', icon: FileClock },
  { path: '/periodos', title: 'Períodos', description: 'Define los períodos de nómina cuando este módulo esté disponible.', icon: CalendarDays },
  { path: '/plantillas', title: 'Plantillas', description: 'Las plantillas de nómina de cada empresa se administrarán desde aquí.', icon: FileText },
  { path: '/recibos', title: 'Recibos', description: 'Los recibos estarán disponibles cuando se habilite el procesamiento de nómina.', icon: FileText },
]
