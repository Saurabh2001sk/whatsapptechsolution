import axios from 'axios'

// 1. Dynamic Environment Detection (Local vs Live Render Cloud)
export const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'

const getBackendUrl = () => {
  const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '')
  if (configuredApiUrl) return configuredApiUrl

  if (!isProduction) {
    return 'http://localhost:5000'
  }

  throw new Error('VITE_API_URL is required in production frontend environment')
}

export const apiBaseUrl = getBackendUrl()

// 2. Create Axios Instance with standard configuration
export const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  timeout: 20000,
})

// 3. Security Clean-up: Prevent frontend from tempering with tenant IDs (From your original code)
function stripTenantKeys(value) {
  if (!value || typeof value !== 'object') return value
  if (value instanceof FormData || value instanceof Blob || value instanceof File) return value
  if (Array.isArray(value)) return value.map(stripTenantKeys)

  const clean = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === 'tenantId' || key === 'tenant_id') continue
    clean[key] = stripTenantKeys(item)
  }
  return clean
}

// 4. Request Interceptor: Clean Tenant Keys
api.interceptors.request.use((config) => {
  const method = String(config.method || 'get').toUpperCase()
  const isWriteRequest = !['GET', 'HEAD', 'OPTIONS'].includes(method)

config.headers = config.headers || {}

if (config.headers) {
    if (typeof config.headers.delete === 'function') {
      config.headers.delete('Authorization')
    }

    delete config.headers.Authorization
    delete config.headers.authorization

    config.headers['X-Requested-With'] = 'XMLHttpRequest'

    if (isWriteRequest) {
      config.headers['X-CSRF-Intent'] = 'same-origin-write'
    }
  }

  if (config.data) config.data = stripTenantKeys(config.data)
  if (config.params) config.params = stripTenantKeys(config.params)

  return config
})

let authExpiredDispatched = false

export function formatApiIssue(error) {
  const status = error.response?.status
  const method = String(error.config?.method || 'GET').toUpperCase()
  const requestUrl = error.config?.url || 'unknown endpoint'
  const backendMessage = error.response?.data?.error || error.response?.data?.message
  const message = backendMessage || error.message || 'Unknown frontend/API issue'

  return status
    ? `${method} ${requestUrl} failed (${status}): ${message}`
    : `${method} ${requestUrl} failed: ${message}`
}

// 5. Response Interceptor: Error Handlers and Popups (From your original code)
api.interceptors.response.use(
  (response) => {
    authExpiredDispatched = false
    return response
  },
  (error) => {
    const status = error.response?.status
    const requestUrl = error.config?.url || ''
    const isSessionExpired = status === 401
      && !requestUrl.includes('/api/auth/login')
      && !error.config?.silentError

    if (!error.config?.silentError && !isSessionExpired) {
      window.dispatchEvent(new CustomEvent('bos-api-error', {
        detail: { message: formatApiIssue(error) },
      }))
    }

    if (isSessionExpired && !authExpiredDispatched) {
      authExpiredDispatched = true
      window.dispatchEvent(new Event('bos-auth-expired'))
    }

    return Promise.reject(error)
  },
)

// Export default for backward compatibility compatibility if required anywhere
export default api
