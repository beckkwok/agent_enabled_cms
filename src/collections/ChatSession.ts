import type { CollectionConfig } from 'payload'

export const ChatSession: CollectionConfig = {
  slug: 'chat-sessions',
  admin: {
    useAsTitle: 'sessionId',
    defaultColumns: ['sessionId', 'agent', 'createdAt'],
    group: 'Chat',
  },
  access: {
    create: () => true,
    read: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'sessionId',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'agent',
      type: 'relationship',
      relationTo: 'agents',
      index: true,
      admin: {
        description: 'Agent this conversation belongs to (agent-scoped chat history).',
      },
    },
  ],
}
