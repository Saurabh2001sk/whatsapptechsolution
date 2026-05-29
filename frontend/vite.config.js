import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const privateFrontendEnv = path.resolve(projectRoot, '..', 'private', 'frontend.env')

function loadPrivateFrontendEnv() {
  if (!fs.existsSync(privateFrontendEnv)) return

  const envText = fs.readFileSync(privateFrontendEnv, 'utf8')

  for (const line of envText.split(/\r?\n/)) {
    const cleanLine = line.trim()
    if (!cleanLine || cleanLine.startsWith('#') || !cleanLine.includes('=')) continue

    const separatorIndex = cleanLine.indexOf('=')
    const key = cleanLine.slice(0, separatorIndex).trim()
    let value = cleanLine.slice(separatorIndex + 1).trim()

    if (!key.startsWith('VITE_')) continue
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    process.env[key] = process.env[key] || value
  }
}

loadPrivateFrontendEnv()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
