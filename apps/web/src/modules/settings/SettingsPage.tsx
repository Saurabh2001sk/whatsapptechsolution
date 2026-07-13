type ShowToast = (text: string, type?: 'success' | 'error') => void

type MetaConnection = {
  connected: boolean
  account: {
    id: string
    metaAppId: string | null
    wabaId: string
    phoneNumberId: string
    businessName: string | null
    isActive: boolean
  } | null
} | null

type SettingsPageProps = {
  apiUrl: string
  metaConnection: MetaConnection
  showToast: ShowToast
  onGoToBilling: () => void
}

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

export function SettingsPage({
  apiUrl,
  metaConnection,
  showToast,
  onGoToBilling,
}: SettingsPageProps) {
  async function testMetaConnection() {
    const response = await fetch(`${apiUrl}/meta-accounts/test`, {
      method: 'POST',
      credentials: 'include',
    })

    if (!response.ok) {
      showToast(
        await readApiError(response, 'Meta connection test failed'),
        'error',
      )
      return
    }

    showToast('Meta connection test successful')
  }

  return (
    <div className="content-card">
      <div className="contacts-topbar">
        <div>
          <h2>Settings</h2>
          <p>
            WhatsApp connection is managed securely from Billing using Facebook
            Embedded Signup.
          </p>
        </div>

        <span className="status-pill">
          {metaConnection?.connected ? 'Meta connected' : 'Not connected'}
        </span>
      </div>

      <section className="sub-card">
        <div className="section-heading">
          <div>
            <h3>Meta WhatsApp Connection</h3>
            <p>
              Access tokens are never entered in the frontend. Connect WhatsApp
              from Billing after your plan is active.
            </p>
          </div>
        </div>

        {metaConnection?.connected ? (
          <div className="import-export-bar">
            <button type="button" onClick={testMetaConnection}>
              Test Meta Connection
            </button>
          </div>
        ) : (
          <div className="import-export-bar">
            <button type="button" onClick={onGoToBilling}>
              Go to Billing & Connect WhatsApp
            </button>
          </div>
        )}
      </section>
    </div>
  )
}