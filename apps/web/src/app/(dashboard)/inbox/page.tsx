'use client'

import { useState, useEffect, useRef } from 'react'
import { MessageSquare, Send, RefreshCw, Pencil } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { createBrowserClient } from '@/lib/supabase-client'
import { CustomerModal } from '@/components/customers/CustomerModal'
import toast from 'react-hot-toast'

type InboxRow = {
  customer_id: string
  first_name: string
  last_name: string
  phone: string | null
  last_body: string
  last_channel: string
  last_direction: string
  last_at: string
  unread_count: number
}

type Message = {
  id: string
  direction: 'inbound' | 'outbound'
  channel: 'sms' | 'email'
  body: string
  subject: string | null
  from_address: string | null
  to_address: string | null
  staff_user_id: string | null
  read_at: string | null
  created_at: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

export default function InboxPage() {
  const utils = trpc.useUtils()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [customerModalId, setCustomerModalId] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  const { data: inbox = [], isLoading: inboxLoading } = trpc.messages.inbox.useQuery()
  const { data: thread = [] } = trpc.messages.listForCustomer.useQuery(
    { customer_id: selectedId! },
    { enabled: !!selectedId }
  )

  const markRead = trpc.messages.markRead.useMutation({
    onSuccess: () => {
      utils.messages.unreadCount.invalidate()
      utils.messages.inbox.invalidate()
    },
  })

  const sendSms = trpc.messages.sendSms.useMutation({
    onSuccess: () => {
      setDraft('')
      utils.messages.listForCustomer.invalidate({ customer_id: selectedId! })
      utils.messages.inbox.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  // Realtime subscription — refresh when a new message arrives
  useEffect(() => {
    const supabase = createBrowserClient()
    const channel = supabase
      .channel('inbox-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        utils.messages.inbox.invalidate()
        if (selectedId) utils.messages.listForCustomer.invalidate({ customer_id: selectedId })
        utils.messages.unreadCount.invalidate()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedId, utils])

  // Mark as read when opening a conversation
  useEffect(() => {
    if (selectedId) {
      markRead.mutate({ customer_id: selectedId })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // Scroll thread to bottom when messages load / new message arrives
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [thread])

  const selected = (inbox as InboxRow[]).find((r) => r.customer_id === selectedId)

  const { data: modalCustomer } = trpc.customers.getById.useQuery(
    { id: customerModalId! },
    { enabled: !!customerModalId }
  )

  const handleSend = () => {
    if (!selectedId || !draft.trim()) return
    sendSms.mutate({ customer_id: selectedId, body: draft.trim() })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Group messages by date for display
  const groupedThread: { date: string; messages: Message[] }[] = []
  ;(thread as Message[]).forEach((msg) => {
    const label = fmtDate(msg.created_at)
    const last = groupedThread[groupedThread.length - 1]
    if (last && last.date === label) {
      last.messages.push(msg)
    } else {
      groupedThread.push({ date: label, messages: [msg] })
    }
  })

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel — conversation list */}
      <aside className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h1 className="text-sm font-semibold text-gray-900">Inbox</h1>
          <button onClick={() => utils.messages.inbox.invalidate()}
            className="text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {inboxLoading && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">Loading…</div>
          )}
          {!inboxLoading && (inbox as InboxRow[]).length === 0 && (
            <div className="px-4 py-8 text-center">
              <MessageSquare className="mx-auto h-8 w-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No messages yet</p>
            </div>
          )}
          {(inbox as InboxRow[]).map((row) => {
            const isSelected = selectedId === row.customer_id
            const hasUnread = row.unread_count > 0
            return (
              <button
                key={row.customer_id}
                onClick={() => setSelectedId(row.customer_id)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {hasUnread && !isSelected && (
                      <span className="h-2 w-2 rounded-full bg-brand-500 shrink-0 mt-1" />
                    )}
                    <span className={`text-sm truncate ${hasUnread && !isSelected ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                      {row.first_name} {row.last_name}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{timeAgo(row.last_at)}</span>
                </div>
                <p className={`text-xs mt-0.5 truncate ${hasUnread && !isSelected ? 'text-gray-700' : 'text-gray-400'}`}>
                  {row.last_direction === 'outbound' ? 'You: ' : ''}{row.last_body}
                </p>
                {hasUnread && !isSelected && (
                  <span className="mt-1 inline-flex items-center rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {row.unread_count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </aside>

      {/* Right panel — thread */}
      <div className="flex flex-1 flex-col min-w-0 bg-gray-50">
        {!selectedId ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-500">Select a conversation</p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="border-b border-gray-200 bg-white px-5 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {selected?.first_name} {selected?.last_name}
                </p>
                <p className="text-xs text-gray-400">{selected?.phone ?? ''}</p>
              </div>
              <button
                onClick={() => setCustomerModalId(selectedId)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Open customer profile"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div ref={threadRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {groupedThread.map(({ date, messages }) => (
                <div key={date}>
                  <div className="flex items-center gap-3 my-3">
                    <div className="flex-1 border-t border-gray-200" />
                    <span className="text-xs text-gray-400 shrink-0">{date}</span>
                    <div className="flex-1 border-t border-gray-200" />
                  </div>
                  <div className="space-y-2">
                    {messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs lg:max-w-sm rounded-2xl px-4 py-2.5 ${
                          msg.direction === 'outbound'
                            ? 'bg-brand-600 text-white rounded-br-sm'
                            : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
                        }`}>
                          {msg.subject && (
                            <p className="text-xs font-medium mb-1 opacity-75">{msg.subject}</p>
                          )}
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                          <p className={`text-[10px] mt-1 ${msg.direction === 'outbound' ? 'text-brand-200' : 'text-gray-400'}`}>
                            {fmtTime(msg.created_at)}
                            {msg.channel === 'email' ? ' · email' : ''}
                            {msg.direction === 'outbound' && !msg.staff_user_id ? ' · automated' : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Compose */}
            <div className="border-t border-gray-200 bg-white p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder="Type a message… (Enter to send)"
                  className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 leading-relaxed"
                />
                <button
                  onClick={handleSend}
                  disabled={!draft.trim() || sendSms.isPending}
                  className="flex items-center justify-center h-9 w-9 rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5 ml-1">SMS · Press Enter to send, Shift+Enter for new line</p>
            </div>
          </>
        )}
      </div>

      {customerModalId && modalCustomer && (
        <CustomerModal
          customer={modalCustomer}
          onClose={() => setCustomerModalId(null)}
          onSaved={() => { setCustomerModalId(null); utils.messages.inbox.invalidate() }}
        />
      )}
    </div>
  )
}
