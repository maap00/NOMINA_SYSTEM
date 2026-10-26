export type CompanyStatus = 'Activa' | 'Inactiva'

export interface Company {
  id: string
  legalName: string
  taxId: string
  tradeName: string
  contactName: string
  email: string
  phone: string
  status: CompanyStatus
  createdAt: string
}
