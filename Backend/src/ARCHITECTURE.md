# Límite de dominio futuro

Al iniciar la implementación del backend, mantener las reglas puras y aisladas de sus adaptadores:

- `companies/` y `employees/`: tipos y casos de uso del dominio.
- `payroll/common/`: conceptos y reglas realmente compartidos entre empresas.
- `payroll/templates/<empresa>/`: reglas específicas, únicamente cuando una plantilla sea aprobada para desarrollo.
- `shared/`: primitivas pequeñas que tengan más de un consumidor real.

La estructura es una guía y se creará junto con código funcional, sin módulos vacíos. La plantilla OMIRA y el motor de cálculo siguen fuera del alcance actual.
