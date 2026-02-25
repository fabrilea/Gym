# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  # Frontend Gym App

  Interfaz web del sistema de gestión de gimnasio.

  ## Descripción

  Este frontend provee la capa visual para operar los principales procesos del negocio: acceso de usuarios administrativos, gestión de socios, control de asistencias y visualización del estado mensual.

  ## Tecnologías

  - React
  - TypeScript
  - Vite

  ## Alcance funcional

  - Pantallas de autenticación.
  - Vistas para administración de socios.
  - Operaciones de check-in.
  - Gestión de estado mensual y facturación.
  - Integración con la API del backend.

  ## Enfoque

  La aplicación está orientada a uso interno, con una estructura simple y mantenible, priorizando rapidez operativa y consistencia en la interacción.

