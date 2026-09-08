import type { CollectionConfig } from 'payload'

import { isAdmin } from './helpers/access'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'type', 'updatedAt'],
  },
  auth: true,
  access: {
    create: isAdmin,
    read: ({ req }) => {
      const user = req.user as (typeof req.user & { collection?: string }) | null
      // Users can read themselves; admins can read everyone.
      if (user && user.collection === 'users' && user.type === 'Admin') return true
      return user ? { id: { equals: user.id } } : false
    },
    update: ({ req }) => {
      if (isAdmin({ req })) return true
      const user = req.user as { id?: number } | null
      return user ? { id: { equals: user.id } } : false
    },
    delete: isAdmin,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'User',
      options: [
        { label: 'User', value: 'User' },
        { label: 'Admin', value: 'Admin' },
        { label: 'Agent', value: 'Agent' },
      ],
      index: true,
      admin: {
        description: 'User = human; Admin = administrator; Agent = agent security principal.',
      },
    },
    {
      name: 'role',
      type: 'relationship',
      relationTo: 'roles',
      index: true,
    },
    // Email added by default
    // Add more fields as needed
  ],
}
