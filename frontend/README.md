# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## API Proxy Configuration

The frontend is configured to proxy API requests through the React app to reuse authentication cookies. This allows seamless authentication without CORS issues.

### Development (Vite Proxy)

In development, Vite automatically proxies `/api/*` requests to the backend server:

- **Proxy Target**: `http://localhost:8000` (configurable via `VITE_API_BASE_URL`)
- **Proxy Path**: `/api/*` → Backend API
- **Authentication**: Cookies are automatically forwarded

To use the proxy, leave `VITE_API_BASE_URL` unset or empty in your `.env` file. The frontend will use relative URLs like `/api/v1/auth/me`.

To bypass the proxy and use a direct backend URL, set `VITE_API_BASE_URL` in your `.env`:
```bash
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

### Production (Nginx Proxy)

In production, nginx proxies API requests to the backend. Update `nginx/default.conf` to set your backend URL:

```nginx
location /api/ {
  proxy_pass http://backend:8000/api/;  # Replace with your backend URL
  # ... other proxy settings
}
```

**Backend URL Examples:**
- Docker Compose: `http://backend:8000/api/`
- Kubernetes: `http://backend-service:8000/api/`
- Standalone: `http://localhost:8000/api/`

### Benefits

1. **Same-Origin Cookies**: Frontend and backend appear on the same origin, so HTTP-only cookies work seamlessly
2. **No CORS Issues**: No need to configure CORS headers for cookie-based authentication
3. **Simplified Auth**: Authentication cookies are automatically included in all API requests
4. **Flexible**: Can easily switch between proxy and direct backend URL via environment variables

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x';
import reactDom from 'eslint-plugin-react-dom';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```
