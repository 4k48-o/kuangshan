# 选矿生产管理系统 (kuangshan_new)

前端：React + TypeScript + Vite；后端：Express + Prisma + MySQL。

**项目结构**：详见 [项目结构说明.md](./项目结构说明.md)。主要目录：`src/` 前端、`server/` 后端、`python/` Python 脚本、`data/excel/` Excel 模板与报表数据。

### 前端部署到 Nginx

1. **构建**（在项目根目录）：
   ```bash
   npm run build
   ```
   产物在 `dist/`，且会使用 `.env.production` 中的 `VITE_API_BASE_URL=/api`。

2. **Nginx**：使用 `deploy/nginx.conf` 示例，将 `root` 改为你的 `dist` 绝对路径（如 `/usr/local/kuangshan/dist`），将 `server_name` 改为域名或 IP，然后：
   ```bash
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/kuangshan
   sudo ln -sf /etc/nginx/sites-available/kuangshan /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

3. **后端**：需在服务器上单独运行（如 `cd server && npm start` 或 pm2），并保证监听 `3000`，Nginx 会把 `/api` 代理到 `http://127.0.0.1:3000/api`。

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  extends: [
    // other configs...
    // Enable lint rules for React
    reactX.configs['recommended-typescript'],
    // Enable lint rules for React DOM
    reactDom.configs.recommended,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```
