import axios from 'axios'

export const isProduction = import.meta.env.PROD
export const configuredApiUrl = import.meta.env.VITE_API_URL || ''
export const devApiFallbackUrl = 'http://localhost:5000'
export const apiBaseUrl = (configuredApiUrl || (isProduction ? '' : devApiFallbackUrl)).replace(/\/$/, '')

export const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS || 20000),
})

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

api.interceptors.request.use((config) => {
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

