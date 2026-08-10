import { useState, useEffect } from 'react'
import { Server, Link as LinkIcon, User, Loader2, RefreshCw } from 'lucide-react'
import { api } from '../api'

/**
 * Agent settings.
 *
 * Capabilities come from MCP servers, not from a per-instruction tool picker.
 * You tick the servers this agent may use; its tools are whatever those servers
 * expose, discovered at runtime. There is no instruction text and no tool
 * picker: each tool carries its own description from the MCP server, and the
 * model decides which to call from the user's query.
 *
 * Only wired servers are selectable: an unwired server has no discovered tools,
 * so binding it would look like granting a capability while granting nothing.
 */
export default function AgentEditor({ agent, isCreatingNew, onSaved, refreshTick, onDirtyChange, onOpenCatalog }) {
  const [name, setName] = useState('')
  const [kbUrl, setKbUrl] = useState('')
  const [serverNames, setServerNames] = useState([])
  const [catalog, setCatalog] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const savedKbUrl = agent?.kb_url ?? ''

  useEffect(() => {
    if (isCreatingNew) {
      setName('')
      setKbUrl('')
      setServerNames([])
      setError(null)
    } else if (agent) {
      setName(agent.name)
      setKbUrl(agent.kb_url || '')
      setServerNames(agent.mcp_server_names || [])
      setError(null)
    }
    // Reload when the agent *identity* changes or the parent asks for a
    // refresh. Ignoring plain object-identity changes (e.g. from polling while
    // another agent indexes) keeps in-progress form edits from being clobbered.
  }, [agent?.id, isCreatingNew, refreshTick])

  // Reload the catalog whenever this panel is (re)opened, so a server wired in
  // the catalog dialog shows up here without a page reload.
  useEffect(() => {
    api.getMcpServers().then(setCatalog).catch(() => setCatalog([]))
  }, [refreshTick, agent?.id, isCreatingNew])

  const wiredServers = catalog.filter((s) => s.wired)

  const kbUrlChanged = !isCreatingNew && kbUrl.trim() !== savedKbUrl
  const hasKb = kbUrl.trim().length > 0
  const mustReindex = isCreatingNew || kbUrlChanged
  const isFailed = !isCreatingNew && agent?.status === 'failed'
  const isIndexing = !isCreatingNew && agent?.status === 'indexing'
  const locked = isIndexing || saving

  useEffect(() => {
    if (!onDirtyChange) return
    if (isCreatingNew || !agent) {
      onDirtyChange(false)
      return
    }
    const dirty =
      name !== agent.name ||
      kbUrl !== (agent.kb_url ?? '') ||
      JSON.stringify([...serverNames].sort()) !==
        JSON.stringify([...(agent.mcp_server_names ?? [])].sort())
    onDirtyChange(dirty)
  }, [name, kbUrl, serverNames, agent, isCreatingNew, onDirtyChange])

  function toggleServer(serverName) {
    setServerNames((prev) =>
      prev.includes(serverName)
        ? prev.filter((n) => n !== serverName)
        : [...prev, serverName]
    )
  }

  async function handleSave(reindex) {
    if (!name.trim()) return setError('Name is required')
    // The knowledge base is required; MCP servers are optional extras on top.
    if (!hasKb) return setError('Knowledge base URL is required')
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: name.trim(),
        kb_url: kbUrl.trim(),
        mcp_server_names: serverNames,
        reindex,
      }
      const saved = isCreatingNew
        ? await api.createAgent(payload)
        : await api.updateAgent(agent.id, payload)
      onSaved(saved)
    } catch (e) {
      const detail = e.data?.detail
      setError(typeof detail === 'object' ? detail.message : detail || e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!agent && !isCreatingNew) {
    return (
      <div className="flex items-center justify-center h-full text-dark-muted text-sm p-8 text-center">
        Select an agent or create a new one to get started.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 min-h-0">
        <Section icon={<User size={13} />} label="Agent Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={locked}
            placeholder="e.g. E-Invoice Onboarding"
            className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-dark-text focus:outline-none focus:border-dark-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </Section>

        {/* MCP servers — the capability picker */}
        <div className="mcp-servers-section">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-dark-muted"><Server size={13} /></span>
              <label className="text-xs text-dark-muted uppercase tracking-wide font-semibold">
                MCP Servers <span className="normal-case font-normal text-dark-muted/70">(optional)</span>
              </label>
            </div>
            {onOpenCatalog && (
              <button
                onClick={onOpenCatalog}
                className="text-[11px] text-dark-accent hover:underline"
              >
                Manage
              </button>
            )}
          </div>

          {wiredServers.length === 0 ? (
            <div className="border border-dashed border-dark-border rounded-md px-3 py-4 text-center">
              <p className="text-xs text-dark-muted">
                No MCP servers are wired. The agent will still answer from its
                knowledge base.
              </p>
              {onOpenCatalog && (
                <button
                  onClick={onOpenCatalog}
                  className="mt-1.5 text-xs text-dark-accent hover:underline"
                >
                  Open the server catalog
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {wiredServers.map((s) => {
                const checked = serverNames.includes(s.name)
                const unreachable = s.status === 'failed'
                return (
                  <label
                    key={s.name}
                    className={`flex items-start gap-2.5 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                      checked
                        ? 'border-dark-accent bg-dark-accent/10'
                        : 'border-dark-border hover:border-dark-accent/50'
                    } ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={() => toggleServer(s.name)}
                      className="mt-0.5 h-3.5 w-3.5 accent-dark-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm text-dark-text font-medium">{s.name}</span>
                        <span className="text-[11px] text-dark-muted">
                          {s.toolCount ?? 0} tools
                        </span>
                        {/* Still selectable while unreachable: the cached tools
                            remain, and a call returns a real error the agent can
                            relay — better than silently losing the capability. */}
                        {unreachable && (
                          <span className="text-[11px] text-yellow-400">· unreachable</span>
                        )}
                      </span>
                      <span className="block text-[11px] text-dark-muted mt-0.5">
                        {s.description}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          )}
          <p className="text-xs text-dark-muted mt-1.5">
            Optional. The agent gets every tool the selected servers expose, on
            top of knowledge-base search.
          </p>
        </div>

        <Section
          icon={<LinkIcon size={13} />}
          label="Knowledge Base URL"
          hint="Required — a Zendesk Help Center category URL. Must be a /categories/ link."
        >
          <input
            value={kbUrl}
            onChange={(e) => setKbUrl(e.target.value)}
            disabled={locked}
            placeholder="https://support.example.com/hc/en-us/categories/..."
            className="kb-url-input w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-dark-text focus:outline-none focus:border-dark-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {kbUrlChanged && (
            <p className="text-xs text-yellow-400 mt-2">
              ⚠ URL changed — re-indexing is required to update the knowledge base.
            </p>
          )}
        </Section>


        {error && (
          <div className="bg-red-900/20 border border-red-700/40 rounded-md px-3 py-2">
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        )}

        {agent?.status === 'failed' && agent?.error_message && (
          <div className="bg-red-900/20 border border-red-700/40 rounded-md px-3 py-2">
            <p className="text-red-400 text-xs">{agent.error_message}</p>
          </div>
        )}
      </div>

      {/* Save bar — pinned to the bottom */}
      <div className="flex-shrink-0 px-5 py-4 border-t border-dark-border bg-dark-surface">
        {isIndexing ? (
          <div className="flex items-center justify-center gap-2.5 py-2 rounded-md bg-dark-accent/10 border border-dark-accent/30">
            <Loader2 size={15} className="text-dark-accent animate-spin" />
            <span className="text-sm text-dark-accent font-medium">Indexing knowledge base…</span>
          </div>
        ) : isFailed ? (
          <button
            onClick={() => handleSave(true)}
            disabled={locked}
            className="save-reindex-btn w-full flex items-center justify-center gap-2 py-2 text-sm font-medium bg-dark-accent text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {saving ? 'Re-indexing…' : 'Re-index'}
          </button>
        ) : (
          <div className="flex gap-2">
            {!mustReindex && (
              <button
                onClick={() => handleSave(false)}
                disabled={locked}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-sm border border-dark-border rounded-md hover:bg-dark-bg text-dark-text disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
            <button
                onClick={() => handleSave(true)}
                disabled={locked}
                className="save-reindex-btn flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium bg-dark-accent text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Saving…' : 'Save & Re-index'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ icon, label, hint, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-dark-muted">{icon}</span>
        <label className="text-xs text-dark-muted uppercase tracking-wide font-semibold">{label}</label>
      </div>
      {children}
      {hint && <p className="text-xs text-dark-muted mt-1.5">{hint}</p>}
    </div>
  )
}
