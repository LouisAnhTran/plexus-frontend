import { useEffect, useState } from 'react'
import { api } from '../api'

/**
 * The catalog of MCP servers this app supports.
 *
 * Three states a server can be in:
 *   supported  it exists in this list at all (declared server-side, in code)
 *   wired      connected once, tools discovered   <- the checkbox
 *   bound      some agent selected it             <- done in the agent editor
 *
 * Ticking the box is not a local toggle: it makes the backend connect, run
 * tools/list, and cache the result. That is why it can fail, and why the
 * failure reason is shown inline rather than as a transient toast.
 */
export default function McpServerCatalog({ onClose }) {
  const [servers, setServers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)      // server name currently working
  const [errors, setErrors] = useState({})    // name -> message
  const [expanded, setExpanded] = useState({})

  async function load() {
    try {
      setServers(await api.getMcpServers())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function setError(name, message) {
    setErrors((prev) => ({ ...prev, [name]: message }))
  }

  async function run(name, fn) {
    setBusy(name)
    setError(name, null)
    try {
      await fn()
      await load()
    } catch (err) {
      // The backend sends {detail: "..."} for discovery failures and
      // {detail: {message, agents}} when unwiring is blocked. Both matter to
      // the user, so surface whichever shape arrived.
      const detail = err.data?.detail
      setError(name, typeof detail === 'object' ? detail.message : (detail || err.message))
    } finally {
      setBusy(null)
    }
  }

  const toggle = (s) =>
    run(s.name, () => (s.wired ? api.unwireMcpServer(s.name) : api.wireMcpServer(s.name)))

  const statusDot = (s) => {
    if (!s.wired) return { color: 'bg-slate-500', label: 'not wired' }
    if (s.status === 'connected') return { color: 'bg-emerald-500', label: 'connected' }
    if (s.status === 'failed') return { color: 'bg-red-500', label: 'unreachable' }
    return { color: 'bg-amber-500', label: s.status }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl bg-slate-900 border border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">MCP Servers</h2>
            <p className="text-sm text-slate-400">
              Wire a server to discover its tools. Agents then choose from the wired ones.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded px-3 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            Close
          </button>
        </div>

        <div className="p-6 space-y-3">
          {loading && <p className="text-slate-400">Loading…</p>}

          {!loading && servers.length === 0 && (
            <p className="text-slate-400">
              No MCP servers are supported yet. They are declared server-side in
              <code className="mx-1 rounded bg-slate-800 px-1">mcp_catalog.py</code>.
            </p>
          )}

          {servers.map((s) => {
            const dot = statusDot(s)
            const working = busy === s.name
            return (
              <div key={s.name} className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={s.wired}
                    disabled={working}
                    onChange={() => toggle(s)}
                    className="mt-1 h-4 w-4 cursor-pointer accent-indigo-500 disabled:opacity-40"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-100">{s.name}</span>
                      <span className={`h-2 w-2 rounded-full ${dot.color}`} />
                      <span className="text-xs text-slate-400">{dot.label}</span>
                      {s.wired && s.toolCount != null && (
                        <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                          {s.toolCount} tools
                        </span>
                      )}
                      {working && <span className="text-xs text-slate-400">working…</span>}
                    </div>

                    <p className="mt-1 text-sm text-slate-400">{s.description}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">{s.url}</p>

                    {errors[s.name] && (
                      <p className="mt-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        {errors[s.name]}
                      </p>
                    )}

                    {/* Shown even when currently unreachable: the tools are the
                        last known good list, and an agent bound to this server
                        still has them. */}
                    {s.wired && s.status === 'failed' && !errors[s.name] && s.lastError && (
                      <p className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                        {s.lastError}
                      </p>
                    )}

                    {s.wired && s.tools?.length > 0 && (
                      <div className="mt-2">
                        <button
                          onClick={() =>
                            setExpanded((p) => ({ ...p, [s.name]: !p[s.name] }))
                          }
                          className="text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          {expanded[s.name] ? 'Hide' : 'Show'} tools
                        </button>
                        {expanded[s.name] && (
                          <ul className="mt-2 space-y-1">
                            {s.tools.map((t) => (
                              <li key={t} className="font-mono text-xs text-slate-300">
                                {t}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>

                  {s.wired && (
                    <button
                      onClick={() => run(s.name, () => api.refreshMcpServer(s.name))}
                      disabled={working}
                      title="Re-run tools/list — use after redeploying the MCP server"
                      className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                    >
                      Refresh
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
