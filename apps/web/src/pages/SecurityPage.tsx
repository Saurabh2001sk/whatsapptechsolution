import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import '../css/security.css'

type CurrentSecurityUser = {
  id: string
  name: string
  email: string
  role: string
  emailVerifiedAt: string | null
  twoFactorEnabled: boolean
  twoFactorConfirmedAt: string | null
}

type TwoFactorStatus = {
  enabled: boolean
  required: boolean
  confirmedAt: string | null
  lastUsedAt: string | null
  backupCodesRemaining: number
}

type BackupCodesResponse = {
  ok: boolean
  backupCodes: string[]
}

type TwoFactorSetup = {
  setupKey: string
  qrCodeDataUrl: string
}

type SecurityPageProps = {
  apiUrl: string
  currentUser: CurrentSecurityUser
  showToast: (message: string, type?: 'success' | 'error') => void
  onSecurityChanged: () => Promise<void>
}

export function SecurityPage({
  apiUrl,
  currentUser,
  showToast,
  onSecurityChanged,
}: SecurityPageProps) {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null)
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [backupCodes, setBackupCodes] = useState<string[]>([])

  const isHighPrivilegeRole = useMemo(
    () => ['platform_admin', 'super_admin'].includes(currentUser.role),
    [currentUser.role],
  )

  const securityScore = useMemo(() => {
    const checks = [
      Boolean(currentUser.emailVerifiedAt),
      Boolean(status?.enabled),
      Boolean(status?.confirmedAt),
      Boolean(status?.backupCodesRemaining),
      true,
      true,
      true,
    ]

    const passed = checks.filter(Boolean).length

    return Math.round((passed / checks.length) * 100)
  }, [currentUser.emailVerifiedAt, status])

  useEffect(() => {
    void loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function readApiError(response: Response, fallback: string) {
    try {
      const data = await response.json()

      if (typeof data.message === 'string') {
        return data.message
      }

      if (typeof data.error === 'string') {
        return data.error
      }

      return fallback
    } catch {
      return fallback
    }
  }

  async function loadStatus() {
    setLoading(true)

    try {
      const response = await fetch(`${apiUrl}/two-factor/status`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Failed to load 2FA status'))
      }

      setStatus(await response.json())
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to load 2FA status',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

  async function startSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWorking(true)

    const formElement = event.currentTarget
    const form = new FormData(formElement)

    try {
      const response = await fetch(`${apiUrl}/two-factor/setup/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          password: form.get('password'),
        }),
      })

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Failed to start 2FA setup'))
      }

      setSetup(await response.json())
      formElement.reset()
      showToast('Scan QR code with your authenticator app')
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to start 2FA setup',
        'error',
      )
    } finally {
      setWorking(false)
    }
  }

  async function confirmSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWorking(true)

    const formElement = event.currentTarget
    const form = new FormData(formElement)

    try {
      const response = await fetch(`${apiUrl}/two-factor/setup/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          code: form.get('code'),
        }),
      })

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Failed to confirm 2FA'))
      }

      const data = (await response.json()) as BackupCodesResponse

      formElement.reset()
      setSetup(null)
      setBackupCodes(data.backupCodes || [])
      await loadStatus()
      await onSecurityChanged()
      showToast('2FA enabled successfully')
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to confirm 2FA',
        'error',
      )
    } finally {
      setWorking(false)
    }
  }

  async function disableTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWorking(true)

    const formElement = event.currentTarget
    const form = new FormData(formElement)

    try {
      const response = await fetch(`${apiUrl}/two-factor/disable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          password: form.get('password'),
          code: form.get('code'),
        }),
      })

      if (!response.ok) {
        throw new Error(await readApiError(response, 'Failed to disable 2FA'))
      }

      formElement.reset()
      setSetup(null)
      await loadStatus()
      await onSecurityChanged()
      showToast('2FA disabled')
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to disable 2FA',
        'error',
      )
    } finally {
      setWorking(false)
    }
  }

  async function regenerateBackupCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWorking(true)

    const formElement = event.currentTarget
    const form = new FormData(formElement)

    try {
      const response = await fetch(`${apiUrl}/two-factor/backup-codes/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          password: form.get('password'),
          code: form.get('code'),
        }),
      })

      if (!response.ok) {
        throw new Error(
          await readApiError(response, 'Failed to regenerate backup codes'),
        )
      }

      const data = (await response.json()) as BackupCodesResponse

      formElement.reset()
      setBackupCodes(data.backupCodes || [])
      await loadStatus()
      showToast('Backup codes regenerated')
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Failed to regenerate backup codes',
        'error',
      )
    } finally {
      setWorking(false)
    }
  }

  function formatDate(value: string | null) {
    if (!value) {
      return 'Not available'
    }

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
      return 'Not available'
    }

    return date.toLocaleString()
  }

  return (
    <div className="security-page">
      <div className="security-hero">
        <div>
          <p className="security-eyebrow">Security center</p>
          <h2>Admin Security Dashboard</h2>
          <p>
            Review your account protection, 2FA status, audit protection, and
            production security readiness.
          </p>
        </div>

        <div className="security-score-card">
          <strong>{securityScore}%</strong>
          <span>Security score</span>
        </div>
      </div>

      {loading ? (
        <div className="security-card">Loading security settings...</div>
      ) : (
        <>
          {isHighPrivilegeRole && !status?.enabled ? (
            <div className="security-critical-warning">
              <strong>High privilege account needs 2FA</strong>
              <span>
                Your role is {currentUser.role}. Backend now blocks sensitive
                platform/admin actions until 2FA is enabled and confirmed.
              </span>
            </div>
          ) : null}

          {!currentUser.emailVerifiedAt ? (
            <div className="security-warning">
              <strong>Email verification pending</strong>
              <span>
                Verify your email before production use. This protects password
                reset and account ownership.
              </span>
            </div>
          ) : null}

          <section className="security-grid security-dashboard-grid">
            <article className="security-card">
              <strong>Email verification</strong>
              <span
                className={`security-mini-status ${
                  currentUser.emailVerifiedAt ? 'enabled' : 'disabled'
                }`}
              >
                {currentUser.emailVerifiedAt ? 'Verified' : 'Pending'}
              </span>
              <small>{formatDate(currentUser.emailVerifiedAt)}</small>
            </article>

            <article className="security-card">
              <strong>Two-factor authentication</strong>
              <span
                className={`security-mini-status ${
                  status?.enabled ? 'enabled' : 'disabled'
                }`}
              >
                {status?.enabled ? 'Enabled' : 'Disabled'}
              </span>
              <small>Confirmed: {formatDate(status?.confirmedAt || null)}</small>
            </article>

            <article className="security-card">
              <strong>Session protection</strong>
              <span className="security-mini-status enabled">Enabled</span>
              <small>
                Password reset and 2FA disable invalidate old login sessions.
              </small>
            </article>

            <article className="security-card">
              <strong>Rate limiting</strong>
              <span className="security-mini-status enabled">Enabled</span>
              <small>
                Login, reset password, email verification, and 2FA attempts are
                protected.
              </small>
            </article>

            <article className="security-card">
              <strong>Audit protection</strong>
              <span className="security-mini-status enabled">Enabled</span>
              <small>
                Audit logs are tenant-isolated, searchable, exportable, and
                redacted.
              </small>
            </article>

            <article className="security-card">
              <strong>Backup codes</strong>
              <span
                className={`security-mini-status ${
                  status?.backupCodesRemaining ? 'enabled' : 'disabled'
                }`}
              >
                {status?.backupCodesRemaining || 0} remaining
              </span>
              <small>Regenerate if codes are lost or exposed.</small>
            </article>
          </section>

          <section className="security-grid">
            <article className="security-card">
              <strong>Current 2FA status</strong>
              <span>Enabled: {status?.enabled ? 'Yes' : 'No'}</span>
              <span>Required for your role: {status?.required ? 'Yes' : 'No'}</span>
              <span>Confirmed: {formatDate(status?.confirmedAt || null)}</span>
              <span>Last used: {formatDate(status?.lastUsedAt || null)}</span>
            </article>

            <article className="security-card">
              <strong>How 2FA works</strong>
              <span>1. Scan QR code in authenticator app.</span>
              <span>2. Enter the 6-digit code to confirm.</span>
              <span>3. Future logins ask for password + code.</span>
            </article>
          </section>

          {!status?.enabled ? (
            <section className="security-panel">
              <div className="security-panel-header">
                <div>
                  <h3>Enable 2FA</h3>
                  <p>
                    Enter your current password first. Then scan QR and confirm
                    with your authenticator app.
                  </p>
                </div>

                {!setup ? (
                  <form className="security-form" onSubmit={startSetup}>
                    <input
                      name="password"
                      placeholder="Current password"
                      type="password"
                    />
                    <button type="submit" disabled={working}>
                      {working ? 'Starting...' : 'Start setup'}
                    </button>
                  </form>
                ) : null}
              </div>

              {setup ? (
                <div className="security-setup-box">
                  <img src={setup.qrCodeDataUrl} alt="2FA QR code" />

                  <div>
                    <strong>Manual setup key</strong>
                    <code>{setup.setupKey}</code>

                    <form className="security-form" onSubmit={confirmSetup}>
                      <input
                        name="code"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="Enter 6-digit code"
                      />
                      <button type="submit" disabled={working}>
                        {working ? 'Verifying...' : 'Confirm and enable'}
                      </button>
                    </form>
                  </div>
                </div>
              ) : null}
            </section>
          ) : (
            <>
              {backupCodes.length > 0 ? (
                <section className="security-panel backup-codes">
                  <div>
                    <h3>Save your backup codes now</h3>
                    <p>
                      These codes are shown only once. Store them somewhere
                      safe. Each code can be used one time during login if your
                      authenticator phone is lost.
                    </p>
                  </div>

                  <div className="backup-code-grid">
                    {backupCodes.map((backupCode) => (
                      <code key={backupCode}>{backupCode}</code>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="security-panel">
                <div className="security-panel-header">
                  <div>
                    <h3>Backup recovery codes</h3>
                    <p>
                      Remaining unused codes: {status.backupCodesRemaining}.
                      Regenerate codes if old codes are lost or exposed.
                    </p>
                  </div>
                </div>

                <form
                  className="security-form security-disable-form"
                  onSubmit={regenerateBackupCodes}
                >
                  <input
                    name="password"
                    placeholder="Current password"
                    type="password"
                  />
                  <input name="code" placeholder="Authenticator or backup code" />
                  <button type="submit" disabled={working}>
                    {working ? 'Regenerating...' : 'Regenerate codes'}
                  </button>
                </form>
              </section>

              <section className="security-panel danger">
                <div className="security-panel-header">
                  <div>
                    <h3>Disable 2FA</h3>
                    <p>
                      Enter your password and current authenticator code to
                      disable 2FA. This will also invalidate old sessions.
                    </p>
                  </div>
                </div>

                <form
                  className="security-form security-disable-form"
                  onSubmit={disableTwoFactor}
                >
                  <input
                    name="password"
                    placeholder="Current password"
                    type="password"
                  />
                  <input
                    name="code"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit authenticator code"
                  />
                  <button type="submit" disabled={working}>
                    {working ? 'Disabling...' : 'Disable 2FA'}
                  </button>
                </form>
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}