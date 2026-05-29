import axios from 'axios'

export const isProduction = import.meta.env.PROD
export const configuredApiUrl = import.meta.env.VITE_API_URL || ''
export const apiBaseUrl = configuredApiUrl.replace(/\/$/, '')
export const api = axios.create({ baseURL: apiBaseUrl, withCredentials: true })

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
  (response) => response,
  (error) => {
    const status = error.response?.status
    const requestUrl = error.config?.url || ''

    if (!error.config?.silentError) {
      window.dispatchEvent(new CustomEvent('bos-api-error', {
        detail: { message: formatApiIssue(error) },
      }))
    }

    if (status === 401 && !requestUrl.includes('/api/auth/login')) {
      window.dispatchEvent(new Event('bos-auth-expired'))
    }

    return Promise.reject(error)
  },
)


