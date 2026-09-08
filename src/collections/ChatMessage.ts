import type { CollectionConfig } from 'payload'

export const ChatMessage: CollectionConfig = {
  slug: 'chat-messages',
  admin: {
    useAsTitle: 'role',
    defaultColumns: ['session', 'role', 'content', 'createdAt'],
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
      name: 'session',
      type: 'relationship',
      relationTo: 'chat-sessions',
      required: true,
      index: true,
    },
    {
      name: 'role',
      type: 'select',
      options: [
        { label: 'User', value: 'user' },
        { label: 'Assistant', value: 'assistant' },
        { label: 'System', value: 'system' },
      ],
      required: true,
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
    },
  ],
}