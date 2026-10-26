# A&B Consultores · Gestión de nómina

Aplicación web en fase inicial para organizar empresas y su personal. La interfaz vive en `Frontend/`; `Backend/` documenta el límite arquitectónico previsto para una fase futura, sin servidor ni dependencias instaladas.

## Requisitos

- Node.js 22 o compatible con Vite 8.
- npm.

## Instalar y ejecutar

```bash
npm run install:frontend
npm run dev
```

## Comprobaciones

Desde la raíz del repositorio:

```bash
npm test
npm run lint
npm run build
```

Estos comandos puente ejecutan los scripts del frontend. `npm test` ejecuta las pruebas unitarias ubicadas en `Frontend/tests/`; el build verifica TypeScript y genera los archivos de producción en `Frontend/dist/`.

## Arquitectura actual

- `Frontend/src/domain/`: tipos y validaciones de dominio sin React ni acceso al navegador.
- `Frontend/src/services/`: casos de uso y contratos de repositorio; los adaptadores actuales usan almacenamiento local del navegador.
- `Frontend/src/features/`: pantallas y formularios organizados por módulo, actualmente personal/empleados.
- `Frontend/src/app/`: composición, rutas, navegación y coordinación de contexto.
- `Backend/`: límites y convenciones para el futuro dominio TypeScript puro. No contiene API ni persistencia remota.
- `Frontend/tests/`: pruebas automatizadas de reglas y casos de persistencia.

## Persistencia temporal

Las empresas y empleados se guardan en `localStorage` en este navegador. No es una solución multiusuario, no sincroniza dispositivos y no debe usarse en producción. Si el navegador bloquea el almacenamiento, la aplicación informa que los cambios solo duran durante la sesión.
