/** Placeholder data until real chats/user come from the backend. */
export interface ChatSummary {
  id: string
  title: string
}

export const MOCK_CHATS: ChatSummary[] = [
  { id: '1', title: 'Build the alignment grid demo' },
  { id: '2', title: 'Project cleanup and UI improvements' },
  { id: '3', title: 'Clarifying context and alignment' },
  { id: '4', title: 'GitHub deployment and updates' },
  { id: '5', title: 'Production readiness check' },
  { id: '6', title: 'Modern icon pack design' }
]

export const MOCK_USER = { name: 'Your account', initials: 'U' }
