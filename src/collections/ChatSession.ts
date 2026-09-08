import type { CollectionConfig } from 'payload'

export const ChatSession: CollectionConfig = {
  slug: 'chat-sessions',
  admin: {
    useAsTitle: 'sessionId',
    defaultColumns: ['sessionId', 'createdAt'],
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
  ],
}
