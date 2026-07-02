import { useCallback, useEffect, useState } from 'react'
import './team-users.css'

type TeamUser = {
id: string
name: string
email: string
role: string
isActive: boolean
emailVerifiedAt: string | null
twoFactorEnabled: boolean
twoFactorConfirmedAt: string | null
createdAt: string
updatedAt: string
}

type CurrentUser = {
id: string
name: string
email: string
role: string
}

type TeamUsersPageProps = {
apiUrl: string
currentUser: CurrentUser
showToast: (message: string, type?: 'success' | 'error') => void
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

function formatDate(value?: string | null) {
if (!value) {
return '-'
}

return new Date(value).toLocaleString()
}

export function TeamUsersPage({
apiUrl,
currentUser,
showToast,
}: TeamUsersPageProps) {
const [teamUsers, setTeamUsers] = useState<TeamUser[]>([])
const [loading, setLoading] = useState(false)
const [saving, setSaving] = useState(false)

const isAdmin = currentUser.role === 'admin'

const loadTeamUsers = useCallback(async () => {
  setLoading(true)

  try {
    const response = await fetch(`${apiUrl}/team-users`, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(await readApiError(response, 'Failed to load team users'))
    }

    const data = await response.json()
    setTeamUsers(Array.isArray(data) ? data : [])
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : 'Failed to load team users',
      'error',
    )
  } finally {
    setLoading(false)
  }
}, [apiUrl, showToast])

async function createTeamUser(event: React.FormEvent<HTMLFormElement>) {
event.preventDefault()

if (!isAdmin) {
  showToast('Only tenant admin can create team users', 'error')
  return
}

const form = new FormData(event.currentTarget)
const name = String(form.get('name') || '').trim()
const email = String(form.get('email') || '').trim().toLowerCase()
const role = String(form.get('role') || 'agent').trim()
const password = String(form.get('password') || '')

setSaving(true)

try {
  const response = await fetch(`${apiUrl}/team-users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      name,
      email,
      role,
      password,
    }),
  })

  if (!response.ok) {
    throw new Error(await readApiError(response, 'Failed to create team user'))
  }

  const createdUser = await response.json()

  setTeamUsers((current) => [
    createdUser,
    ...current.filter((user) => user.id !== createdUser.id),
  ])

  event.currentTarget.reset()
  showToast('Team user created successfully')
} catch (error) {
  showToast(
    error instanceof Error ? error.message : 'Failed to create team user',
    'error',
  )
} finally {
  setSaving(false)
}

}

async function deactivateTeamUser(user: TeamUser) {
if (user.id === currentUser.id) {
showToast('You cannot deactivate your own account', 'error')
return
}

const confirmed = window.confirm(
  `Deactivate ${user.name}? They will lose workspace access.`,
)

if (!confirmed) {
  return
}

setSaving(true)

try {
  const response = await fetch(`${apiUrl}/team-users/${user.id}/deactivate`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(
      await readApiError(response, 'Failed to deactivate team user'),
    )
  }

  await loadTeamUsers()
  showToast('Team user deactivated')
} catch (error) {
  showToast(
    error instanceof Error
      ? error.message
      : 'Failed to deactivate team user',
    'error',
  )
} finally {
  setSaving(false)
}

}

useEffect(() => {
  const timer = window.setTimeout(() => {
    void loadTeamUsers()
  }, 0)

  return () => window.clearTimeout(timer)
}, [loadTeamUsers])

return (
<div className="team-users-workspace">
<section className="team-users-hero">
<div>
<p className="team-users-eyebrow">Tenant access control</p>
<h2>Team Users</h2>
<p>
Add staff users safely. Backend checks your plan limit and always uses
your logged-in tenant.
</p>
</div>

    <button type="button" onClick={loadTeamUsers} disabled={loading}>
      {loading ? 'Refreshing...' : 'Refresh'}
    </button>
  </section>

  {!isAdmin ? (
    <section className="team-users-warning">
      Only tenant admin can create or deactivate team users.
    </section>
  ) : null}

  {isAdmin ? (
    <section className="team-users-card">
      <h3>Create team user</h3>

      <form className="team-users-form" onSubmit={createTeamUser}>
        <input name="name" placeholder="Full name" />
        <input name="email" placeholder="Email" type="email" />

        <select name="role" defaultValue="agent">
          <option value="agent">Agent</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>

        <input
          name="password"
          placeholder="Temporary strong password"
          type="password"
        />

        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Create User'}
        </button>
      </form>

      <p className="team-users-note">
        Use a strong temporary password and ask the user to change it after
        first login.
      </p>
    </section>
  ) : null}

  <section className="team-users-card">
    <h3>Current team</h3>

    {teamUsers.length === 0 ? (
      <p className="team-users-empty">
        {loading ? 'Loading team users...' : 'No team users found.'}
      </p>
    ) : (
      <div className="team-users-list">
        {teamUsers.map((user) => (
          <article className="team-users-row" key={user.id}>
            <div>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>

            <div>
              <strong>{user.role}</strong>
              <span>{user.isActive ? 'Active' : 'Inactive'}</span>
            </div>

            <div>
              <strong>2FA</strong>
              <span>
                {user.twoFactorEnabled && user.twoFactorConfirmedAt
                  ? 'Enabled'
                  : 'Not enabled'}
              </span>
            </div>

            <div>
              <strong>Created</strong>
              <span>{formatDate(user.createdAt)}</span>
            </div>

            <div className="team-users-actions">
              {isAdmin && user.isActive && user.id !== currentUser.id ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => deactivateTeamUser(user)}
                >
                  Deactivate
                </button>
              ) : (
                <span>-</span>
              )}
            </div>
          </article>
        ))}
      </div>
    )}
  </section>
</div>

)
}